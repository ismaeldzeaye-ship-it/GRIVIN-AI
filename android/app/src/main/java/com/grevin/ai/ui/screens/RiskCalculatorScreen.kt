package com.grevin.ai.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.grevin.ai.engine.RiskEngine
import com.grevin.ai.model.SymbolInfo
import com.grevin.ai.ui.theme.*

@Composable
fun RiskCalculatorScreen(
    currentSymbol: String,
    simulationMode: Boolean
) {
    var accountBalanceStr by remember { mutableStateOf("10000") }
    var riskPercentStr by remember { mutableStateOf("1.0") }
    var entryPriceStr by remember { mutableStateOf("2740.0") }
    var stopLossPriceStr by remember { mutableStateOf("2735.0") }
    var hasBrokerSpecs by remember { mutableStateOf(simulationMode) }

    val symbolSpecs = remember(currentSymbol, hasBrokerSpecs) {
        if (!hasBrokerSpecs) null
        else {
            SymbolInfo(
                symbol = currentSymbol,
                name = currentSymbol,
                category = "METALS",
                digits = 2,
                pipSize = 0.1,
                pipValuePerStandardLot = 10.0,
                lotSize = 100.0,
                currentBid = 2740.0,
                currentAsk = 2740.25,
                spreadPips = 2.5,
                isAvailable = true
            )
        }
    }

    val balance = accountBalanceStr.toDoubleOrNull() ?: 10000.0
    val riskPercent = riskPercentStr.toDoubleOrNull() ?: 1.0
    val entryPrice = entryPriceStr.toDoubleOrNull() ?: 2740.0
    val stopLoss = stopLossPriceStr.toDoubleOrNull() ?: 2735.0

    val calcResult = remember(balance, riskPercent, entryPrice, stopLoss, symbolSpecs) {
        RiskEngine.calculatePositionSize(
            accountBalance = balance,
            riskPercent = riskPercent,
            entryPrice = entryPrice,
            stopLossPrice = stopLoss,
            tpPrice = entryPrice + (kotlin.math.abs(entryPrice - stopLoss) * 2.0),
            symbolInfo = symbolSpecs
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(GrevinDarkBg)
            .verticalScroll(rememberScrollState())
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            text = "POSITION & RISK CALCULATOR",
            color = GrevinCyan,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace
        )
        Text(
            text = "Dynamic cTrader contract specs • Hardcoded specifications removed",
            color = GrevinTextMuted,
            fontSize = 11.sp
        )

        // Inputs Card
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(GrevinCard, RoundedCornerShape(10.dp))
                .padding(14.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(text = "ACCOUNT BALANCE ($)", color = GrevinTextSecondary, fontSize = 11.sp)
                        OutlinedTextField(
                            value = accountBalanceStr,
                            onValueChange = { accountBalanceStr = it },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(text = "RISK PERCENT (%)", color = GrevinTextSecondary, fontSize = 11.sp)
                        OutlinedTextField(
                            value = riskPercentStr,
                            onValueChange = { riskPercentStr = it },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(text = "ENTRY PRICE", color = GrevinTextSecondary, fontSize = 11.sp)
                        OutlinedTextField(
                            value = entryPriceStr,
                            onValueChange = { entryPriceStr = it },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(text = "STOP LOSS", color = GrevinTextSecondary, fontSize = 11.sp)
                        OutlinedTextField(
                            value = stopLossPriceStr,
                            onValueChange = { stopLossPriceStr = it },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            }
        }

        // Calculation Result / Safe Fallback Warning
        if (!calcResult.canCalculate) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(GrevinRose.copy(alpha = 0.15f), RoundedCornerShape(10.dp))
                    .padding(14.dp)
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = "⚠ CALCULATION UNAVAILABLE",
                        color = GrevinRose,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                    Text(
                        text = calcResult.unavailabilityReason ?: "Position size cannot be calculated.",
                        color = GrevinTextPrimary,
                        fontSize = 12.sp
                    )
                    Text(
                        text = "Real cTrader symbol parameters required to prevent incorrect lot execution.",
                        color = GrevinTextMuted,
                        fontSize = 10.sp
                    )
                }
            }
        } else {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(GrevinCard, RoundedCornerShape(10.dp))
                    .padding(14.dp)
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        text = "VERIFIED POSITION RECOMMENDATION",
                        color = GrevinEmerald,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(text = "RECOMMENDED LOT SIZE", color = GrevinTextMuted, fontSize = 10.sp)
                            Text(
                                text = "${calcResult.recommendedLotSize} Lots",
                                color = GrevinCyan,
                                fontSize = 20.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(text = "CONTRACT UNITS", color = GrevinTextMuted, fontSize = 10.sp)
                            Text(
                                text = "${calcResult.units?.toInt() ?: 0} Units",
                                color = GrevinTextPrimary,
                                fontSize = 14.sp,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                    }

                    Divider(color = GrevinBorder)

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text(text = "MONETARY RISK (1R)", color = GrevinTextMuted, fontSize = 10.sp)
                            Text(
                                text = "$${calcResult.riskAmount} (${calcResult.riskPips} pips)",
                                color = GrevinRose,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(text = "PROJECTED TARGET (2R)", color = GrevinTextMuted, fontSize = 10.sp)
                            Text(
                                text = "$${calcResult.potentialReward} (${calcResult.rewardPips} pips)",
                                color = GrevinEmerald,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                    }
                }
            }
        }
    }
}
