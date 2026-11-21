package com.example.data.model

import androidx.compose.ui.graphics.Color
import com.example.ui.theme.NeonAcidGreen
import com.example.ui.theme.NeonCrimson
import com.example.ui.theme.NeonCyanElectric
import com.example.ui.theme.NeonMoltenAmber
import com.example.ui.theme.NeonViolet

enum class EquipSlot {
    WEAPON,
    CARAPACE_ARMOR,
    CHAIN_COLLAR,
    ABYSS_RELIC
}

enum class ItemRarity(
    val title: String,
    val color: Color
) {
    COMMON("Worn Dungeon Scrap", Color(0xFF8E95A5)),
    RARE("Infused Relic", NeonCyanElectric),
    EPIC("Ancient Underworld Curio", NeonViolet),
    LEGENDARY("Primeval Cataclysm God-Armament", NeonCrimson)
}

data class Equipment(
    val id: String,
    val name: String,
    val slot: EquipSlot,
    val rarity: ItemRarity,
    val attackBonus: Float = 0f,
    val defenseBonus: Float = 0f,
    val critBonus: Float = 0f,
    val lifestealBonus: Float = 0f,
    val speedBonus: Float = 0f,
    val lightGlowBonus: Float = 0f,
    val wearCondition: String,
    val specialPerk: String,
    val isEquipped: Boolean = false
)
