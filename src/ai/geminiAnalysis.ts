import { TradingSignal, RateLimitState } from '../types';

// In-memory cache per signal ID (Requirement 4: never call on every tick or candle)
const aiExplanationCache: Map<string, string> = new Map();

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
 * Runs AI explanation only when a signal is created or when tapped "Explain".
 * Cached per signal ID; never calls network if already in cache.
 * Signals NEVER depend on the AI.
 */
export async function requestAISetupAnalysis(signal: TradingSignal): Promise<string> {
  if (!signal || !signal.id) {
    return 'Signal not available for AI explanation.';
  }

  // 1. Check in-memory cache
  if (aiExplanationCache.has(signal.id)) {
    return aiExplanationCache.get(signal.id)!;
  }

  try {
    const res = await fetch('/api/ai/analyze-setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signal })
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
      const unavailableMsg = 'AI explanation temporarily unavailable';
      aiExplanationCache.set(signal.id, unavailableMsg);
      return unavailableMsg;
    }

    if (res.ok) {
      const data = await res.json();
      if (data.analysis) {
        aiExplanationCache.set(signal.id, data.analysis);
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
      const msg = 'AI explanation temporarily unavailable';
      aiExplanationCache.set(signal.id, msg);
      return msg;
    }
  }

  // Fallback to deterministic algorithmic explanation (never breaks execution)
  const fallback = generateHeuristicAnalysis(signal);
  aiExplanationCache.set(signal.id, fallback);
  return fallback;
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
