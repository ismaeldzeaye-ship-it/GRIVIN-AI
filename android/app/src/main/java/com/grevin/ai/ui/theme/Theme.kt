package com.grevin.ai.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val DarkColorScheme = darkColorScheme(
    primary = GrevinCyan,
    secondary = GrevinAmber,
    tertiary = GrevinEmerald,
    background = GrevinDarkBg,
    surface = GrevinSurface,
    onPrimary = GrevinDarkBg,
    onSecondary = GrevinDarkBg,
    onBackground = GrevinTextPrimary,
    onSurface = GrevinTextPrimary,
    outline = GrevinBorder
)

@Composable
fun GrevinAITheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography = GrevinTypography,
        content = content
    )
}
