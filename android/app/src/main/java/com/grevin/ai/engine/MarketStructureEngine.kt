package com.grevin.ai.engine

import com.grevin.ai.model.Candle
import com.grevin.ai.model.MarketStructureEvent
import com.grevin.ai.model.SwingPoint
import com.grevin.ai.model.Timeframe

data class MarketStructureAnalysis(
    val swingHighs: List<SwingPoint>,
    val swingLows: List<SwingPoint>,
    val events: List<MarketStructureEvent>,
    val trend: String,
    val lastBOS: MarketStructureEvent?,
    val lastCHoCH: MarketStructureEvent?
)

object MarketStructureEngine {

    fun detectSwings(candles: List<Candle>, swingLength: Int = 2): Pair<List<SwingPoint>, List<SwingPoint>> {
        val swingHighs = mutableListOf<SwingPoint>()
        val swingLows = mutableListOf<SwingPoint>()

        if (candles.size < swingLength * 2 + 1) {
            return Pair(emptyList(), emptyList())
        }

        for (i in swingLength until (candles.size - swingLength)) {
            val current = candles[i]
            var isHigh = true
            var isLow = true

            for (j in 1..swingLength) {
                if (candles[i - j].high >= current.high || candles[i + j].high > current.high) {
                    isHigh = false
                }
                if (candles[i - j].low <= current.low || candles[i + j].low < current.low) {
                    isLow = false
                }
            }

            if (isHigh) {
                swingHighs.add(SwingPoint(i, current.time, current.high, SwingPoint.SwingType.HIGH, true))
            }
            if (isLow) {
                swingLows.add(SwingPoint(i, current.time, current.low, SwingPoint.SwingType.LOW, true))
            }
        }

        return Pair(swingHighs, swingLows)
    }

    fun analyzeMarketStructure(
        candles: List<Candle>,
        timeframe: Timeframe = Timeframe.M15,
        swingLength: Int = 2
    ): MarketStructureAnalysis {
        val (highs, lows) = detectSwings(candles, swingLength)
        val events = mutableListOf<MarketStructureEvent>()

        var currentTrend = "NEUTRAL"
        var lastHighLevel: Double? = null
        var lastLowLevel: Double? = null

        for (i in 0 until candles.size) {
            val c = candles[i]

            // Check if any prior swing high is broken by candle close
            val priorHigh = highs.filter { it.index < i }.maxByOrNull { it.index }
            if (priorHigh != null && priorHigh.price != lastHighLevel) {
                if (c.close > priorHigh.price) {
                    val isChoch = currentTrend == "BEARISH"
                    val eventType = if (isChoch) MarketStructureEvent.StructureType.CHOCH else MarketStructureEvent.StructureType.BOS
                    currentTrend = "BULLISH"
                    lastHighLevel = priorHigh.price

                    events.add(
                        MarketStructureEvent(
                            id = "event-${c.time}",
                            type = eventType,
                            direction = MarketStructureEvent.Direction.BULLISH,
                            price = c.close,
                            brokenLevel = priorHigh.price,
                            time = c.time,
                            candleIndex = i,
                            timeframe = timeframe
                        )
                    )
                }
            }

            // Check if any prior swing low is broken by candle close
            val priorLow = lows.filter { it.index < i }.maxByOrNull { it.index }
            if (priorLow != null && priorLow.price != lastLowLevel) {
                if (c.close < priorLow.price) {
                    val isChoch = currentTrend == "BULLISH"
                    val eventType = if (isChoch) MarketStructureEvent.StructureType.CHOCH else MarketStructureEvent.StructureType.BOS
                    currentTrend = "BEARISH"
                    lastLowLevel = priorLow.price

                    events.add(
                        MarketStructureEvent(
                            id = "event-${c.time}",
                            type = eventType,
                            direction = MarketStructureEvent.Direction.BEARISH,
                            price = c.close,
                            brokenLevel = priorLow.price,
                            time = c.time,
                            candleIndex = i,
                            timeframe = timeframe
                        )
                    )
                }
            }
        }

        return MarketStructureAnalysis(
            swingHighs = highs,
            swingLows = lows,
            events = events,
            trend = currentTrend,
            lastBOS = events.filter { it.type == MarketStructureEvent.StructureType.BOS }.lastOrNull(),
            lastCHoCH = events.filter { it.type == MarketStructureEvent.StructureType.CHOCH }.lastOrNull()
        )
    }
}
