package com.grevin.ai.ui.screens

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.grevin.ai.model.NotificationControls
import com.grevin.ai.model.SetupGrade
import com.grevin.ai.notifications.GrevinNotificationManager
import com.grevin.ai.ui.theme.*

@Composable
fun AlertsScreen() {
    val context = LocalContext.current
    var controls by remember { mutableStateOf(NotificationControls()) }
    var testNotificationSent by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(GrevinDarkBg)
            .verticalScroll(rememberScrollState())
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            text = "REAL-TIME PUSH NOTIFICATIONS",
            color = GrevinCyan,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace
        )
        Text(
            text = "Firebase Cloud Messaging & Android Heads-Up Notifications • Alerts trigger even when app is closed",
            color = GrevinTextMuted,
            fontSize = 11.sp
        )

        // Master Switch Card
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(GrevinCard, RoundedCornerShape(10.dp))
                .padding(14.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Enable Background Push Alerts",
                        color = GrevinTextPrimary,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Native Android system notifications",
                        color = GrevinTextMuted,
                        fontSize = 11.sp
                    )
                }
                Switch(
                    checked = controls.enabled,
                    onCheckedChange = { controls = controls.copy(enabled = it) }
                )
            }
        }

        // Minimum Setup Grade Filter
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(GrevinCard, RoundedCornerShape(10.dp))
                .padding(14.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "MINIMUM SETUP GRADE",
                    color = GrevinTextSecondary,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(SetupGrade.A, SetupGrade.B, SetupGrade.C).forEach { grade ->
                        val isSelected = controls.minimumGrade == grade
                        Box(
                            modifier = Modifier
                                .background(
                                    if (isSelected) GrevinCyan else GrevinCardElevated,
                                    RoundedCornerShape(6.dp)
                                )
                                .clickable { controls = controls.copy(minimumGrade = grade) }
                                .padding(horizontal = 14.dp, vertical = 6.dp)
                        ) {
                            Text(
                                text = "Grade ${grade.name}+",
                                color = if (isSelected) GrevinDarkBg else GrevinTextPrimary,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                    }
                }
            }
        }

        // Sound & Vibration Toggles
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(GrevinCard, RoundedCornerShape(10.dp))
                .padding(14.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(text = "Chime & Sound Alerts", color = GrevinTextPrimary, fontSize = 13.sp)
                    Switch(
                        checked = controls.soundAlertsEnabled,
                        onCheckedChange = { controls = controls.copy(soundAlertsEnabled = it) }
                    )
                }
                Divider(color = GrevinBorder)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(text = "Vibrate on Signal", color = GrevinTextPrimary, fontSize = 13.sp)
                    Switch(
                        checked = controls.vibrateEnabled,
                        onCheckedChange = { controls = controls.copy(vibrateEnabled = it) }
                    )
                }
            }
        }

        // Test Notification Action
        Button(
            onClick = {
                GrevinNotificationManager.sendSignalNotification(
                    context = context,
                    title = "BUY SETUP VERIFIED",
                    instrument = "XAU/USD",
                    direction = "BUY",
                    strategyName = "Previous Session POC Bounce",
                    reason = "Tested Previous POC (2738.5) after close outside Value Area. Bullish rejection confirmed.",
                    grade = "A"
                )
                testNotificationSent = true
            },
            colors = ButtonDefaults.buttonColors(containerColor = GrevinCyan),
            shape = RoundedCornerShape(8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                text = "SEND TEST ANDROID NOTIFICATION",
                color = GrevinDarkBg,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace
            )
        }

        if (testNotificationSent) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(GrevinEmerald.copy(alpha = 0.2f), RoundedCornerShape(8.dp))
                    .padding(10.dp)
            ) {
                Text(
                    text = "✓ Android notification dispatched to system tray with sound & vibration.",
                    color = GrevinEmerald,
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace
                )
            }
        }
    }
}
