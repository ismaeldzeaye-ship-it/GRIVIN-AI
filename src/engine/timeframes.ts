import { Candle, DataSourceOrigin } from '../types';

/**
 * Builds UTC-aligned M10 candles from 2 closed M5 candles.
 * Requirements:
 * - Must not mix providers or symbols.
 * - Closed candles only.
 * - UTC-aligned: bucket start is Math.floor(time / 600) * 600.
 * - Each M10 candle requires exactly 2 contiguous M5 candles: bucketStart (:00, :10, :20, etc.) and bucketStart + 300 (:05, :15, :25, etc.).
 * - If incomplete or has gaps, do NOT emit the M10 candle.
 * - Records source candle times and description.
 */
export function synthesizeM10FromM5(
  m5Candles: Candle[],
  symbol?: string,
  provider?: DataSourceOrigin
): Candle[] {
  if (!m5Candles || m5Candles.length < 2) return [];

  // Filter only closed candles and sort chronologically
  const closedOnly = m5Candles
    .filter(c => !c.isForming)
    .sort((a, b) => a.time - b.time);

  // Group into M10 buckets
  const buckets = new Map<number, Candle[]>();
  for (const c of closedOnly) {
    const bucketStart = Math.floor(c.time / 600) * 600;
    const existing = buckets.get(bucketStart) || [];
    existing.push(c);
    buckets.set(bucketStart, existing);
  }

  const result: Candle[] = [];
  const sortedBucketStarts = Array.from(buckets.keys()).sort((a, b) => a - b);

  for (const bucketStart of sortedBucketStarts) {
    const list = buckets.get(bucketStart)!;
    // We require exactly 2 candles: first at bucketStart, second at bucketStart + 300
    const first = list.find(c => c.time === bucketStart);
    const second = list.find(c => c.time === bucketStart + 300);

    // Incomplete or gap -> skip
    if (!first || !second) {
      continue;
    }

    const totalVolume = (first.volume || 0) + (second.volume || 0);
    const totalBuyVol = (first.buyVolume || 0) + (second.buyVolume || 0);
    const totalSellVol = (first.sellVolume || 0) + (second.sellVolume || 0);
    const isOffHours = Boolean(first.isOffHours && second.isOffHours);

    result.push({
      time: bucketStart,
      open: first.open,
      high: Math.max(first.high, second.high),
      low: Math.min(first.low, second.low),
      close: second.close,
      volume: totalVolume,
      buyVolume: totalBuyVol,
      sellVolume: totalSellVol,
      isForming: false,
      isOffHours,
      sourceCandleTimes: [first.time, second.time],
      sourceDescription: `M10 synthesized from 2 M5 candles (${first.time}, ${second.time}) [${symbol || 'Unknown'} / ${provider || 'Single Source'}]`
    });
  }

  return result;
}

/**
 * Builds UTC-aligned M45 candles from 3 closed M15 candles.
 * Requirements:
 * - Must not mix providers or symbols.
 * - Closed candles only.
 * - UTC-aligned: bucket start is Math.floor(time / 2700) * 2700 (32 buckets per UTC day).
 * - Each M45 candle requires exactly 3 contiguous M15 candles:
 *   bucketStart, bucketStart + 900, bucketStart + 1800.
 * - If incomplete or has gaps, do NOT emit the M45 candle.
 * - Records source candle times and description.
 */
export function synthesizeM45FromM15(
  m15Candles: Candle[],
  symbol?: string,
  provider?: DataSourceOrigin
): Candle[] {
  if (!m15Candles || m15Candles.length < 3) return [];

  const closedOnly = m15Candles
    .filter(c => !c.isForming)
    .sort((a, b) => a.time - b.time);

  const buckets = new Map<number, Candle[]>();
  for (const c of closedOnly) {
    const bucketStart = Math.floor(c.time / 2700) * 2700;
    const existing = buckets.get(bucketStart) || [];
    existing.push(c);
    buckets.set(bucketStart, existing);
  }

  const result: Candle[] = [];
  const sortedBucketStarts = Array.from(buckets.keys()).sort((a, b) => a - b);

  for (const bucketStart of sortedBucketStarts) {
    const list = buckets.get(bucketStart)!;
    const c1 = list.find(c => c.time === bucketStart);
    const c2 = list.find(c => c.time === bucketStart + 900);
    const c3 = list.find(c => c.time === bucketStart + 1800);

    // Incomplete or gap -> skip
    if (!c1 || !c2 || !c3) {
      continue;
    }

    const totalVolume = (c1.volume || 0) + (c2.volume || 0) + (c3.volume || 0);
    const totalBuyVol = (c1.buyVolume || 0) + (c2.buyVolume || 0) + (c3.buyVolume || 0);
    const totalSellVol = (c1.sellVolume || 0) + (c2.sellVolume || 0) + (c3.sellVolume || 0);
    const isOffHours = Boolean(c1.isOffHours && c2.isOffHours && c3.isOffHours);

    result.push({
      time: bucketStart,
      open: c1.open,
      high: Math.max(c1.high, c2.high, c3.high),
      low: Math.min(c1.low, c2.low, c3.low),
      close: c3.close,
      volume: totalVolume,
      buyVolume: totalBuyVol,
      sellVolume: totalSellVol,
      isForming: false,
      isOffHours,
      sourceCandleTimes: [c1.time, c2.time, c3.time],
      sourceDescription: `M45 synthesized from 3 M15 candles (${c1.time}, ${c2.time}, ${c3.time}) [${symbol || 'Unknown'} / ${provider || 'Single Source'}]`
    });
  }

  return result;
}
