package com.example.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val DarkColorScheme = darkColorScheme(
    primary = NeonCrimson,
    onPrimary = AbyssDarkVoid,
    primaryContainer = NeonCrimsonDark,
    onPrimaryContainer = NeonBoneWhite,
    secondary = NeonAcidGreen,
    onSecondary = AbyssDarkVoid,
    secondaryContainer = NeonAcidGreenDark,
    onSecondaryContainer = NeonBoneWhite,
    tertiary = NeonCyanElectric,
    onTertiary = AbyssDarkVoid,
    background = AbyssDarkVoid,
    onBackground = NeonBoneWhite,
    surface = AbyssDungeonFloor,
    onSurface = NeonBoneWhite,
    surfaceVariant = AbyssSurfaceElevated,
    onSurfaceVariant = NeonBoneWhite,
    outline = AbyssSteelBorder
)

@Composable
fun MyApplicationTheme(
    darkTheme: Boolean = true, // Gloomy underworld is always dark by aesthetic mandate
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography = Typography,
        content = content
    )
}
