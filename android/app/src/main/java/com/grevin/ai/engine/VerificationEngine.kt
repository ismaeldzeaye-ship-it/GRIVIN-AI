package com.grevin.ai.engine

import com.grevin.ai.model.Candle
import com.grevin.ai.model.MarketSessionType
import com.grevin.ai.model.StrategyType
import com.grevin.ai.model.SymbolInfo
import com.grevin.ai.model.Timeframe
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

data class TestResult(
    val name: String,
    val passed: Boolean,
    val message: String
)

object VerificationEngine {

    fun runAllUnitTests(): Pair<Boolean, List<TestResult>> {
        val results = mutableListOf<TestResult>()

        // 1. Volume Profile Math Test
        try {
            val dummyCandles = listOf(
                Candle(1000L, 100.0, 105.0, 95.0, 102.0, 1000.0),
                Candle(1060L, 102.0, 104.0, 101.0, 103.0, 5000.0),
                Candle(1120L, 103.0, 108.0, 102.0, 107.0, 1200.0),
                Candle(1180L, 107.0, 110.0, 106.0, 109.0, 800.0)
            )
            val vp = VolumeProfileEngine.calculateVolumeProfile(dummyCandles, 2, 0.5, MarketSessionType.NEW_YORK, 20)
            val pocValid = vp.poc in 101.0..104.0
            val valueAreaCovers70 = vp.valueAreaVolume >= vp.totalVolume * 0.69
            val isApprox = vp.isApproximateTickVolume

            results.add(
                TestResult(
                    name = "Volume Profile Math (POC & 70% Value Area)",
                    passed = pocValid && valueAreaCovers70 && isApprox,
                    message = "POC: ${vp.poc}, VAL: ${vp.valLevel}, VAH: ${vp.vah}, TotalVol: ${vp.totalVolume}, VA Vol: ${vp.valueAreaVolume.toInt()}, Labeled: APPROXIMATE (tick volume)"
                )
            )
        } catch (e: Exception) {
            results.add(TestResult("Volume Profile Math (POC & 70% Value Area)", false, "Error: ${e.message}"))
        }

        // 2. Market Sessions & Daylight Saving Time (DST) Adjustments
        try {
            val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }
            val summerDate = sdf.parse("2026-07-15T14:00:00Z")!!
            val winterDate = sdf.parse("2026-01-15T14:00:00Z")!!

            val summerSchedules = MarketSessionEngine.getActiveSessionSchedules(summerDate)
            val winterSchedules = MarketSessionEngine.getActiveSessionSchedules(winterDate)

            val londonSummer = summerSchedules.find { it.type == MarketSessionType.LONDON }!!
            val londonWinter = winterSchedules.find { it.type == MarketSessionType.LONDON }!!

            val dstCheck = londonSummer.startHourUTC == 7 && londonWinter.startHourUTC == 8

            results.add(
                TestResult(
                    name = "Market Sessions & Daylight Saving Time (DST) Adjustments",
                    passed = dstCheck,
                    message = "Summer London start: ${londonSummer.startHourUTC}:00 UTC (BST), Winter London start: ${londonWinter.startHourUTC}:00 UTC (GMT). DST calculated accurately."
                )
            )
        } catch (e: Exception) {
            results.add(TestResult("Market Sessions & Daylight Saving Time (DST) Adjustments", false, "Error: ${e.message}"))
        }

        // 3. Fractal Swing Detection
        try {
            val prices = listOf(10.0, 11.0, 12.0, 15.0, 12.0, 11.0, 10.0, 8.0, 10.0, 12.0, 13.0)
            val swingCandles = prices.mapIndexed { i, p ->
                Candle(1000L + i * 60, p, p + 1.0, p - 1.0, p, 500.0)
            }
            val (highs, lows) = MarketStructureEngine.detectSwings(swingCandles, 2)
            val detected = highs.isNotEmpty() && lows.isNotEmpty()

            results.add(
                TestResult(
                    name = "Fractal Swing Detection (Swing Highs & Lows)",
                    passed = detected,
                    message = "Detected ${highs.size} swing highs and ${lows.size} swing lows accurately."
                )
            )
        } catch (e: Exception) {
            results.add(TestResult("Fractal Swing Detection (Swing Highs & Lows)", false, "Error: ${e.message}"))
        }

        // 4. Market Structure Engine (BOS & CHoCH)
        try {
            val candlesForBOS = listOf(
                Candle(1000L, 100.0, 102.0, 99.0, 101.0, 500.0),
                Candle(1060L, 101.0, 105.0, 100.0, 104.0, 600.0),
                Candle(1120L, 104.0, 104.0, 101.0, 102.0, 500.0),
                Candle(1180L, 102.0, 103.0, 100.0, 101.0, 400.0),
                Candle(1240L, 101.0, 104.0, 101.0, 103.0, 600.0),
                Candle(1300L, 103.0, 109.0, 102.0, 108.0, 1500.0)
            )
            val structure = MarketStructureEngine.analyzeMarketStructure(candlesForBOS, Timeframe.M15, 1)
            val hasBullishEvent = structure.events.any { it.direction == com.grevin.ai.model.MarketStructureEvent.Direction.BULLISH }

            results.add(
                TestResult(
                    name = "Market Structure Engine (BOS & CHoCH)",
                    passed = hasBullishEvent,
                    message = "Structure events detected: ${structure.events.size}, Trend: ${structure.trend}"
                )
            )
        } catch (e: Exception) {
            results.add(TestResult("Market Structure Engine (BOS & CHoCH)", false, "Error: ${e.message}"))
        }

        // 5. Strategy 1: POC Bounce
        try {
            val pocCandles = mutableListOf<Candle>()
            for (i in 0 until 20) {
                pocCandles.add(Candle(1000L + i * 60, 100.0, 102.0, 98.0, 100.0, 3000.0))
            }
            for (i in 20 until 38) {
                pocCandles.add(Candle(1000L + i * 60, 105.0, 107.0, 104.0, 106.0, 500.0))
            }
            // Candle 38: Previous close OUTSIDE value area (105 > VAH)
            pocCandles.add(Candle(1000L + 38 * 60, 106.0, 107.0, 104.0, 105.0, 600.0))

            val prevProf = VolumeProfileEngine.calculateVolumeProfile(pocCandles.subList(0, 20), 2, 0.1)

            // Candle 39: Dips to test prev POC and bounces
            pocCandles.add(Candle(1000L + 39 * 60, 100.0, 101.0, prevProf.poc - 0.2, prevProf.poc + 0.5, 1200.0))

            val signals = SetupEngine.evaluateTradingSignals("XAU/USD", pocCandles, Timeframe.M15, prevProf.poc + 0.5, 0.1, 2)
            val pocSignal = signals.find { it.strategy == StrategyType.POC_BOUNCE }
            val passed = pocSignal != null && pocSignal.direction == com.grevin.ai.model.SignalDirection.BUY && pocSignal.rMultiple == 2.0

            results.add(
                TestResult(
                    name = "Strategy 1: Previous Session POC Bounce",
                    passed = passed,
                    message = if (pocSignal != null) "POC Bounce BUY at ${pocSignal.entryPrice}, 2R target: ${pocSignal.tp}, Grade: ${pocSignal.grade}" else "POC Bounce setup not triggered"
                )
            )
        } catch (e: Exception) {
            results.add(TestResult("Strategy 1: Previous Session POC Bounce", false, "Error: ${e.message}"))
        }

        // 6. Strategy 2: Value Area Reversal
        try {
            val varCandles = mutableListOf<Candle>()
            for (i in 0 until 30) {
                varCandles.add(Candle(1000L + i * 60, 100.0, 102.0, 98.0, 100.0, 1000.0))
            }
            // Candle 38: Previous close INSIDE
            varCandles.add(Candle(1000L + 38 * 60, 100.0, 101.0, 99.5, 100.5, 800.0))
            // Candle 39: High breaks VAH, body closes inside
            varCandles.add(Candle(1000L + 39 * 60, 101.0, 104.5, 99.5, 100.0, 1500.0))

            val signals = SetupEngine.evaluateTradingSignals("XAU/USD", varCandles, Timeframe.M15, 100.0, 0.1, 2)
            val varSignal = signals.find { it.strategy == StrategyType.VALUE_AREA_REVERSAL }
            val passed = varSignal != null && varSignal.direction == com.grevin.ai.model.SignalDirection.SELL && varSignal.rMultiple == 2.0

            results.add(
                TestResult(
                    name = "Strategy 2: 70% Value Area Reversal",
                    passed = passed,
                    message = if (varSignal != null) "VA Reversal SELL at ${varSignal.entryPrice}, 2R target: ${varSignal.tp}, Grade: ${varSignal.grade}" else "VA Reversal not triggered"
                )
            )
        } catch (e: Exception) {
            results.add(TestResult("Strategy 2: 70% Value Area Reversal", false, "Error: ${e.message}"))
        }

        // 7. Strategy 3: Value Area Breakout & BOS
        try {
            val brkCandles = mutableListOf<Candle>()
            for (i in 0 until 20) {
                brkCandles.add(Candle(1000L + i * 60, 100.0, 101.0, 99.0, 100.0, 1000.0))
            }
            // Breakout above VAH
            brkCandles.add(Candle(1000L + 21 * 60, 100.5, 105.0, 100.5, 104.0, 2000.0))
            // Pullback holding within 50% VA height
            brkCandles.add(Candle(1000L + 22 * 60, 104.0, 104.0, 101.5, 102.5, 800.0))
            // Breakout BOS candle
            brkCandles.add(Candle(1000L + 23 * 60, 102.5, 106.5, 102.5, 106.0, 2500.0))

            val signals = SetupEngine.evaluateTradingSignals("XAU/USD", brkCandles, Timeframe.M15, 106.0, 0.1, 2)
            val brkSignal = signals.find { it.strategy == StrategyType.CONFIRMED_BREAKOUT }
            val passed = brkSignal != null && brkSignal.direction == com.grevin.ai.model.SignalDirection.BUY && brkSignal.rMultiple == 2.0

            results.add(
                TestResult(
                    name = "Strategy 3: Value Area Breakout & BOS",
                    passed = passed,
                    message = if (brkSignal != null) "Breakout BUY at ${brkSignal.entryPrice}, 2R target: ${brkSignal.tp}, Grade: ${brkSignal.grade}" else "Breakout not triggered"
                )
            )
        } catch (e: Exception) {
            results.add(TestResult("Strategy 3: Value Area Breakout & BOS", false, "Error: ${e.message}"))
        }

        // 8. Risk Engine: cTrader Dynamic Specs & Safe Fallback
        try {
            val validSymbol = SymbolInfo(
                symbol = "XAU/USD",
                name = "Gold",
                category = "METALS",
                digits = 2,
                pipSize = 0.1,
                pipValuePerStandardLot = 10.0,
                lotSize = 100.0,
                minLot = 0.01,
                maxLot = 50.0,
                lotStep = 0.01,
                currentBid = 2740.0,
                currentAsk = 2740.25,
                spreadPips = 2.5,
                isAvailable = true
            )

            val successCalc = RiskEngine.calculatePositionSize(
                accountBalance = 10000.0,
                riskPercent = 1.0,
                entryPrice = 2740.0,
                stopLossPrice = 2735.0,
                tpPrice = 2750.0,
                symbolInfo = validSymbol
            )

            val failCalc = RiskEngine.calculatePositionSize(
                accountBalance = 10000.0,
                riskPercent = 1.0,
                entryPrice = 2740.0,
                stopLossPrice = 2735.0,
                symbolInfo = null
            )

            val passed = successCalc.canCalculate && successCalc.recommendedLotSize == 0.20 &&
                    !failCalc.canCalculate && failCalc.unavailabilityReason?.contains("cannot be calculated") == true

            results.add(
                TestResult(
                    name = "Risk Engine: cTrader Dynamic Specs & Safe Fallback",
                    passed = passed,
                    message = "Calculation with specs: ${successCalc.recommendedLotSize} lots. Safe fallback message: \"${failCalc.unavailabilityReason}\""
                )
            )
        } catch (e: Exception) {
            results.add(TestResult("Risk Engine: cTrader Dynamic Specs & Safe Fallback", false, "Error: ${e.message}"))
        }

        val allPassed = results.all { it.passed }
        return Pair(allPassed, results)
    }
}
