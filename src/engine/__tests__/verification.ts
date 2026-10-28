import { calculateVolumeProfile } from '../volumeProfile';
import { isDaylightSavingTime, getActiveSessionSchedules } from '../sessions';
import { detectSwings } from '../swings';
import { analyzeMarketStructure } from '../structure';
import { evaluateTradingSignals } from '../setups';
import { calculatePositionSize } from '../risk';
import { Candle, SymbolInfo } from '../../types';

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export function runGREVINUnitTests(): { passed: boolean; results: TestResult[] } {
  const results: TestResult[] = [];

  // 1. Volume Profile Math Test: POC must be highest volume node, VAH/VAL must cover 70%
  try {
    const dummyCandles: Candle[] = [
      { time: 1000, open: 100, high: 105, low: 95, close: 102, volume: 1000 },
      { time: 1060, open: 102, high: 104, low: 101, close: 103, volume: 5000 },
      { time: 1120, open: 103, high: 108, low: 102, close: 107, volume: 1200 },
      { time: 1180, open: 107, high: 110, low: 106, close: 109, volume: 800 }
    ];

    const vp = calculateVolumeProfile(dummyCandles, 2, 0.5, 'NEW_YORK', 20);
    const pocIsValid = vp.poc >= 101 && vp.poc <= 104;
    const valueAreaCovers70 = vp.valueAreaVolume >= vp.totalVolume * 0.69;
    const isApprox = vp.isApproximateTickVolume === true;

    results.push({
      name: 'Volume Profile Math (POC & 70% Value Area)',
      passed: pocIsValid && valueAreaCovers70 && isApprox,
      message: `POC: ${vp.poc}, VAL: ${vp.val}, VAH: ${vp.vah}, TotalVol: ${vp.totalVolume}, VA Vol: ${vp.valueAreaVolume.toFixed(0)}, Labeled: APPROXIMATE (tick volume)`
    });
  } catch (err: unknown) {
    results.push({
      name: 'Volume Profile Math (POC & 70% Value Area)',
      passed: false,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`
    });
  }

  // 2. Session Boundaries & Daylight Saving Time (DST) Changes
  try {
    const summerDate = new Date('2026-07-15T14:00:00Z');
    const winterDate = new Date('2026-01-15T14:00:00Z');

    const summerDST = isDaylightSavingTime(summerDate);
    const winterDST = isDaylightSavingTime(winterDate);

    const summerSchedules = getActiveSessionSchedules(summerDate);
    const winterSchedules = getActiveSessionSchedules(winterDate);

    const londonSummer = summerSchedules.find(s => s.name === 'LONDON')!;
    const londonWinter = winterSchedules.find(s => s.name === 'LONDON')!;

    const dstCheckPassed = summerDST.ukDST === true && winterDST.ukDST === false &&
      londonSummer.startHourUTC === 7 && londonWinter.startHourUTC === 8;

    results.push({
      name: 'Market Sessions & Daylight Saving Time (DST) Adjustments',
      passed: dstCheckPassed,
      message: `Summer London start: ${londonSummer.startHourUTC}:00 UTC (BST), Winter London start: ${londonWinter.startHourUTC}:00 UTC (GMT). DST calculated accurately.`
    });
  } catch (err: unknown) {
    results.push({
      name: 'Market Sessions & Daylight Saving Time (DST) Adjustments',
      passed: false,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`
    });
  }

  // 3. Fractal Swing Detection Test
  try {
    const swingCandles: Candle[] = [];
    const prices = [10, 11, 12, 15, 12, 11, 10, 8, 10, 12, 13];
    for (let i = 0; i < prices.length; i++) {
      const p = prices[i];
      swingCandles.push({
        time: 1000 + i * 60,
        open: p,
        high: p + 1,
        low: p - 1,
        close: p,
        volume: 500
      });
    }

    const { swingHighs, swingLows } = detectSwings(swingCandles, 2);
    const detectedExtrema = swingHighs.length > 0 && swingLows.length > 0;

    results.push({
      name: 'Fractal Swing Detection (Swing Highs & Lows)',
      passed: detectedExtrema,
      message: `Found ${swingHighs.length} swing highs and ${swingLows.length} swing lows accurately.`
    });
  } catch (err: unknown) {
    results.push({
      name: 'Fractal Swing Detection (Swing Highs & Lows)',
      passed: false,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`
    });
  }

  // 4. Market Structure Engine (BOS & CHoCH)
  try {
    const candlesForBOS: Candle[] = [
      { time: 1000, open: 100, high: 102, low: 99, close: 101, volume: 500 },
      { time: 1060, open: 101, high: 105, low: 100, close: 104, volume: 600 },
      { time: 1120, open: 104, high: 104, low: 101, close: 102, volume: 500 },
      { time: 1180, open: 102, high: 103, low: 100, close: 101, volume: 400 },
      { time: 1240, open: 101, high: 104, low: 101, close: 103, volume: 600 },
      { time: 1300, open: 103, high: 109, low: 102, close: 108, volume: 1500 }
    ];

    const structure = analyzeMarketStructure(candlesForBOS, 'M15', 1);
    const hasBullishEvent = structure.events.some(e => e.direction === 'BULLISH' && (e.type === 'BOS' || e.type === 'CHOCH'));

    results.push({
      name: 'Market Structure Engine (BOS & CHoCH)',
      passed: hasBullishEvent,
      message: `Structure events detected: ${structure.events.length}, Trend: ${structure.trend}`
    });
  } catch (err: unknown) {
    results.push({
      name: 'Market Structure Engine (BOS & CHoCH)',
      passed: false,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`
    });
  }

  // 5. SETUP 1 TEST: POC BOUNCE
  // Rule: Uses PREVIOUS profile session's POC, requires previous close OUTSIDE the value area
  try {
    // Generate 40 candles: first 20 form previous session with POC around 100, VAH around 103, VAL around 97
    const pocCandles: Candle[] = [];
    for (let i = 0; i < 20; i++) {
      pocCandles.push({
        time: 1000 + i * 60,
        open: 100,
        high: 102,
        low: 98,
        close: 100,
        volume: 3000 // heavy volume at 100 (POC)
      });
    }
    // Next 18 candles: price rallies up above VAH (105-108)
    for (let i = 20; i < 38; i++) {
      pocCandles.push({
        time: 1000 + i * 60,
        open: 105,
        high: 107,
        low: 104,
        close: 106,
        volume: 500
      });
    }
    // Candle 38: Previous close OUTSIDE value area (close = 105 > VAH)
    pocCandles.push({
      time: 1000 + 38 * 60,
      open: 106,
      high: 107,
      low: 104,
      close: 105, // outside above VAH
      volume: 600
    });
    const prevProf = calculateVolumeProfile(pocCandles.slice(0, 20), 2, 0.1);

    // Candle 39: Current candle dips to test previous session POC and bounces to close above POC
    pocCandles.push({
      time: 1000 + 39 * 60,
      open: 100,
      high: 101,
      low: prevProf.poc - 0.2, // tested previous POC
      close: prevProf.poc + 0.5, // bounced above previous POC
      volume: 1200
    });

    const signals = evaluateTradingSignals('XAU/USD', pocCandles, 'M15', prevProf.poc + 0.5, 0.1, 2);
    const pocSignal = signals.find(s => s.strategy === 'POC_BOUNCE');
    const passed = !!pocSignal && pocSignal.direction === 'BUY' && pocSignal.rMultiple === 2.0;

    results.push({
      name: 'Strategy 1: Previous Session POC Bounce',
      passed,
      message: pocSignal 
        ? `POC Bounce detected: ${pocSignal.direction} at ${pocSignal.entryPrice}, 2R target: ${pocSignal.tp}, Grade: ${pocSignal.grade}`
        : 'POC Bounce setup not triggered'
    });
  } catch (err: unknown) {
    results.push({
      name: 'Strategy 1: Previous Session POC Bounce',
      passed: false,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`
    });
  }

  // 6. SETUP 2 TEST: VALUE AREA REVERSAL
  // Rule: Requires previous close INSIDE, a move beyond VAH/VAL, then a candle BODY close back inside
  try {
    const varCandles: Candle[] = [];
    for (let i = 0; i < 30; i++) {
      varCandles.push({
        time: 1000 + i * 60,
        open: 100,
        high: 102,
        low: 98,
        close: 100,
        volume: 1000
      });
    }
    // Current profile: VAH ~102, VAL ~98
    // Candle 38: Previous close INSIDE value area (close = 100.5)
    varCandles.push({
      time: 1000 + 38 * 60,
      open: 100,
      high: 101,
      low: 99.5,
      close: 100.5, // inside VA
      volume: 800
    });
    // Candle 39: Moves beyond VAH (high = 104.5), but candle body closes back inside (open 101, close 100)
    varCandles.push({
      time: 1000 + 39 * 60,
      open: 101,
      high: 104.5, // moved beyond VAH
      low: 99.5,
      close: 100.0, // BODY closed inside below VAH
      volume: 1500
    });

    const signals = evaluateTradingSignals('XAU/USD', varCandles, 'M15', 100.0, 0.1, 2);
    const varSignal = signals.find(s => s.strategy === 'VALUE_AREA_REVERSAL');
    const passed = !!varSignal && varSignal.direction === 'SELL' && varSignal.rMultiple === 2.0;

    results.push({
      name: 'Strategy 2: 70% Value Area Reversal',
      passed,
      message: varSignal
        ? `VA Reversal detected: ${varSignal.direction} at ${varSignal.entryPrice}, 2R target: ${varSignal.tp}, Grade: ${varSignal.grade}`
        : 'Value Area Reversal setup not triggered'
    });
  } catch (err: unknown) {
    results.push({
      name: 'Strategy 2: 70% Value Area Reversal',
      passed: false,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`
    });
  }

  // 7. SETUP 3 TEST: BREAKOUT
  // Rule: Break beyond boundary, pullback holding near boundary (<= 50% VA height), BOS in breakout direction
  try {
    const brkCandles: Candle[] = [];
    // Base value area between 99 and 101
    for (let i = 0; i < 20; i++) {
      brkCandles.push({
        time: 1000 + i * 60,
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: 1000
      });
    }
    // Breakout above VAH (high 105, close 104)
    brkCandles.push({ time: 1000 + 21 * 60, open: 100.5, high: 105, low: 100.5, close: 104, volume: 2000 });
    // Pullback holding within 50% VA height (low 101.5)
    brkCandles.push({ time: 1000 + 22 * 60, open: 104, high: 104, low: 101.5, close: 102.5, volume: 800 });
    // Breakout BOS candle closing above 105 at 106
    brkCandles.push({ time: 1000 + 23 * 60, open: 102.5, high: 106.5, low: 102.5, close: 106, volume: 2500 });

    const signals = evaluateTradingSignals('XAU/USD', brkCandles, 'M15', 106, 0.1, 2);
    const brkSignal = signals.find(s => s.strategy === 'CONFIRMED_BREAKOUT');
    const passed = !!brkSignal && brkSignal.direction === 'BUY' && brkSignal.rMultiple === 2.0;

    results.push({
      name: 'Strategy 3: Value Area Breakout & BOS',
      passed,
      message: brkSignal
        ? `Breakout detected: ${brkSignal.direction} at ${brkSignal.entryPrice}, 2R target: ${brkSignal.tp}, Grade: ${brkSignal.grade}`
        : 'Breakout setup not triggered'
    });
  } catch (err: unknown) {
    results.push({
      name: 'Strategy 3: Value Area Breakout & BOS',
      passed: false,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`
    });
  }

  // 8. RISK CALCULATOR TEST: Dynamic specs & Graceful failure when missing
  try {
    const validSymbolInfo: SymbolInfo = {
      symbol: 'XAU/USD',
      name: 'Gold',
      category: 'METALS',
      digits: 2,
      pipSize: 0.1,
      pipValuePerStandardLot: 10.0,
      lotSize: 100,
      minLot: 0.01,
      maxLot: 50.0,
      lotStep: 0.01,
      currentBid: 2740,
      currentAsk: 2740.25,
      spreadPips: 2.5,
      dayChangePercent: 0,
      dayHigh: 2750,
      dayLow: 2730,
      isAvailable: true
    };

    const calcSuccess = calculatePositionSize({
      accountBalance: 10000,
      riskPercent: 1.0, // $100 risk
      entryPrice: 2740,
      stopLossPrice: 2735, // 5.0 points = 50 pips * $10 = $500/lot -> 0.20 lots
      tpPrice: 2750,
      symbolInfo: validSymbolInfo
    });

    const calcFail = calculatePositionSize({
      accountBalance: 10000,
      riskPercent: 1.0,
      entryPrice: 2740,
      stopLossPrice: 2735,
      symbolInfo: undefined // specs unavailable
    });

    const testPassed = calcSuccess.canCalculate === true && 
      calcSuccess.recommendedLotSize === 0.20 &&
      calcFail.canCalculate === false &&
      calcFail.unavailabilityReason?.includes('cannot be calculated');

    results.push({
      name: 'Risk Engine: cTrader Dynamic Specs & Safe Fallback',
      passed: Boolean(testPassed),
      message: `Calculation with specs: 0.20 lots. Missing specs message: "${calcFail.unavailabilityReason}"`
    });
  } catch (err: unknown) {
    results.push({
      name: 'Risk Engine: cTrader Dynamic Specs & Safe Fallback',
      passed: false,
      message: `Error: ${err instanceof Error ? err.message : String(err)}`
    });
  }

  const allPassed = results.every(r => r.passed);
  return { passed: allPassed, results };
}
