package com.example.data.model

import androidx.compose.ui.graphics.Color
import com.example.ui.theme.NeonAcidGreen
import com.example.ui.theme.NeonCrimson
import com.example.ui.theme.NeonCyanElectric
import com.example.ui.theme.NeonMoltenAmber
import com.example.ui.theme.NeonViolet

enum class TileType(
    val isWalkable: Boolean,
    val hazardDamage: Float = 0f,
    val slowFactor: Float = 1.0f,
    val emitsLight: Boolean = false,
    val lightColor: Color = Color.Transparent
) {
    FLOOR(true),
    WALL(false),
    DOOR_LOCKED(false),
    DOOR_UNLOCKED(true),
    STAIRS_DOWN(true),
    ACID_POOL(true, hazardDamage = 12f, slowFactor = 0.6f, emitsLight = true, lightColor = NeonAcidGreen),
    STEAM_DRAIN(true, hazardDamage = 18f, slowFactor = 0.8f, emitsLight = true, lightColor = NeonMoltenAmber),
    IRON_SPIKES(true, hazardDamage = 15f, slowFactor = 0.5f),
    WEB_TRAP(true, hazardDamage = 0f, slowFactor = 0.25f),
    DEEP_CHASM(false),
    PUZZLE_PLATE(true),
    PUZZLE_LEVER(false),
    LOOT_CHEST(false)
}

data class LightSource(
    val x: Float,
    val y: Float,
    val radius: Float,
    val color: Color,
    val intensity: Float = 1.0f,
    val flickerSpeed: Float = 1.0f
)

data class PuzzleElement(
    val id: String,
    val gridX: Int,
    val gridY: Int,
    val isActivated: Boolean = false,
    val linkedDoorX: Int = -1,
    val linkedDoorY: Int = -1,
    val hintPrompt: String
)

data class DungeonLevel(
    val depth: Int, // 1 to 13
    val name: String,
    val themeDescription: String,
    val width: Int,
    val height: Int,
    val tiles: Array<Array<TileType>>,
    val wetnessMap: Array<FloatArray>, // 0.0 to 1.0 for specular highlights and moisture
    val lightSources: List<LightSource>,
    val puzzleElements: List<PuzzleElement>,
    val stairsX: Int,
    val stairsY: Int,
    val spawnX: Float,
    val spawnY: Float,
    val bossSpawned: Boolean = false,
    val bossDefeated: Boolean = false,
    val isLevelCompleted: Boolean = false
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        other as DungeonLevel
        return depth == other.depth && name == other.name
    }

    override fun hashCode(): Int {
        return depth.hashCode() * 31 + name.hashCode()
    }
}
