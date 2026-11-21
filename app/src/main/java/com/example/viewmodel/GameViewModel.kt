package com.example.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.model.BeastType
import com.example.data.model.BloodParticle
import com.example.data.model.BoneBreakType
import com.example.data.model.ChainJoint
import com.example.data.model.ChainedBeast
import com.example.data.model.Creature
import com.example.data.model.CreatureStage
import com.example.data.model.DamageFloater
import com.example.data.model.DungeonLevel
import com.example.data.model.Enemy
import com.example.data.model.Equipment
import com.example.data.model.TileType
import com.example.data.model.XRayImpactEvent
import com.example.engine.AbyssalNarrator
import com.example.engine.DubstepSynthEngine
import com.example.engine.DungeonGenerator
import com.example.ui.theme.NeonAcidGreen
import com.example.ui.theme.NeonBoneWhite
import com.example.ui.theme.NeonCrimson
import com.example.ui.theme.NeonCyanElectric
import com.example.ui.theme.NeonMoltenAmber
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin
import kotlin.random.Random

data class GameUiState(
    val creature: Creature = Creature(),
    val dungeonLevel: DungeonLevel? = null,
    val currentDepth: Int = 1,
    val enemies: List<Enemy> = emptyList(),
    val chainedBeasts: List<ChainedBeast> = emptyList(),
    val inventory: List<Equipment> = emptyList(),
    val equippedItems: Map<com.example.data.model.EquipSlot, Equipment> = emptyMap(),
    val xRayEvent: XRayImpactEvent? = null,
    val bloodParticles: List<BloodParticle> = emptyList(),
    val damageFloaters: List<DamageFloater> = emptyList(),
    val isGamePaused: Boolean = false,
    val activeModal: ActiveModal = ActiveModal.NONE,
    val timePlayedSeconds: Long = 0L,
    val isGameOver: Boolean = false,
    val isGameWonTwist: Boolean = false,
    val showPrologueBanner: Boolean = true
)

enum class ActiveModal {
    NONE,
    EVOLUTION_TREE,
    CHAINED_BEASTS,
    INVENTORY,
    AUDIO_STORY_SETTINGS,
    MAP_LORE
}

class GameViewModel(application: Application) : AndroidViewModel(application) {

    private val _uiState = MutableStateFlow(GameUiState())
    val uiState: StateFlow<GameUiState> = _uiState.asStateFlow()

    val synthEngine = DubstepSynthEngine()
    val narrator = AbyssalNarrator(application)

    private var gameLoopJob: Job? = null
    private var inputX = 0f
    private var inputY = 0f

    init {
        loadDepth(1)
        synthEngine.start()
        startGameLoop()
    }

    fun dismissPrologueBanner() {
        _uiState.value = _uiState.value.copy(showPrologueBanner = false)
    }

    fun loadDepth(depth: Int) {
        val (level, enemies) = DungeonGenerator.generateLevel(depth)
        val currentCreature = _uiState.value.creature
        _uiState.value = _uiState.value.copy(
            currentDepth = depth,
            dungeonLevel = level,
            enemies = enemies,
            creature = currentCreature.copy(
                posX = level.spawnX,
                posY = level.spawnY,
                velocityX = 0f,
                velocityY = 0f,
                isGrounded = true
            )
        )

        narrator.narrateLevelEntry(depth, level.name)
        synthEngine.isBossFight = (depth == 13 || enemies.any { it.species.isBoss })
    }

    private fun startGameLoop() {
        gameLoopJob?.cancel()
        gameLoopJob = viewModelScope.launch {
            var lastTime = System.currentTimeMillis()
            while (isActive) {
                val now = System.currentTimeMillis()
                val dt = ((now - lastTime) / 1000f).coerceIn(0.005f, 0.04f)
                lastTime = now

                if (!_uiState.value.isGamePaused && !_uiState.value.isGameOver) {
                    updateSideScrollerPhysics(dt)
                }
                delay(20) // ~50 FPS physics & game loop tick
            }
        }
    }

    private fun updateSideScrollerPhysics(dt: Float) {
        val state = _uiState.value
        val level = state.dungeonLevel ?: return
        var creature = state.creature
        val enemies = state.enemies.toMutableList()
        val chained = state.chainedBeasts.toMutableList()
        val particles = state.bloodParticles.toMutableList()
        val floaters = state.damageFloaters.toMutableList()

        // 1. Side-Scroller Platformer Physics (Only active if hatched!)
        if (creature.stage != CreatureStage.EGG) {
            val speed = if (creature.isDashing) creature.moveSpeed * 1.8f else creature.moveSpeed
            var vx = inputX * speed
            var vy = creature.velocityY + 26.0f * dt // Gravity pulling down

            var px = creature.posX + vx * dt
            var py = creature.posY + vy * dt

            val facingRight = if (inputX > 0.1f) true else if (inputX < -0.1f) false else creature.facingRight

            // Horizontal bounds & wall collisions
            val checkX = if (vx > 0) px + 0.6f else px - 0.6f
            val curY = py.toInt().coerceIn(0, level.height - 1)
            val nextGridX = checkX.toInt().coerceIn(0, level.width - 1)

            if (level.tiles[curY][nextGridX] == TileType.WALL) {
                vx = 0f
                px = creature.posX
            }

            // Vertical ledge & floor collisions
            var isGrounded = false
            val feetY = (py + 0.95f).toInt().coerceIn(0, level.height - 1)
            val feetX = px.toInt().coerceIn(0, level.width - 1)
            val tileBelow = level.tiles[feetY][feetX]

            if (vy >= 0f && (tileBelow == TileType.FLOOR || tileBelow == TileType.WALL || tileBelow == TileType.PUZZLE_PLATE)) {
                // Landed on top of stone ledge!
                py = feetY - 0.95f
                vy = 0f
                isGrounded = true
            }

            // Environmental Hazards (Acid, Steam, Spikes)
            var hp = creature.currentHp
            if (tileBelow == TileType.ACID_POOL && creature.stage != CreatureStage.ACID_WYRM) {
                hp = (hp - tileBelow.hazardDamage * dt).coerceAtLeast(0f)
                spawnBloodBurst(px, py + 0.5f, 2, NeonAcidGreen)
            } else if (tileBelow == TileType.STEAM_DRAIN && creature.stage != CreatureStage.STEAM_GOLEMITE) {
                hp = (hp - tileBelow.hazardDamage * dt).coerceAtLeast(0f)
            } else if (tileBelow == TileType.IRON_SPIKES) {
                hp = (hp - tileBelow.hazardDamage * dt).coerceAtLeast(0f)
            }

            // Stamina recovery
            val stamina = (creature.currentStamina + 14f * dt).coerceAtMost(creature.maxStamina)

            // Attack & Dash timers
            val attackTimer = (creature.attackTimer - dt).coerceAtLeast(0f)
            val attackState = if (attackTimer <= 0f) 0 else creature.attackState
            val dashTimer = (creature.dashTimer - dt).coerceAtLeast(0f)
            val isDashing = dashTimer > 0f

            creature = creature.copy(
                posX = px.coerceIn(1.5f, level.width - 2.5f),
                posY = py.coerceIn(1.5f, level.height - 2.5f),
                velocityX = vx,
                velocityY = vy,
                isGrounded = isGrounded,
                facingRight = facingRight,
                currentHp = hp,
                currentStamina = stamina,
                attackTimer = attackTimer,
                attackState = attackState,
                dashTimer = dashTimer,
                isDashing = isDashing
            )

            // Check if player reaches the descending stairs at the far right
            val currentGridX = px.toInt().coerceIn(0, level.width - 1)
            val currentGridY = py.toInt().coerceIn(0, level.height - 1)
            if (level.tiles[currentGridY][currentGridX] == TileType.STAIRS_DOWN) {
                if (state.currentDepth < 13) {
                    loadDepth(state.currentDepth + 1)
                    return
                } else {
                    narrator.narrateEndingTwist()
                    _uiState.value = _uiState.value.copy(isGameWonTwist = true)
                    return
                }
            }
        }

        // 2. Physics-based Chained Companions trailing in 2.5D Side-Scroller
        var anchorX = creature.posX
        var anchorY = creature.posY

        for (bIdx in chained.indices) {
            val beast = chained[bIdx]
            val maxSlack = beast.chainLength
            val dist = hypot(beast.posX - anchorX, beast.posY - anchorY)

            var bx = beast.posX
            var by = beast.posY

            // Trail behind horizontally based on facing direction
            val targetOffset = if (creature.facingRight) -1.4f else 1.4f
            val desiredX = anchorX + targetOffset

            if (dist > maxSlack) {
                val ang = atan2(beast.posY - anchorY, beast.posX - anchorX)
                bx = anchorX + cos(ang) * maxSlack
                by = anchorY + sin(ang) * maxSlack
            } else {
                // Smooth follow lerp
                bx += (desiredX - bx) * 4.5f * dt
                by += (anchorY - by) * 4.5f * dt
            }

            // Generate intermediate chain links
            val links = mutableListOf<ChainJoint>()
            val linkCount = 4
            for (l in 1..linkCount) {
                val ratio = l.toFloat() / (linkCount + 1)
                // Catenary chain sag in side-scroller
                val sag = sin(ratio * Math.PI.toFloat()) * 0.25f
                val lx = anchorX + (bx - anchorX) * ratio
                val ly = anchorY + (by - anchorY) * ratio + sag
                links.add(ChainJoint(lx, ly))
            }

            // Chained companion autonomous attack
            var bTimer = beast.attackTimer - dt
            val targetEnemy = enemies.firstOrNull {
                hypot(it.posX - bx, it.posY - by) < beast.type.attackRange && it.currentHp > 0f
            }

            if (targetEnemy != null && bTimer <= 0f) {
                bTimer = 1.3f
                val dmg = beast.type.baseDamage * (1f + beast.level * 0.2f)
                val eIdx = enemies.indexOfFirst { it.id == targetEnemy.id }
                if (eIdx != -1) {
                    val hitEnemy = enemies[eIdx]
                    val newHp = (hitEnemy.currentHp - dmg).coerceAtLeast(0f)
                    enemies[eIdx] = hitEnemy.copy(currentHp = newHp)
                    floaters.add(
                        DamageFloater(
                            id = System.nanoTime(),
                            text = "-${dmg.toInt()}",
                            x = hitEnemy.posX,
                            y = hitEnemy.posY - 0.5f,
                            color = beast.type.auraColor
                        )
                    )
                }
            }

            chained[bIdx] = beast.copy(
                posX = bx,
                posY = by,
                chainLinks = links,
                attackTimer = bTimer
            )
            anchorX = bx
            anchorY = by
        }

        // 3. Update Side-Scrolling Enemies (Packs & Patrols)
        var hasActiveAlert = false
        val updatedEnemies = enemies.map { enemy ->
            if (enemy.currentHp <= 0f) return@map enemy

            val distX = creature.posX - enemy.posX
            val distY = creature.posY - enemy.posY
            val dist = hypot(distX, distY)

            var ex = enemy.posX
            var ey = enemy.posY
            var alert = enemy.alertState
            var cooldown = (enemy.attackCooldownTimer - dt).coerceAtLeast(0f)

            // Only alert when player gets close (NOT in the sanctuary nursery!)
            if (dist < 8.0f && creature.stage != CreatureStage.EGG) {
                alert = true
                hasActiveAlert = true

                // Side-scrolling patrol movement towards player
                val dirX = if (distX > 0) 1f else -1f
                if (abs(distX) > 1.2f) {
                    ex += dirX * enemy.speed * dt
                } else if (cooldown <= 0f) {
                    // Attack player
                    cooldown = 1.5f
                    val dmg = (enemy.attackPower - creature.baseDefense * 0.4f).coerceAtLeast(3f)
                    creature = creature.copy(currentHp = (creature.currentHp - dmg).coerceAtLeast(0f))
                    floaters.add(
                        DamageFloater(
                            id = System.nanoTime(),
                            text = "-${dmg.toInt()}",
                            x = creature.posX,
                            y = creature.posY - 0.6f,
                            color = NeonCrimson
                        )
                    )
                }
            }

            enemy.copy(
                posX = ex,
                posY = ey,
                alertState = alert,
                attackCooldownTimer = cooldown
            )
        }

        synthEngine.combatIntensity = if (hasActiveAlert) 0.85f else 0.15f

        // 4. Update particles and floaters
        val activeParticles = particles.mapNotNull { p ->
            val nextLife = p.life - dt * 2.0f
            if (nextLife > 0f) {
                p.copy(
                    x = p.x + p.vx * dt,
                    y = p.y + p.vy * dt,
                    life = nextLife,
                    alpha = nextLife
                )
            } else null
        }

        val activeFloaters = floaters.mapNotNull { f ->
            val nextLife = f.life - dt * 1.4f
            if (nextLife > 0f) {
                f.copy(
                    y = f.y - 0.45f * dt,
                    life = nextLife
                )
            } else null
        }

        val currentXRay = state.xRayEvent?.let { xRay ->
            if (System.currentTimeMillis() - xRay.startTime < xRay.durationMs) xRay else null
        }

        val isGameOver = creature.currentHp <= 0f && creature.stage != CreatureStage.EGG

        _uiState.value = state.copy(
            creature = creature,
            enemies = updatedEnemies,
            chainedBeasts = chained,
            bloodParticles = activeParticles,
            damageFloaters = activeFloaters,
            xRayEvent = currentXRay,
            isGameOver = isGameOver,
            timePlayedSeconds = state.timePlayedSeconds + 1L
        )
    }

    // Controls: D-PAD
    fun onDpadDirection(dx: Float, dy: Float) {
        inputX = dx
        inputY = dy
    }

    // Controls: [A] BUTTON (Crack Egg / Melee Slash / Loot Chest / Interact)
    fun onButtonAPressed() {
        val state = _uiState.value
        val creature = state.creature
        val level = state.dungeonLevel ?: return

        // 1. Egg Hatching Sequence (Safe upon sacred altar!)
        if (creature.stage == CreatureStage.EGG) {
            val nextCracks = creature.eggCracks + 1
            if (nextCracks < 3) {
                _uiState.value = state.copy(
                    creature = creature.copy(eggCracks = nextCracks)
                )
                narrator.narrateEggStrike(nextCracks)
                synthEngine.playBoneBreakCrunch()
                spawnBloodBurst(creature.posX, creature.posY, 8, NeonCrimson)
            } else {
                // EGG HATCHES!
                _uiState.value = state.copy(
                    creature = creature.copy(
                        stage = CreatureStage.HATCHLING_LARVA,
                        eggCracks = 3,
                        baseAttack = 26f,
                        moveSpeed = 5.4f
                    ),
                    showPrologueBanner = false
                )
                narrator.narrateEggStrike(3)
                synthEngine.playBoneBreakCrunch()
                spawnBloodBurst(creature.posX, creature.posY, 25, NeonCrimson)
            }
            return
        }

        // 2. Open Loot Chest
        val frontX = if (creature.facingRight) creature.posX + 1.2f else creature.posX - 1.2f
        val gChestX = frontX.toInt().coerceIn(0, level.width - 1)
        val gChestY = creature.posY.toInt().coerceIn(0, level.height - 1)

        if (level.tiles[gChestY][gChestX] == TileType.LOOT_CHEST) {
            val loot = DungeonGenerator.generateChestLoot(state.currentDepth)
            level.tiles[gChestY][gChestX] = TileType.FLOOR
            val updatedInventory = state.inventory + loot
            _uiState.value = state.copy(
                inventory = updatedInventory,
                damageFloaters = state.damageFloaters + DamageFloater(
                    id = System.nanoTime(),
                    text = "${loot.rarity.title}: ${loot.name}!",
                    x = creature.posX,
                    y = creature.posY - 1f,
                    color = loot.rarity.color
                )
            )
            narrator.speak("Acquired ${loot.name}, of ${loot.rarity.title} quality! ${loot.specialPerk}")
            return
        }

        // 3. Side-Scroller Melee Claw & Chain Slash Combo!
        val nextCombo = (creature.attackState % 3) + 1
        val isFinisher = (nextCombo == 3)
        _uiState.value = state.copy(
            creature = creature.copy(
                attackState = nextCombo,
                attackTimer = 0.35f
            )
        )

        val enemies = state.enemies.toMutableList()
        for (i in enemies.indices) {
            val enemy = enemies[i]
            if (enemy.currentHp <= 0f) continue

            val inFront = if (creature.facingRight) enemy.posX >= creature.posX - 0.4f else enemy.posX <= creature.posX + 0.4f
            val distX = abs(enemy.posX - creature.posX)
            val distY = abs(enemy.posY - creature.posY)

            if (inFront && distX < 2.0f && distY < 1.8f) {
                val isCrit = (Random.nextFloat() < creature.critChance) || isFinisher
                val dmg = creature.baseAttack * (if (isCrit) 2.4f else 1.0f) * (if (isFinisher) 1.5f else 1.0f)

                val healed = dmg * creature.lifeSteal
                val newHp = (enemy.currentHp - dmg).coerceAtLeast(0f)
                enemies[i] = enemy.copy(currentHp = newHp)

                spawnBloodBurst(enemy.posX, enemy.posY, if (isCrit) 16 else 8, NeonCrimson)

                // Mortal Kombat X-Ray Bone Crunch on Crit or Finisher!
                if (isCrit || newHp <= 0f) {
                    synthEngine.playBoneBreakCrunch()
                    val breakTypes = BoneBreakType.values()
                    val randomBreak = breakTypes[Random.nextInt(breakTypes.size)]

                    _uiState.value = _uiState.value.copy(
                        xRayEvent = XRayImpactEvent(
                            id = System.currentTimeMillis(),
                            enemyName = enemy.species.enemyName,
                            breakType = randomBreak,
                            posX = enemy.posX,
                            posY = enemy.posY
                        )
                    )
                }

                // Check for Defeated Pack Alpha to Chain!
                if (newHp <= 0f) {
                    creatureExpGain(35 + state.currentDepth * 15)
                    if (enemy.species.canBeCaptured && enemy.species.capturableBeastType != null) {
                        captureBeast(enemy.species.capturableBeastType)
                    }
                }

                _uiState.value = _uiState.value.copy(
                    creature = creature.copy(
                        currentHp = (creature.currentHp + healed).coerceAtMost(creature.maxHp)
                    ),
                    enemies = enemies,
                    damageFloaters = _uiState.value.damageFloaters + DamageFloater(
                        id = System.nanoTime(),
                        text = "${if (isCrit) "CRIT " else ""}${dmg.toInt()}",
                        x = enemy.posX,
                        y = enemy.posY - 0.7f,
                        color = if (isCrit) NeonCrimson else NeonBoneWhite,
                        isCrit = isCrit
                    )
                )
            }
        }
    }

    // Controls: [B] BUTTON (Jump in Side-Scroller / Evade Roll)
    fun onButtonBPressed() {
        val state = _uiState.value
        val creature = state.creature

        if (creature.stage == CreatureStage.EGG) {
            // Wobble egg
            synthEngine.playBoneBreakCrunch()
            return
        }

        // 1. Jump!
        if (creature.isGrounded) {
            _uiState.value = state.copy(
                creature = creature.copy(
                    velocityY = -11.8f, // Jump impulse upwards
                    isGrounded = false
                )
            )
            return
        }

        // 2. Air Dash / Double Jump Flutter / Synergy
        if (creature.currentStamina >= 20f && !creature.isDashing) {
            val dashDir = if (creature.facingRight) 1f else -1f
            _uiState.value = state.copy(
                creature = creature.copy(
                    isDashing = true,
                    dashTimer = 0.35f,
                    velocityX = dashDir * 9.5f,
                    velocityY = -4.0f,
                    currentStamina = creature.currentStamina - 20f
                )
            )

            // Trigger chained companions synergy
            if (state.chainedBeasts.isNotEmpty()) {
                val updated = state.chainedBeasts.map { it.copy(isPerformingSynergy = true, attackTimer = 0.1f) }
                _uiState.value = _uiState.value.copy(chainedBeasts = updated)
                narrator.speak("Chained companion synergy surge!")
                spawnBloodBurst(creature.posX, creature.posY, 12, NeonCyanElectric)
            }
        }
    }

    // Controls: [START] BUTTON (Open Grimoire Menu)
    fun onButtonStartPressed() {
        val currentModal = _uiState.value.activeModal
        if (currentModal == ActiveModal.NONE) {
            _uiState.value = _uiState.value.copy(
                isGamePaused = true,
                activeModal = ActiveModal.EVOLUTION_TREE
            )
        } else {
            _uiState.value = _uiState.value.copy(
                isGamePaused = false,
                activeModal = ActiveModal.NONE
            )
        }
    }

    // Controls: [SELECT] BUTTON (Audio & Voice Narrator Settings)
    fun onButtonSelectPressed() {
        val currentModal = _uiState.value.activeModal
        if (currentModal == ActiveModal.NONE) {
            _uiState.value = _uiState.value.copy(
                isGamePaused = true,
                activeModal = ActiveModal.AUDIO_STORY_SETTINGS
            )
        } else {
            _uiState.value = _uiState.value.copy(
                isGamePaused = false,
                activeModal = ActiveModal.NONE
            )
        }
    }

    fun closeModal() {
        _uiState.value = _uiState.value.copy(
            isGamePaused = false,
            activeModal = ActiveModal.NONE
        )
    }

    fun evolveCreature(targetStage: CreatureStage) {
        val creature = _uiState.value.creature
        if (creature.evolutionPoints <= 0) return

        val (atk, def, speed) = when (targetStage) {
            CreatureStage.ACID_WYRM -> Triple(32f, 12f, 5.6f)
            CreatureStage.SHADOW_STALKER -> Triple(38f, 9f, 6.4f)
            CreatureStage.STEAM_GOLEMITE -> Triple(30f, 22f, 4.8f)
            CreatureStage.BLOOD_LEVIATHAN -> Triple(36f, 14f, 5.8f)
            CreatureStage.ABYSSAL_CHIMERA -> Triple(50f, 26f, 6.0f)
            else -> Triple(creature.baseAttack, creature.baseDefense, creature.moveSpeed)
        }

        _uiState.value = _uiState.value.copy(
            creature = creature.copy(
                stage = targetStage,
                evolutionPoints = creature.evolutionPoints - 1,
                baseAttack = atk,
                baseDefense = def,
                moveSpeed = speed
            )
        )
        narrator.narrateEvolution(targetStage)
        spawnBloodBurst(creature.posX, creature.posY, 25, targetStage.primaryColor)
    }

    private fun creatureExpGain(amount: Int) {
        var creature = _uiState.value.creature
        var exp = creature.currentExp + amount
        var level = creature.level
        var evoPoints = creature.evolutionPoints

        while (exp >= creature.maxExp) {
            exp -= creature.maxExp
            level += 1
            evoPoints += 1
            narrator.speak("Level up! Level $level achieved. An evolution point is available.")
        }

        _uiState.value = _uiState.value.copy(
            creature = creature.copy(
                level = level,
                currentExp = exp,
                maxExp = 100 + level * 50,
                evolutionPoints = evoPoints,
                currentHp = creature.maxHp,
                baseAttack = creature.baseAttack + 3f
            )
        )
    }

    fun captureBeast(type: BeastType) {
        val currentChained = _uiState.value.chainedBeasts.toMutableList()
        val existing = currentChained.indexOfFirst { it.type == type }
        if (existing != -1) {
            currentChained[existing] = currentChained[existing].copy(level = currentChained[existing].level + 1)
            narrator.speak("${type.title} grows stronger! Level ${currentChained[existing].level} achieved.")
        } else {
            val newBeast = ChainedBeast(
                id = "chained_${System.currentTimeMillis()}",
                type = type,
                level = 1,
                posX = _uiState.value.creature.posX - 1.5f,
                posY = _uiState.value.creature.posY
            )
            currentChained.add(newBeast)
            narrator.narrateBeastCaptured(type)
        }
        _uiState.value = _uiState.value.copy(chainedBeasts = currentChained)
    }

    fun equipItem(equipment: Equipment) {
        val currentEquipped = _uiState.value.equippedItems.toMutableMap()
        currentEquipped[equipment.slot] = equipment
        _uiState.value = _uiState.value.copy(equippedItems = currentEquipped)
        narrator.speak("Equipped ${equipment.name}. ${equipment.wearCondition}.")
    }

    private fun spawnBloodBurst(x: Float, y: Float, count: Int, color: androidx.compose.ui.graphics.Color) {
        val newParticles = mutableListOf<BloodParticle>()
        for (i in 0 until count) {
            val angle = Random.nextFloat() * Math.PI.toFloat() * 2f
            val spd = Random.nextFloat() * 4.0f + 1.5f
            newParticles.add(
                BloodParticle(
                    x = x,
                    y = y,
                    vx = cos(angle) * spd,
                    vy = sin(angle) * spd,
                    color = color,
                    radius = Random.nextFloat() * 4.5f + 3f
                )
            )
        }
        _uiState.value = _uiState.value.copy(bloodParticles = _uiState.value.bloodParticles + newParticles)
    }

    fun restartGame() {
        _uiState.value = GameUiState()
        loadDepth(1)
    }

    override fun onCleared() {
        super.onCleared()
        synthEngine.stop()
        narrator.shutdown()
        gameLoopJob?.cancel()
    }
}
