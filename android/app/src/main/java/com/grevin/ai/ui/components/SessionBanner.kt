package com.grevin.ai.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.grevin.ai.engine.ActiveSessionStatus
import com.grevin.ai.ui.theme.*

@Composable
fun SessionBanner(
    sessionStatus: ActiveSessionStatus,
    simulationMode: Boolean,
    onToggleSimulation: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 6.dp)
    ) {
        // Simulation Mode Banner (Prominent warning when active)
        if (simulationMode) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(GrevinAmber.copy(alpha = 0.2f), RoundedCornerShape(8.dp))
                    .padding(horizontal = 12.dp, vertical = 8.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "⚠ SIMULATION MODE ACTIVE — SYNTHETIC DATA",
                        color = GrevinAmber,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }
            Spacer(modifier = Modifier.height(6.dp))
        }

        // Session status row
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(GrevinCard, RoundedCornerShape(8.dp))
                .padding(horizontal = 10.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .background(GrevinEmerald, RoundedCornerShape(4.dp))
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = sessionStatus.currentSession.displayName.uppercase(),
                    color = GrevinCyan,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                )
            }

            val hours = sessionStatus.timeRemainingSeconds / 3600
            val mins = (sessionStatus.timeRemainingSeconds % 3600) / 60
            Text(
                text = "${hours}h ${mins}m left • DST: ${if (sessionStatus.isUkDst) "BST" else "GMT"}",
                color = GrevinTextSecondary,
                fontSize = 11.sp,
                fontFamily = FontFamily.Monospace
            )
        }
    }
}
