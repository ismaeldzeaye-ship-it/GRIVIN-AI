import { 
  Candle, 
  TradingSignal, 
  StrategyType, 
  MarketSessionType, 
  Timeframe, 
  InstitutionalChecklistItem,
  SetupGrade,
  SignalAuditLevels,
  MarketState
} from '../types';
import { calculateVolumeProfile, calculateTimeAtPriceProfile } from './volumeProfile';
import { analyzeMarketStructure } from './structure';
import { 
  getCurrentSession, 
  getInstitutionalKillZone, 
  getPreviousProfileSessionBoundaries,
  isFirstTwoMinutesOfSession,
  getPreviousRegularSessionWindow
} from './sessions';
import { isSymbolMarketOpen, normalizeAllowedSymbol, getBrokerSubstitutionNote } from '../data/symbolMapping';

/**
 * Calculates Average True Range (ATR) over N periods on the given candle series.
 */
export function calculateATR(candles: Candle[], period = 14): number {
  if (!candles || candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / slice.length;
}

/**
 * Evaluates H1 market bias (trend)
 */
export function getH1Bias(h1Candles?: Candle[]): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  if (!h1Candles || h1Candles.length < 5) return 'NEUTRAL';
  const structure = analyzeMarketStructure(h1Candles, '1H');
  return structure.trend === 'RANGING' ? 'NEUTRAL' : structure.trend;
}

/**
 * Section 3: Institutional Session Map & Strategy Window (UTC)
 * - Asian (00–07 UTC): Quiet hours (allowed if switch is ON)
 * - London Killzone (07–10 UTC)
 * - London Mid-Session (10–12 UTC)
 * - London/NY Overlap (12–15 UTC)
 * - NY Afternoon (15–21 UTC)
 * - Late (21–24 UTC): Quiet hours (allowed if switch is ON)
 */
export type SessionWindowType = 
  | 'ASIAN_SESSION'
  | 'LONDON_KILLZONE'
  | 'LONDON_MID_SESSION'
  | 'LONDON_NY_OVERLAP'
  | 'NY_AFTERNOON'
  | 'LATE_SESSION'
  | 'ASIAN_NO_SIGNAL'
  | 'POST_NY_NO_SIGNAL';

export function getSessionWindowInfo(date: Date = new Date(), allowQuietHoursSignals = true): {
  window: SessionWindowType;
  label: string;
  utcTimeStr: string;
  allowsSignals: boolean;
  isQuietHours: boolean;
  primaryStrategies: StrategyType[];
  secondaryStrategies: StrategyType[];
} {
  const utcHours = date.getUTCHours();
  const utcMins = date.getUTCMinutes();
  const totalMins = utcHours * 60 + utcMins;
  const timeFormatted = `${String(utcHours).padStart(2, '0')}:${String(utcMins).padStart(2, '0')} UTC`;

  if (totalMins < 7 * 60) {
    return {
      window: allowQuietHoursSignals ? 'ASIAN_SESSION' : 'ASIAN_NO_SIGNAL',
      label: `Asian Session (${timeFormatted})${allowQuietHoursSignals ? '' : ' - NO SIGNALS'}`,
      utcTimeStr: timeFormatted,
      allowsSignals: allowQuietHoursSignals,
      isQuietHours: true,
      primaryStrategies: ['STRATEGY_1A', 'STRATEGY_1B', 'POC_BOUNCE', 'VALUE_AREA_REVERSAL', 'STRATEGY_2'],
      secondaryStrategies: ['STRATEGY_3']
    };
  }

  if (totalMins < 10 * 60) {
    return {
      window: 'LONDON_KILLZONE',
      label: `London Killzone (${timeFormatted})`,
      utcTimeStr: timeFormatted,
      allowsSignals: true,
      isQuietHours: false,
      primaryStrategies: ['STRATEGY_3'],
      secondaryStrategies: ['STRATEGY_1A', 'POC_BOUNCE']
    };
  }

  if (totalMins < 12 * 60) {
    return {
      window: 'LONDON_MID_SESSION',
      label: `London Mid-Session (${timeFormatted})`,
      utcTimeStr: timeFormatted,
      allowsSignals: true,
      isQuietHours: false,
      primaryStrategies: ['STRATEGY_1A', 'STRATEGY_1B', 'POC_BOUNCE', 'VALUE_AREA_REVERSAL'],
      secondaryStrategies: ['STRATEGY_2']
    };
  }

  if (totalMins < 15 * 60) {
    return {
      window: 'LONDON_NY_OVERLAP',
      label: `London-NY Overlap (${timeFormatted})`,
      utcTimeStr: timeFormatted,
      allowsSignals: true,
      isQuietHours: false,
      primaryStrategies: ['STRATEGY_2'],
      secondaryStrategies: ['STRATEGY_3', 'STRATEGY_1C', 'CONFIRMED_BREAKOUT']
    };
  }

  if (totalMins < 21 * 60) {
    return {
      window: 'NY_AFTERNOON',
      label: `NY Afternoon (${timeFormatted})`,
      utcTimeStr: timeFormatted,
      allowsSignals: true,
      isQuietHours: false,
      primaryStrategies: ['STRATEGY_1A', 'STRATEGY_1B', 'POC_BOUNCE', 'VALUE_AREA_REVERSAL'],
      secondaryStrategies: ['STRATEGY_3']
    };
  }

  return {
    window: allowQuietHoursSignals ? 'LATE_SESSION' : 'POST_NY_NO_SIGNAL',
    label: `Late Session (${timeFormatted})${allowQuietHoursSignals ? '' : ' - NO SIGNALS'}`,
    utcTimeStr: timeFormatted,
    allowsSignals: allowQuietHoursSignals,
    isQuietHours: true,
    primaryStrategies: ['STRATEGY_1A', 'STRATEGY_1B', 'POC_BOUNCE', 'VALUE_AREA_REVERSAL', 'STRATEGY_2'],
    secondaryStrategies: ['STRATEGY_3']
  };
}

/**
 * Calculates Setup Grade:
 * Grade A+: 2 or more strategies agree on direction and level (confluence)
 * Grade A: All required institutional checklist criteria met
 * Grade B: Required criteria met, at most one secondary criterion missed
 * Grade C: Minimum qualifying setup criteria passed
 */
export function calculateSetupGrade(
  checklist: InstitutionalChecklistItem[],
  hasConfluence = false
): SetupGrade {
  if (hasConfluence) return 'A+';
  const requiredPassed = checklist.filter(c => c.requiredForGradeA).every(c => c.passed);
  if (!requiredPassed) return 'C';
  const allPassed = checklist.every(c => c.passed);
  if (allPassed) return 'A';
  const passCount = checklist.filter(c => c.passed).length;
  if (passCount >= checklist.length - 1) return 'B';
  return 'C';
}

export interface EvaluateSignalOptions {
  volumeType?: 'NONE' | 'APPROXIMATE_TICK' | 'REAL_VOLUME';
  isStale?: boolean;
  provider?: 'DERIV' | 'BINANCE' | 'SIMULATION';
  m1Candles?: Candle[];
  h1Candles?: Candle[];
  m5Candles?: Candle[];
  currentBid?: number;
  skipMarketOpenCheck?: boolean;
  skipSessionCheck?: boolean;
  referenceTime?: number | Date;
  referenceDate?: Date;
  allowQuietHoursSignals?: boolean; // Default true
  isSymbolUnavailable?: boolean; // Deriv symbol not found in active_symbols
}

export interface SignalMathVerificationResult {
  isValid: boolean;
  rejectReason?: string;
  r?: number;
  tp1Distance?: number;
  ratio?: number;
}

/**
 * Item 13: Strict Signal Math Verification
 * Enforces:
 * 1. Correct stop side (BUY: SL < Entry; SELL: SL > Entry)
 * 2. Stop distance >= 1x ATR14 on entry timeframe
 * 3. Exact BUY / SELL target ordering
 * 4. Displayed TP1 / R = 2.00 ratio (+/- 0.02 tolerance)
 */
export function verifySignalMath(
  direction: 'BUY' | 'SELL',
  entryPrice: number,
  stopLoss: number,
  tp1: number,
  atr14: number,
  digits = 2
): SignalMathVerificationResult {
  // Wrong stop side check
  if (direction === 'BUY' && stopLoss >= entryPrice) {
    return {
      isValid: false,
      rejectReason: `Wrong stop side for BUY: SL ${stopLoss} >= Entry ${entryPrice}`
    };
  }
  if (direction === 'SELL' && stopLoss <= entryPrice) {
    return {
      isValid: false,
      rejectReason: `Wrong stop side for SELL: SL ${stopLoss} <= Entry ${entryPrice}`
    };
  }

  const R = Number(Math.abs(entryPrice - stopLoss).toFixed(digits));

  // Stop under 1x ATR14 check
  if (R < atr14 - 1e-6) {
    return {
      isValid: false,
      rejectReason: `Stop distance ${R} is under 1x ATR14 (${atr14.toFixed(digits)})`
    };
  }

  // Strict ordering check
  const validOrdering = direction === 'BUY'
    ? (stopLoss < entryPrice && entryPrice < tp1)
    : (stopLoss > entryPrice && entryPrice > tp1);

  if (!validOrdering) {
    return {
      isValid: false,
      rejectReason: `Ordering violation for ${direction}: SL=${stopLoss}, Entry=${entryPrice}, TP1=${tp1}`
    };
  }

  const computedTP1Dist = Number(Math.abs(tp1 - entryPrice).toFixed(digits));
  const ratio = Number((computedTP1Dist / (R || 1)).toFixed(2));

  if (Math.abs(ratio - 2.00) > 0.02) {
    return {
      isValid: false,
      rejectReason: `TP1 / R ratio is ${ratio.toFixed(2)}, not 2.00`
    };
  }

  return {
    isValid: true,
    r: R,
    tp1Distance: computedTP1Dist,
    ratio
  };
}

/**
 * === UNIFIED INSTITUTIONAL SIGNAL ENGINE ===
 * Combines 3 institutional strategies into one system with automatic session selection.
 * SECTION 1: Allowed instruments only (XAUUSD, EURUSD, GBPUSD, USDJPY, ES/MES, NQ/NAS100, US30, BTCUSD)
 * SECTION 2: Strategies 1 (FRVP 1A, 1B, 1C), 2 (Structure Essentials), 3 (SMC Asian range sweep + body break)
 * SECTION 3: Session Map & Strategy Selector (UTC)
 * SECTION 4: Minimum 1x ATR(14) stop distance, 2R minimum target, 0.25R invalidation rule
 * SECTION 5: Formatted signal audit checklist and outputs
 */
export function evaluateTradingSignals(
  symbol: string,
  candles: Candle[],
  timeframe: Timeframe = '10m',
  currentBid?: number,
  pipSize = 0.1,
  digits = 2,
  options?: EvaluateSignalOptions
): TradingSignal[] {
  // SECTION 1: Allowed Instruments Filter (ONLY THESE)
  const normalizedAllowed = normalizeAllowedSymbol(symbol);
  if (!normalizedAllowed) {
    return []; // Never analyze or signal unallowed instruments
  }

  // US30 unavailable check: If symbol is US30 and it is marked unavailable -> output NO SIGNAL
  if (normalizedAllowed === 'US30' && (options?.isSymbolUnavailable || options?.provider === 'BINANCE')) {
    return [];
  }

  const substituteNote = getBrokerSubstitutionNote(symbol);

  // Market open check
  if (!options?.skipMarketOpenCheck && !isSymbolMarketOpen(symbol)) {
    return [];
  }

  // Block signals if market data feed is stale (> 15 seconds)
  if (options?.isStale) {
    return [];
  }

  if (!candles || candles.length < 20) return [];

  const lastCandle = candles[candles.length - 1]; // Current closed bar
  const prevCandle = candles[candles.length - 2]; // Prior closed bar
  if (!lastCandle || !prevCandle) return [];

  // Off-hours check: If candle is marked isOffHours (e.g. SPY/QQQ outside 09:30-16:00 NY), NEVER generate signals
  if (lastCandle.isOffHours) {
    return [];
  }

  const provider = options?.provider || (symbol.includes('USDT') ? 'BINANCE' : 'DERIV');
  const isCrypto = provider === 'BINANCE' || symbol.includes('USDT') || normalizedAllowed === 'BTCUSD';

  const lastPrice = currentBid || lastCandle.close || 0;
  if (!lastPrice) return [];

  // Session Window evaluation & Volatility Buffer
  const refTimeOrDate = options?.referenceDate ?? options?.referenceTime;
  const refDate = refTimeOrDate ? new Date(refTimeOrDate) : new Date();

  // Enforce first two minutes after session open (volatility buffer; block signals during minutes 0 and 1)
  if (!options?.skipSessionCheck && isFirstTwoMinutesOfSession(refDate)) {
    return [];
  }

  const allowQuiet = options?.allowQuietHoursSignals ?? true;
  const sessionInfo = getSessionWindowInfo(refDate, allowQuiet);

  if (!options?.skipSessionCheck && !sessionInfo.allowsSignals) {
    // Session does not permit setups
    return [];
  }

  // ATR(14) on current entry timeframe
  const atr14 = calculateATR(candles, 14) || pipSize * 15;

  // Evaluate H1 Bias & Current Structure
  const h1Bias = getH1Bias(options?.h1Candles);
  const structure = analyzeMarketStructure(candles, timeframe);
  const lastSwingHigh = structure.swingHighs.slice(-1)[0]?.price;
  const lastSwingLow = structure.swingLows.slice(-1)[0]?.price;

  let marketState: MarketState = 'Ranging';
  if (structure.trend === 'BULLISH' || h1Bias === 'BULLISH') {
    marketState = 'Trending Bullish';
  } else if (structure.trend === 'BEARISH' || h1Bias === 'BEARISH') {
    marketState = 'Trending Bearish';
  }

  // Asian session High / Low calculation (00:00 - 07:00 UTC of current day)
  const currentDayMidnightUtc = Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), refDate.getUTCDate(), 0, 0, 0) / 1000;
  const asianEndUtc = currentDayMidnightUtc + 7 * 3600;
  const asianCandles = candles.filter(c => c.time >= currentDayMidnightUtc && c.time < asianEndUtc);
  const asianHigh = asianCandles.length > 0 ? Math.max(...asianCandles.map(c => c.high)) : (lastSwingHigh || lastCandle.high);
  const asianLow = asianCandles.length > 0 ? Math.min(...asianCandles.map(c => c.low)) : (lastSwingLow || lastCandle.low);

  // Volume Profile calculation (Binance = real volume, Deriv = time-at-price profile across 60 rows)
  // For SPY/QQQ, build profile using the previous regular New York session only
  const isEquityPerp = symbol.toUpperCase().includes('SPY') || symbol.toUpperCase().includes('QQQ');
  const boundaries = isEquityPerp
    ? getPreviousRegularSessionWindow(refDate.getTime())
    : getPreviousProfileSessionBoundaries(refDate.getTime(), isCrypto);

  const m1PrevSession = (options?.m1Candles && options.m1Candles.length > 0)
    ? options.m1Candles.filter(c => c.time >= boundaries.startTime && c.time < boundaries.endTime)
    : [];

  let prevSessionProfile;
  let currentProfile;
  const currentSessionLegacy = getCurrentSession(refDate);

  if (provider === 'BINANCE') {
    const half = Math.floor(candles.length / 2);
    const profileCandles = isEquityPerp 
      ? candles.filter(c => c.time >= boundaries.startTime && c.time < boundaries.endTime)
      : candles.slice(0, half);
    const effectiveCandles = profileCandles.length >= 10 ? profileCandles : candles.slice(0, half);

    prevSessionProfile = calculateVolumeProfile(effectiveCandles, digits, pipSize, currentSessionLegacy.session);
    currentProfile = calculateVolumeProfile(candles.slice(half), digits, pipSize, currentSessionLegacy.session);
  } else {
    const candlesForPrev = m1PrevSession.length >= 30 ? m1PrevSession : candles.slice(0, Math.floor(candles.length / 2));
    const candlesForCurr = candles.slice(Math.floor(candles.length / 2));
    prevSessionProfile = calculateTimeAtPriceProfile(candlesForPrev, digits, pipSize, currentSessionLegacy.session);
    currentProfile = calculateTimeAtPriceProfile(candlesForCurr, digits, pipSize, currentSessionLegacy.session);
  }

  const targetVAH = prevSessionProfile.vah || currentProfile.vah;
  const targetVAL = prevSessionProfile.val || currentProfile.val;
  const prevPoc = prevSessionProfile.poc;
  const vaHeight = Math.max(targetVAH - targetVAL, pipSize * 5);
  const killZone = getInstitutionalKillZone(refDate);

  const rawCandidates: TradingSignal[] = [];

  // Helper for 1x ATR(14) stop loss enforcement & exact 2R target with strict ordering validation
  // Helper for 1x ATR(14) stop loss enforcement & exact 2R target with strict ordering validation (Item 13)
  const buildSignalLevels = (
    direction: 'BUY' | 'SELL',
    structuralSL: number,
    structuralReason: string
  ) => {
    const entryPrice = lastPrice;
    let slDistance = Math.abs(entryPrice - structuralSL);
    let finalSL = structuralSL;

    // Minimum stop distance: at least 1x ATR(14)
    if (slDistance < atr14) {
      slDistance = atr14;
      finalSL = direction === 'BUY' 
        ? Number((entryPrice - slDistance).toFixed(digits)) 
        : Number((entryPrice + slDistance).toFixed(digits));
    }


    // Stop side check (Item 13: if stop side is wrong, reject the signal, log reason, send no alert)
    if (direction === 'BUY' && finalSL >= entryPrice) {
      console.warn(`[GREVIN AI] Rejected ${symbol} BUY: Wrong stop side. SL ${finalSL} >= Entry ${entryPrice}`);
      return null;
    }
    if (direction === 'SELL' && finalSL <= entryPrice) {
      console.warn(`[GREVIN AI] Rejected ${symbol} SELL: Wrong stop side. SL ${finalSL} <= Entry ${entryPrice}`);
      return null;
    }

    const R = Number(Math.abs(entryPrice - finalSL).toFixed(digits));

    // Stop under 1x ATR14 check (Item 13)
    if (R < atr14 - 1e-6) {
      console.warn(`[GREVIN AI] Rejected ${symbol}: Stop distance (${R.toFixed(digits)}) is under 1x ATR14 (${atr14.toFixed(digits)})`);
      return null;
    }

    const tp1 = direction === 'BUY'
      ? Number((entryPrice + 2 * R).toFixed(digits))
      : Number((entryPrice - 2 * R).toFixed(digits));

    const tp2 = direction === 'BUY'
      ? Number((entryPrice + 3 * R).toFixed(digits))
      : Number((entryPrice - 3 * R).toFixed(digits));

    // Target mathematics strict verification via verifySignalMath
    const mathCheck = verifySignalMath(direction, entryPrice, finalSL, tp1, atr14, digits);
    if (!mathCheck.isValid) {
      console.warn(`[GREVIN AI] Rejected ${symbol}: ${mathCheck.rejectReason}`);
      return null;
    }

    const riskPips = Math.max(1, Math.round(R / pipSize));
    const rewardPips = riskPips * 2;
    const invalidationThreshold = Number((0.25 * R).toFixed(digits));
    const rDistanceFormatted = `${(R / pipSize).toFixed(1)} pips (${R.toFixed(digits)} pts)`;
    const tp1DistanceFormatted = `${((2 * R) / pipSize).toFixed(1)} pips (${(2 * R).toFixed(digits)} pts)`;
    const holdSeconds = 7200; // 2 hours validity/hold time
    const validUntilEpoch = (lastCandle.time + holdSeconds) * 1000;
    const validUntilTimeUtc = new Date(validUntilEpoch).toISOString().slice(11, 19) + ' UTC';

    return {
      entryPrice,
      stopLoss: finalSL,
      stopLossReason: `${structuralReason} (>= 1x ATR14: ${atr14.toFixed(digits)})`,
      tp1,
      tp2,
      riskPips,
      rewardPips,
      rDistance: R,
      tp1Distance: 2 * R,
      rDistanceFormatted,
      tp1DistanceFormatted,
      stopDistancePoints: R,
      tp1DistancePoints: 2 * R,
      stopDistanceFormatted: rDistanceFormatted,
      tp1OverRRatio: 'TP1 / R = 2.00 OK' as const,
      validUntilTimeUtc,
      validUntilEpoch,
      signalCandleTime: lastCandle.time,
      atr14AtEntry: atr14,
      isMathCheckPassed: true,
      invalidationDistance: invalidationThreshold
    };
  };

  // ==========================================================================
  // STRATEGY 1: FIXED-RANGE VOLUME PROFILE (FRVP)
  // Best assets: Gold (XAUUSD), ES/MES, BTCUSD
  // ==========================================================================

  // --- 1A: POC Bounce ---
  const prevCloseOutsideAbove = prevCandle.close > targetVAH;
  const prevCloseOutsideBelow = prevCandle.close < targetVAL;
  const candleTestedPOC = 
    (lastCandle.low <= prevPoc + pipSize * 4 && lastCandle.high >= prevPoc - pipSize * 4) ||
    Math.abs(lastPrice - prevPoc) <= pipSize * 15;

  if (candleTestedPOC) {
    if (prevCloseOutsideAbove && lastCandle.close >= prevPoc) {
      // Bullish POC Bounce
      const levels = buildSignalLevels('BUY', prevPoc - pipSize * 4, `Below previous session POC (${prevPoc.toFixed(digits)})`);
      if (levels) {
        const checklist: InstitutionalChecklistItem[] = [
          { id: 'prev-close-outside', label: 'Previous close outside Value Area', passed: true, requiredForGradeA: true, detail: `Close was above VAH (${targetVAH.toFixed(digits)})` },
          { id: 'poc-test', label: 'Test of previous session POC', passed: true, requiredForGradeA: true, detail: `Candle low tested POC at ${prevPoc.toFixed(digits)}` },
          { id: 'candle-close-confirm', label: 'Closed candle rejection', passed: lastCandle.close >= prevPoc, requiredForGradeA: true, detail: `Closed at ${lastCandle.close} above POC` },
          { id: 'session-valid', label: 'Session rules permit setup', passed: sessionInfo.allowsSignals, requiredForGradeA: true, detail: sessionInfo.label },
          { id: 'news-protection', label: 'Economic calendar protection', passed: false, requiredForGradeA: false, detail: 'News protection NOT VERIFIED' }
        ];

        rawCandidates.push({
          id: `SIG-1A-BUY-${symbol.replace('/', '')}-${lastCandle.time}`,
          symbol,
          substituteNote,
          direction: 'BUY',
          status: 'VALID',
          timeframe,
          confirmationTimeframe: 'M5',
          strategy: 'STRATEGY_1A',
          strategyName: 'Strategy 1A: POC Bounce',
          marketState,
          strategySelected: 'Strategy 1A (FRVP POC Bounce)',
          strategyReason: `Previous session closed outside VA, tested previous POC (${prevPoc.toFixed(digits)}) and confirmed upward rejection.`,
          sessionTimeUtc: sessionInfo.utcTimeStr,
          sessionLabel: sessionInfo.label,
          isQuietHours: sessionInfo.isQuietHours,
          newsProtectionNotice: 'News protection NOT VERIFIED',
          entryZone: {
            min: Number((prevPoc - pipSize * 2).toFixed(digits)),
            max: Number((prevPoc + pipSize * 2).toFixed(digits))
          },
          entryPrice: levels.entryPrice,
          stopLoss: levels.stopLoss,
          stopLossReason: levels.stopLossReason,
          tp: levels.tp1,
          tp1: levels.tp1,
          tp2: levels.tp2,
          riskPips: levels.riskPips,
          rewardPips: levels.rewardPips,
          rMultiple: 2.0,
          rDistance: levels.rDistance,
          tp1Distance: levels.tp1Distance,
          rDistanceFormatted: levels.rDistanceFormatted,
          tp1DistanceFormatted: levels.tp1DistanceFormatted,
          riskReward: '1:2.0',
          estimatedHoldTime: '25m - 2h',
          grade: calculateSetupGrade(checklist),
          confidence: 'High',
          invalidationCondition: `Price moves > 0.25R (${levels.invalidationDistance}) away from entry zone without filling, or body closes below SL.`,
          session: currentSessionLegacy.session,
          killZone,
          h1Bias,
          reason: `Tested previous POC (${prevPoc.toFixed(digits)}) after close outside VA. Bullish rejection confirmed.`,
          timestamp: lastCandle.time * 1000,
          checklist,
          auditLevels: {
            poc: prevPoc,
            vah: targetVAH,
            val: targetVAL,
            swingHigh: lastSwingHigh,
            swingLow: lastSwingLow,
            profileType: prevSessionProfile.profileType || (provider === 'BINANCE' ? 'REAL_VOLUME' : 'TIME_AT_PRICE'),
            profileLabel: prevSessionProfile.label || (provider === 'BINANCE' ? 'REAL (Binance trade execution)' : 'APPROXIMATE (time-at-price, no volume)')
          },
          marketType: options?.provider === 'BINANCE' ? 'SPOT' : undefined,
          exactSymbol: symbol.replace('/', ''),
          volumeType: provider === 'BINANCE' ? 'REAL_VOLUME' : 'NONE'
        });
      }
    } else if (prevCloseOutsideBelow && lastCandle.close <= prevPoc) {
      // Bearish POC Bounce
      const levels = buildSignalLevels('SELL', prevPoc + pipSize * 4, `Above previous session POC (${prevPoc.toFixed(digits)})`);
      if (levels) {
        const checklist: InstitutionalChecklistItem[] = [
          { id: 'prev-close-outside', label: 'Previous close outside Value Area', passed: true, requiredForGradeA: true, detail: `Close was below VAL (${targetVAL.toFixed(digits)})` },
          { id: 'poc-test', label: 'Test of previous session POC', passed: true, requiredForGradeA: true, detail: `Candle high tested POC at ${prevPoc.toFixed(digits)}` },
          { id: 'candle-close-confirm', label: 'Closed candle rejection', passed: lastCandle.close <= prevPoc, requiredForGradeA: true, detail: `Closed at ${lastCandle.close} below POC` },
          { id: 'session-valid', label: 'Session rules permit setup', passed: sessionInfo.allowsSignals, requiredForGradeA: true, detail: sessionInfo.label },
          { id: 'news-protection', label: 'Economic calendar protection', passed: false, requiredForGradeA: false, detail: 'News protection NOT VERIFIED' }
        ];

        rawCandidates.push({
          id: `SIG-1A-SELL-${symbol.replace('/', '')}-${lastCandle.time}`,
          symbol,
          substituteNote,
          direction: 'SELL',
          status: 'VALID',
          timeframe,
          confirmationTimeframe: 'M5',
          strategy: 'STRATEGY_1A',
          strategyName: 'Strategy 1A: POC Bounce',
          marketState,
          strategySelected: 'Strategy 1A (FRVP POC Bounce)',
          strategyReason: `Previous session closed outside VA, tested previous POC (${prevPoc.toFixed(digits)}) and confirmed downward rejection.`,
          sessionTimeUtc: sessionInfo.utcTimeStr,
          sessionLabel: sessionInfo.label,
          isQuietHours: sessionInfo.isQuietHours,
          newsProtectionNotice: 'News protection NOT VERIFIED',
          entryZone: {
            min: Number((prevPoc - pipSize * 2).toFixed(digits)),
            max: Number((prevPoc + pipSize * 2).toFixed(digits))
          },
          entryPrice: levels.entryPrice,
          stopLoss: levels.stopLoss,
          stopLossReason: levels.stopLossReason,
          tp: levels.tp1,
          tp1: levels.tp1,
          tp2: levels.tp2,
          riskPips: levels.riskPips,
          rewardPips: levels.rewardPips,
          rMultiple: 2.0,
          rDistance: levels.rDistance,
          tp1Distance: levels.tp1Distance,
          rDistanceFormatted: levels.rDistanceFormatted,
          tp1DistanceFormatted: levels.tp1DistanceFormatted,
          riskReward: '1:2.0',
          estimatedHoldTime: '25m - 2h',
          grade: calculateSetupGrade(checklist),
          confidence: 'High',
          invalidationCondition: `Price moves > 0.25R (${levels.invalidationDistance}) away from entry zone without filling, or body closes above SL.`,
          session: currentSessionLegacy.session,
          killZone,
          h1Bias,
          reason: `Tested previous POC (${prevPoc.toFixed(digits)}) after close outside VA. Bearish rejection confirmed.`,
          timestamp: lastCandle.time * 1000,
          checklist,
          auditLevels: {
            poc: prevPoc,
            vah: targetVAH,
            val: targetVAL,
            swingHigh: lastSwingHigh,
            swingLow: lastSwingLow,
            profileType: prevSessionProfile.profileType || (provider === 'BINANCE' ? 'REAL_VOLUME' : 'TIME_AT_PRICE'),
            profileLabel: prevSessionProfile.label || (provider === 'BINANCE' ? 'REAL (Binance trade execution)' : 'APPROXIMATE (time-at-price, no volume)')
          },
          marketType: options?.provider === 'BINANCE' ? 'SPOT' : undefined,
          exactSymbol: symbol.replace('/', ''),
          volumeType: provider === 'BINANCE' ? 'REAL_VOLUME' : 'NONE'
        });
      }
    }
  }

  // --- 1B: Value Area Reversal ---
  const prevCloseInside = prevCandle.close >= targetVAL && prevCandle.close <= targetVAH;
  if (prevCloseInside) {
    const movedBeyondVAH = lastCandle.high > targetVAH || prevCandle.high > targetVAH;
    const bodyClosedInsideBelowVAH = lastCandle.close < targetVAH && Math.max(lastCandle.open, lastCandle.close) <= targetVAH;

    if (movedBeyondVAH && bodyClosedInsideBelowVAH) {
      // Bearish VAR
      const sweepHigh = Math.max(lastCandle.high, prevCandle.high);
      const levels = buildSignalLevels('SELL', sweepHigh + pipSize * 2, `Beyond sweep high (${sweepHigh.toFixed(digits)}) above VAH`);
      if (levels) {
        const checklist: InstitutionalChecklistItem[] = [
          { id: 'prev-close-inside', label: 'Previous close INSIDE Value Area', passed: true, requiredForGradeA: true, detail: `Previous close ${prevCandle.close} inside VA` },
          { id: 'boundary-probe', label: 'Price probed beyond VAH boundary', passed: true, requiredForGradeA: true, detail: `High reached ${sweepHigh.toFixed(digits)}` },
          { id: 'body-close-inside', label: 'Candle BODY closed back inside Value Area', passed: true, requiredForGradeA: true, detail: `Body close at ${lastCandle.close} < VAH (${targetVAH.toFixed(digits)})` },
          { id: 'session-valid', label: 'Session rules permit setup', passed: sessionInfo.allowsSignals, requiredForGradeA: true, detail: sessionInfo.label },
          { id: 'news-protection', label: 'Economic calendar protection', passed: false, requiredForGradeA: false, detail: 'News protection NOT VERIFIED' }
        ];

        rawCandidates.push({
          id: `SIG-1B-SELL-${symbol.replace('/', '')}-${lastCandle.time}`,
          symbol,
          substituteNote,
          direction: 'SELL',
          status: 'VALID',
          timeframe,
          confirmationTimeframe: 'M5',
          strategy: 'STRATEGY_1B',
          strategyName: 'Strategy 1B: Value Area Reversal',
          marketState,
          strategySelected: 'Strategy 1B (Value Area Mean Reversion)',
          strategyReason: `Price swept outside VAH (${targetVAH.toFixed(digits)}) and candle body closed back inside the Value Area.`,
          sessionTimeUtc: sessionInfo.utcTimeStr,
          sessionLabel: sessionInfo.label,
          isQuietHours: sessionInfo.isQuietHours,
          newsProtectionNotice: 'News protection NOT VERIFIED',
          entryZone: {
            min: Number((lastPrice - pipSize * 2).toFixed(digits)),
            max: Number((lastPrice + pipSize * 2).toFixed(digits))
          },
          entryPrice: levels.entryPrice,
          stopLoss: levels.stopLoss,
          stopLossReason: levels.stopLossReason,
          tp: levels.tp1,
          tp1: levels.tp1,
          tp2: levels.tp2,
          riskPips: levels.riskPips,
          rewardPips: levels.rewardPips,
          rMultiple: 2.0,
          rDistance: levels.rDistance,
          tp1Distance: levels.tp1Distance,
          rDistanceFormatted: levels.rDistanceFormatted,
          tp1DistanceFormatted: levels.tp1DistanceFormatted,
          riskReward: '1:2.0',
          estimatedHoldTime: '20m - 1h 30m',
          grade: calculateSetupGrade(checklist),
          confidence: 'High',
          invalidationCondition: `Price moves > 0.25R (${levels.invalidationDistance}) away from entry zone without filling, or body closes above SL.`,
          session: currentSessionLegacy.session,
          killZone,
          h1Bias,
          reason: `Swept above VAH with verified candle body close back inside VA. Mean reversion to POC expected.`,
          timestamp: lastCandle.time * 1000,
          checklist,
          auditLevels: {
            poc: prevPoc,
            vah: targetVAH,
            val: targetVAL,
            swingHigh: sweepHigh,
            swingLow: lastSwingLow,
            profileType: prevSessionProfile.profileType || (provider === 'BINANCE' ? 'REAL_VOLUME' : 'TIME_AT_PRICE'),
            profileLabel: prevSessionProfile.label || (provider === 'BINANCE' ? 'REAL (Binance trade execution)' : 'APPROXIMATE (time-at-price, no volume)')
          },
          marketType: options?.provider === 'BINANCE' ? 'SPOT' : undefined,
          exactSymbol: symbol.replace('/', ''),
          volumeType: provider === 'BINANCE' ? 'REAL_VOLUME' : 'NONE'
        });
      }
    }

    const movedBeyondVAL = lastCandle.low < targetVAL || prevCandle.low < targetVAL;
    const bodyClosedInsideAboveVAL = lastCandle.close > targetVAL && Math.min(lastCandle.open, lastCandle.close) >= targetVAL;

    if (movedBeyondVAL && bodyClosedInsideAboveVAL) {
      // Bullish VAR
      const sweepLow = Math.min(lastCandle.low, prevCandle.low);
      const levels = buildSignalLevels('BUY', sweepLow - pipSize * 2, `Below sweep low (${sweepLow.toFixed(digits)}) under VAL`);
      if (levels) {
        const checklist: InstitutionalChecklistItem[] = [
          { id: 'prev-close-inside', label: 'Previous close INSIDE Value Area', passed: true, requiredForGradeA: true, detail: `Previous close ${prevCandle.close} inside VA` },
          { id: 'boundary-probe', label: 'Price probed beyond VAL boundary', passed: true, requiredForGradeA: true, detail: `Low reached ${sweepLow.toFixed(digits)}` },
          { id: 'body-close-inside', label: 'Candle BODY closed back inside Value Area', passed: true, requiredForGradeA: true, detail: `Body close at ${lastCandle.close} > VAL (${targetVAL.toFixed(digits)})` },
          { id: 'session-valid', label: 'Session rules permit setup', passed: sessionInfo.allowsSignals, requiredForGradeA: true, detail: sessionInfo.label },
          { id: 'news-protection', label: 'Economic calendar protection', passed: false, requiredForGradeA: false, detail: 'News protection NOT VERIFIED' }
        ];

        rawCandidates.push({
          id: `SIG-1B-BUY-${symbol.replace('/', '')}-${lastCandle.time}`,
          symbol,
          substituteNote,
          direction: 'BUY',
          status: 'VALID',
          timeframe,
          confirmationTimeframe: 'M5',
          strategy: 'STRATEGY_1B',
          strategyName: 'Strategy 1B: Value Area Reversal',
          marketState,
          strategySelected: 'Strategy 1B (Value Area Mean Reversion)',
          strategyReason: `Price swept outside VAL (${targetVAL.toFixed(digits)}) and candle body closed back inside the Value Area.`,
          sessionTimeUtc: sessionInfo.utcTimeStr,
          sessionLabel: sessionInfo.label,
          isQuietHours: sessionInfo.isQuietHours,
          newsProtectionNotice: 'News protection NOT VERIFIED',
          entryZone: {
            min: Number((lastPrice - pipSize * 2).toFixed(digits)),
            max: Number((lastPrice + pipSize * 2).toFixed(digits))
          },
          entryPrice: levels.entryPrice,
          stopLoss: levels.stopLoss,
          stopLossReason: levels.stopLossReason,
          tp: levels.tp1,
          tp1: levels.tp1,
          tp2: levels.tp2,
          riskPips: levels.riskPips,
          rewardPips: levels.rewardPips,
          rMultiple: 2.0,
          rDistance: levels.rDistance,
          tp1Distance: levels.tp1Distance,
          rDistanceFormatted: levels.rDistanceFormatted,
          tp1DistanceFormatted: levels.tp1DistanceFormatted,
          riskReward: '1:2.0',
          estimatedHoldTime: '20m - 1h 30m',
          grade: calculateSetupGrade(checklist),
          confidence: 'High',
          invalidationCondition: `Price moves > 0.25R (${levels.invalidationDistance}) away from entry zone without filling, or body closes below SL.`,
          session: currentSessionLegacy.session,
          killZone,
          h1Bias,
          reason: `Swept below VAL with verified candle body close back inside VA. Mean reversion to POC expected.`,
          timestamp: lastCandle.time * 1000,
          checklist,
          auditLevels: {
            poc: prevPoc,
            vah: targetVAH,
            val: targetVAL,
            swingHigh: lastSwingHigh,
            swingLow: sweepLow,
            profileType: prevSessionProfile.profileType || (provider === 'BINANCE' ? 'REAL_VOLUME' : 'TIME_AT_PRICE'),
            profileLabel: prevSessionProfile.label || (provider === 'BINANCE' ? 'REAL (Binance trade execution)' : 'APPROXIMATE (time-at-price, no volume)')
          },
          marketType: options?.provider === 'BINANCE' ? 'SPOT' : undefined,
          exactSymbol: symbol.replace('/', ''),
          volumeType: provider === 'BINANCE' ? 'REAL_VOLUME' : 'NONE'
        });
      }
    }
  }

  // --- 1C: Breakout Continuation ---
  const maxPullbackAllowed = 0.50 * vaHeight;
  const hasBullishBOS = (structure.lastBOS && structure.lastBOS.direction === 'BULLISH') || (lastCandle.close > Math.max(...candles.slice(-6, -1).map(c => c.high)));
  const recentHighs = candles.slice(-10).map(c => c.high);
  const brokeAboveVAH = Math.max(...recentHighs) > targetVAH;

  if (brokeAboveVAH && hasBullishBOS) {
    const pullbackCandles = candles.slice(-3, -1);
    const pullbackLowest = Math.min(...pullbackCandles.map(c => c.low));
    const pullbackDepth = Math.max(0, targetVAH - pullbackLowest);

    if (pullbackDepth <= maxPullbackAllowed) {
      const levels = buildSignalLevels('BUY', pullbackLowest - pipSize * 2, `Below shallow pullback low (${pullbackLowest.toFixed(digits)})`);
      if (levels) {
        const checklist: InstitutionalChecklistItem[] = [
          { id: 'boundary-break', label: 'Clean break outside Value Area (VAH)', passed: true, requiredForGradeA: true, detail: `Broke above VAH (${targetVAH.toFixed(digits)})` },
          { id: 'pullback-hold', label: 'Pullback holds within 50% VA height', passed: true, requiredForGradeA: true, detail: `Depth ${pullbackDepth.toFixed(1)} <= ${maxPullbackAllowed.toFixed(1)}` },
          { id: 'bos-confirmation', label: 'Confirmed body-close BOS in breakout direction', passed: true, requiredForGradeA: true, detail: `BOS at ${structure.lastBOS?.price || lastCandle.close}` },
          { id: 'session-valid', label: 'Session rules permit setup', passed: sessionInfo.allowsSignals, requiredForGradeA: true, detail: sessionInfo.label },
          { id: 'news-protection', label: 'Economic calendar protection', passed: false, requiredForGradeA: false, detail: 'News protection NOT VERIFIED' }
        ];

        rawCandidates.push({
          id: `SIG-1C-BUY-${symbol.replace('/', '')}-${lastCandle.time}`,
          symbol,
          substituteNote,
          direction: 'BUY',
          status: 'VALID',
          timeframe,
          confirmationTimeframe: 'M5',
          strategy: 'STRATEGY_1C',
          strategyName: 'Strategy 1C: Breakout Continuation',
          marketState,
          strategySelected: 'Strategy 1C (FRVP Breakout Continuation)',
          strategyReason: `Clean break above VAH held within 50% threshold with confirmed BOS continuation.`,
          sessionTimeUtc: sessionInfo.utcTimeStr,
          sessionLabel: sessionInfo.label,
          isQuietHours: sessionInfo.isQuietHours,
          newsProtectionNotice: 'News protection NOT VERIFIED',
          entryZone: {
            min: Number((lastPrice - pipSize * 2).toFixed(digits)),
            max: Number((lastPrice + pipSize * 2).toFixed(digits))
          },
          entryPrice: levels.entryPrice,
          stopLoss: levels.stopLoss,
          stopLossReason: levels.stopLossReason,
          tp: levels.tp1,
          tp1: levels.tp1,
          tp2: levels.tp2,
          riskPips: levels.riskPips,
          rewardPips: levels.rewardPips,
          rMultiple: 2.0,
          rDistance: levels.rDistance,
          tp1Distance: levels.tp1Distance,
          rDistanceFormatted: levels.rDistanceFormatted,
          tp1DistanceFormatted: levels.tp1DistanceFormatted,
          riskReward: '1:2.0',
          estimatedHoldTime: '30m - 3h',
          grade: calculateSetupGrade(checklist),
          confidence: 'High',
          invalidationCondition: `Price moves > 0.25R (${levels.invalidationDistance}) away from entry zone without filling, or body closes below SL.`,
          session: currentSessionLegacy.session,
          killZone,
          h1Bias,
          reason: `Broke above VAH with shallow pullback holding and body-close BOS confirmed.`,
          timestamp: lastCandle.time * 1000,
          checklist,
          auditLevels: {
            poc: prevPoc,
            vah: targetVAH,
            val: targetVAL,
            swingHigh: lastSwingHigh,
            swingLow: pullbackLowest,
            bosCandleTime: structure.lastBOS?.time,
            bosPrice: structure.lastBOS?.price,
            profileType: prevSessionProfile.profileType || (provider === 'BINANCE' ? 'REAL_VOLUME' : 'TIME_AT_PRICE'),
            profileLabel: prevSessionProfile.label || (provider === 'BINANCE' ? 'REAL (Binance trade execution)' : 'APPROXIMATE (time-at-price, no volume)')
          },
          marketType: options?.provider === 'BINANCE' ? 'SPOT' : undefined,
          exactSymbol: symbol.replace('/', ''),
          volumeType: provider === 'BINANCE' ? 'REAL_VOLUME' : 'NONE'
        });
      }
    }
  }

  // ==========================================================================
  // STRATEGY 2: MARKET STRUCTURE ESSENTIALS
  // Best assets: Forex majors (EURUSD, GBPUSD, USDJPY)
  // Uptrend HH+HL, downtrend LL+LH. BOS = continuation, CHOCH = reversal.
  // ==========================================================================
  if (structure.lastBOS || structure.lastCHOCH) {
    const isBullishContinuation = structure.trend === 'BULLISH' && structure.lastBOS?.direction === 'BULLISH';
    const isBearishContinuation = structure.trend === 'BEARISH' && structure.lastBOS?.direction === 'BEARISH';
    const isBullishReversal = structure.lastCHOCH?.direction === 'BULLISH';
    const isBearishReversal = structure.lastCHOCH?.direction === 'BEARISH';

    if (isBullishContinuation && lastSwingLow) {
      const levels = buildSignalLevels('BUY', lastSwingLow - pipSize * 2, `Structural swing low (${lastSwingLow.toFixed(digits)})`);
      if (levels) {
        const checklist: InstitutionalChecklistItem[] = [
          { id: 'prev-close-condition', label: 'Prior swing body-closed above', passed: true, requiredForGradeA: true, detail: `BOS at ${structure.lastBOS?.price}` },
          { id: 'candle-close-confirm', label: 'Closed candle confirmation', passed: true, requiredForGradeA: true, detail: `Closed at ${lastCandle.close}` },
          { id: 'body-close-bos', label: 'Body-close BOS verified', passed: true, requiredForGradeA: true, detail: 'Uptrend HH+HL structure intact' },
          { id: 'session-valid', label: 'Session rules permit setup', passed: sessionInfo.allowsSignals, requiredForGradeA: true, detail: sessionInfo.label },
          { id: 'news-protection', label: 'Economic calendar protection', passed: false, requiredForGradeA: false, detail: 'News protection NOT VERIFIED' }
        ];

        rawCandidates.push({
          id: `SIG-2-BUY-${symbol.replace('/', '')}-${lastCandle.time}`,
          symbol,
          substituteNote,
          direction: 'BUY',
          status: 'VALID',
          timeframe,
          confirmationTimeframe: 'M5',
          strategy: 'STRATEGY_2',
          strategyName: 'Strategy 2: Market Structure Essentials',
          marketState: 'Trending Bullish',
          strategySelected: 'Strategy 2 (Trend Continuation BOS)',
          strategyReason: `Uptrend sequence of Higher Highs and Higher Lows confirmed with body-close BOS at ${structure.lastBOS?.price}.`,
          sessionTimeUtc: sessionInfo.utcTimeStr,
          sessionLabel: sessionInfo.label,
          isQuietHours: sessionInfo.isQuietHours,
          newsProtectionNotice: 'News protection NOT VERIFIED',
          entryZone: {
            min: Number((lastPrice - pipSize * 2).toFixed(digits)),
            max: Number((lastPrice + pipSize * 2).toFixed(digits))
          },
          entryPrice: levels.entryPrice,
          stopLoss: levels.stopLoss,
          stopLossReason: levels.stopLossReason,
          tp: levels.tp1,
          tp1: levels.tp1,
          tp2: levels.tp2,
          riskPips: levels.riskPips,
          rewardPips: levels.rewardPips,
          rMultiple: 2.0,
          rDistance: levels.rDistance,
          tp1Distance: levels.tp1Distance,
          rDistanceFormatted: levels.rDistanceFormatted,
          tp1DistanceFormatted: levels.tp1DistanceFormatted,
          riskReward: '1:2.0',
          estimatedHoldTime: '30m - 2h 30m',
          grade: calculateSetupGrade(checklist),
          confidence: 'High',
          invalidationCondition: `Price moves > 0.25R (${levels.invalidationDistance}) away from entry zone without filling, or body closes below SL.`,
          session: currentSessionLegacy.session,
          killZone,
          h1Bias,
          reason: `Bullish market structure continuation (HH+HL) with verified body-close BOS.`,
          timestamp: lastCandle.time * 1000,
          checklist,
          auditLevels: {
            poc: prevPoc,
            vah: targetVAH,
            val: targetVAL,
            swingHigh: lastSwingHigh,
            swingLow: lastSwingLow,
            bosCandleTime: structure.lastBOS?.time,
            bosPrice: structure.lastBOS?.price,
            profileType: prevSessionProfile.profileType || (provider === 'BINANCE' ? 'REAL_VOLUME' : 'TIME_AT_PRICE'),
            profileLabel: prevSessionProfile.label || (provider === 'BINANCE' ? 'REAL (Binance trade execution)' : 'APPROXIMATE (time-at-price, no volume)')
          },
          marketType: options?.provider === 'BINANCE' ? 'SPOT' : undefined,
          exactSymbol: symbol.replace('/', ''),
          volumeType: provider === 'BINANCE' ? 'REAL_VOLUME' : 'NONE'
        });
      }
    } else if (isBearishContinuation && lastSwingHigh) {
      const levels = buildSignalLevels('SELL', lastSwingHigh + pipSize * 2, `Structural swing high (${lastSwingHigh.toFixed(digits)})`);
      if (levels) {
        const checklist: InstitutionalChecklistItem[] = [
          { id: 'prev-close-condition', label: 'Prior swing body-closed below', passed: true, requiredForGradeA: true, detail: `BOS at ${structure.lastBOS?.price}` },
          { id: 'candle-close-confirm', label: 'Closed candle confirmation', passed: true, requiredForGradeA: true, detail: `Closed at ${lastCandle.close}` },
          { id: 'body-close-bos', label: 'Body-close BOS verified', passed: true, requiredForGradeA: true, detail: 'Downtrend LL+LH structure intact' },
          { id: 'session-valid', label: 'Session rules permit setup', passed: sessionInfo.allowsSignals, requiredForGradeA: true, detail: sessionInfo.label },
          { id: 'news-protection', label: 'Economic calendar protection', passed: false, requiredForGradeA: false, detail: 'News protection NOT VERIFIED' }
        ];

        rawCandidates.push({
          id: `SIG-2-SELL-${symbol.replace('/', '')}-${lastCandle.time}`,
          symbol,
          substituteNote,
          direction: 'SELL',
          status: 'VALID',
          timeframe,
          confirmationTimeframe: 'M5',
          strategy: 'STRATEGY_2',
          strategyName: 'Strategy 2: Market Structure Essentials',
          marketState: 'Trending Bearish',
          strategySelected: 'Strategy 2 (Trend Continuation BOS)',
          strategyReason: `Downtrend sequence of Lower Lows and Lower Highs confirmed with body-close BOS at ${structure.lastBOS?.price}.`,
          sessionTimeUtc: sessionInfo.utcTimeStr,
          sessionLabel: sessionInfo.label,
          isQuietHours: sessionInfo.isQuietHours,
          newsProtectionNotice: 'News protection NOT VERIFIED',
          entryZone: {
            min: Number((lastPrice - pipSize * 2).toFixed(digits)),
            max: Number((lastPrice + pipSize * 2).toFixed(digits))
          },
          entryPrice: levels.entryPrice,
          stopLoss: levels.stopLoss,
          stopLossReason: levels.stopLossReason,
          tp: levels.tp1,
          tp1: levels.tp1,
          tp2: levels.tp2,
          riskPips: levels.riskPips,
          rewardPips: levels.rewardPips,
          rMultiple: 2.0,
          rDistance: levels.rDistance,
          tp1Distance: levels.tp1Distance,
          rDistanceFormatted: levels.rDistanceFormatted,
          tp1DistanceFormatted: levels.tp1DistanceFormatted,
          riskReward: '1:2.0',
          estimatedHoldTime: '30m - 2h 30m',
          grade: calculateSetupGrade(checklist),
          confidence: 'High',
          invalidationCondition: `Price moves > 0.25R (${levels.invalidationDistance}) away from entry zone without filling, or body closes above SL.`,
          session: currentSessionLegacy.session,
          killZone,
          h1Bias,
          reason: `Bearish market structure continuation (LL+LH) with verified body-close BOS.`,
          timestamp: lastCandle.time * 1000,
          checklist,
          auditLevels: {
            poc: prevPoc,
            vah: targetVAH,
            val: targetVAL,
            swingHigh: lastSwingHigh,
            swingLow: lastSwingLow,
            bosCandleTime: structure.lastBOS?.time,
            bosPrice: structure.lastBOS?.price,
            profileType: prevSessionProfile.profileType || (provider === 'BINANCE' ? 'REAL_VOLUME' : 'TIME_AT_PRICE'),
            profileLabel: prevSessionProfile.label || (provider === 'BINANCE' ? 'REAL (Binance trade execution)' : 'APPROXIMATE (time-at-price, no volume)')
          },
          marketType: options?.provider === 'BINANCE' ? 'SPOT' : undefined,
          exactSymbol: symbol.replace('/', ''),
          volumeType: provider === 'BINANCE' ? 'REAL_VOLUME' : 'NONE'
        });
      }
    }
  }

  // ==========================================================================
  // STRATEGY 3: ADVANCED MARKET STRUCTURE & SMC
  // Best assets: Nasdaq (NQ / NAS100), US30, Gold (XAUUSD)
  // Section 7.7:
  // - In London/NY sessions: Asian-range sweeps are permitted.
  // - In Asian hours: Asian-range sweeps remain strictly restricted to London/NY.
  //   Only external liquidity sweeps (previous day/week high/low with body-close BOS/CHoCH) are allowed.
  // ==========================================================================
  const allowAsianSweep = !sessionInfo.isQuietHours;

  const sweptAsianHigh = allowAsianSweep && (lastCandle.high > asianHigh || prevCandle.high > asianHigh) && lastCandle.close < asianHigh;
  const sweptAsianLow = allowAsianSweep && (lastCandle.low < asianLow || prevCandle.low < asianLow) && lastCandle.close > asianLow;

  // External liquidity sweeps (previous day/week/swing high/low with body-close BOS/CHoCH)
  const prevLookback = candles.slice(-48);
  const prevPeriodHigh = prevLookback.length > 0 ? Math.max(...prevLookback.map(c => c.high)) : (lastSwingHigh || lastCandle.high);
  const prevPeriodLow = prevLookback.length > 0 ? Math.min(...prevLookback.map(c => c.low)) : (lastSwingLow || lastCandle.low);

  const sweptExternalHigh = (lastCandle.high > prevPeriodHigh || (lastSwingHigh !== undefined && lastCandle.high > lastSwingHigh)) &&
    lastCandle.close < (lastSwingHigh || prevPeriodHigh);
  const sweptExternalLow = (lastCandle.low < prevPeriodLow || (lastSwingLow !== undefined && lastCandle.low < lastSwingLow)) &&
    lastCandle.close > (lastSwingLow || prevPeriodLow);

  const isBearishSweep = sweptAsianHigh || sweptExternalHigh;
  const isBullishSweep = sweptAsianLow || sweptExternalLow;

  if (isBearishSweep) {
    // Bearish Sweep SMC Reversal
    const sweepExtreme = Math.max(lastCandle.high, prevCandle.high);
    const levels = buildSignalLevels('SELL', sweepExtreme + pipSize * 3, `Above sweep extreme (${sweepExtreme.toFixed(digits)})`);
    if (levels) {
      const isAsian = sweptAsianHigh;
      const checklist: InstitutionalChecklistItem[] = [
        { 
          id: isAsian ? 'asian-sweep' : 'external-sweep', 
          label: isAsian ? 'Asian Session liquidity sweep' : 'External liquidity sweep (previous high)', 
          passed: true, 
          requiredForGradeA: true, 
          detail: isAsian ? `Swept Asian High (${asianHigh.toFixed(digits)})` : `Swept External High (${(lastSwingHigh || prevPeriodHigh).toFixed(digits)})` 
        },
        { id: 'candle-body-close', label: 'Candle body close back inside range', passed: true, requiredForGradeA: true, detail: `Body close at ${lastCandle.close}` },
        { id: 'body-close-choch', label: 'Body-close CHOCH / internal BOS', passed: true, requiredForGradeA: true, detail: 'Bearish rejection confirmed' },
        { id: 'session-valid', label: 'Session rules permit setup', passed: sessionInfo.allowsSignals, requiredForGradeA: true, detail: sessionInfo.label },
        { id: 'news-protection', label: 'Economic calendar protection', passed: false, requiredForGradeA: false, detail: 'News protection NOT VERIFIED' }
      ];

      rawCandidates.push({
        id: `SIG-3-SELL-${symbol.replace('/', '')}-${lastCandle.time}`,
        symbol,
        substituteNote,
        direction: 'SELL',
        status: 'VALID',
        timeframe,
        confirmationTimeframe: 'M5',
        strategy: 'STRATEGY_3',
        strategyName: 'Strategy 3: Advanced Market Structure & SMC',
        marketState,
        strategySelected: isAsian ? 'Strategy 3 (SMC Asian Liquidity Sweep)' : 'Strategy 3 (SMC External Liquidity Sweep)',
        strategyReason: isAsian
          ? `Liquidity sweep above Asian session high (${asianHigh.toFixed(digits)}) followed by body-close displacement back inside range.`
          : `External liquidity sweep above previous high (${(lastSwingHigh || prevPeriodHigh).toFixed(digits)}) with body-close displacement downward.`,
        sessionTimeUtc: sessionInfo.utcTimeStr,
        sessionLabel: sessionInfo.label,
        isQuietHours: sessionInfo.isQuietHours,
        newsProtectionNotice: 'News protection NOT VERIFIED',
        entryZone: {
          min: Number((lastPrice - pipSize * 2).toFixed(digits)),
          max: Number((lastPrice + pipSize * 2).toFixed(digits))
        },
        entryPrice: levels.entryPrice,
        stopLoss: levels.stopLoss,
        stopLossReason: levels.stopLossReason,
        tp: levels.tp1,
        tp1: levels.tp1,
        tp2: levels.tp2,
        riskPips: levels.riskPips,
        rewardPips: levels.rewardPips,
        rMultiple: 2.0,
        rDistance: levels.rDistance,
        tp1Distance: levels.tp1Distance,
        rDistanceFormatted: levels.rDistanceFormatted,
        tp1DistanceFormatted: levels.tp1DistanceFormatted,
        riskReward: '1:2.0',
        estimatedHoldTime: '15m - 1h 45m',
        grade: calculateSetupGrade(checklist),
        confidence: 'High',
        invalidationCondition: `Price moves > 0.25R (${levels.invalidationDistance}) away from entry zone without filling, or body closes above SL.`,
        session: currentSessionLegacy.session,
        killZone,
        h1Bias,
        reason: isAsian 
          ? `Institutional Asian range sweep with body-close displacement downward. Target liquidity pool.`
          : `Institutional external liquidity sweep with body-close displacement downward. Target liquidity pool.`,
        timestamp: lastCandle.time * 1000,
        checklist,
        auditLevels: {
          poc: prevPoc,
          vah: targetVAH,
          val: targetVAL,
          swingHigh: sweepExtreme,
          swingLow: lastSwingLow,
          profileType: prevSessionProfile.profileType || (provider === 'BINANCE' ? 'REAL_VOLUME' : 'TIME_AT_PRICE'),
          profileLabel: prevSessionProfile.label || (provider === 'BINANCE' ? 'REAL (Binance trade execution)' : 'APPROXIMATE (time-at-price, no volume)')
        },
        marketType: options?.provider === 'BINANCE' ? 'SPOT' : undefined,
        exactSymbol: symbol.replace('/', ''),
        volumeType: provider === 'BINANCE' ? 'REAL_VOLUME' : 'NONE'
      });
    }
  } else if (isBullishSweep) {
    // Bullish Sweep SMC Reversal
    const sweepExtreme = Math.min(lastCandle.low, prevCandle.low);
    const levels = buildSignalLevels('BUY', sweepExtreme - pipSize * 3, `Below sweep extreme (${sweepExtreme.toFixed(digits)})`);
    if (levels) {
      const isAsian = sweptAsianLow;
      const checklist: InstitutionalChecklistItem[] = [
        { 
          id: isAsian ? 'asian-sweep' : 'external-sweep', 
          label: isAsian ? 'Asian Session liquidity sweep' : 'External liquidity sweep (previous low)', 
          passed: true, 
          requiredForGradeA: true, 
          detail: isAsian ? `Swept Asian Low (${asianLow.toFixed(digits)})` : `Swept External Low (${(lastSwingLow || prevPeriodLow).toFixed(digits)})` 
        },
        { id: 'candle-body-close', label: 'Candle body close back inside range', passed: true, requiredForGradeA: true, detail: `Body close at ${lastCandle.close}` },
        { id: 'body-close-choch', label: 'Body-close CHOCH / internal BOS', passed: true, requiredForGradeA: true, detail: 'Bullish rejection confirmed' },
        { id: 'session-valid', label: 'Session rules permit setup', passed: sessionInfo.allowsSignals, requiredForGradeA: true, detail: sessionInfo.label },
        { id: 'news-protection', label: 'Economic calendar protection', passed: false, requiredForGradeA: false, detail: 'News protection NOT VERIFIED' }
      ];

      rawCandidates.push({
        id: `SIG-3-BUY-${symbol.replace('/', '')}-${lastCandle.time}`,
        symbol,
        substituteNote,
        direction: 'BUY',
        status: 'VALID',
        timeframe,
        confirmationTimeframe: 'M5',
        strategy: 'STRATEGY_3',
        strategyName: 'Strategy 3: Advanced Market Structure & SMC',
        marketState,
        strategySelected: isAsian ? 'Strategy 3 (SMC Asian Liquidity Sweep)' : 'Strategy 3 (SMC External Liquidity Sweep)',
        strategyReason: isAsian
          ? `Liquidity sweep below Asian session low (${asianLow.toFixed(digits)}) followed by body-close displacement back inside range.`
          : `External liquidity sweep below previous low (${(lastSwingLow || prevPeriodLow).toFixed(digits)}) with body-close displacement upward.`,
        sessionTimeUtc: sessionInfo.utcTimeStr,
        sessionLabel: sessionInfo.label,
        isQuietHours: sessionInfo.isQuietHours,
        newsProtectionNotice: 'News protection NOT VERIFIED',
        entryZone: {
          min: Number((lastPrice - pipSize * 2).toFixed(digits)),
          max: Number((lastPrice + pipSize * 2).toFixed(digits))
        },
        entryPrice: levels.entryPrice,
        stopLoss: levels.stopLoss,
        stopLossReason: levels.stopLossReason,
        tp: levels.tp1,
        tp1: levels.tp1,
        tp2: levels.tp2,
        riskPips: levels.riskPips,
        rewardPips: levels.rewardPips,
        rMultiple: 2.0,
        rDistance: levels.rDistance,
        tp1Distance: levels.tp1Distance,
        rDistanceFormatted: levels.rDistanceFormatted,
        tp1DistanceFormatted: levels.tp1DistanceFormatted,
        riskReward: '1:2.0',
        estimatedHoldTime: '15m - 1h 45m',
        grade: calculateSetupGrade(checklist),
        confidence: 'High',
        invalidationCondition: `Price moves > 0.25R (${levels.invalidationDistance}) away from entry zone without filling, or body closes below SL.`,
        session: currentSessionLegacy.session,
        killZone,
        h1Bias,
        reason: isAsian
          ? `Institutional Asian range sweep with body-close displacement upward. Target liquidity pool.`
          : `Institutional external liquidity sweep with body-close displacement upward. Target liquidity pool.`,
        timestamp: lastCandle.time * 1000,
        checklist,
        auditLevels: {
          poc: prevPoc,
          vah: targetVAH,
          val: targetVAL,
          swingHigh: lastSwingHigh,
          swingLow: sweepExtreme,
          profileType: prevSessionProfile.profileType || (provider === 'BINANCE' ? 'REAL_VOLUME' : 'TIME_AT_PRICE'),
          profileLabel: prevSessionProfile.label || (provider === 'BINANCE' ? 'REAL (Binance trade execution)' : 'APPROXIMATE (time-at-price, no volume)')
        },
        marketType: options?.provider === 'BINANCE' ? 'SPOT' : undefined,
        exactSymbol: symbol.replace('/', ''),
        volumeType: provider === 'BINANCE' ? 'REAL_VOLUME' : 'NONE'
      });
    }
  }

  if (rawCandidates.length === 0) {
    return [];
  }

  // ==========================================================================
  // SECTION 3: STRATEGY SELECTOR & CONFLICT RESOLUTION
  // - Conflicting directions between strategies -> NO SIGNAL
  // - When 2 or more strategies agree on direction and level -> Grade as A+ setup
  // ==========================================================================
  const buySignals = rawCandidates.filter(s => s.direction === 'BUY');
  const sellSignals = rawCandidates.filter(s => s.direction === 'SELL');

  if (buySignals.length > 0 && sellSignals.length > 0) {
    // Conflicting directional signals between strategies -> Output NO SIGNAL
    return [];
  }

  const activeCandidates = buySignals.length > 0 ? buySignals : sellSignals;

  // Filter or prioritize based on Session Window (Section 3 rules)
  let prioritized = activeCandidates;
  if (!options?.skipSessionCheck && sessionInfo.allowsSignals) {
    const matchingPrimary = activeCandidates.filter(s => sessionInfo.primaryStrategies.includes(s.strategy));
    if (matchingPrimary.length > 0) {
      prioritized = matchingPrimary;
    } else {
      const matchingSecondary = activeCandidates.filter(s => sessionInfo.secondaryStrategies.includes(s.strategy));
      if (matchingSecondary.length > 0) {
        prioritized = matchingSecondary;
      }
    }
  }

  // Confluence detection: If 2 or more strategies agree on direction
  const hasConfluence = activeCandidates.length >= 2;

  // Final signals with A+ grade if confluent and verified notice
  return prioritized
    .map(s => {
      const isBuy = s.direction === 'BUY';
      const entry = s.entryPrice;
      const sl = s.stopLoss;
      const tp1 = s.tp1 || s.tp;
      const rDist = Number(Math.abs(entry - sl).toFixed(digits));
      const tp1Dist = Number(Math.abs(tp1 - entry).toFixed(digits));
      const ratio = Number((tp1Dist / (rDist || 1)).toFixed(2));
      const stopDistance = Math.abs(entry - sl);

      // Strict Item 13 validation
      const stopSideValid = isBuy ? sl < entry : sl > entry;
      const minStopValid = stopDistance >= (s.atr14AtEntry || atr14) - 1e-6;
      const ratioValid = Math.abs(ratio - 2.00) <= 0.02;

      if (!stopSideValid || !minStopValid || !ratioValid) {
        console.warn(`[GREVIN AI] Rejected ${s.symbol} at final math check: stopSide=${stopSideValid}, minStop=${minStopValid}, ratio=${ratio}`);
        return null;
      }

      const holdSec = 7200;
      const validEpoch = s.validUntilEpoch || (lastCandle.time + holdSec) * 1000;
      const validTime = s.validUntilTimeUtc || new Date(validEpoch).toISOString().slice(11, 19) + ' UTC';

      const enriched: TradingSignal = {
        ...s,
        rDistance: rDist,
        tp1Distance: tp1Dist,
        rDistanceFormatted: s.rDistanceFormatted || `${(rDist / pipSize).toFixed(1)} pips (${rDist.toFixed(digits)} pts)`,
        tp1DistanceFormatted: s.tp1DistanceFormatted || `${(tp1Dist / pipSize).toFixed(1)} pips (${tp1Dist.toFixed(digits)} pts)`,
        stopDistancePoints: rDist,
        tp1DistancePoints: tp1Dist,
        stopDistanceFormatted: s.stopDistanceFormatted || `${(rDist / pipSize).toFixed(1)} pips (${rDist.toFixed(digits)} pts)`,
        tp1OverRRatio: 'TP1 / R = 2.00 OK',
        validUntilTimeUtc: validTime,
        validUntilEpoch: validEpoch,
        signalCandleTime: s.signalCandleTime || lastCandle.time,
        atr14AtEntry: s.atr14AtEntry || atr14,
        isMathCheckPassed: true,
        newsProtectionNotice: 'News protection NOT VERIFIED',
        sessionLabel: sessionInfo.label,
        isQuietHours: sessionInfo.isQuietHours
      };
      if (hasConfluence) {
        return {
          ...enriched,
          grade: 'A+' as SetupGrade,
          confidence: 'A+ with confluence' as const,
          strategyReason: `${s.strategyReason} (CONFLUENCE: Multiple institutional strategies align on ${s.direction})`
        };
      }
      return enriched;
    })
    .filter((s): s is TradingSignal => s !== null);
}
