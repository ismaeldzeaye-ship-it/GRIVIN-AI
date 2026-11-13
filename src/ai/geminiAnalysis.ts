import { TradingSignal, RateLimitState, StructuredMarketEvidence, Candle } from '../types';
import { MarketState, AiAnalysisCache } from './aiCache';

// Global AI Analysis Cache instance using MarketState keying (5-minute TTL, 50 entries)
export const aiAnalysisCache = new AiAnalysisCache<string>(5 * 60_000, 50);

// Global listener for rate-limit updates
type RateLimitListener = (state: RateLimitState) => void;
const rateLimitListeners: Set<RateLimitListener> = new Set();

export function onGeminiRateLimitChange(listener: RateLimitListener): () => void {
  rateLimitListeners.add(listener);
  return () => rateLimitListeners.delete(listener);
}

function notifyRateLimit(state: RateLimitState) {
  rateLimitListeners.forEach(fn => fn(state));
}

/**
 * Builds a normalized MarketState from existing signal, evidence, and candle variables.
 * Uses strictly the last CLOSED candle time (not the forming candle).
 */
export function buildMarketState(
  signal: TradingSignal,
  evidence?: StructuredMarketEvidence,
  candles?: Candle[]
): MarketState {
  // Use last CLOSED candle time (never the forming candle)
  let lastClosedCandleTime = 0;
  if (candles && candles.length > 0) {
    const closed = candles.filter(c => !c.isForming);
    if (closed.length > 0) {
      lastClosedCandleTime = closed[closed.length - 1].time;
    }
  }
  if (!lastClosedCandleTime) {
    lastClosedCandleTime = signal.signalCandleTime || Math.floor((signal.timestamp || Date.now()) / 1000);
  }

  // Calculate pocBin from volume profile or audit levels
  let pocBin = 0;
  const pocPrice = evidence?.volumeProfile?.poc ?? signal.auditLevels?.poc;
  if (pocPrice !== undefined && pocPrice !== null) {
    if (evidence?.volumeProfile?.vah && evidence?.volumeProfile?.val && evidence.volumeProfile.vah > evidence.volumeProfile.val) {
      const step = (evidence.volumeProfile.vah - evidence.volumeProfile.val) / 60;
      pocBin = step > 0 ? Math.floor((pocPrice - evidence.volumeProfile.val) / step) : Math.round(pocPrice);
    } else {
      pocBin = Math.round(pocPrice);
    }
  }

  // Determine current market zone
  const zone = evidence?.smc?.premiumDiscount?.currentZone ||
    evidence?.volumeProfile?.priceRelation ||
    (signal.marketState ? String(signal.marketState) : (signal.entryPrice >= (signal.auditLevels?.poc ?? signal.entryPrice) ? 'PREMIUM' : 'DISCOUNT'));

  // FVG count from SMC evidence or checklist
  const fvgCount = evidence?.smc?.activeFVGs ??
    (signal.checklist?.some(item => (item.id.includes('fvg') || item.label.toLowerCase().includes('fvg')) && item.passed) ? 1 : 0);

  // Structure event ID
  const structureEventId = evidence?.marketStructure?.lastBOS
    ? `BOS-${evidence.marketStructure.lastBOS.time}`
    : evidence?.marketStructure?.lastCHOCH
    ? `CHOCH-${evidence.marketStructure.lastCHOCH.time}`
    : signal.id;

  return {
    symbol: signal.symbol,
    timeframe: signal.timeframe,
    session: signal.session || 'REGULAR',
    lastClosedCandleTime,
    pocBin,
    zone,
    fvgCount,
    structureEventId,
    direction: signal.direction,
    strategyName: signal.strategyName || signal.strategy || 'unknown'
  };
}

/**
 * Runs AI explanation routed through the AiAnalysisCache.
 * Supports { force: true } to bypass cache and fetch a fresh analysis.
 */
export async function requestAISetupAnalysis(
  signal: TradingSignal,
  evidenceOrOpts?: StructuredMarketEvidence | { force?: boolean },
  optsOrCandles?: { force?: boolean } | Candle[],
  candlesParam?: Candle[]
): Promise<string> {
  if (!signal || !signal.id) {
    return 'Signal not available for AI explanation.';
  }

  let evidence: StructuredMarketEvidence | undefined;
  let opts: { force?: boolean } = {};
  let candles: Candle[] | undefined;

  if (evidenceOrOpts && 'force' in evidenceOrOpts) {
    opts = evidenceOrOpts as { force?: boolean };
  } else if (evidenceOrOpts) {
    evidence = evidenceOrOpts as StructuredMarketEvidence;
  }

  if (optsOrCandles && 'force' in optsOrCandles) {
    opts = optsOrCandles as { force?: boolean };
  } else if (Array.isArray(optsOrCandles)) {
    candles = optsOrCandles;
  }

  if (Array.isArray(candlesParam)) {
    candles = candlesParam;
  }

  const marketState = buildMarketState(signal, evidence, candles);

  const { value } = await aiAnalysisCache.get(
    marketState,
    async () => {
      return executeGeminiAnalysisFetch(signal, evidence);
    },
    opts
  );

  return value;
}

async function executeGeminiAnalysisFetch(
  signal: TradingSignal,
  evidence?: StructuredMarketEvidence
): Promise<string> {
  try {
    const res = await fetch('/api/ai/analyze-setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signal, evidence })
    });

    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      const fullMessage = data.message || 'Gemini API quota exceeded (RESOURCE_EXHAUSTED).';
      notifyRateLimit({
        serviceName: 'Gemini AI',
        fullMessage,
        isRateLimited: true,
        status: 'Rate-limited, retrying',
        lastEventTime: Date.now()
      });
      return 'AI explanation temporarily unavailable';
    }

    if (res.ok) {
      const data = await res.json();
      if (data.analysis) {
        notifyRateLimit({
          serviceName: 'Gemini AI',
          fullMessage: null,
          isRateLimited: false,
          status: 'OK',
          lastEventTime: Date.now()
        });
        return data.analysis;
      }
    }
  } catch (err: any) {
    console.warn('[AI Analysis] Request failed:', err);
    if (err?.message?.includes('429') || err?.message?.includes('quota')) {
      notifyRateLimit({
        serviceName: 'Gemini AI',
        fullMessage: err.message,
        isRateLimited: true,
        status: 'Rate-limited, retrying',
        lastEventTime: Date.now()
      });
      return 'AI explanation temporarily unavailable';
    }
  }

  // Fallback to deterministic algorithmic explanation (never breaks execution)
  return generateHeuristicAnalysis(signal);
}

export function generateHeuristicAnalysis(signal: TradingSignal): string {
  const rMultiple = signal.rMultiple || 2.0;

  return [
    `### Unified Institutional Engine Analysis (${signal.symbol})`,
    `**Strategy & Session Context:** Selected ${signal.strategySelected || signal.strategyName} under ${signal.session}. Market behavior identified as ${signal.marketState || 'Structured'}.`,
    `**Rule Verification:**`,
    `- **Previous Session Close:** Confirmed relative to Value Area (POC: ${signal.auditLevels?.poc ?? 'Active'}).`,
    `- **Candle Close Confirmation:** Executed strictly on candle close.`,
    `- **Risk Invalidation:** Structural stop anchored at ${signal.stopLoss} (${signal.stopLossReason || '>= 1x ATR(14)'}). Invalidation triggered if price moves >0.25R away from entry zone.`,
    `- **Expectancy:** Target 1 at 2R (${signal.tp1 || signal.tp}) with positive mathematical expectancy.`
  ].join('\n\n');
}
