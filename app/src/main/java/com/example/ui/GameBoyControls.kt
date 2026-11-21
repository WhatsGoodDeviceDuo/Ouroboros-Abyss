package com.example.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.ui.theme.GbcActionButtonA
import com.example.ui.theme.GbcActionButtonB
import com.example.ui.theme.GbcAtomicPurpleBody
import com.example.ui.theme.GbcDpadBase
import com.example.ui.theme.GbcDpadButton
import com.example.ui.theme.GbcPowerLedOn
import com.example.ui.theme.GbcSelectStartPill
import com.example.ui.theme.NeonAcidGreen
import com.example.ui.theme.NeonBoneWhite
import com.example.ui.theme.NeonCrimson
import com.example.ui.theme.NeonCyanElectric
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

@Composable
fun GameBoyControls(
    modifier: Modifier = Modifier,
    onDirectionChanged: (dx: Float, dy: Float) -> Unit,
    onButtonAPressed: () -> Unit,
    onButtonBPressed: () -> Unit,
    onStartPressed: () -> Unit,
    onSelectPressed: () -> Unit
) {
    // Retro handheld lower-third shell
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        GbcAtomicPurpleBody,
                        Color(0xFF1B0E27),
                        Color(0xFF0F0816)
                    )
                )
            )
            .border(
                width = 2.dp,
                brush = Brush.verticalGradient(
                    colors = listOf(Color(0xFF6C3D91), Color(0xFF2E1742))
                ),
                shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
            )
            .padding(horizontal = 14.dp, vertical = 10.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // Retro Top Accent Bar (Branding decal & power indicator)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 2.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Power LED indicator
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .shadow(4.dp, CircleShape, spotColor = GbcPowerLedOn)
                            .clip(CircleShape)
                            .background(GbcPowerLedOn)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "POWER",
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF8E79A8),
                        letterSpacing = 1.sp
                    )
                }

                // Retro GBC Style Decal
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "CHAINED",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Black,
                        fontFamily = FontFamily.Monospace,
                        color = NeonBoneWhite,
                        letterSpacing = 2.sp
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "COLOR",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Black,
                        fontFamily = FontFamily.Monospace,
                        color = NeonCyanElectric,
                        letterSpacing = 2.sp
                    )
                }

                // Battery status
                Text(
                    text = "BATT ●",
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    color = NeonAcidGreen
                )
            }

            // Main Controls Area: D-Pad on Left, Action Buttons [B] [A] on Right
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // 1. Tactile 8-way D-Pad
                Box(
                    modifier = Modifier
                        .size(136.dp)
                        .padding(start = 6.dp),
                    contentAlignment = Alignment.Center
                ) {
                    RetroDPad(
                        modifier = Modifier.fillMaxSize(),
                        onDirection = onDirectionChanged
                    )
                }

                // Decorative Center Speaker Slits
                Column(
                    modifier = Modifier.padding(horizontal = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    repeat(5) {
                        Box(
                            modifier = Modifier
                                .width(20.dp)
                                .height(3.dp)
                                .rotate(-25f)
                                .clip(RoundedCornerShape(2.dp))
                                .background(Color(0xFF140B1E))
                        )
                    }
                }

                // 2. Angled A & B Action Buttons
                Box(
                    modifier = Modifier
                        .size(136.dp)
                        .padding(end = 6.dp),
                    contentAlignment = Alignment.Center
                ) {
                    RetroActionButtons(
                        modifier = Modifier.fillMaxSize(),
                        onButtonA = onButtonAPressed,
                        onButtonB = onButtonBPressed
                    )
                }
            }

            // Bottom Area: Angled Select and Start Pills
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 6.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                RetroPillButton(
                    label = "SELECT",
                    subLabel = "AUDIO/LORE",
                    onClick = onSelectPressed,
                    testTag = "btn_select"
                )
                Spacer(modifier = Modifier.width(36.dp))
                RetroPillButton(
                    label = "START",
                    subLabel = "EVOLVE/GEAR",
                    onClick = onStartPressed,
                    testTag = "btn_start"
                )
            }
        }
    }
}

@Composable
private fun RetroDPad(
    modifier: Modifier = Modifier,
    onDirection: (dx: Float, dy: Float) -> Unit
) {
    var isTouching by remember { mutableStateOf(false) }
    var activeVector by remember { mutableStateOf(Offset.Zero) }

    Box(
        modifier = modifier
            .testTag("dpad_controller")
            .pointerInput(Unit) {
                detectDragGestures(
                    onDragStart = { offset ->
                        isTouching = true
                        val center = Offset(size.width / 2f, size.height / 2f)
                        val diff = offset - center
                        val dist = hypot(diff.x, diff.y)
                        if (dist > 10f) {
                            val angle = atan2(diff.y, diff.x)
                            val normX = cos(angle)
                            val normY = sin(angle)
                            activeVector = Offset(normX, normY)
                            onDirection(normX, normY)
                        }
                    },
                    onDrag = { change, _ ->
                        change.consume()
                        val center = Offset(size.width / 2f, size.height / 2f)
                        val diff = change.position - center
                        val dist = hypot(diff.x, diff.y)
                        if (dist > 10f) {
                            val angle = atan2(diff.y, diff.x)
                            val normX = cos(angle)
                            val normY = sin(angle)
                            activeVector = Offset(normX, normY)
                            onDirection(normX, normY)
                        } else {
                            activeVector = Offset.Zero
                            onDirection(0f, 0f)
                        }
                    },
                    onDragEnd = {
                        isTouching = false
                        activeVector = Offset.Zero
                        onDirection(0f, 0f)
                    },
                    onDragCancel = {
                        isTouching = false
                        activeVector = Offset.Zero
                        onDirection(0f, 0f)
                    }
                )
            },
        contentAlignment = Alignment.Center
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val c = Offset(size.width / 2f, size.height / 2f)
            val armW = size.width * 0.30f
            val armL = size.width * 0.88f
            val rad = 12f

            // Recessed base well
            drawCircle(
                color = GbcDpadBase,
                radius = size.width * 0.46f,
                center = c
            )

            // Horizontal Bar
            drawRoundRect(
                color = GbcDpadButton,
                topLeft = Offset(c.x - armL / 2f, c.y - armW / 2f),
                size = Size(armL, armW),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(rad, rad)
            )

            // Vertical Bar
            drawRoundRect(
                color = GbcDpadButton,
                topLeft = Offset(c.x - armW / 2f, c.y - armL / 2f),
                size = Size(armW, armL),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(rad, rad)
            )

            // Center tactile thumb pivot indent
            drawCircle(
                color = Color(0xFF1E2129),
                radius = armW * 0.38f,
                center = c
            )

            // Glowing touch feedback highlight
            if (isTouching && activeVector != Offset.Zero) {
                val touchOffset = c + activeVector * (armL * 0.35f)
                drawCircle(
                    color = NeonCyanElectric.copy(alpha = 0.45f),
                    radius = armW * 0.42f,
                    center = touchOffset
                )
            }
        }
    }
}

@Composable
private fun RetroActionButtons(
    modifier: Modifier = Modifier,
    onButtonA: () -> Unit,
    onButtonB: () -> Unit
) {
    // Buttons angled at -25 degrees
    Box(
        modifier = modifier
            .rotate(-25f)
            .clip(RoundedCornerShape(26.dp))
            .background(Color(0xFF221330))
            .border(1.dp, Color(0xFF4C276D), RoundedCornerShape(26.dp))
            .padding(horizontal = 8.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // [B] Button (Jump / Dash / Synergy)
            ActionCircle(
                label = "B",
                subText = "JUMP",
                buttonColor = GbcActionButtonB,
                onClick = onButtonB,
                testTag = "btn_action_b"
            )

            // [A] Button (Attack / Hatch / Interact)
            ActionCircle(
                label = "A",
                subText = "HATCH / ATK",
                buttonColor = GbcActionButtonA,
                onClick = onButtonA,
                testTag = "btn_action_a"
            )
        }
    }
}

@Composable
private fun ActionCircle(
    label: String,
    subText: String,
    buttonColor: Color,
    onClick: () -> Unit,
    testTag: String
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(46.dp)
                .shadow(6.dp, CircleShape, ambientColor = buttonColor, spotColor = buttonColor)
                .clip(CircleShape)
                .background(
                    Brush.radialGradient(
                        colors = listOf(buttonColor, buttonColor.copy(alpha = 0.75f), Color(0xFF38000F))
                    )
                )
                .border(2.dp, Color(0x66FFFFFF), CircleShape)
                .pointerInput(Unit) {
                    detectTapGestures(onPress = {
                        tryAwaitRelease()
                        onClick()
                    })
                }
                .testTag(testTag),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = label,
                fontSize = 18.sp,
                fontWeight = FontWeight.Black,
                fontFamily = FontFamily.Monospace,
                color = NeonBoneWhite
            )
        }

        Spacer(modifier = Modifier.height(2.dp))
        Text(
            text = subText,
            fontSize = 8.sp,
            fontWeight = FontWeight.Bold,
            color = Color(0xFFAFA2C2),
            letterSpacing = 0.5.sp
        )
    }
}

@Composable
private fun RetroPillButton(
    label: String,
    subLabel: String,
    onClick: () -> Unit,
    testTag: String
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .pointerInput(Unit) {
                detectTapGestures(onTap = { onClick() })
            }
            .testTag(testTag)
    ) {
        Box(
            modifier = Modifier
                .width(44.dp)
                .height(14.dp)
                .rotate(-22f)
                .clip(RoundedCornerShape(7.dp))
                .background(GbcSelectStartPill)
                .border(1.dp, Color(0xFF6B7280), RoundedCornerShape(7.dp))
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = label,
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace,
            color = Color(0xFFB39BC9),
            letterSpacing = 1.sp
        )
        Text(
            text = subLabel,
            fontSize = 7.sp,
            color = Color(0xFF7A6B8D)
        )
    }
}
