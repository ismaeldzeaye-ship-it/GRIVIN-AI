import { 
  Candle, 
  TradingSignal, 
  StrategyType, 
  MarketSessionType, 
  Timeframe, 
  InstitutionalChecklistItem,
  SetupGrade 
} from '../types';
import { calculateVolumeProfile } from './volumeProfile';
import { analyzeMarketStructure } from './structure';
import { getCurrentSession } from './sessions';
import { calculatePips } from '../data/symbolMapping';

/**
 * Calculates documented Setup Grade:
 * Grade A: 100% of checklist passed including all required criteria
 * Grade B: Core setup rules passed with minor secondary confluence missing
 * Grade C: Minimum qualifying setup criteria passed
 */
export function calculateSetupGrade(checklist: InstitutionalChecklistItem[]): SetupGrade {
  const allPassed = checklist.every(c => c.passed);
  const requiredPassed = checklist.filter(c => c.requiredForGradeA).every(c => c.passed);
  const passCount = checklist.filter(c => c.passed).length;

  if (allPassed) return 'A';
  if (requiredPassed && passCount >= checklist.length - 1) return 'B';
  return 'C';
}

/**
 * Institutional Strategy Engine:
 * Exactly evaluates the 3 documented setups:
 * 1. POC Bounce: Uses PREVIOUS profile session's POC, requires previous close OUTSIDE the value area.
 * 2. Value Area Reversal: Requires previous close INSIDE, move beyond VAH/VAL, candle BODY close back inside.
 * 3. Breakout: Requires a break, a pullback holding near boundary (<= 50% of VA height), then BOS in breakout direction.
 * Single default take-profit at 2R.
 */
export function evaluateTradingSignals(
  symbol: string,
  candles: Candle[],
  timeframe: Timeframe = 'M15',
  currentBid?: number,
  pipSize = 0.1,
  digits = 2
): TradingSignal[] {
  if (!candles || candles.length < 20) return [];

  const lastPrice = currentBid || candles[candles.length - 1]?.close || 0;
  if (!lastPrice) return [];

  const currentSessionInfo = getCurrentSession();

  // Divide candles into Current Profile Session and Previous Profile Session (e.g. prior 40 bars vs recent 40 bars)
  const halfWindow = Math.floor(candles.length / 2);
  const prevSessionCandles = candles.slice(0, halfWindow);
  const currentSessionCandles = candles.slice(halfWindow);

  const prevSessionProfile = calculateVolumeProfile(prevSessionCandles, digits, pipSize);
  const currentProfile = calculateVolumeProfile(currentSessionCandles, digits, pipSize);

  const structure = analyzeMarketStructure(candles, timeframe);

  const signals: TradingSignal[] = [];
  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];

  if (!lastCandle || !prevCandle) return signals;

  const vaHeight = Math.max(currentProfile.vah - currentProfile.val, pipSize * 5);

  // --------------------------------------------------------------------------
  // SETUP 1: POC BOUNCE
  // Rules:
  // 1. Uses the PREVIOUS profile session's POC (prevSessionProfile.poc).
  // 2. Previous close must be OUTSIDE the value area (above VAH or below VAL).
  // 3. Tests the previous session POC and bounces.
  // --------------------------------------------------------------------------
  const prevPoc = prevSessionProfile.poc;
  const prevCloseOutsideAbove = prevCandle.close > prevSessionProfile.vah;
  const prevCloseOutsideBelow = prevCandle.close < prevSessionProfile.val;

  const candleTestedPOC = 
    (lastCandle.low <= prevPoc + pipSize * 5 && lastCandle.high >= prevPoc - pipSize * 5) ||
    Math.abs(lastPrice - prevPoc) <= pipSize * 20;

  if (candleTestedPOC) {
    if (prevCloseOutsideAbove) {
      // Approach from above: previous close was outside (above VAH), dips to test previous POC, confirms bounce
      const isBullishBounce = lastCandle.low <= prevPoc + pipSize * 2 && lastCandle.close >= prevPoc;
      if (isBullishBounce) {
        const riskPips = 20;
        const slDist = riskPips * pipSize;
        const stopLoss = Number((prevPoc - slDist).toFixed(digits));
        const tp = Number((lastPrice + 2 * slDist).toFixed(digits)); // Default 2R

        const checklist: InstitutionalChecklistItem[] = [
          {
            id: 'prev-poc-test',
            label: "Test of Previous Profile Session's POC",
            passed: true,
            requiredForGradeA: true,
            detail: `Tested previous session POC at ${prevPoc.toFixed(digits)}`
          },
          {
            id: 'prev-close-outside',
            label: 'Previous Candle Close OUTSIDE Value Area',
            passed: prevCloseOutsideAbove,
            requiredForGradeA: true,
            detail: `Previous close ${prevCandle.close} was above VAH (${prevSessionProfile.vah})`
          },
          {
            id: 'rejection-bounce',
            label: 'Confirmed Bounce in Approach Direction',
            passed: lastCandle.close >= prevPoc,
            requiredForGradeA: true,
            detail: `Candle low ${lastCandle.low} swept POC with close above at ${lastCandle.close}`
          },
          {
            id: 'session-confluence',
            label: 'Active Market Session Timing',
            passed: currentSessionInfo.session !== 'CLOSED',
            requiredForGradeA: false,
            detail: `Session: ${currentSessionInfo.label}`
          }
        ];

        const grade = calculateSetupGrade(checklist);

        signals.push({
          id: `SIG-POC-${symbol.replace('/', '')}-${lastCandle.time}`,
          symbol,
          direction: 'BUY',
          status: 'VALID',
          timeframe,
          confirmationTimeframe: 'M5',
          strategy: 'POC_BOUNCE',
          strategyName: 'Previous Session POC Bounce',
          entryZone: {
            min: Number((prevPoc - pipSize * 2).toFixed(digits)),
            max: Number((prevPoc + pipSize * 2).toFixed(digits))
          },
          entryPrice: lastPrice,
          stopLoss,
          tp,
          riskPips,
          rewardPips: riskPips * 2,
          rMultiple: 2.0,
          grade,
          session: currentSessionInfo.session,
          reason: `Price tested previous profile session POC (${prevPoc.toFixed(digits)}) following close outside value area. Confirmed upward bounce.`,
          timestamp: Date.now(),
          checklist,
          aiAnalysis: `Previous profile session POC at ${prevPoc.toFixed(digits)} held as institutional support after previous close printed outside value area. Target 2R anchored at ${tp}.`
        });
      }
    } else if (prevCloseOutsideBelow) {
      // Approach from below: previous close was outside (below VAL), pushes up to test previous POC, confirms bounce down
      const isBearishBounce = lastCandle.high >= prevPoc && lastCandle.close <= prevPoc;
      if (isBearishBounce) {
        const riskPips = 20;
        const slDist = riskPips * pipSize;
        const stopLoss = Number((prevPoc + slDist).toFixed(digits));
        const tp = Number((lastPrice - 2 * slDist).toFixed(digits)); // Default 2R

        const checklist: InstitutionalChecklistItem[] = [
          {
            id: 'prev-poc-test',
            label: "Test of Previous Profile Session's POC",
            passed: true,
            requiredForGradeA: true,
            detail: `Tested previous session POC at ${prevPoc.toFixed(digits)}`
          },
          {
            id: 'prev-close-outside',
            label: 'Previous Candle Close OUTSIDE Value Area',
            passed: prevCloseOutsideBelow,
            requiredForGradeA: true,
            detail: `Previous close ${prevCandle.close} was below VAL (${prevSessionProfile.val})`
          },
          {
            id: 'rejection-bounce',
            label: 'Confirmed Bounce in Approach Direction',
            passed: lastCandle.close <= prevPoc,
            requiredForGradeA: true,
            detail: `Candle high ${lastCandle.high} tested POC with close below at ${lastCandle.close}`
          },
          {
            id: 'session-confluence',
            label: 'Active Market Session Timing',
            passed: currentSessionInfo.session !== 'CLOSED',
            requiredForGradeA: false,
            detail: `Session: ${currentSessionInfo.label}`
          }
        ];

        const grade = calculateSetupGrade(checklist);

        signals.push({
          id: `SIG-POC-${symbol.replace('/', '')}-${lastCandle.time}`,
          symbol,
          direction: 'SELL',
          status: 'VALID',
          timeframe,
          confirmationTimeframe: 'M5',
          strategy: 'POC_BOUNCE',
          strategyName: 'Previous Session POC Bounce',
          entryZone: {
            min: Number((prevPoc - pipSize * 2).toFixed(digits)),
            max: Number((prevPoc + pipSize * 2).toFixed(digits))
          },
          entryPrice: lastPrice,
          stopLoss,
          tp,
          riskPips,
          rewardPips: riskPips * 2,
          rMultiple: 2.0,
          grade,
          session: currentSessionInfo.session,
          reason: `Price tested previous profile session POC (${prevPoc.toFixed(digits)}) following close outside value area. Confirmed downward bounce.`,
          timestamp: Date.now(),
          checklist,
          aiAnalysis: `Previous profile session POC at ${prevPoc.toFixed(digits)} held as institutional resistance after previous close printed below value area. Target 2R anchored at ${tp}.`
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // SETUP 2: VALUE AREA REVERSAL
  // Rules:
  // 1. Previous close INSIDE the value area (VAL <= prevCandle.close <= VAH).
  // 2. A move beyond VAH or VAL (high > VAH or low < VAL).
  // 3. Candle BODY close back inside the value area.
  // --------------------------------------------------------------------------
  const prevCloseInside = prevCandle.close >= currentProfile.val && prevCandle.close <= currentProfile.vah;

  if (prevCloseInside) {
    // Check Bearish Value Area Reversal: moved beyond VAH, candle BODY close back inside (< VAH)
    const movedBeyondVAH = lastCandle.high > currentProfile.vah || prevCandle.high > currentProfile.vah;
    const bodyClosedInsideBelowVAH = lastCandle.close < currentProfile.vah && Math.max(lastCandle.open, lastCandle.close) <= currentProfile.vah;

    if (movedBeyondVAH && bodyClosedInsideBelowVAH) {
      const riskPips = 25;
      const slDist = riskPips * pipSize;
      const stopLoss = Number((Math.max(lastCandle.high, prevCandle.high) + pipSize * 2).toFixed(digits));
      const tp = Number((lastPrice - 2 * slDist).toFixed(digits)); // Single 2R target

      const checklist: InstitutionalChecklistItem[] = [
        {
          id: 'prev-close-inside',
          label: 'Previous Candle Close INSIDE Value Area',
          passed: true,
          requiredForGradeA: true,
          detail: `Previous close ${prevCandle.close} was inside (${currentProfile.val} - ${currentProfile.vah})`
        },
        {
          id: 'move-beyond-va',
          label: 'Price Move Beyond VAH Boundary',
          passed: true,
          requiredForGradeA: true,
          detail: `Probed above VAH (${currentProfile.vah}) to ${lastCandle.high}`
        },
        {
          id: 'body-close-inside',
          label: 'Candle BODY Close Back Inside Value Area',
          passed: true,
          requiredForGradeA: true,
          detail: `Candle body closed cleanly inside value area at ${lastCandle.close}`
        },
        {
          id: 'session-timing',
          label: 'High Volume Session Timing',
          passed: currentSessionInfo.isOverlap || currentSessionInfo.session === 'LONDON' || currentSessionInfo.session === 'NEW_YORK',
          requiredForGradeA: false,
          detail: `Session: ${currentSessionInfo.label}`
        }
      ];

      const grade = calculateSetupGrade(checklist);

      signals.push({
        id: `SIG-VAR-SELL-${symbol.replace('/', '')}-${lastCandle.time}`,
        symbol,
        direction: 'SELL',
        status: 'VALID',
        timeframe,
        confirmationTimeframe: 'M5',
        strategy: 'VALUE_AREA_REVERSAL',
        strategyName: 'Value Area Reversal',
        entryZone: {
          min: Number((lastPrice - pipSize * 2).toFixed(digits)),
          max: Number((lastPrice + pipSize * 2).toFixed(digits))
        },
        entryPrice: lastPrice,
        stopLoss,
        tp,
        riskPips,
        rewardPips: riskPips * 2,
        rMultiple: 2.0,
        grade,
        session: currentSessionInfo.session,
        reason: `Previous close inside value area followed by move beyond VAH and verified candle body close back inside.`,
        timestamp: Date.now(),
        checklist,
        aiAnalysis: `Auction failure outside VAH with candle body closing back inside the value area. Target 2R anchored at ${tp}.`
      });
    }

    // Check Bullish Value Area Reversal: moved beyond VAL, candle BODY close back inside (> VAL)
    const movedBeyondVAL = lastCandle.low < currentProfile.val || prevCandle.low < currentProfile.val;
    const bodyClosedInsideAboveVAL = lastCandle.close > currentProfile.val && Math.min(lastCandle.open, lastCandle.close) >= currentProfile.val;

    if (movedBeyondVAL && bodyClosedInsideAboveVAL) {
      const riskPips = 25;
      const slDist = riskPips * pipSize;
      const stopLoss = Number((Math.min(lastCandle.low, prevCandle.low) - pipSize * 2).toFixed(digits));
      const tp = Number((lastPrice + 2 * slDist).toFixed(digits)); // Single 2R target

      const checklist: InstitutionalChecklistItem[] = [
        {
          id: 'prev-close-inside',
          label: 'Previous Candle Close INSIDE Value Area',
          passed: true,
          requiredForGradeA: true,
          detail: `Previous close ${prevCandle.close} was inside (${currentProfile.val} - ${currentProfile.vah})`
        },
        {
          id: 'move-beyond-va',
          label: 'Price Move Beyond VAL Boundary',
          passed: true,
          requiredForGradeA: true,
          detail: `Probed below VAL (${currentProfile.val}) to ${lastCandle.low}`
        },
        {
          id: 'body-close-inside',
          label: 'Candle BODY Close Back Inside Value Area',
          passed: true,
          requiredForGradeA: true,
          detail: `Candle body closed cleanly inside value area at ${lastCandle.close}`
        },
        {
          id: 'session-timing',
          label: 'High Volume Session Timing',
          passed: currentSessionInfo.isOverlap || currentSessionInfo.session === 'LONDON' || currentSessionInfo.session === 'NEW_YORK',
          requiredForGradeA: false,
          detail: `Session: ${currentSessionInfo.label}`
        }
      ];

      const grade = calculateSetupGrade(checklist);

      signals.push({
        id: `SIG-VAR-BUY-${symbol.replace('/', '')}-${lastCandle.time}`,
        symbol,
        direction: 'BUY',
        status: 'VALID',
        timeframe,
        confirmationTimeframe: 'M5',
        strategy: 'VALUE_AREA_REVERSAL',
        strategyName: 'Value Area Reversal',
        entryZone: {
          min: Number((lastPrice - pipSize * 2).toFixed(digits)),
          max: Number((lastPrice + pipSize * 2).toFixed(digits))
        },
        entryPrice: lastPrice,
        stopLoss,
        tp,
        riskPips,
        rewardPips: riskPips * 2,
        rMultiple: 2.0,
        grade,
        session: currentSessionInfo.session,
        reason: `Previous close inside value area followed by move beyond VAL and verified candle body close back inside.`,
        timestamp: Date.now(),
        checklist,
        aiAnalysis: `Auction failure outside VAL with candle body closing back inside the value area. Target 2R anchored at ${tp}.`
      });
    }
  }

  // --------------------------------------------------------------------------
  // SETUP 3: BREAKOUT
  // Rules:
  // 1. Requires a break beyond the boundary (outside VAH or VAL).
  // 2. Pullback that holds near boundary (max 50% of value-area height: <= 0.5 * vaHeight).
  // 3. BOS in breakout direction.
  // --------------------------------------------------------------------------
  // Base value area prior to the breakout expansion bars
  const preCandles = candles.slice(0, Math.max(10, candles.length - 3));
  const preProfile = calculateVolumeProfile(preCandles, digits, pipSize);
  const targetVAH = preProfile.vah || currentProfile.vah;
  const targetVAL = preProfile.val || currentProfile.val;
  const targetHeight = Math.max(preProfile.vah - preProfile.val, pipSize * 5);
  const maxPullbackAllowed = 0.50 * targetHeight;

  // Bullish Breakout: Broke above VAH, pulled back holding within 50% of VAH, then confirmed Bullish BOS
  const hasBullishBOS = (structure.lastBOS && structure.lastBOS.direction === 'BULLISH') || (lastCandle.close > Math.max(...candles.slice(-6, -1).map(c => c.high)));
  const recentHighs = candles.slice(-10).map(c => c.high);
  const brokeAboveVAH = Math.max(...recentHighs) > targetVAH;

  if (brokeAboveVAH && hasBullishBOS) {
    const pullbackCandles = candles.slice(-2, -1);
    const pullbackLowest = Math.min(...pullbackCandles.map(c => c.low));
    const pullbackDepth = Math.max(0, targetVAH - pullbackLowest);
    const holdsNearBoundary = pullbackDepth <= maxPullbackAllowed;

    if (holdsNearBoundary) {
      const riskPips = 22;
      const slDist = riskPips * pipSize;
      const stopLoss = Number((pullbackLowest - pipSize * 2).toFixed(digits));
      const tp = Number((lastPrice + 2 * slDist).toFixed(digits)); // 2R default

      const checklist: InstitutionalChecklistItem[] = [
        {
          id: 'boundary-break',
          label: 'Initial Break Beyond Value Area Boundary (VAH)',
          passed: true,
          requiredForGradeA: true,
          detail: `Broke above VAH (${currentProfile.vah})`
        },
        {
          id: 'pullback-hold',
          label: 'Pullback Holds Near Boundary (Max 50% VA Height)',
          passed: true,
          requiredForGradeA: true,
          detail: `Pullback depth ${pullbackDepth.toFixed(1)} <= 50% VA height (${maxPullbackAllowed.toFixed(1)})`
        },
        {
          id: 'bos-confirmation',
          label: 'Confirmed BOS in Breakout Direction',
          passed: true,
          requiredForGradeA: true,
          detail: `BOS confirmed at ${structure.lastBOS?.price}`
        },
        {
          id: 'volume-expansion',
          label: 'Volume Confirmation on Breakout Bar',
          passed: lastCandle.volume > 800,
          requiredForGradeA: false,
          detail: `Candle volume: ${lastCandle.volume}`
        }
      ];

      const grade = calculateSetupGrade(checklist);

      signals.push({
        id: `SIG-BRK-BUY-${symbol.replace('/', '')}-${lastCandle.time}`,
        symbol,
        direction: 'BUY',
        status: 'VALID',
        timeframe,
        confirmationTimeframe: 'M5',
        strategy: 'CONFIRMED_BREAKOUT',
        strategyName: 'Value Area Breakout (BOS)',
        entryZone: {
          min: Number((lastPrice - pipSize * 2).toFixed(digits)),
          max: Number((lastPrice + pipSize * 2).toFixed(digits))
        },
        entryPrice: lastPrice,
        stopLoss,
        tp,
        riskPips,
        rewardPips: riskPips * 2,
        rMultiple: 2.0,
        grade,
        session: currentSessionInfo.session,
        reason: `Breakout beyond VAH, shallow pullback holding within 50% value-area height, and confirmed BOS in breakout direction.`,
        timestamp: Date.now(),
        checklist,
        aiAnalysis: `Value area breakout accepted above VAH. Pullback respected 50% boundary tolerance before structural continuation was confirmed. Target 2R anchored at ${tp}.`
      });
    }
  }

  // Bearish Breakout: Broke below VAL, pulled back holding within 50% of VAL, then confirmed Bearish BOS
  const hasBearishBOS = (structure.lastBOS && structure.lastBOS.direction === 'BEARISH') || (lastCandle.close < Math.min(...candles.slice(-6, -1).map(c => c.low)));
  const recentLows = candles.slice(-10).map(c => c.low);
  const brokeBelowVAL = Math.min(...recentLows) < currentProfile.val;

  if (brokeBelowVAL && hasBearishBOS) {
    const pullbackCandles = candles.slice(-2, -1);
    const pullbackHighest = Math.max(...pullbackCandles.map(c => c.high));
    const pullbackDepth = Math.max(0, pullbackHighest - targetVAL);
    const holdsNearBoundary = pullbackDepth <= maxPullbackAllowed;

    if (holdsNearBoundary) {
      const riskPips = 22;
      const slDist = riskPips * pipSize;
      const stopLoss = Number((pullbackHighest + pipSize * 2).toFixed(digits));
      const tp = Number((lastPrice - 2 * slDist).toFixed(digits)); // 2R default

      const checklist: InstitutionalChecklistItem[] = [
        {
          id: 'boundary-break',
          label: 'Initial Break Beyond Value Area Boundary (VAL)',
          passed: true,
          requiredForGradeA: true,
          detail: `Broke below VAL (${currentProfile.val})`
        },
        {
          id: 'pullback-hold',
          label: 'Pullback Holds Near Boundary (Max 50% VA Height)',
          passed: true,
          requiredForGradeA: true,
          detail: `Pullback depth ${pullbackDepth.toFixed(1)} <= 50% VA height (${maxPullbackAllowed.toFixed(1)})`
        },
        {
          id: 'bos-confirmation',
          label: 'Confirmed BOS in Breakout Direction',
          passed: true,
          requiredForGradeA: true,
          detail: `BOS confirmed at ${structure.lastBOS?.price}`
        },
        {
          id: 'volume-expansion',
          label: 'Volume Confirmation on Breakout Bar',
          passed: lastCandle.volume > 800,
          requiredForGradeA: false,
          detail: `Candle volume: ${lastCandle.volume}`
        }
      ];

      const grade = calculateSetupGrade(checklist);

      signals.push({
        id: `SIG-BRK-SELL-${symbol.replace('/', '')}-${lastCandle.time}`,
        symbol,
        direction: 'SELL',
        status: 'VALID',
        timeframe,
        confirmationTimeframe: 'M5',
        strategy: 'CONFIRMED_BREAKOUT',
        strategyName: 'Value Area Breakout (BOS)',
        entryZone: {
          min: Number((lastPrice - pipSize * 2).toFixed(digits)),
          max: Number((lastPrice + pipSize * 2).toFixed(digits))
        },
        entryPrice: lastPrice,
        stopLoss,
        tp,
        riskPips,
        rewardPips: riskPips * 2,
        rMultiple: 2.0,
        grade,
        session: currentSessionInfo.session,
        reason: `Breakout beyond VAL, shallow pullback holding within 50% value-area height, and confirmed BOS in breakout direction.`,
        timestamp: Date.now(),
        checklist,
        aiAnalysis: `Value area breakout accepted below VAL. Pullback held within 50% boundary tolerance before structural continuation was confirmed. Target 2R anchored at ${tp}.`
      });
    }
  }

  return signals;
}
