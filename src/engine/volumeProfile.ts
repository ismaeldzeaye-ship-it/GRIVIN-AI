import { Candle, VolumeProfile, VolumeProfileLevel, MarketSessionType } from '../types';

/**
 * Calculates an institutional Volume Profile across a set of candles.
 * Computes:
 * - POC (Point of Control): price level with highest traded volume
 * - VAH (Value Area High) & VAL (Value Area Low): 70% value area calculated outward from POC
 */
export function calculateVolumeProfile(
  candles: Candle[],
  digits = 2,
  pipSize = 0.1,
  targetSession: MarketSessionType = 'LONDON_NY_OVERLAP',
  binCount = 36
): VolumeProfile {
  if (!candles || candles.length === 0) {
    return {
      poc: 0,
      vah: 0,
      val: 0,
      totalVolume: 0,
      valueAreaVolume: 0,
      levels: [],
      session: targetSession,
      stepSize: pipSize,
      isApproximateTickVolume: true
    };
  }

  // Find lowest low and highest high
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let totalVolume = 0;

  for (const c of candles) {
    if (c.low < minPrice) minPrice = c.low;
    if (c.high > maxPrice) maxPrice = c.high;
    totalVolume += c.volume;
  }

  const range = maxPrice - minPrice;
  if (range <= 0 || totalVolume <= 0) {
    const singlePrice = Number(candles[0].close.toFixed(digits));
    return {
      poc: singlePrice,
      vah: singlePrice,
      val: singlePrice,
      totalVolume,
      valueAreaVolume: totalVolume,
      levels: [],
      session: targetSession,
      stepSize: pipSize,
      isApproximateTickVolume: true
    };
  }

  // Define step size
  const rawStep = range / binCount;
  const stepSize = Math.max(rawStep, pipSize);
  const actualBins = Math.max(12, Math.min(60, Math.ceil(range / stepSize)));

  const binVolumes = new Float64Array(actualBins);
  const binBuyVolumes = new Float64Array(actualBins);
  const binSellVolumes = new Float64Array(actualBins);

  // Distribute volume into bins proportionally across candle range
  for (const c of candles) {
    const candleRange = Math.max(c.high - c.low, pipSize * 0.1);
    const startBin = Math.max(0, Math.min(actualBins - 1, Math.floor((c.low - minPrice) / stepSize)));
    const endBin = Math.max(0, Math.min(actualBins - 1, Math.floor((c.high - minPrice) / stepSize)));
    const numBins = Math.max(1, endBin - startBin + 1);
    const volPerBin = c.volume / numBins;
    const buyVolPerBin = (c.buyVolume ?? (c.volume * 0.5)) / numBins;
    const sellVolPerBin = (c.sellVolume ?? (c.volume * 0.5)) / numBins;

    for (let b = startBin; b <= endBin; b++) {
      binVolumes[b] += volPerBin;
      binBuyVolumes[b] += buyVolPerBin;
      binSellVolumes[b] += sellVolPerBin;
    }
  }

  // Identify POC (Bin with max volume)
  let maxVol = -1;
  let pocBinIndex = 0;

  for (let i = 0; i < actualBins; i++) {
    if (binVolumes[i] > maxVol) {
      maxVol = binVolumes[i];
      pocBinIndex = i;
    }
  }

  // 70% Value Area calculation: start at POC and expand outward in both directions
  const targetValueVolume = totalVolume * 0.70;
  let accumulatedVolume = binVolumes[pocBinIndex];
  let valBinIndex = pocBinIndex;
  let vahBinIndex = pocBinIndex;

  while (accumulatedVolume < targetValueVolume && (valBinIndex > 0 || vahBinIndex < actualBins - 1)) {
    const nextLower = valBinIndex > 0 ? binVolumes[valBinIndex - 1] : -1;
    const nextHigher = vahBinIndex < actualBins - 1 ? binVolumes[vahBinIndex + 1] : -1;

    if (nextLower >= nextHigher && nextLower !== -1) {
      valBinIndex--;
      accumulatedVolume += nextLower;
    } else if (nextHigher !== -1) {
      vahBinIndex++;
      accumulatedVolume += nextHigher;
    } else if (nextLower !== -1) {
      valBinIndex--;
      accumulatedVolume += nextLower;
    } else {
      break;
    }
  }

  const pocPrice = Number((minPrice + (pocBinIndex + 0.5) * stepSize).toFixed(digits));
  const valPrice = Number((minPrice + valBinIndex * stepSize).toFixed(digits));
  const vahPrice = Number((minPrice + (vahBinIndex + 1) * stepSize).toFixed(digits));

  // Build level array
  const levels: VolumeProfileLevel[] = [];
  for (let i = 0; i < actualBins; i++) {
    const price = Number((minPrice + (i + 0.5) * stepSize).toFixed(digits));
    const volume = binVolumes[i];
    levels.push({
      price,
      volume,
      buyVolume: binBuyVolumes[i],
      sellVolume: binSellVolumes[i],
      percentage: totalVolume > 0 ? (volume / totalVolume) * 100 : 0
    });
  }

  return {
    poc: pocPrice,
    vah: vahPrice,
    val: valPrice,
    totalVolume,
    valueAreaVolume: accumulatedVolume,
    levels,
    session: targetSession,
    stepSize,
    isApproximateTickVolume: true // Label: "APPROXIMATE (tick volume)"
  };
}

/**
 * Check if the live price is approaching POC, VAH, or VAL within a pip threshold
 */
export function checkPriceApproachingVolumeProfile(
  currentPrice: number,
  profile: VolumeProfile,
  thresholdPips: number,
  pipSize: number
): { approachingPOC: boolean; approachingVAH: boolean; approachingVAL: boolean; deltaPips: { poc: number; vah: number; val: number } } {
  const thresholdDist = thresholdPips * pipSize;
  const distPOC = Math.abs(currentPrice - profile.poc);
  const distVAH = Math.abs(currentPrice - profile.vah);
  const distVAL = Math.abs(currentPrice - profile.val);

  return {
    approachingPOC: distPOC <= thresholdDist,
    approachingVAH: distVAH <= thresholdDist,
    approachingVAL: distVAL <= thresholdDist,
    deltaPips: {
      poc: Number((distPOC / pipSize).toFixed(1)),
      vah: Number((distVAH / pipSize).toFixed(1)),
      val: Number((distVAL / pipSize).toFixed(1))
    }
  };
}
