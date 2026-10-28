import { Candle, SwingPoint } from '../types';

/**
 * Detects swing highs and swing lows using a fractal window (lookback/lookforward).
 */
export function detectSwings(candles: Candle[], window = 3): { swingHighs: SwingPoint[]; swingLows: SwingPoint[] } {
  const swingHighs: SwingPoint[] = [];
  const swingLows: SwingPoint[] = [];

  if (candles.length < window * 2 + 1) {
    return { swingHighs, swingLows };
  }

  for (let i = window; i < candles.length - window; i++) {
    const current = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= window; j++) {
      if (candles[i - j].high >= current.high || candles[i + j].high > current.high) {
        isHigh = false;
      }
      if (candles[i - j].low <= current.low || candles[i + j].low < current.low) {
        isLow = false;
      }
    }

    if (isHigh) {
      swingHighs.push({
        index: i,
        time: current.time,
        price: current.high,
        type: 'HIGH',
        confirmed: true
      });
    }

    if (isLow) {
      swingLows.push({
        index: i,
        time: current.time,
        price: current.low,
        type: 'LOW',
        confirmed: true
      });
    }
  }

  return { swingHighs, swingLows };
}
