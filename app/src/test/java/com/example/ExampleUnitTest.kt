package com.example

import com.example.data.model.BeastType
import com.example.data.model.Creature
import com.example.data.model.CreatureStage
import com.example.engine.DungeonGenerator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ExampleUnitTest {

    @Test
    fun `test creature lifecycle from egg to larva to evolved forms`() {
        val egg = Creature()
        assertEquals(CreatureStage.EGG, egg.stage)
        assertEquals(0f, egg.baseAttack, 0.01f) // Egg cannot attack yet

        // Hatching
        val hatchling = egg.copy(
            stage = CreatureStage.HATCHLING_LARVA,
            baseAttack = 24f,
            moveSpeed = 4.8f
        )
        assertEquals(CreatureStage.HATCHLING_LARVA, hatchling.stage)
        assertTrue(hatchling.baseAttack > egg.baseAttack)

        // Evolution to Acid Wyrm
        val acidWyrm = hatchling.copy(stage = CreatureStage.ACID_WYRM)
        assertEquals(CreatureStage.ACID_WYRM, acidWyrm.stage)
        assertEquals("Acidic Cavern Wyrm", acidWyrm.stage.displayName)
    }

    @Test
    fun `test dungeon generator procedural depths 1 through 13`() {
        for (depth in 1..13) {
            val (level, enemies) = DungeonGenerator.generateLevel(depth)
            assertEquals(depth, level.depth)
            assertTrue("Width should be valid", level.width >= 24)
            assertTrue("Height should be valid", level.height >= 24)
            assertTrue("Tiles must be non-empty", level.tiles.isNotEmpty())
            assertTrue("Enemies must be populated", enemies.isNotEmpty())
            assertNotNull(level.themeDescription)
        }
    }

    @Test
    fun `test level 13 sanctum has final boss`() {
        val (depth13, enemies13) = DungeonGenerator.generateLevel(13)
        assertEquals("Sanctum of the Primeval Mother", depth13.name)
        val boss = enemies13.find { it.species.isBoss }
        assertNotNull("Level 13 must have a boss", boss)
    }

    @Test
    fun `test loot generation contains valid rarities and slots`() {
        for (depth in 1..10) {
            val loot = DungeonGenerator.generateChestLoot(depth)
            assertNotNull(loot.name)
            assertNotNull(loot.slot)
            assertTrue(loot.wearCondition.isNotEmpty())
            assertTrue(loot.specialPerk.isNotEmpty())
        }
    }

    @Test
    fun `test chained beast types have valid stats and descriptions`() {
        BeastType.values().forEach { beastType ->
            assertTrue(beastType.baseDamage > 0f)
            assertTrue(beastType.attackRange > 0f)
            assertTrue(beastType.passiveDesc.isNotEmpty())
        }
    }
}
