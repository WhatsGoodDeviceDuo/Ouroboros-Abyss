package com.example.data.model

import androidx.compose.ui.graphics.Color
import com.example.ui.theme.NeonAcidGreen
import com.example.ui.theme.NeonBoneWhite
import com.example.ui.theme.NeonCrimson
import com.example.ui.theme.NeonCyanElectric
import com.example.ui.theme.NeonMoltenAmber
import com.example.ui.theme.NeonViolet

enum class EnemySpecies(
    val enemyName: String,
    val isPackAnimal: Boolean,
    val packType: String,
    val isBoss: Boolean,
    val bodyColor: Color,
    val eyeColor: Color,
    val wearDescription: String,
    val canBeCaptured: Boolean,
    val capturableBeastType: BeastType?
) {
    DIRE_WOLF_PACK(
        enemyName = "Scarreared Dire Wolf",
        isPackAnimal = true,
        packType = "WOLF_PACK",
        isBoss = false,
        bodyColor = Color(0xFF383844),
        eyeColor = NeonCrimson,
        wearDescription = "Matted fur pierced by broken arrows and rusted iron barbs.",
        canBeCaptured = false,
        capturableBeastType = null
    ),
    DIRE_ALPHA(
        enemyName = "Alpha Dire Behemoth",
        isPackAnimal = true,
        packType = "WOLF_PACK",
        isBoss = true,
        bodyColor = Color(0xFF222430),
        eyeColor = NeonCrimson,
        wearDescription = "Towering wolf with a scarred blind eye and heavy chain collar.",
        canBeCaptured = true,
        capturableBeastType = BeastType.DIRE_ALPHA_WOLF
    ),
    SUBTERRANEAN_ANGLER_FISH(
        enemyName = "Abyssal Prowler Fish",
        isPackAnimal = true,
        packType = "FISH_SCHOOL",
        isBoss = false,
        bodyColor = Color(0xFF1B2F3D),
        eyeColor = NeonCyanElectric,
        wearDescription = "Scales peeled raw, sharp fangs dripping with caustic pond sludge.",
        canBeCaptured = false,
        capturableBeastType = null
    ),
    ANGLER_LEVIATHAN(
        enemyName = "Primordial Trench Angler",
        isPackAnimal = true,
        packType = "FISH_SCHOOL",
        isBoss = true,
        bodyColor = Color(0xFF0F1E29),
        eyeColor = NeonCyanElectric,
        wearDescription = "Colossal deep-sea predator bound in anchor chains, glowing lure flashing violently.",
        canBeCaptured = true,
        capturableBeastType = BeastType.SUBTERRANEAN_ANGLER
    ),
    WEAVER_SPIDER(
        enemyName = "Brood Weaver Spider",
        isPackAnimal = true,
        packType = "SPIDER_COLONY",
        isBoss = false,
        bodyColor = Color(0xFF281E1E),
        eyeColor = NeonAcidGreen,
        wearDescription = "Hairy chitin cracked and leaking acidic venom, surrounded by cocooned prey.",
        canBeCaptured = false,
        capturableBeastType = null
    ),
    BROOD_MOTHER(
        enemyName = "Gargantuan Web Matron",
        isPackAnimal = true,
        packType = "SPIDER_COLONY",
        isBoss = true,
        bodyColor = Color(0xFF1E1010),
        eyeColor = NeonAcidGreen,
        wearDescription = "Nightmarish arachnid with chained iron spikes driven through its thorax.",
        canBeCaptured = true,
        capturableBeastType = BeastType.BROOD_WEAVER_SPIDER
    ),
    IRON_STEAM_BOAR(
        enemyName = "Slag-Tusk Boar",
        isPackAnimal = true,
        packType = "BOAR_SOUNDER",
        isBoss = false,
        bodyColor = Color(0xFF3B2E24),
        eyeColor = NeonMoltenAmber,
        wearDescription = "Rusted iron plating riveted directly into thick scarred hide.",
        canBeCaptured = false,
        capturableBeastType = null
    ),
    SLAG_TITAN(
        enemyName = "Furnace Slag Titan",
        isPackAnimal = false,
        packType = "SOLO",
        isBoss = true,
        bodyColor = Color(0xFF291E16),
        eyeColor = NeonMoltenAmber,
        wearDescription = "Massive molten brute trailing burning iron chains and spewing steam.",
        canBeCaptured = true,
        capturableBeastType = BeastType.STEAM_DRAIN_BOAR
    ),
    SKELETAL_HYENA(
        enemyName = "Gloom Hyena",
        isPackAnimal = true,
        packType = "HYENA_PACK",
        isBoss = false,
        bodyColor = Color(0xFF2E2C33),
        eyeColor = NeonViolet,
        wearDescription = "Emaciated ribcage visible through torn flesh; jaws click viciously.",
        canBeCaptured = false,
        capturableBeastType = null
    ),
    CARRION_TYRANT(
        enemyName = "The Flayed Carrion Tyrant",
        isPackAnimal = true,
        packType = "HYENA_PACK",
        isBoss = true,
        bodyColor = Color(0xFF201826),
        eyeColor = NeonViolet,
        wearDescription = "Crowned in chained skulls; wields a brutal bone club.",
        canBeCaptured = true,
        capturableBeastType = BeastType.BONE_CARVER_HYENA
    ),
    BURROWING_ACID_WORM(
        enemyName = "Carapace Dredge Worm",
        isPackAnimal = false,
        packType = "SOLO",
        isBoss = false,
        bodyColor = Color(0xFF2D382B),
        eyeColor = NeonAcidGreen,
        wearDescription = "Segmented stone armor worn down from drilling through granite caverns.",
        canBeCaptured = false,
        capturableBeastType = null
    )
}

data class Enemy(
    val id: String,
    val species: EnemySpecies,
    val posX: Float,
    val posY: Float,
    val currentHp: Float,
    val maxHp: Float,
    val attackPower: Float,
    val speed: Float,
    val packId: Int = 0,
    val isAlpha: Boolean = false,
    val facingAngle: Float = 0f,
    val attackCooldownTimer: Float = 0f,
    val stunnedTimer: Float = 0f,
    val alertState: Boolean = false,
    val targetX: Float = 0f,
    val targetY: Float = 0f
)
