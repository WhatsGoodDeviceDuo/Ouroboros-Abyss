package com.example.engine

import com.example.data.model.BeastType
import com.example.data.model.DungeonLevel
import com.example.data.model.Enemy
import com.example.data.model.EnemySpecies
import com.example.data.model.EquipSlot
import com.example.data.model.Equipment
import com.example.data.model.ItemRarity
import com.example.data.model.LightSource
import com.example.data.model.PuzzleElement
import com.example.data.model.TileType
import com.example.ui.theme.NeonAcidGreen
import com.example.ui.theme.NeonCrimson
import com.example.ui.theme.NeonCyanElectric
import com.example.ui.theme.NeonMoltenAmber
import com.example.ui.theme.NeonViolet
import kotlin.random.Random

object DungeonGenerator {

    enum class BiomeArchetype(
        val title: String,
        val floorDescription: String,
        val primaryGlow: androidx.compose.ui.graphics.Color
    ) {
        BONE_NURSERY("The Bone Nursery", "Decrepit crypts, cracked egg clutches, damp limestone, hanging iron chains.", NeonViolet),
        STEAM_SINKS("The Steam Sinks", "Rusted iron walkways, geysers emitting scalding vapor, pipe mazes, boiling runoff channels.", NeonMoltenAmber),
        BILE_THICKET("The Bile Thicket", "Subterranean jungle overrun by fungal stalks, corrosive acid cascades, fluorescent moss.", NeonAcidGreen),
        ARACHNID_OSSUARY("The Arachnid Ossuary", "Massive silk web bridges suspended over abysses, desiccated animal husks cocooned in high-tension threads.", NeonCrimson),
        IRON_MAW("The Iron Maw", "Torture engines, crushing gear-traps, spikes, molten rune conduits.", NeonMoltenAmber),
        PRIMORDIAL_CORE("The Primordial Core", "Concentric ritual circles floating over an endless cosmic trench.", NeonCyanElectric)
    }

    data class LevelMeta(
        val depth: Int,
        val name: String,
        val archetype: BiomeArchetype,
        val description: String,
        val keySpecies: EnemySpecies,
        val hasBoss: Boolean
    )

    private val levelMetas = listOf(
        LevelMeta(1, "The Bone Nursery - Hatching Altar", BiomeArchetype.BONE_NURSERY, "Sacred subterranean crypts. An obsidian egg rests safely upon the bone altar in rusted chains.", EnemySpecies.DIRE_WOLF_PACK, false),
        LevelMeta(2, "The Bone Nursery - Lower Crypts", BiomeArchetype.BONE_NURSERY, "Limestone chambers littered with cracked clutches. Dire wolf packs flank through shadows.", EnemySpecies.DIRE_ALPHA, true),
        LevelMeta(3, "The Steam Sinks - Boiling Runoff", BiomeArchetype.STEAM_SINKS, "Rusted walkways suspended over bubbling boiling channels.", EnemySpecies.IRON_STEAM_BOAR, false),
        LevelMeta(4, "The Steam Sinks - Geyser Maze", BiomeArchetype.STEAM_SINKS, "Scalding iron pipes hissing thick steam through narrow corridors.", EnemySpecies.IRON_STEAM_BOAR, false),
        LevelMeta(5, "The Steam Sinks - Slag Foundry", BiomeArchetype.STEAM_SINKS, "The foundry center where the Slag Titan commands rivers of liquid iron.", EnemySpecies.SLAG_TITAN, true),
        LevelMeta(6, "The Bile Thicket - Fungal Caverns", BiomeArchetype.BILE_THICKET, "Overgrown fluorescent moss and towering fungal stalks dripping corrosive slime.", EnemySpecies.BURROWING_ACID_WORM, false),
        LevelMeta(7, "The Bile Thicket - Acid Cascades", BiomeArchetype.BILE_THICKET, "Rivers of glowing green bile carving deep ravines through the stone.", EnemySpecies.SUBTERRANEAN_ANGLER_FISH, false),
        LevelMeta(8, "The Bile Thicket - Trench Grotto", BiomeArchetype.BILE_THICKET, "Submerged stone bridges guarded by the Primordial Trench Angler.", EnemySpecies.ANGLER_LEVIATHAN, true),
        LevelMeta(9, "The Arachnid Ossuary - Web Bridges", BiomeArchetype.ARACHNID_OSSUARY, "Taut silk web bridges spanning across bottomless dark chasms.", EnemySpecies.WEAVER_SPIDER, false),
        LevelMeta(10, "The Arachnid Ossuary - Brood Nest", BiomeArchetype.ARACHNID_OSSUARY, "Massive web cocoons hanging from above. The Brood Mother's vanguard.", EnemySpecies.BROOD_MOTHER, true),
        LevelMeta(11, "The Iron Maw - Torture Conduit", BiomeArchetype.IRON_MAW, "Rusted gear-traps, blood altars, and iron crushing pendulums.", EnemySpecies.SKELETAL_HYENA, false),
        LevelMeta(12, "The Iron Maw - Gate of the Flayed", BiomeArchetype.IRON_MAW, "Puzzle-sealed locked shackle doors leading to the planetary core.", EnemySpecies.CARRION_TYRANT, true),
        LevelMeta(13, "Sanctum of the Primeval Mother", BiomeArchetype.PRIMORDIAL_CORE, "Concentric ritual circles over an endless cosmic trench. The final twist awaits.", EnemySpecies.BROOD_MOTHER, true)
    )

    fun getLevelMeta(depth: Int): LevelMeta {
        val clamped = depth.coerceIn(1, 13)
        return levelMetas[clamped - 1]
    }

    /**
     * Procedural Isometric Dungeon Generator using BSP room partitioning.
     * Generates a 32x32 isometric grid with depth-sorted rooms, corridors,
     * hazards, chests, and enemies.
     */
    fun generateLevel(depth: Int): Pair<DungeonLevel, List<Enemy>> {
        val meta = getLevelMeta(depth)
        val width = 32
        val height = 32
        val random = Random(depth * 54321L)

        val tiles = Array(height) { Array(width) { TileType.WALL } }
        val wetnessMap = Array(height) { FloatArray(width) }
        val lights = mutableListOf<LightSource>()
        val puzzleElements = mutableListOf<PuzzleElement>()
        val enemies = mutableListOf<Enemy>()

        // 1. Carve Rooms via BSP Partitioning
        val rooms = mutableListOf<Room>()

        // Room 0: The Sanctuary Chamber (Always at x: 3..9, y: 3..9)
        // In Level 1, this room has ZERO enemies!
        val sanctuary = Room(3, 3, 6, 6)
        rooms.add(sanctuary)
        carveRoom(tiles, wetnessMap, sanctuary, 0.75f)

        // Carve additional chambers
        val roomCount = 5 + (depth / 2)
        for (i in 1..roomCount) {
            val rx = random.nextInt(10, width - 8)
            val ry = random.nextInt(10, height - 8)
            val rw = random.nextInt(5, 8)
            val rh = random.nextInt(5, 8)
            val r = Room(rx, ry, rw, rh)
            rooms.add(r)
            carveRoom(tiles, wetnessMap, r, 0.6f + random.nextFloat() * 0.35f)

            // Connect to previous room with isometric corridors
            val prev = rooms[i - 1]
            var cx = prev.centerX
            var cy = prev.centerY
            while (cx != r.centerX) {
                tiles[cy][cx] = TileType.FLOOR
                wetnessMap[cy][cx] = 0.7f
                cx += if (r.centerX > cx) 1 else -1
            }
            while (cy != r.centerY) {
                tiles[cy][cx] = TileType.FLOOR
                wetnessMap[cy][cx] = 0.7f
                cy += if (r.centerY > cy) 1 else -1
            }
        }

        // Spawn point is in center of Sanctuary Altar
        val spawnX = sanctuary.centerX.toFloat() + 0.5f
        val spawnY = sanctuary.centerY.toFloat() + 0.5f

        // Stairs down is in final room
        val lastRoom = rooms.last()
        val stairsX = lastRoom.centerX
        val stairsY = lastRoom.centerY
        tiles[stairsY][stairsX] = TileType.STAIRS_DOWN

        // 2. Add Biome-Specific Hazards and Lights
        rooms.forEachIndexed { idx, room ->
            val lightColor = meta.archetype.primaryGlow
            lights.add(
                LightSource(
                    x = room.centerX.toFloat() + 0.5f,
                    y = room.centerY.toFloat() + 0.5f,
                    radius = 5.5f,
                    color = lightColor,
                    intensity = 0.95f
                )
            )

            // Hazards inside intermediate rooms (NEVER in Sanctuary Room 0!)
            if (idx > 0 && idx < rooms.size - 1) {
                when (meta.archetype) {
                    BiomeArchetype.STEAM_SINKS -> {
                        tiles[room.y + 1][room.x + 1] = TileType.STEAM_DRAIN
                        lights.add(LightSource(room.x + 1.5f, room.y + 1.5f, 3.5f, NeonMoltenAmber, 0.85f))
                    }
                    BiomeArchetype.BILE_THICKET -> {
                        tiles[room.y + 1][room.x + 1] = TileType.ACID_POOL
                        if (room.x + 2 < room.x + room.w) tiles[room.y + 1][room.x + 2] = TileType.ACID_POOL
                        lights.add(LightSource(room.x + 1.5f, room.y + 1.5f, 4.0f, NeonAcidGreen, 0.9f))
                    }
                    BiomeArchetype.ARACHNID_OSSUARY -> {
                        tiles[room.centerY][room.centerX] = TileType.WEB_TRAP
                    }
                    BiomeArchetype.IRON_MAW -> {
                        tiles[room.y + 1][room.x + 1] = TileType.IRON_SPIKES
                    }
                    else -> Unit
                }

                // Chests
                if (random.nextFloat() < 0.65f) {
                    val chestX = room.x + room.w - 2
                    val chestY = room.y + room.h - 2
                    tiles[chestY][chestX] = TileType.LOOT_CHEST
                }
            }
        }

        // 3. Spawn Enemies (ZERO enemies in Sanctuary Room 0!)
        rooms.forEachIndexed { rIdx, room ->
            if (rIdx == 0) {
                // Completely empty & safe!
                return@forEachIndexed
            }

            if (rIdx == rooms.size - 1) {
                // Boss or Pack Leader in final chamber
                enemies.add(
                    Enemy(
                        id = "boss_depth_$depth",
                        species = meta.keySpecies,
                        posX = room.centerX + 0.5f,
                        posY = room.centerY + 0.5f,
                        currentHp = 180f + depth * 70f,
                        maxHp = 180f + depth * 70f,
                        attackPower = 12f + depth * 4f,
                        speed = 2.4f,
                        isAlpha = true,
                        packId = 99
                    )
                )
            } else {
                // Pack creatures
                val packSize = if (depth == 1) 2 else random.nextInt(2, 4)
                for (p in 0 until packSize) {
                    val ex = room.x + 1.5f + (p * 1.2f)
                    val ey = room.y + 1.5f + (p * 0.8f)
                    enemies.add(
                        Enemy(
                            id = "enemy_${depth}_${rIdx}_$p",
                            species = meta.keySpecies,
                            posX = ex,
                            posY = ey,
                            currentHp = 35f + depth * 12f,
                            maxHp = 35f + depth * 12f,
                            attackPower = 6f + depth * 3f,
                            speed = 2.2f,
                            packId = rIdx,
                            isAlpha = (p == 0)
                        )
                    )
                }
            }
        }

        val level = DungeonLevel(
            depth = depth,
            name = meta.name,
            themeDescription = meta.description,
            width = width,
            height = height,
            tiles = tiles,
            wetnessMap = wetnessMap,
            lightSources = lights,
            puzzleElements = puzzleElements,
            stairsX = stairsX,
            stairsY = stairsY,
            spawnX = spawnX,
            spawnY = spawnY
        )

        return Pair(level, enemies)
    }

    private fun carveRoom(
        tiles: Array<Array<TileType>>,
        wetnessMap: Array<FloatArray>,
        room: Room,
        wetness: Float
    ) {
        for (y in room.y until room.y + room.h) {
            for (x in room.x until room.x + room.w) {
                tiles[y][x] = TileType.FLOOR
                wetnessMap[y][x] = wetness
            }
        }
    }

    fun generateChestLoot(depth: Int): Equipment {
        val random = Random.Default
        val rarityRoll = random.nextFloat()
        val rarity = when {
            rarityRoll > 0.88f -> ItemRarity.LEGENDARY
            rarityRoll > 0.60f -> ItemRarity.EPIC
            rarityRoll > 0.30f -> ItemRarity.RARE
            else -> ItemRarity.COMMON
        }

        val slots = EquipSlot.values()
        val slot = slots[random.nextInt(slots.size)]

        val (name, perk) = when (slot) {
            EquipSlot.WEAPON -> when (rarity) {
                ItemRarity.COMMON -> "Notched Bone Blade" to "Basic melee swipe"
                ItemRarity.RARE -> "Acid-Dipped Barbed Mandible" to "Deals +15% Acid Bleed over 3s"
                ItemRarity.EPIC -> "Shadow-Forged Spine Sickle" to "Triggers X-Ray Bone Crunch on 25% of strikes"
                ItemRarity.LEGENDARY -> "Void-Eater's World Rupture Claws" to "Crushes armor and fires piercing neon shockwaves"
            }
            EquipSlot.CARAPACE_ARMOR -> when (rarity) {
                ItemRarity.COMMON -> "Cracked Chitin Plates" to "+4 Defense"
                ItemRarity.RARE -> "Acid-Hardened Shell" to "+10 Def, 50% Acid Hazard Resistance"
                ItemRarity.EPIC -> "Steam-Riveted Slag Carapace" to "+18 Def, retaliates with scalding steam burst"
                ItemRarity.LEGENDARY -> "The Primeval Living Brood-Armor" to "+35 Def, 15% Max HP Regen and immune to traps"
            }
            EquipSlot.CHAIN_COLLAR -> when (rarity) {
                ItemRarity.COMMON -> "Rusted Iron Shackle" to "+5% Chain damage"
                ItemRarity.RARE -> "Glowing Spiked Shackle" to "Chained beasts gain +20% Attack Range"
                ItemRarity.EPIC -> "Soul-Binding Tether Collar" to "Chained beasts share 15% of your lifesteal"
                ItemRarity.LEGENDARY -> "Cataclysm God-Chains" to "Allows an extra chained beast companion and +50% synergy damage"
            }
            EquipSlot.ABYSS_RELIC -> when (rarity) {
                ItemRarity.COMMON -> "Polished Obsidian Shard" to "+1.0m Light radius"
                ItemRarity.RARE -> "Bioluminescent Angler Bulb" to "+2.5m Light radius, illuminates hidden chests"
                ItemRarity.EPIC -> "Pulsing Blood Ruby" to "+15% Critical Chance and +12% Lifesteal"
                ItemRarity.LEGENDARY -> "The Unhatched Cosmic Seed" to "Multiplies all elemental attunements by 2x"
            }
        }

        val multiplier = 1f + (depth * 0.15f)
        val statScale = when (rarity) {
            ItemRarity.COMMON -> 1.0f
            ItemRarity.RARE -> 1.6f
            ItemRarity.EPIC -> 2.5f
            ItemRarity.LEGENDARY -> 4.2f
        } * multiplier

        return Equipment(
            id = "loot_${System.currentTimeMillis()}_${random.nextInt(1000)}",
            name = name,
            slot = slot,
            rarity = rarity,
            attackBonus = if (slot == EquipSlot.WEAPON) 10f * statScale else 2f * statScale,
            defenseBonus = if (slot == EquipSlot.CARAPACE_ARMOR) 6f * statScale else 1f * statScale,
            critBonus = if (slot == EquipSlot.ABYSS_RELIC || slot == EquipSlot.WEAPON) 0.05f * statScale.coerceAtMost(5f) else 0f,
            lifestealBonus = if (rarity == ItemRarity.EPIC || rarity == ItemRarity.LEGENDARY) 0.04f * statScale.coerceAtMost(3f) else 0f,
            lightGlowBonus = if (slot == EquipSlot.ABYSS_RELIC) 1.5f * statScale.coerceAtMost(4f) else 0f,
            wearCondition = when (random.nextInt(4)) {
                0 -> "Blood-stained and battle-scarred"
                1 -> "Dented iron pitted with deep acid burns"
                2 -> "Corroded ancient underworld relic"
                else -> "Imbued with pulsing neon luminescence"
            },
            specialPerk = perk
        )
    }

    private data class Room(val x: Int, val y: Int, val w: Int, val h: Int) {
        val centerX: Int get() = x + w / 2
        val centerY: Int get() = y + h / 2
    }
}
