package com.grevin.ai.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.grevin.ai.model.Candle
import com.grevin.ai.model.VolumeProfile
import com.grevin.ai.ui.theme.*
import kotlin.math.max
import kotlin.math.min

@Composable
fun ChartCanvas(
    candles: List<Candle>,
    volumeProfile: VolumeProfile?,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(280.dp)
            .background(GrevinSurface, RoundedCornerShape(12.dp))
            .padding(8.dp)
    ) {
        if (candles.isEmpty()) {
            Text(
                text = "cTrader Not Connected — No live feed available",
                color = GrevinTextMuted,
                modifier = Modifier.align(Alignment.Center)
            )
            return@Box
        }

        Canvas(modifier = Modifier.fillMaxSize()) {
            val canvasWidth = size.width
            val canvasHeight = size.height

            var minPrice = Double.MAX_VALUE
            var maxPrice = Double.MIN_VALUE

            for (c in candles) {
                if (c.low < minPrice) minPrice = c.low
                if (c.high > maxPrice) maxPrice = c.high
            }

            if (volumeProfile != null) {
                if (volumeProfile.vah > maxPrice) maxPrice = volumeProfile.vah
                if (volumeProfile.valLevel < minPrice) minPrice = volumeProfile.valLevel
            }

            val pricePadding = (maxPrice - minPrice) * 0.08
            val plotMin = minPrice - pricePadding
            val plotMax = maxPrice + pricePadding
            val priceSpan = max(0.001, plotMax - plotMin)

            fun getY(price: Double): Float {
                return (canvasHeight - ((price - plotMin) / priceSpan * canvasHeight)).toFloat()
            }

            // Draw Volume Profile horizontal histogram on right 25% of canvas
            if (volumeProfile != null && volumeProfile.levels.isNotEmpty()) {
                val vpWidth = canvasWidth * 0.22f
                val vpStartX = canvasWidth - vpWidth
                val maxLevelVol = volumeProfile.levels.maxOfOrNull { it.volume } ?: 1.0

                for (lvl in volumeProfile.levels) {
                    val y = getY(lvl.price)
                    val barW = ((lvl.volume / maxLevelVol) * vpWidth).toFloat()
                    val isPoc = kotlin.math.abs(lvl.price - volumeProfile.poc) <= volumeProfile.stepSize * 0.6
                    val isInsideVA = lvl.price in volumeProfile.valLevel..volumeProfile.vah

                    val barColor = when {
                        isPoc -> GrevinCyan.copy(alpha = 0.5f)
                        isInsideVA -> GrevinAmber.copy(alpha = 0.25f)
                        else -> GrevinBorder.copy(alpha = 0.4f)
                    }

                    drawRect(
                        color = barColor,
                        topLeft = Offset(vpStartX, y - 2f),
                        size = Size(barW, 4f)
                    )
                }

                // Draw POC horizontal dashed line
                val pocY = getY(volumeProfile.poc)
                drawLine(
                    color = GrevinCyan,
                    start = Offset(0f, pocY),
                    end = Offset(canvasWidth, pocY),
                    strokeWidth = 2f,
                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(12f, 8f), 0f)
                )

                // Draw VAH solid line
                val vahY = getY(volumeProfile.vah)
                drawLine(
                    color = GrevinEmerald,
                    start = Offset(0f, vahY),
                    end = Offset(canvasWidth, vahY),
                    strokeWidth = 1.5f
                )

                // Draw VAL solid line
                val valY = getY(volumeProfile.valLevel)
                drawLine(
                    color = GrevinRose,
                    start = Offset(0f, valY),
                    end = Offset(canvasWidth, valY),
                    strokeWidth = 1.5f
                )
            }

            // Draw Candlesticks across left 75% of chart
            val chartAreaWidth = canvasWidth * 0.75f
            val candleCount = candles.size
            val candleSpacing = chartAreaWidth / max(1, candleCount)
            val candleBodyWidth = max(2f, candleSpacing * 0.65f)

            candles.forEachIndexed { i, c ->
                val x = i * candleSpacing + (candleSpacing / 2f)
                val isBull = c.close >= c.open
                val color = if (isBull) GrevinEmerald else GrevinRose

                val highY = getY(c.high)
                val lowY = getY(c.low)
                val openY = getY(c.open)
                val closeY = getY(c.close)

                // Wick
                drawLine(
                    color = color,
                    start = Offset(x, highY),
                    end = Offset(x, lowY),
                    strokeWidth = 1.5f
                )

                // Body
                val bodyTop = min(openY, closeY)
                val bodyBottom = max(openY, closeY)
                val bodyH = max(2f, bodyBottom - bodyTop)

                drawRect(
                    color = color,
                    topLeft = Offset(x - (candleBodyWidth / 2f), bodyTop),
                    size = Size(candleBodyWidth, bodyH)
                )
            }
        }

        // Overlay Labels
        Column(
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(4.dp)
        ) {
            if (volumeProfile != null) {
                Text(
                    text = "APPROXIMATE (tick volume)",
                    color = GrevinAmber,
                    fontSize = 10.sp,
                    fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
                )
                Text(
                    text = "POC: ${volumeProfile.poc} | VAH: ${volumeProfile.vah} | VAL: ${volumeProfile.valLevel}",
                    color = GrevinTextSecondary,
                    fontSize = 10.sp,
                    fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
                )
            }
        }
    }
}
