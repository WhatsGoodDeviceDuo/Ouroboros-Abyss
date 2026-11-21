package com.example.engine

import androidx.compose.ui.graphics.Color
import com.example.data.model.LightSource
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.pow

object LightingEngine {

    data class Illumination(
        val totalBrightness: Float, // 0.0 (pitch black) to 1.0 (bright)
        val tintColor: Color,
        val specularGleam: Float // 0.0 to 1.0 for moist reflections
    )

    fun calculateTileLight(
        tileX: Float,
        tileY: Float,
        lights: List<LightSource>,
        wetness: Float,
        playerX: Float,
        playerY: Float,
        playerGlowRadius: Float,
        playerGlowColor: Color,
        timeSeconds: Float
    ): Illumination {
        var rAcc = 0.08f // Gloomy ambient baseline
        var gAcc = 0.09f
        var bAcc = 0.12f
        var totalIntensity = 0.10f
        var maxSpecular = 0.0f

        // 1. Evaluate player creature's personal luminescence
        val pDist = hypot(tileX - playerX, tileY - playerY)
        if (pDist < playerGlowRadius) {
            val factor = (1.0f - (pDist / playerGlowRadius)).pow(1.3f)
            totalIntensity += factor * 0.9f
            rAcc += playerGlowColor.red * factor
            gAcc += playerGlowColor.green * factor
            bAcc += playerGlowColor.blue * factor

            if (wetness > 0.2f && pDist > 0.3f) {
                // Specular reflection off damp stone
                val gleam = (1.0f - (pDist / playerGlowRadius)).pow(2.2f) * wetness
                if (gleam > maxSpecular) maxSpecular = gleam
            }
        }

        // 2. Evaluate all dynamic cavern lights (torches, acid, steam, chained companions)
        for (light in lights) {
            val dist = hypot(tileX - light.x, tileY - light.y)
            if (dist < light.radius) {
                // Flickering dynamic flame/spore pulsation
                val flicker = 1.0f + 0.08f * cos(timeSeconds * light.flickerSpeed * 4f + light.x)
                val atten = (1.0f - (dist / light.radius)).pow(1.5f) * light.intensity * flicker

                totalIntensity += atten
                rAcc += light.color.red * atten
                gAcc += light.color.green * atten
                bAcc += light.color.blue * atten

                // Moist specular reflection
                if (wetness > 0.3f) {
                    val gleam = (1.0f - (dist / light.radius)).pow(3.0f) * wetness * 1.2f
                    if (gleam > maxSpecular) maxSpecular = gleam
                }
            }
        }

        val clampedIntensity = totalIntensity.coerceIn(0.12f, 1.0f)
        val finalColor = Color(
            red = (rAcc / clampedIntensity).coerceIn(0f, 1f),
            green = (gAcc / clampedIntensity).coerceIn(0f, 1f),
            blue = (bAcc / clampedIntensity).coerceIn(0f, 1f),
            alpha = clampedIntensity
        )

        return Illumination(
            totalBrightness = clampedIntensity,
            tintColor = finalColor,
            specularGleam = maxSpecular.coerceIn(0f, 1f)
        )
    }
}
