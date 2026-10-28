package com.grevin.ai.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.grevin.ai.engine.*
import com.grevin.ai.model.*
import com.grevin.ai.ui.components.ChartCanvas
import com.grevin.ai.ui.components.SessionBanner
import com.grevin.ai.ui.theme.*

@Composable
fun HomeScreen(
    selectedSymbol: String,
    onSelectSymbol: (String) -> Unit,
    simulationMode: Boolean,
    onToggleSimulation: () -> Unit
) {
    val symbols = listOf("XAU/USD", "EUR/USD", "GBP/USD", "NAS100", "US100")
    val sessionStatus = remember { MarketSessionEngine.getCurrentSessionStatus() }

    // Candles state: If simulation mode is OFF and cTrader not connected, show empty/unconnected state
    val sampleCandles = remember(selectedSymbol, simulationMode) {
        if (!simulationMode) {
            emptyList<Candle>()
        } else {
            val basePrice = when (selectedSymbol) {
                "XAU/USD" -> 2742.50
                "EUR/USD" -> 1.0845
                "GBP/USD" -> 1.2980
                "NAS100", "US100" -> 20450.0
                else -> 100.0
            }
            val list = mutableListOf<Candle>()
            var p = basePrice
            for (i in 0 until 40) {
                val delta = (kotlin.random.Random.nextDouble() - 0.49) * (basePrice * 0.002)
                val open = p
                val close = p + delta
                val high = maxOf(open, close) + kotlin.random.Random.nextDouble() * (basePrice * 0.001)
                val low = minOf(open, close) - kotlin.random.Random.nextDouble() * (basePrice * 0.001)
                val vol = 500.0 + kotlin.random.Random.nextDouble() * 3500.0
                list.add(Candle(1000L + i * 60, open, high, low, close, vol))
                p = close
            }
            list
        }
    }

    val volumeProfile = remember(sampleCandles) {
        if (sampleCandles.isNotEmpty()) {
            VolumeProfileEngine.calculateVolumeProfile(sampleCandles, 2, session = sessionStatus.currentSession)
        } else null
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(GrevinDarkBg)
            .verticalScroll(rememberScrollState())
    ) {
        SessionBanner(
            sessionStatus = sessionStatus,
            simulationMode = simulationMode,
            onToggleSimulation = onToggleSimulation
        )

        // Symbol Watchlist Selector
        LazyRow(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(symbols) { sym ->
                val isSelected = sym == selectedSymbol
                Box(
                    modifier = Modifier
                        .background(
                            if (isSelected) GrevinCyan.copy(alpha = 0.2f) else GrevinCard,
                            RoundedCornerShape(8.dp)
                        )
                        .clickable { onSelectSymbol(sym) }
                        .padding(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Text(
                        text = sym,
                        color = if (isSelected) GrevinCyan else GrevinTextSecondary,
                        fontSize = 12.sp,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }
        }

        // Connection Card
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 6.dp)
                .background(GrevinCard, RoundedCornerShape(10.dp))
                .padding(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = if (simulationMode) "cTrader: Simulation Engine" else "cTrader: Not Connected",
                        color = if (simulationMode) GrevinAmber else GrevinRose,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                    Text(
                        text = if (simulationMode) "Latency: 12ms (Local test)" else "Live feed requires verified cTrader bridge",
                        color = GrevinTextMuted,
                        fontSize = 11.sp
                    )
                }

                Box(
                    modifier = Modifier
                        .background(
                            if (simulationMode) GrevinAmber else GrevinCardElevated,
                            RoundedCornerShape(6.dp)
                        )
                        .clickable { onToggleSimulation() }
                        .padding(horizontal = 10.dp, vertical = 6.dp)
                ) {
                    Text(
                        text = if (simulationMode) "SIMULATION ON" else "ENABLE SIM",
                        color = if (simulationMode) GrevinDarkBg else GrevinTextSecondary,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }
        }

        // Chart Canvas Area
        Box(modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)) {
            ChartCanvas(candles = sampleCandles, volumeProfile = volumeProfile)
        }

        // Institutional Metrics Panel
        if (volumeProfile != null) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 6.dp)
                    .background(GrevinCard, RoundedCornerShape(10.dp))
                    .padding(12.dp)
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "INSTITUTIONAL VOLUME PROFILE",
                        color = GrevinCyan,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text(text = "POINT OF CONTROL (POC)", color = GrevinTextMuted, fontSize = 10.sp)
                            Text(text = "${volumeProfile.poc}", color = GrevinCyan, fontSize = 14.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                        }
                        Column {
                            Text(text = "VALUE AREA HIGH (70%)", color = GrevinTextMuted, fontSize = 10.sp)
                            Text(text = "${volumeProfile.vah}", color = GrevinEmerald, fontSize = 14.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                        }
                        Column {
                            Text(text = "VALUE AREA LOW (70%)", color = GrevinTextMuted, fontSize = 10.sp)
                            Text(text = "${volumeProfile.valLevel}", color = GrevinRose, fontSize = 14.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                        }
                    }
                    Text(
                        text = "Calculation Type: APPROXIMATE (tick volume)",
                        color = GrevinAmber,
                        fontSize = 10.sp,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }
        }
    }
}
