package com.grevin.ai.engine

import com.grevin.ai.model.PositionCalculationResult
import com.grevin.ai.model.SymbolInfo
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.round

object RiskEngine {

    /**
     * Calculates position lot size dynamically from cTrader symbol specifications.
     * If specs (pipValue, lotSize) are unavailable, returns canCalculate = false with an explicit reason.
     */
    fun calculatePositionSize(
        accountBalance: Double,
        riskPercent: Double,
        entryPrice: Double,
        stopLossPrice: Double,
        tpPrice: Double? = null,
        symbolInfo: SymbolInfo?
    ): PositionCalculationResult {
        if (symbolInfo == null || !symbolInfo.isAvailable) {
            return PositionCalculationResult(
                canCalculate = false,
                unavailabilityReason = "Position size cannot be calculated - symbol specifications unavailable from broker connection."
            )
        }

        val pipValue = symbolInfo.pipValuePerStandardLot
        val contractSize = symbolInfo.lotSize
        val pipSize = symbolInfo.pipSize

        if (pipValue == null || contractSize == null || pipValue <= 0.0 || contractSize <= 0.0 || pipSize <= 0.0) {
            return PositionCalculationResult(
                canCalculate = false,
                unavailabilityReason = "Position size cannot be calculated - incomplete symbol parameters (pip value / contract size missing)."
            )
        }

        val priceDifference = abs(entryPrice - stopLossPrice)
        if (priceDifference <= 0.0) {
            return PositionCalculationResult(
                canCalculate = false,
                unavailabilityReason = "Invalid stop loss level: stop loss equals entry price."
            )
        }

        val riskPips = priceDifference / pipSize
        val monetaryRisk = accountBalance * (riskPercent / 100.0)

        // Risk per standard lot = riskPips * pipValuePerStandardLot
        val riskPerLot = riskPips * pipValue
        if (riskPerLot <= 0.0) {
            return PositionCalculationResult(
                canCalculate = false,
                unavailabilityReason = "Risk per lot calculation yielded zero or negative value."
            )
        }

        var rawLots = monetaryRisk / riskPerLot

        val minLot = symbolInfo.minLot ?: 0.01
        val maxLot = symbolInfo.maxLot ?: 50.0
        val lotStep = symbolInfo.lotStep ?: 0.01

        rawLots = max(minLot, min(maxLot, rawLots))
        // Step rounding
        val steps = floor(rawLots / lotStep)
        val recommendedLots = round((steps * lotStep) * 100.0) / 100.0

        val rewardPips = if (tpPrice != null) abs(tpPrice - entryPrice) / pipSize else (riskPips * 2.0)
        val potentialReward = recommendedLots * rewardPips * pipValue

        return PositionCalculationResult(
            canCalculate = true,
            recommendedLotSize = recommendedLots,
            units = recommendedLots * contractSize,
            riskAmount = round(monetaryRisk * 100.0) / 100.0,
            potentialReward = round(potentialReward * 100.0) / 100.0,
            riskPips = round(riskPips * 10.0) / 10.0,
            rewardPips = round(rewardPips * 10.0) / 10.0
        )
    }
}
