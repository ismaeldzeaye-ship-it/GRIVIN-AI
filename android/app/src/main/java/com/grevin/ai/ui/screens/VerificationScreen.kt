package com.grevin.ai.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.grevin.ai.engine.TestResult
import com.grevin.ai.engine.VerificationEngine
import com.grevin.ai.ui.theme.*

@Composable
fun VerificationScreen() {
    var testSuiteState by remember { mutableStateOf(VerificationEngine.runAllUnitTests()) }

    val (allPassed, results) = testSuiteState

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(GrevinDarkBg)
            .padding(14.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "UNIT TESTS & VERIFICATION",
                    color = GrevinCyan,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                )
                Text(
                    text = "8/8 Unit tests for mathematical & setup integrity",
                    color = GrevinTextMuted,
                    fontSize = 11.sp
                )
            }

            Box(
                modifier = Modifier
                    .background(
                        if (allPassed) GrevinEmerald.copy(alpha = 0.2f) else GrevinRose.copy(alpha = 0.2f),
                        RoundedCornerShape(6.dp)
                    )
                    .padding(horizontal = 10.dp, vertical = 4.dp)
            ) {
                Text(
                    text = if (allPassed) "ALL PASSED (8/8)" else "FAILURES DETECTED",
                    color = if (allPassed) GrevinEmerald else GrevinRose,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                )
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        Button(
            onClick = {
                testSuiteState = VerificationEngine.runAllUnitTests()
            },
            colors = ButtonDefaults.buttonColors(containerColor = GrevinCardElevated),
            shape = RoundedCornerShape(8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                text = "RE-RUN NATIVE VERIFICATION SUITE",
                color = GrevinCyan,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        LazyColumn(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(results) { test ->
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(GrevinCard, RoundedCornerShape(8.dp))
                        .padding(10.dp)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = test.name,
                                color = GrevinTextPrimary,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                text = if (test.passed) "PASSED" else "FAILED",
                                color = if (test.passed) GrevinEmerald else GrevinRose,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                        Text(
                            text = test.message,
                            color = GrevinTextSecondary,
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                }
            }
        }
    }
}
