package com.grevin.ai.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.grevin.ai.model.*
import com.grevin.ai.ui.theme.*

@Composable
fun SignalsScreen(
    signals: List<TradingSignal>,
    onSelectSignal: (TradingSignal) -> Unit
) {
    var filterStrategy by remember { mutableStateOf<StrategyType?>(null) }
    var expandedSignalId by remember { mutableStateOf<String?>(null) }

    val filtered = remember(signals, filterStrategy) {
        if (filterStrategy == null) signals else signals.filter { it.strategy == filterStrategy }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(GrevinDarkBg)
            .padding(12.dp)
    ) {
        Text(
            text = "INSTITUTIONAL SIGNALS FEED",
            color = GrevinCyan,
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace
        )
        Text(
            text = "Calculated strictly on candle close • Single 2R Targets • A/B/C Grades",
            color = GrevinTextMuted,
            fontSize = 11.sp
        )

        Spacer(modifier = Modifier.height(10.dp))

        // Strategy Filter Buttons
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            val strategies = listOf(
                null to "ALL",
                StrategyType.POC_BOUNCE to "POC BOUNCE",
                StrategyType.VALUE_AREA_REVERSAL to "VA REVERSAL",
                StrategyType.CONFIRMED_BREAKOUT to "BREAKOUT"
            )

            strategies.forEach { (type, label) ->
                val isSelected = filterStrategy == type
                Box(
                    modifier = Modifier
                        .background(
                            if (isSelected) GrevinCyan else GrevinCard,
                            RoundedCornerShape(6.dp)
                        )
                        .clickable { filterStrategy = type }
                        .padding(horizontal = 8.dp, vertical = 5.dp)
                ) {
                    Text(
                        text = label,
                        color = if (isSelected) GrevinDarkBg else GrevinTextSecondary,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        if (filtered.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .background(GrevinCard, RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "No Active Signals for Selected Filter",
                        color = GrevinTextSecondary,
                        fontSize = 13.sp,
                        fontFamily = FontFamily.Monospace
                    )
                    Text(
                        text = "Awaiting candle close & institutional criteria confirmation",
                        color = GrevinTextMuted,
                        fontSize = 11.sp
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(filtered) { signal ->
                    val isExpanded = expandedSignalId == signal.id
                    val dirColor = when (signal.direction) {
                        SignalDirection.BUY -> GrevinEmerald
                        SignalDirection.SELL -> GrevinRose
                        SignalDirection.WAIT -> GrevinAmber
                    }
                    val gradeColor = when (signal.grade) {
                        SetupGrade.A -> GrevinEmerald
                        SetupGrade.B -> GrevinCyan
                        SetupGrade.C -> GrevinAmber
                    }

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(GrevinCard, RoundedCornerShape(10.dp))
                            .clickable {
                                expandedSignalId = if (isExpanded) null else signal.id
                            }
                            .padding(12.dp)
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(
                                        modifier = Modifier
                                            .background(dirColor.copy(alpha = 0.2f), RoundedCornerShape(4.dp))
                                            .padding(horizontal = 8.dp, vertical = 4.dp)
                                    ) {
                                        Text(
                                            text = signal.direction.name,
                                            color = dirColor,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Bold,
                                            fontFamily = FontFamily.Monospace
                                        )
                                    }
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = signal.symbol,
                                        color = GrevinTextPrimary,
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.Bold,
                                        fontFamily = FontFamily.Monospace
                                    )
                                }

                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(
                                        modifier = Modifier
                                            .background(gradeColor.copy(alpha = 0.2f), RoundedCornerShape(4.dp))
                                            .padding(horizontal = 6.dp, vertical = 2.dp)
                                    ) {
                                        Text(
                                            text = "GRADE ${signal.grade.name}",
                                            color = gradeColor,
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            fontFamily = FontFamily.Monospace
                                        )
                                    }
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Box(
                                        modifier = Modifier
                                            .background(GrevinPurple.copy(alpha = 0.2f), RoundedCornerShape(4.dp))
                                            .padding(horizontal = 6.dp, vertical = 2.dp)
                                    ) {
                                        Text(
                                            text = "2.0R TARGET",
                                            color = GrevinPurple,
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            fontFamily = FontFamily.Monospace
                                        )
                                    }
                                }
                            }

                            Text(
                                text = signal.strategyName,
                                color = GrevinTextSecondary,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold
                            )

                            Text(
                                text = signal.reason,
                                color = GrevinTextMuted,
                                fontSize = 11.sp
                            )

                            // Price Levels
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(GrevinSurface, RoundedCornerShape(6.dp))
                                    .padding(8.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Column {
                                    Text(text = "ENTRY", color = GrevinTextMuted, fontSize = 9.sp)
                                    Text(text = "${signal.entryPrice}", color = GrevinTextPrimary, fontSize = 12.sp, fontFamily = FontFamily.Monospace)
                                }
                                Column {
                                    Text(text = "STOP LOSS", color = GrevinTextMuted, fontSize = 9.sp)
                                    Text(text = "${signal.stopLoss}", color = GrevinRose, fontSize = 12.sp, fontFamily = FontFamily.Monospace)
                                }
                                Column {
                                    Text(text = "TAKE PROFIT (2R)", color = GrevinTextMuted, fontSize = 9.sp)
                                    Text(text = "${signal.tp}", color = GrevinEmerald, fontSize = 12.sp, fontFamily = FontFamily.Monospace)
                                }
                            }

                            // Expandable 8-point checklist
                            if (isExpanded) {
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = "INSTITUTIONAL SETUP CHECKLIST",
                                    color = GrevinCyan,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    fontFamily = FontFamily.Monospace
                                )
                                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    signal.checklist.forEach { item ->
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween
                                        ) {
                                            Text(
                                                text = "${if (item.passed) "✓" else "✗"} ${item.label}",
                                                color = if (item.passed) GrevinEmerald else GrevinTextMuted,
                                                fontSize = 11.sp
                                            )
                                            if (item.requiredForGradeA) {
                                                Text(
                                                    text = "Grade A Req",
                                                    color = GrevinAmber,
                                                    fontSize = 9.sp,
                                                    fontFamily = FontFamily.Monospace
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
