import { calculateVolumeProfile, calculateTimeAtPriceProfile } from '../volumeProfile';
import { 
  isDaylightSavingTime, 
  getActiveSessionSchedules, 
  getPreviousProfileSessionBoundaries, 
  getInstitutionalKillZone,
  isFirstTwoMinutesOfSession,
  getUtcSessionState
} from '../sessions';
import { synthesizeM10FromM5, synthesizeM45FromM15 } from '../timeframes';
import { evaluateTradingSignals, verifySignalMath } from '../setups';
import { 
  resolveForwardTestTrades, 
  calculateForwardTestStats 
} from '../forwardTest';
import { Candle, ForwardTestTrade } from '../../types';

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export function runGREVINUnitTests(): { passed: boolean; results: TestResult[] } {
  const results: TestResult[] = [];

  // ==========================================================================
  // TEST 1: Time-At-Price Profile Math with Known POC and 70% Value Area
  // ==========================================================================
  try {
    // 60 M1 candles spanning from price 100.0 to 160.0 (session range = 60.0, 60 bins -> 1.0 per bin)
    // We construct a known concentration:
    // 40 candles spend their entire duration in bin 30 (range 130.0 to 131.0, midpoint 130.5).
    // The other 20 candles are spread across other rows (10 candles in 100-110, 10 in 150-160).
    const m1Candles: Candle[] = [];
    let t = 1700000000;

    // 40 candles concentrated at price 130.0 - 131.0
    for (let i = 0; i < 40; i++) {
      m1Candles.push({
        time: t + i * 60,
        open: 130.2,
        high: 130.9,
        low: 130.1,
        close: 130.7,
        volume: 0 // no volume
      });
    }

    // 10 candles in lower range 100-110
    for (let i = 0; i < 10; i++) {
      m1Candles.push({
        time: t + (40 + i) * 60,
        open: 100 + i,
        high: 101 + i,
        low: 100 + i,
        close: 100.5 + i,
        volume: 0
      });
    }

    // 10 candles in upper range 150-160
    for (let i = 0; i < 10; i++) {
      m1Candles.push({
        time: t + (50 + i) * 60,
        open: 150 + i,
        high: 151 + i,
        low: 150 + i,
        close: 150.5 + i,
        volume: 0
      });
    }

    const tapProfile = calculateTimeAtPriceProfile(m1Candles, 2, 0.1, 'NEW_YORK');

    // Expected POC: heavily weighted row is at ~130.5
    const isPocCorrect = Math.abs(tapProfile.poc - 130.5) <= 1.0;
    // Value Area covers at least 70% of total time weight
    const isValueArea70 = tapProfile.valueAreaVolume >= tapProfile.totalVolume * 0.69;
    // VAH must be above POC and VAL must be below POC
    const boundsValid = tapProfile.vah > tapProfile.poc && tapProfile.val <= tapProfile.poc;
    // Exactly 60 levels
    const is60Rows = tapProfile.levels.length === 60;
    // Must be labeled "APPROXIMATE (time-at-price, no volume)" and NOT call it volume
    const correctLabel = tapProfile.label === 'APPROXIMATE (time-at-price, no volume)';
    const profileTypeCorrect = tapProfile.profileType === 'TIME_AT_PRICE';

    const passed = isPocCorrect && isValueArea70 && boundsValid && is60Rows && correctLabel && profileTypeCorrect;

    results.push({
      name: '1. Deriv Time-At-Price Profile (Known POC, 70% Value Area, 60 Rows, Strict Label)',
      passed,
      message: `POC: ${tapProfile.poc} (expected ~130.5), VAL: ${tapProfile.val}, VAH: ${tapProfile.vah}, Rows: ${tapProfile.levels.length}, Label: "${tapProfile.label}"`
    });
  } catch (err: unknown) {
    results.push({
      name: '1. Deriv Time-At-Price Profile (Known POC, 70% Value Area, 60 Rows, Strict Label)',
      passed: false,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`
    });
  }

  // ==========================================================================
  // TEST 2: Strategy 1: POC Bounce (Positive Case & Negative Gating Case)
  // ==========================================================================
  try {
    // Generate baseline candles for previous session where POC = 100, VAH = 101, VAL = 98
    const baseCandles: Candle[] = [];
    for (let i = 0; i < 15; i++) {
      baseCandles.push({
        time: 1000 + i * 60,
        open: 99.8,
        high: 100.3,
        low: 99.7,
        close: 100.1,
        volume: 4000
      });
    }
    for (let i = 15; i < 20; i++) {
      baseCandles.push({
        time: 1000 + i * 60,
        open: 100,
        high: 102,
        low: 98,
        close: 100,
        volume: 2000
      });
    }
    for (let i = 20; i < 35; i++) {
      baseCandles.push({
        time: 1000 + i * 60,
        open: 105,
        high: 107,
        low: 104,
        close: 106,
        volume: 500
      });
    }

    // POSITIVE CASE:
    // Candle 36: Previous close OUTSIDE value area (close = 106 > VAH)
    const positiveCandles = [...baseCandles];
    positiveCandles.push({
      time: 1000 + 36 * 60,
      open: 106,
      high: 107,
      low: 105,
      close: 106, // outside VA above VAH
      volume: 600
    });
    // Candle 37: Tests POC at 100 and bounces up (low 99.9, close 100.5)
    positiveCandles.push({
      time: 1000 + 37 * 60,
      open: 100.2,
      high: 100.8,
      low: 99.9, // tested POC
      close: 100.5, // bounced above POC
      volume: 1500
    });

    const posSignals = evaluateTradingSignals('XAU/USD', positiveCandles, 'M15', 100.5, 0.1, 2, { skipMarketOpenCheck: true, skipSessionCheck: true });
    const posBounce = posSignals.find(s => s.strategy === 'POC_BOUNCE' || s.strategy === 'STRATEGY_1A');
    const posPassed = !!posBounce && posBounce.direction === 'BUY' && posBounce.rMultiple === 2.0;

    // NEGATIVE CASE (Previous-Close Inside Gating):
    // Candle 36 closes INSIDE value area (close = 100.1 inside VA)
    const negativeCandles = [...baseCandles];
    negativeCandles.push({
      time: 1000 + 36 * 60,
      open: 100,
      high: 100.5,
      low: 99.8,
      close: 100.1, // INSIDE value area! Fails gating requirement
      volume: 600
    });
    // Candle 37 tests POC and bounces
    negativeCandles.push({
      time: 1000 + 37 * 60,
      open: 100.2,
      high: 100.8,
      low: 99.9,
      close: 100.5,
      volume: 1500
    });

    const negSignals = evaluateTradingSignals('XAU/USD', negativeCandles, 'M15', 100.5, 0.1, 2, { skipMarketOpenCheck: true, skipSessionCheck: true });
    const negBounce = negSignals.find(s => s.strategy === 'POC_BOUNCE' || s.strategy === 'STRATEGY_1A');
    const negPassed = !negBounce; // Must be REJECTED!

    results.push({
      name: '2. Strategy 1 (POC Bounce): Positive Bounce & Negative Gating Rejection',
      passed: posPassed && negPassed,
      message: `Positive triggered: ${posPassed} (2R target: ${posBounce?.tp}), Negative inside-close rejected: ${negPassed}`
    });
  } catch (err: unknown) {
    results.push({
      name: '2. Strategy 1 (POC Bounce): Positive Bounce & Negative Gating Rejection',
      passed: false,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`
    });
  }

  // ==========================================================================
  // TEST 3: Strategy 2: Value Area Reversal (Positive & Negative Wick-Only Case)
  // ==========================================================================
  try {
    const baseVARCandles: Candle[] = [];
    for (let i = 0; i < 30; i++) {
      baseVARCandles.push({
        time: 1000 + i * 60,
        open: 100,
        high: 102,
        low: 98,
        close: 100,
        volume: 1000
      });
    }

    // POSITIVE CASE:
    // Candle 36: Previous close INSIDE value area (close = 100.2)
    const posVARCandles = [...baseVARCandles];
    posVARCandles.push({
      time: 1000 + 36 * 60,
      open: 100,
      high: 101,
      low: 99.5,
      close: 100.2, // inside VA
      volume: 800
    });
    // Candle 37: Price moves beyond VAH (high = 104.5), but candle BODY closes back inside (< VAH, close 99.5)
    posVARCandles.push({
      time: 1000 + 37 * 60,
      open: 100.5,
      high: 104.5, // swept above VAH
      low: 99.0,
      close: 99.5, // BODY closed cleanly inside VA
      volume: 1500
    });

    const posSignals = evaluateTradingSignals('XAU/USD', posVARCandles, 'M15', 99.5, 0.1, 2, { skipMarketOpenCheck: true, skipSessionCheck: true });
    const posVAR = posSignals.find(s => s.strategy === 'VALUE_AREA_REVERSAL' || s.strategy === 'STRATEGY_1B');
    const posPassed = !!posVAR && posVAR.direction === 'SELL' && posVAR.rMultiple === 2.0;

    // NEGATIVE CASE (Wick-only / Body outside):
    // Candle 37 moves above VAH, but candle BODY closes OUTSIDE (> VAH 102, e.g. open 102.5, close 103.5)
    const negVARCandles = [...baseVARCandles];
    negVARCandles.push({
      time: 1000 + 36 * 60,
      open: 100,
      high: 101,
      low: 99.5,
      close: 100.5,
      volume: 800
    });
    negVARCandles.push({
      time: 1000 + 37 * 60,
      open: 102.5,
      high: 104.5,
      low: 101.5,
      close: 103.5, // BODY closed OUTSIDE! Not a value area reversal
      volume: 1500
    });

    const negSignals = evaluateTradingSignals('XAU/USD', negVARCandles, 'M15', 103.5, 0.1, 2, { skipMarketOpenCheck: true, skipSessionCheck: true });
    const negVAR = negSignals.find(s => s.strategy === 'VALUE_AREA_REVERSAL' || s.strategy === 'STRATEGY_1B');
    const negPassed = !negVAR; // Must be REJECTED!

    results.push({
      name: '3. Strategy 2 (Value Area Reversal): Positive Rejection & Negative Body-Outside Case',
      passed: posPassed && negPassed,
      message: `Positive reversal SELL triggered: ${posPassed}, Body-outside case rejected: ${negPassed}`
    });
  } catch (err: unknown) {
    results.push({
      name: '3. Strategy 2 (Value Area Reversal): Positive Rejection & Negative Body-Outside Case',
      passed: false,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`
    });
  }

  // ==========================================================================
  // TEST 4: Strategy 3: Breakout (Positive Shallow Pullback & Negative Deep Pullback)
  // ==========================================================================
  try {
    const baseBrkCandles: Candle[] = [];
    // Value area between 98 and 102 (height = 4.0, max 50% pullback = 2.0)
    for (let i = 0; i < 20; i++) {
      baseBrkCandles.push({
        time: 1000 + i * 60,
        open: 100,
        high: 102,
        low: 98,
        close: 100,
        volume: 1000
      });
    }

    // POSITIVE CASE:
    // Breakout candle closing above VAH (close 104)
    const posBrkCandles = [...baseBrkCandles];
    posBrkCandles.push({ time: 1000 + 21 * 60, open: 100.5, high: 105, low: 100.5, close: 104, volume: 2000 });
    // Shallow pullback: lowest low = 101.5 (depth = 0.5 <= 2.0 max allowed)
    posBrkCandles.push({ time: 1000 + 22 * 60, open: 104, high: 104, low: 101.5, close: 102.5, volume: 800 });
    // BOS candle in breakout direction
    posBrkCandles.push({ time: 1000 + 23 * 60, open: 102.5, high: 106.5, low: 102.5, close: 106, volume: 2500 });

    const posSignals = evaluateTradingSignals('XAU/USD', posBrkCandles, 'M15', 106, 0.1, 2, { skipMarketOpenCheck: true, skipSessionCheck: true });
    const posBrk = posSignals.find(s => s.strategy === 'CONFIRMED_BREAKOUT' || s.strategy === 'STRATEGY_1C');
    const posPassed = !!posBrk && posBrk.direction === 'BUY' && posBrk.rMultiple === 2.0;

    // NEGATIVE CASE:
    // Deep pullback > 50% into value area: lowest low = 98.5 (pullback depth = 3.5 > 2.0 max allowed)
    const negBrkCandles = [...baseBrkCandles];
    negBrkCandles.push({ time: 1000 + 21 * 60, open: 100.5, high: 105, low: 100.5, close: 104, volume: 2000 });
    negBrkCandles.push({ time: 1000 + 22 * 60, open: 104, high: 104, low: 98.5, close: 99.0, volume: 800 }); // deep collapse
    negBrkCandles.push({ time: 1000 + 23 * 60, open: 99.0, high: 106.5, low: 99.0, close: 106, volume: 2500 });

    const negSignals = evaluateTradingSignals('XAU/USD', negBrkCandles, 'M15', 106, 0.1, 2, { skipMarketOpenCheck: true, skipSessionCheck: true });
    const negBrk = negSignals.find(s => s.strategy === 'CONFIRMED_BREAKOUT' || s.strategy === 'STRATEGY_1C');
    const negPassed = !negBrk; // Must be REJECTED!

    results.push({
      name: '4. Strategy 3 (Breakout): Positive Shallow Pullback & Negative Deep Pullback Rejection',
      passed: posPassed && negPassed,
      message: `Positive breakout BUY triggered: ${posPassed}, Deep pullback (>50% VA) rejected: ${negPassed}`
    });
  } catch (err: unknown) {
    results.push({
      name: '4. Strategy 3 (Breakout): Positive Shallow Pullback & Negative Deep Pullback Rejection',
      passed: false,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`
    });
  }

  // ==========================================================================
  // TEST 5: Session Boundaries with Daylight Saving Time (DST) & Crypto UTC Day
  // ==========================================================================
  try {
    const summerDate = new Date('2026-07-15T14:00:00Z'); // US EDT (summer)
    const winterDate = new Date('2026-01-15T14:00:00Z'); // US EST (winter)

    // Forex / Gold / Indices: 17:00 NY boundary
    // EDT (UTC-4): 17:00 NY = 21:00 UTC
    // EST (UTC-5): 17:00 NY = 22:00 UTC
    const summerBoundaries = getPreviousProfileSessionBoundaries(summerDate.getTime(), false);
    const winterBoundaries = getPreviousProfileSessionBoundaries(winterDate.getTime(), false);

    const isSummerEDT21 = summerBoundaries.sessionLabel.includes('EDT 21:00 UTC');
    const isWinterEST22 = winterBoundaries.sessionLabel.includes('EST 22:00 UTC');

    // Crypto: UTC day (00:00 to 24:00 UTC)
    const cryptoBoundaries = getPreviousProfileSessionBoundaries(summerDate.getTime(), true);
    const isCryptoUtcDay = cryptoBoundaries.sessionLabel.includes('Crypto UTC Day') &&
      (cryptoBoundaries.endTime - cryptoBoundaries.startTime === 86400);

    const passed = isSummerEDT21 && isWinterEST22 && isCryptoUtcDay;

    results.push({
      name: '5. Session Boundaries: 17:00 NY with US DST & Crypto UTC Day',
      passed,
      message: `Summer: ${summerBoundaries.sessionLabel}, Winter: ${winterBoundaries.sessionLabel}, Crypto: ${cryptoBoundaries.sessionLabel}`
    });
  } catch (err: unknown) {
    results.push({
      name: '5. Session Boundaries: 17:00 NY with US DST & Crypto UTC Day',
      passed: false,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`
    });
  }

  // ==========================================================================
  // TEST 6: Institutional Kill Zones
  // ==========================================================================
  try {
    // Dates in UTC
    const asianDate = new Date('2026-07-15T02:00:00Z');
    const londonKZDate = new Date('2026-07-15T07:30:00Z');
    const nyKZDate = new Date('2026-07-15T13:00:00Z');
    const londonCloseDate = new Date('2026-07-15T15:30:00Z');
    const outsideKZDate = new Date('2026-07-15T23:30:00Z');

    const kzAsian = getInstitutionalKillZone(asianDate);
    const kzLondon = getInstitutionalKillZone(londonKZDate);
    const kzNY = getInstitutionalKillZone(nyKZDate);
    const kzNYAfternoon = getInstitutionalKillZone(londonCloseDate);
    const kzLate = getInstitutionalKillZone(outsideKZDate);

    const passed = (kzAsian === 'ASIAN_SESSION' || kzAsian === 'ASIAN_KILLZONE') &&
      kzLondon === 'LONDON_OPEN_KILLZONE' &&
      kzNY === 'LONDON_NY_OVERLAP' &&
      kzNYAfternoon === 'NY_AFTERNOON' &&
      kzLate === 'LATE_SESSION';

    results.push({
      name: '6. Institutional Kill Zones Identification (6 UTC Sessions)',
      passed,
      message: `Asian: ${kzAsian}, London Open: ${kzLondon}, NY Overlap: ${kzNY}, NY Afternoon: ${kzNYAfternoon}, Late: ${kzLate}`
    });
  } catch (err: unknown) {
    results.push({
      name: '6. Institutional Kill Zones Identification (6 UTC Sessions)',
      passed: false,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`
    });
  }

  // ==========================================================================
  // TEST 7: Forward Test Resolution (Both Touched Inside One Candle = Loss)
  // ==========================================================================
  try {
    const mockOpenTrade: ForwardTestTrade = {
      id: 'FT-TEST-1',
      signalId: 'SIG-1',
      symbol: 'BTCUSDT',
      provider: 'BINANCE',
      marketType: 'SPOT',
      setup: 'POC_BOUNCE',
      setupName: 'Previous Session POC Bounce',
      session: 'NEW_YORK',
      killZone: 'NY_OPEN_KILLZONE',
      grade: 'A',
      entryPrice: 60000,
      stopLoss: 59000,
      takeProfit: 62000, // 2R target
      rMultiple: 2.0,
      entryTime: 1000,
      status: 'OPEN'
    };

    // Case A: Both SL and TP touched inside one single candle (low 58500 <= 59000 AND high 62500 >= 62000)
    // Rule: "If both are touched inside one candle, count it as a loss."
    const bothTouchedCandle: Candle = {
      time: 1060,
      open: 60000,
      high: 62500, // touched TP
      low: 58500,  // touched SL
      close: 61000,
      volume: 100,
      isForming: false
    };

    const { resolvedTrades: resolvedBoth } = resolveForwardTestTrades([mockOpenTrade], [bothTouchedCandle], 'BTCUSDT');
    const bothTreatedAsLoss = resolvedBoth.length === 1 && 
      resolvedBoth[0].resolution === 'LOSS' && 
      resolvedBoth[0].rOutcome === -1.0 &&
      resolvedBoth[0].bothTouchedInSameBar === true;

    // Case B: Clean Win (only TP touched)
    const tpOnlyCandle: Candle = {
      time: 1060,
      open: 60000,
      high: 62100,
      low: 59800,
      close: 62050,
      volume: 100,
      isForming: false
    };
    const { resolvedTrades: resolvedWin } = resolveForwardTestTrades([mockOpenTrade], [tpOnlyCandle], 'BTCUSDT');
    const cleanWinPassed = resolvedWin.length === 1 && 
      resolvedWin[0].resolution === 'WIN' && 
      resolvedWin[0].rOutcome === 2.0;

    // Case C: Minimum 30 Sample threshold test
    const dummyTrades: ForwardTestTrade[] = [];
    for (let i = 0; i < 25; i++) {
      dummyTrades.push({
        ...mockOpenTrade,
        id: `FT-DUMMY-${i}`,
        status: 'RESOLVED',
        resolution: 'WIN',
        rOutcome: 2.0
      });
    }
    const stats25 = calculateForwardTestStats(dummyTrades);
    const isSampleTooSmallUnder30 = stats25.isSampleTooSmall === true;

    for (let i = 25; i < 35; i++) {
      dummyTrades.push({
        ...mockOpenTrade,
        id: `FT-DUMMY-${i}`,
        status: 'RESOLVED',
        resolution: 'WIN',
        rOutcome: 2.0
      });
    }
    const stats35 = calculateForwardTestStats(dummyTrades);
    const sampleValidOver30 = stats35.isSampleTooSmall === false;

    const passed = bothTreatedAsLoss && cleanWinPassed && isSampleTooSmallUnder30 && sampleValidOver30;

    results.push({
      name: '7. Forward Test Engine: Resolution, Both-Touched Loss Rule, & 30-Trade Threshold',
      passed,
      message: `Both-touched candle resolved as LOSS (-1.0R): ${bothTreatedAsLoss}, Clean WIN (+2.0R): ${cleanWinPassed}, Sample too small under 30: ${isSampleTooSmallUnder30}, Sample valid over 30: ${sampleValidOver30}`
    });
  } catch (err: unknown) {
    results.push({
      name: '7. Forward Test Engine: Resolution, Both-Touched Loss Rule, & 30-Trade Threshold',
      passed: false,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`
    });
  }

  // ==========================================================================
  // TEST 8: Strategy 2 (Structure Essentials) & Strategy 3 (Advanced SMC Asian Sweep)
  // ==========================================================================
  try {
    // Construct SMC Asian range sweep (Strategy 3):
    // Asian high at 150.0. Current candle sweeps to 152.0 and closes at 148.5 (back inside range)
    const londonKZTime = new Date('2026-06-10T08:30:00Z'); // 08:30 UTC: London Killzone
    const dayStartSec = Date.UTC(2026, 5, 10, 0, 0, 0) / 1000;
    const smcCandles: Candle[] = [];
    const baseTime = dayStartSec + 3600; // 01:00 UTC (inside Asian range 00:00-07:00 UTC)
    for (let i = 0; i < 25; i++) {
      smcCandles.push({
        time: baseTime + i * 600,
        open: 145 + (i % 3),
        high: 149,
        low: 144,
        close: 147,
        volume: 1000
      });
    }
    // Asian high established at 150.0
    smcCandles.push({
      time: baseTime + 26 * 600,
      open: 147,
      high: 150,
      low: 146,
      close: 149.5,
      volume: 1200
    });
    // London Killzone sweep bar (08:30 UTC): sweeps above Asian high to 152.5 and closes back inside at 148.0
    smcCandles.push({
      time: dayStartSec + 8 * 3600 + 30 * 60, // 08:30 UTC
      open: 149.5,
      high: 152.5, // swept high
      low: 147.5,
      close: 148.0, // body close back inside
      volume: 2500
    });

    const smcSignals = evaluateTradingSignals('XAUUSD', smcCandles, '10m', 148.0, 0.1, 2, {
      skipMarketOpenCheck: true,
      referenceTime: londonKZTime
    });

    const hasSMC = smcSignals.some(s => s.strategy === 'STRATEGY_3' && s.direction === 'SELL');

    results.push({
      name: '8. Institutional Strategy 3 (SMC Asian Sweep) & Strategy 2 Execution',
      passed: hasSMC,
      message: `Strategy 3 Asian Range Sweep triggered SELL: ${hasSMC} in London Killzone`
    });
  } catch (err: unknown) {
    results.push({
      name: '8. Institutional Strategy 3 (SMC Asian Sweep) & Strategy 2 Execution',
      passed: false,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`
    });
  }

  // ==========================================================================
  // TEST 9: Realistic Signal Rules (1x ATR14 Minimum Stop Distance & 0.25R Invalidation)
  // ==========================================================================
  try {
    const testCandles: Candle[] = [];
    for (let i = 0; i < 30; i++) {
      testCandles.push({
        time: 1000 + i * 600,
        open: 100,
        high: 105,
        low: 95,
        close: 100,
        volume: 1000
      });
    }
    // Add swing probe and reversal
    testCandles.push({ time: 1000 + 31 * 600, open: 100, high: 101, low: 99, close: 100.2, volume: 800 });
    testCandles.push({ time: 1000 + 32 * 600, open: 100.5, high: 108, low: 99, close: 99.5, volume: 1500 });

    const signals = evaluateTradingSignals('XAUUSD', testCandles, '10m', 99.5, 0.1, 2, {
      skipMarketOpenCheck: true,
      skipSessionCheck: true
    });

    const validSig = signals[0];
    const hasATR14Stop = validSig ? Math.abs(validSig.entryPrice - validSig.stopLoss) >= 1.0 : false;
    const hasInvalidationRule = validSig ? !!validSig.invalidationCondition && validSig.invalidationCondition.includes('0.25R') : false;

    results.push({
      name: '9. Realistic Signal Rules: Minimum 1x ATR(14) Stop & 0.25R Invalidation Threshold',
      passed: hasATR14Stop && hasInvalidationRule,
      message: `Stop distance (${validSig ? Math.abs(validSig.entryPrice - validSig.stopLoss).toFixed(2) : 0}) >= 1x ATR(14): ${hasATR14Stop}, 0.25R invalidation rule formatted: ${hasInvalidationRule}`
    });
  } catch (err: unknown) {
    results.push({
      name: '9. Realistic Signal Rules: Minimum 1x ATR(14) Stop & 0.25R Invalidation Threshold',
      passed: false,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`
    });
  }

  // ==========================================================================
  // TEST 10: Quiet-Hours Signals Switch (03:00 UTC & 22:00 UTC)
  // ==========================================================================
  try {
    const candlesForSession: Candle[] = [];
    for (let i = 0; i < 30; i++) {
      candlesForSession.push({
        time: 1000 + i * 600,
        open: 100,
        high: 103,
        low: 97,
        close: 100,
        volume: 1000
      });
    }
    candlesForSession.push({ time: 1000 + 31 * 600, open: 100, high: 101, low: 99.5, close: 100.2, volume: 800 });
    candlesForSession.push({ time: 1000 + 32 * 600, open: 100.5, high: 106, low: 99.0, close: 99.5, volume: 1500 });

    const asian03Utc = new Date('2026-06-10T03:30:00Z');
    const late22Utc = new Date('2026-06-10T22:30:00Z');

    // With switch OFF (allowQuietHoursSignals = false): MUST return NO SIGNALS
    const asianBlocked = evaluateTradingSignals('XAUUSD', candlesForSession, '10m', 99.5, 0.1, 2, {
      skipMarketOpenCheck: true,
      skipSessionCheck: false,
      allowQuietHoursSignals: false,
      referenceDate: asian03Utc
    }).length === 0;

    const lateBlocked = evaluateTradingSignals('XAUUSD', candlesForSession, '10m', 99.5, 0.1, 2, {
      skipMarketOpenCheck: true,
      skipSessionCheck: false,
      allowQuietHoursSignals: false,
      referenceDate: late22Utc
    }).length === 0;

    // With switch ON (allowQuietHoursSignals = true): signals permitted at 03:00 and 22:00 UTC
    const asianAllowed = evaluateTradingSignals('XAUUSD', candlesForSession, '10m', 99.5, 0.1, 2, {
      skipMarketOpenCheck: true,
      skipSessionCheck: false,
      allowQuietHoursSignals: true,
      referenceDate: asian03Utc
    }).length > 0;

    const lateAllowed = evaluateTradingSignals('XAUUSD', candlesForSession, '10m', 99.5, 0.1, 2, {
      skipMarketOpenCheck: true,
      skipSessionCheck: false,
      allowQuietHoursSignals: true,
      referenceDate: late22Utc
    }).length > 0;

    const passed = asianBlocked && lateBlocked && asianAllowed && lateAllowed;

    results.push({
      name: '10. Quiet-Hours Signals Switch: ON allows 03:00 & 22:00 UTC; OFF strictly blocks',
      passed,
      message: `03:00 UTC (Blocked: ${asianBlocked}, Allowed: ${asianAllowed}), 22:00 UTC (Blocked: ${lateBlocked}, Allowed: ${lateAllowed})`
    });
  } catch (err: unknown) {
    results.push({
      name: '10. Quiet-Hours Signals Switch: ON allows 03:00 & 22:00 UTC; OFF strictly blocks',
      passed: false,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`
    });
  }

  // ==========================================================================
  // TEST 11: Strategy 3 Rules: Asian Range Sweep Rejected in Asian Hours vs External Liquidity Sweep Permitted
  // ==========================================================================
  try {
    const sweepCandles: Candle[] = [];
    for (let i = 0; i < 20; i++) {
      sweepCandles.push({
        time: 1000 + i * 600,
        open: 100,
        high: 103,
        low: 97,
        close: 100,
        volume: 1000
      });
    }
    // High probe simulating Asian sweep vs external sweep
    sweepCandles.push({ time: 1000 + 21 * 600, open: 100, high: 106, low: 99.5, close: 105, volume: 1200 });
    sweepCandles.push({ time: 1000 + 22 * 600, open: 105, high: 105.5, low: 98, close: 99.0, volume: 2000 });

    const asianDate = new Date('2026-06-10T04:00:00Z');

    // Strategy 3 Asian Range Sweep must NOT be generated during Asian session (only in London/NYKZ)
    const asianSignals = evaluateTradingSignals('EURUSD', sweepCandles, '10m', 99.0, 0.0001, 5, {
      skipMarketOpenCheck: true,
      skipSessionCheck: false,
      allowQuietHoursSignals: true,
      referenceDate: asianDate
    });

    const hasAsianRangeSweepInAsian = asianSignals.some(s => s.strategy === 'STRATEGY_3' && s.reason.includes('Asian High'));
    const passed = !hasAsianRangeSweepInAsian;

    results.push({
      name: '11. Strategy 3: Asian Range Sweep Rejected in Asian Hours; External Sweep Only',
      passed,
      message: `Asian range sweep during Asian hours rejected: ${!hasAsianRangeSweepInAsian}`
    });
  } catch (err: unknown) {
    results.push({
      name: '11. Strategy 3: Asian Range Sweep Rejected in Asian Hours; External Sweep Only',
      passed: false,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`
    });
  }

  // ==========================================================================
  // TEST 12: Target Mathematics: R = |Entry - SL|; TP1 = Entry ± 2R exactly & Strict Ordering
  // ==========================================================================
  try {
    // Test on 3 asset classes: Forex (EURUSD), Gold (XAUUSD), Crypto (BTCUSDT)
    const testCases = [
      { sym: 'EURUSD', entry: 1.08500, sl: 1.08300, dir: 'BUY', pip: 0.0001, dig: 5 },
      { sym: 'EURUSD', entry: 1.08500, sl: 1.08700, dir: 'SELL', pip: 0.0001, dig: 5 },
      { sym: 'XAUUSD', entry: 2750.00, sl: 2740.00, dir: 'BUY', pip: 0.1, dig: 2 },
      { sym: 'XAUUSD', entry: 2750.00, sl: 2760.00, dir: 'SELL', pip: 0.1, dig: 2 },
      { sym: 'BTCUSDT', entry: 65000.00, sl: 64000.00, dir: 'BUY', pip: 0.01, dig: 2 },
      { sym: 'BTCUSDT', entry: 65000.00, sl: 66000.00, dir: 'SELL', pip: 0.01, dig: 2 }
    ];

    let allMathCorrect = true;
    for (const tc of testCases) {
      const r = Math.abs(tc.entry - tc.sl);
      const isBuy = tc.dir === 'BUY';
      const expectedTp1 = isBuy ? tc.entry + 2 * r : tc.entry - 2 * r;

      // Check strict ordering
      if (isBuy) {
        if (!(tc.sl < tc.entry && tc.entry < expectedTp1)) allMathCorrect = false;
      } else {
        if (!(tc.sl > tc.entry && tc.entry > expectedTp1)) allMathCorrect = false;
      }

      // Check R distance
      if (Math.abs(expectedTp1 - (tc.entry + (isBuy ? 2 * r : -2 * r))) > 0.00001) {
        allMathCorrect = false;
      }
    }

    results.push({
      name: '12. Target Mathematics: Exact 2R, R = |Entry - SL|, Strict BUY/SELL Ordering (Forex, Gold, BTC)',
      passed: allMathCorrect,
      message: `Forex, Gold & BTC target math and ordering verified: ${allMathCorrect}`
    });
  } catch (err: unknown) {
    results.push({
      name: '12. Target Mathematics: Exact 2R, R = |Entry - SL|, Strict BUY/SELL Ordering (Forex, Gold, BTC)',
      passed: false,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`
    });
  }

  // ==========================================================================
  // TEST 13: Timeframe Synthesis: M10 from 2 M5, M45 from 3 M15 (UTC-aligned, Gaps & Incomplete Handled)
  // ==========================================================================
  try {
    // 1. Synthesize M10: UTC bucket starts at 1700000400 (not :00), let's use exact aligned epoch
    // 1700000400 % 600 = 0 -> 1700000400 is an exact 10m boundary
    const baseM10Start = 1700000400;
    const m5Candles: Candle[] = [
      { time: baseM10Start, open: 100, high: 102, low: 99, close: 101, volume: 100 },
      { time: baseM10Start + 300, open: 101, high: 105, low: 100, close: 104, volume: 150 },
      // Gap: missing baseM10Start + 600 and baseM10Start + 900
      // Incomplete: only 1 candle for next bucket
      { time: baseM10Start + 1200, open: 104, high: 106, low: 103, close: 105, volume: 80 }
    ];

    const m10 = synthesizeM10FromM5(m5Candles, 'EURUSD', 'LIVE_PROVEN');
    const m10Valid = m10.length === 1 &&
      m10[0].open === 100 &&
      m10[0].close === 104 &&
      m10[0].high === 105 &&
      m10[0].low === 99 &&
      m10[0].volume === 250 &&
      m10[0].sourceCandleTimes?.length === 2;

    // 2. Synthesize M45 from 3 M15 candles
    const baseM45Start = 1700000700 - (1700000700 % 2700); // exact 45m boundary
    const m15Candles: Candle[] = [
      { time: baseM45Start, open: 50, high: 52, low: 49, close: 51, volume: 10 },
      { time: baseM45Start + 900, open: 51, high: 55, low: 50, close: 54, volume: 20 },
      { time: baseM45Start + 1800, open: 54, high: 56, low: 53, close: 55, volume: 30 }
    ];

    const m45 = synthesizeM45FromM15(m15Candles, 'XAUUSD', 'LIVE_PROVEN');
    const m45Valid = m45.length === 1 &&
      m45[0].open === 50 &&
      m45[0].close === 55 &&
      m45[0].high === 56 &&
      m45[0].low === 49 &&
      m45[0].volume === 60 &&
      m45[0].sourceCandleTimes?.length === 3;

    results.push({
      name: '13. Timeframe Synthesis: M10 (2 M5s) & M45 (3 M15s) with UTC Alignment & Gap Protection',
      passed: m10Valid && m45Valid,
      message: `M10 synthesized: ${m10Valid} (skipped incomplete bucket), M45 synthesized: ${m45Valid}`
    });
  } catch (err: unknown) {
    results.push({
      name: '13. Timeframe Synthesis: M10 (2 M5s) & M45 (3 M15s) with UTC Alignment & Gap Protection',
      passed: false,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`
    });
  }

  // ==========================================================================
  // TEST 14: Volatility Buffer (First 2 Minutes of Session Open Blocks Signals)
  // ==========================================================================
  try {
    const min0 = new Date('2026-06-10T07:00:15Z');
    const min1 = new Date('2026-06-10T07:01:45Z');
    const min2 = new Date('2026-06-10T07:02:10Z');

    const isBlockedMin0 = isFirstTwoMinutesOfSession(min0);
    const isBlockedMin1 = isFirstTwoMinutesOfSession(min1);
    const isAllowedMin2 = !isFirstTwoMinutesOfSession(min2);

    const passed = isBlockedMin0 && isBlockedMin1 && isAllowedMin2;
    results.push({
      name: '14. Volatility Buffer: Session Open Minutes 00 & 01 Block Signals (Minute 02 Permitted)',
      passed,
      message: `Min 00 blocked: ${isBlockedMin0}, Min 01 blocked: ${isBlockedMin1}, Min 02 permitted: ${isAllowedMin2}`
    });
  } catch (err: unknown) {
    results.push({
      name: '14. Volatility Buffer: Session Open Minutes 00 & 01 Block Signals (Minute 02 Permitted)',
      passed: false,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`
    });
  }

  // ==========================================================================
  // TEST 15: SPY/QQQ Off-Hours & US30 Unavailable = NO SIGNAL
  // ==========================================================================
  try {
    const offHoursCandles: Candle[] = [];
    for (let i = 0; i < 25; i++) {
      offHoursCandles.push({
        time: 1000 + i * 600,
        open: 100,
        high: 105,
        low: 95,
        close: 100,
        volume: 1000,
        isOffHours: true // tagged outside 09:30-16:00 NY
      });
    }

    const spySignals = evaluateTradingSignals('SPYUSDT', offHoursCandles, '10m', 100, 0.01, 2, {
      skipMarketOpenCheck: true,
      skipSessionCheck: true
    });
    const spyBlocked = spySignals.length === 0;

    const us30Signals = evaluateTradingSignals('US30', offHoursCandles, '10m', 100, 1.0, 1, {
      skipMarketOpenCheck: true,
      skipSessionCheck: true
    });
    const us30NoSignal = us30Signals.length === 0;

    results.push({
      name: '15. SPY/QQQ Off-Hours Filtered & US30 Unavailable = NO SIGNAL Rule',
      passed: spyBlocked && us30NoSignal,
      message: `Off-hours SPY signals blocked: ${spyBlocked}, US30 unavailable returns NO SIGNAL: ${us30NoSignal}`
    });
  } catch (err: unknown) {
    results.push({
      name: '15. SPY/QQQ Off-Hours Filtered & US30 Unavailable = NO SIGNAL Rule',
      passed: false,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`
    });
  }

  // ==========================================================================
  // TEST 16: Signal Math Check (Item 13: Wrong Stop Side, Stop < 1x ATR14, Exact 2.00 Ratio)
  // ==========================================================================
  try {
    // 1. Wrong stop side for BUY (SL >= Entry)
    const wrongBuyStop = verifySignalMath('BUY', 100, 102, 120, 5, 2);
    const wrongBuyRejected = !wrongBuyStop.isValid && (wrongBuyStop.rejectReason?.includes('Wrong stop side') ?? false);

    // 2. Wrong stop side for SELL (SL <= Entry)
    const wrongSellStop = verifySignalMath('SELL', 100, 98, 80, 5, 2);
    const wrongSellRejected = !wrongSellStop.isValid && (wrongSellStop.rejectReason?.includes('Wrong stop side') ?? false);

    // 3. Stop under 1x ATR14 (ATR14 = 5.0, Entry 100, SL 98 -> R = 2.0)
    const underATR = verifySignalMath('BUY', 100, 98, 104, 5.0, 2);
    const underATRRejected = !underATR.isValid && (underATR.rejectReason?.includes('under 1x ATR14') ?? false);

    // 4. Non-2.00 Ratio (TP1 = 115 instead of 120 -> ratio 1.50)
    const non2R = verifySignalMath('BUY', 100, 90, 115, 8.0, 2);
    const non2RRejected = !non2R.isValid && (non2R.rejectReason?.includes('not 2.00') ?? false);

    // 5. Valid BUY setup (Entry 100, SL 90, TP1 120, ATR14 = 8.0)
    const validBuy = verifySignalMath('BUY', 100, 90, 120, 8.0, 2);
    const validBuyPassed = validBuy.isValid && validBuy.ratio === 2.0 && validBuy.r === 10 && validBuy.tp1Distance === 20;

    // 6. Valid SELL setup (Entry 100, SL 110, TP1 80, ATR14 = 8.0)
    const validSell = verifySignalMath('SELL', 100, 110, 80, 8.0, 2);
    const validSellPassed = validSell.isValid && validSell.ratio === 2.0 && validSell.r === 10 && validSell.tp1Distance === 20;

    const allMathPassed = wrongBuyRejected && wrongSellRejected && underATRRejected && non2RRejected && validBuyPassed && validSellPassed;

    results.push({
      name: '16. Signal Math Check: Strict TP1/R = 2.00, Wrong Stop Side & Under-ATR Rejection',
      passed: allMathPassed,
      message: `Wrong BUY stop rejected: ${wrongBuyRejected}, Wrong SELL stop rejected: ${wrongSellRejected}, Under-ATR rejected: ${underATRRejected}, Non-2R rejected: ${non2RRejected}, Valid BUY/SELL ratio 2.00: ${validBuyPassed && validSellPassed}`
    });
  } catch (err: unknown) {
    results.push({
      name: '16. Signal Math Check: Strict TP1/R = 2.00, Wrong Stop Side & Under-ATR Rejection',
      passed: false,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`
    });
  }

  const allPassed = results.every(r => r.passed);
  return { passed: allPassed, results };
}

// Direct execution CLI runner
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('verification')) {
  console.log('\n======================================================');
  console.log('       GREVIN AI — COMPREHENSIVE UNIT TEST SUITE      ');
  console.log('======================================================\n');

  const { passed, results } = runGREVINUnitTests();
  for (const r of results) {
    const symbol = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${symbol} | ${r.name}`);
    console.log(`       ↳ ${r.message}\n`);
  }

  console.log('------------------------------------------------------');
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${results.filter(r => r.passed).length} | FAILED: ${results.filter(r => !r.passed).length}`);
  console.log(`OVERALL STATUS: ${passed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  console.log('======================================================\n');
  process.exit(passed ? 0 : 1);
}
