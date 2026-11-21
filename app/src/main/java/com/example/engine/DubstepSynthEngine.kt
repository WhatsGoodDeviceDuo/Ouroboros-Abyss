package com.example.engine

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.sin

class DubstepSynthEngine {

    companion object {
        private const val SAMPLE_RATE = 22050
        private const val BPM = 140
        // At 140 BPM in half time, 1 beat = 60 / 140 = 0.42857 seconds
        private const val BEAT_SAMPLES = (SAMPLE_RATE * 60) / BPM
        private const val SIXTEENTH_SAMPLES = BEAT_SAMPLES / 4
    }

    private var audioTrack: AudioTrack? = null
    private var synthJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.Default)

    @Volatile
    var isEnabled: Boolean = true
        set(value) {
            field = value
            if (!value) {
                stop()
            } else {
                start()
            }
        }

    @Volatile
    var combatIntensity: Float = 0.0f // 0.0 = dark ambient dungeon, 1.0 = heavy dubstep drop!

    @Volatile
    var isBossFight: Boolean = false

    private val minorScaleFrequencies = floatArrayOf(
        73.42f, // D2 (deep bass)
        82.41f, // E2
        87.31f, // F2
        98.00f, // G2
        110.00f, // A2
        116.54f, // Bb2
        130.81f, // C3
        146.83f  // D3
    )

    fun start() {
        if (synthJob != null && synthJob?.isActive == true) return

        try {
            val minBufferSize = AudioTrack.getMinBufferSize(
                SAMPLE_RATE,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            )
            val bufferSize = minBufferSize.coerceAtLeast(SAMPLE_RATE / 2)

            audioTrack = AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_GAME)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(SAMPLE_RATE)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build()
                )
                .setBufferSizeInBytes(bufferSize)
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build()

            audioTrack?.play()

            synthJob = scope.launch {
                val chunkSize = SIXTEENTH_SAMPLES
                val pcmBuffer = ShortArray(chunkSize)
                var step = 0
                var sampleIndex = 0L

                while (isActive && isEnabled) {
                    val intensity = combatIntensity.coerceIn(0f, 1f)
                    val isBoss = isBossFight

                    // Dubstep grid: 16 steps per bar (4 beats per bar)
                    val beatIndex = (step / 4) % 4
                    val stepInBeat = step % 4

                    // Select root note for current measure
                    val noteIdx = when ((step / 16) % 4) {
                        0 -> 0 // D
                        1 -> 5 // Bb
                        2 -> 2 // F
                        else -> 1 // Eb Phrygian
                    }
                    val baseFreq = minorScaleFrequencies[noteIdx]

                    // Wobble LFO frequency: accelerates with combat intensity!
                    val lfoFreq = when {
                        isBoss -> 8.0f // 16th note tearout wobble!
                        intensity > 0.6f -> 5.5f // 8th note triplets
                        intensity > 0.2f -> 2.33f // 8th note wobble
                        else -> 0.75f // slow dark sub-bass atmospheric pulse
                    }

                    for (i in 0 until chunkSize) {
                        val t = (sampleIndex + i).toDouble() / SAMPLE_RATE

                        // 1. Kick Drum (Half-time Dubstep: beat 0)
                        var kick = 0.0
                        if (beatIndex == 0 && stepInBeat == 0) {
                            val kickT = i.toDouble() / chunkSize
                            val pitch = 160.0 * exp(-kickT * 18.0) + 42.0
                            val env = exp(-kickT * 7.0)
                            kick = sin(2.0 * PI * pitch * kickT) * env * 0.95
                        }

                        // 2. Dubstep Snare / Clap (Half-time Dubstep: beat 2)
                        var snare = 0.0
                        if (beatIndex == 2 && stepInBeat == 0) {
                            val snareT = i.toDouble() / chunkSize
                            val tone = sin(2.0 * PI * 210.0 * snareT) * exp(-snareT * 15.0)
                            val noise = ((Math.random() * 2.0) - 1.0) * exp(-snareT * 9.0)
                            snare = (tone * 0.4 + noise * 0.6) * 0.9
                        }

                        // 3. Hi-Hat Ticks
                        var hiHat = 0.0
                        if (step % 2 == 0) {
                            val hatT = (i.toDouble() / (chunkSize / 2)).coerceAtMost(1.0)
                            val noise = ((Math.random() * 2.0) - 1.0) * exp(-hatT * 32.0)
                            hiHat = noise * 0.18
                        }

                        // 4. Sub-Bass Wobble Synth (The core Dubstep sound!)
                        val lfo = (sin(2.0 * PI * lfoFreq * t) + 1.0) * 0.5
                        val harmonic = sin(2.0 * PI * (baseFreq * 2.0) * t) * 0.35
                        val rawBass = sin(2.0 * PI * baseFreq * t) + harmonic
                        // Saturate / soft clip for aggressive electro crunch
                        val saturatedBass = Math.tanh(rawBass * (1.2 + intensity * 2.5))
                        val bass = saturatedBass * (0.35 + lfo * 0.55) * (0.6f + intensity * 0.4f)

                        // 5. Dark Synth Arpeggio Stabs
                        var arpHit = 0.0
                        if (stepInBeat == 2 || (intensity > 0.4f && stepInBeat % 2 == 1)) {
                            val arpT = i.toDouble() / chunkSize
                            val arpFreq = minorScaleFrequencies[(noteIdx + stepInBeat) % minorScaleFrequencies.size] * 3f
                            val arpWave = sin(2.0 * PI * arpFreq * t)
                            arpHit = arpWave * exp(-arpT * 8.0) * 0.22
                        }

                        // Master mix
                        val masterMix = (kick + snare + hiHat + bass + arpHit).coerceIn(-1.0, 1.0)
                        pcmBuffer[i] = (masterMix * 31000.0).toInt().toShort()
                    }

                    audioTrack?.write(pcmBuffer, 0, chunkSize)
                    sampleIndex += chunkSize
                    step = (step + 1) % 64
                }
            }
        } catch (e: Exception) {
            // AudioTrack init failure or audio not available
        }
    }

    fun stop() {
        synthJob?.cancel()
        synthJob = null
        try {
            audioTrack?.pause()
            audioTrack?.flush()
            audioTrack?.release()
        } catch (e: Exception) {
            // ignore
        }
        audioTrack = null
    }

    // Sound effect trigger (Bone Break X-Ray crunch synthesized!)
    fun playBoneBreakCrunch() {
        if (!isEnabled) return
        scope.launch {
            try {
                val samples = 3500
                val crunchBuffer = ShortArray(samples)
                for (i in 0 until samples) {
                    val t = i.toDouble() / samples
                    val click = if (i % 250 < 30) (Math.random() * 2.0 - 1.0) else 0.0
                    val sub = sin(2.0 * PI * 85.0 * (i.toDouble() / SAMPLE_RATE)) * exp(-t * 6.0)
                    val noise = (Math.random() * 2.0 - 1.0) * exp(-t * 8.0)
                    val mix = (click * 0.5 + sub * 0.5 + noise * 0.4).coerceIn(-1.0, 1.0)
                    crunchBuffer[i] = (mix * 32000.0).toInt().toShort()
                }
                audioTrack?.write(crunchBuffer, 0, samples)
            } catch (e: Exception) {
                // ignore
            }
        }
    }
}
