package com.example.data.model

import androidx.compose.ui.graphics.Color
import com.example.ui.theme.NeonAcidGreen
import com.example.ui.theme.NeonBoneWhite
import com.example.ui.theme.NeonCrimson
import com.example.ui.theme.NeonCyanElectric
import com.example.ui.theme.NeonMoltenAmber
import com.example.ui.theme.NeonViolet

enum class CreatureStage(
    val displayName: String,
    val description: String,
    val primaryColor: Color,
    val eyeColor: Color,
    val specialAbilityName: String,
    val specialAbilityDesc: String
) {
    EGG(
        displayName = "Obsidian Dragon Egg",
        description = "Brittle shell bound in rusted underworld chains upon the Bone Altar.",
        primaryColor = Color(0xFF242632),
        eyeColor = NeonCrimson,
        specialAbilityName = "Hatch",
        specialAbilityDesc = "Crack free from the cosmic shell."
    ),
    HATCHLING_LARVA(
        displayName = "Feral Hatchling",
        description = "Small, agile quad-ped with razor mandibles and scuttling claws.",
        primaryColor = Color(0xFF4A4E69),
        eyeColor = NeonCrimson,
        specialAbilityName = "Savage Lash",
        specialAbilityDesc = "Lunge forward, tearing through armor."
    ),
    ACID_WYRM(
        displayName = "Acidic Cavern Wyrm",
        description = "Coated in corrosive underworld slime. Immune to bile hazards; spews toxic pools.",
        primaryColor = NeonAcidGreen,
        eyeColor = NeonCyanElectric,
        specialAbilityName = "Caustic Bile",
        specialAbilityDesc = "Spew pooling acid that dissolves enemies."
    ),
    SHADOW_STALKER(
        displayName = "Gloom Shadow Stalker",
        description = "Feline predator wrapped in ethereal shadows with high-speed blink.",
        primaryColor = Color(0xFF1E1428),
        eyeColor = NeonViolet,
        specialAbilityName = "Spectral Blink",
        specialAbilityDesc = "Teleport behind target with guaranteed bone-crush crit."
    ),
    STEAM_GOLEMITE(
        displayName = "Steam-Plated Drake",
        description = "Heavy iron carapaces venting scalding steam. High defense and ground quakes.",
        primaryColor = NeonMoltenAmber,
        eyeColor = NeonCrimson,
        specialAbilityName = "Scalding Quake",
        specialAbilityDesc = "Slam ground emitting high-pressure steam shockwave."
    ),
    BLOOD_LEVIATHAN(
        displayName = "Vampiric Blood Fiend",
        description = "Bat-winged serpentine beast draining life essence from prey.",
        primaryColor = NeonCrimson,
        eyeColor = NeonBoneWhite,
        specialAbilityName = "Crimson Siphon",
        specialAbilityDesc = "Drains life from all surrounding pack creatures."
    ),
    ABYSSAL_CHIMERA(
        displayName = "Primeval Abyssal Sovereign",
        description = "The ultimate manifestation. Channels chains as weaponized appendages.",
        primaryColor = NeonViolet,
        eyeColor = NeonCyanElectric,
        specialAbilityName = "Chain Cataclysm",
        specialAbilityDesc = "Chains ignite, whipping all foes in massive radius."
    )
}

data class Creature(
    val stage: CreatureStage = CreatureStage.EGG,
    val level: Int = 1,
    val currentHp: Float = 100f,
    val maxHp: Float = 100f,
    val currentStamina: Float = 100f,
    val maxStamina: Float = 100f,
    val currentExp: Int = 0,
    val maxExp: Int = 100,
    val evolutionPoints: Int = 0,
    val baseAttack: Float = 0f, // 0 in Egg stage!
    val baseDefense: Float = 6f,
    val critChance: Float = 0.20f,
    val lifeSteal: Float = 0.08f,
    val moveSpeed: Float = 4.8f,
    val posX: Float = 5.5f, // Altar center in Bone Nursery
    val posY: Float = 5.5f,
    val posZ: Float = 0.0f,
    val velocityX: Float = 0f,
    val velocityY: Float = 0f,
    val isGrounded: Boolean = true,
    val facingAngle: Float = 0.785f, // 45 degrees isometric down-right
    val facingRight: Boolean = true,
    val eggCracks: Int = 0,
    val isDashing: Boolean = false,
    val dashTimer: Float = 0f,
    val attackState: Int = 0,
    val attackTimer: Float = 0f,
    val invulnerableTimer: Float = 0f
)
