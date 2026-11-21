package com.example.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.ui.theme.AbyssDarkVoid
import com.example.viewmodel.GameViewModel

@Composable
fun DungeonGameScreen(
    viewModel: GameViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val narrationText by viewModel.narrator.currentNarration.collectAsState()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(AbyssDarkVoid)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Upper two-thirds: 2.5D Procedural Cavern Viewport
            DungeonViewport(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(0.66f),
                uiState = uiState,
                narrationText = narrationText,
                combatIntensity = viewModel.synthEngine.combatIntensity,
                onDismissPrologue = { viewModel.dismissPrologueBanner() }
            )

            // Lower third: GameBoy Color Style Retro Handheld Console Controls
            GameBoyControls(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(0.34f),
                onDirectionChanged = { dx, dy ->
                    viewModel.onDpadDirection(dx, dy)
                },
                onButtonAPressed = {
                    viewModel.onButtonAPressed()
                },
                onButtonBPressed = {
                    viewModel.onButtonBPressed()
                },
                onStartPressed = {
                    viewModel.onButtonStartPressed()
                },
                onSelectPressed = {
                    viewModel.onButtonSelectPressed()
                }
            )
        }

        // Modals for Evolution Tree, Chained Beasts, Loot Inventory, Audio/Story Settings, and Ending Twist
        GameMenuModalHost(
            uiState = uiState,
            onClose = { viewModel.closeModal() },
            onEvolve = { stage -> viewModel.evolveCreature(stage) },
            onEquip = { item -> viewModel.equipItem(item) },
            onToggleMusic = {
                viewModel.synthEngine.isEnabled = !viewModel.synthEngine.isEnabled
            },
            onToggleVoice = {
                viewModel.narrator.toggleVoiceMute()
            },
            onRestart = { viewModel.restartGame() }
        )
    }
}
