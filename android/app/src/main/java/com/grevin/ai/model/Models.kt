package com.grevin.ai.model

enum class Timeframe(val label: String) {
    M1("M1"),
    M5("M5"),
    M15("M15"),
    H1("H1"),
    H4("H4"),
    D1("D1")
}

enum class SignalDirection {
    BUY,
    SELL,
    WAIT
}

enum class SignalStatus {
    VALID,
    WAIT,
    INVALID,
    TRIGGERED,
    TP_HIT,
    SL_HIT
}

enum class StrategyType(val title: String) {
    POC_BOUNCE("Previous POC Bounce"),
    VALUE_AREA_REVERSAL("Value Area Reversal"),
    CONFIRMED_BREAKOUT("Confirmed Breakout & BOS")
}

enum class SetupGrade {
    A,
    B,
    C
}

enum class MarketSessionType(val displayName: String) {
    ASIAN("Asian (Tokyo)"),
    LONDON("London"),
    NEW_YORK("New York"),
    LONDON_NY_OVERLAP("London / NY Overlap"),
    CLOSED("Market Closed")
}

data class Candle(
    val time: Long, // Epoch seconds
    val open: Double,
    val high: Double,
    val low: Double,
    val close: Double,
    val volume: Double,
    val buyVolume: Double? = null,
    val sellVolume: Double? = null
)

data class SymbolInfo(
    val symbol: String,
    val name: String,
    val category: String,
    val digits: Int,
    val pipSize: Double,
    val pipValuePerStandardLot: Double? = null,
    val lotSize: Double? = null,
    val minLot: Double? = 0.01,
    val maxLot: Double? = 50.0,
    val lotStep: Double? = 0.01,
    val currentBid: Double,
    val currentAsk: Double,
    val spreadPips: Double,
    val isAvailable: Boolean = true
)

data class VolumeProfileLevel(
    val price: Double,
    val volume: Double,
    val buyVolume: Double,
    val sellVolume: Double,
    val percentage: Double
)

data class VolumeProfile(
    val poc: Double,
    val vah: Double,
    val valLevel: Double,
    val totalVolume: Double,
    val valueAreaVolume: Double,
    val levels: List<VolumeProfileLevel>,
    val session: MarketSessionType,
    val stepSize: Double,
    val isApproximateTickVolume: Boolean = true // APPROXIMATE (tick volume)
)

data class SwingPoint(
    val index: Int,
    val time: Long,
    val price: Double,
    val type: SwingType,
    val confirmed: Boolean
) {
    enum class SwingType { HIGH, LOW }
}

data class MarketStructureEvent(
    val id: String,
    val type: StructureType,
    val direction: Direction,
    val price: Double,
    val brokenLevel: Double,
    val time: Long,
    val candleIndex: Int,
    val timeframe: Timeframe,
    val significance: String = "MAJOR"
) {
    enum class StructureType { BOS, CHOCH }
    enum class Direction { BULLISH, BEARISH }
}

data class InstitutionalChecklistItem(
    val id: String,
    val label: String,
    val passed: Boolean,
    val requiredForGradeA: Boolean,
    val detail: String
)

data class TradingSignal(
    val id: String,
    val symbol: String,
    val direction: SignalDirection,
    val status: SignalStatus,
    val timeframe: Timeframe,
    val strategy: StrategyType,
    val strategyName: String,
    val entryZoneMin: Double,
    val entryZoneMax: Double,
    val entryPrice: Double,
    val stopLoss: Double,
    val tp: Double, // Single take-profit at 2R
    val riskPips: Double,
    val rewardPips: Double,
    val rMultiple: Double = 2.0,
    val grade: SetupGrade,
    val session: MarketSessionType,
    val reason: String,
    val timestamp: Long,
    val checklist: List<InstitutionalChecklistItem>
)

data class PositionCalculationResult(
    val canCalculate: Boolean,
    val recommendedLotSize: Double? = null,
    val units: Double? = null,
    val riskAmount: Double? = null,
    val potentialReward: Double? = null,
    val riskPips: Double? = null,
    val rewardPips: Double? = null,
    val unavailabilityReason: String? = null
)

data class NotificationControls(
    val enabled: Boolean = true,
    val selectedInstruments: List<String> = listOf("XAU/USD", "EUR/USD", "GBP/USD", "NAS100", "US100"),
    val minimumGrade: SetupGrade = SetupGrade.B,
    val cooldownMinutes: Int = 15,
    val quietHoursEnabled: Boolean = false,
    val soundAlertsEnabled: Boolean = true,
    val vibrateEnabled: Boolean = true
)

data class AlertNotification(
    val id: String,
    val type: String,
    val title: String,
    val body: String,
    val instrument: String,
    val direction: SignalDirection?,
    val timeframe: String?,
    val strategyName: String?,
    val stopLoss: Double?,
    val takeProfit: Double?,
    val grade: SetupGrade?,
    val reason: String,
    val timestamp: Long,
    val read: Boolean = false
)

data class CTraderConfig(
    val clientId: String = "",
    val environment: String = "DEMO",
    val connected: Boolean = false,
    val simulationMode: Boolean = false, // OFF by default
    val latencyMs: Long? = null,
    val isStale: Boolean = false
)
