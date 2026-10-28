package com.grevin.ai.notifications

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class GrevinFirebaseMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d("GREVIN_FCM", "New FCM registration token received: $token")
        // Dispatched to server for persistent alert delivery when app is closed
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)

        val data = remoteMessage.data
        val title = data["title"] ?: remoteMessage.notification?.title ?: "Institutional Setup Alert"
        val instrument = data["instrument"] ?: "XAU/USD"
        val direction = data["direction"] ?: "BUY"
        val strategyName = data["strategyName"] ?: "Institutional Setup"
        val reason = data["reason"] ?: (remoteMessage.notification?.body ?: "Price reached verified institutional level")
        val grade = data["grade"] ?: "A"

        GrevinNotificationManager.sendSignalNotification(
            context = applicationContext,
            title = title,
            instrument = instrument,
            direction = direction,
            strategyName = strategyName,
            reason = reason,
            grade = grade
        )
    }
}
