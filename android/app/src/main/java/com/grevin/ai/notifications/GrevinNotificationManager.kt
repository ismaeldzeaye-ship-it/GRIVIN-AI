package com.grevin.ai.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.grevin.ai.ui.MainActivity

object GrevinNotificationManager {

    const val CHANNEL_SIGNALS = "grevin_signals_channel"
    const val CHANNEL_MARKET = "grevin_market_channel"
    const val CHANNEL_SYSTEM = "grevin_system_channel"

    fun createNotificationChannels(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            val signalChannel = NotificationChannel(
                CHANNEL_SIGNALS,
                "GREVIN AI - Institutional Signals",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "High priority BUY/SELL setups, POC bounces, Value Area reversals, and Breakouts."
                enableVibration(true)
            }

            val marketChannel = NotificationChannel(
                CHANNEL_MARKET,
                "Market Sessions & Price Alerts",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Session opens, DST adjustments, and price approaching POC/VAH/VAL."
            }

            val systemChannel = NotificationChannel(
                CHANNEL_SYSTEM,
                "System & Connection Alerts",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "cTrader disconnects, stale data warnings, and system status."
            }

            notificationManager.createNotificationChannel(signalChannel)
            notificationManager.createNotificationChannel(marketChannel)
            notificationManager.createNotificationChannel(systemChannel)
        }
    }

    fun sendSignalNotification(
        context: Context,
        title: String,
        instrument: String,
        direction: String,
        strategyName: String,
        reason: String,
        grade: String = "A"
    ) {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra("OPEN_TAB", "SIGNALS")
            putExtra("INSTRUMENT", instrument)
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            System.currentTimeMillis().toInt(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val bodyText = "Instrument: $instrument\nDirection: $direction [Grade $grade]\nStrategy: $strategyName\nReason: $reason\nEntry, SL & 2R Target: Tap to view verified levels."

        val builder = NotificationCompat.Builder(context, CHANNEL_SIGNALS)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("GREVIN AI — $title")
            .setContentText("$direction $instrument • $strategyName")
            .setStyle(NotificationCompat.BigTextStyle().bigText(bodyText))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)

        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify((System.currentTimeMillis() % 10000).toInt(), builder.build())
    }
}
