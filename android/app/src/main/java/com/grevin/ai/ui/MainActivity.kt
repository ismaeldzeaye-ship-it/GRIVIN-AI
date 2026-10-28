package com.grevin.ai.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.grevin.ai.engine.SetupEngine
import com.grevin.ai.model.Candle
import com.grevin.ai.model.Timeframe
import com.grevin.ai.notifications.GrevinNotificationManager
import com.grevin.ai.ui.screens.*
import com.grevin.ai.ui.theme.*

enum class AppTab(val title: String, val icon: ImageVector) {
    HOME("Chart", Icons.Default.ShowChart),
    SIGNALS("Signals", Icons.Default.Bolt),
    RISK("Risk", Icons.Default.Calculate),
    ALERTS("Alerts", Icons.Default.Notifications),
    VERIFY("Verify", Icons.Default.CheckCircle)
}

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize Android notification channels for background FCM alerts
        GrevinNotificationManager.createNotificationChannels(this)

        setContent {
            GrevinAITheme {
                MainAppScaffold()
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainAppScaffold() {
    var currentTab by remember { mutableStateOf(AppTab.HOME) }
    var selectedSymbol by remember { mutableStateOf("XAU/USD") }
    var simulationMode by remember { mutableStateOf(false) } // False by default

    // Real-time generated signals based on strict 3 strategies
    val activeSignals = remember(selectedSymbol, simulationMode) {
        if (!simulationMode) {
            emptyList()
        } else {
            // Generate test signal verifying the 3 strategies
            val testCandles = mutableListOf<Candle>()
            for (i in 0 until 30) {
                testCandles.add(Candle(1000L + i * 60, 2740.0, 2742.0, 2738.0, 2740.0, 1500.0))
            }
            // Candle testing POC
            testCandles.add(Candle(1000L + 38 * 60, 2741.0, 2743.0, 2739.0, 2742.0, 800.0))
            testCandles.add(Candle(1000L + 39 * 60, 2740.0, 2742.0, 2737.5, 2740.8, 2200.0))
            SetupEngine.evaluateTradingSignals(selectedSymbol, testCandles, Timeframe.M15, 2740.8, 0.1, 2)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text(
                                text = "GREVIN AI",
                                color = GrevinCyan,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace
                            )
                            Text(
                                text = "Institutional Order Flow & SMC Platform",
                                color = GrevinTextMuted,
                                fontSize = 10.sp
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = GrevinSurface)
            )
        },
        bottomBar = {
            NavigationBar(
                containerColor = GrevinSurface,
                tonalElevation = 8.dp
            ) {
                AppTab.values().forEach { tab ->
                    val isSelected = currentTab == tab
                    NavigationBarItem(
                        selected = isSelected,
                        onClick = { currentTab = tab },
                        icon = {
                            Icon(
                                imageVector = tab.icon,
                                contentDescription = tab.title,
                                tint = if (isSelected) GrevinCyan else GrevinTextMuted
                            )
                        },
                        label = {
                            Text(
                                text = tab.title,
                                color = if (isSelected) GrevinCyan else GrevinTextMuted,
                                fontSize = 10.sp,
                                fontFamily = FontFamily.Monospace
                            )
                        },
                        colors = NavigationBarItemDefaults.colors(
                            indicatorColor = GrevinCyan.copy(alpha = 0.15f)
                        )
                    )
                }
            }
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .background(GrevinDarkBg)
        ) {
            when (currentTab) {
                AppTab.HOME -> HomeScreen(
                    selectedSymbol = selectedSymbol,
                    onSelectSymbol = { selectedSymbol = it },
                    simulationMode = simulationMode,
                    onToggleSimulation = { simulationMode = !simulationMode }
                )
                AppTab.SIGNALS -> SignalsScreen(
                    signals = activeSignals,
                    onSelectSignal = {}
                )
                AppTab.RISK -> RiskCalculatorScreen(
                    currentSymbol = selectedSymbol,
                    simulationMode = simulationMode
                )
                AppTab.ALERTS -> AlertsScreen()
                AppTab.VERIFY -> VerificationScreen()
            }
        }
    }
}
