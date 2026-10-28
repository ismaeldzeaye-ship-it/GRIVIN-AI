import { Candle, SMCZone, Timeframe } from '../types';

/**
 * Detects Fair Value Gaps (FVG):
 * - Bullish FVG: Candle 1 High < Candle 3 Low (Gap in upward displacement)
 * - Bearish FVG: Candle 1 Low > Candle 3 High (Gap in downward displacement)
 */
export function detectFairValueGaps(candles: Candle[], timeframe: Timeframe = 'M15'): SMCZone[] {
  const fvgs: SMCZone[] = [];
  if (candles.length < 3) return fvgs;

  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c2 = candles[i - 1]; // Displacement bar
    const c3 = candles[i];

    // Bullish FVG
    if (c3.low > c1.high && c2.close > c2.open) {
      const top = c3.low;
      const bottom = c1.high;
      
      // Determine mitigation status by checking subsequent candles
      let mitigationStatus: SMCZone['mitigationStatus'] = 'FRESH';
      for (let k = i + 1; k < candles.length; k++) {
        const future = candles[k];
        if (future.low <= bottom) {
          mitigationStatus = 'MITIGATED';
          break;
        } else if (future.low <= top) {
          mitigationStatus = 'TESTED';
        }
      }

      fvgs.push({
        id: `FVG-BULL-${i}`,
        type: 'FVG',
        direction: 'BULLISH',
        top,
        bottom,
        timeframe,
        candleIndex: i - 1,
        time: c2.time,
        mitigationStatus
      });
    }

    // Bearish FVG
    if (c3.high < c1.low && c2.close < c2.open) {
      const top = c1.low;
      const bottom = c3.high;

      let mitigationStatus: SMCZone['mitigationStatus'] = 'FRESH';
      for (let k = i + 1; k < candles.length; k++) {
        const future = candles[k];
        if (future.high >= top) {
          mitigationStatus = 'MITIGATED';
          break;
        } else if (future.high >= bottom) {
          mitigationStatus = 'TESTED';
        }
      }

      fvgs.push({
        id: `FVG-BEAR-${i}`,
        type: 'FVG',
        direction: 'BEARISH',
        top,
        bottom,
        timeframe,
        candleIndex: i - 1,
        time: c2.time,
        mitigationStatus
      });
    }
  }

  return fvgs;
}

/**
 * Detects Order Blocks (OB):
 * - Bullish OB: Last down-close candle before an energetic bullish displacement.
 * - Bearish OB: Last up-close candle before an energetic bearish displacement.
 */
export function detectOrderBlocks(candles: Candle[], timeframe: Timeframe = 'M15'): SMCZone[] {
  const obs: SMCZone[] = [];
  if (candles.length < 5) return obs;

  for (let i = 1; i < candles.length - 2; i++) {
    const obCandidate = candles[i];
    const next1 = candles[i + 1];
    const next2 = candles[i + 2];

    const bodySize = Math.abs(obCandidate.close - obCandidate.open);
    const avgBody = (Math.abs(next1.close - next1.open) + Math.abs(next2.close - next2.open)) / 2;

    // Bullish OB: candidate is bearish, followed by strong upward impulse
    if (obCandidate.close < obCandidate.open && next1.close > next1.open && avgBody > bodySize * 1.4) {
      let mitigationStatus: SMCZone['mitigationStatus'] = 'FRESH';
      for (let k = i + 3; k < candles.length; k++) {
        if (candles[k].low < obCandidate.low) {
          mitigationStatus = 'MITIGATED';
          break;
        } else if (candles[k].low <= obCandidate.high) {
          mitigationStatus = 'TESTED';
        }
      }

      obs.push({
        id: `OB-BULL-${i}`,
        type: 'ORDER_BLOCK',
        direction: 'BULLISH',
        top: obCandidate.high,
        bottom: obCandidate.low,
        timeframe,
        candleIndex: i,
        time: obCandidate.time,
        mitigationStatus
      });
    }

    // Bearish OB: candidate is bullish, followed by strong downward impulse
    if (obCandidate.close > obCandidate.open && next1.close < next1.open && avgBody > bodySize * 1.4) {
      let mitigationStatus: SMCZone['mitigationStatus'] = 'FRESH';
      for (let k = i + 3; k < candles.length; k++) {
        if (candles[k].high > obCandidate.high) {
          mitigationStatus = 'MITIGATED';
          break;
        } else if (candles[k].high >= obCandidate.low) {
          mitigationStatus = 'TESTED';
        }
      }

      obs.push({
        id: `OB-BEAR-${i}`,
        type: 'ORDER_BLOCK',
        direction: 'BEARISH',
        top: obCandidate.high,
        bottom: obCandidate.low,
        timeframe,
        candleIndex: i,
        time: obCandidate.time,
        mitigationStatus
      });
    }
  }

  return obs;
}

/**
 * Detects liquidity sweeps of key price levels (e.g. Session Highs / Lows).
 */
export function detectLiquiditySweep(
  candles: Candle[],
  level: number,
  type: 'HIGH_SWEEP' | 'LOW_SWEEP',
  lookback = 10
): { swept: boolean; candleIndex: number; sweepPrice: number } {
  const recent = candles.slice(-lookback);
  for (let i = 0; i < recent.length; i++) {
    const c = recent[i];
    if (type === 'HIGH_SWEEP') {
      // Wick exceeded level, but body closed back below level
      if (c.high > level && c.close < level) {
        return { swept: true, candleIndex: candles.length - lookback + i, sweepPrice: c.high };
      }
    } else {
      // Wick went below level, but body closed back above level
      if (c.low < level && c.close > level) {
        return { swept: true, candleIndex: candles.length - lookback + i, sweepPrice: c.low };
      }
    }
  }
  return { swept: false, candleIndex: -1, sweepPrice: 0 };
}
