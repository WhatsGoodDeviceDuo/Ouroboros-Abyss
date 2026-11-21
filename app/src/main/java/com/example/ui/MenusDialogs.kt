package com.example.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.example.data.model.ChainedBeast
import com.example.data.model.Creature
import com.example.data.model.CreatureStage
import com.example.data.model.EquipSlot
import com.example.data.model.Equipment
import com.example.ui.theme.AbyssDarkVoid
import com.example.ui.theme.AbyssDungeonFloor
import com.example.ui.theme.AbyssSteelBorder
import com.example.ui.theme.AbyssSurfaceElevated
import com.example.ui.theme.NeonAcidGreen
import com.example.ui.theme.NeonBoneWhite
import com.example.ui.theme.NeonCrimson
import com.example.ui.theme.NeonCyanElectric
import com.example.ui.theme.NeonMoltenAmber
import com.example.ui.theme.NeonViolet
import com.example.viewmodel.ActiveModal
import com.example.viewmodel.GameUiState

@Composable
fun GameMenuModalHost(
    uiState: GameUiState,
    onClose: () -> Unit,
    onEvolve: (CreatureStage) -> Unit,
    onEquip: (Equipment) -> Unit,
    onToggleMusic: () -> Unit,
    onToggleVoice: () -> Unit,
    onRestart: () -> Unit
) {
    if (uiState.activeModal == ActiveModal.NONE && !uiState.isGameOver && !uiState.isGameWonTwist) return

    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xDD07080B))
                .padding(20.dp),
            contentAlignment = Alignment.Center
        ) {
            when {
                uiState.isGameWonTwist -> EndingTwistModal(onRestart = onRestart)
                uiState.isGameOver -> GameOverModal(onRestart = onRestart)
                uiState.activeModal == ActiveModal.AUDIO_STORY_SETTINGS -> AudioStoryModal(
                    onClose = onClose,
                    onToggleMusic = onToggleMusic,
                    onToggleVoice = onToggleVoice
                )
                else -> StartMenuTabsModal(
                    initialTab = when (uiState.activeModal) {
                        ActiveModal.CHAINED_BEASTS -> 1
                        ActiveModal.INVENTORY -> 2
                        else -> 0
                    },
                    uiState = uiState,
                    onClose = onClose,
                    onEvolve = onEvolve,
                    onEquip = onEquip
                )
            }
        }
    }
}

@Composable
fun StartMenuTabsModal(
    initialTab: Int,
    uiState: GameUiState,
    onClose: () -> Unit,
    onEvolve: (CreatureStage) -> Unit,
    onEquip: (Equipment) -> Unit
) {
    var selectedTab by remember { mutableStateOf(initialTab) }
    val tabTitles = listOf("EVOLUTION", "CHAINED BEASTS", "LOOT & GEAR")

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .height(580.dp)
            .border(2.dp, NeonCrimson.copy(alpha = 0.8f), RoundedCornerShape(16.dp)),
        colors = CardDefaults.cardColors(containerColor = AbyssDungeonFloor),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "ABYSSAL GRIMOIRE",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Black,
                    fontFamily = FontFamily.Monospace,
                    color = NeonCrimson,
                    letterSpacing = 2.sp
                )
                Text(
                    text = "CLOSE [B / START]",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = NeonBoneWhite,
                    modifier = Modifier
                        .clickable { onClose() }
                        .padding(4.dp)
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Tab bar
            TabRow(
                selectedTabIndex = selectedTab,
                containerColor = AbyssSurfaceElevated,
                contentColor = NeonCyanElectric
            ) {
                tabTitles.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = {
                            Text(
                                text = title,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (selectedTab == index) NeonCyanElectric else Color.Gray
                            )
                        }
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            Box(modifier = Modifier.weight(1f)) {
                when (selectedTab) {
                    0 -> EvolutionTreeView(creature = uiState.creature, onEvolve = onEvolve)
                    1 -> ChainedBeastsView(chainedBeasts = uiState.chainedBeasts)
                    2 -> InventoryView(
                        inventory = uiState.inventory,
                        equipped = uiState.equippedItems,
                        onEquip = onEquip
                    )
                }
            }
        }
    }
}

@Composable
fun EvolutionTreeView(
    creature: Creature,
    onEvolve: (CreatureStage) -> Unit
) {
    Column(modifier = Modifier.fillMaxSize()) {
        // Status header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(AbyssSurfaceElevated)
                .padding(10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(text = "CURRENT STAGE", fontSize = 10.sp, color = Color.Gray)
                Text(
                    text = creature.stage.displayName,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = creature.stage.primaryColor
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(text = "EVOLUTION POINTS", fontSize = 10.sp, color = Color.Gray)
                Text(
                    text = "${creature.evolutionPoints} PTS",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Black,
                    fontFamily = FontFamily.Monospace,
                    color = NeonAcidGreen
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = "AVAILABLE MUTATION BRANCHES",
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            color = NeonBoneWhite,
            letterSpacing = 1.sp
        )

        Spacer(modifier = Modifier.height(8.dp))

        val stages = listOf(
            CreatureStage.ACID_WYRM,
            CreatureStage.SHADOW_STALKER,
            CreatureStage.STEAM_GOLEMITE,
            CreatureStage.BLOOD_LEVIATHAN,
            CreatureStage.ABYSSAL_CHIMERA
        )

        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxSize()
        ) {
            items(stages) { stage ->
                val isCurrent = creature.stage == stage
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = if (isCurrent) AbyssSteelBorder else AbyssSurfaceElevated
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = stage.displayName,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                color = stage.primaryColor
                            )
                            Text(
                                text = stage.description,
                                fontSize = 10.sp,
                                color = NeonBoneWhite.copy(alpha = 0.8f)
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "SPECIAL: ${stage.specialAbilityName} - ${stage.specialAbilityDesc}",
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Medium,
                                color = NeonCyanElectric
                            )
                        }

                        if (!isCurrent) {
                            Button(
                                onClick = { onEvolve(stage) },
                                enabled = creature.evolutionPoints > 0,
                                colors = ButtonDefaults.buttonColors(containerColor = NeonCrimson),
                                modifier = Modifier
                                    .padding(start = 8.dp)
                                    .testTag("btn_evolve_${stage.name}")
                            ) {
                                Text("MUTATE", fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            }
                        } else {
                            Text(
                                text = "ACTIVE",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Black,
                                color = NeonAcidGreen,
                                modifier = Modifier.padding(start = 8.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ChainedBeastsView(chainedBeasts: List<ChainedBeast>) {
    if (chainedBeasts.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "NO BEASTS CHAINED YET",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.Gray
                )
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "Defeat dungeon bosses and pack alphas to chain their souls to your tail!",
                    fontSize = 11.sp,
                    color = NeonBoneWhite.copy(alpha = 0.7f),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
            }
        }
    } else {
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxSize()
        ) {
            items(chainedBeasts) { beast ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = AbyssSurfaceElevated),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    modifier = Modifier
                                        .size(12.dp)
                                        .clip(CircleShape)
                                        .background(beast.type.auraColor)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = beast.type.title,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = NeonBoneWhite
                                )
                            }
                            Text(
                                text = "LVL ${beast.level}",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Black,
                                fontFamily = FontFamily.Monospace,
                                color = beast.type.auraColor
                            )
                        }
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "PASSIVE AURA: ${beast.type.passiveDesc}",
                            fontSize = 11.sp,
                            color = NeonAcidGreen
                        )
                        Text(
                            text = "BASE DAMAGE: ${beast.type.baseDamage * (1f + beast.level * 0.2f)} | RANGE: ${beast.type.attackRange}m",
                            fontSize = 10.sp,
                            color = Color.LightGray
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun InventoryView(
    inventory: List<Equipment>,
    equipped: Map<EquipSlot, Equipment>,
    onEquip: (Equipment) -> Unit
) {
    Column(modifier = Modifier.fillMaxSize()) {
        // Equipped Slots Grid
        Text(text = "CURRENTLY EQUIPPED GEAR", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = NeonBoneWhite)
        Spacer(modifier = Modifier.height(6.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            EquipSlot.values().forEach { slot ->
                val item = equipped[slot]
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(68.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(AbyssSurfaceElevated)
                        .border(1.dp, item?.rarity?.color ?: Color(0xFF333344), RoundedCornerShape(6.dp))
                        .padding(6.dp)
                ) {
                    Column {
                        Text(text = slot.name.replace("_", " "), fontSize = 8.sp, color = Color.Gray)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = item?.name ?: "[EMPTY]",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            color = item?.rarity?.color ?: Color.DarkGray,
                            maxLines = 2
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))
        Text(text = "CHEST INVENTORY (${inventory.size})", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = NeonBoneWhite)
        Spacer(modifier = Modifier.height(6.dp))

        if (inventory.isEmpty()) {
            Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
                Text(text = "Explore the caverns to discover loot chests!", fontSize = 12.sp, color = Color.Gray)
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.weight(1f)
            ) {
                items(inventory) { item ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = AbyssSurfaceElevated),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(10.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = item.name,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = item.rarity.color
                                )
                                Text(
                                    text = "${item.rarity.title} • ${item.wearCondition}",
                                    fontSize = 10.sp,
                                    color = Color.LightGray
                                )
                                Text(
                                    text = "PERK: ${item.specialPerk}",
                                    fontSize = 10.sp,
                                    color = NeonAcidGreen
                                )
                            }
                            Button(
                                onClick = { onEquip(item) },
                                colors = ButtonDefaults.buttonColors(containerColor = item.rarity.color),
                                modifier = Modifier.padding(start = 8.dp)
                            ) {
                                Text("EQUIP", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = AbyssDarkVoid)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun AudioStoryModal(
    onClose: () -> Unit,
    onToggleMusic: () -> Unit,
    onToggleVoice: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .height(520.dp)
            .border(2.dp, NeonCyanElectric, RoundedCornerShape(16.dp)),
        colors = CardDefaults.cardColors(containerColor = AbyssDungeonFloor),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(18.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "AUDIO & STORY NARRATOR",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Black,
                    fontFamily = FontFamily.Monospace,
                    color = NeonCyanElectric
                )
                Text(
                    text = "DONE [SELECT]",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = NeonBoneWhite,
                    modifier = Modifier.clickable { onClose() }
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Audio Controls
            Card(
                colors = CardDefaults.cardColors(containerColor = AbyssSurfaceElevated),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        text = "PROCEDURAL DUBSTEP SYNTH",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = NeonCrimson
                    )
                    Text(
                        text = "140 BPM real-time PCM synthesis with sub-bass wobble, glitch drops, and battle intensity adaptation.",
                        fontSize = 10.sp,
                        color = Color.LightGray
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Button(
                        onClick = onToggleMusic,
                        colors = ButtonDefaults.buttonColors(containerColor = NeonCrimson)
                    ) {
                        Text("TOGGLE DUBSTEP SYNTH", fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Voice Narrator Controls
            Card(
                colors = CardDefaults.cardColors(containerColor = AbyssSurfaceElevated),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        text = "ABYSSAL VOICE NARRATOR",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = NeonAcidGreen
                    )
                    Text(
                        text = "Voice acting powered by TextToSpeech for ongoing narrative, room discoveries, pack alerts, and the final 13-depth twist.",
                        fontSize = 10.sp,
                        color = Color.LightGray
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Button(
                        onClick = onToggleVoice,
                        colors = ButtonDefaults.buttonColors(containerColor = NeonAcidGreen)
                    ) {
                        Text("TOGGLE VOICE ACTING", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = AbyssDarkVoid)
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Ongoing Side Missions
            Text(
                text = "ONGOING EMERGENCE & MISSIONS",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = NeonBoneWhite
            )
            Spacer(modifier = Modifier.height(6.dp))
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(AbyssSurfaceElevated)
                    .padding(10.dp)
            ) {
                Text(text = "• Deep Cavern Mission: Descend through all 13 depths to reach the Broodmother.", fontSize = 10.sp, color = NeonBoneWhite)
                Text(text = "• Pack Bounty: Defeat pack alphas to chain their spirits behind you.", fontSize = 10.sp, color = NeonBoneWhite)
                Text(text = "• Relic Hunt: Unlock ancient chests to recover legendary void-forged equipment.", fontSize = 10.sp, color = NeonBoneWhite)
            }
        }
    }
}

@Composable
fun EndingTwistModal(onRestart: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .height(480.dp)
            .border(3.dp, NeonCrimson, RoundedCornerShape(16.dp)),
        colors = CardDefaults.cardColors(containerColor = AbyssDarkVoid),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp),
            verticalArrangement = Arrangement.SpaceBetween,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "THE PRIMEVAL CLIMAX",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Black,
                    fontFamily = FontFamily.Monospace,
                    color = NeonCrimson,
                    letterSpacing = 2.sp
                )
                Spacer(modifier = Modifier.height(14.dp))
                Text(
                    text = "THE REVELATION",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = NeonCyanElectric
                )
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = "As the Broodmother falls, the thirteenth cavern crumbles beneath seismic tremors. " +
                            "The rusted iron chains binding your flesh were never meant to confine you... " +
                            "THEY WERE THE PLANETARY LOCK HOLDING SHUT THE WORLD DEVOURER!\n\n" +
                            "You are not the dungeon's conqueror. You are the cosmic cataclysm whose hatching has just doomed the surface world. " +
                            "The abyss opens its maw. The cycle continues...",
                    fontSize = 12.sp,
                    color = NeonBoneWhite,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    lineHeight = 18.sp
                )
            }

            Button(
                onClick = onRestart,
                colors = ButtonDefaults.buttonColors(containerColor = NeonCrimson),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("RESTART THE CATACLYSM", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
fun GameOverModal(onRestart: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .height(280.dp)
            .border(2.dp, NeonCrimson, RoundedCornerShape(16.dp)),
        colors = CardDefaults.cardColors(containerColor = AbyssDungeonFloor),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp),
            verticalArrangement = Arrangement.SpaceBetween,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "YOUR FLESH HAS CONSUMED",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Black,
                    fontFamily = FontFamily.Monospace,
                    color = NeonCrimson
                )
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = "Your bones have joined the millions scattered across the decrepit underworld.",
                    fontSize = 12.sp,
                    color = Color.LightGray,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
            }

            Button(
                onClick = onRestart,
                colors = ButtonDefaults.buttonColors(containerColor = NeonCrimson),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("REBIRTH FROM THE OBSIDIAN EGG", fontWeight = FontWeight.Bold)
            }
        }
    }
}
