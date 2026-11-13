import { Candle, SMCZone, Timeframe, EqualHighLowPool, DisplacementBar, PremiumDiscountZone } from '../types';

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

/**
 * Detects Equal Highs (EQH) or Equal Lows (EQL) liquidity pools.
 * Two or more swing points within a tight tolerance (default: 0.15% or pip tolerance)
 * represent unmitigated buy-side or sell-side liquidity resting above/below.
 */
export function detectEqualHighsLows(
  candles: Candle[],
  tolerancePercent = 0.08,
  lookback = 40,
  window?: number
): { eqhPools: EqualHighLowPool[]; eqlPools: EqualHighLowPool[] } {
  const eqhPools: EqualHighLowPool[] = [];
  const eqlPools: EqualHighLowPool[] = [];
  if (candles.length < 5) return { eqhPools, eqlPools };

  const w = window !== undefined ? window : (candles.length < 20 ? 1 : 2);
  const startIdx = Math.max(0, candles.length - lookback);
  const subset = candles.slice(startIdx);

  // Identify local pivot highs and lows
  const swingHighs: { price: number; index: number; time: number }[] = [];
  const swingLows: { price: number; index: number; time: number }[] = [];

  for (let i = w; i < subset.length - w; i++) {
    const c = subset[i];
    let isHigh = true;
    let isLow = true;
    for (let k = 1; k <= w; k++) {
      if (c.high < subset[i - k].high || c.high < subset[i + k].high) isHigh = false;
      if (c.low > subset[i - k].low || c.low > subset[i + k].low) isLow = false;
    }

    if (isHigh) swingHighs.push({ price: c.high, index: startIdx + i, time: c.time });
    if (isLow) swingLows.push({ price: c.low, index: startIdx + i, time: c.time });
  }

  // Group equal highs
  for (let i = 0; i < swingHighs.length; i++) {
    const matched = [swingHighs[i]];
    for (let j = i + 1; j < swingHighs.length; j++) {
      const diffPercent = Math.abs(swingHighs[i].price - swingHighs[j].price) / swingHighs[i].price * 100;
      if (diffPercent <= tolerancePercent) {
        matched.push(swingHighs[j]);
      }
    }
    if (matched.length >= 2) {
      const avgPrice = matched.reduce((sum, h) => sum + h.price, 0) / matched.length;
      const lastCandle = candles[candles.length - 1];
      const swept = lastCandle.high > avgPrice;
      eqhPools.push({
        id: `EQH-${matched[0].index}`,
        type: 'EQH',
        price: Number(avgPrice.toFixed(4)),
        count: matched.length,
        indices: matched.map(m => m.index),
        time: matched[matched.length - 1].time,
        swept
      });
    }
  }

  // Group equal lows
  for (let i = 0; i < swingLows.length; i++) {
    const matched = [swingLows[i]];
    for (let j = i + 1; j < swingLows.length; j++) {
      const diffPercent = Math.abs(swingLows[i].price - swingLows[j].price) / swingLows[i].price * 100;
      if (diffPercent <= tolerancePercent) {
        matched.push(swingLows[j]);
      }
    }
    if (matched.length >= 2) {
      const avgPrice = matched.reduce((sum, l) => sum + l.price, 0) / matched.length;
      const lastCandle = candles[candles.length - 1];
      const swept = lastCandle.low < avgPrice;
      eqlPools.push({
        id: `EQL-${matched[0].index}`,
        type: 'EQL',
        price: Number(avgPrice.toFixed(4)),
        count: matched.length,
        indices: matched.map(m => m.index),
        time: matched[matched.length - 1].time,
        swept
      });
    }
  }

  return { eqhPools, eqlPools };
}

/**
 * Detects institutional displacement bars (strong expansion with body > 1.8x recent average range).
 */
export function detectDisplacement(
  candles: Candle[],
  lookback = 14,
  expansionFactor = 1.8
): DisplacementBar[] {
  const displacements: DisplacementBar[] = [];
  if (candles.length < lookback + 1) return displacements;

  for (let i = lookback; i < candles.length; i++) {
    const target = candles[i];
    const prevRange = candles.slice(i - lookback, i);
    const avgBody = prevRange.reduce((acc, c) => acc + Math.abs(c.close - c.open), 0) / lookback;

    const currentBody = Math.abs(target.close - target.open);
    const totalRange = target.high - target.low;
    const bodyToRangeRatio = totalRange > 0 ? currentBody / totalRange : 0;

    // Displacement requires both expansion over average body AND solid body (>65% of total candle range)
    if (currentBody >= avgBody * expansionFactor && bodyToRangeRatio >= 0.65) {
      displacements.push({
        index: i,
        time: target.time,
        direction: target.close > target.open ? 'BULLISH' : 'BEARISH',
        bodyRatio: Number((currentBody / Math.max(0.0001, avgBody)).toFixed(2)),
        candle: target
      });
    }
  }

  return displacements;
}

/**
 * Calculates dealing range Premium vs Discount zones (0–50% Discount, 50% Equilibrium, 50–100% Premium).
 */
export function calculatePremiumDiscount(
  candles: Candle[],
  currentPrice?: number,
  lookback = 40
): PremiumDiscountZone | null {
  if (candles.length < 5) return null;

  const subset = candles.slice(-lookback);
  let rangeHigh = -Infinity;
  let rangeLow = Infinity;

  for (const c of subset) {
    if (c.high > rangeHigh) rangeHigh = c.high;
    if (c.low < rangeLow) rangeLow = c.low;
  }

  if (rangeHigh <= rangeLow || !isFinite(rangeHigh) || !isFinite(rangeLow)) {
    return null;
  }

  const equilibrium = (rangeHigh + rangeLow) / 2;
  const price = currentPrice !== undefined ? currentPrice : subset[subset.length - 1].close;
  const percentile = Math.min(100, Math.max(0, ((price - rangeLow) / (rangeHigh - rangeLow)) * 100));

  let currentZone: PremiumDiscountZone['currentZone'] = 'EQUILIBRIUM';
  if (percentile >= 52) {
    currentZone = 'PREMIUM';
  } else if (percentile <= 48) {
    currentZone = 'DISCOUNT';
  }

  return {
    rangeHigh: Number(rangeHigh.toFixed(4)),
    rangeLow: Number(rangeLow.toFixed(4)),
    equilibrium: Number(equilibrium.toFixed(4)),
    currentZone,
    percentile: Number(percentile.toFixed(1))
  };
}
