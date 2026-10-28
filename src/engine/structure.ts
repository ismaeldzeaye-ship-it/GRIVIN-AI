import { Candle, MarketStructureEvent, SwingPoint, Timeframe } from '../types';
import { detectSwings } from './swings';

/**
 * Evaluates market structure to identify confirmed Break of Structure (BOS)
 * and Change of Character (CHoCH).
 */
export function analyzeMarketStructure(
  candles: Candle[],
  timeframe: Timeframe = 'M15',
  window = 3
): {
  events: MarketStructureEvent[];
  trend: 'BULLISH' | 'BEARISH' | 'RANGING';
  lastBOS: MarketStructureEvent | null;
  lastCHOCH: MarketStructureEvent | null;
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
} {
  const { swingHighs, swingLows } = detectSwings(candles, window);
  const events: MarketStructureEvent[] = [];

  if (swingHighs.length === 0 && swingLows.length === 0) {
    return {
      events: [],
      trend: 'RANGING',
      lastBOS: null,
      lastCHOCH: null,
      swingHighs,
      swingLows
    };
  }

  // Interleave and sort swings chronologically
  const allSwings = [...swingHighs, ...swingLows].sort((a, b) => a.index - b.index);

  let currentTrend: 'BULLISH' | 'BEARISH' | 'RANGING' = 'RANGING';
  const brokenHighIndices = new Set<number>();
  const brokenLowIndices = new Set<number>();

  // Scan through candles to detect real-time break of structural swings
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];

    // Check relevant swings before candle i
    const priorHighs = swingHighs.filter(s => s.index < i);
    const priorLows = swingLows.filter(s => s.index < i);

    if (priorHighs.length > 0) {
      const targetHigh = priorHighs[priorHighs.length - 1];
      // Bullish break: Candle closes above target high
      if (c.close > targetHigh.price && !brokenHighIndices.has(targetHigh.index)) {
        const isTrendContinuation = currentTrend === 'BULLISH';
        const type = isTrendContinuation ? 'BOS' : 'CHOCH';
        currentTrend = 'BULLISH';
        brokenHighIndices.add(targetHigh.index);

        events.push({
          id: `${type}-BULL-${i}-${Math.round(c.close)}`,
          type,
          direction: 'BULLISH',
          price: c.close,
          brokenLevel: targetHigh.price,
          time: c.time,
          candleIndex: i,
          timeframe,
          significance: type === 'CHOCH' ? 'MAJOR' : 'MINOR'
        });
      }
    }

    if (priorLows.length > 0) {
      const targetLow = priorLows[priorLows.length - 1];
      // Bearish break: Candle closes below target low
      if (c.close < targetLow.price && !brokenLowIndices.has(targetLow.index)) {
        const isTrendContinuation = currentTrend === 'BEARISH';
        const type = isTrendContinuation ? 'BOS' : 'CHOCH';
        currentTrend = 'BEARISH';
        brokenLowIndices.add(targetLow.index);

        events.push({
          id: `${type}-BEAR-${i}-${Math.round(c.close)}`,
          type,
          direction: 'BEARISH',
          price: c.close,
          brokenLevel: targetLow.price,
          time: c.time,
          candleIndex: i,
          timeframe,
          significance: type === 'CHOCH' ? 'MAJOR' : 'MINOR'
        });
      }
    }
  }

  const lastBOS = events.filter(e => e.type === 'BOS').slice(-1)[0] || null;
  const lastCHOCH = events.filter(e => e.type === 'CHOCH').slice(-1)[0] || null;

  return {
    events,
    trend: currentTrend,
    lastBOS,
    lastCHOCH,
    swingHighs,
    swingLows
  };
}
