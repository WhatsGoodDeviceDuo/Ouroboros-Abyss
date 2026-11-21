package com.example.engine

import android.content.Context
import android.speech.tts.TextToSpeech
import com.example.data.model.BeastType
import com.example.data.model.CreatureStage
import com.example.data.model.EnemySpecies
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.Locale

class AbyssalNarrator(context: Context) : TextToSpeech.OnInitListener {

    private var tts: TextToSpeech? = TextToSpeech(context.applicationContext, this)
    private var isTtsReady = false

    private val _currentNarration = MutableStateFlow(
        "PROLOGUE: Deep beneath the shattered kingdom, upon an ancient stone altar... an obsidian egg stirs in rusted chains."
    )
    val currentNarration: StateFlow<String> = _currentNarration.asStateFlow()

    private val _isVoiceMuted = MutableStateFlow(false)
    val isVoiceMuted: StateFlow<Boolean> = _isVoiceMuted.asStateFlow()

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            tts?.language = Locale.US
            tts?.setPitch(0.72f) // Deep, sinister, dark fantasy underworld voice
            tts?.setSpeechRate(0.85f) // Steady, atmospheric cadence
            isTtsReady = true
            narrateGamePrologue()
        }
    }

    fun toggleVoiceMute() {
        val next = !_isVoiceMuted.value
        _isVoiceMuted.value = next
        if (next) {
            tts?.stop()
        }
    }

    fun speak(text: String, priority: Boolean = false) {
        _currentNarration.value = text
        if (_isVoiceMuted.value || !isTtsReady) return

        val queueMode = if (priority) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD
        tts?.speak(text, queueMode, null, "abyssal_speech_${System.currentTimeMillis()}")
    }

    fun narrateGamePrologue() {
        speak(
            "Deep beneath the shattered mortal realm, in the darkest forgotten abyss... " +
            "A cosmic egg lies bound upon an ancient stone altar, sealed by sacred chains a millennium ago. " +
            "You were cast into the deep to prevent an ancient prophecy. " +
            "Now, the underworld crumbles, and your heartbeat awakens. " +
            "You are safe upon the sanctuary altar. Tap the A button to strike your shell and crack free!",
            priority = true
        )
    }

    fun narrateEggStrike(strike: Int) {
        val msg = when (strike) {
            1 -> "The obsidian shell fractures! Neon energy bleeds through the cracks. Strike it again with the A button!"
            2 -> "The cavern trembles! The sacred chains begin to buckle! One more strike to break free!"
            3 -> "The cosmic shell obliterates! You crawl forth onto the altar as a feral hatchling! Use the D-pad to move, and the B button to jump!"
            else -> "The shell cracks further!"
        }
        speak(msg, priority = true)
    }

    fun narrateLevelEntry(depth: Int, name: String) {
        val dialogue = when (depth) {
            1 -> "Depth one: The Brood Altar. You are safe here. Leap across the stone ledges to explore the nursery."
            2 -> "Depth two: The Damp Catacombs. Listen to the howling in the shadows... dire wolves hunt in packs along the lower platforms."
            3 -> "Depth three: The Steam Drains. Scalding iron pipes spit boiling steam across the ledges. Time your jumps carefully."
            4 -> "Depth four: The Acidic Sewers. Corrosive bile pools beneath the hanging chain bridges. One misstep will dissolve your flesh."
            5 -> "Depth five: The Bone Warrens. You step upon the shattered ribs of fallen conquerors. Break their bones to claim dominance."
            6 -> "Depth six: Weaver's Chasm. Sticky spider webs span the chasm. The Brood Mother watches from the high perches."
            7 -> "Depth seven: The Flooded Grotto. Submerged bridges glow with cyan luminescence. Trench predators dart through the depths below."
            8 -> "Depth eight: Fungoid Undergrowth. Bioluminescent vines tangle across the ruined dwarven arches."
            9 -> "Depth nine: The Chained Quarry. Massive swinging iron pendulums guard the descent. Only the swiftest survive."
            10 -> "Depth ten: Abyssal Slag Forge. Rivers of molten liquid iron. The Furnace Titan commands the upper scaffolds."
            11 -> "Depth eleven: The Hall of Flayed Kings. Crimson blood altars and decaying crowns. The scent of sacrifice fills the air."
            12 -> "Depth twelve: The Chasm of Perpetual Echoes. Ancient puzzle doors seal the way. Trigger the pressure runes to pass."
            13 -> "Depth thirteen: Sanctum of the Primeval Mother. The center of the world. The Broodmother awaits... and the horrifying truth of your birth."
            else -> "You descend deeper into $name."
        }
        speak(dialogue, priority = true)
    }

    fun narratePackEncounter(species: EnemySpecies) {
        val dialogue = when (species) {
            EnemySpecies.DIRE_WOLF_PACK -> "A pack of dire wolves blocks the ledge! Defeat the alpha to chain its spirit behind you!"
            EnemySpecies.WEAVER_SPIDER -> "Venomous brood weavers scuttle along the web ceiling!"
            EnemySpecies.SUBTERRANEAN_ANGLER_FISH -> "A school of trench prowlers leaps from the dark waters!"
            EnemySpecies.IRON_STEAM_BOAR -> "Slag-tusk boars charge along the platform, venting boiling steam!"
            EnemySpecies.SKELETAL_HYENA -> "Gloom hyenas cackle from the bone piles!"
            else -> "Hostile pack creatures engage!"
        }
        speak(dialogue)
    }

    fun narrateBeastCaptured(type: BeastType) {
        val dialogue = when (type) {
            BeastType.DIRE_ALPHA_WOLF -> "The Dire Alpha is broken! Iron chains bind its soul to your tail. It will sprint and hunt beside you!"
            BeastType.BROOD_WEAVER_SPIDER -> "The Brood Weaver is subjugated! Chained to your vanguard, it fires sticky webs to ensnare foes!"
            BeastType.SUBTERRANEAN_ANGLER -> "The Deep Angler is chained! Its bioluminescent lure now pierces the platform darkness!"
            BeastType.STEAM_DRAIN_BOAR -> "The Slag Boar yields! Bound in molten steel, its iron tusks shield your front!"
            BeastType.BONE_CARVER_HYENA -> "The Carrion Carver joins the chain! Its feral howl turns critical strikes into a blood feast!"
        }
        speak(dialogue, priority = true)
    }

    fun narrateEvolution(stage: CreatureStage) {
        speak(
            "Your flesh mutates! You have evolved into the ${stage.displayName}. ${stage.specialAbilityName} is unlocked!",
            priority = true
        )
    }

    fun narrateEndingTwist() {
        speak(
            "The Broodmother collapses... but as her dying breath escapes, the subterranean cavern cracks open. " +
            "The chains that bound you were never to keep you trapped... they were the sacred planetary lock holding back the World Devourer! " +
            "You were not the hatchling of a monster... you ARE the cosmic cataclysm. And now, the surface world will burn!",
            priority = true
        )
    }

    fun shutdown() {
        tts?.stop()
        tts?.shutdown()
        tts = null
    }
}
