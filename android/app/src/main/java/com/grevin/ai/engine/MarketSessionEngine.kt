package com.grevin.ai.engine

import com.grevin.ai.model.MarketSessionType
import java.util.Calendar
import java.util.Date
import java.util.TimeZone

data class SessionSchedule(
    val type: MarketSessionType,
    val name: String,
    val startHourUTC: Int,
    val endHourUTC: Int,
    val description: String
)

data class ActiveSessionStatus(
    val currentSession: MarketSessionType,
    val activeSessions: List<SessionSchedule>,
    val timeRemainingSeconds: Long,
    val isUkDst: Boolean,
    val isUsDst: Boolean
)

object MarketSessionEngine {

    /**
     * Calculates UK Daylight Saving Time (BST): last Sunday of March to last Sunday of October
     */
    fun isUKDaylightSaving(calendar: Calendar): Boolean {
        val month = calendar.get(Calendar.MONTH) // 0-indexed: 2=March, 9=October
        if (month < Calendar.MARCH || month > Calendar.OCTOBER) return false
        if (month > Calendar.MARCH && month < Calendar.OCTOBER) return true

        val dayOfMonth = calendar.get(Calendar.DAY_OF_MONTH)
        val dayOfWeek = calendar.get(Calendar.DAY_OF_WEEK) // 1=Sunday
        val daysUntilLastSunday = (7 - dayOfWeek) % 7
        val lastSunday = dayOfMonth + daysUntilLastSunday

        return if (month == Calendar.MARCH) dayOfMonth >= lastSunday else dayOfMonth < lastSunday
    }

    /**
     * Calculates US Daylight Saving Time (EDT): second Sunday of March to first Sunday of November
     */
    fun isUSDaylightSaving(calendar: Calendar): Boolean {
        val month = calendar.get(Calendar.MONTH) // 2=March, 10=November
        if (month < Calendar.MARCH || month > Calendar.NOVEMBER) return false
        if (month > Calendar.MARCH && month < Calendar.NOVEMBER) return true

        val dayOfMonth = calendar.get(Calendar.DAY_OF_MONTH)
        return if (month == Calendar.MARCH) dayOfMonth >= 8 else dayOfMonth < 7
    }

    fun getActiveSessionSchedules(date: Date = Date()): List<SessionSchedule> {
        val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        cal.time = date

        val ukDst = isUKDaylightSaving(cal)
        val usDst = isUSDaylightSaving(cal)

        // London: 07:00-15:30 UTC during BST, 08:00-16:30 UTC during GMT
        val londonStart = if (ukDst) 7 else 8
        val londonEnd = if (ukDst) 15 else 16

        // New York: 12:00-21:00 UTC during EDT, 13:00-22:00 UTC during EST
        val nyStart = if (usDst) 12 else 13
        val nyEnd = if (usDst) 21 else 22

        return listOf(
            SessionSchedule(MarketSessionType.ASIAN, "Asian (Tokyo)", 0, 9, "Tokyo & Sydney high-volume open"),
            SessionSchedule(MarketSessionType.LONDON, "London", londonStart, londonEnd, "European institutional order flow"),
            SessionSchedule(MarketSessionType.NEW_YORK, "New York", nyStart, nyEnd, "US institutional liquidity session"),
            SessionSchedule(MarketSessionType.LONDON_NY_OVERLAP, "London / NY Overlap", nyStart, londonEnd, "Peak liquidity convergence")
        )
    }

    fun getCurrentSessionStatus(date: Date = Date()): ActiveSessionStatus {
        val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        cal.time = date
        val hour = cal.get(Calendar.HOUR_OF_DAY)
        val minute = cal.get(Calendar.MINUTE)
        val second = cal.get(Calendar.SECOND)

        val ukDst = isUKDaylightSaving(cal)
        val usDst = isUSDaylightSaving(cal)
        val schedules = getActiveSessionSchedules(date)

        val active = schedules.filter { s ->
            if (s.startHourUTC <= s.endHourUTC) {
                hour >= s.startHourUTC && hour < s.endHourUTC
            } else {
                hour >= s.startHourUTC || hour < s.endHourUTC
            }
        }

        val primarySession = when {
            active.any { it.type == MarketSessionType.LONDON_NY_OVERLAP } -> MarketSessionType.LONDON_NY_OVERLAP
            active.any { it.type == MarketSessionType.NEW_YORK } -> MarketSessionType.NEW_YORK
            active.any { it.type == MarketSessionType.LONDON } -> MarketSessionType.LONDON
            active.any { it.type == MarketSessionType.ASIAN } -> MarketSessionType.ASIAN
            else -> MarketSessionType.CLOSED
        }

        // Calculate seconds remaining in primary active session
        val currentSchedule = schedules.find { it.type == primarySession }
        val remainingSeconds = if (currentSchedule != null) {
            val endSec = currentSchedule.endHourUTC * 3600L
            val currentSec = hour * 3600L + minute * 60L + second
            if (endSec >= currentSec) endSec - currentSec else (24 * 3600L - currentSec) + endSec
        } else {
            3600L
        }

        return ActiveSessionStatus(
            currentSession = primarySession,
            activeSessions = active,
            timeRemainingSeconds = remainingSeconds,
            isUkDst = ukDst,
            isUsDst = usDst
        )
    }
}
