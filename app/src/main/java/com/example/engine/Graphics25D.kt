package com.example.engine

import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import com.example.data.model.BeastType
import com.example.data.model.Creature
import com.example.data.model.CreatureStage
import com.example.data.model.Enemy
import com.example.data.model.TileType
import com.example.ui.theme.AbyssDarkVoid
import com.example.ui.theme.AbyssDungeonFloor
import com.example.ui.theme.AbyssSteelBorder
import com.example.ui.theme.AbyssStoneWall
import com.example.ui.theme.AbyssSurfaceElevated
import com.example.ui.theme.NeonAcidGreen
import com.example.ui.theme.NeonBoneWhite
import com.example.ui.theme.NeonCrimson
import com.example.ui.theme.NeonCyanElectric
import com.example.ui.theme.NeonMoltenAmber
import com.example.ui.theme.NeonViolet
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

object Graphics25D {

    // -------------------------------------------------------------
    // 1. FLOOR TILES WITH 2.5D STONE TEXTURING & SPECULAR REFLECTIONS
    // -------------------------------------------------------------
    fun drawStoneFloorTile(
        scope: DrawScope,
        x: Float,
        y: Float,
        size: Float,
        wetness: Float,
        illumination: LightingEngine.Illumination,
        tx: Int,
        ty: Int
    ) {
        val b = illumination.totalBrightness
        val tint = illumination.tintColor

        // Base flagstone color with depth modulation
        val seed = (tx * 73856093 xor ty * 19349663)
        val variant = (seed % 15).toFloat() / 255f
        val baseR = (AbyssDungeonFloor.red + variant) * b + tint.red * 0.12f
        val baseG = (AbyssDungeonFloor.green + variant) * b + tint.green * 0.12f
        val baseB = (AbyssDungeonFloor.blue + variant) * b + tint.blue * 0.12f

        val tileColor = Color(baseR.coerceIn(0f, 1f), baseG.coerceIn(0f, 1f), baseB.coerceIn(0f, 1f))

        // Tile base slab
        scope.drawRect(
            color = tileColor,
            topLeft = Offset(x, y),
            size = Size(size, size)
        )

        // Beveled flagstone edge lines (chiseled stone appearance)
        scope.drawLine(
            color = Color(0x33FFFFFF).copy(alpha = (0.25f * b).coerceIn(0.05f, 0.4f)),
            start = Offset(x + 1f, y + 1f),
            end = Offset(x + size - 1f, y + 1f),
            strokeWidth = 1.5f
        )
        scope.drawLine(
            color = Color(0x55000000),
            start = Offset(x + 1f, y + size - 1f),
            end = Offset(x + size - 1f, y + size - 1f),
            strokeWidth = 2f
        )
        scope.drawLine(
            color = Color(0x55000000),
            start = Offset(x + size - 1f, y + 1f),
            end = Offset(x + size - 1f, y + size - 1f),
            strokeWidth = 2f
        )

        // Cracked flagstone detail
        if (seed % 3 == 0) {
            val crack = Path().apply {
                moveTo(x + size * 0.25f, y)
                lineTo(x + size * 0.4f, y + size * 0.35f)
                lineTo(x + size * 0.3f, y + size * 0.65f)
                lineTo(x + size * 0.6f, y + size)
            }
            scope.drawPath(
                path = crack,
                color = Color(0x33000000),
                style = Stroke(1.2f)
            )
        }

        // Wet Specular Reflection (moist cavern puddles glistening)
        if (illumination.specularGleam > 0.12f) {
            val gleamAlpha = (illumination.specularGleam * wetness * 0.85f).coerceIn(0f, 0.8f)
            scope.drawOval(
                brush = Brush.radialGradient(
                    colors = listOf(
                        Color.White.copy(alpha = gleamAlpha),
                        tint.copy(alpha = gleamAlpha * 0.5f),
                        Color.Transparent
                    ),
                    center = Offset(x + size * 0.55f, y + size * 0.45f),
                    radius = size * 0.45f
                ),
                topLeft = Offset(x + size * 0.1f, y + size * 0.15f),
                size = Size(size * 0.8f, size * 0.6f)
            )
        }
    }

    // -------------------------------------------------------------
    // 2. 2.5D EXTRUDED STONE WALL WITH DEPTH, MORTAR & HANGING CHAINS
    // -------------------------------------------------------------
    fun draw25DWallBlock(
        scope: DrawScope,
        x: Float,
        y: Float,
        size: Float,
        tx: Int,
        ty: Int
    ) {
        val wallHeight = size * 0.55f
        val topCapHeight = size * 0.35f

        // Cast soft drop-shadow at base of wall onto the floor
        scope.drawRect(
            brush = Brush.verticalGradient(
                colors = listOf(Color(0x99000000), Color.Transparent),
                startY = y + size,
                endY = y + size + size * 0.35f
            ),
            topLeft = Offset(x - size * 0.1f, y + size),
            size = Size(size * 1.2f, size * 0.35f)
        )

        // Front wall facade (vertical 3D stone masonry)
        scope.drawRect(
            brush = Brush.verticalGradient(
                colors = listOf(Color(0xFF262A36), Color(0xFF141720), Color(0xFF090B0E)),
                startY = y,
                endY = y + size
            ),
            topLeft = Offset(x, y),
            size = Size(size, size)
        )

        // Brick masonry mortar grooves
        val rowH = size / 3f
        for (i in 1..2) {
            val my = y + i * rowH
            scope.drawLine(
                color = Color(0xFF0A0C10),
                start = Offset(x, my),
                end = Offset(x + size, my),
                strokeWidth = 2.5f
            )
        }
        val brickOffset = if (ty % 2 == 0) size * 0.5f else 0f
        scope.drawLine(
            color = Color(0xFF0A0C10),
            start = Offset(x + (brickOffset % size), y),
            end = Offset(x + (brickOffset % size), y + rowH),
            strokeWidth = 2f
        )
        scope.drawLine(
            color = Color(0xFF0A0C10),
            start = Offset(x + ((brickOffset + size * 0.5f) % size), y + rowH),
            end = Offset(x + ((brickOffset + size * 0.5f) % size), y + rowH * 2f),
            strokeWidth = 2f
        )

        // 2.5D Top Cap Surface (receives ambient dungeon ceiling light)
        scope.drawRect(
            brush = Brush.verticalGradient(
                colors = listOf(Color(0xFF3E4557), Color(0xFF2E3342)),
                startY = y - topCapHeight,
                endY = y
            ),
            topLeft = Offset(x, y - topCapHeight),
            size = Size(size, topCapHeight)
        )

        // Top cap bevel highlight rim
        scope.drawLine(
            color = Color(0xFF6B7280),
            start = Offset(x, y - topCapHeight),
            end = Offset(x + size, y - topCapHeight),
            strokeWidth = 2f
        )

        // Hanging Rusted Dungeon Chains on walls
        val seed = (tx * 31 xor ty * 97)
        if (seed % 4 == 0) {
            val chainX = x + size * 0.3f
            val linkH = 6f
            for (l in 0..5) {
                val cy = y + l * linkH + 4f
                scope.drawOval(
                    color = Color(0xFF8A93A6),
                    topLeft = Offset(chainX - 3f, cy),
                    size = Size(6f, linkH),
                    style = Stroke(1.5f)
                )
            }
        }
    }

    // -------------------------------------------------------------
    // 3. ACID POOL WITH TOXIC GRADIENTS, BUBBLES & CAUSTIC EDGES
    // -------------------------------------------------------------
    fun drawAcidPool(
        scope: DrawScope,
        x: Float,
        y: Float,
        size: Float,
        animTime: Float
    ) {
        // Deep sunken pit edge
        scope.drawRoundRect(
            color = Color(0xFF051208),
            topLeft = Offset(x + 2f, y + 2f),
            size = Size(size - 4f, size - 4f),
            cornerRadius = CornerRadius(10f, 10f)
        )

        // Swirling glowing acid liquid
        val pulse = sin(animTime * 3f + x * 0.1f) * 0.15f
        scope.drawRoundRect(
            brush = Brush.radialGradient(
                colors = listOf(
                    NeonAcidGreen.copy(alpha = 0.95f),
                    Color(0xFF0D963B),
                    Color(0xFF063314)
                ),
                center = Offset(x + size * 0.5f, y + size * 0.5f),
                radius = size * (0.6f + pulse)
            ),
            topLeft = Offset(x + 4f, y + 4f),
            size = Size(size - 8f, size - 8f),
            cornerRadius = CornerRadius(8f, 8f)
        )

        // Caustic acid bubbles rising
        val b1Y = y + size * 0.6f - ((animTime * 18f + x) % (size * 0.45f))
        val b2Y = y + size * 0.7f - ((animTime * 24f + y) % (size * 0.5f))
        scope.drawCircle(
            color = Color(0xFFC4FFD6),
            radius = 3.5f,
            center = Offset(x + size * 0.35f, b1Y)
        )
        scope.drawCircle(
            color = Color(0xFFC4FFD6),
            radius = 2.5f,
            center = Offset(x + size * 0.65f, b2Y)
        )

        // Glowing radioactive rim
        scope.drawRoundRect(
            color = NeonAcidGreen.copy(alpha = 0.7f),
            topLeft = Offset(x + 3f, y + 3f),
            size = Size(size - 6f, size - 6f),
            cornerRadius = CornerRadius(9f, 9f),
            style = Stroke(2f)
        )
    }

    // -------------------------------------------------------------
    // 4. STEAM DRAIN GRATE WITH MOLTEN COILS & BILLOWING VAPOR
    // -------------------------------------------------------------
    fun drawSteamDrain(
        scope: DrawScope,
        x: Float,
        y: Float,
        size: Float,
        animTime: Float
    ) {
        // Recessed well
        scope.drawRect(
            color = Color(0xFF0A0503),
            topLeft = Offset(x + 4f, y + 4f),
            size = Size(size - 8f, size - 8f)
        )

        // Glowing red-hot molten steam furnace coils below
        val coilGlow = 0.7f + sin(animTime * 4f) * 0.25f
        scope.drawRect(
            brush = Brush.radialGradient(
                colors = listOf(
                    NeonMoltenAmber.copy(alpha = coilGlow),
                    NeonCrimson.copy(alpha = coilGlow * 0.7f),
                    Color.Transparent
                ),
                center = Offset(x + size * 0.5f, y + size * 0.5f),
                radius = size * 0.5f
            ),
            topLeft = Offset(x + 6f, y + 6f),
            size = Size(size - 12f, size - 12f)
        )

        // Cast-Iron Grate slats
        val slats = 5
        val slatSpacing = (size - 12f) / slats
        for (i in 0..slats) {
            val sx = x + 6f + i * slatSpacing
            scope.drawLine(
                color = Color(0xFF2C2F38),
                start = Offset(sx, y + 6f),
                end = Offset(sx, y + size - 6f),
                strokeWidth = 3f
            )
            // Specular rim on grate
            scope.drawLine(
                color = Color(0x66B0B8C8),
                start = Offset(sx - 0.5f, y + 6f),
                end = Offset(sx - 0.5f, y + size - 6f),
                strokeWidth = 1f
            )
        }

        // Rising steam puffs (volumetric soft particles)
        val puffY = y + size * 0.5f - ((animTime * 35f) % (size * 0.8f))
        val puffAlpha = (1f - (puffY - (y - size * 0.3f)) / (size * 0.8f)).coerceIn(0.1f, 0.45f)
        scope.drawCircle(
            color = Color(0xFFECEFF4).copy(alpha = puffAlpha),
            radius = 14f,
            center = Offset(x + size * 0.5f, puffY)
        )
    }

    // -------------------------------------------------------------
    // 5. 3D OBSIDIAN EGG WITH CRACKS, PEELING CARAPACE & GLOWING EYES
    // -------------------------------------------------------------
    fun draw3DObsidianEgg(
        scope: DrawScope,
        cx: Float,
        cy: Float,
        scale: Float,
        animTime: Float
    ) {
        val w = 34f * scale
        val h = 46f * scale
        val pulse = 1f + sin(animTime * 5f) * 0.04f

        // Cast ground shadow
        scope.drawOval(
            brush = Brush.radialGradient(
                colors = listOf(Color(0xBB000000), Color.Transparent),
                center = Offset(cx, cy + h * 0.48f),
                radius = w * 0.85f
            ),
            topLeft = Offset(cx - w * 0.75f, cy + h * 0.35f),
            size = Size(w * 1.5f, h * 0.35f)
        )

        // 3D Obsidian Egg body with rich radial lighting
        scope.drawOval(
            brush = Brush.radialGradient(
                colors = listOf(
                    Color(0xFF434759),
                    Color(0xFF2A2C38),
                    Color(0xFF14151D),
                    Color(0xFF090A0E)
                ),
                center = Offset(cx - w * 0.22f, cy - h * 0.25f),
                radius = h * 0.8f
            ),
            topLeft = Offset(cx - (w / 2f) * pulse, cy - (h / 2f) * pulse),
            size = Size(w * pulse, h * pulse)
        )

        // Obsidian specular rim highlight
        scope.drawArc(
            color = Color(0x66FFFFFF),
            startAngle = 180f,
            sweepAngle = 120f,
            useCenter = false,
            topLeft = Offset(cx - w * 0.48f, cy - h * 0.48f),
            size = Size(w * 0.96f, h * 0.96f),
            style = Stroke(2f)
        )

        // Jagged glowing hatching crack fissures
        val crackPath = Path().apply {
            moveTo(cx - 3f, cy - h * 0.38f)
            lineTo(cx - w * 0.22f, cy - h * 0.15f)
            lineTo(cx + w * 0.15f, cy + 2f)
            lineTo(cx - w * 0.18f, cy + h * 0.22f)
            lineTo(cx + 4f, cy + h * 0.42f)
        }
        // Outer crimson fissure glow
        scope.drawPath(
            path = crackPath,
            color = NeonCrimson.copy(alpha = 0.6f),
            style = Stroke(6f, cap = StrokeCap.Round)
        )
        // Core electric neon crack
        scope.drawPath(
            path = crackPath,
            color = NeonCrimson,
            style = Stroke(2.5f, cap = StrokeCap.Round)
        )

        // Peeking sinister predator slit-eyes inside the crack
        val eyeGlint = sin(animTime * 6f)
        val eyeColor = if (eyeGlint > 0.85f) NeonCyanElectric else NeonAcidGreen
        scope.drawOval(
            color = eyeColor,
            topLeft = Offset(cx - 7f, cy - 4f),
            size = Size(6f, 3.5f)
        )
        scope.drawOval(
            color = NeonCrimson,
            topLeft = Offset(cx + 3f, cy - 1f),
            size = Size(6f, 3.5f)
        )

        // Heavy Iron Shackle Chains wrapped around egg
        val chainY = cy + h * 0.05f
        scope.drawArc(
            color = Color(0xFFC0CADC),
            startAngle = 10f,
            sweepAngle = 160f,
            useCenter = false,
            topLeft = Offset(cx - w * 0.55f, chainY - 8f),
            size = Size(w * 1.1f, 20f),
            style = Stroke(4f)
        )
        // Chain padlock / seal
        scope.drawRoundRect(
            color = NeonMoltenAmber,
            topLeft = Offset(cx - 5f, chainY + 4f),
            size = Size(10f, 10f),
            cornerRadius = CornerRadius(2f, 2f)
        )
    }

    // -------------------------------------------------------------
    // 6. DETAILED ANATOMICAL 2.5D CREATURE (EVOLUTION STAGES)
    // -------------------------------------------------------------
    fun drawEvolvedCreature(
        scope: DrawScope,
        cx: Float,
        cy: Float,
        creature: Creature,
        scale: Float,
        animTime: Float
    ) {
        val facing = creature.facingAngle
        val r = 20f * scale
        val breath = sin(animTime * 5f) * 0.06f

        // Cast creature ground drop-shadow
        scope.drawOval(
            brush = Brush.radialGradient(
                colors = listOf(Color(0xBB000000), Color.Transparent),
                center = Offset(cx, cy + r * 0.8f),
                radius = r * 1.1f
            ),
            topLeft = Offset(cx - r * 1.1f, cy + r * 0.4f),
            size = Size(r * 2.2f, r * 0.8f)
        )

        scope.rotate(facing * (180f / PI.toFloat()), pivot = Offset(cx, cy)) {
            // Segmented Barbed Tail (animated swish)
            val tailSwish = sin(animTime * 7f) * 8f
            val tailPath = Path().apply {
                moveTo(cx - r * 0.8f, cy)
                quadraticTo(cx - r * 1.4f, cy + tailSwish, cx - r * 2.1f, cy + tailSwish * 1.4f)
            }
            scope.drawPath(
                path = tailPath,
                color = creature.stage.primaryColor,
                style = Stroke(4.5f, cap = StrokeCap.Round)
            )
            // Barbed tail stinger
            scope.drawCircle(
                color = creature.stage.eyeColor,
                radius = 4f,
                center = Offset(cx - r * 2.1f, cy + tailSwish * 1.4f)
            )

            // Scuttling Limb Claws (Front & Rear Legs)
            val legOffsets = listOf(
                Pair(r * 0.5f, -r * 0.95f),
                Pair(r * 0.5f, r * 0.95f),
                Pair(-r * 0.4f, -r * 0.9f),
                Pair(-r * 0.4f, r * 0.9f)
            )
            for ((lx, ly) in legOffsets) {
                scope.drawLine(
                    color = Color(0xFF1E212A),
                    start = Offset(cx + lx * 0.4f, cy + ly * 0.4f),
                    end = Offset(cx + lx, cy + ly),
                    strokeWidth = 3f,
                    cap = StrokeCap.Round
                )
                // Razor claw tip
                scope.drawCircle(
                    color = NeonBoneWhite,
                    radius = 2.5f,
                    center = Offset(cx + lx, cy + ly)
                )
            }

            // Segmented Torso / Carapace Plates
            scope.drawOval(
                brush = Brush.radialGradient(
                    colors = listOf(
                        creature.stage.primaryColor,
                        creature.stage.primaryColor.copy(alpha = 0.7f),
                        Color(0xFF101217)
                    ),
                    center = Offset(cx + r * 0.2f, cy - r * 0.2f),
                    radius = r * 1.3f
                ),
                topLeft = Offset(cx - r * (1f + breath), cy - r * 0.75f),
                size = Size(r * 2f * (1f + breath), r * 1.5f)
            )

            // Armored Carapace Spine Ridges (segmented chitin)
            for (seg in -2..2) {
                val segX = cx + seg * (r * 0.3f)
                scope.drawArc(
                    color = Color(0x77FFFFFF),
                    startAngle = 210f,
                    sweepAngle = 120f,
                    useCenter = false,
                    topLeft = Offset(segX - 6f, cy - r * 0.65f),
                    size = Size(12f, r * 1.3f),
                    style = Stroke(2f)
                )
            }

            // Head & Razor Mandibles
            val headX = cx + r * 0.9f
            scope.drawCircle(
                color = Color(0xFF1B1D26),
                radius = r * 0.55f,
                center = Offset(headX, cy)
            )

            // Curved Demonic Horns
            val hornPathL = Path().apply {
                moveTo(headX, cy - 6f)
                quadraticTo(headX + 8f, cy - 16f, headX + 16f, cy - 18f)
            }
            val hornPathR = Path().apply {
                moveTo(headX, cy + 6f)
                quadraticTo(headX + 8f, cy + 16f, headX + 16f, cy + 18f)
            }
            scope.drawPath(path = hornPathL, color = NeonBoneWhite, style = Stroke(3f, cap = StrokeCap.Round))
            scope.drawPath(path = hornPathR, color = NeonBoneWhite, style = Stroke(3f, cap = StrokeCap.Round))

            // Piercing Glowing Eyes (with neon flare)
            scope.drawCircle(
                color = creature.stage.eyeColor,
                radius = 3.8f,
                center = Offset(headX + 4f, cy - 5f)
            )
            scope.drawCircle(
                color = creature.stage.eyeColor,
                radius = 3.8f,
                center = Offset(headX + 4f, cy + 5f)
            )
            // Slit pupil
            scope.drawCircle(
                color = AbyssDarkVoid,
                radius = 1.6f,
                center = Offset(headX + 4.5f, cy - 5f)
            )
            scope.drawCircle(
                color = AbyssDarkVoid,
                radius = 1.6f,
                center = Offset(headX + 4.5f, cy + 5f)
            )
        }
    }

    // -------------------------------------------------------------
    // 7. 3D INTERLOCKING METALLIC CHAIN LINKS WITH SHADOW & NEON HALO
    // -------------------------------------------------------------
    fun draw3DChainLink(
        scope: DrawScope,
        x: Float,
        y: Float,
        angleDeg: Float,
        glowColor: Color
    ) {
        scope.rotate(angleDeg, pivot = Offset(x, y)) {
            // Neon soul halo
            scope.drawOval(
                color = glowColor.copy(alpha = 0.35f),
                topLeft = Offset(x - 7f, y - 4f),
                size = Size(14f, 8f)
            )
            // Outer steel oval link
            scope.drawOval(
                brush = Brush.verticalGradient(
                    colors = listOf(Color(0xFFE2E8F0), Color(0xFF718096), Color(0xFF2D3748)),
                    startY = y - 3.5f,
                    endY = y + 3.5f
                ),
                topLeft = Offset(x - 6f, y - 3.5f),
                size = Size(12f, 7f),
                style = Stroke(2.2f)
            )
            // Inner hollow link
            scope.drawOval(
                color = Color(0xFF1A202C),
                topLeft = Offset(x - 3f, y - 1.5f),
                size = Size(6f, 3f)
            )
        }
    }

    // -------------------------------------------------------------
    // 8. DETAILED 2.5D CHAINED BEASTS (ANIMAL SPECIFIC SILHOUETTES)
    // -------------------------------------------------------------
    fun drawChainedCompanion(
        scope: DrawScope,
        cx: Float,
        cy: Float,
        type: BeastType,
        level: Int,
        scale: Float,
        animTime: Float,
        isSynergyActive: Boolean
    ) {
        val r = 16f * scale

        // Drop shadow
        scope.drawOval(
            brush = Brush.radialGradient(
                colors = listOf(Color(0x99000000), Color.Transparent),
                center = Offset(cx, cy + r * 0.65f),
                radius = r * 1.2f
            ),
            topLeft = Offset(cx - r * 1.1f, cy + r * 0.3f),
            size = Size(r * 2.2f, r * 0.7f)
        )

        // Glowing Soul Bond Aura
        val auraRad = r * (if (isSynergyActive) 1.8f else 1.35f)
        scope.drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    type.auraColor.copy(alpha = if (isSynergyActive) 0.6f else 0.3f),
                    type.auraColor.copy(alpha = 0.05f),
                    Color.Transparent
                ),
                center = Offset(cx, cy),
                radius = auraRad
            ),
            radius = auraRad,
            center = Offset(cx, cy)
        )

        // Heavy Chained Collar around neck
        scope.drawCircle(
            color = Color(0xFFB0B8C8),
            radius = r * 0.95f,
            center = Offset(cx, cy),
            style = Stroke(3f)
        )

        // Specific Animal Rendering
        when (type) {
            BeastType.DIRE_ALPHA_WOLF -> {
                // Jagged Lupine Wolf Head
                val wolfHead = Path().apply {
                    moveTo(cx + r * 0.9f, cy)
                    lineTo(cx + r * 0.3f, cy - r * 0.7f)
                    lineTo(cx - r * 0.4f, cy - r * 0.6f)
                    lineTo(cx - r * 0.7f, cy)
                    lineTo(cx - r * 0.4f, cy + r * 0.6f)
                    lineTo(cx + r * 0.3f, cy + r * 0.7f)
                    close()
                }
                scope.drawPath(path = wolfHead, color = Color(0xFF2D303E))
                // Pointed Wolf Ears
                scope.drawPath(
                    path = Path().apply {
                        moveTo(cx - r * 0.2f, cy - r * 0.6f)
                        lineTo(cx - r * 0.1f, cy - r * 1.2f)
                        lineTo(cx + r * 0.2f, cy - r * 0.5f)
                    },
                    color = Color(0xFF1E202B)
                )
                // Scarred Blind Eye & Piercing Red Eye
                scope.drawCircle(color = NeonCrimson, radius = 2.8f, center = Offset(cx + 4f, cy - 4f))
                scope.drawLine(color = Color(0x99FFFFFF), start = Offset(cx + 2f, cy + 1f), end = Offset(cx + 6f, cy + 7f), strokeWidth = 1.5f)
            }
            BeastType.BROOD_WEAVER_SPIDER -> {
                // Arachnid bulbous abdomen
                scope.drawOval(
                    color = Color(0xFF1F1515),
                    topLeft = Offset(cx - r * 0.9f, cy - r * 0.6f),
                    size = Size(r * 1.1f, r * 1.2f)
                )
                // Spider Eyes cluster (acid lime)
                scope.drawCircle(color = NeonAcidGreen, radius = 2f, center = Offset(cx + 4f, cy - 3f))
                scope.drawCircle(color = NeonAcidGreen, radius = 2f, center = Offset(cx + 4f, cy + 3f))
                scope.drawCircle(color = NeonAcidGreen, radius = 1.5f, center = Offset(cx + 7f, cy))
            }
            BeastType.SUBTERRANEAN_ANGLER -> {
                // Angler fish head & underbite
                scope.drawOval(
                    color = Color(0xFF122430),
                    topLeft = Offset(cx - r * 0.7f, cy - r * 0.6f),
                    size = Size(r * 1.4f, r * 1.2f)
                )
                // Dangling bioluminescent lure
                val lureX = cx + r * 0.9f
                val lureY = cy - r * 0.8f
                scope.drawLine(
                    color = Color(0xFF718096),
                    start = Offset(cx + r * 0.2f, cy - r * 0.4f),
                    end = Offset(lureX, lureY),
                    strokeWidth = 1.5f
                )
                scope.drawCircle(
                    color = NeonCyanElectric,
                    radius = 4f,
                    center = Offset(lureX, lureY)
                )
            }
            BeastType.STEAM_DRAIN_BOAR -> {
                // Armored boar snout & molten tusks
                scope.drawOval(
                    color = Color(0xFF38291E),
                    topLeft = Offset(cx - r * 0.7f, cy - r * 0.6f),
                    size = Size(r * 1.4f, r * 1.2f)
                )
                // Glowing heated tusks
                scope.drawLine(
                    color = NeonMoltenAmber,
                    start = Offset(cx + r * 0.4f, cy - 6f),
                    end = Offset(cx + r * 1.1f, cy - 10f),
                    strokeWidth = 3f,
                    cap = StrokeCap.Round
                )
                scope.drawLine(
                    color = NeonMoltenAmber,
                    start = Offset(cx + r * 0.4f, cy + 6f),
                    end = Offset(cx + r * 1.1f, cy + 10f),
                    strokeWidth = 3f,
                    cap = StrokeCap.Round
                )
            }
            BeastType.BONE_CARVER_HYENA -> {
                // Scavenger skull with jagged jaws
                scope.drawOval(
                    color = Color(0xFF282530),
                    topLeft = Offset(cx - r * 0.7f, cy - r * 0.6f),
                    size = Size(r * 1.4f, r * 1.2f)
                )
                scope.drawCircle(color = NeonViolet, radius = 3f, center = Offset(cx + 4f, cy - 4f))
            }
        }
    }

    // -------------------------------------------------------------
    // 9. 3D LOOT CHEST WITH METALLIC BANDS & RARITY GLOW AURA
    // -------------------------------------------------------------
    fun draw3DChest(
        scope: DrawScope,
        x: Float,
        y: Float,
        size: Float,
        animTime: Float
    ) {
        val cx = x + size * 0.5f
        val cy = y + size * 0.5f
        val w = size * 0.65f
        val h = size * 0.5f

        // Cast shadow
        scope.drawOval(
            brush = Brush.radialGradient(
                colors = listOf(Color(0x99000000), Color.Transparent),
                center = Offset(cx, cy + h * 0.5f),
                radius = w * 0.75f
            ),
            topLeft = Offset(cx - w * 0.65f, cy + h * 0.25f),
            size = Size(w * 1.3f, h * 0.5f)
        )

        // Pulsing treasure rarity aura
        val glowPulse = 0.5f + sin(animTime * 4f) * 0.2f
        scope.drawCircle(
            color = NeonMoltenAmber.copy(alpha = glowPulse * 0.4f),
            radius = w * 0.85f,
            center = Offset(cx, cy)
        )

        // 3D Chest Body
        scope.drawRoundRect(
            brush = Brush.verticalGradient(
                colors = listOf(Color(0xFF5E3F24), Color(0xFF382312), Color(0xFF1D1107)),
                startY = cy - h * 0.5f,
                endY = cy + h * 0.5f
            ),
            topLeft = Offset(cx - w * 0.5f, cy - h * 0.5f),
            size = Size(w, h),
            cornerRadius = CornerRadius(6f, 6f)
        )

        // Beveled Iron Bands & Corner Brackets
        scope.drawLine(
            color = Color(0xFFC0CADC),
            start = Offset(cx - w * 0.3f, cy - h * 0.5f),
            end = Offset(cx - w * 0.3f, cy + h * 0.5f),
            strokeWidth = 3f
        )
        scope.drawLine(
            color = Color(0xFFC0CADC),
            start = Offset(cx + w * 0.3f, cy - h * 0.5f),
            end = Offset(cx + w * 0.3f, cy + h * 0.5f),
            strokeWidth = 3f
        )

        // Golden Keyhole Clasp
        scope.drawCircle(
            color = NeonMoltenAmber,
            radius = 3.5f,
            center = Offset(cx, cy)
        )
    }

    // -------------------------------------------------------------
    // 10. DESCENDING ABYSS STAIRCASE WITH VOLUMETRIC PORTAL GLOW
    // -------------------------------------------------------------
    fun drawStairsDown(
        scope: DrawScope,
        x: Float,
        y: Float,
        size: Float,
        animTime: Float
    ) {
        val steps = 5
        val stepH = size / steps
        for (s in 0 until steps) {
            val sy = y + s * stepH
            val depthFactor = (1f - s.toFloat() / steps).coerceIn(0.1f, 1f)
            scope.drawRect(
                color = Color(
                    red = (0.12f * depthFactor),
                    green = (0.05f * depthFactor),
                    blue = (0.22f * depthFactor)
                ),
                topLeft = Offset(x, sy),
                size = Size(size, stepH)
            )
            // Step ledge highlight
            scope.drawLine(
                color = NeonViolet.copy(alpha = 0.4f * depthFactor),
                start = Offset(x, sy),
                end = Offset(x + size, sy),
                strokeWidth = 2f
            )
        }

        // Swirling abyssal portal vortex at bottom of stairs
        val vortexAngle = animTime * 45f
        scope.rotate(vortexAngle, pivot = Offset(x + size * 0.5f, y + size * 0.7f)) {
            scope.drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(
                        NeonViolet.copy(alpha = 0.8f),
                        NeonCyanElectric.copy(alpha = 0.4f),
                        Color.Transparent
                    ),
                    center = Offset(x + size * 0.5f, y + size * 0.7f),
                    radius = size * 0.4f
                ),
                radius = size * 0.4f,
                center = Offset(x + size * 0.5f, y + size * 0.7f)
            )
        }
    }
}
