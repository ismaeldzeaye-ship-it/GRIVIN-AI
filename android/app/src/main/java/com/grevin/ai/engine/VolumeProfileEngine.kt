package com.grevin.ai.engine

import com.grevin.ai.model.Candle
import com.grevin.ai.model.MarketSessionType
import com.grevin.ai.model.VolumeProfile
import com.grevin.ai.model.VolumeProfileLevel
import kotlin.math.max
import kotlin.math.min
import kotlin.math.round

object VolumeProfileEngine {

    /**
     * Calculates Institutional Volume Profile:
     * - Finds POC (Point of Control) = price bucket with the highest volume node
     * - Accumulates 70% Value Area outward from POC to identify VAH and VAL
     * - Labels strictly as APPROXIMATE (tick volume)
     */
    fun calculateVolumeProfile(
        candles: List<Candle>,
        priceDigits: Int = 2,
        customStepSize: Double? = null,
        session: MarketSessionType = MarketSessionType.NEW_YORK,
        numBins: Int = 40
    ): VolumeProfile {
        if (candles.isEmpty()) {
            return VolumeProfile(
                poc = 0.0,
                vah = 0.0,
                valLevel = 0.0,
                totalVolume = 0.0,
                valueAreaVolume = 0.0,
                levels = emptyList(),
                session = session,
                stepSize = 0.1,
                isApproximateTickVolume = true
            )
        }

        var minPrice = Double.MAX_VALUE
        var maxPrice = Double.MIN_VALUE

        for (c in candles) {
            if (c.low < minPrice) minPrice = c.low
            if (c.high > maxPrice) maxPrice = c.high
        }

        if (minPrice >= maxPrice) {
            minPrice -= 1.0
            maxPrice += 1.0
        }

        val priceRange = maxPrice - minPrice
        val rawStep = customStepSize ?: (priceRange / numBins)
        val stepSize = if (rawStep <= 0.0) 0.1 else rawStep

        val buckets = mutableMapOf<Double, Double>()
        val buyVolumeMap = mutableMapOf<Double, Double>()
        val sellVolumeMap = mutableMapOf<Double, Double>()

        for (candle in candles) {
            val candleRange = max(candle.high - candle.low, stepSize / 2.0)
            val subSteps = max(1, round(candleRange / stepSize).toInt())
            val volPerStep = candle.volume / subSteps

            val isBullish = candle.close >= candle.open
            val buyPart = if (isBullish) volPerStep * 0.65 else volPerStep * 0.35
            val sellPart = volPerStep - buyPart

            var currentP = candle.low
            while (currentP <= candle.high) {
                val bucketKey = round(currentP / stepSize) * stepSize
                buckets[bucketKey] = (buckets[bucketKey] ?: 0.0) + volPerStep
                buyVolumeMap[bucketKey] = (buyVolumeMap[bucketKey] ?: 0.0) + buyPart
                sellVolumeMap[bucketKey] = (sellVolumeMap[bucketKey] ?: 0.0) + sellPart
                currentP += stepSize
            }
        }

        var totalVolume = 0.0
        var maxVol = -1.0
        var pocPrice = (minPrice + maxPrice) / 2.0

        for ((price, vol) in buckets) {
            totalVolume += vol
            if (vol > maxVol) {
                maxVol = vol
                pocPrice = price
            }
        }

        val sortedPrices = buckets.keys.sorted()
        val levels = sortedPrices.map { p ->
            val v = buckets[p] ?: 0.0
            VolumeProfileLevel(
                price = roundToDigits(p, priceDigits),
                volume = v,
                buyVolume = buyVolumeMap[p] ?: 0.0,
                sellVolume = sellVolumeMap[p] ?: 0.0,
                percentage = if (totalVolume > 0) (v / totalVolume) * 100.0 else 0.0
            )
        }

        // 70% Value Area algorithm expanding from POC
        val targetVAVolume = totalVolume * 0.70
        var vaVolume = max(0.0, maxVol)
        var pocIndex = sortedPrices.indexOf(pocPrice)
        if (pocIndex == -1) pocIndex = sortedPrices.size / 2

        var lowIdx = pocIndex
        var highIdx = pocIndex

        while (vaVolume < targetVAVolume && (lowIdx > 0 || highIdx < sortedPrices.size - 1)) {
            val nextLowVol = if (lowIdx > 0) buckets[sortedPrices[lowIdx - 1]] ?: 0.0 else -1.0
            val nextHighVol = if (highIdx < sortedPrices.size - 1) buckets[sortedPrices[highIdx + 1]] ?: 0.0 else -1.0

            if (nextLowVol >= nextHighVol && lowIdx > 0) {
                lowIdx--
                vaVolume += nextLowVol
            } else if (highIdx < sortedPrices.size - 1) {
                highIdx++
                vaVolume += nextHighVol
            } else if (lowIdx > 0) {
                lowIdx--
                vaVolume += nextLowVol
            } else {
                break
            }
        }

        val valLevel = if (sortedPrices.isNotEmpty()) sortedPrices[lowIdx] else minPrice
        val vah = if (sortedPrices.isNotEmpty()) sortedPrices[highIdx] else maxPrice

        return VolumeProfile(
            poc = roundToDigits(pocPrice, priceDigits),
            vah = roundToDigits(vah, priceDigits),
            valLevel = roundToDigits(valLevel, priceDigits),
            totalVolume = totalVolume,
            valueAreaVolume = vaVolume,
            levels = levels,
            session = session,
            stepSize = stepSize,
            isApproximateTickVolume = true
        )
    }

    private fun roundToDigits(value: Double, digits: Int): Double {
        var multiplier = 1.0
        repeat(digits) { multiplier *= 10.0 }
        return round(value * multiplier) / multiplier
    }
}
