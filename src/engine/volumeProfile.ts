import { 
  Candle, 
  VolumeProfile, 
  VolumeProfileLevel, 
  MarketSessionType,
  VolumeProfileType 
} from '../types';

/**
 * Calculates a genuine Volume Profile (used for Binance crypto pairs with real exchange volume).
 * - POC (Point of Control): price level with highest traded volume.
 * - VAH & VAL (70% Value Area): expanded outward from POC adding heavier neighboring level.
 * - Label: "REAL (Binance trade execution)"
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
      profileType: 'REAL_VOLUME',
      label: 'REAL (Binance trade execution)',
      isApproximateTickVolume: false
    };
  }

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
      profileType: 'REAL_VOLUME',
      label: 'REAL (Binance trade execution)',
      isApproximateTickVolume: false
    };
  }

  const rawStep = range / binCount;
  const stepSize = Math.max(rawStep, pipSize);
  const actualBins = Math.max(12, Math.min(60, Math.ceil(range / stepSize)));

  const binVolumes = new Float64Array(actualBins);
  const binBuyVolumes = new Float64Array(actualBins);
  const binSellVolumes = new Float64Array(actualBins);

  for (const c of candles) {
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

  let maxVol = -1;
  let pocBinIndex = 0;
  for (let i = 0; i < actualBins; i++) {
    if (binVolumes[i] > maxVol) {
      maxVol = binVolumes[i];
      pocBinIndex = i;
    }
  }

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
    profileType: 'REAL_VOLUME',
    label: 'REAL (Binance trade execution)',
    isApproximateTickVolume: false
  };
}

/**
 * Builds a Time-At-Price Profile for Deriv symbols (Requirement 1):
 * - Built from M1 candles (ticks_history style, granularity 60) of the previous profile session.
 * - Each M1 candle adds equal weight across the 60 price rows between its low and high.
 * - POC = heaviest row.
 * - Value area = 70% expanded outward from the POC by adding the heavier neighbouring row.
 * - VAH and VAL are its edges.
 * - Label: "APPROXIMATE (time-at-price, no volume)" everywhere. Never call it volume!
 */
export function calculateTimeAtPriceProfile(
  candles: Candle[],
  digits = 2,
  pipSize = 0.1,
  targetSession: MarketSessionType = 'NEW_YORK'
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
      profileType: 'TIME_AT_PRICE',
      label: 'APPROXIMATE (time-at-price, no volume)',
      isApproximateTickVolume: true
    };
  }

  let sessionLow = Infinity;
  let sessionHigh = -Infinity;

  for (const c of candles) {
    if (c.low < sessionLow) sessionLow = c.low;
    if (c.high > sessionHigh) sessionHigh = c.high;
  }

  const range = sessionHigh - sessionLow;
  if (range <= 0) {
    const singlePrice = Number(candles[0].close.toFixed(digits));
    return {
      poc: singlePrice,
      vah: singlePrice,
      val: singlePrice,
      totalVolume: candles.length,
      valueAreaVolume: candles.length,
      levels: [],
      session: targetSession,
      stepSize: pipSize,
      profileType: 'TIME_AT_PRICE',
      label: 'APPROXIMATE (time-at-price, no volume)',
      isApproximateTickVolume: true
    };
  }

  // Exactly 60 price rows across the session range
  const numRows = 60;
  const stepSize = range / numRows;
  const rowWeights = new Float64Array(numRows);

  let totalWeight = 0;
  // Each M1 candle adds equal weight across the rows between its low and high
  for (const c of candles) {
    const startRow = Math.max(0, Math.min(numRows - 1, Math.floor((c.low - sessionLow) / stepSize)));
    const endRow = Math.max(0, Math.min(numRows - 1, Math.floor((c.high - sessionLow) / stepSize)));
    const coveredRows = Math.max(1, endRow - startRow + 1);
    const weightPerRow = 1.0 / coveredRows;

    for (let r = startRow; r <= endRow; r++) {
      rowWeights[r] += weightPerRow;
      totalWeight += weightPerRow;
    }
  }

  // POC = heaviest row
  let maxWeight = -1;
  let pocRowIndex = 0;
  for (let r = 0; r < numRows; r++) {
    if (rowWeights[r] > maxWeight) {
      maxWeight = rowWeights[r];
      pocRowIndex = r;
    }
  }

  // Value area = 70% expanded outward from the POC by adding the heavier neighbouring row
  const targetWeight = totalWeight * 0.70;
  let accumulatedWeight = rowWeights[pocRowIndex];
  let valRowIndex = pocRowIndex;
  let vahRowIndex = pocRowIndex;

  while (accumulatedWeight < targetWeight && (valRowIndex > 0 || vahRowIndex < numRows - 1)) {
    const lowerWeight = valRowIndex > 0 ? rowWeights[valRowIndex - 1] : -1;
    const upperWeight = vahRowIndex < numRows - 1 ? rowWeights[vahRowIndex + 1] : -1;

    if (lowerWeight >= upperWeight && lowerWeight !== -1) {
      valRowIndex--;
      accumulatedWeight += lowerWeight;
    } else if (upperWeight !== -1) {
      vahRowIndex++;
      accumulatedWeight += upperWeight;
    } else if (lowerWeight !== -1) {
      valRowIndex--;
      accumulatedWeight += lowerWeight;
    } else {
      break;
    }
  }

  // VAH and VAL are its edges:
  // VAL is the bottom edge of valRowIndex
  // VAH is the top edge of vahRowIndex
  const valPrice = Number((sessionLow + valRowIndex * stepSize).toFixed(digits));
  const vahPrice = Number((sessionLow + (vahRowIndex + 1) * stepSize).toFixed(digits));
  const pocPrice = Number((sessionLow + (pocRowIndex + 0.5) * stepSize).toFixed(digits));

  const levels: VolumeProfileLevel[] = [];
  for (let r = 0; r < numRows; r++) {
    const price = Number((sessionLow + (r + 0.5) * stepSize).toFixed(digits));
    const weight = rowWeights[r];
    levels.push({
      price,
      volume: weight,
      buyVolume: weight * 0.5,
      sellVolume: weight * 0.5,
      percentage: totalWeight > 0 ? (weight / totalWeight) * 100 : 0
    });
  }

  return {
    poc: pocPrice,
    vah: vahPrice,
    val: valPrice,
    totalVolume: totalWeight,
    valueAreaVolume: accumulatedWeight,
    levels,
    session: targetSession,
    stepSize,
    profileType: 'TIME_AT_PRICE',
    label: 'APPROXIMATE (time-at-price, no volume)',
    isApproximateTickVolume: true
  };
}

/**
 * Universal profile builder dispatched by provider:
 * - Binance: Genuine trade volume profile
 * - Deriv: 60-row equal-weight time-at-price profile
 */
export function buildProfileForSymbol(
  candles: Candle[],
  provider: 'BINANCE' | 'DERIV' | 'SIMULATION',
  digits = 2,
  pipSize = 0.1,
  session: MarketSessionType = 'NEW_YORK'
): VolumeProfile {
  if (provider === 'BINANCE') {
    return calculateVolumeProfile(candles, digits, pipSize, session);
  }
  return calculateTimeAtPriceProfile(candles, digits, pipSize, session);
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
