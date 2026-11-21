package com.example.data.model

import androidx.compose.ui.graphics.Color

enum class BoneBreakType(
    val title: String,
    val skeletonPart: String,
    val soundFrequency: Float
) {
    SPINAL_FRACTURE("SPINAL COLUMN SNAPPED", "SPINE", 85f),
    SKULL_CRUSH("CRANIAL PLATE SHATTERED", "SKULL", 65f),
    RIB_SPLINTER("THORACIC RIBS CRUSHED", "RIBCAGE", 110f),
    MANDIBLE_BREAK("JAWBONE DISLOCATED", "JAW", 140f),
    CARAPACE_BREACH("CHITIN SHELL OBLITERATED", "SHELL", 95f)
}

data class XRayImpactEvent(
    val id: Long,
    val enemyName: String,
    val breakType: BoneBreakType,
    val posX: Float,
    val posY: Float,
    val durationMs: Long = 1200L,
    val startTime: Long = System.currentTimeMillis()
)

data class BloodParticle(
    val x: Float,
    val y: Float,
    val vx: Float,
    val vy: Float,
    val color: Color,
    val radius: Float,
    val alpha: Float = 1.0f,
    val life: Float = 1.0f
)

data class DamageFloater(
    val id: Long,
    val text: String,
    val x: Float,
    val y: Float,
    val color: Color,
    val isCrit: Boolean = false,
    val life: Float = 1.0f
)
