package com.example.engine

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import com.example.data.model.BeastType
import com.example.data.model.Creature
import com.example.data.model.CreatureStage
import com.example.data.model.Enemy
import com.example.data.model.TileType
import com.example.data.model.XRayImpactEvent
import com.example.ui.theme.AbyssDarkVoid
import com.example.ui.theme.NeonAcidGreen
import com.example.ui.theme.NeonBoneWhite
import com.example.ui.theme.NeonCrimson
import com.example.ui.theme.NeonCyanElectric
import com.example.ui.theme.NeonMoltenAmber
import com.example.ui.theme.NeonViolet
import kotlin.math.cos
import kotlin.math.sin

object IsometricRenderer {

    // 2:1 Isometric Projection Constants (Orthographic: 45° yaw, 35.264° pitch)
    const val TILE_W = 68f
    const val TILE_H = 34f
    const val WALL_H = 38f

    fun toScreen(
        gx: Float,
        gy: Float,
        gz: Float = 0f,
        camOffsetX: Float,
        camOffsetY: Float
    ): Offset {
        val isoX = (gx - gy) * (TILE_W / 2f) + camOffsetX
        val isoY = (gx + gy) * (TILE_H / 2f) - (gz * WALL_H) + camOffsetY
        return Offset(isoX, isoY)
    }

    // -------------------------------------------------------------
    // 1. ISOMETRIC DIAMOND FLOOR TILES WITH SPECULAR REFLECTIONS
    // -------------------------------------------------------------
    fun drawIsoDiamondFloor(
        scope: DrawScope,
        gx: Int,
        gy: Int,
        tileType: TileType,
        wetness: Float,
        illumination: LightingEngine.Illumination,
        camOffsetX: Float,
        camOffsetY: Float,
        animTime: Float,
        biome: DungeonGenerator.BiomeArchetype
    ) {
        val c = toScreen(gx + 0.5f, gy + 0.5f, 0f, camOffsetX, camOffsetY)
        val hw = TILE_W / 2f
        val hh = TILE_H / 2f

        // Diamond Path
        val diamond = Path().apply {
            moveTo(c.x, c.y - hh) // Top
            lineTo(c.x + hw, c.y) // Right
            lineTo(c.x, c.y + hh) // Bottom
            lineTo(c.x - hw, c.y) // Left
            close()
        }

        val b = illumination.totalBrightness
        val tint = illumination.tintColor

        // Biome specific base floor slab shading
        val baseColor = when (tileType) {
            TileType.ACID_POOL -> Color(0xFF07210E)
            TileType.STEAM_DRAIN -> Color(0xFF26150C)
            TileType.STAIRS_DOWN -> Color(0xFF140822)
            TileType.LOOT_CHEST -> Color(0xFF181B26)
            else -> when (biome) {
                DungeonGenerator.BiomeArchetype.BONE_NURSERY -> Color(0xFF161822)
                DungeonGenerator.BiomeArchetype.STEAM_SINKS -> Color(0xFF201D1A)
                DungeonGenerator.BiomeArchetype.BILE_THICKET -> Color(0xFF0F1A12)
                DungeonGenerator.BiomeArchetype.ARACHNID_OSSUARY -> Color(0xFF1E1718)
                DungeonGenerator.BiomeArchetype.IRON_MAW -> Color(0xFF231B1B)
                DungeonGenerator.BiomeArchetype.PRIMORDIAL_CORE -> Color(0xFF0B1220)
            }
        }

        val litColor = Color(
            red = (baseColor.red * b + tint.red * 0.14f).coerceIn(0f, 1f),
            green = (baseColor.green * b + tint.green * 0.14f).coerceIn(0f, 1f),
            blue = (baseColor.blue * b + tint.blue * 0.14f).coerceIn(0f, 1f)
        )

        // Draw isometric diamond
        scope.drawPath(path = diamond, color = litColor)

        // Diamond edge bevel highlights
        scope.drawPath(
            path = diamond,
            color = Color(0x33FFFFFF).copy(alpha = (0.28f * b).coerceIn(0.08f, 0.45f)),
            style = Stroke(1.2f)
        )

        // Wet Specular Reflection (moist mud, cave sludge, chitin reflections)
        if (illumination.specularGleam > 0.12f && tileType == TileType.FLOOR) {
            val gleamAlpha = (illumination.specularGleam * wetness * 0.85f).coerceIn(0f, 0.75f)
            scope.drawOval(
                brush = Brush.radialGradient(
                    colors = listOf(
                        Color.White.copy(alpha = gleamAlpha),
                        tint.copy(alpha = gleamAlpha * 0.5f),
                        Color.Transparent
                    ),
                    center = c,
                    radius = hw * 0.8f
                ),
                topLeft = Offset(c.x - hw * 0.6f, c.y - hh * 0.6f),
                size = Size(hw * 1.2f, hh * 1.2f)
            )
        }

        // Special Hazards inside Diamond
        when (tileType) {
            TileType.ACID_POOL -> {
                val bubbleY = c.y + sin(animTime * 4f + gx) * 3f
                scope.drawCircle(
                    color = NeonAcidGreen,
                    radius = 4f,
                    center = Offset(c.x, bubbleY)
                )
                scope.drawPath(path = diamond, color = NeonAcidGreen.copy(alpha = 0.65f), style = Stroke(2f))
            }
            TileType.STEAM_DRAIN -> {
                scope.drawCircle(
                    color = NeonMoltenAmber.copy(alpha = 0.75f),
                    radius = 5f,
                    center = c
                )
            }
            TileType.LOOT_CHEST -> {
                draw3DIsoChest(scope, c, animTime)
            }
            TileType.STAIRS_DOWN -> {
                scope.drawCircle(
                    color = NeonViolet.copy(alpha = 0.85f),
                    radius = 8f,
                    center = c,
                    style = Stroke(3f)
                )
            }
            TileType.IRON_SPIKES -> {
                scope.drawCircle(color = NeonCrimson, radius = 3f, center = Offset(c.x - 6f, c.y))
                scope.drawCircle(color = NeonCrimson, radius = 3f, center = Offset(c.x + 6f, c.y))
            }
            else -> Unit
        }
    }

    // -------------------------------------------------------------
    // 2. 3D ISOMETRIC EXTRUDED WALL BLOCKS (TOP, LEFT, RIGHT FACES)
    // -------------------------------------------------------------
    fun drawIso3DWall(
        scope: DrawScope,
        gx: Int,
        gy: Int,
        camOffsetX: Float,
        camOffsetY: Float,
        biome: DungeonGenerator.BiomeArchetype
    ) {
        val baseC = toScreen(gx + 0.5f, gy + 0.5f, 0f, camOffsetX, camOffsetY)
        val topC = toScreen(gx + 0.5f, gy + 0.5f, 1f, camOffsetX, camOffsetY)
        val hw = TILE_W / 2f
        val hh = TILE_H / 2f

        // Cast isometric ground drop shadow
        val shadow = Path().apply {
            moveTo(baseC.x, baseC.y + hh)
            lineTo(baseC.x + hw + 14f, baseC.y + hh + 6f)
            lineTo(baseC.x + 14f, baseC.y + hh + 14f)
            lineTo(baseC.x - hw, baseC.y)
            close()
        }
        scope.drawPath(path = shadow, color = Color(0x66000000))

        // Left Face (angles down and left, in deep shadow)
        val leftFace = Path().apply {
            moveTo(topC.x - hw, topC.y)
            lineTo(topC.x, topC.y + hh)
            lineTo(baseC.x, baseC.y + hh)
            lineTo(baseC.x - hw, baseC.y)
            close()
        }
        scope.drawPath(
            path = leftFace,
            brush = Brush.verticalGradient(
                colors = listOf(Color(0xFF1B1D26), Color(0xFF0F1017), Color(0xFF06070A)),
                startY = topC.y,
                endY = baseC.y + hh
            )
        )
        scope.drawPath(path = leftFace, color = Color(0x44000000), style = Stroke(1.5f))

        // Right Face (angles down and right, in mid shadow)
        val rightFace = Path().apply {
            moveTo(topC.x, topC.y + hh)
            lineTo(topC.x + hw, topC.y)
            lineTo(baseC.x + hw, baseC.y)
            lineTo(baseC.x, baseC.y + hh)
            close()
        }
        scope.drawPath(
            path = rightFace,
            brush = Brush.verticalGradient(
                colors = listOf(Color(0xFF282B38), Color(0xFF181A22), Color(0xFF0A0C10)),
                startY = topC.y,
                endY = baseC.y + hh
            )
        )
        scope.drawPath(path = rightFace, color = Color(0x44000000), style = Stroke(1.5f))

        // Top Face (diamond cap catching overhead cavern ceiling ambient light)
        val topFace = Path().apply {
            moveTo(topC.x, topC.y - hh)
            lineTo(topC.x + hw, topC.y)
            lineTo(topC.x, topC.y + hh)
            lineTo(topC.x - hw, topC.y)
            close()
        }
        scope.drawPath(
            path = topFace,
            brush = Brush.verticalGradient(
                colors = listOf(Color(0xFF3F4558), Color(0xFF2A2E3B)),
                startY = topC.y - hh,
                endY = topC.y + hh
            )
        )
        // Top bevel highlight
        scope.drawPath(path = topFace, color = Color(0xFF6B7280), style = Stroke(1.5f))
    }

    // -------------------------------------------------------------
    // 3. 3D ISOMETRIC OBSIDIAN EGG ON BONE ALTAR
    // -------------------------------------------------------------
    fun drawIso3DObsidianEgg(
        scope: DrawScope,
        c: Offset,
        eggCracks: Int,
        animTime: Float
    ) {
        val w = 32f
        val h = 44f
        val pulse = 1f + sin(animTime * 5f) * 0.04f

        // Cast ground shadow
        scope.drawOval(
            brush = Brush.radialGradient(
                colors = listOf(Color(0xBB000000), Color.Transparent),
                center = Offset(c.x, c.y + 6f),
                radius = w * 0.8f
            ),
            topLeft = Offset(c.x - w * 0.8f, c.y - 4f),
            size = Size(w * 1.6f, 16f)
        )

        // 3D Egg body
        scope.drawOval(
            brush = Brush.radialGradient(
                colors = listOf(
                    Color(0xFF45495E),
                    Color(0xFF282A36),
                    Color(0xFF14151D),
                    Color(0xFF07080C)
                ),
                center = Offset(c.x - 6f, c.y - 10f),
                radius = h * 0.75f
            ),
            topLeft = Offset(c.x - (w / 2f) * pulse, c.y - h * 0.65f),
            size = Size(w * pulse, h * pulse)
        )

        // Obsidian specular rim highlight
        scope.drawArc(
            color = Color(0x66FFFFFF),
            startAngle = 170f,
            sweepAngle = 130f,
            useCenter = false,
            topLeft = Offset(c.x - w * 0.48f, c.y - h * 0.62f),
            size = Size(w * 0.96f, h * 0.96f),
            style = Stroke(2f)
        )

        // Fissure cracks based on strike count (1 to 3)
        if (eggCracks > 0) {
            val crack1 = Path().apply {
                moveTo(c.x, c.y - h * 0.5f)
                lineTo(c.x - 7f, c.y - 4f)
                lineTo(c.x + 5f, c.y + 4f)
            }
            scope.drawPath(path = crack1, color = NeonCrimson, style = Stroke(2.5f, cap = StrokeCap.Round))
        }
        if (eggCracks >= 2) {
            val crack2 = Path().apply {
                moveTo(c.x - 7f, c.y - 4f)
                lineTo(c.x - 12f, c.y + 8f)
                lineTo(c.x + 8f, c.y + 12f)
            }
            scope.drawPath(path = crack2, color = NeonAcidGreen, style = Stroke(2f, cap = StrokeCap.Round))
        }

        // Peeking sinister predator slit-eye
        scope.drawOval(color = NeonCyanElectric, topLeft = Offset(c.x - 4f, c.y - 5f), size = Size(5f, 3f))
        scope.drawOval(color = NeonCrimson, topLeft = Offset(c.x + 3f, c.y - 2f), size = Size(5f, 3f))

        // Wrapping chains
        scope.drawArc(
            color = Color(0xFFC0CADC),
            startAngle = 10f,
            sweepAngle = 160f,
            useCenter = false,
            topLeft = Offset(c.x - w * 0.6f, c.y - 6f),
            size = Size(w * 1.2f, 16f),
            style = Stroke(3.5f)
        )
    }

    // -------------------------------------------------------------
    // 4. 3D ISOMETRIC HERO CREATURE & CHAINED BEASTS
    // -------------------------------------------------------------
    fun drawIsoHeroCreature(
        scope: DrawScope,
        c: Offset,
        creature: Creature,
        animTime: Float
    ) {
        val r = 18f
        val breath = sin(animTime * 6f) * 2f

        // Cast isometric ground drop shadow
        scope.drawOval(
            brush = Brush.radialGradient(
                colors = listOf(Color(0x99000000), Color.Transparent),
                center = Offset(c.x, c.y + 8f),
                radius = r * 1.2f
            ),
            topLeft = Offset(c.x - r * 1.2f, c.y),
            size = Size(r * 2.4f, 16f)
        )

        // 3D Isometric Segmented Torso / Carapace
        scope.drawOval(
            brush = Brush.radialGradient(
                colors = listOf(
                    creature.stage.primaryColor,
                    creature.stage.primaryColor.copy(alpha = 0.75f),
                    Color(0xFF0F1117)
                ),
                center = Offset(c.x - 4f, c.y - 8f),
                radius = r * 1.3f
            ),
            topLeft = Offset(c.x - r, c.y - r + breath),
            size = Size(r * 2f, r * 1.6f)
        )

        // Carapace Ridges
        scope.drawArc(
            color = Color(0x66FFFFFF),
            startAngle = 180f,
            sweepAngle = 120f,
            useCenter = false,
            topLeft = Offset(c.x - r * 0.8f, c.y - r * 0.8f + breath),
            size = Size(r * 1.6f, r * 1.2f),
            style = Stroke(2f)
        )

        // Demonic Horns
        val hornL = Path().apply {
            moveTo(c.x - 6f, c.y - r * 0.6f)
            lineTo(c.x - 14f, c.y - r * 1.4f)
        }
        val hornR = Path().apply {
            moveTo(c.x + 6f, c.y - r * 0.6f)
            lineTo(c.x + 14f, c.y - r * 1.4f)
        }
        scope.drawPath(path = hornL, color = NeonBoneWhite, style = Stroke(3f, cap = StrokeCap.Round))
        scope.drawPath(path = hornR, color = NeonBoneWhite, style = Stroke(3f, cap = StrokeCap.Round))

        // Glowing Eyes
        scope.drawCircle(color = creature.stage.eyeColor, radius = 3.5f, center = Offset(c.x - 4f, c.y - 4f))
        scope.drawCircle(color = creature.stage.eyeColor, radius = 3.5f, center = Offset(c.x + 4f, c.y - 4f))
    }

    fun drawIsoChainedBeast(
        scope: DrawScope,
        c: Offset,
        type: BeastType,
        level: Int,
        animTime: Float,
        isAttacking: Boolean
    ) {
        val r = 14f

        // Shadow
        scope.drawOval(
            color = Color(0x77000000),
            topLeft = Offset(c.x - r, c.y + 2f),
            size = Size(r * 2f, 12f)
        )

        // Soul Aura
        scope.drawCircle(
            color = type.auraColor.copy(alpha = if (isAttacking) 0.5f else 0.25f),
            radius = r * 1.5f,
            center = c
        )

        // Body
        scope.drawCircle(
            color = Color(0xFF262836),
            radius = r,
            center = c
        )

        // Glowing Eyes
        scope.drawCircle(
            color = type.auraColor,
            radius = 3f,
            center = Offset(c.x + 3f, c.y - 3f)
        )
    }

    private fun draw3DIsoChest(scope: DrawScope, c: Offset, animTime: Float) {
        val w = 18f
        val h = 14f
        // Chest body
        scope.drawRoundRect(
            color = Color(0xFF5A391E),
            topLeft = Offset(c.x - w / 2f, c.y - h / 2f),
            size = Size(w, h),
            cornerRadius = androidx.compose.ui.geometry.CornerRadius(4f, 4f)
        )
        // Golden bands
        scope.drawLine(color = NeonMoltenAmber, start = Offset(c.x - 4f, c.y - h / 2f), end = Offset(c.x - 4f, c.y + h / 2f), strokeWidth = 2f)
        scope.drawLine(color = NeonMoltenAmber, start = Offset(c.x + 4f, c.y - h / 2f), end = Offset(c.x + 4f, c.y + h / 2f), strokeWidth = 2f)
    }
}
