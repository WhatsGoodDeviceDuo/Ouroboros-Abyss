package com.example.data.model

import androidx.compose.ui.graphics.Color
import com.example.ui.theme.NeonAcidGreen
import com.example.ui.theme.NeonCrimson
import com.example.ui.theme.NeonCyanElectric
import com.example.ui.theme.NeonMoltenAmber
import com.example.ui.theme.NeonViolet

enum class BeastType(
    val title: String,
    val passiveDesc: String,
    val auraColor: Color,
    val attackRange: Float,
    val baseDamage: Float
) {
    DIRE_ALPHA_WOLF(
        title = "Chained Dire Alpha",
        passiveDesc = "+25% Move Speed & Pack Frenzy (+15% Atk)",
        auraColor = NeonCrimson,
        attackRange = 2.0f,
        baseDamage = 22f
    ),
    BROOD_WEAVER_SPIDER(
        title = "Chained Brood Weaver",
        passiveDesc = "Periodically traps closest foe in sticky venom web",
        auraColor = NeonAcidGreen,
        attackRange = 3.5f,
        baseDamage = 16f
    ),
    SUBTERRANEAN_ANGLER(
        title = "Chained Deep Angler",
        passiveDesc = "Bioluminescent radar reveals hazards & pulses blinding flash",
        auraColor = NeonCyanElectric,
        attackRange = 2.8f,
        baseDamage = 19f
    ),
    STEAM_DRAIN_BOAR(
        title = "Chained Slag Boar",
        passiveDesc = "+30% Damage Reduction & Steam Cleave",
        auraColor = NeonMoltenAmber,
        attackRange = 1.8f,
        baseDamage = 26f
    ),
    BONE_CARVER_HYENA(
        title = "Chained Carrion Carver",
        passiveDesc = "+20% Crit Chance & +10% Lifesteal on all strikes",
        auraColor = NeonViolet,
        attackRange = 2.2f,
        baseDamage = 24f
    )
}

data class ChainJoint(
    val x: Float,
    val y: Float
)

data class ChainedBeast(
    val id: String,
    val type: BeastType,
    val level: Int = 1,
    val currentExp: Int = 0,
    val maxExp: Int = 100,
    val posX: Float = 0f,
    val posY: Float = 0f,
    val chainLength: Float = 1.8f,
    val chainLinks: List<ChainJoint> = emptyList(),
    val attackTimer: Float = 0f,
    val isPerformingSynergy: Boolean = false
)
