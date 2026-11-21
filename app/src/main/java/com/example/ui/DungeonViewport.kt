package com.example.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.model.Creature
import com.example.data.model.CreatureStage
import com.example.data.model.Enemy
import com.example.data.model.TileType
import com.example.data.model.XRayImpactEvent
import com.example.engine.DungeonGenerator
import com.example.engine.Graphics25D
import com.example.engine.IsometricRenderer
import com.example.engine.LightingEngine
import com.example.ui.theme.AbyssDarkVoid
import com.example.ui.theme.NeonAcidGreen
import com.example.ui.theme.NeonBoneWhite
import com.example.ui.theme.NeonCrimson
import com.example.ui.theme.NeonCyanElectric
import com.example.ui.theme.NeonMoltenAmber
import com.example.ui.theme.NeonViolet
import com.example.viewmodel.GameUiState
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin

@Composable
fun DungeonViewport(
    modifier: Modifier = Modifier,
    uiState: GameUiState,
    narrationText: String,
    combatIntensity: Float,
    onDismissPrologue: () -> Unit = {}
) {
    val infiniteTransition = rememberInfiniteTransition(label = "iso_25d_anim")
    val animTime by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 6.28318f,
        animationSpec = infiniteRepeatable(
            animation = tween(2400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "time"
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(AbyssDarkVoid)
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val level = uiState.dungeonLevel ?: return@Canvas
            val creature = uiState.creature
            val meta = DungeonGenerator.getLevelMeta(uiState.currentDepth)

            // Camera shake on hit-stop / bone break
            val shake = if (uiState.xRayEvent != null) sin(animTime * 45f) * 7f else 0f

            // Fixed-distance Isometric camera centered on player entity
            val viewCenterX = size.width / 2f + shake
            val viewCenterY = size.height / 2f + shake

            // Calculate isometric position of player entity
            val playerIsoX = (creature.posX - creature.posY) * (IsometricRenderer.TILE_W / 2f)
            val playerIsoY = (creature.posX + creature.posY) * (IsometricRenderer.TILE_H / 2f)
            val camOffsetX = viewCenterX - playerIsoX
            val camOffsetY = viewCenterY - playerIsoY

            // 1. Dark Atmospheric Underworld Vignette
            drawRect(
                brush = Brush.radialGradient(
                    colors = listOf(Color(0xFF0C0E14), Color(0xFF07080C), AbyssDarkVoid),
                    center = Offset(viewCenterX, viewCenterY),
                    radius = size.width * 0.85f
                ),
                topLeft = Offset.Zero,
                size = size
            )

            // 2. Depth-Sorted Isometric Diagonal Rendering Pipeline
            // Iterate diagonally from (gx + gy = 0) to max (width + height - 2)
            val maxD = (level.width + level.height - 2)

            for (d in 0..maxD) {
                // A. Draw all floor tiles and 3D walls on diagonal d
                for (gx in 0 until level.width) {
                    val gy = d - gx
                    if (gy in 0 until level.height) {
                        val tile = level.tiles[gy][gx]
                        val wetness = level.wetnessMap[gy][gx]

                        // Illumination
                        val illumination = LightingEngine.calculateTileLight(
                            tileX = gx.toFloat() + 0.5f,
                            tileY = gy.toFloat() + 0.5f,
                            lights = level.lightSources,
                            wetness = wetness,
                            playerX = creature.posX,
                            playerY = creature.posY,
                            playerGlowRadius = if (creature.stage == CreatureStage.EGG) 4.5f else 6.2f,
                            playerGlowColor = creature.stage.eyeColor,
                            timeSeconds = animTime
                        )

                        // Draw Isometric Diamond Floor
                        IsometricRenderer.drawIsoDiamondFloor(
                            scope = this,
                            gx = gx,
                            gy = gy,
                            tileType = tile,
                            wetness = wetness,
                            illumination = illumination,
                            camOffsetX = camOffsetX,
                            camOffsetY = camOffsetY,
                            animTime = animTime,
                            biome = meta.archetype
                        )

                        // If Wall: Draw Extruded 3D Isometric Wall Block
                        if (tile == TileType.WALL) {
                            IsometricRenderer.drawIso3DWall(
                                scope = this,
                                gx = gx,
                                gy = gy,
                                camOffsetX = camOffsetX,
                                camOffsetY = camOffsetY,
                                biome = meta.archetype
                            )
                        }
                    }
                }

                // B. Draw Enemies whose isometric depth falls on diagonal d
                for (enemy in uiState.enemies) {
                    if (enemy.currentHp <= 0f) continue
                    val eDiag = (enemy.posX + enemy.posY).toInt()
                    if (eDiag == d) {
                        val ePos = IsometricRenderer.toScreen(enemy.posX, enemy.posY, 0f, camOffsetX, camOffsetY)
                        drawIsoEnemy(this, enemy, ePos, animTime)
                    }
                }

                // C. Draw Player Creature if its isometric depth falls on diagonal d
                val pDiag = (creature.posX + creature.posY).toInt()
                if (pDiag == d) {
                    val pPos = IsometricRenderer.toScreen(creature.posX, creature.posY, 0f, camOffsetX, camOffsetY)

                    if (creature.stage == CreatureStage.EGG) {
                        IsometricRenderer.drawIso3DObsidianEgg(this, pPos, creature.eggCracks, animTime)
                    } else {
                        IsometricRenderer.drawIsoHeroCreature(this, pPos, creature, animTime)
                    }
                }

                // D. Draw Chained Companion Beasts whose depth falls on diagonal d
                for (beast in uiState.chainedBeasts) {
                    val bDiag = (beast.posX + beast.posY).toInt()
                    if (bDiag == d) {
                        val bPos = IsometricRenderer.toScreen(beast.posX, beast.posY, 0f, camOffsetX, camOffsetY)
                        IsometricRenderer.drawIsoChainedBeast(
                            scope = this,
                            c = bPos,
                            type = beast.type,
                            level = beast.level,
                            animTime = animTime,
                            isAttacking = beast.isPerformingSynergy
                        )
                    }
                }
            }

            // 3. Draw 3D Interlocking Metallic Chains Connecting Player to Chained Minions
            var prevLinkPos = IsometricRenderer.toScreen(creature.posX, creature.posY, 0.2f, camOffsetX, camOffsetY)
            for (beast in uiState.chainedBeasts) {
                val bScreenPos = IsometricRenderer.toScreen(beast.posX, beast.posY, 0.2f, camOffsetX, camOffsetY)

                for (joint in beast.chainLinks) {
                    val jScreenPos = IsometricRenderer.toScreen(joint.x, joint.y, 0.15f, camOffsetX, camOffsetY)
                    val dx = jScreenPos.x - prevLinkPos.x
                    val dy = jScreenPos.y - prevLinkPos.y
                    val angleDeg = atan2(dy, dx) * (180f / Math.PI.toFloat())

                    Graphics25D.draw3DChainLink(this, jScreenPos.x, jScreenPos.y, angleDeg, beast.type.auraColor)
                    prevLinkPos = jScreenPos
                }
                prevLinkPos = bScreenPos
            }

            // 4. Volumetric Torch Radiance & Point Lights
            for (light in level.lightSources) {
                val lPos = IsometricRenderer.toScreen(light.x, light.y, 0.4f, camOffsetX, camOffsetY)
                val flicker = 1.0f + 0.12f * sin(animTime * 6f + light.x)
                val haloRad = light.radius * (IsometricRenderer.TILE_W * 0.45f) * flicker

                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            light.color.copy(alpha = 0.35f),
                            light.color.copy(alpha = 0.08f),
                            Color.Transparent
                        ),
                        center = lPos,
                        radius = haloRad
                    ),
                    radius = haloRad,
                    center = lPos
                )
                // Flame Core
                drawCircle(color = Color.White.copy(alpha = 0.9f), radius = 3.5f, center = lPos)
            }

            // 5. Blood Splatter Particles
            for (particle in uiState.bloodParticles) {
                val ptPos = IsometricRenderer.toScreen(particle.x, particle.y, 0f, camOffsetX, camOffsetY)
                drawCircle(
                    color = particle.color.copy(alpha = particle.alpha),
                    radius = particle.radius,
                    center = ptPos
                )
            }

            // 6. Mortal Kombat Style 0.5-second X-Ray Hit-Stop Bone Break Cinematic
            val xRay = uiState.xRayEvent
            if (xRay != null) {
                drawMortalKombatXRayCinematic(this, xRay, size, animTime)
            }
        }

        // Top Status HUD Overlay
        TopHudBar(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth(),
            uiState = uiState,
            combatIntensity = combatIntensity
        )

        // Opening Story Prologue Card (Safe Altar Guidance)
        if (uiState.showPrologueBanner && uiState.creature.stage == CreatureStage.EGG) {
            PrologueStoryCard(
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(horizontal = 24.dp),
                eggCracks = uiState.creature.eggCracks,
                onDismiss = onDismissPrologue
            )
        }

        // Bottom Subtitles Ticker (Spoken voice narration transcript)
        if (narrationText.isNotEmpty()) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 6.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xEE080A10))
                    .border(1.dp, NeonCrimson.copy(alpha = 0.7f), RoundedCornerShape(8.dp))
                    .padding(horizontal = 12.dp, vertical = 7.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "VOICE: ",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Black,
                        fontFamily = FontFamily.Monospace,
                        color = NeonCyanElectric
                    )
                    Text(
                        text = narrationText,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        color = NeonBoneWhite,
                        maxLines = 2
                    )
                }
            }
        }
    }
}

private fun drawIsoEnemy(scope: DrawScope, enemy: Enemy, pos: Offset, animTime: Float) {
    val isBoss = enemy.species.isBoss
    val r = if (isBoss) 24f else 14f

    // Shadow
    scope.drawOval(
        brush = Brush.radialGradient(
            colors = listOf(Color(0x88000000), Color.Transparent),
            center = Offset(pos.x, pos.y + 6f),
            radius = r * 1.2f
        ),
        topLeft = Offset(pos.x - r * 1.1f, pos.y),
        size = Size(r * 2.2f, 14f)
    )

    // Body
    scope.drawOval(
        brush = Brush.radialGradient(
            colors = listOf(
                enemy.species.bodyColor,
                enemy.species.bodyColor.copy(alpha = 0.75f),
                Color(0xFF0A0C12)
            ),
            center = Offset(pos.x - 3f, pos.y - 6f),
            radius = r * 1.2f
        ),
        topLeft = Offset(pos.x - r, pos.y - r * 0.8f),
        size = Size(r * 2f, r * 1.6f)
    )

    // Glowing animal eyes
    scope.drawCircle(color = enemy.species.eyeColor, radius = if (isBoss) 4.5f else 3f, center = Offset(pos.x + 4f, pos.y - 3f))

    // Health bar above enemy
    val barW = r * 2f
    val barH = 4f
    val hpRatio = (enemy.currentHp / enemy.maxHp).coerceIn(0f, 1f)
    scope.drawRect(color = Color.Black, topLeft = Offset(pos.x - r, pos.y - r - 10f), size = Size(barW, barH))
    scope.drawRect(
        color = if (isBoss) NeonMoltenAmber else NeonCrimson,
        topLeft = Offset(pos.x - r, pos.y - r - 10f),
        size = Size(barW * hpRatio, barH)
    )
}

private fun drawMortalKombatXRayCinematic(
    scope: DrawScope,
    xRay: XRayImpactEvent,
    viewportSize: Size,
    animTime: Float
) {
    // 0.5-second Hit-stop with negative vignette
    scope.drawRect(
        brush = Brush.radialGradient(
            colors = listOf(Color(0xDD03080E), Color(0xEE020406), Color(0xFA000000)),
            center = Offset(viewportSize.width / 2f, viewportSize.height / 2f),
            radius = viewportSize.width * 0.75f
        ),
        topLeft = Offset.Zero,
        size = viewportSize
    )

    val c = Offset(viewportSize.width / 2f, viewportSize.height / 2f)
    val skeletonColor = NeonBoneWhite.copy(alpha = 0.95f)

    // Spine
    scope.drawLine(
        color = skeletonColor,
        start = Offset(c.x, c.y - 65f),
        end = Offset(c.x, c.y + 65f),
        strokeWidth = 7f,
        cap = StrokeCap.Round
    )

    // Ribs
    for (r in -3..3) {
        val ry = c.y + r * 15f
        val ribW = 38f - kotlin.math.abs(r) * 5f
        scope.drawArc(
            color = skeletonColor,
            startAngle = 100f,
            sweepAngle = 140f,
            useCenter = false,
            topLeft = Offset(c.x - ribW - 10f, ry - 10f),
            size = Size(ribW + 10f, 20f),
            style = Stroke(4f)
        )
        scope.drawArc(
            color = skeletonColor,
            startAngle = 300f,
            sweepAngle = 140f,
            useCenter = false,
            topLeft = Offset(c.x, ry - 10f),
            size = Size(ribW + 10f, 20f),
            style = Stroke(4f)
        )
    }

    // Glowing Fracture Fissure
    val fracturePath = Path().apply {
        moveTo(c.x - 38f, c.y - 25f)
        lineTo(c.x - 12f, c.y - 8f)
        lineTo(c.x + 4f, c.y + 12f)
        lineTo(c.x - 8f, c.y + 28f)
        lineTo(c.x + 32f, c.y + 44f)
    }
    scope.drawPath(path = fracturePath, color = NeonCrimson, style = Stroke(8f, cap = StrokeCap.Round))
    scope.drawPath(path = fracturePath, color = Color.White, style = Stroke(3f, cap = StrokeCap.Round))

    // Arterial Blood Shockwave
    scope.drawCircle(color = NeonCrimson.copy(alpha = 0.75f), radius = 85f, center = c, style = Stroke(5f))
}

@Composable
fun PrologueStoryCard(
    modifier: Modifier = Modifier,
    eggCracks: Int,
    onDismiss: () -> Unit
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .border(2.dp, NeonCrimson, RoundedCornerShape(14.dp)),
        colors = CardDefaults.cardColors(containerColor = Color(0xF20B0C14)),
        shape = RoundedCornerShape(14.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "OUROBOROS ABYSS",
                fontSize = 15.sp,
                fontWeight = FontWeight.Black,
                fontFamily = FontFamily.Monospace,
                color = NeonCrimson,
                letterSpacing = 2.sp
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "A millennium ago, an ancient cataclysm was sealed within an obsidian dragon egg, bound by sacred underworld chains upon the Bone Altar. " +
                        "You awaken in the blackest biomechanical abyss. You are safe here upon the sanctuary altar—no predators dare enter.\n\n" +
                        "CONTROLS & EVOLUTION:\n" +
                        "• Tap [A]: Strike your shell to crack free! (${eggCracks}/3 Cracks)\n" +
                        "• After hatching: [D-Pad] Isometric movement | [B] Dash/Roll | [A] Melee Lash\n" +
                        "• Defeat pack alphas to chain them to your tail as combat minions!",
                fontSize = 11.sp,
                color = NeonBoneWhite,
                lineHeight = 16.sp
            )
            Spacer(modifier = Modifier.height(12.dp))
            Button(
                onClick = onDismiss,
                colors = ButtonDefaults.buttonColors(containerColor = NeonCrimson)
            ) {
                Text(
                    text = if (eggCracks == 0) "TAP [A] TO STRIKE EGG" else "SHELL CRACKING (${eggCracks}/3)",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@Composable
private fun TopHudBar(
    modifier: Modifier = Modifier,
    uiState: GameUiState,
    combatIntensity: Float
) {
    val creature = uiState.creature
    val level = uiState.dungeonLevel

    Column(
        modifier = modifier
            .background(
                Brush.verticalGradient(
                    colors = listOf(Color(0xF007080C), Color(0xCC07080C), Color.Transparent)
                )
            )
            .padding(horizontal = 14.dp, vertical = 8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "DEPTH ${uiState.currentDepth.toString().padStart(2, '0')} / 13",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Black,
                    fontFamily = FontFamily.Monospace,
                    color = NeonCrimson,
                    letterSpacing = 1.sp
                )
                Text(
                    text = level?.name ?: "The Bone Nursery",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = NeonBoneWhite
                )
            }

            // Dubstep Audio Synthesizer Waveform Visualizer
            Row(
                horizontalArrangement = Arrangement.spacedBy(3.dp),
                verticalAlignment = Alignment.Bottom,
                modifier = Modifier.height(18.dp)
            ) {
                val heights = listOf(0.4f, 0.9f, 0.6f, 1.0f, 0.7f, 0.5f)
                heights.forEach { h ->
                    val dynamicH = (h * (0.35f + combatIntensity * 0.65f) * 16f).dp
                    Box(
                        modifier = Modifier
                            .width(3.dp)
                            .height(dynamicH)
                            .clip(RoundedCornerShape(1.dp))
                            .background(if (combatIntensity > 0.5f) NeonCrimson else NeonCyanElectric)
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(6.dp))

        // Health & Stamina Bars
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(text = "HP", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = NeonCrimson)
                    Text(
                        text = "${creature.currentHp.toInt()} / ${creature.maxHp.toInt()}",
                        fontSize = 9.sp,
                        fontFamily = FontFamily.Monospace,
                        color = NeonBoneWhite
                    )
                }
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(6.dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(Color(0xFF28111A))
                ) {
                    val hpRatio = (creature.currentHp / creature.maxHp).coerceIn(0f, 1f)
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(hpRatio)
                            .fillMaxSize()
                            .background(NeonCrimson)
                    )
                }
            }

            Column(modifier = Modifier.weight(1f)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(text = "STAMINA", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = NeonCyanElectric)
                    Text(
                        text = "${creature.currentStamina.toInt()}%",
                        fontSize = 9.sp,
                        fontFamily = FontFamily.Monospace,
                        color = NeonBoneWhite
                    )
                }
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(6.dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(Color(0xFF0F2530))
                ) {
                    val stamRatio = (creature.currentStamina / creature.maxStamina).coerceIn(0f, 1f)
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(stamRatio)
                            .fillMaxSize()
                            .background(NeonCyanElectric)
                    )
                }
            }
        }
    }
}
