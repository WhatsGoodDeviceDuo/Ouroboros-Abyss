// =============================================================
// OUROBOROS ABYSS - GENERATION 2.5 + START MENU & BOSS OVERHAUL MODULE
// 1. True Multi-Tier 3D Map Height, Climbable Giant Trees & Canopy Treehouses (Mysterious Magic Creatures)
// 2. Corrugated Old Sheet-Metal & Dungeon Trash Huts with Proximity Ambush Enemies
// 3. Player Status Effects:
//    - 5% Snakes: Poison (glowing purple bubbles over head + 5s bleed of 10 XP/sec in battle)
//    - 7% Eagles: Sonic Boom (visible room ripples + swirling dizzy lines around head + 5s no move/attack)
//    - 10% Spiders: Web Spray (visible spider web wrapped around body + -10% ATK & -10% DEF)
//    - Boss Arena Entangler Vines: Thorny Vines that entangle & root the hero for ~2.2 seconds
// 4. Challenging Boss Chambers:
//    - Bosses relentlessly pursue & lunge at the player character
//    - Boss chamber enemies spawn tightly grouped right around the boss (38..54px) to guard & attack together
//    - Ground Cave Burrows & Ceiling Swing-In Spiders/Beasts that emerge/drop in to assist the boss
// 5. Real WebAudio Creature & Boss Weapon Sound Effects + Explicit Vocal Naming of Duplicate Weapons, Shields & Armor and What They Fuse Into
// 6. Bottom-Controller START MENU Button + Multi-Playthrough Save File Tracking Page (Restart Current Playthrough, Create New Playthrough & Preserve Last Playthrough, or Switch Between Concurrent Save Files)
// =============================================================

(function () {
  // -------------------------------------------------------------
  // 0. AUDIO NOISE BUFFER, VOCAL DUPLICATE NAMING FIX & BOSS COMBAT SAFETY GUARDS
  // -------------------------------------------------------------
  if (typeof audio !== 'undefined' && audio) {
    if (typeof audio.createNoiseBuffer !== 'function') {
      audio.createNoiseBuffer = function () {
        if (this.noiseBuffer) return this.noiseBuffer;
        if (typeof this.createWarmNoiseBuffer === 'function') {
          this.noiseBuffer = this.createWarmNoiseBuffer();
          return this.noiseBuffer;
        }
        if (!this.ctx) return null;
        const sr = this.ctx.sampleRate || 44100;
        const buf = this.ctx.createBuffer(1, sr, sr);
        const data = buf.getChannelData(0);
        for (let i = 0; i < sr; i++) data[i] = (Math.random() * 2 - 1) * 0.25;
        this.noiseBuffer = buf;
        return buf;
      };
    }
    const _origPlaySfx = audio.playSfx ? audio.playSfx.bind(audio) : null;
    if (_origPlaySfx) {
      audio.playSfx = function (type) {
        if (state && state.isPaused) return;
        if (typeof document !== 'undefined' && document.hidden) return;
        try {
          _origPlaySfx(type);
        } catch (err) {
          console.warn('SFX warning (' + type + '):', err);
        }
      };
    }

    const _origAudioInit = audio.init ? audio.init.bind(audio) : null;
    if (_origAudioInit) {
      audio.init = function () {
        if (state && state.isPaused) return;
        if (typeof document !== 'undefined' && document.hidden) return;
        _origAudioInit();
      };
    }

    audio.suspendAudio = function () {
      try {
        if (this.timerId) {
          clearTimeout(this.timerId);
          this.timerId = null;
        }
        this.isPlaying = false;
        if (this.ctx && this.masterGain) {
          const now = this.ctx.currentTime;
          this.masterGain.gain.cancelScheduledValues(now);
          this.masterGain.gain.setValueAtTime(0.0001, now);
        }
        if (this.ctx && this.ctx.state === 'running') {
          this.ctx.suspend();
        }
      } catch (e) {}
      try {
        if (window.AndroidTTS && typeof window.AndroidTTS.stop === 'function') {
          window.AndroidTTS.stop();
        }
      } catch (e) {}
      try {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
      } catch (e) {}
    };

    audio.resumeAudio = function () {
      if (state && state.isPaused) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        if (!this.ctx) {
          if (_origAudioInit) _origAudioInit();
          return;
        }
        if (this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
        if (this.masterGain) {
          const now = this.ctx.currentTime;
          this.masterGain.gain.cancelScheduledValues(now);
          this.masterGain.gain.setTargetAtTime(this._enabled ? 0.72 : 0.0001, now, 0.04);
        }
        if (!this.isPlaying && typeof this.startSequencer === 'function') {
          this.startSequencer();
        }
      } catch (e) {}
    };
  }

  // Helper to format item names cleanly for spoken TTS (replaces '★' with 'Legendary ' and keeps full item names!)
  function formatSpokenGearName(rawName) {
    if (!rawName) return 'Unknown Relic';
    return String(rawName)
      .replace(/★\s*/g, 'Legendary ')
      .replace(/[\[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Helper that returns the exact fusion target item name for any weapon, shield, or armor
  function getGearFusionResultName(item, p) {
    if (!item) return 'a Legendary Relic';
    const target = item.fusesInto ? ARSENAL.find(g => g.id === item.fusesInto) : null;
    if (target) {
      return formatSpokenGearName(target.name);
    }
    const nextStar = ((p && p.forgeStars && p.forgeStars[item.id]) ? p.forgeStars[item.id] : 0) + 1;
    return formatSpokenGearName(item.name) + ' Star Rank Plus ' + nextStar;
  }

  // Build an explicit spoken & visual summary of any duplicate weapons, shields, or armor the player currently holds
  function getPlayerDuplicateFusionSummary(p) {
    if (!p || !p.gearCounts) return null;
    const dupItems = ARSENAL.filter(g => (p.gearCounts[g.id] || 0) >= 2 && p.unlockedArsenal.includes(g.id));
    if (dupItems.length === 0) return null;
    const parts = dupItems.map(item => {
      const slotType = item.slot === 'shield' ? 'shield' : (item.slot === 'armor' ? 'armor' : 'weapon');
      const srcName = formatSpokenGearName(item.name);
      const dstName = getGearFusionResultName(item, p);
      return 'two copies of the ' + slotType + ' ' + srcName + ' which combine to make ' + dstName;
    });
    return 'You currently have ' + parts.join(', and ') + '!';
  }

  // Fix VocalDialogueSystem.speakAloud so it NEVER strips bracketed weapon/armor/shield names!
  if (typeof dialogue !== 'undefined' && dialogue) {
    dialogue.speakAloud = function (speaker, message) {
      if (!audio.enabled || !audio.voiceEnabled) return;
      const s = (speaker || '').toUpperCase();

      if (s.includes('SSSETH') || s.includes('SNAKE') || s.includes('VIPER') || s.includes('SERPENT')) {
        audio.playSfx('snake_hiss');
      } else if (s.includes('COLOSSUS') || s.includes('MATRIARCH') || s.includes('OUROBOROS PRIME') || s.includes('GRIMGOR') || s.includes('BOAR')) {
        audio.playSfx('boss_roar');
      } else if (s.includes('TREEHOUSE') || s.includes('SYLVAN') || s.includes('SPRITE') || s.includes('ORACLE')) {
        audio.playSfx('magic_chime');
      }

      // IMPORTANT: Replace '★' with 'Legendary ' and remove only the '[' and ']' characters themselves
      // (instead of deleting text inside brackets, which previously erased weapon, shield & armor names!)
      const cleanMsg = (message || '')
        .replace(/★\s*/g, 'Legendary ')
        .replace(/\[(TAP|CLICK).*?\]/gi, ' ')
        .replace(/[\[\]]/g, '')
        .replace(/\b(H+S+S+|S+S+S+H*|S+N+O+R+T+|S+C+R+E+E+C+H+|G+R+R+R+|H+I+S+S+|K+R+A+K+A+T+O+O+M+)\b[!?.]*/gi, ' ')
        .replace(/[⚒️👑🛡️⚔️🦺▼▲💫🕸️☠️🌳🏚️🌿🔄➕▶️🗑️]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!cleanMsg || cleanMsg === this.lastSpokenText) return;
      this.lastSpokenText = cleanMsg;

      audio.playVoiceSyllables(speaker, cleanMsg.length);

      let pitch = 0.85, rate = 1.04;
      if (s.includes('BOSS') || s.includes('COLOSSUS') || s.includes('MATRIARCH') || s.includes('OUROBOROS')) {
        pitch = 0.62; rate = 0.92;
      } else if (s.includes('QUILL') || s.includes('COMPANION') || s.includes('SPRITE')) {
        pitch = 1.25; rate = 1.12;
      } else if (s.includes('OBELISK') || s.includes('CHRONICLER') || s.includes('ORACLE')) {
        pitch = 0.78; rate = 0.98;
      }

      try {
        if (window.AndroidTTS && typeof window.AndroidTTS.speak === 'function') {
          window.AndroidTTS.speak(cleanMsg, pitch, rate);
          return;
        }
      } catch (e) {}

      try {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(cleanMsg);
          utter.pitch = pitch;
          utter.rate = rate;
          utter.volume = 0.95;
          window.speechSynthesis.speak(utter);
        }
      } catch (e) {}
    };
  }

  // Override unlockGear so duplicate weapons, shields & armor ALWAYS speak their exact name and what they combine to make!
  unlockGear = function (item, silentDialogue = false) {
    const p = state.player;
    if (!item) return;
    if (!p.gearCounts) p.gearCounts = {};
    const prevCount = p.gearCounts[item.id] || (p.unlockedArsenal.includes(item.id) ? 1 : 0);
    p.gearCounts[item.id] = prevCount + 1;

    const isDuplicate = p.unlockedArsenal.includes(item.id);
    if (!isDuplicate) {
      p.unlockedArsenal.push(item.id);
      p.inventory.push(item);
      equipGearItem(item);
    } else {
      audio.playSfx('loot');
      saveGameProgress('duplicate_loot', true);
      updateHud();
      if (isCodexOpen()) updateCodexUi();
    }

    if (!silentDialogue) {
      const newCount = p.gearCounts[item.id];
      const slotWord = item.slot === 'shield' ? 'shield' : (item.slot === 'armor' ? 'armor' : 'weapon');
      const spokenItemName = formatSpokenGearName(item.name);
      const spokenResultName = getGearFusionResultName(item, p);

      if (newCount >= 2) {
        showFloater("⚒️ x2 " + item.name.toUpperCase() + " -> " + spokenResultName.toUpperCase() + "!", p.x, p.y - 34 - p.z, '#fde047');
        showToast("DUPLICATE " + slotWord.toUpperCase() + ": 2x " + spokenItemName + " -> " + spokenResultName + "!");
        dialogue.show(
          "⚒️ DUPLICATE " + slotWord.toUpperCase() + ": " + spokenItemName.toUpperCase() + " (x" + newCount + ")",
          "You found a duplicate " + slotWord + ": " + spokenItemName + "! You now carry two copies of " + spokenItemName + ", which can be combined in your Arsenal menu or at the Forge Anvil to make the " + spokenResultName + "!",
          7400
        );
      } else {
        const slotTitle = item.isLegendary ? "★ LEGENDARY " + slotWord.toUpperCase() + " DISCOVERED!" : ("NEW " + slotWord.toUpperCase() + " DISCOVERED!");
        const cleanDesc = (item.desc || '').replace(/\[FUSE.*?\]/gi, '').trim();
        dialogue.show(
          slotTitle,
          "Equipped the " + slotWord + " " + spokenItemName + "! " + cleanDesc + " Finding a second copy of " + spokenItemName + " lets you combine them to make the " + spokenResultName + "!",
          6400
        );
      }
    }
  };

  // Override fuseGearItem so combining two items explicitly names both the source weapon/shield/armor and the created item!
  fuseGearItem = function (item) {
    const p = state.player;
    if (!item) return false;
    if (!p.gearCounts) p.gearCounts = {};
    if (!p.forgeStars) p.forgeStars = {};

    const count = p.gearCounts[item.id] || (p.unlockedArsenal.includes(item.id) ? 1 : 0);
    const slotWord = item.slot === 'shield' ? 'shield' : (item.slot === 'armor' ? 'armor' : 'weapon');
    const spokenItemName = formatSpokenGearName(item.name);
    const spokenResultName = getGearFusionResultName(item, p);

    if (count < 2) {
      showToast("NEED 2 COPIES OF " + spokenItemName.toUpperCase() + " (" + count + "/2) TO MAKE " + spokenResultName.toUpperCase() + "!");
      return false;
    }

    const targetItem = item.fusesInto ? ARSENAL.find(g => g.id === item.fusesInto) : null;
    p.fusionsCompleted = (p.fusionsCompleted || 0) + 1;
    state.tutorialFlags.fusionDone = true;

    if (targetItem) {
      const remaining = Math.max(0, count - 2);
      p.gearCounts[item.id] = remaining;
      if (remaining === 0) {
        p.unlockedArsenal = p.unlockedArsenal.filter(id => id !== item.id);
        p.inventory = p.inventory.filter(g => g.id !== item.id);
      }

      const prevTargetCount = p.gearCounts[targetItem.id] || (p.unlockedArsenal.includes(targetItem.id) ? 1 : 0);
      p.gearCounts[targetItem.id] = prevTargetCount + 1;
      if (!p.unlockedArsenal.includes(targetItem.id)) {
        p.unlockedArsenal.push(targetItem.id);
        p.inventory.push(targetItem);
      }

      const targetSpoken = formatSpokenGearName(targetItem.name);
      const cleanDesc = (targetItem.desc || '').replace(/\[FUSE.*?\]/gi, '').trim();
      equipGearItem(targetItem);
      audio.playSfx('legendary_slash');
      spawnWarpEffect(p.x, p.y - p.z, targetItem.glowColor || '#fde047', 96);
      createSparks(p.x, p.y - p.z, 32, targetItem.glowColor || '#fde047');
      showFloater("⚒️ FUSED -> " + targetSpoken.toUpperCase() + "!", p.x, p.y - 36 - p.z, '#fde047');
      showToast("FORGED: 2x " + spokenItemName + " -> " + targetSpoken + "!");
      dialogue.show(
        "⚒️ RELIC FUSION COMPLETE: " + targetSpoken.toUpperCase(),
        "You combined two copies of the " + slotWord + " " + spokenItemName + " to make the " + targetSpoken + "! " + cleanDesc,
        6600
      );
    } else {
      p.gearCounts[item.id] = Math.max(1, count - 1);
      p.forgeStars[item.id] = (p.forgeStars[item.id] || 0) + 1;
      equipGearItem(item);
      audio.playSfx('legendary_slash');
      spawnWarpEffect(p.x, p.y - p.z, '#fde047', 100);
      createSparks(p.x, p.y - p.z, 34, '#fde047');
      showFloater("★ ASCENDED +" + p.forgeStars[item.id] + "!", p.x, p.y - 36 - p.z, '#fde047');
      showToast("RELIC ASCENDED: " + spokenItemName + " Star Rank +" + p.forgeStars[item.id] + "!");
      dialogue.show(
        "★ LEGENDARY RELIC ASCENDED!",
        "You combined two copies of the " + slotWord + " " + spokenItemName + " to make " + spokenResultName + ", permanently boosting its combat power!",
        5800
      );
    }

    saveGameProgress('gear_fusion', true);
    updateHud();
    if (isCodexOpen()) updateCodexUi();
    return true;
  };

  // Override interactForgeAnvil and inspectLoreObelisk so they explicitly name the player's duplicate gear & what it makes!
  interactForgeAnvil = function (tx, ty) {
    const p = state.player;
    if (!p.gearCounts) p.gearCounts = {};
    const fusableItem = ARSENAL.find(g => (p.gearCounts[g.id] || 0) >= 2 && p.unlockedArsenal.includes(g.id));
    createSparks(tx * TILE_SIZE + 32, ty * TILE_SIZE + 32, 20, '#fbbf24');
    if (fusableItem) {
      fuseGearItem(fusableItem);
    } else {
      audio.playSfx('block');
      const eq = p.weapon || p.shield || p.armor || ARSENAL[0];
      const eqSlot = eq.slot === 'shield' ? 'shield' : (eq.slot === 'armor' ? 'armor' : 'weapon');
      const eqName = formatSpokenGearName(eq.name);
      const eqTarget = getGearFusionResultName(eq, p);
      dialogue.show(
        "⚒️ OUROBOROS FORGE ANVIL (GEAR FUSION)",
        "Bring two copies of any weapon, shield, or armor here to combine them! For example, combining two copies of your " + eqSlot + " " + eqName + " will make the " + eqTarget + "!",
        6800
      );
      showToast("FORGE ANVIL: 2x " + eqName + " MAKES " + eqTarget + "!");
    }
  };

  inspectLoreObelisk = function (tx, ty) {
    audio.playSfx('loot');
    createSparks(tx * TILE_SIZE + 32, ty * TILE_SIZE + 32, 14, '#38bdf8');
    const p = state.player;
    const chapter = getStoryChapterForCycle(state.currentFloor, state.cycle);
    const dupSummary = getPlayerDuplicateFusionSummary(p);
    let fusionTip = '';
    if (dupSummary) {
      fusionTip = ' ' + dupSummary;
    } else {
      const sampleItem = p.weapon || p.shield || p.armor || ARSENAL[0];
      const sSlot = sampleItem.slot === 'shield' ? 'shield' : (sampleItem.slot === 'armor' ? 'armor' : 'weapon');
      fusionTip = ' Combine two copies of the ' + sSlot + ' ' + formatSpokenGearName(sampleItem.name) + ' in the Arsenal menu to make the ' + getGearFusionResultName(sampleItem, p) + '!';
    }
    dialogue.show(
      "WARDEN RUNESTONE OBELISK",
      chapter.lore + fusionTip,
      8200
    );
  };

  // -------------------------------------------------------------
  // 0A-2. SMART AUDIO GUIDES ON FUTURE LOOPS (CYCLE 2+)
  // Suppress repetitive basic tutorials & intermediate floor lore on future loops;
  // only play audible updates for important dungeon changes, evolved bosses, and Loop 3/5/7/9/13 Godly gear milestones!
  // -------------------------------------------------------------
  if (typeof dialogue !== 'undefined' && dialogue) {
    const _origDialogueShow = dialogue.show.bind(dialogue);
    dialogue.show = function (speaker, text, duration = 5500, forceSpeakOnLoop = false) {
      const spk = String(speaker || '').toUpperCase();
      // Never play beginner tutorial guides or high-ground reminders on Loop 2+
      if (state.cycle > 1 && !forceSpeakOnLoop) {
        if (
          spk.includes('TUTORIAL') ||
          spk.includes('HIGH GROUND') ||
          (spk.includes('QUILL COMPANION') && String(text || '').includes('fissures in this stone wall'))
        ) {
          return;
        }
      }
      _origDialogueShow(speaker, text, duration);
    };
  }

  function checkAndGrantCycleMilestoneGear(cycleNum) {
    const p = state.player;
    if (!p) return null;
    if (!p.cycleMilestonesGranted) p.cycleMilestonesGranted = {};
    const milestoneCycles = [3, 5, 7, 9, 13];
    let newlyUnlocked = null;
    milestoneCycles.forEach(mc => {
      if (cycleNum >= mc && !p.cycleMilestonesGranted[mc]) {
        p.cycleMilestonesGranted[mc] = true;
        // Find the Godly/Ascended items unlocked at this milestone cycle
        const tierItems = ARSENAL.filter(g => g.minCycle === mc);
        if (tierItems.length > 0) {
          // Also grant a duplicate of the player's current weapon/shield/armor so they can immediately combine in the Forge, PLUS unlock the first milestone piece!
          if (p.weapon && p.weapon.fusesInto) {
            unlockGear(p.weapon, true);
          }
          const gift = tierItems[0];
          unlockGear(gift, true);
          newlyUnlocked = { cycle: mc, items: tierItems, gift };
        }
      }
    });
    return newlyUnlocked;
  }

  const _origGenerateDungeonFloor = typeof generateDungeonFloor === 'function' ? generateDungeonFloor : null;
  if (_origGenerateDungeonFloor) {
    generateDungeonFloor = function (floorNum, opts = {}) {
      // On Loop 2+, mark all basic onboarding tutorial flags as complete so they never repeat
      if (state.cycle > 1 && state.tutorialFlags) {
        state.tutorialFlags.step = 5;
        state.tutorialFlags.moved = true;
        state.tutorialFlags.highGround = true;
        state.tutorialFlags.secretFound = true;
        state.tutorialFlags.liquidWade = true;
        state.tutorialFlags.attacked = true;
        state.tutorialFlags.whirlwindUsed = true;
      }

      // Temporarily intercept the automatic floor-entry dialogue inside _origGenerateDungeonFloor on Loop 2+
      let suppressedEntryLore = false;
      const origShow = dialogue.show;
      if (state.cycle > 1 && !opts.isDeathRecoveryToStart) {
        dialogue.show = function () {
          suppressedEntryLore = true;
        };
      }
      try {
        _origGenerateDungeonFloor(floorNum, opts);
      } finally {
        dialogue.show = origShow;
      }

      // On Loop 2+, only play audible updates for IMPORTANT changes to the dungeons!
      if (state.cycle > 1 && suppressedEntryLore && !opts.isDeathRecoveryToStart && !opts.restoringFromSave) {
        const theme = getEffectiveFloorTheme(floorNum, state.cycle);
        const milestoneInfo = checkAndGrantCycleMilestoneGear(state.cycle);

        if (floorNum === 1) {
          if (milestoneInfo) {
            const namesList = milestoneInfo.items.map(it => formatSpokenGearName(it.name)).join(', ');
            dialogue.show(
              "⚡ LOOP " + state.cycle + " ASCENSION: GODLY FORGE TIER UNLOCKED!",
              "Welcome to Loop " + state.cycle + "! Important Dungeon & Arsenal Update: The 13 dungeons have mutated into " + theme.name + ", and new Ascended & Godly equipment combinations are now active in the Forge and chests: " + namesList + "! Combine two copies of your relics to wield their magical moves!",
              8800,
              true
            );
          } else {
            dialogue.show(
              "🔄 LOOP " + state.cycle + " DUNGEON MUTATION",
              "Loop " + state.cycle + " begins! The subterranean world has shifted into " + theme.name + " with rotated Clan Warlords and deadlier ambushes. Only major dungeon mutations and Boss Evolutions will be announced on this loop.",
              6800,
              true
            );
          }
        } else if (floorNum === 5 || floorNum === 10 || floorNum === 13) {
          const bossName = state.boss ? formatSpokenGearName(state.boss.name) : "The Abyssal Overlord";
          dialogue.show(
            "💀 IMPORTANT DUNGEON ALERT: EVOLVED BOSS CHAMBER (F" + floorNum + ")",
            "Warning! Floor " + floorNum + " has mutated for Loop " + state.cycle + "! " + bossName + " awaits with close-formation guards, entangling battleground vines, and cave-burrow ambushers!",
            6800,
            true
          );
        } else {
          // Intermediate floors on Loop 2+: quiet visual toast only (no repetitive audio monologue!)
          showToast("LOOP " + state.cycle + " • FLOOR " + floorNum + ": " + theme.name.toUpperCase());
        }
      } else if (state.cycle === 1 && !opts.isDeathRecoveryToStart && !opts.restoringFromSave) {
        checkAndGrantCycleMilestoneGear(state.cycle);
      }
    };
  }

  getPlayerBlockChance = function (p) {
    if (!p || !p.shield) return 0;
    const shdStars = getItemForgeStars(p, p.shield);
    const maxCap = p.shield.isGodly ? 85 : 75;
    return Math.min(maxCap, (p.shield.blockChance || 0) + shdStars * 3);
  };

  function applyArmorDamageReduction(p, rawDmg) {
    if (!p || !p.armor || !p.armor.dmgReduction) return rawDmg;
    const reduced = Math.round(rawDmg * (1 - Math.min(0.65, p.armor.dmgReduction)));
    return Math.max(1, reduced);
  }

  const _origAttemptShieldBlock = typeof attemptShieldBlock === 'function' ? attemptShieldBlock : null;
  if (_origAttemptShieldBlock) {
    attemptShieldBlock = function (attackerEntity) {
      const p = state.player;
      const blockPct = getPlayerBlockChance(p);
      if (blockPct > 0 && Math.random() * 100 < blockPct) {
        audio.playSfx('block');
        const glowCol = (p.shield && p.shield.glowColor) || '#38bdf8';
        createSparks(p.x, p.y - p.z, 18, glowCol);
        if (p.shield && p.shield.isLegendary) {
          spawnWarpEffect(p.x, p.y - p.z, glowCol, 62);
        }
        showFloater("🛡️ BLOCKED!", p.x, p.y - 28 - p.z, '#38bdf8');
        const recoil = (p.shield && p.shield.recoilDmg) ? (p.shield.recoilDmg + getItemForgeStars(p, p.shield) * 8) : 0;
        if (attackerEntity && recoil > 0) {
          if (state.boss && (attackerEntity === state.boss || attackerEntity.id === state.boss.id)) {
            damageBoss(recoil);
          } else {
            damageEnemy(attackerEntity, recoil);
          }
        }

        // Trigger Ascended & Godly Shield Magical Moves on Block!
        const shdMove = p.shield && p.shield.magicMove;
        if (shdMove === 'dawn_shockwave') {
          // Loop 3+ Shield: Solar Shockwave damages & stuns nearby foes
          const waveDmg = 36 + p.level * 2;
          spawnWarpEffect(p.x, p.y - p.z, '#fde047', 135);
          state.enemies.forEach(e => {
            if (Math.hypot(e.x - p.x, e.y - p.y) < 135) {
              e.hitStun = Math.max(e.hitStun || 0, 1.1);
              damageEnemy(e, waveDmg);
            }
          });
          if (state.boss && state.boss.hp > 0 && Math.hypot(state.boss.x - p.x, state.boss.y - p.y) < 150) {
            damageBoss(waveDmg);
          }
          showFloater("☀️ DAWN SHOCKWAVE!", p.x, p.y - 42 - p.z, '#fde047');
        } else if (shdMove === 'chrono_freeze') {
          // Loop 5+ Shield: Chrono-Freeze stuns all nearby enemies for 2.0s!
          const chronoDmg = 52 + p.level * 3;
          spawnWarpEffect(p.x, p.y - p.z, '#38bdf8', 180);
          state.enemies.forEach(e => {
            if (Math.hypot(e.x - p.x, e.y - p.y) < 185) {
              e.hitStun = Math.max(e.hitStun || 0, 2.0);
              damageEnemy(e, chronoDmg);
            }
          });
          if (state.boss && state.boss.hp > 0 && Math.hypot(state.boss.x - p.x, state.boss.y - p.y) < 190) {
            state.boss.hitStun = Math.max(state.boss.hitStun || 0, 0.9);
            damageBoss(chronoDmg);
          }
          showFloater("⏳ CHRONO-FREEZE (2s)!", p.x, p.y - 42 - p.z, '#38bdf8');
        } else if (shdMove === 'supernova_burst') {
          // Loop 7+ Shield: Supernova Plasma Detonation + 6 radial plasma fireballs
          const novaDmg = 78 + p.level * 4;
          spawnWarpEffect(p.x, p.y - p.z, '#f97316', 175);
          for (let i = 0; i < 6; i++) {
            const ang = (i / 6) * Math.PI * 2;
            state.projectiles.push({
              x: p.x,
              y: p.y - p.z,
              vx: Math.cos(ang) * 12,
              vy: Math.sin(ang) * 12,
              damage: novaDmg,
              rangeRemaining: 220,
              radius: 7,
              color: '#f97316',
              isLegendary: true,
            });
          }
          showFloater("💥 SUPERNOVA WARD!", p.x, p.y - 42 - p.z, '#f97316');
        } else if (shdMove === 'infinity_prism') {
          // Loop 9+ Shield: Reflects 4 high-damage Prism Beams
          const prismDmg = 115 + p.level * 5;
          spawnWarpEffect(p.x, p.y - p.z, '#e879f9', 190);
          for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            state.projectiles.push({
              x: p.x,
              y: p.y - p.z,
              vx: Math.cos(ang) * 15,
              vy: Math.sin(ang) * 15,
              damage: prismDmg,
              rangeRemaining: 280,
              radius: 8,
              color: '#e879f9',
              isLegendary: true,
            });
          }
          showFloater("💎 INFINITY PRISM!", p.x, p.y - 42 - p.z, '#e879f9');
        } else if (shdMove === 'eternity_judgment') {
          // Loop 13+ Shield: Heals +15 HP and strikes all enemies in range with Singularity Lightning!
          const judgDmg = 175 + p.level * 6;
          p.hp = Math.min(p.maxHp, p.hp + 15);
          p.spikeInvuln = Math.max(p.spikeInvuln || 0, 0.75);
          spawnWarpEffect(p.x, p.y - p.z, '#ff1744', 250);
          state.enemies.slice().forEach(e => {
            if (Math.hypot(e.x - p.x, e.y - p.y) < 280) {
              createSparks(e.x, e.y, 14, '#fde047');
              damageEnemy(e, judgDmg);
            }
          });
          if (state.boss && state.boss.hp > 0) {
            createSparks(state.boss.x, state.boss.y, 20, '#ff1744');
            damageBoss(judgDmg);
          }
          showFloater("🌌 ETERNITY JUDGMENT (+15 HP)!", p.x, p.y - 44 - p.z, '#fde047');
          updateHud();
        }
        return true;
      }
      return false;
    };
  }

  // Override grantLootDropAt so Loops 3, 5, 7, 9, and 13 drop Ascended & Godly gear and duplicate catalysts for Forge combining!
  grantLootDropAt = function (wx, wy, sourceTitle = "ANCIENT RELIC CHEST") {
    const p = state.player;
    if (!p.gearCounts) p.gearCounts = {};
    audio.playSfx('loot');
    createSparks(wx, wy, 24, '#ffd54f');

    if (state.tutorialFlags.step < 4) {
      state.tutorialFlags.step = 4;
    }

    const curCycle = state.cycle || 1;
    let pool = [];

    // 1. Ensure the player first obtains at least one Weapon, one Shield, and one Armor piece
    if (!p.weapon) {
      pool = ARSENAL.filter(g => g.slot === 'weapon' && (g.tier || 1) <= 2);
    } else if (!p.shield) {
      pool = ARSENAL.filter(g => g.slot === 'shield' && (g.tier || 1) <= 2);
    } else if (!p.armor) {
      pool = ARSENAL.filter(g => g.slot === 'armor' && (g.tier || 1) <= 2);
    }

    // 2. High-priority Forge Duplicate Catalyst drop:
    // If the player owns items that can fuse into an item unlocked for the current cycle (including Tier 4->5->6->7->8->9 Godly chains!),
    // 68% chance to drop a 2nd copy so they can combine them in the Forge!
    if (pool.length === 0) {
      const fusableOwned = ARSENAL.filter(g => {
        if (!p.unlockedArsenal.includes(g.id) || (p.gearCounts[g.id] || 1) >= 2) return false;
        if (!g.fusesInto) return false;
        const target = ARSENAL.find(t => t.id === g.fusesInto);
        if (!target) return false;
        const reqCycle = target.minCycle || 1;
        return curCycle >= reqCycle;
      });
      if (fusableOwned.length > 0 && Math.random() < 0.68) {
        // Prioritize the player's currently equipped weapon/shield/armor if it is fusable!
        const equippedFusable = fusableOwned.filter(
          g => (p.weapon && p.weapon.id === g.id) || (p.shield && p.shield.id === g.id) || (p.armor && p.armor.id === g.id)
        );
        pool = equippedFusable.length > 0 ? equippedFusable : fusableOwned;
      }
    }

    // 3. On Loops 3, 5, 7, 9, and 13+, allow chests & Clan Sub-Bosses to directly drop Ascended/Godly relics unlocked at or below curCycle!
    if (pool.length === 0 && curCycle >= 3) {
      const godlyPool = ARSENAL.filter(g => (g.minCycle || 99) <= curCycle && (g.tier || 1) >= 4);
      if (godlyPool.length > 0 && Math.random() < 0.55) {
        pool = godlyPool;
      }
    }

    // 4. Otherwise drop a tier-appropriate item for the floor & cycle
    if (pool.length === 0) {
      const maxTierForFloor = curCycle >= 3 ? 4 : (state.currentFloor <= 3 ? 2 : 3);
      pool = ARSENAL.filter(g => (g.minCycle || 1) <= curCycle && (g.tier || 1) <= maxTierForFloor);
    }

    if (pool.length > 0) {
      const item = pool[Math.floor(Math.random() * pool.length)];
      p.hp = Math.min(p.maxHp, p.hp + 25);
      unlockGear(item, false);
    } else {
      addPlayerXp(150 * curCycle);
      p.hp = Math.min(p.maxHp, p.hp + 50);
      dialogue.show(sourceTitle, "Recovered " + (150 * curCycle) + " Soul Shards and restored 50 Vitality!", 4000);
      showToast("TREASURE: RESTORED 50 HP & +" + (150 * curCycle) + " XP!");
      updateHud();
    }
  };

  // Override damageBoss so:
  // 1) Bosses on Loops 3, 5, 7, 9, 13 drop Godly/Ascended gear or Forge duplicate catalysts!
  // 2) Defeating Ouroboros Prime on Floor 13 at Cycle 13+ triggers the epic Cycle 13 Finale Cinematic & "Ouroboros Abyss 2 - Broken Kingdom" Trailer!
  damageBoss = function (damage) {
    if (!state.boss || state.boss.hp <= 0) return;
    const b = state.boss;
    const p = state.player;
    b.hp -= damage;
    b.hitStun = 0.2;
    state.screenShake = 8;
    createBloodSpurt(b.x, b.y, 12);
    showFloater('-' + damage, b.x, b.y - 30, '#ff1744');
    updateBossHpBar();

    if (b.hp <= 0) {
      b.hp = 0;
      updateBossHpBar();
      addPlayerXp(b.xpValue);
      createBloodSpurt(b.x, b.y, 40);
      state.screenShake = 16;
      audio.intensity = 0.3;

      const bossTx = Math.floor(b.x / TILE_SIZE);
      const bossTy = Math.floor(b.y / TILE_SIZE);
      placeDescentStaircasePlaza(bossTx, Math.max(3, bossTy - 2));

      // Drop highest eligible Legendary or Godly equipment for the current cycle!
      const curCycle = state.cycle || 1;
      let bossDrop = null;
      if (curCycle >= 3) {
        const unownedGodly = ARSENAL.filter(g => g.isGodly && (g.minCycle || 99) <= curCycle && !p.unlockedArsenal.includes(g.id));
        const fusableGodly = ARSENAL.filter(g => (g.tier || 1) >= 4 && (g.minCycle || 1) <= curCycle && p.unlockedArsenal.includes(g.id) && (p.gearCounts[g.id] || 1) < 2);
        bossDrop = unownedGodly[0] || fusableGodly[0] || null;
      }
      if (!bossDrop) {
        const bossLegendaries = ARSENAL.filter(g => g.isLegendary && (g.minCycle || 1) <= curCycle && !p.unlockedArsenal.includes(g.id));
        bossDrop = bossLegendaries.find(g => g.bossDropFloor === state.currentFloor) || bossLegendaries[0] || null;
      }
      if (!bossDrop && p.weapon) {
        bossDrop = p.weapon; // Grant duplicate for Forge fusion!
      }
      if (bossDrop) {
        unlockGear(bossDrop, true);
        spawnWarpEffect(b.x, b.y, bossDrop.glowColor || '#fde047', 110);
        createSparks(b.x, b.y, 36, bossDrop.glowColor || '#fde047');
      }

      if (state.currentFloor === 13) {
        // Check if the player just completed their 13th (or higher) playthrough loop!
        if ((state.cycle || 1) >= 13) {
          saveGameProgress('cycle_13_finale_victory', true);
          if (typeof window.startCycle13FinaleCinematic === 'function') {
            window.startCycle13FinaleCinematic();
          }
          return;
        }

        const nextCycle = (state.cycle || 1) + 1;
        state.cycle = nextCycle;
        state.currentFloor = 1;
        const milestoneUnlocked = checkAndGrantCycleMilestoneGear(nextCycle);
        saveGameProgress('cycle_ascension', true);

        let cycleMsg = "Ouroboros Prime collapses! Loop " + nextCycle + " awakens—all 13 dungeons have mutated with stronger Warlords!";
        if (milestoneUnlocked) {
          const itemNames = milestoneUnlocked.items.map(it => formatSpokenGearName(it.name)).join(', ');
          cycleMsg += " Milestone Loop " + nextCycle + " Reached: New Godly & Ascended Forge combinations unlocked (" + itemNames + ")!";
        }
        dialogue.show(
          "🔄 LOOP " + nextCycle + " AWAKENS" + (milestoneUnlocked ? " — GODLY TIER UNLOCKED!" : ""),
          cycleMsg,
          8800,
          true
        );
        setTimeout(() => generateDungeonFloor(1), 8500);
      } else {
        const dropText = bossDrop ? (" Claimed " + formatSpokenGearName(bossDrop.name) + "!") : "";
        dialogue.show(
          "BOSS DEFEATED! RELIC DROPPED!",
          b.name + " has been destroyed!" + dropText + " Step onto the glowing Descent Staircase to enter the next Depth!",
          6200,
          true
        );
        showToast("BOSS FELLED! " + (bossDrop ? bossDrop.name.toUpperCase() : "RELIC") + " ACQUIRED!");
      }
    }
  };

  const _origTriggerPlayerDeathRecovery = typeof triggerPlayerDeathRecovery === 'function' ? triggerPlayerDeathRecovery : null;
  if (_origTriggerPlayerDeathRecovery) {
    triggerPlayerDeathRecovery = function (cause) {
      if (state.player && state.player.status) {
        state.player.status.poisonTimer = 0;
        state.player.status.poisonTickAccum = 0;
        state.player.status.disorientTimer = 0;
        state.player.status.webTimer = 0;
        state.player.status.vineTimer = 0;
      }
      _origTriggerPlayerDeathRecovery(cause);
    };
  }

  // -------------------------------------------------------------
  // 0B. MULTI-PLAYTHROUGH SAVE FILE TRACKING SYSTEM & START MENU MODAL
  // -------------------------------------------------------------
  const SAVE_SLOTS_KEY = 'ouro_save_slots_v1';
  state.saveSlots = [];
  state.activeSlotId = null;
  state.startMenu = {
    open: false,
    focusIndex: 0, // 0: Restart Current, 1: New Playthrough (Preserve Current), 2..N+1: Save File Slots
  };

  function formatTimeAgo(ts) {
    if (!ts) return 'Just now';
    const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diffSec < 45) return 'Just now';
    if (diffSec < 3600) return Math.floor(diffSec / 60) + 'm ago';
    if (diffSec < 86400) return Math.floor(diffSec / 3600) + 'h ago';
    return Math.floor(diffSec / 86400) + 'd ago';
  }

  function buildCurrentSlotSnapshot(slotId, slotTitle, createdAt) {
    const p = state.player;
    const pTuple = encodePlayerTuple(p);
    const savePt = state.lastSavePoint || state.floorStartSpawn || {
      x: Math.round(p.x),
      y: Math.round(p.y),
      roomIdx: state.lastSavedRoomIdx || 0,
      floor: state.currentFloor || 1,
    };
    return {
      id: slotId,
      title: slotTitle || 'Playthrough #1',
      createdAt: createdAt || Date.now(),
      updatedAt: Date.now(),
      v: 2,
      f: state.currentFloor || 1,
      c: state.cycle || 1,
      r: state.lastSavedRoomIdx || 0,
      m: state.savedRoomsMask || 1,
      sx: Math.round(savePt.x),
      sy: Math.round(savePt.y),
      p: pTuple,
      fp: state.floorStartSnapshot || pTuple,
      t: encodeTutorialMask(state.tutorialFlags),
      d: state.deathRecoveries || 0,
      abilities: Array.isArray(p.abilities) ? [...p.abilities] : [],
      learnedMoves: Array.isArray(p.learnedMoves) ? [...p.learnedMoves] : [],
      equippedMoveX: p.equippedMoveX || null,
      equippedMoveY: p.equippedMoveY || null,
      bossMoveWinsCount: p.bossMoveWinsCount || 0,
      forgeStars: p.forgeStars ? { ...p.forgeStars } : {},
      floorCache: state.floorSaveCache ? { ...state.floorSaveCache } : {},
    };
  }

  function persistSaveSlotsToStorage() {
    try {
      if (typeof localStorage !== 'undefined') {
        const payload = {
          activeSlotId: state.activeSlotId,
          slots: state.saveSlots,
        };
        localStorage.setItem(SAVE_SLOTS_KEY, JSON.stringify(payload));
      }
    } catch (e) {}
  }

  function loadSaveSlotsFromStorage() {
    try {
      if (typeof localStorage === 'undefined') return false;
      const raw = localStorage.getItem(SAVE_SLOTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.slots) && parsed.slots.length > 0) {
          state.saveSlots = parsed.slots;
          state.activeSlotId = parsed.activeSlotId || parsed.slots[0].id;
          return true;
        }
      }
      // Migrate existing single-slot save (SAVE_META_KEY) into Playthrough #1 if present
      const legacyRaw = localStorage.getItem(SAVE_META_KEY);
      if (legacyRaw) {
        const meta = JSON.parse(legacyRaw);
        if (meta && meta.v === 2 && meta.f >= 1 && meta.f <= 13) {
          const slot1 = {
            id: 'slot_1',
            title: 'Playthrough #1',
            createdAt: Date.now() - 60000,
            updatedAt: Date.now(),
            v: 2,
            f: meta.f | 0,
            c: Math.max(1, meta.c | 0),
            r: meta.r | 0,
            m: meta.m || 1,
            sx: meta.sx || 0,
            sy: meta.sy || 0,
            p: meta.p,
            fp: meta.fp || meta.p,
            t: meta.t | 0,
            d: meta.d | 0,
            abilities: [],
            learnedMoves: [],
            equippedMoveX: null,
            equippedMoveY: null,
            bossMoveWinsCount: 0,
            forgeStars: {},
            floorCache: {},
          };
          state.saveSlots = [slot1];
          state.activeSlotId = slot1.id;
          persistSaveSlotsToStorage();
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  function syncActivePlaythroughToSlots() {
    if (!state.saveSlots) state.saveSlots = [];
    if (!state.activeSlotId) {
      state.activeSlotId = 'slot_1';
    }
    const existingIdx = state.saveSlots.findIndex(s => s.id === state.activeSlotId);
    if (existingIdx >= 0) {
      const prev = state.saveSlots[existingIdx];
      state.saveSlots[existingIdx] = buildCurrentSlotSnapshot(prev.id, prev.title, prev.createdAt);
    } else {
      const nextNum = state.saveSlots.length + 1;
      const newSlot = buildCurrentSlotSnapshot(state.activeSlotId, 'Playthrough #' + nextNum, Date.now());
      state.saveSlots.push(newSlot);
    }
    persistSaveSlotsToStorage();
  }

  const _origSaveGameProgress = saveGameProgress;
  saveGameProgress = function (reason = 'auto', showIndicator = true) {
    if (state.finaleCinematic && state.finaleCinematic.active) return;
    _origSaveGameProgress(reason, showIndicator);
    syncActivePlaythroughToSlots();
    if (state.startMenu && state.startMenu.open) {
      renderStartMenuModal();
    }
  };

  function resetPlayerToFreshStart() {
    const p = state.player;
    p.level = 1;
    p.xp = 0;
    p.xpNext = 50;
    p.maxHp = 80;
    p.hp = 80;
    p.starterSwordFound = false;
    p.weapon = null;
    p.shield = null;
    p.armor = null;
    p.unlockedArsenal = [];
    p.inventory = [];
    p.gearCounts = {};
    p.forgeStars = {};
    p.fusionsCompleted = 0;
    p.abilities = [];
    p.learnedMoves = [];
    p.equippedMoveX = null;
    p.equippedMoveY = null;
    p.bossMoveWinsCount = 0;
    p.moveCooldownX = 0;
    p.moveCooldownY = 0;
    p.specialMoveAnim = null;
    p.specialJumpZ = 0;
    p.status = { poisonTimer: 0, poisonTickAccum: 0, disorientTimer: 0, webTimer: 0, vineTimer: 0, acidTentacleTimer: 0 };
    p.hitStun = 0;
    p.spikeInvuln = 1.0;

    state.currentFloor = 1;
    state.cycle = 1;
    state.currentRoomIdx = 0;
    state.lastSavedRoomIdx = 0;
    state.savedRoomsMask = 1;
    state.deathRecoveries = 0;
    state.floorSaveCache = {};
    state.isTransitioning = false;
    state.isRecoveringFromDeath = false;
    state.redFlash = 0;
    state.screenShake = 0;
    state.boss = null;
    const bannerEl = document.getElementById('level-banner');
    if (bannerEl) bannerEl.style.display = 'none';
    if (typeof updateBossHpBar === 'function') updateBossHpBar();

    state.tutorialFlags = {
      step: 1,
      moved: false,
      highGround: false,
      secretFound: false,
      liquidWade: false,
      attacked: false,
      whirlwindUsed: false,
      fusedGear: false,
      fusionDone: false,
    };
    if (typeof window.syncControllerXYLabels === 'function') {
      window.syncControllerXYLabels();
    }
  }

  // Override loadSavedGameProgress so it restores the active slot from state.saveSlots on startup
  const _origLoadSavedGameProgress = loadSavedGameProgress;
  loadSavedGameProgress = function () {
    try {
      loadSaveSlotsFromStorage();
      const activeSlot = state.saveSlots && state.saveSlots.find(s => s.id === state.activeSlotId);
      if (activeSlot && activeSlot.f >= 1 && activeSlot.f <= 13) {
        state.currentFloor = Math.max(1, Math.min(13, activeSlot.f | 0));
        state.cycle = Math.max(1, activeSlot.c | 0);
        state.deathRecoveries = activeSlot.d | 0;
        state.floorSaveCache = activeSlot.floorCache ? { ...activeSlot.floorCache } : {};
        decodeTutorialMask(activeSlot.t | 0);
        if (Array.isArray(activeSlot.p)) {
          decodePlayerTuple(activeSlot.p);
        }
        state.player.abilities = Array.isArray(activeSlot.abilities) ? [...activeSlot.abilities] : [];
        state.player.learnedMoves = Array.isArray(activeSlot.learnedMoves) ? [...activeSlot.learnedMoves] : [];
        state.player.equippedMoveX = activeSlot.equippedMoveX || null;
        state.player.equippedMoveY = activeSlot.equippedMoveY || null;
        state.player.bossMoveWinsCount = activeSlot.bossMoveWinsCount || 0;
        state.player.forgeStars = activeSlot.forgeStars ? { ...activeSlot.forgeStars } : {};
        state.player.status = { poisonTimer: 0, poisonTickAccum: 0, disorientTimer: 0, webTimer: 0, vineTimer: 0, acidTentacleTimer: 0 };
        state.player.hp = Math.max(1, state.player.hp || state.player.maxHp);
        if (typeof window.ensureRetroactiveBossMoves === 'function') {
          window.ensureRetroactiveBossMoves();
        }
        state.floorStartSnapshot = Array.isArray(activeSlot.fp) ? activeSlot.fp : encodePlayerTuple(state.player);
        const savedRoomIdx = Math.max(0, activeSlot.r | 0);
        generateDungeonFloor(state.currentFloor, {
          restoringFromSave: true,
          savedRoomIdx,
          savedMask: activeSlot.m || 1,
        });
        if (typeof updateBossHpBar === 'function') updateBossHpBar();
        if (typeof window.syncControllerXYLabels === 'function') window.syncControllerXYLabels();
        return true;
      }
      return _origLoadSavedGameProgress();
    } catch (err) {
      console.error("Failed to restore saved game progress, starting Floor 1:", err);
      return false;
    }
  };

  // FUNCTION 1: Restart the game you are playing through currently at the start (Floor 1, Level 1)
  window.restartCurrentPlaythrough = function (targetSlotId) {
    audio.init();
    audio.playSfx('descent');
    if (targetSlotId && targetSlotId !== state.activeSlotId) {
      // Save current active playthrough before switching and restarting the target slot
      syncActivePlaythroughToSlots();
      state.activeSlotId = targetSlotId;
    }
    const activeSlot = state.saveSlots.find(s => s.id === state.activeSlotId);
    const slotTitle = activeSlot ? activeSlot.title : 'Current Playthrough';

    resetPlayerToFreshStart();
    state.floorStartSnapshot = encodePlayerTuple(state.player);
    generateDungeonFloor(1);
    if (typeof updateBossHpBar === 'function') updateBossHpBar();
    syncActivePlaythroughToSlots();
    window.toggleStartMenu(false);

    showFloater("🔄 RESTARTED " + slotTitle.toUpperCase() + "!", state.player.x, state.player.y - 36, '#4ade80');
    showToast(slotTitle.toUpperCase() + " RESTARTED AT FLOOR 1!");
    dialogue.show(
      "🔄 " + slotTitle.toUpperCase() + " RESTARTED",
      "Your current playthrough has been reset to the beginning of Dungeon Floor 1! Step right to claim the Rusty Weak Sword and begin your descent anew!",
      5600
    );
  };

  // FUNCTION 2: Create a new playthrough and preserve your last playthrough as a save file that can then be returned to
  window.createNewPlaythroughAndPreserveCurrent = function () {
    audio.init();
    audio.playSfx('magic_chime');
    // 1. Save & preserve the current playthrough slot in the tracking list so the player can return to it anytime!
    syncActivePlaythroughToSlots();
    const preservedSlot = state.saveSlots.find(s => s.id === state.activeSlotId);
    const preservedTitle = preservedSlot ? preservedSlot.title : 'Playthrough #1';

    // 2. Create a brand-new playthrough slot ID and title
    let maxNum = 0;
    state.saveSlots.forEach(s => {
      const m = String(s.title || '').match(/#(\d+)/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    });
    const newNum = Math.max(state.saveSlots.length + 1, maxNum + 1);
    const newSlotId = 'slot_' + Date.now() + '_' + newNum;
    const newSlotTitle = 'Playthrough #' + newNum;

    state.activeSlotId = newSlotId;
    resetPlayerToFreshStart();
    state.floorStartSnapshot = encodePlayerTuple(state.player);

    const newSlotObj = buildCurrentSlotSnapshot(newSlotId, newSlotTitle, Date.now());
    state.saveSlots.push(newSlotObj);
    persistSaveSlotsToStorage();

    generateDungeonFloor(1);
    if (typeof updateBossHpBar === 'function') updateBossHpBar();
    syncActivePlaythroughToSlots();
    window.toggleStartMenu(false);

    showFloater("➕ NEW " + newSlotTitle.toUpperCase() + " STARTED!", state.player.x, state.player.y - 36, '#38bdf8');
    showToast(preservedTitle.toUpperCase() + " SAVED! STARTED " + newSlotTitle.toUpperCase() + "!");
    dialogue.show(
      "➕ NEW PLAYTHROUGH CREATED (" + newSlotTitle.toUpperCase() + ")",
      preservedTitle + " has been preserved as a save file in your Start Menu Tracking Page so you can return to it anytime! Welcome to " + newSlotTitle + " at Floor 1!",
      6400
    );
  };

  // FUNCTION 3: Re-enter / Switch to any saved playthrough from the Save File Tracking Page
  window.loadPlaythroughSlot = function (slotId) {
    audio.init();
    const targetSlot = state.saveSlots.find(s => s.id === slotId);
    if (!targetSlot) return;

    if (slotId === state.activeSlotId) {
      audio.playSfx('loot');
      window.toggleStartMenu(false);
      showToast("RESUMED " + targetSlot.title.toUpperCase() + "!");
      return;
    }

    // Preserve the currently active playthrough before switching to the chosen save file!
    syncActivePlaythroughToSlots();

    state.activeSlotId = targetSlot.id;
    state.isTransitioning = false;
    state.isRecoveringFromDeath = false;
    state.redFlash = 0;
    state.screenShake = 0;
    const bannerEl = document.getElementById('level-banner');
    if (bannerEl) bannerEl.style.display = 'none';

    state.currentFloor = Math.max(1, Math.min(13, targetSlot.f | 0));
    state.cycle = Math.max(1, targetSlot.c | 0);
    state.deathRecoveries = targetSlot.d | 0;
    state.floorSaveCache = targetSlot.floorCache ? { ...targetSlot.floorCache } : {};
    decodeTutorialMask(targetSlot.t | 0);
    if (Array.isArray(targetSlot.p)) {
      decodePlayerTuple(targetSlot.p);
    }
    state.player.abilities = Array.isArray(targetSlot.abilities) ? [...targetSlot.abilities] : [];
    state.player.learnedMoves = Array.isArray(targetSlot.learnedMoves) ? [...targetSlot.learnedMoves] : [];
    state.player.equippedMoveX = targetSlot.equippedMoveX || null;
    state.player.equippedMoveY = targetSlot.equippedMoveY || null;
    state.player.bossMoveWinsCount = targetSlot.bossMoveWinsCount || 0;
    state.player.forgeStars = targetSlot.forgeStars ? { ...targetSlot.forgeStars } : {};
    state.player.status = { poisonTimer: 0, poisonTickAccum: 0, disorientTimer: 0, webTimer: 0, vineTimer: 0, acidTentacleTimer: 0 };
    state.player.hp = Math.max(1, state.player.hp || state.player.maxHp);
    if (typeof window.ensureRetroactiveBossMoves === 'function') {
      window.ensureRetroactiveBossMoves();
    }
    state.floorStartSnapshot = Array.isArray(targetSlot.fp) ? targetSlot.fp : encodePlayerTuple(state.player);

    const savedRoomIdx = Math.max(0, targetSlot.r | 0);
    generateDungeonFloor(state.currentFloor, {
      restoringFromSave: true,
      savedRoomIdx,
      savedMask: targetSlot.m || 1,
    });
    if (typeof updateBossHpBar === 'function') updateBossHpBar();
    if (typeof window.syncControllerXYLabels === 'function') window.syncControllerXYLabels();

    persistSaveSlotsToStorage();
    audio.playSfx('magic_chime');
    window.toggleStartMenu(false);

    showFloater("▶️ LOADED " + targetSlot.title.toUpperCase() + "!", state.player.x, state.player.y - 36, '#fde047');
    showToast("LOADED " + targetSlot.title.toUpperCase() + " (FLOOR " + state.currentFloor + ", LV." + state.player.level + ")!");
    dialogue.show(
      "▶️ PLAYTHROUGH LOADED: " + targetSlot.title.toUpperCase(),
      "Re-entered " + targetSlot.title + " on Dungeon Floor " + state.currentFloor + " (Cycle " + state.cycle + ", Hero Level " + state.player.level + ")!",
      5200
    );
  };

  window.deletePlaythroughSlot = function (slotId, ev) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    audio.init();
    if (state.saveSlots.length <= 1) {
      showToast("CANNOT DELETE ONLY SAVE FILE — USE RESTART INSTEAD!");
      return;
    }
    const idx = state.saveSlots.findIndex(s => s.id === slotId);
    if (idx < 0) return;
    const removed = state.saveSlots[idx];
    state.saveSlots.splice(idx, 1);
    audio.playSfx('spikes');

    if (state.activeSlotId === slotId) {
      const nextActive = state.saveSlots[0];
      state.activeSlotId = nextActive.id;
      window.loadPlaythroughSlot(nextActive.id);
    } else {
      persistSaveSlotsToStorage();
      renderStartMenuModal();
    }
    showToast("REMOVED " + (removed.title || 'SAVE FILE').toUpperCase());
  };

  function decodeSlotSummary(slot) {
    const pTuple = Array.isArray(slot.p) ? slot.p : [];
    const level = Math.max(1, pTuple[0] || 1);
    const hp = Math.max(1, pTuple[3] || 80);
    const maxHp = Math.max(40, pTuple[4] || 80);
    const wIdx = (pTuple[6] !== undefined) ? pTuple[6] : -1;
    const sIdx = (pTuple[7] !== undefined) ? pTuple[7] : -1;
    const aIdx = (pTuple[8] !== undefined) ? pTuple[8] : -1;
    const wep = (wIdx >= 0 && ARSENAL[wIdx]) ? ARSENAL[wIdx] : null;
    const shd = (sIdx >= 0 && ARSENAL[sIdx]) ? ARSENAL[sIdx] : null;
    const arm = (aIdx >= 0 && ARSENAL[aIdx]) ? ARSENAL[aIdx] : null;
    return {
      level,
      hp,
      maxHp,
      wepName: wep ? wep.icon + ' ' + wep.name : '✊ Unarmed',
      shdName: shd ? shd.icon + ' ' + shd.name : '🛡️ None',
      armName: arm ? arm.icon + ' ' + arm.name : '🦺 None',
    };
  }

  function ensureStartMenuModalDom() {
    let modal = document.getElementById('start-menu-modal');
    if (modal) return modal;

    const styleEl = document.createElement('style');
    styleEl.textContent = `
      #start-menu-modal, #start-menu-modal * {
        touch-action: pan-y !important;
        pointer-events: auto !important;
        user-select: none;
      }
      #start-menu-modal {
        position: absolute;
        inset: 0;
        background: rgba(6, 10, 16, 0.98);
        z-index: 60;
        display: none;
        flex-direction: column;
        padding: 8px 10px;
        overflow-y: auto !important;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
        color: #e2e8f0;
        font-family: monospace;
        border: 2px solid #22c55e;
        box-shadow: inset 0 0 24px rgba(0, 0, 0, 0.9);
      }
      .sm-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 2px solid #1e293b;
        padding-bottom: 5px;
        margin-bottom: 5px;
        flex-shrink: 0;
      }
      .sm-title {
        font-size: 12px;
        font-weight: 900;
        color: #4ade80;
        letter-spacing: 0.6px;
      }
      .sm-close-btn {
        background: #991b1b;
        color: #fff;
        font-size: 9.5px;
        font-weight: 800;
        padding: 5px 10px;
        border-radius: 4px;
        border: 1px solid #f87171;
        cursor: pointer;
      }
      .sm-actions-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        margin-bottom: 6px;
        flex-shrink: 0;
      }
      .sm-action-card {
        background: linear-gradient(180deg, #1e293b, #0f172a);
        border: 2px solid #475569;
        border-radius: 6px;
        padding: 6px 8px;
        cursor: pointer;
        text-align: left;
        transition: transform 0.1s, border-color 0.1s;
        flex-shrink: 0;
      }
      .sm-action-card.focused, .sm-action-card:active {
        border-color: #fde047;
        box-shadow: 0 0 12px rgba(253, 224, 71, 0.45);
        transform: translateY(-1px);
      }
      .sm-action-card.restart-card {
        border-color: #f59e0b;
      }
      .sm-action-card.newrun-card {
        border-color: #38bdf8;
      }
      .sm-action-title {
        font-size: 10px;
        font-weight: 900;
        margin-bottom: 2px;
      }
      .sm-action-desc {
        font-size: 8.5px;
        color: #94a3b8;
        line-height: 1.25;
      }
      .sm-section-header {
        font-size: 9.5px;
        font-weight: 900;
        color: #fde047;
        letter-spacing: 0.5px;
        margin: 2px 0 5px 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-shrink: 0;
        gap: 6px;
      }
      .sm-scroll-controls {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .sm-scroll-btn {
        background: #1e293b;
        color: #fde047;
        border: 1px solid #38bdf8;
        border-radius: 4px;
        padding: 3px 8px;
        font-size: 9px;
        font-weight: 900;
        cursor: pointer;
        font-family: monospace;
      }
      .sm-scroll-btn:active {
        background: #0284c7;
        color: #fff;
      }
      .sm-slots-list {
        display: flex;
        flex-direction: column;
        gap: 7px;
        flex: 1 1 auto;
        min-height: 135px;
        max-height: 46vh;
        overflow-y: auto !important;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
        padding-right: 4px;
        padding-bottom: 16px;
        border-top: 1px solid rgba(56, 189, 248, 0.25);
        padding-top: 6px;
      }
      .sm-slots-list::-webkit-scrollbar {
        width: 7px;
      }
      .sm-slots-list::-webkit-scrollbar-track {
        background: rgba(15, 23, 42, 0.85);
        border-radius: 4px;
      }
      .sm-slots-list::-webkit-scrollbar-thumb {
        background: #22c55e;
        border-radius: 4px;
      }
      .sm-slot-card {
        background: rgba(15, 23, 42, 0.94);
        border: 2px solid #334155;
        border-radius: 6px;
        padding: 7px 9px;
        display: flex;
        flex-direction: column;
        gap: 3px;
        cursor: pointer;
        flex-shrink: 0;
      }
      .sm-slot-card.active-slot {
        border-color: #22c55e;
        background: rgba(20, 83, 45, 0.28);
      }
      .sm-slot-card.focused {
        border-color: #fde047;
        box-shadow: 0 0 12px rgba(253, 224, 71, 0.45);
      }
      .sm-slot-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .sm-slot-name {
        font-size: 10.5px;
        font-weight: 900;
        color: #f8fafc;
      }
      .sm-slot-badge {
        font-size: 8px;
        font-weight: 900;
        padding: 2px 6px;
        border-radius: 3px;
        text-transform: uppercase;
      }
      .sm-slot-badge.active {
        background: #16a34a;
        color: #ffffff;
      }
      .sm-slot-badge.saved {
        background: #0284c7;
        color: #ffffff;
      }
      .sm-slot-meta {
        font-size: 8.5px;
        color: #38bdf8;
        font-weight: 700;
      }
      .sm-slot-gear {
        font-size: 8px;
        color: #cbd5e1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .sm-slot-btn-row {
        display: flex;
        gap: 6px;
        margin-top: 3px;
      }
      .sm-mini-btn {
        font-size: 9px;
        font-weight: 800;
        padding: 5px 8px;
        border-radius: 4px;
        border: 1px solid rgba(255,255,255,0.25);
        cursor: pointer;
        font-family: monospace;
      }
      .sm-mini-btn.load {
        background: #15803d;
        color: #fff;
        flex: 1;
      }
      .sm-mini-btn.restart {
        background: #b45309;
        color: #fff;
      }
      .sm-mini-btn.delete {
        background: #7f1d1d;
        color: #fecaca;
      }
    `;
    document.head.appendChild(styleEl);

    const viewport = document.getElementById('viewport-container') || document.body;
    modal = document.createElement('div');
    modal.id = 'start-menu-modal';
    viewport.appendChild(modal);
    return modal;
  }

  let lastModalActionTime = 0;
  function bindModalTap(el, actionFn, stopProp = false) {
    if (!el) return;
    let startX = 0;
    let startY = 0;
    el.addEventListener('pointerdown', (e) => {
      if (stopProp && e.stopPropagation) e.stopPropagation();
      startX = e.clientX || 0;
      startY = e.clientY || 0;
    });
    const fire = (e) => {
      if (stopProp && e && e.stopPropagation) e.stopPropagation();
      if (e && (e.type === 'pointerup' || e.type === 'click') && startX && startY) {
        if (Math.hypot((e.clientX || 0) - startX, (e.clientY || 0) - startY) > 14) return;
      }
      const now = performance.now();
      if (now - lastModalActionTime < 220) return;
      lastModalActionTime = now;
      actionFn(e);
    };
    el.addEventListener('pointerup', fire);
    el.addEventListener('click', fire);
  }

  window.scrollSaveFilesList = function (deltaPx) {
    const listEl = document.getElementById('sm-slots-scroll-list');
    const modalEl = document.getElementById('start-menu-modal');
    if (listEl) {
      listEl.scrollTop = Math.max(0, listEl.scrollTop + deltaPx);
    }
    if (modalEl && (!listEl || listEl.scrollHeight <= listEl.clientHeight)) {
      modalEl.scrollTop = Math.max(0, modalEl.scrollTop + deltaPx);
    }
  };

  function renderStartMenuModal() {
    const modal = ensureStartMenuModalDom();
    if (!modal) return;

    const prevListEl = document.getElementById('sm-slots-scroll-list');
    const prevScrollTop = prevListEl ? prevListEl.scrollTop : 0;

    syncActivePlaythroughToSlots();
    const focusIdx = state.startMenu.focusIndex || 0;
    const activeSlot = state.saveSlots.find(s => s.id === state.activeSlotId) || state.saveSlots[0];

    let slotsHtml = '';
    state.saveSlots.forEach((slot, idx) => {
      const isAct = (slot.id === state.activeSlotId);
      const isFocused = (focusIdx === idx + 2);
      const sum = decodeSlotSummary(slot);
      const rmLabel = (slot.r > 0) ? ('Chamber ' + (slot.r + 1)) : 'Floor Start';
      const learnedCount = Array.isArray(slot.learnedMoves) ? slot.learnedMoves.length : 0;
      slotsHtml += `
        <div class="sm-slot-card ${isAct ? 'active-slot' : ''} ${isFocused ? 'focused' : ''}" data-slot-card="${slot.id}" data-slot-index="${idx}">
          <div class="sm-slot-top">
            <span class="sm-slot-name">${isAct ? '🟢 ' : '💾 '}${slot.title} (#${idx + 1}/${state.saveSlots.length})</span>
            <span class="sm-slot-badge ${isAct ? 'active' : 'saved'}">${isAct ? 'CURRENTLY PLAYING' : 'SAVED FILE • TAP TO ENTER'}</span>
          </div>
          <div class="sm-slot-meta">
            FLOOR ${slot.f}/13 • CYCLE ${slot.c || 1} • HERO LV.${sum.level} (HP ${sum.hp}/${sum.maxHp}) • MOVES: ${learnedCount} • ${rmLabel} • ${formatTimeAgo(slot.updatedAt)}
          </div>
          <div class="sm-slot-gear">
            ${sum.wepName} &nbsp;|&nbsp; ${sum.shdName} &nbsp;|&nbsp; ${sum.armName}
          </div>
          <div class="sm-slot-btn-row">
            <button type="button" class="sm-mini-btn load" data-load-slot="${slot.id}">
              ${isAct ? '▶ RESUME CURRENT PLAYTHROUGH' : '▶ RE-ENTER THIS PLAYTHROUGH'}
            </button>
            <button type="button" class="sm-mini-btn restart" data-restart-slot="${slot.id}">
              🔄 RESTART AT F1
            </button>
            ${state.saveSlots.length > 1 ? `<button type="button" class="sm-mini-btn delete" data-delete-slot="${slot.id}" title="Delete Save File">🗑️</button>` : ''}
          </div>
        </div>
      `;
    });

    modal.innerHTML = `
      <div class="sm-header">
        <div class="sm-title">⚙️ OUROBOROS START MENU & SAVE TRACKER</div>
        <button type="button" class="sm-close-btn" id="sm-close-btn">RESUME [B]</button>
      </div>
      <div style="font-size:8px;color:#38bdf8;font-weight:800;margin-bottom:5px;text-align:center;flex-shrink:0;">
        [D-PAD UP/DOWN] SCROLL & SELECT SAVE FILE • [A] LOAD • [B] CLOSE
      </div>

      <div class="sm-actions-grid">
        <div class="sm-action-card restart-card ${focusIdx === 0 ? 'focused' : ''}" id="sm-btn-restart-current" role="button">
          <div class="sm-action-title" style="color:#fbbf24;">🔄 RESTART CURRENT GAME</div>
          <div class="sm-action-desc">
            Restart <b>${activeSlot ? activeSlot.title : 'current run'}</b> at Floor 1, Level 1.
          </div>
        </div>

        <div class="sm-action-card newrun-card ${focusIdx === 1 ? 'focused' : ''}" id="sm-btn-new-playthrough" role="button">
          <div class="sm-action-title" style="color:#38bdf8;">➕ NEW PLAYTHROUGH</div>
          <div class="sm-action-desc">
            Preserve <b>${activeSlot ? activeSlot.title : 'last run'}</b> as a save file & start fresh!
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;flex-shrink:0;">
        <div class="sm-action-card" id="sm-btn-open-moves" role="button" style="border-color:#fde047;background:linear-gradient(180deg,#2e260d,#0f172a);">
          <div class="sm-action-title" style="color:#fde047;">⚡ PROGRAM [X] & [Y] MOVES</div>
          <div class="sm-action-desc" style="color:#fef08a;">
            Open the Boss Special Moves programmer for your X & Y buttons!
          </div>
        </div>

        <div class="sm-action-card" id="sm-btn-watch-finale" role="button" style="border-color:#f43f5e;background:linear-gradient(180deg,#2e1020,#0f172a);">
          <div class="sm-action-title" style="color:#fda4af;">🎬 LOOP 13 FINALE TRAILER</div>
          <div class="sm-action-desc" style="color:#fecdd3;">
            Watch the Loop 13 Shattering Escape & "Ouroboros Abyss 2" Trailer!
          </div>
        </div>
      </div>

      <div class="sm-section-header">
        <span>📂 SAVE FILES (${state.saveSlots.length} TOTAL — SWIPE OR TAP ▲/▼ TO SCROLL)</span>
        <div class="sm-scroll-controls">
          <button type="button" class="sm-scroll-btn" id="sm-scroll-up-btn" data-testid="sm-scroll-up">▲ UP</button>
          <button type="button" class="sm-scroll-btn" id="sm-scroll-down-btn" data-testid="sm-scroll-down">▼ DOWN</button>
        </div>
      </div>

      <div class="sm-slots-list" id="sm-slots-scroll-list">
        ${slotsHtml}
      </div>
    `;

    const newListEl = document.getElementById('sm-slots-scroll-list');
    if (newListEl) {
      newListEl.scrollTop = prevScrollTop;
      // Enable touch-drag scrolling directly on the save list container even in environments that intercept touch
      let touchDragStartY = null;
      let touchStartScrollTop = 0;
      newListEl.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches.length === 1) {
          touchDragStartY = e.touches[0].clientY;
          touchStartScrollTop = newListEl.scrollTop;
        }
      }, { passive: true });
      newListEl.addEventListener('touchmove', (e) => {
        if (touchDragStartY !== null && e.touches && e.touches.length === 1) {
          const dy = touchDragStartY - e.touches[0].clientY;
          newListEl.scrollTop = Math.max(0, touchStartScrollTop + dy);
        }
      }, { passive: true });
      newListEl.addEventListener('touchend', () => {
        touchDragStartY = null;
      }, { passive: true });

      // If a save slot card is focused via D-Pad, keep it scrolled into view!
      if (focusIdx >= 2) {
        const focusedCard = newListEl.querySelector('.sm-slot-card.focused');
        if (focusedCard && typeof focusedCard.scrollIntoView === 'function') {
          try {
            focusedCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          } catch (e) {
            focusedCard.scrollIntoView();
          }
        }
      }
    }

    bindModalTap(document.getElementById('sm-close-btn'), () => window.toggleStartMenu(false), true);
    bindModalTap(document.getElementById('sm-btn-restart-current'), () => window.restartCurrentPlaythrough(), true);
    bindModalTap(document.getElementById('sm-btn-new-playthrough'), () => window.createNewPlaythroughAndPreserveCurrent(), true);
    bindModalTap(document.getElementById('sm-btn-open-moves'), () => {
      window.toggleStartMenu(false);
      if (typeof window.openMovesProgrammerMenu === 'function') {
        window.openMovesProgrammerMenu();
      }
    }, true);
    bindModalTap(document.getElementById('sm-btn-watch-finale'), () => {
      window.toggleStartMenu(false);
      if (typeof window.startCycle13FinaleCinematic === 'function') {
        window.startCycle13FinaleCinematic();
      }
    }, true);
    bindModalTap(document.getElementById('sm-scroll-up-btn'), () => window.scrollSaveFilesList(-130), true);
    bindModalTap(document.getElementById('sm-scroll-down-btn'), () => window.scrollSaveFilesList(130), true);

    modal.querySelectorAll('[data-slot-card]').forEach(cardEl => {
      const slotId = cardEl.getAttribute('data-slot-card');
      bindModalTap(cardEl, () => window.loadPlaythroughSlot(slotId), false);
    });
    modal.querySelectorAll('[data-load-slot]').forEach(btnEl => {
      const slotId = btnEl.getAttribute('data-load-slot');
      bindModalTap(btnEl, () => window.loadPlaythroughSlot(slotId), true);
    });
    modal.querySelectorAll('[data-restart-slot]').forEach(btnEl => {
      const slotId = btnEl.getAttribute('data-restart-slot');
      bindModalTap(btnEl, () => window.restartCurrentPlaythrough(slotId), true);
    });
    modal.querySelectorAll('[data-delete-slot]').forEach(btnEl => {
      const slotId = btnEl.getAttribute('data-delete-slot');
      bindModalTap(btnEl, (e) => window.deletePlaythroughSlot(slotId, e), true);
    });
  }

  let lastStartMenuToggleAt = 0;
  window.toggleStartMenu = function (forceState) {
    const now = performance.now();
    if (typeof forceState !== 'boolean') {
      if (now - lastStartMenuToggleAt < 250) return;
      lastStartMenuToggleAt = now;
    } else {
      lastStartMenuToggleAt = now;
    }

    const modal = ensureStartMenuModalDom();
    const nextOpen = (typeof forceState === 'boolean') ? forceState : !state.startMenu.open;
    state.startMenu.open = nextOpen;

    if (nextOpen) {
      // Close Arsenal Codex if open so modals don't overlap
      const codexEl = document.getElementById('codex-modal');
      if (codexEl) codexEl.style.display = 'none';
      state.startMenu.focusIndex = 2; // Start focused on the first save slot so D-Pad Up/Down scrolls through save files right away!
      renderStartMenuModal();
      modal.style.display = 'flex';
      audio.playSfx('loot');
    } else {
      modal.style.display = 'none';
    }
  };

  function handleStartMenuInput(action) {
    const totalItems = 2 + state.saveSlots.length;
    if (action === 'B') {
      window.toggleStartMenu(false);
      return;
    }
    if (action === 'up' || action === 'left') {
      state.startMenu.focusIndex = (state.startMenu.focusIndex - 1 + totalItems) % totalItems;
      audio.playSfx('slash');
      renderStartMenuModal();
      return;
    }
    if (action === 'down' || action === 'right') {
      state.startMenu.focusIndex = (state.startMenu.focusIndex + 1) % totalItems;
      audio.playSfx('slash');
      renderStartMenuModal();
      return;
    }
    if (action === 'A') {
      const idx = state.startMenu.focusIndex;
      if (idx === 0) {
        window.restartCurrentPlaythrough();
      } else if (idx === 1) {
        window.createNewPlaythroughAndPreserveCurrent();
      } else {
        const slot = state.saveSlots[idx - 2];
        if (slot) window.loadPlaythroughSlot(slot.id);
      }
    }
  }

  // Hook into isCodexOpen & handleCodexMenuInput so D-Pad and A/B controller buttons work seamlessly in Start Menu too!
  const _origIsCodexOpen = isCodexOpen;
  isCodexOpen = function () {
    if (state.startMenu && state.startMenu.open) return true;
    return _origIsCodexOpen();
  };

  const _origHandleCodexMenuInput = handleCodexMenuInput;
  handleCodexMenuInput = function (action) {
    if (state.startMenu && state.startMenu.open) {
      handleStartMenuInput(action);
      return;
    }
    _origHandleCodexMenuInput(action);
  };

  const _origToggleCodex = toggleCodex;
  toggleCodex = function (forceState) {
    if (state.startMenu && state.startMenu.open) {
      window.toggleStartMenu(false);
    }
    _origToggleCodex(forceState);
    // When opening the Arsenal & Codex menu, if the player has duplicate gear ready to combine, announce it by name!
    if (_origIsCodexOpen()) {
      const dupMsg = getPlayerDuplicateFusionSummary(state.player);
      if (dupMsg) {
        dialogue.show("⚒️ DUPLICATE GEAR READY TO FUSE", dupMsg + " Select the item and press A to combine them!", 6000);
      }
    }
  };

  function bindStartMenuControllerButton() {
    const btnStartMenu = document.getElementById('btn-start-menu');
    const wrapStartMenu = document.getElementById('wrap-btn-start-menu') || btnStartMenu;
    if (wrapStartMenu && !wrapStartMenu._boundStartMenuGen25) {
      wrapStartMenu._boundStartMenuGen25 = true;
      const triggerMenu = (e) => {
        if (e && e.cancelable) e.preventDefault();
        audio.init();
        if (btnStartMenu) btnStartMenu.classList.add('pressed');
        window.toggleStartMenu();
      };
      wrapStartMenu.addEventListener('pointerdown', triggerMenu, { passive: false });
      wrapStartMenu.addEventListener('touchstart', triggerMenu, { passive: false });
      wrapStartMenu.addEventListener('click', triggerMenu);
      const releaseMenu = () => {
        if (btnStartMenu) btnStartMenu.classList.remove('pressed');
      };
      wrapStartMenu.addEventListener('pointerup', releaseMenu);
      wrapStartMenu.addEventListener('pointercancel', releaseMenu);
      wrapStartMenu.addEventListener('touchend', releaseMenu);
    }
  }

  // -------------------------------------------------------------
  // 0C. GAME & MUSIC PAUSE SYSTEM + AUTOMATIC PAUSE ON APP EXIT
  // -------------------------------------------------------------
  state.isPaused = false;

  function ensurePauseOverlayDom() {
    let overlay = document.getElementById('pause-overlay-banner');
    if (overlay) return overlay;
    const viewport = document.getElementById('viewport-container') || document.body;
    overlay = document.createElement('div');
    overlay.id = 'pause-overlay-banner';
    overlay.style.cssText =
      'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'background:rgba(6,10,18,0.95);border:2.5px solid #fbbf24;border-radius:8px;' +
      'padding:14px 20px;z-index:55;display:none;flex-direction:column;align-items:center;gap:6px;' +
      'box-shadow:0 0 28px rgba(251,191,36,0.45),inset 0 0 12px rgba(0,0,0,0.85);' +
      'font-family:monospace;text-align:center;cursor:pointer;pointer-events:auto;touch-action:manipulation;';
    overlay.innerHTML =
      '<div style="font-size:15px;font-weight:900;color:#fde047;letter-spacing:1.2px;">⏸ GAME & MUSIC PAUSED</div>' +
      '<div style="font-size:10px;color:#cbd5e1;font-weight:700;">Gameplay and Dubstep Soundtrack are paused.</div>' +
      '<div style="margin-top:4px;background:#16a34a;color:#fff;font-size:10px;font-weight:900;padding:6px 14px;border-radius:5px;border:1px solid #4ade80;">▶ TAP HERE OR PAUSE BUTTON TO RESUME</div>';
    bindModalTap(overlay, () => window.setGamePaused(false, 'resume_tap'), true);
    viewport.appendChild(overlay);
    return overlay;
  }

  function updatePauseButtonUi() {
    const btn = document.getElementById('btn-pause-game');
    const icon = document.getElementById('btn-pause-icon');
    const label = document.getElementById('btn-pause-label');
    const overlay = ensurePauseOverlayDom();
    if (btn) {
      btn.classList.toggle('paused-active', !!state.isPaused);
    }
    if (icon) {
      icon.textContent = state.isPaused ? '▶' : '⏸';
    }
    if (label) {
      label.textContent = state.isPaused ? 'RESUME' : 'PAUSE';
    }
    if (overlay) {
      overlay.style.display = state.isPaused ? 'flex' : 'none';
    }
  }

  let lastPauseToggleAt = 0;
  state.pauseReason = null;
  window.setGamePaused = function (paused, reason = 'manual') {
    const nextPaused = !!paused;
    state.isPaused = nextPaused;
    state.pauseReason = nextPaused ? reason : null;

    if (nextPaused) {
      if (typeof setCardinalDir === 'function') setCardinalDir(null);
      if (typeof input !== 'undefined' && input) {
        input.actionA = false;
        input.actionB = false;
      }
      if (audio && typeof audio.suspendAudio === 'function') {
        audio.suspendAudio();
      }
      updatePauseButtonUi();
      if (reason === 'manual') {
        showToast("⏸ GAME & MUSIC PAUSED");
      }
    } else {
      state.lastTime = performance.now();
      updatePauseButtonUi();
      if (audio && typeof audio.resumeAudio === 'function') {
        audio.resumeAudio();
      }
      if (reason === 'manual' || reason === 'resume_tap') {
        showToast("▶ GAME & MUSIC RESUMED");
      }
    }
  };

  window.toggleGamePause = function () {
    const now = performance.now();
    if (now - lastPauseToggleAt < 240) return;
    lastPauseToggleAt = now;
    window.setGamePaused(!state.isPaused, 'manual');
  };

  // Called automatically when the player exits or backgrounds the Android app / browser tab
  window.onAppBackgroundPause = function () {
    try {
      saveGameProgress('app_exit', false);
    } catch (e) {}
    if (!state.isPaused) {
      window.setGamePaused(true, 'exit');
    }
  };

  window.onAppForegroundResume = function () {
    state.lastTime = performance.now();
    if (state.isPaused && state.pauseReason !== 'manual') {
      window.setGamePaused(false, 'auto_resume');
    } else {
      updatePauseButtonUi();
    }
  };

  function bindPauseControllerButtonAndLifecycle() {
    ensurePauseOverlayDom();
    const btnPause = document.getElementById('btn-pause-game');
    if (btnPause && !btnPause._boundPauseBtn) {
      btnPause._boundPauseBtn = true;
      const onPauseTap = (e) => {
        if (e && e.cancelable) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        window.toggleGamePause();
      };
      btnPause.addEventListener('pointerdown', onPauseTap, { passive: false });
      btnPause.addEventListener('touchstart', onPauseTap, { passive: false });
      btnPause.addEventListener('click', onPauseTap);
    }

    if (!window._boundAppExitAudioListeners) {
      window._boundAppExitAudioListeners = true;
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          window.onAppBackgroundPause();
        } else {
          window.onAppForegroundResume();
        }
      });
      window.addEventListener('pagehide', () => {
        window.onAppBackgroundPause();
      });
      window.addEventListener('pageshow', () => {
        window.onAppForegroundResume();
      });
      window.addEventListener('beforeunload', () => {
        window.onAppBackgroundPause();
      });
      window.addEventListener('focus', () => {
        window.onAppForegroundResume();
      });
      window.addEventListener('keydown', (e) => {
        if (e.key === 'p' || e.key === 'P') {
          e.preventDefault();
          window.toggleGamePause();
        }
      });
    }
  }

  // -------------------------------------------------------------
  // 1. PLAYER STATS, MOVEMENT, COMBAT & INTERACTION OVERRIDES
  // -------------------------------------------------------------
  getPlayerTotalAtk = function (p) {
    const wepStars = getItemForgeStars(p, p.weapon);
    const wepAtk = p.weapon ? ((p.weapon.atk || 0) + wepStars * 4) : 2;
    const shdAtk = p.shield ? (p.shield.atk || 0) : 0;
    const armAtk = p.armor  ? (p.armor.atk || 0)  : 0;
    let total = wepAtk + shdAtk + armAtk + Math.floor(p.level * 1.5);
    if (p.abilities && p.abilities.includes('starlight_cleave')) {
      total = Math.round(total * 1.25);
    }
    if (p.status && p.status.webTimer > 0) {
      total = Math.max(1, Math.round(total * 0.90));
    }
    return total;
  };

  getPlayerTotalDef = function (p) {
    const shdStars = getItemForgeStars(p, p.shield);
    const armStars = getItemForgeStars(p, p.armor);
    const wepDef = p.weapon ? (p.weapon.def || 0) : 0;
    const shdDef = p.shield ? ((p.shield.def || 0) + shdStars * 3) : 0;
    const armDef = p.armor  ? ((p.armor.def || 0)  + armStars * 3) : 0;
    const carapaceBonus = (p.abilities && p.abilities.includes('venom_ward')) ? 2 : 0;
    let total = wepDef + shdDef + armDef + carapaceBonus;
    if (p.status && p.status.webTimer > 0) {
      total = Math.max(0, Math.round(total * 0.90));
    }
    return total;
  };

  window.interactTreehouseBeingAt = function (tx, ty) {
    const being = state.treehouseBeings.find(
      b => !b.interacted && Math.abs(b.tx - tx) <= 1 && Math.abs(b.ty - ty) <= 1
    );
    if (!being) return;
    being.interacted = true;
    const p = state.player;
    if (!p.abilities) p.abilities = [];

    if (being.role === 'ambush') {
      audio.playSfx('hut_ambush');
      state.screenShake = 10;
      if (state.map[being.ty]) state.map[being.ty][being.tx] = T_TREEHOUSE_FLOOR;
      spawnWarpEffect(being.x, being.y - being.z, '#f43f5e', 78);
      createSparks(being.x, being.y - being.z, 24, '#f43f5e');
      showFloater("🎭 CANOPY SHAPESHIFTER AMBUSH!", being.x, being.y - 40 - being.z, '#f43f5e');
      dialogue.show("🎭 " + being.name.toUpperCase(), being.greeting, 4600);

      const cycleMult = 1 + (state.cycle - 1) * 0.65;
      const ambHp = Math.round((45 + state.currentFloor * 14) * cycleMult);
      const ambAtk = Math.max(3, Math.round((5 + state.currentFloor * 1.4) * cycleMult));
      state.enemies.push({
        id: 'treehouse_ambush_' + Date.now(),
        typeId: 'widow_spider',
        clan: 'Spider',
        rank: 'Canopy Stalker',
        isMiniBoss: true,
        scale: 1.22,
        species: 'spider',
        hasWebSpray: true,
        specialCooldown: 1.0,
        name: being.name,
        level: state.currentFloor + 1,
        x: being.x,
        y: being.y,
        z: 54,
        inLiquid: false,
        rippleTimer: 0,
        radius: 26,
        hp: ambHp,
        maxHp: ambHp,
        atk: ambAtk,
        speed: 1.68,
        color: '#f43f5e',
        armorColor: '#881337',
        glowColor: '#fb7185',
        wepType: 'daggers',
        xpValue: Math.round(65 * cycleMult),
        hitStun: 0.2,
        attackAnim: 0,
        spikeHitCooldown: 0,
        walkAnim: 0,
        facing: 'down',
        blinkTimer: 1.5,
      });
    } else if (being.role === 'ability' && being.abilityId) {
      audio.playSfx('magic_chime');
      spawnWarpEffect(being.x, being.y - being.z, being.glowColor || '#fde047', 88);
      createSparks(being.x, being.y - being.z, 30, being.glowColor || '#38bdf8');
      p.hp = p.maxHp;
      if (p.status) {
        p.status.poisonTimer = 0;
        p.status.disorientTimer = 0;
        p.status.webTimer = 0;
        p.status.vineTimer = 0;
      }
      if (!p.abilities.includes(being.abilityId)) {
        p.abilities.push(being.abilityId);
      }
      addPlayerXp(85);
      showFloater("✨ ABILITY: " + being.abilityLabel.split(' ')[0].toUpperCase() + "!", p.x, p.y - 40 - p.z, '#fde047');
      showToast("CANOPY MAGIC: " + being.abilityLabel);
      dialogue.show(
        "🌳 " + being.name.toUpperCase() + " (CANOPY TREEHOUSE)",
        being.greeting + " Unlocked " + being.abilityLabel + "!",
        6800
      );
      saveGameProgress('treehouse_ability', true);
      updateHud();
    } else {
      audio.playSfx('magic_chime');
      spawnWarpEffect(being.x, being.y - being.z, '#4ade80', 84);
      createSparks(being.x, being.y - being.z, 28, '#bef264');
      p.hp = p.maxHp;
      if (p.status) {
        p.status.poisonTimer = 0;
        p.status.disorientTimer = 0;
        p.status.webTimer = 0;
        p.status.vineTimer = 0;
      }
      addPlayerXp(120);
      showFloater("🌿 CANOPY BLESSING! FULL HP + 120 XP!", p.x, p.y - 40 - p.z, '#4ade80');
      showToast("TREEHOUSE SANCTUARY: FULL HEAL & +120 XP!");
      dialogue.show("🌳 " + being.name.toUpperCase() + " (CANOPY SANCTUARY)", being.greeting, 6200);
      saveGameProgress('treehouse_blessing', true);
      updateHud();
    }
  };

  window.triggerTrashHutAmbush = function (hut) {
    if (!hut || hut.triggered) return;
    hut.triggered = true;
    hut.shudderAnim = 0.9;
    audio.playSfx('hut_ambush');
    state.screenShake = 8;
    createSparks(hut.x, hut.y, 20, '#f97316');
    showFloater("💥 SCRAP-HUT AMBUSH!", hut.x, hut.y - 32, '#fb923c');
    showToast("AMBUSH! RAIDERS BURST FROM THE SHEET-METAL HUT!");

    const pool = BESTIARY.filter(b => !b.isBoss && b.clan === hut.clan);
    const beast = pool[0] || BESTIARY[0];
    const cycleMult = 1 + (state.cycle - 1) * 0.65;
    const floor2Mult = (state.currentFloor >= 2) ? (1.25 + (state.currentFloor - 2) * 0.08) : 1.0;
    const count = hut.enemyCount || 1;

    for (let i = 0; i < count; i++) {
      const ang = (i === 0) ? 0.6 : -0.6;
      const ex = hut.x - 36 + Math.cos(ang) * 18;
      const ey = hut.y + 26 + Math.sin(ang) * 18;
      const bSpecies = beast.species || 'boar';
      const hp = Math.round((beast.hp + state.currentFloor * 6) * floor2Mult * cycleMult);
      const atk = Math.max(2, Math.round((beast.atk + state.currentFloor * 1.0) * floor2Mult * cycleMult));

      state.enemies.push({
        id: 'hut_ambusher_' + Date.now() + '_' + i,
        typeId: beast.id,
        clan: beast.clan,
        rank: 'Hut Raider',
        scale: 1.05,
        species: bSpecies,
        hasPoisonPower: bSpecies === 'snake' && Math.random() < 0.05,
        hasSonicBoom: bSpecies === 'eagle' && Math.random() < 0.07,
        hasWebSpray: bSpecies === 'spider' && Math.random() < 0.10,
        specialCooldown: 1.6,
        name: 'Scrap-Hut ' + beast.name,
        level: state.currentFloor + (state.cycle - 1) * 13,
        x: ex,
        y: ey,
        z: getWorldElevation(ex, ey),
        inLiquid: false,
        rippleTimer: 0,
        radius: 24,
        hp,
        maxHp: hp,
        atk,
        speed: 1.62,
        color: beast.color,
        armorColor: beast.armorColor || '#64748b',
        wepType: beast.wepType || 'mace',
        xpValue: Math.round((beast.xp + state.currentFloor * 6) * cycleMult),
        hitStun: 0.15,
        attackAnim: 0.25,
        spikeHitCooldown: 0,
        walkAnim: 0,
        facing: 'left',
        blinkTimer: 1.8,
      });
    }
  };

  stepPlayerMovement = function (dt, isImmediateImpulse = false) {
    if (state.isPaused || isCodexOpen()) return;
    const p = state.player;

    // Eagle Sonic Boom Disorientation: character cannot move or attack for 5 seconds!
    if (p.status && p.status.disorientTimer > 0) {
      p.walkAnim = 0;
      if (isImmediateImpulse) {
        showFloater("💫 DISORIENTED! (" + p.status.disorientTimer.toFixed(1) + "s)", p.x, p.y - 30 - p.z, '#38bdf8');
      }
      return;
    }

    // Boss Battleground Entangler Vines: character is entangled in thorny vines for a couple of seconds!
    if (p.status && p.status.vineTimer > 0) {
      p.walkAnim = 0;
      if (isImmediateImpulse) {
        showFloater("🌿 ENTANGLED IN VINES! (" + p.status.vineTimer.toFixed(1) + "s)", p.x, p.y - 30 - p.z, '#4ade80');
      }
      return;
    }

    let dir = input.activeDir;
    if (!dir) {
      if (input.up) dir = 'up';
      else if (input.down) dir = 'down';
      else if (input.left) dir = 'left';
      else if (input.right) dir = 'right';
    }

    if (!dir) {
      if (!isImmediateImpulse) {
        p.walkAnim = 0;
        const curTile = state.map[Math.floor(p.y / TILE_SIZE)]?.[Math.floor(p.x / TILE_SIZE)];
        p.inLiquid = isLiquidTile(curTile);
      }
      return;
    }

    let mx = 0, my = 0;
    if (dir === 'left') mx = -1;
    else if (dir === 'right') mx = 1;
    else if (dir === 'up') my = -1;
    else if (dir === 'down') my = 1;

    p.facing = dir;

    const dtScale = isImmediateImpulse ? 1.15 : Math.min(2.2, dt * 60);
    p.walkAnim += (isImmediateImpulse ? 0.55 : dt * 12.0);

    const wadeMult = p.inLiquid ? 0.85 : 1.0;
    const galeMult = (p.abilities && p.abilities.includes('gale_step')) ? 1.18 : 1.0;
    const webSlowMult = (p.status && p.status.webTimer > 0) ? 0.82 : 1.0;
    const moveStep = (p.speed || 7.0) * wadeMult * galeMult * webSlowMult * dtScale;
    const stepX = mx * moveStep;
    const stepY = my * moveStep;

    let moved = false;

    if (canWalkAt(p.x + stepX, p.y + stepY)) {
      p.x += stepX;
      p.y += stepY;
      moved = true;
    } else {
      checkNearbySecretOrExit(p.x + stepX, p.y + stepY);

      const alignShift = Math.min(6.5, moveStep * 0.85);
      for (let probe = 6; probe <= 26; probe += 5) {
        if (mx !== 0) {
          if (canWalkAt(p.x + stepX, p.y - probe)) {
            p.y -= alignShift;
            if (canWalkAt(p.x + stepX * 0.5, p.y)) p.x += stepX * 0.5;
            moved = true;
            break;
          } else if (canWalkAt(p.x + stepX, p.y + probe)) {
            p.y += alignShift;
            if (canWalkAt(p.x + stepX * 0.5, p.y)) p.x += stepX * 0.5;
            moved = true;
            break;
          }
        } else if (my !== 0) {
          if (canWalkAt(p.x - probe, p.y + stepY)) {
            p.x -= alignShift;
            if (canWalkAt(p.x, p.y + stepY * 0.5)) p.y += stepY * 0.5;
            moved = true;
            break;
          } else if (canWalkAt(p.x + probe, p.y + stepY)) {
            p.x += alignShift;
            if (canWalkAt(p.x, p.y + stepY * 0.5)) p.y += stepY * 0.5;
            moved = true;
            break;
          }
        }
      }
    }

    const curTx = Math.floor(p.x / TILE_SIZE);
    const curTy = Math.floor(p.y / TILE_SIZE);
    const curTile = state.map[curTy]?.[curTx];

    if (curTile !== undefined) {
      const targetZ = getWorldElevation(p.x, p.y);
      p.z += (targetZ - p.z) * (isImmediateImpulse ? 0.6 : Math.min(1, dt * 18));
      p.inLiquid = isLiquidTile(curTile);

      if (curTile === T_STARTER_SWORD) {
        claimStarterRustySword(curTx, curTy);
      } else if (curTile === T_CHEST_ALCOVE) {
        openLootChest(curTx, curTy);
      } else if (curTile === T_TREEHOUSE_NPC) {
        interactTreehouseBeingAt(curTx, curTy);
      }

      if (p.z >= 20 && !state.tutorialFlags.highGround) {
        state.tutorialFlags.highGround = true;
        dialogue.show(
          "TACTICAL HIGH GROUND (+25% ATK)",
          "You climbed an elevated stone plateau! Fighting from high ground grants +25% bonus weapon damage and extended bow range.",
          4500
        );
      }

      if (p.inLiquid && !isImmediateImpulse) {
        p.rippleTimer -= dt;
        if (p.rippleTimer <= 0) {
          p.rippleTimer = 0.22;
          const rCol = (curTile === T_FLOOR_SLUDGE) ? 'rgba(134, 239, 172, 0.65)' : 'rgba(147, 197, 253, 0.65)';
          spawnWaterRipple(p.x, p.y + 10, rCol, 28);
        }
      }

      if (curTile === T_DOOR_EXIT && !state.isTransitioning) {
        descendToNextFloor();
      } else if (curTile === T_DOOR_PREV && !state.isTransitioning) {
        ascendToPreviousFloor();
      }
    }

    checkRoomAutoSave();

    if (isImmediateImpulse && moved) {
      state.camera.x += (p.x - state.camera.x) * 0.45;
      state.camera.y += (p.y - state.camera.y) * 0.45;
      if (typeof render === 'function') render();
    }
  };

  interactAdjacentTiles = function () {
    const p = state.player;
    const pTileX = Math.floor(p.x / TILE_SIZE);
    const pTileY = Math.floor(p.y / TILE_SIZE);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = pTileX + dx;
        const ty = pTileY + dy;
        if (tx >= 0 && tx < DUNGEON_COLS && ty >= 0 && ty < DUNGEON_ROWS) {
          const t = state.map[ty][tx];
          if (t === T_STARTER_SWORD) {
            claimStarterRustySword(tx, ty);
          } else if (t === T_CHEST_ALCOVE) {
            openLootChest(tx, ty);
          } else if (t === T_FORGE_ANVIL) {
            interactForgeAnvil(tx, ty);
          } else if (t === T_TREEHOUSE_NPC) {
            interactTreehouseBeingAt(tx, ty);
          } else if (t === T_TRASH_HUT) {
            const hut = state.trashHuts.find(h => h.tx === tx && h.ty === ty);
            if (hut) triggerTrashHutAmbush(hut);
          } else if (t === T_DOOR_EXIT) {
            descendToNextFloor();
          } else if (t === T_DOOR_PREV) {
            ascendToPreviousFloor();
          } else if (t === T_WALL_SECRET) {
            breachSecretWall(tx, ty);
          } else if (t === T_LORE_OBELISK) {
            inspectLoreObelisk(tx, ty);
          }
        }
      }
    }
  };

  const _origExecuteActionA = executeActionA;
  executeActionA = function () {
    if (state.finaleCinematic && state.finaleCinematic.active) {
      if (typeof window.handleFinaleCinematicButtonA === 'function') {
        window.handleFinaleCinematicButtonA();
      }
      return;
    }
    if (isCodexOpen()) {
      handleCodexMenuInput('A');
      return;
    }
    if (state.isPaused) return;
    const p = state.player;
    interactAdjacentTiles();
    if (p.status && p.status.disorientTimer > 0) {
      showFloater("💫 DISORIENTED! CAN'T ATTACK!", p.x, p.y - 28 - p.z, '#38bdf8');
      return;
    }
    const prevCooldown = p.attackCooldown || 0;
    _origExecuteActionA();

    // If a primary weapon strike just fired, trigger any equipped Ascended / Godly Weapon Magical Move!
    if (prevCooldown <= 0 && p.weapon && p.weapon.magicMove) {
      const wep = p.weapon;
      const move = wep.magicMove;
      const highGroundMult = (p.z >= 10) ? 1.25 : 1.0;
      const totalAtk = Math.round(getPlayerTotalAtk(p) * highGroundMult);
      const dirX = (p.facing === 'right') ? 1 : (p.facing === 'left' ? -1 : 0);
      const dirY = (p.facing === 'down') ? 1 : (p.facing === 'up' ? -1 : 0);

      if (move === 'starfire_nova') {
        // Loop 3+ Ascended Weapon: 4-way Starfire Bolts + Solar Flare Ring
        const boltDmg = Math.max(10, Math.round(totalAtk * 0.65));
        spawnWarpEffect(p.x, p.y - p.z, '#38bdf8', 110);
        for (let i = 0; i < 4; i++) {
          const ang = (i / 4) * Math.PI * 2 + 0.785;
          state.projectiles.push({
            x: p.x,
            y: p.y - p.z,
            vx: Math.cos(ang) * 13,
            vy: Math.sin(ang) * 13,
            damage: boltDmg,
            rangeRemaining: 230,
            radius: 7,
            color: '#38bdf8',
            isLegendary: true,
          });
        }
        showFloater("⚡ STARFIRE NOVA!", p.x, p.y - 38 - p.z, '#38bdf8');
      } else if (move === 'chain_lightning') {
        // Loop 5+ Godly Weapon: Chain Lightning arcs across up to 4 nearby enemies + Boss!
        const arcDmg = Math.max(18, Math.round(totalAtk * 0.78));
        spawnWarpEffect(p.x + dirX * 26, p.y - p.z + dirY * 26, '#00e5ff', 135);
        let hits = 0;
        state.enemies.slice().forEach(e => {
          if (hits < 4 && Math.hypot(e.x - p.x, e.y - p.y) < 220) {
            hits++;
            e.hitStun = Math.max(e.hitStun || 0, 0.55);
            createSparks(e.x, e.y, 14, '#00e5ff');
            spawnWarpEffect(e.x, e.y, '#00e5ff', 58);
            damageEnemy(e, arcDmg);
          }
        });
        if (state.boss && state.boss.hp > 0 && Math.hypot(state.boss.x - p.x, state.boss.y - p.y) < 240) {
          createSparks(state.boss.x, state.boss.y, 18, '#00e5ff');
          damageBoss(arcDmg);
        }
        showFloater("🌩️ CHAIN LIGHTNING!", p.x, p.y - 38 - p.z, '#00e5ff');
      } else if (move === 'nebula_vortex') {
        // Loop 7+ Cosmic Bow: 3-spread cosmic arrows + Gravitational Vortex + Lifesteal (+5 HP)
        const arrowDmg = Math.max(25, Math.round(totalAtk * 0.82));
        p.hp = Math.min(p.maxHp, p.hp + 5);
        const baseAng = Math.atan2(dirY, dirX);
        [-0.24, 0.24].forEach(offset => {
          const a = baseAng + offset;
          state.projectiles.push({
            x: p.x,
            y: p.y - p.z,
            vx: Math.cos(a) * 16,
            vy: Math.sin(a) * 16,
            damage: arrowDmg,
            rangeRemaining: 380,
            radius: 8,
            color: '#c084fc',
            isLegendary: true,
          });
        });
        showFloater("🌌 NEBULA VORTEX (+5 HP)!", p.x, p.y - 38 - p.z, '#c084fc');
        updateHud();
      } else if (move === 'meteor_cataclysm') {
        // Loop 9+ Primordial God Greatsword: Calls down 3 Twin-Sun Meteor Pillars ahead + 6 radial fire waves!
        const meteorDmg = Math.max(40, Math.round(totalAtk * 0.88));
        state.screenShake = 11;
        for (let mIdx = 1; mIdx <= 3; mIdx++) {
          const mx = p.x + dirX * (48 * mIdx) + (Math.random() - 0.5) * 24;
          const my = p.y + dirY * (48 * mIdx) + (Math.random() - 0.5) * 24;
          spawnWarpEffect(mx, my - p.z, '#fde047', 96);
          createSparks(mx, my - p.z, 18, '#f97316');
          state.enemies.slice().forEach(e => {
            if (Math.hypot(e.x - mx, e.y - my) < 95) {
              damageEnemy(e, meteorDmg);
            }
          });
          if (state.boss && state.boss.hp > 0 && Math.hypot(state.boss.x - mx, state.boss.y - my) < 115) {
            damageBoss(meteorDmg);
          }
        }
        showFloater("☄️ METEOR CATACLYSM!", p.x, p.y - 40 - p.z, '#fde047');
      } else if (move === 'reality_shatter') {
        // Loop 13+ Omega Reality-Reaver: 8 Dimensional Rift Lances + Screen-Wide Reality Shatter Cleave + +10 HP Lifesteal!
        const riftDmg = Math.max(65, Math.round(totalAtk * 0.92));
        p.hp = Math.min(p.maxHp, p.hp + 10);
        state.screenShake = 14;
        spawnWarpEffect(p.x, p.y - p.z, '#ff1744', 220);
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          state.projectiles.push({
            x: p.x,
            y: p.y - p.z,
            vx: Math.cos(ang) * 17,
            vy: Math.sin(ang) * 17,
            damage: riftDmg,
            rangeRemaining: 320,
            radius: 9,
            color: i % 2 === 0 ? '#ff1744' : '#fde047',
            isLegendary: true,
          });
        }
        state.enemies.slice().forEach(e => {
          if (Math.hypot(e.x - p.x, e.y - p.y) < 230) {
            createSparks(e.x, e.y, 12, '#ff1744');
            damageEnemy(e, Math.round(riftDmg * 0.75));
          }
        });
        if (state.boss && state.boss.hp > 0 && Math.hypot(state.boss.x - p.x, state.boss.y - p.y) < 250) {
          damageBoss(Math.round(riftDmg * 0.75));
        }
        showFloater("👑 REALITY SHATTER (+10 HP)!", p.x, p.y - 42 - p.z, '#ff1744');
        updateHud();
      }
    }
  };

  const _origExecuteActionB = executeActionB;
  executeActionB = function () {
    if (isCodexOpen()) {
      handleCodexMenuInput('B');
      return;
    }
    if (state.isPaused) return;
    const p = state.player;
    if (p.status && p.status.disorientTimer > 0) {
      showFloater("💫 DISORIENTED! (" + p.status.disorientTimer.toFixed(1) + "s)", p.x, p.y - 28 - p.z, '#38bdf8');
      return;
    }
    if (p.status && p.status.vineTimer > 0) {
      showFloater("🌿 VINE ENTANGLED! (" + p.status.vineTimer.toFixed(1) + "s)", p.x, p.y - 28 - p.z, '#4ade80');
      return;
    }
    _origExecuteActionB();
  };

  const _origUpdateHud = updateHud;
  updateHud = function () {
    _origUpdateHud();
    const p = state.player;
    const defTextEl = document.getElementById('hud-def-text');
    if (defTextEl && p) {
      const st = p.status || {};
      let statusTags = '';
      if (p.armor && p.armor.dmgReduction) {
        statusTags += ' <span style="color:#fde047">🛡️-' + Math.round(p.armor.dmgReduction * 100) + '%DMG</span>';
      }
      if (st.poisonTimer > 0) statusTags += ' <span style="color:#d946ef">☠️PSN</span>';
      if (st.disorientTimer > 0) statusTags += ' <span style="color:#38bdf8">💫DIZ</span>';
      if (st.webTimer > 0) statusTags += ' <span style="color:#e2e8f0">🕸️WEB</span>';
      if (st.vineTimer > 0) statusTags += ' <span style="color:#4ade80">🌿VINE</span>';
      defTextEl.innerHTML =
        'ATK ' + getPlayerTotalAtk(p) + ' • DEF ' + getPlayerTotalDef(p) +
        '<br>BLK ' + getPlayerBlockChance(p) + '%' + statusTags;
    }
  };

  const _origUpdateCodexUi = typeof updateCodexUi === 'function' ? updateCodexUi : null;
  if (_origUpdateCodexUi) {
    updateCodexUi = function () {
      _origUpdateCodexUi();
      // Enhance Godly & Ascended cards in the Arsenal grid with Loop Requirement badges, DMG Reduction, and Regen info!
      const arsenalGrid = document.getElementById('arsenal-grid');
      if (!arsenalGrid) return;
      const cards = arsenalGrid.querySelectorAll('.gear-item');
      ARSENAL.forEach((w, idx) => {
        const card = cards[idx];
        if (!card || !w.isGodly) return;
        card.style.borderColor = w.glowColor || '#fde047';
        card.style.boxShadow = 'inset 0 0 10px rgba(253, 224, 71, 0.22)';
        const badgeHtml = `<div style="color:${w.glowColor || '#fde047'};font-size:7.5px;font-weight:900;margin-top:2px;">⚡ [LOOP ${w.minCycle}+ GODLY TIER ${w.tier}] ${w.magicMove ? ('• MAGIC: ' + w.magicMove.replace(/_/g, ' ').toUpperCase()) : ''}${w.dmgReduction ? ('• -' + Math.round(w.dmgReduction * 100) + '% DMG TAKEN • +' + (w.regenPerSec || 0) + ' HP/s') : ''}</div>`;
        card.insertAdjacentHTML('beforeend', badgeHtml);
      });
    };
  }

  // Guarantee at least 1 Snake Poison carrier, 1 Eagle Sonic Boom carrier, and 1 Spider Web Spray carrier on floors where those species appear
  const _origSpawnChamberEnemies = spawnChamberEnemies;
  spawnChamberEnemies = function (roomList, floorNum) {
    _origSpawnChamberEnemies(roomList, floorNum);
    const snakes = state.enemies.filter(e => e.species === 'snake');
    if (snakes.length > 0 && !snakes.some(e => e.hasPoisonPower)) {
      snakes[0].hasPoisonPower = true;
    }
    const eagles = state.enemies.filter(e => e.species === 'eagle');
    if (eagles.length > 0 && !eagles.some(e => e.hasSonicBoom)) {
      eagles[0].hasSonicBoom = true;
    }
    const spiders = state.enemies.filter(e => e.species === 'spider');
    if (spiders.length > 0 && !spiders.some(e => e.hasWebSpray)) {
      spiders[0].hasWebSpray = true;
    }
  };

  // -------------------------------------------------------------
  // 1B. BOSS CHAMBER OVERHAUL:
  //     - Boss Henchmen spawn tightly grouped right next to the boss (38..54px)
  //     - Bosses actively & relentlessly pursue the player character
  //     - Writhing Battleground Entangler Vines (entangle player for ~2.2 seconds)
  //     - Ground Cave Burrows & Ceiling Swing-In Spiders/Beasts assisting the boss
  // -------------------------------------------------------------
  state.bossVines = [];
  state.bossCaves = [];

  const _origDecorateBossArena = decorateBossArena;
  decorateBossArena = function (arena, floorNum) {
    _origDecorateBossArena(arena, floorNum);
    state.bossVines = [];
    state.bossCaves = [];

    const centerTx = arena.x + Math.floor(arena.w / 2);
    const centerTy = arena.y + Math.floor(arena.h / 2);

    // 1. Place 8 Writhing Battleground Entangler Vine Clusters around the boss arena approaches & flanks
    const vineOffsets = [
      { dx: -4, dy: 4 },
      { dx: 4,  dy: 4 },
      { dx: -5, dy: -1 },
      { dx: 5,  dy: -1 },
      { dx: -3, dy: -4 },
      { dx: 3,  dy: -4 },
      { dx: 0,  dy: 6 },
      { dx: 0,  dy: -5 },
    ];
    vineOffsets.forEach((vo, idx) => {
      state.bossVines.push({
        id: 'bvine_' + floorNum + '_' + idx,
        x: (centerTx + vo.dx) * TILE_SIZE + 32,
        y: (centerTy + vo.dy) * TILE_SIZE + 32,
        radius: 26,
        cooldown: 0,
        lashingAnim: 0,
        phase: idx * 0.9,
      });
    });

    // 2. Place 4 Ground Cave Burrows around the boss where smaller spiders/beasts emerge to assist the boss!
    const caveOffsets = [
      { dx: -3, dy: 1 },
      { dx: 3,  dy: 1 },
      { dx: -2, dy: -2 },
      { dx: 2,  dy: -2 },
    ];
    caveOffsets.forEach((co, idx) => {
      state.bossCaves.push({
        id: 'bcave_' + floorNum + '_' + idx,
        x: (centerTx + co.dx) * TILE_SIZE + 32,
        y: (centerTy + co.dy) * TILE_SIZE + 32,
        spawnFlash: 0,
      });
    });
  };

  // Spawn Boss Chamber Henchmen CLOSE to the boss (38..52px) so they directly guard the boss and challenge the player!
  spawnBossHenchmanSquad = function (boss, count = 4) {
    if (!boss) return;
    const cycleMult = 1 + (state.cycle - 1) * 0.65;
    const cyclePrefix = (state.cycle >= 2) ? 'Reborn ' : '';
    let henchTemplate = BESTIARY.find(b => b.id === 'warthog_crusher') || BESTIARY.find(b => b.clan === 'Boar') || BESTIARY[0];
    if (boss.id === 'brood_matriarch') {
      henchTemplate = BESTIARY.find(b => b.id === 'cave_spider') || BESTIARY.find(b => b.clan === 'Spider') || henchTemplate;
    } else if (boss.id === 'ouroboros_prime') {
      henchTemplate = BESTIARY.find(b => b.id === 'cobra_lancer') || BESTIARY.find(b => b.clan === 'Snake') || henchTemplate;
    }
    const bSpecies = henchTemplate.species || 'spider';

    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + 0.35;
      // Tightly positioned right around the boss (42..52px)!
      const distFromBoss = 44 + (i % 2) * 8;
      const hx = boss.x + Math.cos(ang) * distFromBoss;
      const hy = boss.y + Math.sin(ang) * distFromBoss;
      const hp = Math.round((henchTemplate.hp + boss.level * 4) * cycleMult);
      const atk = Math.max(2, Math.round((henchTemplate.atk + boss.level * 0.75) * cycleMult));
      state.enemies.push({
        id: 'boss_hench_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 5),
        typeId: henchTemplate.id,
        clan: henchTemplate.clan,
        rank: 'Boss Guard',
        isHenchman: true,
        isBossGuard: true,
        leaderId: boss.id,
        henchmanSlot: i,
        scale: 0.96,
        species: bSpecies,
        hasPoisonPower: bSpecies === 'snake' && Math.random() < 0.15,
        hasSonicBoom: bSpecies === 'eagle' && Math.random() < 0.15,
        hasWebSpray: bSpecies === 'spider' && Math.random() < 0.25,
        specialCooldown: 2.0,
        name: cyclePrefix + boss.name.split('(')[0].trim() + ' Guard',
        level: boss.level,
        x: hx,
        y: hy,
        z: getWorldElevation(hx, hy),
        inLiquid: false,
        rippleTimer: 0,
        radius: 22,
        hp,
        maxHp: hp,
        atk,
        speed: 1.92,
        color: henchTemplate.color,
        armorColor: henchTemplate.armorColor || '#475569',
        wepType: henchTemplate.wepType || 'spear',
        xpValue: Math.round(28 * cycleMult),
        hitStun: 0,
        attackAnim: 0,
        spikeHitCooldown: 0,
        walkAnim: Math.random() * 10,
        facing: 'down',
        blinkTimer: Math.random() * 3,
      });
    }
  };

  // Spawn smaller spiders or beasts from a Ground Cave Burrow OR swinging in from the Ceiling to assist the boss!
  function spawnBossCaveOrCeilingBeast(boss, p) {
    if (!boss || !p) return;
    const fromCeiling = Math.random() < 0.5;
    const cycleMult = 1 + (state.cycle - 1) * 0.65;
    const hp = Math.round((18 + boss.level * 2.6) * cycleMult);
    const atk = Math.max(2, Math.round((3 + boss.level * 0.55) * cycleMult));

    let spawnX = boss.x;
    let spawnY = boss.y;
    let species = 'spider';
    let beastName = 'Ceiling Drop-Spider';
    let color = '#311b92';
    let armorColor = '#76ff03';

    if (!fromCeiling && state.bossCaves && state.bossCaves.length > 0) {
      // Pick the Ground Cave Burrow closest to the player or boss
      let chosenCave = state.bossCaves[Math.floor(Math.random() * state.bossCaves.length)];
      let bestD = 99999;
      state.bossCaves.forEach(c => {
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < bestD) { bestD = d; chosenCave = c; }
      });
      chosenCave.spawnFlash = 0.85;
      spawnX = chosenCave.x + (Math.random() - 0.5) * 16;
      spawnY = chosenCave.y + (Math.random() - 0.5) * 16;
      species = (boss.id === 'ouroboros_prime') ? 'snake' : 'spider';
      beastName = (species === 'snake') ? 'Cave Burrow Viper' : 'Ground-Cave Spiderling';
      color = (species === 'snake') ? '#00695c' : '#4a148c';
      armorColor = '#a3e635';
      audio.playSfx('hut_ambush');
      createSparks(spawnX, spawnY, 16, '#a3e635');
      showFloater("🕳️ CAVE BEAST EMERGED!", spawnX, spawnY - 24, '#a3e635');
    } else {
      // Swing in from the ceiling right between the boss and the player!
      const midX = (boss.x * 0.45 + p.x * 0.55) + (Math.random() - 0.5) * 70;
      const midY = (boss.y * 0.45 + p.y * 0.55) + (Math.random() - 0.5) * 70;
      spawnX = midX;
      spawnY = midY;
      species = 'spider';
      beastName = 'Ceiling Swing-Spider';
      color = '#311b92';
      armorColor = '#38bdf8';
      audio.playSfx('web_spray');
      showFloater("🕸️ CEILING DROP-IN!", spawnX, spawnY - 48, '#38bdf8');
    }

    state.enemies.push({
      id: 'boss_assist_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      typeId: 'cave_spider',
      clan: 'Spider',
      rank: fromCeiling ? 'Ceiling Ambush' : 'Cave Swarmer',
      isHenchman: true,
      isBossGuard: true,
      leaderId: boss.id,
      scale: 0.78, // Smaller agile spider/beast assisting the boss!
      species,
      hasPoisonPower: species === 'snake' && Math.random() < 0.20,
      hasSonicBoom: false,
      hasWebSpray: species === 'spider' && Math.random() < 0.25,
      specialCooldown: 2.2,
      name: beastName,
      level: boss.level,
      x: spawnX,
      y: spawnY,
      z: getWorldElevation(spawnX, spawnY),
      ceilingDropZ: fromCeiling ? 175 : 0,
      emergeAnim: fromCeiling ? 0 : 1.0,
      inLiquid: false,
      rippleTimer: 0,
      radius: 17,
      hp,
      maxHp: hp,
      atk,
      speed: 2.05,
      color,
      armorColor,
      wepType: 'daggers',
      xpValue: Math.round(18 * cycleMult),
      hitStun: 0.1,
      attackAnim: 0,
      spikeHitCooldown: 0,
      walkAnim: Math.random() * 10,
      facing: 'down',
      blinkTimer: 1.5,
    });
  }

  const _origSpawnBossEnemy = spawnBossEnemy;
  spawnBossEnemy = function (bossId, rm) {
    _origSpawnBossEnemy(bossId, rm);
    if (state.boss) {
      // Make bosses faster and actively pursue the player character!
      state.boss.speed = 2.22 + Math.min(0.45, (state.cycle - 1) * 0.15);
      state.boss.lungeCooldown = 3.2;
      state.boss.lungeTimer = 0;
      state.boss.ambushWaveCooldown = 4.2;
      // Clear any far-flung henchmen and spawn 4 tight Boss Guards right beside the boss!
      state.enemies = state.enemies.filter(e => !e.isHenchman);
      spawnBossHenchmanSquad(state.boss, 4);
    }
  };

  // -------------------------------------------------------------
  // 2. UPDATE LOOP OVERRIDE (STATUS EFFECTS, VINES, CAVE/CEILING BEASTS & AGGRESSIVE BOSS PURSUIT)
  // -------------------------------------------------------------
  update = function (dt) {
    if (state.finaleCinematic && state.finaleCinematic.active) {
      if (typeof window.updateFinaleCinematic === 'function') {
        window.updateFinaleCinematic(dt);
      }
      return;
    }
    if (isCodexOpen()) return;
    const p = state.player;
    if (!p.status) {
      p.status = { poisonTimer: 0, poisonTickAccum: 0, disorientTimer: 0, webTimer: 0, vineTimer: 0 };
    }
    if (p.status.vineTimer === undefined) p.status.vineTimer = 0;

    // Ascended & Godly Armor Status Immunities, Continuous HP Regeneration & Offensive Auras!
    if (p.armor) {
      const armId = p.armor.id;
      if (armId === 'arm_voidwalker_vestments') {
        p.status.poisonTimer = 0;
        p.status.webTimer = 0;
      } else if (armId === 'arm_astral_seraph_raiment' || armId === 'arm_omega_godslayer_mantle') {
        p.status.poisonTimer = 0;
        p.status.webTimer = 0;
        p.status.disorientTimer = 0;
        p.status.vineTimer = 0;
      }

      if (p.armor.regenPerSec && p.hp > 0 && p.hp < p.maxHp) {
        p.armorRegenAccum = (p.armorRegenAccum || 0) + dt;
        if (p.armorRegenAccum >= 1.0) {
          p.armorRegenAccum -= 1.0;
          const healAmt = p.armor.regenPerSec + getItemForgeStars(p, p.armor) * 2;
          p.hp = Math.min(p.maxHp, p.hp + healAmt);
          showFloater('+' + healAmt + ' HP (ARMOR REGEN)', p.x, p.y - 34 - p.z, '#4ade80');
          updateHud();
        }
      }

      if (armId === 'arm_primordial_dragon_mail' || armId === 'arm_omega_godslayer_mantle') {
        p.armorAuraTimer = (p.armorAuraTimer || 0) - dt;
        if (p.armorAuraTimer <= 0) {
          const isOmega = (armId === 'arm_omega_godslayer_mantle');
          p.armorAuraTimer = isOmega ? 1.25 : 1.65;
          const auraDmg = isOmega ? (135 + p.level * 5) : (68 + p.level * 3);
          const auraRad = isOmega ? 175 : 135;
          let hitAny = false;
          state.enemies.slice().forEach(e => {
            if (Math.hypot(e.x - p.x, e.y - p.y) < auraRad) {
              hitAny = true;
              createSparks(e.x, e.y, 8, isOmega ? '#ff1744' : '#fbbf24');
              damageEnemy(e, auraDmg);
            }
          });
          if (state.boss && state.boss.hp > 0 && Math.hypot(state.boss.x - p.x, state.boss.y - p.y) < auraRad + 25) {
            hitAny = true;
            createSparks(state.boss.x, state.boss.y, 12, isOmega ? '#ff1744' : '#fbbf24');
            damageBoss(auraDmg);
          }
          if (hitAny) {
            spawnWarpEffect(p.x, p.y - p.z, isOmega ? '#ff1744' : '#fbbf24', auraRad);
          }
        }
      }
    }

    if (state.screenShake > 0) state.screenShake -= dt * 16;
    if (state.redFlash > 0) state.redFlash -= dt * 2.0;
    if (p.spikeInvuln > 0) p.spikeInvuln -= dt;
    if (state.stairNoticeCooldown > 0) state.stairNoticeCooldown -= dt;

    if (state.exitPorts && state.exitPorts.length > 0) {
      let bestPort = state.exitPorts[0];
      let bestDist = Math.hypot(bestPort.x - p.x, bestPort.y - p.y);
      for (let i = 1; i < state.exitPorts.length; i++) {
        const pt = state.exitPorts[i];
        const d = Math.hypot(pt.x - p.x, pt.y - p.y);
        if (d < bestDist) {
          bestDist = d;
          bestPort = pt;
        }
      }
      state.exitPos = { x: bestPort.x, y: bestPort.y };
    }

    let nearestEnemyDist = 9999;
    state.enemies.forEach(e => {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < nearestEnemyDist) nearestEnemyDist = d;
    });
    const inActiveBattle = (nearestEnemyDist < 360) || !!(state.boss && state.boss.hp > 0);
    audio.updateDynamicState(state.currentFloor, nearestEnemyDist, !!(state.boss && state.boss.hp > 0));

    // 1. SNAKE POISON STATUS EFFECT: 5-second slow bleed of 10 XP/sec (+ HP bleed if in battle) with glowing purple bubbles over head!
    if (p.status.poisonTimer > 0) {
      p.status.poisonTimer = Math.max(0, p.status.poisonTimer - dt);
      p.status.poisonTickAccum = (p.status.poisonTickAccum || 0) + dt;
      if (p.status.poisonTickAccum >= 1.0) {
        p.status.poisonTickAccum -= 1.0;
        p.xp = Math.max(0, p.xp - 10);
        if (inActiveBattle && p.hp > 1) {
          p.hp = Math.max(1, p.hp - 2);
        }
        audio.playSfx('poison_bubble');
        createSparks(p.x, p.y - 28 - p.z, 5, '#d946ef');
        showFloater("-10 XP (VENOM BLEED!)", p.x, p.y - 36 - p.z, '#d946ef');
        updateHud();
      }
    } else {
      p.status.poisonTickAccum = 0;
    }

    // 2. EAGLE SONIC BOOM DISORIENTATION: 5 seconds unable to move or attack with swirling dizzy lines around head!
    if (p.status.disorientTimer > 0) {
      const prevDis = p.status.disorientTimer;
      p.status.disorientTimer = Math.max(0, p.status.disorientTimer - dt);
      if (prevDis > 0 && p.status.disorientTimer === 0) {
        showFloater("✨ SENSES RECOVERED!", p.x, p.y - 32 - p.z, '#4ade80');
        updateHud();
      }
    }

    // 3. SPIDER WEB SPRAY TANGLED STATUS: visible spider web around body, -10% ATK & -10% DEF!
    if (p.status.webTimer > 0) {
      const prevWeb = p.status.webTimer;
      p.status.webTimer = Math.max(0, p.status.webTimer - dt);
      if (prevWeb > 0 && p.status.webTimer === 0) {
        showFloater("🕸️ BROKE FREE OF WEBS!", p.x, p.y - 32 - p.z, '#e2e8f0');
        updateHud();
      }
    }

    // 4. BOSS BATTLEGROUND ENTANGLING VINES STATUS: roots player in thorny vines for a couple of seconds!
    if (p.status.vineTimer > 0) {
      const prevVine = p.status.vineTimer;
      p.status.vineTimer = Math.max(0, p.status.vineTimer - dt);
      if (prevVine > 0 && p.status.vineTimer === 0) {
        showFloater("🌿 SNAPPED FREE OF VINES!", p.x, p.y - 32 - p.z, '#4ade80');
        updateHud();
      }
    }

    // Canopy Treehouse Magic Creature proximity check
    state.treehouseBeings.forEach(being => {
      if (!being.interacted && Math.hypot(p.x - being.x, p.y - being.y) < 46 && p.z >= 36) {
        interactTreehouseBeingAt(being.tx, being.ty);
      }
    });

    // Scrap-Metal & Dungeon Trash Hut proximity ambush check
    state.trashHuts.forEach(hut => {
      if (hut.shudderAnim > 0) hut.shudderAnim = Math.max(0, hut.shudderAnim - dt * 1.5);
      if (!hut.triggered && hut.hasAmbush) {
        const dHut = Math.hypot(p.x - hut.x, p.y - hut.y);
        if (dHut < 116) {
          triggerTrashHutAmbush(hut);
        } else if (dHut < 175 && Math.random() < 0.04) {
          hut.shudderAnim = 0.25;
        }
      }
    });

    // Boss & Dungeon Entangler Vines proximity check (ensnares hero for 2.2 seconds without disappearing)
    if (state.bossVines && state.bossVines.length > 0) {
      state.bossVines.forEach(vine => {
        if (typeof vine.cooldown !== 'number' || Number.isNaN(vine.cooldown)) vine.cooldown = 0;
        if (typeof vine.lashingAnim !== 'number' || Number.isNaN(vine.lashingAnim)) vine.lashingAnim = 0;
        vine.phase = (vine.phase || 0) + dt * 1.8;
        if (vine.cooldown > 0) vine.cooldown = Math.max(0, vine.cooldown - dt);
        if (vine.lashingAnim > 0) vine.lashingAnim = Math.max(0, vine.lashingAnim - dt * 2.0);
        const vRad = vine.radius || 24;
        if (vine.cooldown <= 0 && Math.hypot(p.x - vine.x, p.y - vine.y) < vRad + 10) {
          vine.cooldown = 6.5;
          vine.lashingAnim = 1.0;
          p.status.vineTimer = Math.max(p.status.vineTimer || 0, 2.2);
          audio.playSfx('web_spray');
          createSparks(p.x, p.y, 16, '#4ade80');
          showFloater("🌿 VINES ENTANGLED YOU! (2.2s)", p.x, p.y - 32 - p.z, '#4ade80');
          showToast("ENSNARING VINES: ENTANGLED FOR 2 SECONDS!");
          updateHud();
        }
      });
    }

    // Ground Cave Burrows flash decay
    if (state.bossCaves && state.bossCaves.length > 0) {
      state.bossCaves.forEach(cave => {
        if (cave.spawnFlash > 0) cave.spawnFlash = Math.max(0, cave.spawnFlash - dt * 1.6);
      });
    }

    // Boss Arena Booby Traps
    state.bossTraps.forEach(trap => {
      trap.timer += dt;
      if (trap.cooldown > 0) trap.cooldown -= dt;

      if (trap.type === 'sawblade_jaw') {
        trap.x = trap.baseX + Math.sin(trap.timer * 2.4) * 68;
        trap.active = true;
        if (Math.hypot(p.x - trap.x, p.y - trap.y) < trap.radius + 10 && p.spikeInvuln <= 0) {
          p.spikeInvuln = 0.48;
          if (!attemptShieldBlock(null)) {
            const dmg = Math.max(3, 14 - Math.floor(getPlayerTotalDef(p) * 0.5));
            p.hp = Math.max(0, p.hp - dmg);
            state.screenShake = 9;
            audio.playSfx('spikes');
            createBloodSpurt(p.x, p.y, 14);
            showFloater('-' + dmg + ' SAWBLADE TRAP!', p.x, p.y - 26 - p.z, '#ff1744');
            updateHud();
            if (p.hp <= 0) {
              triggerPlayerDeathRecovery('Boss Arena Sawblade Trap');
              return;
            }
          }
        }
      } else if (trap.type === 'venom_tripwire') {
        trap.active = (Math.sin(trap.timer * 3.0) > -0.3);
        if (trap.cooldown <= 0 && Math.hypot(p.x - trap.x, p.y - trap.y) < trap.radius + 8) {
          trap.cooldown = 4.5;
          audio.playSfx('web_spray');
          audio.playSfx('poison_bubble');
          createSparks(trap.x, trap.y, 18, '#a3e635');
          p.status.webTimer = Math.max(p.status.webTimer, 6.0);
          p.status.poisonTimer = Math.max(p.status.poisonTimer, 5.0);
          showFloater("🕸️☠️ VENOM TRIPWIRE SNARE!", p.x, p.y - 30 - p.z, '#a3e635');
          updateHud();
        }
      } else {
        const cyclePos = trap.timer % 3.6;
        const wasActive = trap.active;
        trap.active = (cyclePos >= 2.4);
        if (!wasActive && trap.active && Math.hypot(p.x - trap.x, p.y - trap.y) < 320) {
          createSparks(trap.x, trap.y, 12, trap.type === 'steam_geyser' ? '#fb923c' : '#c084fc');
        }
        if (trap.active && Math.hypot(p.x - trap.x, p.y - trap.y) < trap.radius + 10 && p.spikeInvuln <= 0) {
          p.spikeInvuln = 0.5;
          const dmg = Math.max(3, 15 - Math.floor(getPlayerTotalDef(p) * 0.5));
          p.hp = Math.max(0, p.hp - dmg);
          state.screenShake = 10;
          audio.playSfx('boss_hammer');
          createSparks(p.x, p.y, 16, '#fb923c');
          showFloater('-' + dmg + ' GEYSER TRAP!', p.x, p.y - 26 - p.z, '#fb923c');
          updateHud();
          if (p.hp <= 0) {
            triggerPlayerDeathRecovery('Boss Arena Eruption Trap');
            return;
          }
        }
      }
    });

    // Expanding Sonic Boom Room Ripples
    for (let i = state.sonicBoomWaves.length - 1; i >= 0; i--) {
      const sw = state.sonicBoomWaves[i];
      sw.radius += dt * sw.speed;
      sw.alpha = Math.max(0, 1.0 - (sw.radius / sw.maxRadius));
      if (sw.radius >= sw.maxRadius || sw.alpha <= 0.02) {
        state.sonicBoomWaves.splice(i, 1);
      }
    }

    // Retractable Floor Spikes
    state.spikes.forEach(sp => {
      sp.timer += dt;
      if (sp.phase === 'down') {
        sp.ext = 0;
        if (sp.timer > 2.0) { sp.phase = 'warning'; sp.timer = 0; }
      } else if (sp.phase === 'warning') {
        sp.ext = 0.08 + Math.sin(sp.timer * 40) * 0.04;
        if (Math.random() < 0.15) createSparks(sp.x + Math.random() * sp.w, sp.y + Math.random() * sp.h, 2, '#f59e0b');
        if (sp.timer > 0.6) { sp.phase = 'rising'; sp.timer = 0; }
      } else if (sp.phase === 'rising') {
        sp.ext = Math.min(1.0, 0.1 + (sp.timer / 0.15) * 0.9);
        if (sp.timer >= 0.15) {
          sp.phase = 'up';
          sp.timer = 0;
          createSparks(sp.x + sp.w / 2, sp.y + sp.h / 2, 8, '#e2e8f0');
        }
      } else if (sp.phase === 'up') {
        sp.ext = 1.0;
        if (sp.timer > 2.0) { sp.phase = 'lowering'; sp.timer = 0; }
      } else if (sp.phase === 'lowering') {
        sp.ext = Math.max(0, 1.0 - (sp.timer / 0.35));
        if (sp.timer >= 0.35) { sp.phase = 'down'; sp.timer = 0; }
      }

      if (sp.ext >= 0.35) {
        const pFootX = p.x;
        const pFootY = p.y + 12;
        const pRadius = 14;
        if (pFootX + pRadius > sp.x && pFootX - pRadius < sp.x + sp.w &&
            pFootY + pRadius > sp.y && pFootY - pRadius < sp.y + sp.h) {
          if (p.spikeInvuln <= 0) {
            p.spikeInvuln = 0.42;
            if (!attemptShieldBlock(null)) {
              const spikeDmg = Math.max(2, (14 + state.currentFloor * 2) - Math.floor(getPlayerTotalDef(p) * 0.5));
              p.hp = Math.max(0, p.hp - spikeDmg);
              state.screenShake = 12;
              state.redFlash = 0.45;
              audio.playSfx('spikes');
              createBloodSpurt(pFootX, pFootY, 18);
              showFloater('-' + spikeDmg + ' SPIKES!', p.x, p.y - 24, '#ff1744');
              updateHud();
              if (p.hp <= 0) {
                triggerPlayerDeathRecovery('Floor Spikes');
                return;
              }
            }
          }
        }
        state.enemies.forEach(e => {
          const eFootX = e.x;
          const eFootY = e.y + 12;
          if (eFootX + 14 > sp.x && eFootX - 14 < sp.x + sp.w &&
              eFootY + 14 > sp.y && eFootY - 14 < sp.y + sp.h) {
            if (e.spikeHitCooldown <= 0) {
              e.spikeHitCooldown = 0.45;
              const eDmg = 26 + state.currentFloor * 4;
              e.hp -= eDmg;
              e.hitStun = 0.35;
              createBloodSpurt(eFootX, eFootY, 14);
              showFloater('-' + eDmg + ' SPIKES!', e.x, e.y - 24, '#ff3333');
              if (Math.hypot(e.x - p.x, e.y - p.y) < 220) audio.playSfx('spikes');
              if (e.hp <= 0) {
                addPlayerXp(e.xpValue);
                createBloodSpurt(e.x, e.y, 22);
                state.enemies = state.enemies.filter(item => item !== e);
              }
            }
          }
        });
      }
    });

    const dtScale = Math.min(2.2, dt * 60);
    stepPlayerMovement(dt, false);
    checkRoomAutoSave();

    if (p.attackCooldown > 0) p.attackCooldown = Math.max(0, p.attackCooldown - dt);
    if (p.isAttacking > 0) p.isAttacking = Math.max(0, p.isAttacking - dt);
    if (p.hitStun > 0) p.hitStun = Math.max(0, p.hitStun - dt);
    if (p.dashCooldown > 0) p.dashCooldown = Math.max(0, p.dashCooldown - dt);

    if (input.bufferA > 0) input.bufferA -= dt;
    if (input.bufferB > 0) input.bufferB -= dt;

    if ((input.actionA || input.bufferA > 0) && p.attackCooldown <= 0) {
      executeActionA();
    }
    if (input.bufferB > 0 && state.minion.attackCooldown <= 0) {
      executeActionB();
    }

    // Chained Minion
    const m = state.minion;
    if (m.spikeInvuln > 0) m.spikeInvuln -= dt;
    const tdx = p.x - m.x;
    const tdy = p.y - m.y;
    const chainDist = Math.hypot(tdx, tdy);
    const maxTether = 110;
    if (chainDist > maxTether) {
      const pull = (chainDist - maxTether) * Math.min(0.65, 0.22 * dtScale);
      m.x += (tdx / chainDist) * pull;
      m.y += (tdy / chainDist) * pull;
      m.walkAnim += dt * 10;
    } else {
      m.x += tdx * Math.min(0.25, 0.042 * dtScale);
      m.y += tdy * Math.min(0.25, 0.042 * dtScale);
    }
    m.z = getWorldElevation(m.x, m.y);
    const mTile = state.map[Math.floor(m.y / TILE_SIZE)]?.[Math.floor(m.x / TILE_SIZE)];
    m.inLiquid = isLiquidTile(mTile);

    if (m.attackCooldown > 0) m.attackCooldown -= dt;
    else if (state.enemies.length > 0 || (state.boss && state.boss.hp > 0)) {
      let closest = null;
      let minD = 155;
      state.enemies.forEach(e => {
        const d = Math.hypot(e.x - m.x, e.y - m.y);
        if (d < minD) { minD = d; closest = e; }
      });
      if (!closest && state.boss && state.boss.hp > 0) {
        const bd = Math.hypot(state.boss.x - m.x, state.boss.y - m.y);
        if (bd < 210) closest = state.boss;
      }
      if (closest) {
        m.attackCooldown = 0.9;
        const angle = Math.atan2(closest.y - m.y, closest.x - m.x);
        state.projectiles.push({
          x: m.x,
          y: m.y - m.z,
          vx: Math.cos(angle) * 7,
          vy: Math.sin(angle) * 7,
          damage: m.atk + Math.floor(p.level * 1.2),
          rangeRemaining: 165,
          radius: 4,
          color: '#f97316',
        });
      }
    }

    // Projectiles
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const pr = state.projectiles[i];
      pr.x += pr.vx * dtScale;
      pr.y += pr.vy * dtScale;
      pr.rangeRemaining -= Math.hypot(pr.vx, pr.vy) * dtScale;

      if (pr.fromBoss) {
        if (Math.hypot(p.x - pr.x, p.y - pr.y) < p.radius + pr.radius) {
          pr.rangeRemaining = 0;
          if (p.hitStun <= 0 && p.spikeInvuln <= 0) {
            p.hitStun = 0.35;
            if (!attemptShieldBlock(state.boss)) {
              const bDmg = applyArmorDamageReduction(p, Math.max(1, (pr.damage || 10) - getPlayerTotalDef(p)));
              p.hp = Math.max(0, p.hp - bDmg);
              state.screenShake = 8;
              state.redFlash = 0.4;
              audio.playSfx('spikes');
              createBloodSpurt(p.x, p.y + 8, 10);
              showFloater('-' + bDmg, p.x, p.y - 22 - p.z, '#ff1744');
              if (pr.appliesWeb) {
                p.status.webTimer = Math.max(p.status.webTimer, (p.abilities && p.abilities.includes('venom_ward')) ? 4.0 : 8.0);
                audio.playSfx('web_spray');
              }
              if (pr.appliesPoison) {
                p.status.poisonTimer = Math.max(p.status.poisonTimer, (p.abilities && p.abilities.includes('venom_ward')) ? 2.5 : 5.0);
                audio.playSfx('poison_bubble');
              }
              updateHud();
              if (p.hp <= 0) {
                triggerPlayerDeathRecovery(state.boss ? state.boss.name : 'Boss Attack');
                return;
              }
            }
          }
        }
      } else {
        for (const e of state.enemies) {
          if (Math.hypot(e.x - pr.x, e.y - pr.y) < e.radius + pr.radius) {
            damageEnemy(e, pr.damage);
            if (pr.isLegendary) spawnWarpEffect(e.x, e.y, pr.color || '#39ff14', 52);
            pr.rangeRemaining = 0;
            break;
          }
        }
        if (state.boss && state.boss.hp > 0 && pr.rangeRemaining > 0) {
          if (Math.hypot(state.boss.x - pr.x, state.boss.y - pr.y) < state.boss.radius + pr.radius) {
            damageBoss(pr.damage);
            if (pr.isLegendary) spawnWarpEffect(state.boss.x, state.boss.y, pr.color || '#39ff14', 64);
            pr.rangeRemaining = 0;
          }
        }
      }

      if (pr.rangeRemaining <= 0) {
        createSparks(pr.x, pr.y, pr.isLegendary ? 10 : 4, pr.color);
        state.projectiles.splice(i, 1);
      }
    }

    // Enemy AI + Ceiling Swing-In / Ground Cave Emergence + Species Status Powers
    for (let ei = 0; ei < state.enemies.length; ei++) {
      const e = state.enemies[ei];
      if (!e) continue;

      // Animate ceiling swing-in descent!
      if (e.ceilingDropZ && e.ceilingDropZ > 0) {
        e.ceilingDropZ = Math.max(0, e.ceilingDropZ - dt * 260);
        if (e.ceilingDropZ === 0) {
          createSparks(e.x, e.y, 12, '#38bdf8');
          spawnWaterRipple(e.x, e.y + 8, 'rgba(56, 189, 248, 0.7)', 28);
        }
        continue;
      }
      // Animate ground cave burrow emergence!
      if (e.emergeAnim && e.emergeAnim > 0) {
        e.emergeAnim = Math.max(0, e.emergeAnim - dt * 2.2);
      }

      if (e.hitStun > 0) { e.hitStun -= dt; continue; }
      if (e.spikeHitCooldown > 0) e.spikeHitCooldown -= dt;
      if (e.attackAnim > 0) e.attackAnim -= dt;
      if (e.specialCooldown > 0) e.specialCooldown -= dt;

      let targetX = p.x;
      let targetY = p.y;
      const distToPlayer = Math.hypot(p.x - e.x, p.y - e.y);

      if (e.isMiniBoss && !e.tauntSpoken && distToPlayer < 290) {
        e.tauntSpoken = true;
        if (e.taunt) {
          dialogue.show("👑 " + e.name + " (" + (e.title || "CLAN SUB-BOSS") + ")", e.taunt, 4600);
        }
      }

      // 7% of Eagles: Sonic Boom sends visible ripples through the room and disorients main character for 5s!
      if (e.hasSonicBoom && (e.specialCooldown || 0) <= 0 && distToPlayer < 195) {
        e.specialCooldown = 9.5;
        e.attackAnim = 0.35;
        audio.playSfx('sonic_boom');
        state.screenShake = 9;
        for (let r = 0; r < 3; r++) {
          state.sonicBoomWaves.push({
            x: e.x,
            y: e.y - (e.z || 0),
            radius: 14 + r * 22,
            maxRadius: 420,
            speed: 260 + r * 35,
            alpha: 0.95,
            color: r % 2 === 0 ? '#38bdf8' : '#fde047',
          });
        }
        if (p.abilities && p.abilities.includes('gale_step')) {
          showFloater("🪶 GALE-STEP RESISTED SONIC BOOM!", p.x, p.y - 34 - p.z, '#38bdf8');
        } else {
          p.status.disorientTimer = 5.0;
          showFloater("💫 SONIC BOOM! DISORIENTED (5s)!", p.x, p.y - 34 - p.z, '#38bdf8');
          showToast("EAGLE SONIC BOOM: DISORIENTED FOR 5 SECONDS!");
          updateHud();
        }
      }

      // 10% of Spiders: Web Spray tangles player in visible spider web, reducing ATK by 10% and DEF by 10%!
      if (e.hasWebSpray && (e.specialCooldown || 0) <= 0 && distToPlayer < 150) {
        e.specialCooldown = 8.0;
        e.attackAnim = 0.3;
        audio.playSfx('web_spray');
        createSparks(p.x, p.y - p.z, 16, '#e2e8f0');
        const webDur = (p.abilities && p.abilities.includes('venom_ward')) ? 4.0 : 8.0;
        p.status.webTimer = Math.max(p.status.webTimer, webDur);
        showFloater("🕸️ WEB SPRAY! (-10% ATK & -10% DEF)", p.x, p.y - 32 - p.z, '#e2e8f0');
        showToast("TANGLED IN SPIDER WEBS: -10% ATK & -10% DEF!");
        updateHud();
      }

      // Boss Guards stay tightly grouped right around the boss (38..50px) when player is far, and swarm the player together with the boss!
      if (e.isHenchman && e.leaderId) {
        const isBossMinion = !!(state.boss && state.boss.id === e.leaderId && state.boss.hp > 0);
        const leader = isBossMinion
          ? state.boss
          : state.enemies.find(l => l.id === e.leaderId && l.hp > 0);
        if (leader) {
          const orbitRadius = isBossMinion ? 44 : 58;
          const orbitAngle = (performance.now() * 0.0018) + (ei * 1.57);
          const guardX = leader.x + Math.cos(orbitAngle) * orbitRadius;
          const guardY = leader.y + Math.sin(orbitAngle) * orbitRadius;
          if (isBossMinion) {
            // Stay close to the boss while closing in on the player together!
            if (distToPlayer > 170) {
              targetX = guardX * 0.65 + p.x * 0.35;
              targetY = guardY * 0.65 + p.y * 0.35;
            }
          } else if (distToPlayer > 235) {
            targetX = guardX;
            targetY = guardY;
          }
        }
      }

      const dx = targetX - e.x;
      const dy = targetY - e.y;
      const dist = Math.hypot(dx, dy);
      e.facing = (p.x - e.x) > 0 ? 'right' : 'left';

      const aggroRange = e.isBossGuard ? 950 : 390;
      if (distToPlayer < aggroRange && distToPlayer > (e.isMiniBoss ? 38 : 30)) {
        e.walkAnim += dt * (e.isMiniBoss ? 6.8 : 8.2);
        const stepE = e.speed * dtScale;
        const nx = e.x + (dx / Math.max(1, dist)) * stepE;
        const ny = e.y + (dy / Math.max(1, dist)) * stepE;
        const etx = Math.floor(nx / TILE_SIZE);
        const ety = Math.floor(ny / TILE_SIZE);
        const etType = state.map[ety]?.[etx];
        if (!isWallTile(etType) && etType !== T_ABYSS) {
          e.x = nx;
          e.y = ny;
        }
        e.z = getWorldElevation(e.x, e.y);
        e.inLiquid = isLiquidTile(etType);
        if (e.inLiquid) {
          e.rippleTimer = (e.rippleTimer || 0) - dt;
          if (e.rippleTimer <= 0) {
            e.rippleTimer = 0.26;
            const rCol = (etType === T_FLOOR_SLUDGE) ? 'rgba(134, 239, 172, 0.6)' : 'rgba(147, 197, 253, 0.6)';
            spawnWaterRipple(e.x, e.y + 8, rCol, 26);
          }
        }
      } else if (distToPlayer <= (e.isMiniBoss ? 38 : 34)) {
        e.attackAnim = 0.25;
        if (p.hitStun <= 0 && p.spikeInvuln <= 0) {
          p.hitStun = 0.38;
          if (e.species === 'snake') {
            audio.playSfx('snake_hiss');
          }
          if (!attemptShieldBlock(e)) {
            const dmg = applyArmorDamageReduction(p, Math.max(1, e.atk - getPlayerTotalDef(p)));
            p.hp = Math.max(0, p.hp - dmg);
            state.screenShake = e.isMiniBoss ? 9 : 6;
            audio.playSfx('spikes');
            createBloodSpurt(p.x, p.y + 10, 8);
            showFloater('-' + dmg, p.x, p.y - 20 - p.z, '#ff1744');

            // 5% of Snakes deal Poison (glowing purple bubbles over head + 5s bleed of 10 XP/sec!)
            if (e.hasPoisonPower) {
              const pDur = (p.abilities && p.abilities.includes('venom_ward')) ? 2.5 : 5.0;
              p.status.poisonTimer = Math.max(p.status.poisonTimer, pDur);
              audio.playSfx('poison_bubble');
              createSparks(p.x, p.y - 28 - p.z, 14, '#d946ef');
              showFloater("☠️ VENOM POISONED! (-10 XP/s)", p.x, p.y - 36 - p.z, '#d946ef');
              showToast("SNAKE VENOM: -10 XP/SEC BLEED FOR 5 SECONDS!");
            }

            updateHud();
            if (p.hp <= 0) {
              triggerPlayerDeathRecovery(e.name || 'Dungeon Beast');
              return;
            }
          }
        }
      }
    }

    // Boss AI: Relentless Player Pursuit, Lunge Charges, Ground-Cave & Ceiling Swing-In Reinforcements!
    if (state.boss && state.boss.hp > 0) {
      const b = state.boss;
      if (b.hitStun > 0) b.hitStun -= dt;
      if (b.spikeHitCooldown > 0) b.spikeHitCooldown -= dt;
      if (b.attackCooldown > 0) b.attackCooldown -= dt;
      if (b.attackAnim > 0) b.attackAnim -= dt;
      if (b.summonCooldown > 0) b.summonCooldown -= dt;
      if (b.lungeCooldown > 0) b.lungeCooldown -= dt;
      if (b.lungeTimer > 0) b.lungeTimer -= dt;
      if (b.ambushWaveCooldown > 0) b.ambushWaveCooldown -= dt;

      const bdx = p.x - b.x;
      const bdy = p.y - b.y;
      const bDist = Math.hypot(bdx, bdy);

      // Periodic aggressive pursuit lunge toward the player character!
      if ((b.lungeCooldown || 0) <= 0 && bDist > 90) {
        b.lungeCooldown = 3.4;
        b.lungeTimer = 0.55;
        audio.playSfx('boss_roar');
        createSparks(b.x, b.y, 12, b.glowColor || '#ff6d00');
      }

      const pursuitMult = (b.lungeTimer > 0) ? 1.85 : 1.0;
      const bossStep = (b.speed || 2.25) * pursuitMult * dtScale;
      b.walkAnim += dt * (b.lungeTimer > 0 ? 9.5 : 5.8);

      // Boss relentlessly pursues the player across the chamber!
      if (bDist > 44) {
        const nx = b.x + (bdx / bDist) * bossStep;
        const ny = b.y + (bdy / bDist) * bossStep;
        const btx = Math.floor(nx / TILE_SIZE);
        const bty = Math.floor(ny / TILE_SIZE);
        const btType = state.map[bty]?.[btx];
        if (!isWallTile(btType) && btType !== T_ABYSS) {
          b.x = nx;
          b.y = ny;
        }
        b.z = getWorldElevation(b.x, b.y);
      } else if (p.hitStun <= 0 && p.spikeInvuln <= 0) {
        p.hitStun = 0.42;
        audio.playSfx('boss_hammer');
        if (!attemptShieldBlock(b)) {
          const crushDmg = applyArmorDamageReduction(p, Math.max(2, b.atk - getPlayerTotalDef(p)));
          p.hp = Math.max(0, p.hp - crushDmg);
          state.screenShake = 12;
          createBloodSpurt(p.x, p.y, 14);
          showFloater('-' + crushDmg + ' CRUSH!', p.x, p.y - 28 - p.z, '#ff1744');
          updateHud();
          if (p.hp <= 0) {
            triggerPlayerDeathRecovery(b.name);
            return;
          }
        }
      }

      // Ground Cave Burrows & Ceiling Swing-In Beasts that emerge/drop in to assist the boss!
      if ((b.ambushWaveCooldown || 0) <= 0) {
        b.ambushWaveCooldown = 5.2;
        const activeMinions = state.enemies.length;
        if (activeMinions < 6) {
          spawnBossCaveOrCeilingBeast(b, p);
        }
      }

      // Close-Formation Boss Guard Squad Replenishment
      if ((b.summonCooldown || 0) <= 0) {
        b.summonCooldown = 10.5;
        const activeHench = state.enemies.filter(e => e.isHenchman).length;
        if (activeHench < 3) {
          audio.playSfx('boss_roar');
          spawnWarpEffect(b.x, b.y - (b.z || 0), b.glowColor || '#ff6d00', 110);
          spawnBossHenchmanSquad(b, 2);
          showFloater("⚔️ BOSS GUARDS SUMMONED!", b.x, b.y - 52 - (b.z || 0), '#fde047');
        }
      }

      if (b.attackCooldown <= 0) {
        b.attackCooldown = 2.0;
        b.attackAnim = 0.42;
        b.attackPhase = (b.attackPhase + 1) % 3;

        if (b.id === 'steam_colossus') {
          audio.playSfx('boss_hammer');
          state.screenShake = 14;
          spawnWarpEffect(b.x, b.y - (b.z || 0), '#ff6d00', 120);
          state.sonicBoomWaves.push({
            x: b.x,
            y: b.y - (b.z || 0),
            radius: 24,
            maxRadius: 340,
            speed: 240,
            alpha: 0.9,
            color: '#ff6d00',
          });
          const count = (b.attackPhase === 0) ? 12 : 8;
          for (let i = 0; i < count; i++) {
            const ang = (i / count) * Math.PI * 2 + (b.attackPhase * 0.25);
            state.projectiles.push({
              x: b.x,
              y: b.y,
              vx: Math.cos(ang) * 6.0,
              vy: Math.sin(ang) * 6.0,
              damage: b.atk,
              rangeRemaining: 280,
              radius: 7,
              color: '#ff6d00',
              fromBoss: true,
            });
          }
        } else if (b.id === 'brood_matriarch') {
          audio.playSfx('web_spray');
          audio.playSfx('snake_hiss');
          state.screenShake = 10;
          spawnWarpEffect(b.x, b.y - (b.z || 0), '#76ff03', 100);
          for (let ang = -0.75; ang <= 0.75; ang += 0.25) {
            const baseAng = Math.atan2(bdy, bdx) + ang;
            state.projectiles.push({
              x: b.x,
              y: b.y,
              vx: Math.cos(baseAng) * 7.8,
              vy: Math.sin(baseAng) * 7.8,
              damage: b.atk,
              rangeRemaining: 330,
              radius: 7,
              color: (Math.abs(ang) < 0.1) ? '#e2e8f0' : '#76ff03',
              appliesWeb: (Math.abs(ang) < 0.3),
              appliesPoison: (Math.abs(ang) >= 0.3),
              fromBoss: true,
            });
          }
        } else if (b.id === 'ouroboros_prime') {
          audio.playSfx('boss_roar');
          audio.playSfx('boss_hammer');
          state.screenShake = 16;
          spawnWarpEffect(b.x, b.y - (b.z || 0), '#ff1744', 140);
          state.sonicBoomWaves.push({
            x: b.x,
            y: b.y - (b.z || 0),
            radius: 28,
            maxRadius: 420,
            speed: 270,
            alpha: 0.95,
            color: '#d500f9',
          });
          for (let ang = 0; ang < Math.PI * 2; ang += Math.PI / 8) {
            state.projectiles.push({
              x: b.x,
              y: b.y,
              vx: Math.cos(ang + b.attackPhase * 0.2) * 6.8,
              vy: Math.sin(ang + b.attackPhase * 0.2) * 6.8,
              damage: b.atk + 4,
              rangeRemaining: 360,
              radius: 8,
              color: (b.attackPhase % 2 === 0) ? '#ff1744' : '#d500f9',
              appliesPoison: (b.attackPhase === 1),
              fromBoss: true,
            });
          }
        }
      }
    }

    for (let i = state.waterRipples.length - 1; i >= 0; i--) {
      const rp = state.waterRipples[i];
      rp.radius += dt * 28;
      rp.alpha -= dt * 0.85;
      if (rp.alpha <= 0 || rp.radius >= rp.maxRadius) state.waterRipples.splice(i, 1);
    }

    state.ceilingDrips.forEach(dr => {
      if (dr.delay > 0) { dr.delay -= dt; return; }
      dr.dropY += dr.speed * dt;
      if (dr.dropY >= dr.targetY) {
        const rCol = dr.isAcid ? 'rgba(134, 239, 172, 0.7)' : 'rgba(147, 197, 253, 0.7)';
        spawnWaterRipple(dr.targetX, dr.targetY, rCol, 20);
        createSparks(dr.targetX, dr.targetY, 3, dr.isAcid ? '#86efac' : '#93c5fd');
        dr.dropY = dr.targetY - 160 - Math.random() * 80;
        dr.delay = 1.2 + Math.random() * 2.5;
      }
    });

    const mapMaxW = DUNGEON_COLS * TILE_SIZE;
    const mapMaxH = DUNGEON_ROWS * TILE_SIZE;
    state.fogClouds.forEach(fg => {
      fg.x += fg.vx * dt;
      fg.y += fg.vy * dt;
      if (fg.x > mapMaxW) fg.x = 0;
      if (fg.y > mapMaxH) fg.y = 0;
      if (fg.y < 0) fg.y = mapMaxH;
    });

    for (let i = state.particles.length - 1; i >= 0; i--) {
      const pt = state.particles[i];
      pt.x += pt.vx * dtScale;
      pt.y += pt.vy * dtScale;
      pt.life -= dt * 2.0;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }

    for (let i = state.warpEffects.length - 1; i >= 0; i--) {
      const wf = state.warpEffects[i];
      wf.radius += (wf.maxRadius - wf.radius) * Math.min(1, dt * 11);
      wf.alpha -= dt * 2.2;
      if (wf.alpha <= 0.02) state.warpEffects.splice(i, 1);
    }

    for (let i = state.floaterTexts.length - 1; i >= 0; i--) {
      const fl = state.floaterTexts[i];
      fl.y -= dt * 24;
      fl.life -= dt * 1.5;
      if (fl.life <= 0) state.floaterTexts.splice(i, 1);
    }

    state.props.forEach(pr => {
      if (pr.type === 'chain' || pr.type === 'vine') {
        const d = Math.hypot(p.x - pr.x, p.y - (pr.y + pr.h * 0.7));
        if (d < 38) pr.sway = Math.min(24, pr.sway + 14);
        else pr.sway = Math.max(0, pr.sway - dt * 10);
      }
    });

    const camFollow = Math.min(1.0, 1.0 - Math.pow(0.0004, dt));
    state.camera.x += (p.x - state.camera.x) * camFollow;
    state.camera.y += (p.y - state.camera.y) * camFollow;
  };

  // -------------------------------------------------------------
  // 3. TRUE 3D MULTI-TIER HEIGHT PLATEAUS, RAMPS, CLIMBABLE TREES, CANOPY TREEHOUSES & SCRAP-METAL HUTS
  // -------------------------------------------------------------
  drawTileElevatedPlateau = function (x, y, r, c, theme) {
    const hTier = (state.heightMap[r] && state.heightMap[r][c]) ? state.heightMap[r][c] : 1;
    const cliffH = hTier >= 2 ? 32 : 22;

    ctx.fillStyle = '#070a0f';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

    const topY = y - (hTier >= 2 ? 12 : 6);
    const topGrad = ctx.createLinearGradient(x, topY, x, topY + TILE_SIZE);
    topGrad.addColorStop(0, hTier >= 2 ? '#64748b' : '#475569');
    topGrad.addColorStop(1, hTier >= 2 ? '#334155' : '#1e293b');
    ctx.fillStyle = topGrad;
    ctx.fillRect(x, topY, TILE_SIZE, TILE_SIZE - cliffH + 10);

    ctx.strokeStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 2, topY + 2, 28, 18);
    ctx.strokeRect(x + 32, topY + 4, 28, 18);

    ctx.fillStyle = theme.vineColor || '#22c55e';
    ctx.fillRect(x + 4, topY + 2, 14, 4);
    ctx.fillRect(x + 38, topY + 3, 18, 4);

    const rimY = topY + TILE_SIZE - cliffH + 8;
    ctx.fillStyle = hTier >= 2 ? '#e2e8f0' : '#94a3b8';
    ctx.fillRect(x, rimY, TILE_SIZE, 3);

    const wallGrad = ctx.createLinearGradient(x, rimY + 3, x, y + TILE_SIZE);
    wallGrad.addColorStop(0, '#334155');
    wallGrad.addColorStop(0.55, '#1e293b');
    wallGrad.addColorStop(1, '#090d16');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(x, rimY + 3, TILE_SIZE, y + TILE_SIZE - (rimY + 3));

    ctx.fillStyle = '#0f172a';
    for (let sx = 12; sx < TILE_SIZE; sx += 16) {
      ctx.fillRect(x + sx, rimY + 3, 2, y + TILE_SIZE - (rimY + 3));
    }
    ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
    for (let sx = 4; sx < TILE_SIZE; sx += 16) {
      ctx.fillRect(x + sx, rimY + 4, 6, 6);
    }

    if (r + 1 < DUNGEON_ROWS && state.map[r + 1][c] !== T_FLOOR_HIGH) {
      ctx.fillStyle = 'rgba(2, 4, 8, 0.65)';
      ctx.fillRect(x, y + TILE_SIZE - 4, TILE_SIZE, 12);
    }
    if (c + 1 < DUNGEON_COLS && state.map[r][c + 1] !== T_FLOOR_HIGH) {
      ctx.fillStyle = 'rgba(2, 4, 8, 0.55)';
      ctx.fillRect(x + TILE_SIZE - 4, topY, 10, TILE_SIZE);
    }
  };

  drawTileSteppedRamp = function (x, y, theme) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

    const steps = 6;
    const stepH = TILE_SIZE / steps;
    for (let s = 0; s < steps; s++) {
      const sy = y + s * stepH;
      const elevOffset = (steps - s) * 1.6;
      ctx.fillStyle = (s % 2 === 0) ? '#64748b' : '#475569';
      ctx.fillRect(x + 6, sy - elevOffset, TILE_SIZE - 12, stepH - 2);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(x + 6, sy - elevOffset, TILE_SIZE - 12, 2);
      ctx.fillStyle = '#090d16';
      ctx.fillRect(x + 6, sy - elevOffset + stepH - 3, TILE_SIZE - 12, 3);
    }

    ctx.fillStyle = '#334155';
    ctx.fillRect(x + 1, y - 6, 6, TILE_SIZE + 6);
    ctx.fillRect(x + TILE_SIZE - 7, y - 6, 6, TILE_SIZE + 6);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(x + 2, y - 6, 3, TILE_SIZE + 4);
    ctx.fillRect(x + TILE_SIZE - 6, y - 6, 3, TILE_SIZE + 4);
  };

  function drawClimbableTreeTrunkTile(x, y, theme, now) {
    drawTileFloorGrass(x, y, theme, now);

    ctx.save();
    ctx.fillStyle = 'rgba(3, 6, 12, 0.65)';
    ctx.beginPath();
    ctx.ellipse(x + 32, y + 54, 28, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    const trunkGrad = ctx.createLinearGradient(x + 8, y, x + 56, y);
    trunkGrad.addColorStop(0, '#27170d');
    trunkGrad.addColorStop(0.35, '#5c3a21');
    trunkGrad.addColorStop(0.7, '#3f2615');
    trunkGrad.addColorStop(1, '#1a0f08');
    ctx.fillStyle = trunkGrad;
    ctx.beginPath();
    ctx.moveTo(x + 6, y + 60);
    ctx.lineTo(x + 14, y - 16);
    ctx.lineTo(x + 50, y - 16);
    ctx.lineTo(x + 58, y + 60);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#1c1008';
    ctx.lineWidth = 2;
    for (let bx = 18; bx <= 46; bx += 7) {
      ctx.beginPath();
      ctx.moveTo(x + bx, y - 12);
      ctx.lineTo(x + bx + (bx < 32 ? -3 : 3), y + 56);
      ctx.stroke();
    }

    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x + 12, y + 52);
    ctx.bezierCurveTo(x + 48, y + 36, x + 16, y + 18, x + 48, y - 6);
    ctx.stroke();

    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x + 21, y - 14);
    ctx.lineTo(x + 21, y + 56);
    ctx.moveTo(x + 43, y - 14);
    ctx.lineTo(x + 43, y + 56);
    ctx.stroke();

    for (let ry = y - 8; ry <= y + 50; ry += 10) {
      ctx.fillStyle = '#78350f';
      ctx.fillRect(x + 19, ry, 26, 5);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(x + 20, ry, 24, 2);
    }

    const bob = Math.sin(now * 0.006) * 3;
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('▲ CLIMB TREE', x + 32, y + 62 + bob);
    ctx.restore();
  }

  function drawCanopyTreehouseFloorTile(x, y, r, c, theme, now) {
    drawTileFloorGrass(x, y, theme, now);

    ctx.fillStyle = 'rgba(2, 6, 4, 0.58)';
    ctx.fillRect(x, y + 14, TILE_SIZE, TILE_SIZE - 8);

    const elevY = y - 36;
    ctx.fillStyle = '#2e1a0f';
    ctx.fillRect(x + 6, elevY + TILE_SIZE - 6, 10, 42);
    ctx.fillRect(x + TILE_SIZE - 16, elevY + TILE_SIZE - 6, 10, 42);

    ctx.fillStyle = '#14532d';
    ctx.beginPath();
    ctx.arc(x + 8, elevY + 8, 16, 0, Math.PI * 2);
    ctx.arc(x + 56, elevY + 8, 16, 0, Math.PI * 2);
    ctx.arc(x + 32, elevY + 4, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(x + 10, elevY + 6, 10, 0, Math.PI * 2);
    ctx.arc(x + 54, elevY + 6, 10, 0, Math.PI * 2);
    ctx.fill();

    const deckGrad = ctx.createLinearGradient(x, elevY, x, elevY + TILE_SIZE);
    deckGrad.addColorStop(0, '#78350f');
    deckGrad.addColorStop(0.5, '#92400e');
    deckGrad.addColorStop(1, '#451a03');
    ctx.fillStyle = deckGrad;
    ctx.fillRect(x + 2, elevY + 2, TILE_SIZE - 4, TILE_SIZE - 4);

    ctx.strokeStyle = '#271206';
    ctx.lineWidth = 1.5;
    for (let py = 10; py < TILE_SIZE - 4; py += 12) {
      ctx.beginPath();
      ctx.moveTo(x + 3, elevY + py);
      ctx.lineTo(x + TILE_SIZE - 3, elevY + py);
      ctx.stroke();
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(x + 6, elevY + py - 4, 2, 2);
      ctx.fillRect(x + TILE_SIZE - 8, elevY + py - 4, 2, 2);
    }

    const isTopEdge = (r > 0 && state.map[r - 1][c] !== T_TREEHOUSE_FLOOR && state.map[r - 1][c] !== T_TREEHOUSE_NPC);
    const isLeftEdge = (c > 0 && state.map[r][c - 1] !== T_TREEHOUSE_FLOOR && state.map[r][c - 1] !== T_TREEHOUSE_NPC);
    const isRightEdge = (c < DUNGEON_COLS - 1 && state.map[r][c + 1] !== T_TREEHOUSE_FLOOR && state.map[r][c + 1] !== T_TREEHOUSE_NPC);

    ctx.fillStyle = '#b45309';
    if (isTopEdge) {
      ctx.fillRect(x + 2, elevY - 6, TILE_SIZE - 4, 5);
      const glow = 0.7 + Math.sin(now * 0.005 + c) * 0.25;
      ctx.fillStyle = `rgba(253, 224, 71, ${glow})`;
      ctx.beginPath();
      ctx.arc(x + 32, elevY - 4, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (isLeftEdge) {
      ctx.fillStyle = '#b45309';
      ctx.fillRect(x + 1, elevY, 5, TILE_SIZE);
    }
    if (isRightEdge) {
      ctx.fillStyle = '#b45309';
      ctx.fillRect(x + TILE_SIZE - 6, elevY, 5, TILE_SIZE);
    }
  }

  function drawTreehouseMagicCreature(being, now) {
    if (!being || being.interacted) return;
    ctx.save();
    const bob = Math.sin(now * 0.005) * 4;
    const drawY = being.y - being.z + bob;
    ctx.translate(being.x, drawY);

    const auraGrad = ctx.createRadialGradient(0, 4, 2, 0, 4, 28);
    auraGrad.addColorStop(0, being.glowColor || '#fde047');
    auraGrad.addColorStop(0.55, being.color || '#38bdf8');
    auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(0, 4, 28, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#451a03';
    ctx.fillRect(-18, -28, 36, 26);
    ctx.fillStyle = '#15803d';
    ctx.beginPath();
    ctx.moveTo(-24, -26);
    ctx.lineTo(0, -44);
    ctx.lineTo(24, -26);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#090d16';
    ctx.beginPath();
    ctx.ellipse(0, -4, 14, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = being.color || '#38bdf8';
    ctx.beginPath();
    ctx.ellipse(0, -4, 12, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    const wingFlap = Math.sin(now * 0.01) * 4;
    ctx.fillStyle = being.glowColor || '#fde047';
    ctx.beginPath();
    ctx.ellipse(-14, -6 + wingFlap * 0.4, 8, 12, -0.35, 0, Math.PI * 2);
    ctx.ellipse(14, -6 + wingFlap * 0.4, 8, 12, 0.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-6, -10, 4, 4);
    ctx.fillRect(2, -10, 4, 4);
    ctx.fillStyle = '#fde047';
    ctx.fillRect(-5, -9, 2, 2);
    ctx.fillRect(3, -9, 2, 2);

    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(12, -22, 3, 28);
    ctx.fillStyle = '#67e8f9';
    ctx.beginPath();
    ctx.arc(13.5, -24, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000000';
    ctx.fillText('✨ ' + being.name, 1, -47);
    ctx.fillStyle = '#fde047';
    ctx.fillText('✨ ' + being.name, 0, -48);
    ctx.restore();
  }

  function drawScrapMetalTrashHutTile(x, y, theme, now) {
    drawTileFloorTrash(x, y, theme, now);
    const hut = state.trashHuts.find(h => Math.abs(h.x - (x + 32)) < 16 && Math.abs(h.y - (y + 32)) < 16);
    const shudderX = (hut && hut.shudderAnim > 0) ? Math.sin(now * 0.08) * 3.5 : 0;

    ctx.save();
    ctx.translate(x + 32 + shudderX, y + 36);

    ctx.fillStyle = 'rgba(2, 5, 10, 0.72)';
    ctx.beginPath();
    ctx.ellipse(0, 12, 32, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#334155';
    ctx.fillRect(-28, 4, 14, 10);
    ctx.fillStyle = '#7c2d12';
    ctx.fillRect(16, 2, 12, 11);

    const wallGrad = ctx.createLinearGradient(-24, -32, 24, 12);
    wallGrad.addColorStop(0, '#475569');
    wallGrad.addColorStop(0.5, '#334155');
    wallGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(-24, -26, 48, 38);

    ctx.fillStyle = '#9a3412';
    ctx.fillRect(-22, -20, 14, 12);
    ctx.fillRect(8, -10, 14, 14);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.strokeRect(-24, -26, 48, 38);

    ctx.fillStyle = '#05070b';
    ctx.fillRect(-9, -12, 18, 24);

    if (!hut || !hut.triggered) {
      const blink = Math.sin(now * 0.005) > -0.8;
      if (blink) {
        ctx.fillStyle = '#ff1744';
        ctx.fillRect(-5, -4, 3, 3);
        ctx.fillRect(2, -4, 3, 3);
      }
      ctx.fillStyle = '#64748b';
      ctx.fillRect(-11, -12, 5, 23);
    } else {
      ctx.fillStyle = '#475569';
      ctx.fillRect(-12, 12, 24, 7);
    }

    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(-30, -24);
    ctx.lineTo(0, -42);
    ctx.lineTo(30, -22);
    ctx.lineTo(26, -16);
    ctx.lineTo(-28, -18);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.6;
    for (let rx = -22; rx <= 22; rx += 6) {
      ctx.beginPath();
      ctx.moveTo(rx, -34 + Math.abs(rx) * 0.35);
      ctx.lineTo(rx - 2, -18);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(194, 65, 12, 0.72)';
    ctx.fillRect(-16, -28, 12, 6);
    ctx.fillRect(6, -26, 10, 5);

    ctx.fillStyle = '#334155';
    ctx.fillRect(10, -46, 6, 14);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(9, -47, 8, 3);

    ctx.restore();
  }

  function drawBossBoobyTrap(trap, now) {
    if (!trap || !inView(trap.x, trap.y, 60)) return;
    ctx.save();
    ctx.translate(trap.x, trap.y);

    if (trap.type === 'sawblade_jaw') {
      ctx.fillStyle = '#090d16';
      ctx.fillRect(trap.baseX - trap.x - 72, -3, 144, 6);
      ctx.rotate(now * 0.018);
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      const teeth = 10;
      for (let i = 0; i < teeth * 2; i++) {
        const r = (i % 2 === 0) ? 22 : 13;
        const a = (i / (teeth * 2)) * Math.PI * 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (trap.type === 'venom_tripwire') {
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.65)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-24, -18);
      ctx.lineTo(24, 18);
      ctx.moveTo(-24, 18);
      ctx.lineTo(24, -18);
      ctx.stroke();

      ctx.fillStyle = trap.active ? '#a3e635' : '#3f6212';
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1a2e05';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.ellipse(0, 0, 20, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = trap.active ? '#fb923c' : '#0f172a';
      ctx.beginPath();
      ctx.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      if (trap.active) {
        const jetH = 48 + Math.sin(now * 0.03) * 12;
        const jetGrad = ctx.createLinearGradient(0, 0, 0, -jetH);
        jetGrad.addColorStop(0, trap.type === 'steam_geyser' ? '#ff6d00' : '#d500f9');
        jetGrad.addColorStop(0.5, trap.type === 'steam_geyser' ? '#fde047' : '#f43f5e');
        jetGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = jetGrad;
        ctx.beginPath();
        ctx.moveTo(-12, 0);
        ctx.lineTo(-18, -jetH);
        ctx.lineTo(18, -jetH);
        ctx.lineTo(12, 0);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawBossBattlegroundVine(vine, now) {
    if (!vine || !inView(vine.x, vine.y, 50)) return;
    ctx.save();
    ctx.translate(vine.x, vine.y);

    // Dark soil crack beneath the writhing vine cluster
    ctx.fillStyle = 'rgba(5, 12, 8, 0.78)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 24, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // 4 writhing thorny tendrils that lash upward!
    const lashBoost = (vine.lashingAnim > 0) ? 14 : 0;
    for (let t = 0; t < 4; t++) {
      const ang = (t / 4) * Math.PI * 2 + (vine.phase || 0);
      const sway = Math.sin(now * 0.006 + t * 1.5) * 8;
      const vx = Math.cos(ang) * 14;
      const vy = Math.sin(ang) * 7;

      ctx.strokeStyle = (t % 2 === 0) ? '#15803d' : '#22c55e';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(vx * 0.3, vy * 0.3);
      ctx.quadraticCurveTo(vx + sway, vy - 12 - lashBoost * 0.5, vx * 1.2 - sway * 0.5, vy - 22 - lashBoost);
      ctx.stroke();

      // Crimson thorn barbs
      ctx.fillStyle = '#f43f5e';
      ctx.fillRect(vx + sway * 0.4 - 1.5, vy - 14 - lashBoost * 0.5, 3, 3);
    }
    ctx.restore();
  }

  function drawBossGroundCaveBurrow(cave, now) {
    if (!cave || !inView(cave.x, cave.y, 60)) return;
    ctx.save();
    ctx.translate(cave.x, cave.y);

    // Jagged subterranean stone rim around the ground cave burrow
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.ellipse(0, 0, 28, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // Deep pitch-black ground cave mouth
    ctx.fillStyle = '#030509';
    ctx.beginPath();
    ctx.ellipse(0, 2, 22, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Webbing & roots across the cave rim
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.38)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-18, -4); ctx.lineTo(14, 6);
    ctx.moveTo(-12, 7);  ctx.lineTo(16, -3);
    ctx.stroke();

    // Glowing beast eyes peering from inside the ground cave!
    const blink = Math.sin(now * 0.006 + cave.x) > -0.6;
    if (blink || cave.spawnFlash > 0) {
      ctx.fillStyle = cave.spawnFlash > 0 ? '#a3e635' : '#ff1744';
      ctx.fillRect(-7, -1, 3, 3);
      ctx.fillRect(-2, -1, 3, 3);
      ctx.fillRect(4, 1, 3, 3);
      ctx.fillRect(9, 1, 3, 3);
    }
    ctx.restore();
  }

  // Override drawEnemySprite so ceiling swing-in spiders/beasts render their ceiling web-thread/chain and drop elevation!
  const _origDrawEnemySprite = drawEnemySprite;
  drawEnemySprite = function (e, now) {
    if (!e) return;
    if (e.ceilingDropZ && e.ceilingDropZ > 0) {
      ctx.save();
      // Ground landing target shadow
      ctx.fillStyle = 'rgba(2, 6, 12, 0.65)';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y - (e.z || 0) + 12, 16, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // Silk web-line / chain descending from the cavern ceiling!
      const dropY = e.y - (e.z || 0) - e.ceilingDropZ;
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.9)';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(e.x, dropY - 220);
      ctx.lineTo(e.x, dropY - 6);
      ctx.stroke();
      ctx.restore();

      const savedZ = e.z || 0;
      e.z = savedZ + e.ceilingDropZ;
      _origDrawEnemySprite(e, now);
      e.z = savedZ;
      return;
    }
    _origDrawEnemySprite(e, now);
  };

  // -------------------------------------------------------------
  // 4. PLAYER HERO STATUS EFFECT OVERLAYS:
  //    - Glowing Purple Bubbles floating over head (Snake Poison)
  //    - Small Swirling Lines around head to imply dizziness (Eagle Sonic Boom)
  //    - Visible Spider Web wrapped around body (Spider Web Spray)
  //    - Visible Thorny Entangler Vines wrapped around legs/waist (Boss Arena Vines)
  // -------------------------------------------------------------
  const _origDrawPlayerHero = drawPlayerHero;
  drawPlayerHero = function (p, now) {
    _origDrawPlayerHero(p, now);
    if (!p || !p.status) return;

    const st = p.status;
    if (st.poisonTimer <= 0 && st.disorientTimer <= 0 && st.webTimer <= 0 && (st.vineTimer || 0) <= 0) return;

    const bob = (p.walkAnim > 0) ? Math.abs(Math.sin(p.walkAnim)) * 3.5 : Math.sin(now * 0.004) * 1.0;
    const wadeSink = p.inLiquid ? 6 : 0;

    ctx.save();
    ctx.translate(p.x, p.y - bob - (p.z || 0) + wadeSink);

    // 0. BOSS BATTLEGROUND ENTANGLER VINES: Coiling thorny vines wrapped around the hero's legs & waist!
    if ((st.vineTimer || 0) > 0) {
      ctx.save();
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 3.0;
      for (let vy = -2; vy <= 12; vy += 5) {
        ctx.beginPath();
        ctx.moveTo(-15, vy);
        ctx.quadraticCurveTo(0, vy + 5, 15, vy - 1);
        ctx.stroke();
      }
      ctx.fillStyle = '#f43f5e';
      ctx.fillRect(-10, 2, 3, 3);
      ctx.fillRect(7, 4, 3, 3);
      ctx.fillRect(-2, 8, 3, 3);
      ctx.restore();
    }

    // 1. SPIDER WEB SPRAY EFFECT: Visible Spider Web wrapped around the main character's body!
    if (st.webTimer > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(241, 245, 249, 0.92)';
      ctx.lineWidth = 1.8;
      for (let wy = -12; wy <= 8; wy += 6) {
        ctx.beginPath();
        ctx.moveTo(-15, wy);
        ctx.quadraticCurveTo(0, wy + 4, 15, wy - 1);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-14, -12);
      ctx.lineTo(14, 8);
      ctx.moveTo(14, -12);
      ctx.lineTo(-14, 8);
      ctx.moveTo(-10, -15);
      ctx.lineTo(10, 10);
      ctx.moveTo(0, -16);
      ctx.lineTo(0, 11);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-13, -6, 3, 3);
      ctx.fillRect(10, -4, 3, 3);
      ctx.fillRect(-2, 0, 3, 3);
      ctx.restore();
    }

    // 2. SNAKE POISON EFFECT: Glowing Purple Bubbles floating over top of the main character's head!
    if (st.poisonTimer > 0) {
      ctx.save();
      for (let b = 0; b < 5; b++) {
        const cycle = ((now * 0.0028 + b * 0.22) % 1.0);
        const bx = Math.sin(now * 0.005 + b * 1.7) * 13;
        const by = -28 - cycle * 24;
        const rad = (2.8 + (b % 2) * 1.4) * (1 - cycle * 0.35);

        ctx.fillStyle = 'rgba(217, 70, 239, 0.45)';
        ctx.beginPath();
        ctx.arc(bx, by, rad + 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#d946ef';
        ctx.beginPath();
        ctx.arc(bx, by, rad, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fae8ff';
        ctx.fillRect(bx - rad * 0.4, by - rad * 0.4, 1.8, 1.8);
      }
      ctx.restore();
    }

    // 3. EAGLE SONIC BOOM DISORIENTATION: Small Swirling Lines around the character's head to imply dizziness!
    if (st.disorientTimer > 0) {
      ctx.save();
      const headY = -30;
      const baseSpin = now * 0.0085;

      for (let ring = 0; ring < 2; ring++) {
        const aStart = baseSpin + ring * Math.PI;
        ctx.strokeStyle = ring === 0 ? '#38bdf8' : '#fde047';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        for (let step = 0; step <= 14; step++) {
          const t = step / 14;
          const ang = aStart + t * Math.PI * 1.35;
          const sx = Math.cos(ang) * (16 - ring * 3);
          const sy = headY + Math.sin(ang) * 5.5 - ring * 3;
          if (step === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();

        const tipAng = aStart + Math.PI * 1.35;
        const tx = Math.cos(tipAng) * (16 - ring * 3);
        const ty = headY + Math.sin(tipAng) * 5.5 - ring * 3;
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(tx - 2, ty - 2, 4, 4);
      }
      ctx.restore();
    }

    ctx.restore();
  };

  // -------------------------------------------------------------
  // 5. MASSIVE, DETAILED, INTIMIDATING BOSS SPRITES WITH WEAPONS & POWERS
  // -------------------------------------------------------------
  drawBossSprite = function (b, now) {
    const pulse = Math.sin(now * 0.006) * 4;
    const slamOffset = (b.attackAnim > 0) ? Math.sin(b.attackAnim * Math.PI * 4) * 10 : 0;

    ctx.save();
    ctx.translate(b.x, b.y - (b.z || 0));

    ctx.fillStyle = 'rgba(2, 4, 8, 0.82)';
    ctx.beginPath();
    ctx.ellipse(0, 34, 68, 26, 0, 0, Math.PI * 2);
    ctx.fill();

    const auraGrad = ctx.createRadialGradient(0, 10, 12, 0, 10, 76);
    auraGrad.addColorStop(0, b.glowColor || '#ff6d00');
    auraGrad.addColorStop(0.5, 'rgba(220, 38, 38, 0.22)');
    auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(0, 10, 76 + pulse, 0, Math.PI * 2);
    ctx.fill();

    if (b.id === 'steam_colossus') {
      const stride = Math.sin(b.walkAnim) * 5;
      ctx.fillStyle = '#090d16';
      ctx.fillRect(-36, 8 + stride, 22, 26);
      ctx.fillRect(14, 8 - stride, 22, 26);
      ctx.fillStyle = '#475569';
      ctx.fillRect(-33, 10 + stride, 16, 22);
      ctx.fillRect(17, 10 - stride, 16, 22);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(-35, 24 + stride, 20, 6);
      ctx.fillRect(15, 24 - stride, 20, 6);

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-34, -64, 14, 34);
      ctx.fillRect(20, -64, 14, 34);
      ctx.fillStyle = '#ff6d00';
      ctx.fillRect(-32, -66, 10, 5);
      ctx.fillRect(22, -66, 10, 5);

      const hullGrad = ctx.createLinearGradient(-44, -42, 44, 16);
      hullGrad.addColorStop(0, '#64748b');
      hullGrad.addColorStop(0.45, '#334155');
      hullGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = hullGrad;
      ctx.beginPath();
      ctx.moveTo(-46, -36);
      ctx.lineTo(46, -36);
      ctx.lineTo(36, 16);
      ctx.lineTo(-36, 16);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#b45309';
      ctx.beginPath();
      ctx.ellipse(-46, -28, 18, 14, -0.3, 0, Math.PI * 2);
      ctx.ellipse(46, -28, 18, 14, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(-58, -34); ctx.lineTo(-68, -46); ctx.lineTo(-48, -40);
      ctx.moveTo(58, -34);  ctx.lineTo(68, -46);  ctx.lineTo(48, -40);
      ctx.fill();

      ctx.fillStyle = '#090d16';
      ctx.fillRect(-22, -22, 44, 26);
      const coreGlow = ctx.createRadialGradient(0, -9, 2, 0, -9, 22);
      coreGlow.addColorStop(0, '#fef08a');
      coreGlow.addColorStop(0.5, '#ff6d00');
      coreGlow.addColorStop(1, '#7c2d12');
      ctx.fillStyle = coreGlow;
      ctx.fillRect(-19, -19, 38, 20);
      ctx.fillStyle = '#1e293b';
      for (let gx = -14; gx <= 14; gx += 7) {
        ctx.fillRect(gx - 1.5, -20, 3, 22);
      }

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-20, -56, 40, 24);
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2;
      ctx.strokeRect(-20, -56, 40, 24);
      ctx.fillStyle = '#ff3d00';
      ctx.fillRect(-14, -46, 28, 6);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(-10, -45, 8, 4);
      ctx.fillRect(2, -45, 8, 4);

      ctx.save();
      ctx.translate(48, -14 + slamOffset);
      ctx.rotate(b.attackAnim > 0 ? 0.55 : -0.2);
      ctx.fillStyle = '#451a03';
      ctx.fillRect(-4, -48, 8, 76);
      ctx.fillStyle = '#334155';
      ctx.fillRect(-22, -64, 44, 24);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.strokeRect(-22, -64, 44, 24);
      ctx.fillStyle = '#ff6d00';
      ctx.fillRect(-16, -58, 32, 12);
      ctx.restore();

    } else if (b.id === 'brood_matriarch') {
      for (let side = -1; side <= 1; side += 2) {
        for (let l = 0; l < 4; l++) {
          const legSwing = Math.sin(b.walkAnim * 1.4 + l * 1.2 + side) * 6;
          const hipX = side * 26;
          const hipY = -12 + l * 8;
          const kneeX = side * (56 + l * 5);
          const kneeY = -28 + l * 10 + legSwing;
          const footX = side * (72 - l * 3);
          const footY = 12 + l * 6 - legSwing * 0.5;

          ctx.strokeStyle = '#090d16';
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.moveTo(hipX, hipY);
          ctx.lineTo(kneeX, kneeY);
          ctx.lineTo(footX, footY);
          ctx.stroke();

          ctx.strokeStyle = (l % 2 === 0) ? '#311b92' : '#4a148c';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(hipX, hipY);
          ctx.lineTo(kneeX, kneeY);
          ctx.lineTo(footX, footY);
          ctx.stroke();

          ctx.fillStyle = '#76ff03';
          ctx.beginPath();
          ctx.arc(footX, footY, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const sacScale = 1 + Math.sin(now * 0.007) * 0.06;
      ctx.save();
      ctx.scale(sacScale, sacScale);
      const abGrad = ctx.createRadialGradient(0, -34, 6, 0, -34, 42);
      abGrad.addColorStop(0, '#4a148c');
      abGrad.addColorStop(0.6, '#1a0933');
      abGrad.addColorStop(1, '#090d16');
      ctx.fillStyle = abGrad;
      ctx.beginPath();
      ctx.ellipse(0, -34, 40, 30, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#76ff03';
      ctx.beginPath();
      ctx.arc(-16, -38, 6, 0, Math.PI * 2);
      ctx.arc(16, -38, 6, 0, Math.PI * 2);
      ctx.arc(0, -46, 8, 0, Math.PI * 2);
      ctx.arc(-10, -24, 5, 0, Math.PI * 2);
      ctx.arc(10, -24, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#1e1b4b';
      ctx.beginPath();
      ctx.ellipse(0, -4, 28, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#76ff03';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ff1744';
      const eyes = [[-12, -8, 4], [-5, -10, 5], [5, -10, 5], [12, -8, 4], [-8, -15, 3], [8, -15, 3]];
      eyes.forEach(([ex, ey, er]) => {
        ctx.beginPath();
        ctx.arc(ex, ey, er, 0, Math.PI * 2);
        ctx.fill();
      });

      const jawPinch = Math.sin(now * 0.01) * 0.18;
      for (let side = -1; side <= 1; side += 2) {
        ctx.save();
        ctx.translate(side * 16, 8);
        ctx.rotate(side * (-0.25 + jawPinch));
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(side * 14, 18);
        ctx.lineTo(0, 26);
        ctx.lineTo(-side * 4, 8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#76ff03';
        ctx.beginPath();
        ctx.arc(0, 25, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(38, -8 + slamOffset);
      ctx.fillStyle = '#3f6212';
      ctx.fillRect(-3, -44, 6, 62);
      ctx.fillStyle = '#76ff03';
      ctx.beginPath();
      ctx.arc(0, -48, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

    } else {
      ctx.save();
      ctx.rotate(now * 0.0018);
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(0, -18, 62, 0, Math.PI * 2);
      ctx.stroke();
      for (let r = 0; r < 8; r++) {
        const ra = (r / 8) * Math.PI * 2;
        ctx.fillStyle = (r % 2 === 0) ? '#ff1744' : '#d500f9';
        ctx.beginPath();
        ctx.arc(Math.cos(ra) * 62, Math.sin(ra) * 62, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      const wingBeat = Math.sin(now * 0.006) * 8;
      for (let side = -1; side <= 1; side += 2) {
        ctx.fillStyle = '#180526';
        ctx.strokeStyle = '#d500f9';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(side * 22, -26);
        ctx.lineTo(side * 78, -62 + wingBeat);
        ctx.lineTo(side * 68, -14 + wingBeat * 0.5);
        ctx.lineTo(side * 44, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      for (let seg = 6; seg >= 0; seg--) {
        const ang = (now * 0.003) + seg * 0.65;
        const sx = Math.sin(ang) * (seg * 5.5);
        const sy = -seg * 6 + 14;
        const rad = 34 - seg * 2.2;

        ctx.fillStyle = (seg % 2 === 0) ? '#0f172a' : '#311042';
        ctx.beginPath();
        ctx.arc(sx, sy, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = (seg % 2 === 0) ? '#f59e0b' : '#ff1744';
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }

      ctx.save();
      ctx.translate(0, -34 + slamOffset * 0.5);
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.moveTo(-18, -14); ctx.lineTo(-36, -42); ctx.lineTo(-8, -22);
      ctx.moveTo(18, -14);  ctx.lineTo(36, -42);  ctx.lineTo(8, -22);
      ctx.fill();

      ctx.fillStyle = '#090d16';
      ctx.beginPath();
      ctx.ellipse(0, 0, 26, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ff1744';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = '#ff1744';
      ctx.fillRect(-16, -8, 8, 5);
      ctx.fillRect(8, -8, 8, 5);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(-12, -16, 6, 4);
      ctx.fillRect(6, -16, 6, 4);

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-12, 12); ctx.lineTo(-8, 22); ctx.lineTo(-4, 12);
      ctx.moveTo(4, 12);   ctx.lineTo(8, 22);  ctx.lineTo(12, 12);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(52, -18 + slamOffset);
      ctx.rotate(b.attackAnim > 0 ? 0.65 : 0.15);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(-3, -58, 6, 116);
      ctx.fillStyle = '#ff1744';
      ctx.beginPath();
      ctx.moveTo(0, -64);
      ctx.lineTo(24, -36);
      ctx.lineTo(3, -18);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 64);
      ctx.lineTo(-24, 36);
      ctx.lineTo(-3, 18);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  };

  // -------------------------------------------------------------
  // 6. RENDER PIPELINE INTEGRATION (NEW TILES, BOOBY TRAPS, VINES, GROUND CAVES & SONIC BOOM WAVES)
  // -------------------------------------------------------------
  render = function () {
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const parent = canvas.parentElement;
    const clientW = canvas.clientWidth || (parent && parent.clientWidth) || 0;
    const clientH = canvas.clientHeight || (parent && parent.clientHeight) || 0;
    if (
      canvas.width <= 0 ||
      canvas.height <= 0 ||
      (clientW > 0 && clientH > 0 && (Math.abs(canvas.width - Math.floor(clientW * dpr)) > 6 || Math.abs(canvas.height - Math.floor(clientH * dpr)) > 6))
    ) {
      resizeCanvas();
    }
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    if (w <= 0 || h <= 0) return;

    if (typeof window.ensureValidPlayerAndCameraPosition === 'function') {
      window.ensureValidPlayerAndCameraPosition();
    }

    const now = performance.now();
    const theme = getEffectiveFloorTheme(state.currentFloor || 1, state.cycle || 1);

    const camX = Number.isFinite(state.camera.x) ? state.camera.x : (state.player ? state.player.x : TILE_SIZE * 10);
    const camY = Number.isFinite(state.camera.y) ? state.camera.y : (state.player ? state.player.y : TILE_SIZE * 10);
    const halfW = w * 0.5;
    const halfH = h * 0.5;
    viewMinX = camX - halfW;
    viewMaxX = camX + halfW;
    viewMinY = camY - halfH;
    viewMaxY = camY + halfH;

    if (typeof ctx.setTransform === 'function') {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#0d131a';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;

    let shakeX = 0, shakeY = 0;
    if (state.screenShake > 0) {
      shakeX = (Math.random() - 0.5) * state.screenShake;
      shakeY = (Math.random() - 0.5) * state.screenShake;
    }

    ctx.save();
    ctx.translate(halfW + shakeX, halfH + shakeY);
    ctx.translate(-camX, -camY);

    drawAbyssBackdrop(theme, camX, camY, w, h);

    const startCol = Math.max(0, Math.floor((camX - halfW) / TILE_SIZE) - 1);
    const endCol = Math.min(DUNGEON_COLS - 1, Math.ceil((camX + halfW) / TILE_SIZE) + 1);
    const startRow = Math.max(0, Math.floor((camY - halfH) / TILE_SIZE) - 1);
    const endRow = Math.min(DUNGEON_ROWS - 1, Math.ceil((camY + halfH) / TILE_SIZE) + 1);

    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const t = state.map[r][c];
        if (t === T_ABYSS) continue;
        const tx = c * TILE_SIZE;
        const ty = r * TILE_SIZE;

        if (t === T_FLOOR_COBBLE) {
          drawTileFloorCobble(tx, ty, theme, now);
        } else if (t === T_FLOOR_GRASS) {
          drawTileFloorGrass(tx, ty, theme, now);
        } else if (t === T_FLOOR_MUD) {
          drawTileFloorMud(tx, ty, theme, now);
        } else if (t === T_FLOOR_SAND) {
          drawTileFloorSand(tx, ty, theme);
        } else if (t === T_FLOOR_ROCKS) {
          drawTileFloorRocks(tx, ty, theme);
        } else if (t === T_FLOOR_TRASH) {
          drawTileFloorTrash(tx, ty, theme, now);
        } else if (t === T_FLOOR_SLUDGE) {
          drawTileFloorSludge(tx, ty, theme, now);
        } else if (t === T_FLOOR_PUDDLE) {
          drawTileFloorPuddle(tx, ty, theme, now);
        } else if (t === T_BRIDGE_CHAIN) {
          drawChainBridgeTile(tx, ty);
        } else if (t === T_FLOOR_HIGH) {
          drawTileElevatedPlateau(tx, ty, r, c, theme);
        } else if (t === T_STAIRS_RAMP) {
          drawTileSteppedRamp(tx, ty, theme);
        } else if (t === T_TREE_CLIMB) {
          drawClimbableTreeTrunkTile(tx, ty, theme, now);
        } else if (t === T_TREEHOUSE_FLOOR || t === T_TREEHOUSE_NPC) {
          drawCanopyTreehouseFloorTile(tx, ty, r, c, theme, now);
        } else if (t === T_TRASH_HUT) {
          drawScrapMetalTrashHutTile(tx, ty, theme, now);
        } else if (t === T_DOOR_EXIT) {
          drawStairsDown(tx, ty, theme, now);
        } else if (t === T_DOOR_PREV) {
          drawStairsUp(tx, ty, theme, now);
        } else if (t === T_CHEST_ALCOVE) {
          drawTileFloorCobble(tx, ty, theme, now);
          drawLootChest(tx + 16, ty + 16, now);
        } else if (t === T_FORGE_ANVIL) {
          drawTileFloorCobble(tx, ty, theme, now);
          drawForgeAnvil(tx + 32, ty + 32, now);
        } else if (t === T_LORE_OBELISK) {
          drawTileFloorCobble(tx, ty, theme, now);
          drawLoreObelisk(tx + 32, ty + 32, theme, now);
        } else if (t === T_STARTER_SWORD) {
          drawTileFloorCobble(tx, ty, theme, now);
          drawStarterSwordPedestal(tx + 32, ty + 32, now);
        }

        if (t >= T_FLOOR_COBBLE && t !== T_WALL_SECRET) {
          drawFloorAmbientOcclusion(r, c, tx, ty);
        }
      }
    }

    drawWaterSurfaceReflections(now, theme, inView);
    drawWayfinderRuneTrail(now, inView);
    drawRoomSavePointSigils(now, inView);

    // Boss Arena Ground Cave Burrows, Writhing Entangler Vines & Booby Traps
    if (state.bossCaves) {
      state.bossCaves.forEach(cave => drawBossGroundCaveBurrow(cave, now));
    }
    if (state.bossVines) {
      state.bossVines.forEach(vine => drawBossBattlegroundVine(vine, now));
    }
    state.bossTraps.forEach(trap => {
      drawBossBoobyTrap(trap, now);
    });

    state.waterRipples.forEach(rp => {
      if (!inView(rp.x, rp.y, 40)) return;
      ctx.save();
      ctx.strokeStyle = rp.color;
      ctx.globalAlpha = Math.max(0, rp.alpha);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(rp.x, rp.y, rp.radius, rp.radius * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });

    state.bloodDecals.forEach(b => {
      if (!inView(b.x, b.y, 24)) return;
      ctx.fillStyle = 'rgba(153, 27, 27, 0.45)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
    });

    state.spikes.forEach(sp => {
      if (!inView(sp.x + sp.w * 0.5, sp.y + sp.h * 0.5, 110)) return;
      drawSpikeGrateBase(sp);
    });

    const renderList = [];

    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const t = state.map[r][c];
        if (isWallTile(t)) {
          renderList.push({
            type: 'wall',
            t,
            x: c * TILE_SIZE,
            y: r * TILE_SIZE,
            sortY: r * TILE_SIZE + TILE_SIZE * 0.8,
          });
        }
      }
    }

    state.props.forEach(pr => {
      if (pr.type === 'wall_tree') {
        if (!inView(pr.x, pr.y, 120)) return;
        renderList.push({ type: 'wall_tree', prop: pr, sortY: pr.y + 4 });
      } else if (pr.type === 'fern_bush') {
        if (!inView(pr.x, pr.y, 60)) return;
        renderList.push({ type: 'fern_bush', prop: pr, sortY: pr.y });
      }
    });

    state.spikes.forEach(sp => {
      if (sp.ext > 0.05 && inView(sp.x + sp.w * 0.5, sp.y + sp.h * 0.5, 110)) {
        renderList.push({ type: 'spike_blades', sp: sp, sortY: sp.y + sp.h * 0.75 });
      }
    });

    state.treehouseBeings.forEach(being => {
      if (!being.interacted && inView(being.x, being.y, 100)) {
        renderList.push({ type: 'treehouse_npc', being, sortY: being.y + 10 });
      }
    });

    const hideHeroForRuins = !!(state.finaleCinematic && state.finaleCinematic.active && state.finaleCinematic.hidePlayersInWorld);
    if (!hideHeroForRuins) {
      renderList.push({ type: 'player', x: state.player.x, y: state.player.y, sortY: state.player.y + 16 });
      renderList.push({ type: 'minion', x: state.minion.x, y: state.minion.y, sortY: state.minion.y + 14 });
    }

    state.enemies.forEach(e => {
      if (!inView(e.x, e.y, 110)) return;
      renderList.push({ type: 'enemy', enemy: e, x: e.x, y: e.y, sortY: e.y + 16 });
    });

    if (state.boss && state.boss.hp > 0) {
      renderList.push({ type: 'boss', boss: state.boss, x: state.boss.x, y: state.boss.y, sortY: state.boss.y + 26 });
    }

    renderList.sort((a, b) => a.sortY - b.sortY);

    if (!hideHeroForRuins && (!state.finaleCinematic || !state.finaleCinematic.active || !state.finaleCinematic.isMountedCavalry)) {
      drawTetherChain(
        state.player.x,
        state.player.y + 6 - (state.player.z || 0),
        state.minion.x,
        state.minion.y + 6 - (state.minion.z || 0)
      );
    }

    renderList.forEach(item => {
      if (item.type === 'wall') {
        drawTileWall(item.t, item.x, item.y, theme, now);
      } else if (item.type === 'wall_tree') {
        drawWallClimbingTree(item.prop, now);
      } else if (item.type === 'fern_bush') {
        drawDungeonFernBush(item.prop, now);
      } else if (item.type === 'spike_blades') {
        drawVolumetricSpikeBlades(item.sp);
      } else if (item.type === 'treehouse_npc') {
        drawTreehouseMagicCreature(item.being, now);
      } else if (item.type === 'player') {
        if (state.finaleCinematic && state.finaleCinematic.active && state.finaleCinematic.act === 4) {
          drawAbyss2NextGenBadgerHero(state.player, now);
        } else {
          drawPlayerHero(state.player, now);
        }
      } else if (item.type === 'minion') {
        if (state.finaleCinematic && state.finaleCinematic.active && state.finaleCinematic.act === 4) {
          drawAbyss2NextGenQuillBeast(state.minion, now);
        } else {
          drawQuillCompanion(state.minion, now);
        }
      } else if (item.type === 'enemy') {
        if (state.finaleCinematic && state.finaleCinematic.active && state.finaleCinematic.act === 4 && item.enemy.abyss2Type) {
          drawAbyss2NextGenEnemy(item.enemy, now);
        } else {
          drawEnemySprite(item.enemy, now);
        }
      } else if (item.type === 'boss') {
        if (state.finaleCinematic && state.finaleCinematic.active && state.finaleCinematic.act === 4 && item.boss.id === 'malakor_chimera_king') {
          drawAbyss2ChimeraKingBoss(item.boss, now);
        } else {
          drawBossSprite(item.boss, now);
        }
      }
    });

    // World-Space Finale Destruction, Crushed Enemies, Falling Boulders, Blazing Fires, Ruined Boss Wrecks & Abyss 2 Mechanics
    if (state.finaleCinematic && state.finaleCinematic.active) {
      renderFinaleWorldSpaceEffects(camX, camY, w, h, now, theme);
    }

    // Expanding Eagle Sonic Boom Ripples across the room!
    state.sonicBoomWaves.forEach(sw => {
      if (!inView(sw.x, sw.y, sw.maxRadius + 30)) return;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.max(0, sw.alpha);
      ctx.strokeStyle = sw.color || '#38bdf8';
      ctx.lineWidth = 4.0;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, Math.max(2, sw.radius - 10), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });

    state.props.forEach(p => {
      if (p.layer === 1) {
        if (p.type === 'chain') {
          if (!inView(p.x, p.y + p.h * 0.5, 140)) return;
          drawVolumetricHangingChain(p, now);
        } else if (p.type === 'vine') {
          if (!inView(p.x, p.y + p.h * 0.5, 140)) return;
          drawSwingingCeilingVine(p, now);
        } else if (p.type === 'palm') {
          if (!inView(p.x + 70, p.y + 40, 160)) return;
          drawVolumetricPalmFrond(p, now);
        }
      }
      if (p.type === 'torch') {
        if (!inView(p.x, p.y, 160)) return;
        drawTorchWithVolumetricGlow(p.x, p.y, theme);
      }
    });

    state.godRays.forEach((gr, idx) => {
      if (!inView(gr.x, gr.y, 240)) return;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.translate(gr.x, gr.y);
      const pulse = 0.92 + Math.sin(now * 0.002 + idx * 1.3) * 0.08;

      const ceilY = -gr.h * 0.44;
      const ceilX = -gr.h * 0.14;
      const ceilDiffGrad = ctx.createRadialGradient(ceilX, ceilY, 6, ceilX, ceilY, gr.w * 1.15);
      ceilDiffGrad.addColorStop(0, 'rgba(205, 245, 175, 0.16)');
      ceilDiffGrad.addColorStop(0.45, 'rgba(130, 220, 120, 0.08)');
      ceilDiffGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = ceilDiffGrad;
      ctx.beginPath();
      ctx.ellipse(ceilX, ceilY, gr.w * 1.15 * pulse, 46 * pulse, -0.12, 0, Math.PI * 2);
      ctx.fill();

      const floorGrad = ctx.createRadialGradient(28, gr.h * 0.34, 4, 28, gr.h * 0.34, gr.w * 0.65);
      floorGrad.addColorStop(0, 'rgba(170, 240, 145, 0.13)');
      floorGrad.addColorStop(0.55, 'rgba(100, 200, 120, 0.05)');
      floorGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = floorGrad;
      ctx.beginPath();
      ctx.ellipse(28, gr.h * 0.34, gr.w * 0.65 * pulse, 22 * pulse, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.rotate(-0.32);

      const outerGrad = ctx.createLinearGradient(0, -gr.h / 2, 0, gr.h / 2);
      outerGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      outerGrad.addColorStop(0.18, 'rgba(200, 245, 170, 0.16)');
      outerGrad.addColorStop(0.45, 'rgba(140, 225, 120, 0.11)');
      outerGrad.addColorStop(0.78, 'rgba(95, 190, 105, 0.05)');
      outerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = outerGrad;
      ctx.beginPath();
      ctx.moveTo(-gr.w * 0.48, -gr.h / 2);
      ctx.lineTo(gr.w * 0.48, -gr.h / 2);
      ctx.lineTo(gr.w * 0.64, gr.h / 2);
      ctx.lineTo(-gr.w * 0.64, gr.h / 2);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    });

    state.fireflies.forEach(ff => {
      if (!inView(ff.x, ff.y, 40)) return;
      const fx = ff.x + Math.sin(now * 0.002 + ff.phase) * 18;
      const fy = ff.y + Math.cos(now * 0.0025 + ff.phase) * 14;
      const pulse = 0.45 + Math.sin(now * 0.006 + ff.phase) * 0.25;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.max(0.12, pulse);
      ctx.fillStyle = ff.color || '#39ff14';
      ctx.beginPath();
      ctx.arc(fx, fy, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e2f8d5';
      ctx.fillRect(fx - 1, fy - 1, 2, 2);
      ctx.restore();
    });

    state.ceilingDrips.forEach(dr => {
      if (dr.delay <= 0 && inView(dr.targetX, dr.dropY, 40)) {
        ctx.save();
        if (dr.isAcid) ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = dr.isAcid ? 'rgba(105, 255, 50, 0.95)' : 'rgba(147, 197, 253, 0.78)';
        ctx.beginPath();
        ctx.ellipse(dr.targetX, dr.dropY, 2.4, 7.0, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });

    state.fogClouds.forEach(fg => {
      if (!inView(fg.x, fg.y, fg.rx + 20)) return;
      ctx.save();
      const grad = ctx.createRadialGradient(fg.x, fg.y, 10, fg.x, fg.y, fg.rx);
      grad.addColorStop(0, fg.color);
      grad.addColorStop(0.6, 'rgba(8, 12, 10, 0.14)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(fg.x, fg.y, fg.rx, fg.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    if (!state.finaleCinematic || !state.finaleCinematic.active) {
      drawPlayerWayfinderCompass(now);
    }

    state.warpEffects.forEach(wf => {
      if (!inView(wf.x, wf.y, wf.maxRadius + 20)) return;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.max(0, wf.alpha);
      ctx.strokeStyle = wf.color || '#39ff14';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(wf.x, wf.y, wf.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(wf.x, wf.y, wf.radius * 0.68, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });

    state.projectiles.forEach(pr => {
      if (!inView(pr.x, pr.y, 30)) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = pr.color;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, pr.radius + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, pr.radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    state.particles.forEach(pt => {
      if (!inView(pt.x, pt.y, 20)) return;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, Math.max(1, pt.radius * pt.life), 0, Math.PI * 2);
      ctx.fill();
    });

    state.floaterTexts.forEach(fl => {
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000000';
      ctx.fillText(fl.text, fl.x + 1.5, fl.y + 1.5);
      ctx.fillStyle = fl.color;
      ctx.fillText(fl.text, fl.x, fl.y);
    });

    if (state.redFlash > 0) {
      ctx.fillStyle = 'rgba(220, 38, 38, ' + (state.redFlash * 0.45) + ')';
      ctx.fillRect(camX - halfW, camY - halfH, w, h);
    }

    ctx.restore();
    drawArtificialAtmosphericOcclusion(w, h, now, theme);
    ctx.restore();

    if (state.finaleCinematic && state.finaleCinematic.active) {
      renderFinaleCinematicOverlay(w, h, now);
    }
  };

  // =============================================================
  // 7. IN-ENGINE CYCLE 13 GRAND FINALE CINEMATIC SEQUENCE &
  //    10-SECOND NEXT-GEN HD TRAILER: "OUROBOROS ABYSS 2 - BROKEN KINGDOM"
  //
  // - Act 1 (0.0s .. 12.0s): Real existing dungeon escape gauntlet! Badger Warrior & Quill Beast
  //                          sprint through the actual dungeon tilemap (cobblestone, mossy ivy walls,
  //                          fern bushes, wall trees, puddles, chain bridge) as walls crumble,
  //                          real enemies panic and are crushed by falling 3D masonry boulders,
  //                          and realistic multi-layered volumetric fires + smoke blaze around them.
  // - Act 2 (12.0s .. 17.0s): Blaring blinding WHITE flash -> fades into PITCH BLACKNESS ->
  //                          "Badger Warrior and Quill Beast will return."
  // - Act 3 (17.0s .. 47.0s): 30-Second Top-Down Camera Pan across 5 real destroyed dungeons
  //                          (Floors 1, 5, 8, 10, 13) with shattered walls, realistic fires,
  //                          fallen boss wrecks, and somber soft music (no text or voiceovers).
  // - Act 4 (47.0s .. 57.0s): 10-Second Next-Gen High-Definition Cinematic Trailer for
  //                          "Ouroboros Abyss 2 - Broken Kingdom":
  //                          * 0.0..3.5s: Macro zoomed-in shot of HD Snake Enemy slithering across
  //                            lush, plant-rich rocky dungeon floor toward a hole in a crumbled wall
  //                            with toppled pillars, volumetric light rays & floating particulates.
  //                          * 3.5..4.7s: Camera pans ceiling/sky-ward into light shafts as a muddy
  //                            armored boot stomps down to crush the snake -> fade to black.
  //                          * 4.7..6.6s: Re-illuminates on HD Badger Warrior crushing the squirming
  //                            snake under his boot as it lets out a final death growl and dies.
  //                          * 6.6..8.4s: Camera pans out further to reveal HD Quill Beast still
  //                            chained to Badger, dragging a battle-torn Wolf Beast in its jaws.
  //                          * 8.4..10.0s: Fade to black -> BLAST "Ouroboros Abyss 2 - Broken Kingdom"
  //                            title onto screen with in-game dungeon stone & vine theming.
  // - Act 5 (57.0s+):        Fade to black with "End" on screen and Press "A" to Start a New Game.
  // =============================================================
  state.finaleCinematic = {
    active: false,
    elapsed: 0,
    act: 0,
    subSceneIdx: -1,
    hidePlayersInWorld: false,
    isMountedCavalry: false,
    savedPlayerTuple: null,
    savedFloor: 1,
    savedCycle: 13,
    musicStepTimer: 0,
    musicNoteIdx: 0,
    wallCollapseTimer: 0,
    randomDebrisTimer: 0,
    chainFallTimer: 0,
    lastCollapsedCol: 7,
    worldFires: [],
    worldCracks: [],
    fallingBoulders: [],
    fallingChains: [],
    collapsedChains: [],
    collapsedHuts: [],
    flyingScrap: [],
    crushedWrecks: [],
    ruinPillars: [],
    bossWreck: null,
    panWaypoints: [],
    bootStompPlayed: false,
    snakeGrowlPlayed: false,
    titleBlastPlayed: false,
  };

  function setFinaleHudVisibility(visible) {
    const disp = visible ? '' : 'none';
    ['hud-overlay', 'hud-top-left-box', 'hud-dungeon-tag-bottom'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.style.display !== disp) {
        el.style.display = disp;
      }
    });
  }

  function playSomberPolyphonicChord(notes, dur = 2.4, vol = 0.055) {
    if (!audio || !audio.enabled || state.isPaused) return;
    try {
      if (!audio.ctx) audio.init();
      const actx = audio.ctx;
      if (!actx) return;
      const now = actx.currentTime;
      notes.forEach((freq, idx) => {
        const osc = actx.createOscillator();
        const filter = actx.createBiquadFilter();
        const gain = actx.createGain();
        osc.type = (idx === 0) ? 'sine' : (idx === notes.length - 1 ? 'sawtooth' : 'triangle');
        osc.frequency.setValueAtTime(freq, now);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(idx === notes.length - 1 ? 1150 : 900, now);

        const noteStart = now + idx * 0.14;
        const noteVol = (idx === 0) ? vol * 1.25 : (idx === notes.length - 1 ? vol * 0.65 : vol);
        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.linearRampToValueAtTime(noteVol, noteStart + 0.22);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + dur);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(actx.destination);
        if (audio.delaySend) gain.connect(audio.delaySend);
        osc.start(noteStart);
        osc.stop(noteStart + dur + 0.08);
      });
    } catch (e) {}
  }

  function playTrailerBadassSynthHit(freq, isHeavyDrop = false) {
    if (!audio || !audio.enabled || state.isPaused) return;
    try {
      if (!audio.ctx) audio.init();
      const actx = audio.ctx;
      if (!actx) return;
      const now = actx.currentTime;
      const osc1 = actx.createOscillator();
      const osc2 = actx.createOscillator();
      const filter = actx.createBiquadFilter();
      const gain = actx.createGain();
      osc1.type = 'sawtooth';
      osc2.type = 'square';
      osc1.frequency.setValueAtTime(freq, now);
      osc2.frequency.setValueAtTime(freq * 0.5, now);
      osc1.detune.setValueAtTime(10, now);
      if (isHeavyDrop) {
        osc1.frequency.exponentialRampToValueAtTime(Math.max(32, freq * 0.48), now + 0.28);
      }
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(isHeavyDrop ? 1850 : 1350, now);
      filter.Q.setValueAtTime(3.2, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(isHeavyDrop ? 0.11 : 0.075, now + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.30);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(actx.destination);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.32);
      osc2.stop(now + 0.32);
    } catch (e) {}
  }

  function playHeavyBootStompSfx() {
    if (!audio || !audio.enabled || state.isPaused) return;
    try {
      if (!audio.ctx) audio.init();
      const actx = audio.ctx;
      if (!actx) return;
      const now = actx.currentTime;
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(135, now);
      osc.frequency.exponentialRampToValueAtTime(24, now + 0.38);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
      osc.connect(gain);
      gain.connect(actx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
      audio.playSfx('boss_hammer');
    } catch (e) {}
  }

  function playSnakeDeathGrowlSfx() {
    if (!audio || !audio.enabled || state.isPaused) return;
    try {
      if (!audio.ctx) audio.init();
      const actx = audio.ctx;
      if (!actx) return;
      const now = actx.currentTime;
      // Guttural FM-modulated serpent death growl + raspy hiss
      const carrier = actx.createOscillator();
      const mod = actx.createOscillator();
      const modGain = actx.createGain();
      const filter = actx.createBiquadFilter();
      const gain = actx.createGain();

      carrier.type = 'sawtooth';
      carrier.frequency.setValueAtTime(165, now);
      carrier.frequency.linearRampToValueAtTime(92, now + 0.45);
      carrier.frequency.exponentialRampToValueAtTime(38, now + 1.15);

      mod.type = 'square';
      mod.frequency.setValueAtTime(28, now);
      mod.frequency.linearRampToValueAtTime(14, now + 1.15);
      modGain.gain.setValueAtTime(48, now);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(520, now);
      filter.frequency.exponentialRampToValueAtTime(190, now + 1.15);
      filter.Q.setValueAtTime(2.4, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.20, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.20);

      mod.connect(modGain);
      modGain.connect(carrier.frequency);
      carrier.connect(filter);
      filter.connect(gain);
      gain.connect(actx.destination);

      carrier.start(now);
      mod.start(now);
      carrier.stop(now + 1.22);
      mod.stop(now + 1.22);
    } catch (e) {}
  }

  function playTitleBlastImpactSfx() {
    if (!audio || !audio.enabled || state.isPaused) return;
    try {
      if (!audio.ctx) audio.init();
      const actx = audio.ctx;
      if (!actx) return;
      const now = actx.currentTime;
      [36.71, 73.42, 110.00, 146.83, 220.00].forEach((freq, i) => {
        const osc = actx.createOscillator();
        const filter = actx.createBiquadFilter();
        const gain = actx.createGain();
        osc.type = i === 0 ? 'sine' : 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1600, now);
        filter.frequency.exponentialRampToValueAtTime(280, now + 1.35);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(i === 0 ? 0.22 : 0.09, now + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.40);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(actx.destination);
        osc.start(now);
        osc.stop(now + 1.45);
      });
      audio.playSfx('boss_hammer');
      audio.playSfx('sonic_boom');
    } catch (e) {}
  }

  // -------------------------------------------------------------
  // ACT 1 REAL DUNGEON BUILDER: DISORGANIZED CHAOTIC COLLAPSE
  // Generates a real dungeon floor using `_origGenerateDungeonFloor(1)`
  // so all surrounding rooms, corridors, mossy ivy walls, cobblestones,
  // puddles, ferns, wall-trees, and metal huts exist, then unleashes
  // chaotic random rockfalls, snapping ceiling chains, collapsing metal
  // huts, and panicking/fleeing enemies!
  // -------------------------------------------------------------
  function buildAct1EscapeDungeonGauntlet() {
    const fc = state.finaleCinematic;

    // 1. Generate a real existing dungeon floor as the base surroundings!
    const origShow = dialogue.show;
    dialogue.show = function () {};
    try {
      _origGenerateDungeonFloor(1, { restoringFromSave: true });
    } finally {
      dialogue.show = origShow;
    }

    state.currentFloor = 1;
    state.boss = null;
    state.enemies = [];
    state.projectiles = [];
    state.floaterTexts = [];
    state.trashHuts = [];
    fc.hidePlayersInWorld = false;
    fc.isMountedCavalry = false;
    fc.lastCollapsedCol = 7;
    fc.wallCollapseTimer = 0;
    fc.randomDebrisTimer = 0;
    fc.chainFallTimer = 0;
    fc.worldFires = [];
    fc.worldCracks = [];
    fc.fallingBoulders = [];
    fc.fallingChains = [];
    fc.collapsedChains = [];
    fc.collapsedHuts = [];
    fc.flyingScrap = [];
    fc.crushedWrecks = [];
    fc.ruinPillars = [];
    fc.bossWreck = null;

    // 2. Carve a wide, lush, multi-chamber dungeon escape corridor through the existing dungeon (rows 22..40, cols 6..58)
    for (let r = 22; r <= 40; r++) {
      for (let c = 6; c <= 58; c++) {
        const inChamber = ((c >= 10 && c <= 18) || (c >= 22 && c <= 30) || (c >= 34 && c <= 42) || (c >= 46 && c <= 54));
        const topWallRow = inChamber ? 23 : 25;
        const botWallRow = inChamber ? 39 : 37;

        if (r < topWallRow || r > botWallRow) {
          if (r === topWallRow - 1 || r === botWallRow + 1) {
            state.map[r][c] = ((c + r) % 3 === 0) ? T_WALL_IVY : T_WALL_STONE;
          }
        } else if (r === topWallRow || r === botWallRow || c === 6 || c === 58) {
          if (c % 7 === 0) state.map[r][c] = T_WALL_GRATE;
          else if ((c + r) % 3 === 0) state.map[r][c] = T_WALL_IVY;
          else if (c % 5 === 0) state.map[r][c] = T_WALL_BRICK;
          else state.map[r][c] = T_WALL_STONE;
        } else if (c >= 26 && c <= 28) {
          if (r >= 29 && r <= 33) {
            state.map[r][c] = T_BRIDGE_CHAIN;
          } else {
            state.map[r][c] = T_ABYSS;
          }
        } else {
          if ((r === topWallRow + 2 || r === botWallRow - 2) && c % 6 === 0 && c > 11 && c < 53) {
            state.map[r][c] = (c % 12 === 0) ? T_WALL_IVY : T_WALL_STONE;
          } else if ((c * 3 + r * 5) % 9 === 0) {
            state.map[r][c] = T_FLOOR_GRASS;
          } else if ((c * 7 + r * 11) % 19 === 0 && r >= 28 && r <= 34) {
            state.map[r][c] = T_FLOOR_PUDDLE;
          } else if ((c + r) % 8 === 0) {
            state.map[r][c] = T_FLOOR_ROCKS;
          } else if ((c * r) % 15 === 0) {
            state.map[r][c] = T_FLOOR_MUD;
          } else {
            state.map[r][c] = T_FLOOR_COBBLE;
          }
        }
      }
    }

    // Place real dungeon landmarks & lush props (wall-climbing trees, fern bushes, torches, hanging chains, vines, god-rays)
    state.map[27][14] = T_LORE_OBELISK;
    state.map[35][22] = T_FORGE_ANVIL;
    state.map[27][36] = T_CHEST_ALCOVE;
    state.map[35][44] = T_LORE_OBELISK;
    state.map[31][55] = T_DOOR_EXIT;

    for (let c = 8; c <= 56; c += 2) {
      const inChamber = ((c >= 10 && c <= 18) || (c >= 22 && c <= 30) || (c >= 34 && c <= 42) || (c >= 46 && c <= 54));
      const topY = (inChamber ? 23 : 25) * TILE_SIZE + 44;
      const botY = (inChamber ? 38 : 36) * TILE_SIZE + 18;

      if (c % 4 === 0) {
        state.props.push({ type: 'torch', x: c * TILE_SIZE + 32, y: topY, layer: 1 });
        state.props.push({
          type: 'wall_tree',
          x: (c + 1) * TILE_SIZE + 32,
          y: topY + 6,
          scale: 0.92 + (c % 3) * 0.16,
          flip: (c % 8 === 0) ? -1 : 1,
          seed: c * 1.7,
          hasHouse: false,
          layer: 0,
        });
      }
      state.props.push({
        type: 'fern_bush',
        x: c * TILE_SIZE + 20,
        y: topY + 28 + (c % 3) * 14,
        scale: 0.85 + (c % 4) * 0.15,
        seed: c * 2.3,
        hasBerries: (c % 6 === 0),
        layer: 0,
      });
      state.props.push({
        type: 'fern_bush',
        x: c * TILE_SIZE + 44,
        y: botY - 12 - (c % 3) * 12,
        scale: 0.85 + ((c + 1) % 4) * 0.15,
        seed: c * 3.1,
        hasBerries: (c % 8 === 0),
        layer: 0,
      });

      if (c % 6 === 0) {
        state.props.push({ type: 'chain', x: c * TILE_SIZE + 18, y: topY - 12, h: 68, sway: 8, phase: c, layer: 1 });
        state.props.push({ type: 'vine', x: (c + 1) * TILE_SIZE + 24, y: topY - 12, h: 62, sway: 6, phase: c * 1.3, layer: 1 });
      }
      if (c % 8 === 0) {
        state.godRays.push({ x: c * TILE_SIZE + 32, y: 31 * TILE_SIZE, w: 82, h: 220 });
      }
    }

    // Place 10 real corrugated Metal Huts (`state.trashHuts`) along the chambers that shudder and fall apart into scrap metal!
    const metalHutSpecs = [
      { col: 13.2, row: 28.0, collapseAt: 1.05 },
      { col: 17.5, row: 34.4, collapseAt: 1.95 },
      { col: 21.4, row: 27.8, collapseAt: 2.85 },
      { col: 24.8, row: 34.2, collapseAt: 3.70 },
      { col: 31.4, row: 28.1, collapseAt: 5.05 },
      { col: 35.6, row: 34.5, collapseAt: 6.10 },
      { col: 39.8, row: 27.9, collapseAt: 7.25 },
      { col: 43.5, row: 34.3, collapseAt: 8.35 },
      { col: 48.2, row: 28.2, collapseAt: 9.45 },
      { col: 51.8, row: 34.1, collapseAt: 10.40 },
    ];
    metalHutSpecs.forEach((hs, idx) => {
      state.trashHuts.push({
        id: 'act1_hut_' + idx,
        x: hs.col * TILE_SIZE,
        y: hs.row * TILE_SIZE,
        radius: 26,
        searched: false,
        searchAnim: 0,
        collapseAt: hs.collapseAt,
        boulderTriggered: false,
      });
    });

    // Equip Badger Warrior visually with Godly Tier 9 gear for the grand escape
    const p = state.player;
    const eternityBlade = ARSENAL.find(a => a.id === 'wep_ouroboros_eternity_blade') || p.weapon;
    const apexShield = ARSENAL.find(a => a.id === 'shd_apex_ouroboros_shield') || p.shield;
    const omegaArmor = ARSENAL.find(a => a.id === 'arm_omega_godslayer_mantle') || p.armor;
    if (eternityBlade) p.weapon = eternityBlade;
    if (apexShield) p.shield = apexShield;
    if (omegaArmor) p.armor = omegaArmor;

    p.x = 10 * TILE_SIZE + 32;
    p.y = 31 * TILE_SIZE + 32;
    p.z = 0;
    p.facing = 'right';
    p.walkAnim = 0;
    p.hitStun = 0;

    state.minion.x = p.x - 54;
    state.minion.y = p.y + 10;
    state.minion.z = 0;
    state.minion.walkAnim = 0;

    state.camera.x = p.x + 60;
    state.camera.y = p.y;

    // Spawn 18 REAL 16-bit Dungeon Enemies with chaotic panic & fleeing behaviors!
    // Some sprint ahead trying to escape the falling rubble ('flee_right', 'flee_zigzag'),
    // while others panic-dodge or get caught by random falling rocks/chains!
    const enemySpecs = [
      { col: 12.8, row: 29.8, sp: 'wolf',   wep: 'spear',    colHex: '#607d8b', armHex: '#5d4037', name: 'Fleeing Raider',     beh: 'flee_right',  fleeSpd: 215, doomedAt: 2.3 },
      { col: 14.6, row: 32.5, sp: 'snake',  wep: 'scimitar', colHex: '#2e7d32', armHex: '#d4af37', name: 'Naga Royal Guard',   beh: 'panic_dodge', fleeSpd: 140, doomedAt: 1.4 },
      { col: 16.5, row: 28.9, sp: 'spider', wep: 'daggers',  colHex: '#311b92', armHex: '#7e57c2', name: 'Silkwood Widow',     beh: 'flee_zigzag', fleeSpd: 225, doomedAt: 3.8 },
      { col: 18.8, row: 33.4, sp: 'wolf',   wep: 'hammer',   colHex: '#475569', armHex: '#7c2d12', name: 'Iron-Fang Brute',    beh: 'panic_dodge', fleeSpd: 150, doomedAt: 2.6 },
      { col: 21.2, row: 30.2, sp: 'eagle',  wep: 'spear',    colHex: '#5d4037', armHex: '#ffd54f', name: 'Storm-Talon Eagle',  beh: 'flee_right',  fleeSpd: 245, doomedAt: 99  }, // Escapes far down corridor!
      { col: 23.6, row: 32.8, sp: 'snake',  wep: 'axe',      colHex: '#065f46', armHex: '#fbbf24', name: 'Venom Fang Naga',    beh: 'flee_zigzag', fleeSpd: 195, doomedAt: 4.3 },
      { col: 29.5, row: 29.4, sp: 'wolf',   wep: 'spear',    colHex: '#64748b', armHex: '#334155', name: 'Lupine Runner',      beh: 'flee_right',  fleeSpd: 230, doomedAt: 6.4 },
      { col: 31.2, row: 33.1, sp: 'snake',  wep: 'scimitar', colHex: '#15803d', armHex: '#fde047', name: 'Coil Skirmisher',    beh: 'panic_dodge', fleeSpd: 135, doomedAt: 5.2 },
      { col: 33.8, row: 28.7, sp: 'spider', wep: 'scimitar', colHex: '#311b92', armHex: '#38bdf8', name: 'Abyssal Spinner',    beh: 'flee_zigzag', fleeSpd: 210, doomedAt: 7.1 },
      { col: 35.9, row: 32.6, sp: 'wolf',   wep: 'axe',      colHex: '#52525b', armHex: '#991b1b', name: 'Blood-Fang Warlord', beh: 'flee_right',  fleeSpd: 240, doomedAt: 99  }, // Runs frantically trying to survive!
      { col: 38.4, row: 29.2, sp: 'snake',  wep: 'spear',    colHex: '#115e59', armHex: '#fde047', name: 'Ouroboros Zealot',   beh: 'panic_dodge', fleeSpd: 160, doomedAt: 7.6 },
      { col: 40.6, row: 33.2, sp: 'eagle',  wep: 'bow',      colHex: '#78350f', armHex: '#f59e0b', name: 'Sky-Rift Harrier',   beh: 'flee_zigzag', fleeSpd: 225, doomedAt: 8.5 },
      { col: 43.0, row: 29.6, sp: 'wolf',   wep: 'hammer',   colHex: '#334155', armHex: '#cbd5e1', name: 'Panicked Sentinel',  beh: 'flee_right',  fleeSpd: 220, doomedAt: 9.3 },
      { col: 45.4, row: 32.9, sp: 'snake',  wep: 'axe',      colHex: '#14532d', armHex: '#f59e0b', name: 'Dread Scale Guard',  beh: 'panic_dodge', fleeSpd: 145, doomedAt: 9.0 },
      { col: 47.8, row: 28.8, sp: 'spider', wep: 'daggers',  colHex: '#4c1d95', armHex: '#a855f7', name: 'Cave Stalker',       beh: 'flee_right',  fleeSpd: 235, doomedAt: 99  },
      { col: 49.6, row: 33.0, sp: 'wolf',   wep: 'hammer',   colHex: '#334155', armHex: '#fde047', name: 'Doom-Wolf Crusher',  beh: 'flee_zigzag', fleeSpd: 200, doomedAt: 10.3 },
      { col: 51.5, row: 29.4, sp: 'snake',  wep: 'scimitar', colHex: '#166534', armHex: '#d4af37', name: 'Apex Coil Sentinel', beh: 'panic_dodge', fleeSpd: 155, doomedAt: 10.8 },
      { col: 53.2, row: 32.1, sp: 'wolf',   wep: 'spear',    colHex: '#475569', armHex: '#f97316', name: 'Gate Deserter',      beh: 'flee_right',  fleeSpd: 240, doomedAt: 99  },
    ];

    enemySpecs.forEach((es, idx) => {
      state.enemies.push({
        id: 'act1_chaos_' + idx,
        species: es.sp,
        wepType: es.wep,
        color: es.colHex,
        armorColor: es.armHex,
        name: es.name,
        isMiniBoss: (idx % 5 === 3),
        glowColor: '#ff1744',
        scale: (idx % 5 === 3) ? 1.16 : 1.0,
        x: es.col * TILE_SIZE,
        y: es.row * TILE_SIZE,
        z: 0,
        hp: 999,
        maxHp: 999,
        atk: 10,
        speed: 1.5,
        radius: 18,
        walkAnim: idx * 1.7,
        attackAnim: 0,
        hitStun: 0,
        facing: 'right',
        blinkTimer: idx * 0.4,
        behavior: es.beh,
        fleeSpeed: es.fleeSpd,
        doomedAt: es.doomedAt,
        boulderSpawned: false,
      });
    });

    // Seed realistic multi-tongue dungeon fires & floor fissures along the crumbling chambers
    for (let c = 9; c <= 55; c += 2) {
      const fyTop = (25.6 + (c % 3) * 0.9) * TILE_SIZE;
      const fyBot = (36.4 - (c % 3) * 0.9) * TILE_SIZE;
      fc.worldFires.push({ x: c * TILE_SIZE + 20, y: fyTop, scale: 0.95 + (c % 3) * 0.28, phase: c * 0.7 });
      fc.worldFires.push({ x: c * TILE_SIZE + 42, y: fyBot, scale: 1.0 + ((c + 1) % 3) * 0.28, phase: c * 1.1 });
      if (c % 4 === 0) {
        fc.worldCracks.push({
          x: c * TILE_SIZE + 32,
          y: (29 + (c % 5)) * TILE_SIZE,
          len: 52 + (c % 3) * 22,
          ang: ((c * 0.65) % 1.8) - 0.9,
          color: (c % 8 === 0) ? '#f97316' : '#ef4444',
        });
      }
    }
  }

  // -------------------------------------------------------------
  // ACT 3 REAL DESTROYED DUNGEON TRANSFORMER (FLOORS 1, 5, 8, 10, 13)
  // Generates the actual game floor and mutates its tilemap & props
  // into a devastated, smoldering post-cataclysm ruin for camera panning!
  // -------------------------------------------------------------
  function setupAct3DestroyedDungeonScene(sceneIdx) {
    const fc = state.finaleCinematic;
    const sceneConfigs = [
      { floor: 1,  bossWreckId: 'starter_shrine' },
      { floor: 5,  bossWreckId: 'steam_colossus' },
      { floor: 8,  bossWreckId: 'forest_sanctum' },
      { floor: 10, bossWreckId: 'brood_matriarch' },
      { floor: 13, bossWreckId: 'ouroboros_prime' },
    ];
    const cfg = sceneConfigs[Math.max(0, Math.min(4, sceneIdx))];

    const origShow = dialogue.show;
    dialogue.show = function () {};
    try {
      _origGenerateDungeonFloor(cfg.floor, { restoringFromSave: true });
    } finally {
      dialogue.show = origShow;
    }

    fc.hidePlayersInWorld = true;
    fc.isMountedCavalry = false;
    state.enemies = [];
    state.boss = null;
    state.projectiles = [];
    state.floaterTexts = [];
    fc.worldFires = [];
    fc.worldCracks = [];
    fc.fallingBoulders = [];
    fc.fallingChains = [];
    fc.collapsedChains = [];
    fc.collapsedHuts = [];
    fc.flyingScrap = [];
    fc.crushedWrecks = [];
    fc.ruinPillars = [];
    fc.bossWreck = null;

    for (let r = 4; r < DUNGEON_ROWS - 4; r++) {
      for (let c = 4; c < DUNGEON_COLS - 4; c++) {
        const t = state.map[r][c];
        if (isWallTile(t)) {
          const hash = (r * 37 + c * 53 + sceneIdx * 19) % 100;
          if (hash < 24) {
            state.map[r][c] = T_FLOOR_ROCKS;
            fc.ruinPillars.push({
              x: c * TILE_SIZE + 32,
              y: r * TILE_SIZE + 32,
              rot: ((r + c) % 6) * 0.45 - 1.1,
              w: 38,
              h: 18,
            });
          } else if (hash >= 24 && hash < 33) {
            state.map[r][c] = T_ABYSS;
          }
        } else if (t >= T_FLOOR_COBBLE) {
          const fHash = (r * 71 + c * 29 + sceneIdx * 41) % 160;
          if (fHash === 0 || fHash === 1) {
            fc.worldFires.push({
              x: c * TILE_SIZE + 32,
              y: r * TILE_SIZE + 32,
              scale: 0.72 + (fHash % 2) * 0.35,
              phase: (r + c) * 0.5,
              isSomber: true,
            });
          } else if (fHash === 2) {
            fc.worldCracks.push({
              x: c * TILE_SIZE + 32,
              y: r * TILE_SIZE + 32,
              len: 44,
              ang: (r - c) * 0.3,
              color: '#ea580c',
            });
          } else if (fHash === 3) {
            fc.crushedWrecks.push({
              x: c * TILE_SIZE + 32,
              y: r * TILE_SIZE + 32,
              wepType: (r + c) % 2 === 0 ? 'spear' : 'axe',
              color: '#475569',
            });
          }
        }
      }
    }

    fc.panWaypoints = [];
    if (state.rooms && state.rooms.length >= 3) {
      const r0 = state.rooms[0];
      const rMid = state.rooms[Math.floor(state.rooms.length / 2)];
      const rEnd = state.rooms[state.rooms.length - 1];
      fc.panWaypoints.push({ x: (r0.x + r0.w * 0.5) * TILE_SIZE, y: (r0.y + r0.h * 0.5) * TILE_SIZE });
      fc.panWaypoints.push({ x: (rMid.x + rMid.w * 0.5) * TILE_SIZE, y: (rMid.y + rMid.h * 0.5) * TILE_SIZE });
      fc.panWaypoints.push({ x: (rEnd.x + rEnd.w * 0.45) * TILE_SIZE, y: (rEnd.y + rEnd.h * 0.5) * TILE_SIZE });
    } else if (state.rooms && state.rooms.length > 0) {
      const rm = state.rooms[0];
      const cx = (rm.x + rm.w * 0.5) * TILE_SIZE;
      const cy = (rm.y + rm.h * 0.5) * TILE_SIZE;
      fc.panWaypoints.push({ x: cx - 220, y: cy + 110 });
      fc.panWaypoints.push({ x: cx,       y: cy - 20 });
      fc.panWaypoints.push({ x: cx + 220, y: cy - 110 });
    } else {
      fc.panWaypoints.push({ x: 30 * TILE_SIZE, y: 32 * TILE_SIZE });
      fc.panWaypoints.push({ x: 38 * TILE_SIZE, y: 32 * TILE_SIZE });
    }

    const midPt = fc.panWaypoints[Math.min(1, fc.panWaypoints.length - 1)];
    fc.bossWreck = {
      id: cfg.bossWreckId,
      x: midPt.x,
      y: midPt.y,
    };
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2;
      fc.worldFires.push({
        x: midPt.x + Math.cos(ang) * 115,
        y: midPt.y + Math.sin(ang) * 85,
        scale: 0.95,
        phase: a * 1.1,
        isSomber: true,
      });
      fc.ruinPillars.push({
        x: midPt.x + Math.cos(ang + 0.4) * 140,
        y: midPt.y + Math.sin(ang + 0.4) * 95,
        rot: ang * 0.7,
        w: 44,
        h: 20,
      });
    }

    state.camera.x = fc.panWaypoints[0].x;
    state.camera.y = fc.panWaypoints[0].y;
  }

  window.startCycle13FinaleCinematic = function () {
    const fc = state.finaleCinematic;
    fc.active = true;
    fc.elapsed = 0;
    fc.act = 1;
    fc.subSceneIdx = -1;
    fc.musicStepTimer = 0;
    fc.musicNoteIdx = 0;
    fc.bootStompPlayed = false;
    fc.snakeGrowlPlayed = false;
    fc.titleBlastPlayed = false;

    // Save the player's current state so nothing is lost during the cinematic maps
    fc.savedPlayerTuple = encodePlayerTuple(state.player);
    fc.savedFloor = state.currentFloor;
    fc.savedCycle = Math.max(13, state.cycle || 13);

    // Hide top-left and top-right HUD overlays during all final acts!
    setFinaleHudVisibility(false);

    // Silence any active speech synthesis or dialogue banners (Zero text/captioning audio in acts!)
    if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }
    const bannerEl = document.getElementById('dialogue-banner');
    if (bannerEl) bannerEl.style.display = 'none';
    state.floaterTexts = [];

    // Pause standard background dubstep sequencer so custom cinematic audio & somber orchestral score shine
    if (audio && audio.timerId) {
      clearTimeout(audio.timerId);
      audio.timerId = null;
      audio.isPlaying = false;
    }
    if (audio && audio.ctx && audio.musicBus) {
      try {
        audio.musicBus.gain.setTargetAtTime(0.0001, audio.ctx.currentTime, 0.08);
      } catch (e) {}
    }

    // Build Act 1 In-Engine Crumbling Dungeon Escape Gauntlet!
    buildAct1EscapeDungeonGauntlet();

    audio.playSfx('boss_roar');
    audio.playSfx('boss_hammer');
  };

  window.handleFinaleCinematicButtonA = function () {
    const fc = state.finaleCinematic;
    if (!fc || !fc.active) return;
    if (fc.elapsed >= 61.2) {
      // Act 5 ("End" Screen): Restore HUDs & player snapshot to preserve Cycle 13 save, then start a New Game!
      fc.active = false;
      fc.hidePlayersInWorld = false;
      fc.isMountedCavalry = false;
      setFinaleHudVisibility(true);

      if (Array.isArray(fc.savedPlayerTuple)) {
        decodePlayerTuple(fc.savedPlayerTuple);
      }
      state.currentFloor = fc.savedFloor || 13;
      state.cycle = fc.savedCycle || 13;
      syncActivePlaythroughToSlots();

      const bannerEl = document.getElementById('dialogue-banner');
      if (bannerEl) bannerEl.style.display = 'none';
      if (audio && audio.ctx && audio.musicBus) {
        try {
          audio.musicBus.gain.setTargetAtTime(0.82, audio.ctx.currentTime, 0.1);
        } catch (e) {}
      }
      if (audio && typeof audio.resumeAudio === 'function') {
        audio.resumeAudio();
      }
      window.createNewPlaythroughAndPreserveCurrent();
    } else if (fc.act === 1) {
      // During Act 1, pressing A lets Badger Warrior swing his Godly Eternity Blade while sprinting!
      state.player.isAttacking = 0.22;
      audio.playSfx('legendary_slash');
      spawnWarpEffect(state.player.x + 28, state.player.y, '#00e5ff', 85);
    }
  };

  function stepCinematicWorldEffects(dt) {
    const dtScale = Math.min(2.2, dt * 60);
    for (let i = state.sonicBoomWaves.length - 1; i >= 0; i--) {
      const sw = state.sonicBoomWaves[i];
      sw.radius += dt * sw.speed;
      sw.alpha = Math.max(0, 1.0 - (sw.radius / sw.maxRadius));
      if (sw.radius >= sw.maxRadius || sw.alpha <= 0.02) state.sonicBoomWaves.splice(i, 1);
    }
    for (let i = state.waterRipples.length - 1; i >= 0; i--) {
      const rp = state.waterRipples[i];
      rp.radius += dt * 28;
      rp.alpha -= dt * 0.85;
      if (rp.alpha <= 0 || rp.radius >= rp.maxRadius) state.waterRipples.splice(i, 1);
    }
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const pt = state.particles[i];
      pt.x += pt.vx * dtScale;
      pt.y += pt.vy * dtScale;
      pt.life -= dt * 1.65;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.warpEffects.length - 1; i >= 0; i--) {
      const wf = state.warpEffects[i];
      wf.radius += (wf.maxRadius - wf.radius) * Math.min(1, dt * 11);
      wf.alpha -= dt * 2.1;
      if (wf.alpha <= 0.02) state.warpEffects.splice(i, 1);
    }
    state.floaterTexts = [];
  }

  window.updateFinaleCinematic = function (dt) {
    const fc = state.finaleCinematic;
    if (!fc || !fc.active) return;
    fc.elapsed += dt;
    const t = fc.elapsed;
    const p = state.player;
    const m = state.minion;

    // Keep top-left & top-right HUDs and dialogue banner hidden throughout all finale acts
    setFinaleHudVisibility(false);
    const bannerEl = document.getElementById('dialogue-banner');
    if (bannerEl && bannerEl.style.display !== 'none') {
      bannerEl.style.display = 'none';
    }

    stepCinematicWorldEffects(dt);

    // Determine current Act:
    // Act 1: 0.0s .. 12.0s  (In-Engine Chaotic Escape from the Crumbling & Blazing Dungeon)
    // Act 2: 12.0s .. 17.0s (Blaring White Flash -> Pitch Blackness -> "Badger Warrior and Quill Beast will return.")
    // Act 3: 17.0s .. 47.0s (30-Second Top-Down Camera Pan across 5 Real Destroyed Dungeons with Somber Soft Music)
    // Act 4: 47.0s .. 61.5s (Next-Gen HD Cinematic Trailer + Extended 6-Second Title Screen Blast)
    // Act 5: 61.5s+         (Fade to Black with "End" and Press "A" to Start a New Game)
    const prevAct = fc.act;
    if (t < 12.0) fc.act = 1;
    else if (t < 17.0) fc.act = 2;
    else if (t < 47.0) fc.act = 3;
    else if (t < 61.5) fc.act = 4;
    else fc.act = 5;

    if (fc.act !== prevAct) {
      fc.musicStepTimer = 0;
      fc.musicNoteIdx = 0;
      fc.subSceneIdx = -1;
      if (fc.act === 2) {
        state.screenShake = 0;
        audio.playSfx('sonic_boom');
        audio.playSfx('boss_hammer');
      } else if (fc.act === 3) {
        state.screenShake = 0;
      } else if (fc.act === 4) {
        state.screenShake = 0;
        fc.hidePlayersInWorld = true;
      } else if (fc.act === 5) {
        state.screenShake = 0;
        playSomberPolyphonicChord([146.83, 220.00, 293.66, 349.23, 440.00], 3.8, 0.07);
      }
    }

    // =============================================================
    // ACT 1 UPDATE (0.0s .. 12.0s): DISORGANIZED CHAOTIC COLLAPSE
    // =============================================================
    if (fc.act === 1) {
      state.screenShake = 8.5 + (t / 12.0) * 14.5;

      const sprintSpeed = 235;
      p.x = Math.min(54.5 * TILE_SIZE, p.x + sprintSpeed * dt);
      let steerY = Math.sin(t * 2.8) * 55;
      if (input.up) steerY = -90;
      else if (input.down) steerY = 90;
      const targetY = 31.2 * TILE_SIZE + Math.sin(t * 2.1) * 42;
      p.y += ((targetY - p.y) * 2.5 + steerY) * dt;
      p.y = Math.max(27.2 * TILE_SIZE, Math.min(35.2 * TILE_SIZE, p.y));
      p.facing = 'right';
      p.walkAnim += dt * 18;
      if (p.isAttacking > 0) p.isAttacking = Math.max(0, p.isAttacking - dt);

      if (Math.floor((t - dt) * 1.6) < Math.floor(t * 1.6)) {
        p.isAttacking = 0.22;
        audio.playSfx('legendary_slash');
        spawnWarpEffect(p.x + 28, p.y, '#00e5ff', 72);
      }

      const targetMx = p.x - 52 + Math.sin(t * 5.0) * 10;
      const targetMy = p.y + 12 + Math.cos(t * 4.5) * 14;
      m.x += (targetMx - m.x) * Math.min(1, dt * 10);
      m.y += (targetMy - m.y) * Math.min(1, dt * 10);
      m.walkAnim += dt * 20;

      state.camera.x += ((p.x + 75) - state.camera.x) * Math.min(1, dt * 8);
      state.camera.y += (p.y - state.camera.y) * Math.min(1, dt * 8);

      // 1. Crumble dungeon walls & interior stone pillars erratically all around the camera!
      fc.wallCollapseTimer -= dt;
      const heroCol = Math.floor(p.x / TILE_SIZE);
      if (fc.wallCollapseTimer <= 0) {
        fc.wallCollapseTimer = 0.11;
        const collapseCol = Math.max(7, Math.min(56, heroCol - 4 + Math.floor(Math.random() * 12)));
        [23, 25, 27, 35, 37, 39].forEach(rWall => {
          if (state.map[rWall] && isWallTile(state.map[rWall][collapseCol]) && Math.random() < 0.65) {
            state.map[rWall][collapseCol] = (Math.random() < 0.32) ? T_ABYSS : T_FLOOR_ROCKS;
            const wx = collapseCol * TILE_SIZE + 32;
            const wy = rWall * TILE_SIZE + 32;
            createSparks(wx, wy, 10, '#94a3b8');
            createSparks(wx, wy, 6, '#f97316');
            fc.fallingBoulders.push({
              x: wx + (Math.random() - 0.5) * 44,
              y: wy + (rWall < 31 ? 28 + Math.random() * 40 : -28 - Math.random() * 40),
              z: 160 + Math.random() * 110,
              vz: 360 + Math.random() * 140,
              w: 22 + Math.random() * 26,
              h: 16 + Math.random() * 20,
              rot: (Math.random() - 0.5) * 1.4,
              isChunkCluster: Math.random() < 0.55,
              targetEnemy: null,
            });
          }
        });
        fc.worldFires.push({
          x: (heroCol - 1 + (Math.random() - 0.3) * 8) * TILE_SIZE,
          y: (26.2 + Math.random() * 9.6) * TILE_SIZE,
          scale: 0.90 + Math.random() * 0.55,
          phase: Math.random() * 6,
        });
      }

      // 2. Continuous DISORGANIZED random ceiling rock chunks & masonry slabs raining everywhere!
      fc.randomDebrisTimer -= dt;
      if (fc.randomDebrisTimer <= 0) {
        fc.randomDebrisTimer = 0.055 + Math.random() * 0.045;
        const spawnCount = 1 + (Math.random() < 0.55 ? 1 : 0);
        for (let k = 0; k < spawnCount; k++) {
          let rx = state.camera.x + (Math.random() - 0.38) * 520;
          let ry = (25.8 + Math.random() * 10.4) * TILE_SIZE;
          // Keep random lethal boulders slightly off Badger & Quill Beast's exact center so they narrowly dodge the chaos
          if (Math.hypot(rx - p.x, ry - p.y) < 38) {
            ry += (ry >= p.y ? 46 : -46);
          }
          fc.fallingBoulders.push({
            x: rx,
            y: ry,
            z: 220 + Math.random() * 140,
            vz: 380 + Math.random() * 170,
            w: 18 + Math.random() * 32,
            h: 14 + Math.random() * 24,
            rot: (Math.random() - 0.5) * 2.2,
            isChunkCluster: Math.random() < 0.65,
            targetEnemy: null,
          });
        }
      }

      // 3. Snapped iron ceiling chains whipping down randomly from the roof!
      fc.chainFallTimer -= dt;
      if (fc.chainFallTimer <= 0) {
        fc.chainFallTimer = 0.22 + Math.random() * 0.18;
        const cx = state.camera.x + (Math.random() - 0.35) * 480;
        const cy = (26.2 + Math.random() * 9.6) * TILE_SIZE;
        fc.fallingChains.push({
          x: cx,
          y: cy,
          z: 240 + Math.random() * 90,
          vz: 460 + Math.random() * 140,
          links: 7 + Math.floor(Math.random() * 6),
          swayPhase: Math.random() * Math.PI * 2,
          hasHook: Math.random() < 0.6,
        });
      }

      for (let i = fc.fallingChains.length - 1; i >= 0; i--) {
        const ch = fc.fallingChains[i];
        ch.z -= ch.vz * dt;
        ch.swayPhase += dt * 18;
        if (ch.z <= 0) {
          ch.z = 0;
          createSparks(ch.x, ch.y, 10, '#cbd5e1');
          createSparks(ch.x, ch.y, 6, '#38bdf8');
          if (Math.random() < 0.45) audio.playSfx('spikes');
          fc.collapsedChains.push({
            x: ch.x,
            y: ch.y,
            links: ch.links,
            seed: ch.swayPhase,
            hasHook: ch.hasHook,
          });
          // Check if a falling ceiling chain whipped into a nearby enemy!
          for (let j = state.enemies.length - 1; j >= 0; j--) {
            const e = state.enemies[j];
            if (Math.hypot(e.x - ch.x, e.y - ch.y) < 34) {
              createBloodSpurt(e.x, e.y, 18);
              e.hitStun = 0.25;
            }
          }
          fc.fallingChains.splice(i, 1);
        }
      }

      // 4. Metal Huts (`state.trashHuts`) violently shudder, buckle, and fall apart into flying scrap metal!
      for (let i = state.trashHuts.length - 1; i >= 0; i--) {
        const hut = state.trashHuts[i];
        const timeToCollapse = hut.collapseAt - t;
        if (timeToCollapse < 0.85) {
          // Violent structural shudder before falling apart
          hut.searchAnim = Math.min(1.0, (0.85 - Math.max(0, timeToCollapse)) * 1.4);
          if (Math.random() < 0.35) {
            createSparks(hut.x + (Math.random() - 0.5) * 36, hut.y - 12, 4, '#fbbf24');
          }
        }
        if (!hut.boulderTriggered && timeToCollapse <= 0.45) {
          hut.boulderTriggered = true;
          fc.fallingBoulders.push({
            x: hut.x + (Math.random() - 0.5) * 14,
            y: hut.y,
            z: 210,
            vz: 470,
            w: 42,
            h: 30,
            rot: 0.35,
            isChunkCluster: true,
            targetEnemy: null,
          });
        }
        if (t >= hut.collapseAt) {
          // Explode metal hut into collapsed corrugated sheets, bent beams & flying rivets!
          audio.playSfx('boss_hammer');
          audio.playSfx('shield_break');
          createSparks(hut.x, hut.y, 22, '#f97316');
          createSparks(hut.x, hut.y, 16, '#cbd5e1');
          spawnWarpEffect(hut.x, hut.y, '#f59e0b', 64);

          fc.collapsedHuts.push({
            x: hut.x,
            y: hut.y,
            seed: i * 1.9 + 0.5,
          });
          // Launch 7 spinning corrugated scrap-metal plates & beams outward
          for (let s = 0; s < 7; s++) {
            const ang = (s / 7) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            const spd = 65 + Math.random() * 115;
            fc.flyingScrap.push({
              x: hut.x,
              y: hut.y,
              z: 14 + Math.random() * 18,
              vx: Math.cos(ang) * spd,
              vy: Math.sin(ang) * spd * 0.75,
              vz: 130 + Math.random() * 110,
              rot: Math.random() * Math.PI * 2,
              vrot: (Math.random() - 0.5) * 14,
              w: 16 + (s % 3) * 6,
              h: 9 + (s % 2) * 5,
              color: (s % 2 === 0) ? '#64748b' : '#475569',
            });
          }
          state.trashHuts.splice(i, 1);
        }
      }

      // Step flying scrap-metal plates from collapsed huts
      for (let i = fc.flyingScrap.length - 1; i >= 0; i--) {
        const sc = fc.flyingScrap[i];
        if (sc.z > 0 || sc.vz > 0) {
          sc.x += sc.vx * dt;
          sc.y += sc.vy * dt;
          sc.z += sc.vz * dt;
          sc.vz -= 420 * dt;
          sc.rot += sc.vrot * dt;
          if (sc.z <= 0) {
            sc.z = 0;
            sc.vx *= 0.25;
            sc.vy *= 0.25;
            sc.vz = 0;
            sc.vrot = 0;
            createSparks(sc.x, sc.y, 5, '#94a3b8');
          }
        }
      }

      // 5. Chaotic Enemies: Some sprint away trying to escape the rubble, others weave/panic, and boulders crush any enemy they hit!
      for (let i = state.enemies.length - 1; i >= 0; i--) {
        const e = state.enemies[i];
        e.walkAnim += dt * 19;
        if (e.hitStun > 0) e.hitStun = Math.max(0, e.hitStun - dt);

        if (e.behavior === 'flee_right') {
          // Sprinting down the corridor trying to outrun the collapsing ceiling!
          e.x += e.fleeSpeed * dt;
          e.y += Math.sin(t * 7.5 + i * 2.1) * 62 * dt;
          // Occasionally glance back in terror while fleeing
          e.facing = (Math.sin(t * 9 + i) > 0.65) ? 'left' : 'right';
        } else if (e.behavior === 'flee_zigzag') {
          // Frantically weaving and dodging falling rocks while running away
          e.x += e.fleeSpeed * 0.82 * dt;
          e.y += Math.cos(t * 10.5 + i * 1.7) * 115 * dt;
          e.facing = 'right';
        } else {
          // Panicked scrambling in all directions
          e.x += Math.sin(t * 8.0 + i * 1.9) * 85 * dt;
          e.y += Math.cos(t * 7.2 + i * 2.3) * 85 * dt;
          e.facing = (Math.sin(t * 8.0 + i * 1.9) >= 0) ? 'right' : 'left';
        }
        e.x = Math.min(56.5 * TILE_SIZE, Math.max(8 * TILE_SIZE, e.x));
        e.y = Math.max(26.8 * TILE_SIZE, Math.min(35.6 * TILE_SIZE, e.y));

        // Spawn an unguided rockslide cluster near doomed enemies' predicted path (not locked onto them, so it looks natural)
        if (!e.boulderSpawned && t >= e.doomedAt - 0.55) {
          e.boulderSpawned = true;
          const leadX = (e.behavior === 'flee_right' || e.behavior === 'flee_zigzag') ? e.fleeSpeed * 0.45 : 0;
          for (let bIdx = 0; bIdx < 3; bIdx++) {
            fc.fallingBoulders.push({
              x: e.x + leadX + (bIdx - 1) * 26 + (Math.random() - 0.5) * 18,
              y: e.y + (Math.random() - 0.5) * 26,
              z: 230 + bIdx * 28,
              vz: 430 + bIdx * 30,
              w: 34 + (bIdx % 2) * 12,
              h: 24 + (bIdx % 2) * 8,
              rot: (bIdx - 1) * 0.4,
              isChunkCluster: true,
              targetEnemy: (bIdx === 0) ? e : null,
            });
          }
        }
      }

      // Step all falling boulders & rock chunks — check radial collision against ANY nearby enemy!
      for (let i = fc.fallingBoulders.length - 1; i >= 0; i--) {
        const b = fc.fallingBoulders[i];
        if (b.targetEnemy && state.enemies.includes(b.targetEnemy)) {
          // Slight drift toward doomed enemy without robotic teleporting
          b.x += (b.targetEnemy.x - b.x) * Math.min(1, dt * 6.5);
          b.y += (b.targetEnemy.y - b.y) * Math.min(1, dt * 6.5);
        }
        b.z -= b.vz * dt;
        if (b.z <= 0) {
          b.z = 0;
          // Any enemy caught within the impact radius of this falling rock gets crushed!
          let crushedSomeone = false;
          let crushedWep = null;
          let crushedCol = null;
          for (let j = state.enemies.length - 1; j >= 0; j--) {
            const cand = state.enemies[j];
            if (Math.hypot(cand.x - b.x, cand.y - b.y) < Math.max(28, b.w * 0.78)) {
              crushedSomeone = true;
              crushedWep = cand.wepType;
              crushedCol = cand.color;
              createBloodSpurt(cand.x, cand.y, 26);
              createSparks(cand.x, cand.y, 16, '#f97316');
              spawnWarpEffect(cand.x, cand.y, '#ef4444', 66);
              state.enemies.splice(j, 1);
            }
          }
          if (crushedSomeone) {
            audio.playSfx('boss_hammer');
            audio.playSfx('spikes');
          } else if (Math.abs(b.x - state.camera.x) < 280) {
            createSparks(b.x, b.y, 9, '#94a3b8');
            if (Math.random() < 0.28) audio.playSfx('boss_hammer');
          }

          if (fc.crushedWrecks.length < 95) {
            fc.crushedWrecks.push({
              x: b.x,
              y: b.y,
              w: b.w,
              h: b.h,
              rot: b.rot,
              isChunkCluster: b.isChunkCluster,
              hadEnemy: crushedSomeone,
              wepType: crushedWep,
              enemyCol: crushedCol,
            });
          }
          fc.fallingBoulders.splice(i, 1);
        }
      }

      // Emit realistic rising embers & dark smoke particles from world fires
      if (Math.random() < 0.78 && fc.worldFires.length > 0) {
        const rf = fc.worldFires[Math.floor(Math.random() * fc.worldFires.length)];
        if (Math.abs(rf.x - state.camera.x) < 340) {
          const isSmoke = Math.random() < 0.35;
          state.particles.push({
            x: rf.x + (Math.random() - 0.5) * 22,
            y: rf.y - (isSmoke ? 26 : 10),
            vx: (Math.random() - 0.5) * 1.4,
            vy: isSmoke ? (-1.2 - Math.random() * 1.4) : (-2.0 - Math.random() * 2.5),
            radius: isSmoke ? (6.0 + Math.random() * 4.5) : (2.5 + Math.random() * 2.5),
            color: isSmoke ? 'rgba(30, 41, 59, 0.55)' : (Math.random() < 0.5 ? '#fde047' : '#f97316'),
            life: isSmoke ? 1.1 : 0.85,
          });
        }
      }

      fc.musicStepTimer -= dt;
      if (fc.musicStepTimer <= 0) {
        fc.musicStepTimer = 0.42;
        const escapeNotes = [73.42, 87.31, 98.00, 110.00, 116.54, 146.83];
        playTrailerBadassSynthHit(escapeNotes[fc.musicNoteIdx % escapeNotes.length], fc.musicNoteIdx % 2 === 0);
        fc.musicNoteIdx++;
      }
    }

    // =============================================================
    // ACT 3 UPDATE (17.0s .. 47.0s — 30 SECONDS):
    // REAL TOP-DOWN CAMERA PAN ACROSS 5 DESTROYED DUNGEONS + SOMBER MUSIC
    // =============================================================
    else if (fc.act === 3) {
      const panT = t - 17.0; // 0 .. 30s
      const sceneIdx = Math.min(4, Math.floor(panT / 6.0));
      const sceneProgress = (panT % 6.0) / 6.0;

      if (fc.subSceneIdx !== sceneIdx) {
        fc.subSceneIdx = sceneIdx;
        setupAct3DestroyedDungeonScene(sceneIdx);
      }

      if (fc.panWaypoints && fc.panWaypoints.length >= 2) {
        const segCount = fc.panWaypoints.length - 1;
        const scaled = sceneProgress * segCount;
        const segIdx = Math.min(segCount - 1, Math.floor(scaled));
        const segFrac = scaled - segIdx;
        const w0 = fc.panWaypoints[segIdx];
        const w1 = fc.panWaypoints[segIdx + 1];
        state.camera.x = w0.x + (w1.x - w0.x) * segFrac;
        state.camera.y = w0.y + (w1.y - w0.y) * segFrac;
      }

      if (Math.random() < 0.45) {
        state.particles.push({
          x: state.camera.x + (Math.random() - 0.5) * 420,
          y: state.camera.y + (Math.random() - 0.5) * 280,
          vx: 0.4 + Math.random() * 0.5,
          vy: -0.7 - Math.random() * 0.8,
          radius: 2.2 + Math.random() * 1.8,
          color: Math.random() < 0.35 ? '#fda4af' : 'rgba(226, 232, 240, 0.75)',
          life: 1.2,
        });
      }

      const somberChords = [
        [73.42, 146.83, 220.00, 349.23, 440.00],
        [73.42, 174.61, 261.63, 329.63, 523.25],
        [58.27, 116.54, 174.61, 293.66, 440.00],
        [58.27, 146.83, 220.00, 349.23, 392.00],
        [49.00, 98.00,  146.83, 220.00, 349.23],
        [49.00, 116.54, 174.61, 293.66, 329.63],
        [55.00, 110.00, 164.81, 220.00, 293.66],
        [55.00, 110.00, 138.59, 220.00, 329.63],
      ];
      fc.musicStepTimer -= dt;
      if (fc.musicStepTimer <= 0) {
        fc.musicStepTimer = 1.85;
        const chord = somberChords[fc.musicNoteIdx % somberChords.length];
        playSomberPolyphonicChord(chord, 2.5, 0.055);
        fc.musicNoteIdx++;
      }
    }

    // =============================================================
    // ACT 4 UPDATE (47.0s .. 61.5s — 14.5 SECONDS):
    // NEXT-GEN HIGH-DEFINITION TRAILER ("OUROBOROS ABYSS 2 - BROKEN KINGDOM")
    // WITH EXTENDED 6-SECOND TITLE SCREEN BLAST!
    // =============================================================
    else if (fc.act === 4) {
      const trT = t - 47.0; // 0.0 .. 14.5s

      // Trigger bespoke sound effects at the exact cinematic beats:
      // 1) Heavy Muddy Boot Stomp at 4.15s
      if (trT >= 4.15 && !fc.bootStompPlayed) {
        fc.bootStompPlayed = true;
        playHeavyBootStompSfx();
      }
      // 2) Crushed Snake Final Death Growl at 5.10s
      if (trT >= 5.10 && !fc.snakeGrowlPlayed) {
        fc.snakeGrowlPlayed = true;
        playSnakeDeathGrowlSfx();
      }
      // 3) "Ouroboros Abyss 2 - Broken Kingdom" Title Blast at 8.65s (stays up until 14.5s!)
      if (trT >= 8.65 && !fc.titleBlastPlayed) {
        fc.titleBlastPlayed = true;
        playTitleBlastImpactSfx();
      }

      // Dark, brooding cinematic sub-bass pulse during the trailer
      fc.musicStepTimer -= dt;
      if (fc.musicStepTimer <= 0 && trT < 8.4) {
        fc.musicStepTimer = (trT < 3.5) ? 0.65 : 0.42;
        const bassRiff = [55.00, 58.27, 73.42, 65.41, 73.42, 87.31];
        playTrailerBadassSynthHit(bassRiff[fc.musicNoteIdx % bassRiff.length], trT >= 4.7);
        fc.musicNoteIdx++;
      }
    }
  };

  // -------------------------------------------------------------
  // REALISTIC MULTI-LAYERED VOLUMETRIC DUNGEON FIRE & SMOKE RENDERER
  // Renders charred scorch base, glowing ember coal bed, billowing dark
  // smoke plumes, 7 turbulent organic multi-tongue flames, and flying sparks!
  // -------------------------------------------------------------
  function drawRealisticVolumetricFire(f, now) {
    const sc = (f.scale || 1.0) * (f.isSomber ? 0.82 : 1.12);
    const ph = f.phase || 0;
    const t = now * 0.008 + ph;

    ctx.save();
    ctx.translate(f.x, f.y);

    // 1. Charred ash scorch crater & cracked glowing ember coal bed on the dungeon stones
    ctx.fillStyle = 'rgba(5, 7, 11, 0.78)';
    ctx.beginPath();
    ctx.ellipse(0, 6 * sc, 24 * sc, 11 * sc, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(69, 10, 10, 0.85)';
    ctx.beginPath();
    ctx.ellipse(0, 5 * sc, 17 * sc, 7.5 * sc, 0, 0, Math.PI * 2);
    ctx.fill();

    // Glowing hot coals & magma cracks in the ash bed
    for (let c = 0; c < 5; c++) {
      const ca = ph + c * 1.25;
      const cx = Math.cos(ca) * (8 * sc);
      const cy = 4 * sc + Math.sin(ca * 1.7) * (3.5 * sc);
      const coalPulse = 0.65 + Math.sin(t * 2.5 + c) * 0.35;
      ctx.fillStyle = c % 2 === 0 ? `rgba(251, 146, 60, ${coalPulse})` : `rgba(239, 68, 68, ${coalPulse})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 3.8 * sc, 2.0 * sc, ca * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Rising billowing dark-charcoal smoke plumes above the fire
    for (let s = 0; s < 4; s++) {
      const sProg = ((now * 0.0009 + ph * 0.3 + s * 0.25) % 1.0);
      const sx = Math.sin(t * 0.9 + s * 1.8) * (10 * sc * sProg);
      const sy = -18 * sc - sProg * (44 * sc);
      const sRad = (7 + sProg * 15) * sc;
      const sAlpha = (1.0 - sProg) * (f.isSomber ? 0.38 : 0.46);
      const smokeGrad = ctx.createRadialGradient(sx, sy, 1, sx, sy, sRad);
      smokeGrad.addColorStop(0, `rgba(15, 23, 42, ${sAlpha})`);
      smokeGrad.addColorStop(0.6, `rgba(30, 41, 59, ${sAlpha * 0.55})`);
      smokeGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = smokeGrad;
      ctx.beginPath();
      ctx.arc(sx, sy, sRad, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Warm volumetric floor & air firelight illumination halo
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const haloRad = (56 + Math.sin(t * 3.1) * 7) * sc;
    const glowGrad = ctx.createRadialGradient(0, -4 * sc, 2, 0, -4 * sc, haloRad);
    glowGrad.addColorStop(0, 'rgba(254, 240, 138, 0.48)');
    glowGrad.addColorStop(0.32, 'rgba(249, 115, 22, 0.32)');
    glowGrad.addColorStop(0.68, 'rgba(220, 38, 38, 0.14)');
    glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.ellipse(0, 2 * sc, haloRad, haloRad * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();

    // 4. Multi-layered turbulent organic flame tongues (7 dynamic overlapping tongues)
    const tongues = [
      { ox: -11, w: 11, h: 30, spd: 1.9, phaseOff: 0.0, colBot: '#7f1d1d', colTop: '#ea580c' },
      { ox:  11, w: 11, h: 28, spd: 2.1, phaseOff: 1.4, colBot: '#7f1d1d', colTop: '#ea580c' },
      { ox:  -6, w: 13, h: 40, spd: 2.4, phaseOff: 2.3, colBot: '#b91c1c', colTop: '#f97316' },
      { ox:   6, w: 12, h: 38, spd: 2.2, phaseOff: 3.6, colBot: '#b91c1c', colTop: '#f97316' },
      { ox:   0, w: 15, h: 48, spd: 2.7, phaseOff: 0.8, colBot: '#ea580c', colTop: '#fbbf24' },
      { ox:  -3, w:  9, h: 32, spd: 3.1, phaseOff: 4.5, colBot: '#f59e0b', colTop: '#fef08a' },
      { ox:   2, w:  7, h: 22, spd: 3.5, phaseOff: 5.2, colBot: '#fef08a', colTop: '#ffffff' },
    ];

    tongues.forEach(tg => {
      const wave1 = Math.sin(t * tg.spd + tg.phaseOff) * (6.5 * sc);
      const wave2 = Math.cos(t * (tg.spd * 1.3) + tg.phaseOff) * (4.5 * sc);
      const stretch = 0.88 + Math.sin(t * (tg.spd * 1.7) + tg.phaseOff) * 0.18;
      const bx = tg.ox * sc;
      const bw = tg.w * sc;
      const bh = tg.h * sc * stretch;

      const fGrad = ctx.createLinearGradient(bx, 6 * sc, bx + wave1, -bh);
      fGrad.addColorStop(0, tg.colBot);
      fGrad.addColorStop(0.55, tg.colTop);
      fGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');

      ctx.fillStyle = fGrad;
      ctx.beginPath();
      ctx.moveTo(bx - bw, 5 * sc);
      ctx.bezierCurveTo(
        bx - bw * 0.85 + wave2, -bh * 0.35,
        bx - bw * 0.35 + wave1, -bh * 0.75,
        bx + wave1 * 1.15, -bh
      );
      ctx.bezierCurveTo(
        bx + bw * 0.35 + wave1, -bh * 0.75,
        bx + bw * 0.85 - wave2, -bh * 0.35,
        bx + bw, 5 * sc
      );
      ctx.closePath();
      ctx.fill();
    });

    // 5. Flickering detached flame wisps & rising glowing sparks
    for (let sp = 0; sp < 4; sp++) {
      const spProg = ((now * 0.0022 + ph * 0.5 + sp * 0.25) % 1.0);
      const spX = Math.sin(t * 2.2 + sp * 2.1) * (12 * sc);
      const spY = -12 * sc - spProg * (42 * sc);
      const spRad = (1.0 - spProg) * 3.2 * sc;
      ctx.fillStyle = sp % 2 === 0 ? '#ffffff' : '#fde047';
      ctx.beginPath();
      ctx.arc(spX, spY, Math.max(0.6, spRad), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    ctx.restore();
  }

  // Fallback stubs in case render() references them
  function drawAbyss2NextGenBadgerHero(p, now) { drawPlayerHero(p, now); }
  function drawAbyss2NextGenQuillBeast(m, now) { drawQuillCompanion(m, now); }
  function drawAbyss2NextGenEnemy(e, now) { drawEnemySprite(e, now); }
  function drawAbyss2ChimeraKingBoss(b, now) { drawBossSprite(b, now); }

  // -------------------------------------------------------------
  // WORLD-SPACE FINALE RENDERER (Called inside camera transform in render()!)
  // Draws falling 3D boulders, snapping ceiling chains, collapsed metal huts,
  // flying corrugated scrap, crushed enemy wrecks, realistic volumetric
  // dungeon fires, reality fissures, and ruined boss wrecks!
  // -------------------------------------------------------------
  function renderFinaleWorldSpaceEffects(camX, camY, w, h, now, theme) {
    const fc = state.finaleCinematic;
    if (!fc || !fc.active || fc.act === 4) return;

    // 1. World-Space Reality-Shatter Fissures & Scorched Cracks on the Dungeon Floor
    if (fc.worldCracks && fc.worldCracks.length > 0) {
      fc.worldCracks.forEach((cr, idx) => {
        if (!inView(cr.x, cr.y, 90)) return;
        ctx.save();
        ctx.translate(cr.x, cr.y);
        ctx.rotate(cr.ang);
        ctx.strokeStyle = '#05070c';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(-cr.len, 0);
        ctx.lineTo(-cr.len * 0.3, 9);
        ctx.lineTo(cr.len * 0.35, -8);
        ctx.lineTo(cr.len, 4);
        ctx.stroke();

        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = cr.color || '#f97316';
        ctx.lineWidth = 2.8 + Math.sin(now * 0.012 + idx) * 1.2;
        ctx.stroke();
        ctx.restore();
      });
    }

    // 2. Act 3 Toppled Stone Pillars & Ruined Boss Centerpiece Wrecks in World-Space
    if (fc.ruinPillars && fc.ruinPillars.length > 0) {
      fc.ruinPillars.forEach(rp => {
        if (!inView(rp.x, rp.y, 70)) return;
        ctx.save();
        ctx.translate(rp.x, rp.y);
        ctx.rotate(rp.rot);
        ctx.fillStyle = 'rgba(2, 5, 10, 0.65)';
        ctx.fillRect(-rp.w * 0.5 + 3, -rp.h * 0.5 + 4, rp.w, rp.h);
        ctx.fillStyle = '#334155';
        ctx.fillRect(-rp.w * 0.5, -rp.h * 0.5, rp.w, rp.h);
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.8;
        ctx.strokeRect(-rp.w * 0.5, -rp.h * 0.5, rp.w, rp.h);
        ctx.restore();
      });
    }

    if (fc.act === 3 && fc.bossWreck) {
      const bw = fc.bossWreck;
      ctx.save();
      ctx.translate(bw.x, bw.y);
      ctx.fillStyle = 'rgba(3, 6, 12, 0.82)';
      ctx.beginPath();
      ctx.ellipse(0, 8, 72, 34, 0, 0, Math.PI * 2);
      ctx.fill();

      if (bw.id === 'steam_colossus') {
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.moveTo(-48, -18); ctx.lineTo(42, -24); ctx.lineTo(34, 18); ctx.lineTo(-40, 14);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = '#090d16';
        ctx.fillRect(-20, -12, 36, 18);
        ctx.fillStyle = '#475569';
        ctx.fillRect(46, -8, 32, 18);
      } else if (bw.id === 'brood_matriarch') {
        ctx.fillStyle = '#1e1b4b';
        ctx.beginPath();
        ctx.ellipse(0, 0, 44, 28, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 4;
        for (let l = -3; l <= 3; l++) {
          ctx.beginPath();
          ctx.moveTo(l * 12, 0);
          ctx.lineTo(l * 22, (l % 2 === 0 ? -36 : 36));
          ctx.stroke();
        }
      } else if (bw.id === 'ouroboros_prime') {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(-18, -6, 48, 0.3, Math.PI * 1.4);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(22, 10, 42, 1.8, Math.PI * 2.7);
        ctx.stroke();
        for (let s = -2; s <= 2; s++) {
          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.arc(s * 24, (s % 2) * 10, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 2B. Collapsed Corrugated Metal Huts & Flying Scrap Metal Plates (Act 1)
    if (fc.collapsedHuts && fc.collapsedHuts.length > 0) {
      fc.collapsedHuts.forEach(ch => {
        if (!inView(ch.x, ch.y, 85)) return;
        ctx.save();
        ctx.translate(ch.x, ch.y);
        // Scorched oil & ash puddle beneath collapsed hut
        ctx.fillStyle = 'rgba(4, 7, 12, 0.82)';
        ctx.beginPath();
        ctx.ellipse(0, 4, 34, 18, 0, 0, Math.PI * 2);
        ctx.fill();

        // Buckled iron I-beams & twisted corrugated roof sheets
        const sheets = [
          { ox: -14, oy: -4, w: 28, h: 14, rot: -0.42, col: '#334155' },
          { ox:  12, oy:  5, w: 26, h: 13, rot:  0.55, col: '#475569' },
          { ox:  -3, oy:  8, w: 30, h: 12, rot:  0.18, col: '#1e293b' },
          { ox:   6, oy: -7, w: 22, h: 11, rot: -0.75, col: '#64748b' },
        ];
        sheets.forEach(sh => {
          ctx.save();
          ctx.translate(sh.ox, sh.oy);
          ctx.rotate(sh.rot + (ch.seed % 0.4));
          ctx.fillStyle = '#090d16';
          ctx.fillRect(-sh.w * 0.5 - 1.5, -sh.h * 0.5 - 1.5, sh.w + 3, sh.h + 3);
          ctx.fillStyle = sh.col;
          ctx.fillRect(-sh.w * 0.5, -sh.h * 0.5, sh.w, sh.h);
          // Corrugated metal ridges
          ctx.strokeStyle = 'rgba(203, 213, 225, 0.38)';
          ctx.lineWidth = 1.2;
          for (let rx = -sh.w * 0.4; rx <= sh.w * 0.4; rx += 5) {
            ctx.beginPath();
            ctx.moveTo(rx, -sh.h * 0.45);
            ctx.lineTo(rx, sh.h * 0.45);
            ctx.stroke();
          }
          // Glowing red-hot rivet embers
          ctx.fillStyle = '#f97316';
          ctx.beginPath();
          ctx.arc(-sh.w * 0.35, 0, 1.6, 0, Math.PI * 2);
          ctx.arc(sh.w * 0.35, 0, 1.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
        ctx.restore();
      });
    }

    if (fc.flyingScrap && fc.flyingScrap.length > 0) {
      fc.flyingScrap.forEach(sc => {
        if (!inView(sc.x, sc.y, 80)) return;
        ctx.save();
        // Ground shadow under flying/fallen scrap plate
        ctx.fillStyle = 'rgba(2, 6, 12, 0.55)';
        ctx.beginPath();
        ctx.ellipse(sc.x, sc.y + 4, sc.w * 0.45, sc.h * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.translate(sc.x, sc.y - sc.z);
        ctx.rotate(sc.rot);
        ctx.fillStyle = '#090d16';
        ctx.fillRect(-sc.w * 0.5 - 1, -sc.h * 0.5 - 1, sc.w + 2, sc.h + 2);
        ctx.fillStyle = sc.color || '#64748b';
        ctx.fillRect(-sc.w * 0.5, -sc.h * 0.5, sc.w, sc.h);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-sc.w * 0.35, -sc.h * 0.2);
        ctx.lineTo(sc.w * 0.35, -sc.h * 0.2);
        ctx.stroke();
        ctx.restore();
      });
    }

    // 2C. Coiled Snapped Ceiling Chains on the Floor (Act 1)
    if (fc.collapsedChains && fc.collapsedChains.length > 0) {
      fc.collapsedChains.forEach(cc => {
        if (!inView(cc.x, cc.y, 70)) return;
        ctx.save();
        ctx.translate(cc.x, cc.y);
        for (let l = 0; l < cc.links; l++) {
          const ang = cc.seed + l * 0.85;
          const lx = Math.cos(ang) * (4 + l * 2.1);
          const ly = Math.sin(ang * 1.3) * (2.5 + l * 1.3);
          ctx.save();
          ctx.translate(lx, ly);
          ctx.rotate(ang);
          ctx.strokeStyle = '#090d16';
          ctx.lineWidth = 4.2;
          ctx.strokeRect(-4, -2.5, 8, 5);
          ctx.strokeStyle = (l % 2 === 0) ? '#94a3b8' : '#64748b';
          ctx.lineWidth = 2.0;
          ctx.strokeRect(-4, -2.5, 8, 5);
          ctx.restore();
        }
        ctx.restore();
      });
    }

    // 3. Crushed Enemy Rubble Wrecks & Shattered Rock Clusters on the Dungeon Floor (Act 1 & Act 3)
    if (fc.crushedWrecks && fc.crushedWrecks.length > 0) {
      fc.crushedWrecks.forEach(cw => {
        if (!inView(cw.x, cw.y, 75)) return;
        ctx.save();
        ctx.translate(cw.x, cw.y);
        if (cw.hadEnemy) {
          ctx.fillStyle = 'rgba(153, 27, 27, 0.76)';
          ctx.beginPath();
          ctx.ellipse(0, 6, 27, 12, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.rotate(cw.rot || 0);
        const rw = cw.w || 36;
        const rh = cw.h || 24;
        // Main jagged stone slab
        ctx.fillStyle = '#090d16';
        ctx.fillRect(-rw * 0.5 - 2, -rh * 0.5 - 2, rw + 4, rh + 4);
        ctx.fillStyle = '#334155';
        ctx.fillRect(-rw * 0.5, -rh * 0.5, rw, rh);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(-rw * 0.5 + 3, -rh * 0.5 + 3, rw - 6, 6);
        // Scattered smaller broken rock chunks around the main slab for disorganized chaos
        if (cw.isChunkCluster) {
          const subChunks = [
            { ox: -rw * 0.58, oy:  rh * 0.35, sw: 11, sh: 8 },
            { ox:  rw * 0.55, oy: -rh * 0.28, sw: 13, sh: 9 },
            { ox:  rw * 0.25, oy:  rh * 0.55, sw:  9, sh: 7 },
          ];
          subChunks.forEach(sc => {
            ctx.fillStyle = '#090d16';
            ctx.fillRect(sc.ox - 1, sc.oy - 1, sc.sw + 2, sc.sh + 2);
            ctx.fillStyle = '#475569';
            ctx.fillRect(sc.ox, sc.oy, sc.sw, sc.sh);
          });
        }
        ctx.restore();
      });
    }

    // 4A. Whipping Snapped Iron Ceiling Chains Falling from Overhead (Act 1)
    if (fc.fallingChains && fc.fallingChains.length > 0) {
      fc.fallingChains.forEach(ch => {
        if (!inView(ch.x, ch.y, 140)) return;
        ctx.save();
        // Ground shadow under falling chain
        ctx.fillStyle = 'rgba(2, 6, 12, 0.52)';
        ctx.beginPath();
        ctx.ellipse(ch.x, ch.y + 6, 12, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        const baseZ = ch.z;
        for (let l = 0; l < ch.links; l++) {
          const linkY = (ch.y - baseZ) - l * 11;
          const linkX = ch.x + Math.sin(ch.swayPhase + l * 0.65) * (6 + l * 1.1);
          ctx.save();
          ctx.translate(linkX, linkY);
          ctx.rotate(Math.cos(ch.swayPhase + l * 0.65) * 0.38);
          ctx.strokeStyle = '#070a0f';
          ctx.lineWidth = 4.6;
          ctx.strokeRect(-4, -6, 8, 12);
          ctx.strokeStyle = (l % 2 === 0) ? '#cbd5e1' : '#64748b';
          ctx.lineWidth = 2.2;
          ctx.strokeRect(-4, -6, 8, 12);
          ctx.restore();
        }
        ctx.restore();
      });
    }

    // 4B. Falling 3D Ceiling Boulders, Jagged Rock Chunks & Collapsing Wall Masonry (Act 1)
    if (fc.fallingBoulders && fc.fallingBoulders.length > 0) {
      fc.fallingBoulders.forEach(b => {
        if (!inView(b.x, b.y, 120)) return;
        const prog = Math.max(0, 1 - b.z / 270);
        ctx.save();
        // Natural dark shadow on the dungeon floor that grows as the rock chunk plummets
        ctx.fillStyle = 'rgba(2, 6, 12, 0.62)';
        ctx.beginPath();
        ctx.ellipse(b.x, b.y + 8, (b.w * 0.36) + prog * 14, (b.h * 0.22) + prog * 7, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.translate(b.x, b.y - b.z);
        ctx.rotate(b.rot + b.z * 0.012);
        ctx.fillStyle = '#070a0e';
        ctx.fillRect(-b.w * 0.5 - 2, -b.h * 0.5 - 2, b.w + 4, b.h + 4);
        ctx.fillStyle = '#475569';
        ctx.fillRect(-b.w * 0.5, -b.h * 0.5, b.w, b.h);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(-b.w * 0.5 + 3, -b.h * 0.5 + 3, b.w - 6, 6);
        if (b.isChunkCluster) {
          ctx.fillStyle = '#334155';
          ctx.fillRect(-b.w * 0.68, b.h * 0.15, b.w * 0.38, b.h * 0.45);
          ctx.fillRect(b.w * 0.35, -b.h * 0.55, b.w * 0.35, b.h * 0.42);
        }
        ctx.restore();
      });
    }

    // 5. Realistic Multi-Layered Volumetric Dungeon Fires (Act 1 & Act 3)
    if (fc.worldFires && fc.worldFires.length > 0) {
      fc.worldFires.forEach(f => {
        if (!inView(f.x, f.y, 110)) return;
        drawRealisticVolumetricFire(f, now);
      });
    }
  }

  // =============================================================
  // NEXT-GEN HIGH-DEFINITION TRAILER RENDERERS
  // ("OUROBOROS ABYSS 2 - BROKEN KINGDOM")
  // =============================================================

  // Helper: Draws a 3D spherical crystal-clear dew drop resting on a leaf or mossy stone,
  // complete with drop shadow, internal caustic refraction, bright starlight glint,
  // and periodic micro-spritz / water-droplet splash rings!
  function drawMacroDewDrop(dx, dy, radius, now, seed) {
    ctx.save();
    ctx.translate(dx, dy);

    // 1. Contact shadow beneath the spherical droplet
    ctx.fillStyle = 'rgba(2, 12, 8, 0.72)';
    ctx.beginPath();
    ctx.ellipse(radius * 0.35, radius * 0.45, radius * 1.05, radius * 0.72, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // 2. Refracted internal body of the water droplet (dark upper-left, bright caustic lower-right)
    const dGrad = ctx.createRadialGradient(
      radius * 0.32, radius * 0.32, radius * 0.1,
      0, 0, radius
    );
    dGrad.addColorStop(0, 'rgba(187, 247, 208, 0.95)');
    dGrad.addColorStop(0.45, 'rgba(52, 211, 153, 0.65)');
    dGrad.addColorStop(0.82, 'rgba(6, 78, 59, 0.85)');
    dGrad.addColorStop(1, 'rgba(2, 44, 34, 0.92)');
    ctx.fillStyle = dGrad;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    // 3. Crisp upper-left specular reflection arc
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-radius * 0.34, -radius * 0.34, radius * 0.32, radius * 0.18, -0.65, 0, Math.PI * 2);
    ctx.fill();

    // 4. Dynamic star-glint & micro-spritz mist burst when overhead light catches the dew drop!
    const glintWave = Math.sin(now * 0.0045 + seed * 3.7);
    if (glintWave > 0.35) {
      const gAlpha = (glintWave - 0.35) / 0.65;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = `rgba(240, 253, 250, ${gAlpha * 0.95})`;
      ctx.lineWidth = 1.1;
      const starLen = radius * (1.8 + gAlpha * 2.2);
      ctx.beginPath();
      ctx.moveTo(-starLen, 0); ctx.lineTo(starLen, 0);
      ctx.moveTo(0, -starLen); ctx.lineTo(0, starLen);
      ctx.stroke();

      // Spritzing micro-droplets arcing off the dew drop
      for (let sp = 0; sp < 3; sp++) {
        const spProg = ((now * 0.003 + seed + sp * 0.33) % 1.0);
        const spX = (sp - 1) * radius * 2.6 * spProg;
        const spY = -Math.sin(spProg * Math.PI) * radius * 2.8 + spProg * radius * 1.5;
        ctx.fillStyle = `rgba(224, 242, 254, ${(1 - spProg) * gAlpha * 0.9})`;
        ctx.beginPath();
        ctx.arc(spX, spY, Math.max(0.5, radius * 0.28 * (1 - spProg)), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // Renders a hyper-detailed, lush, plant-rich 3D dungeon room with
  // porous weathered rocks, wet specular sheen, unfurling fern fiddleheads,
  // serrated veined leaves, glinting/spritzing dew drops, directional overhead
  // shadows, a crumbled wall with an escape hole, and toppled fluted pillars!
  function drawNextGenLushDungeonRoom(now, camTiltSky) {
    // Deep gloomy subterranean ambient backdrop
    const bgGrad = ctx.createRadialGradient(20, -20, 30, 0, 0, 480);
    bgGrad.addColorStop(0, '#111c16');
    bgGrad.addColorStop(0.55, '#070d0a');
    bgGrad.addColorStop(1, '#010302');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(-600, -600, 1200, 1200);

    // 1. 3D-Beveled Porous Weathered Flagstone Terrain with Wet Specular Sheen & Micro-Pitting
    for (let r = -5; r <= 5; r++) {
      for (let c = -7; c <= 7; c++) {
        const tx = c * 56 + ((r % 2) * 28);
        const ty = r * 44;
        const hash = Math.abs((r * 31 + c * 53) % 100);

        // Deep recessed mortar crevice ambient occlusion
        ctx.fillStyle = '#020504';
        ctx.fillRect(tx - 28, ty - 22, 56, 44);

        // Drop shadow cast by the stone slab's raised 3D lip into the mortar
        ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
        ctx.beginPath();
        ctx.roundRect(tx - 23, ty - 17, 50, 38, 5);
        ctx.fill();

        // 3D Stone Slab Gradient (lit from upper-left overhead light shafts)
        const sGrad = ctx.createLinearGradient(tx - 25, ty - 19, tx + 25, ty + 19);
        if (hash < 34) {
          sGrad.addColorStop(0, '#2b4034');
          sGrad.addColorStop(0.5, '#192720');
          sGrad.addColorStop(1, '#09110d');
        } else {
          sGrad.addColorStop(0, '#334155');
          sGrad.addColorStop(0.5, '#1e293b');
          sGrad.addColorStop(1, '#0b111e');
        }
        ctx.fillStyle = sGrad;
        ctx.beginPath();
        ctx.roundRect(tx - 25, ty - 19, 50, 38, 5);
        ctx.fill();

        // Wet condensation / damp rock specular sheen where overhead light hits the center
        const distFromLight = Math.hypot(tx + 10, ty + 10);
        if (distFromLight < 210) {
          const wetAlpha = (1 - distFromLight / 210) * 0.24;
          const wetGrad = ctx.createRadialGradient(tx - 10, ty - 8, 1, tx - 6, ty - 4, 24);
          wetGrad.addColorStop(0, `rgba(226, 232, 240, ${wetAlpha})`);
          wetGrad.addColorStop(0.6, `rgba(148, 163, 184, ${wetAlpha * 0.4})`);
          wetGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
          ctx.fillStyle = wetGrad;
          ctx.fillRect(tx - 24, ty - 18, 48, 36);
        }

        // Top-left 3D specular bevel highlight & bottom-right dark chamfer
        ctx.strokeStyle = 'rgba(203, 213, 225, 0.28)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(tx - 23, ty + 16);
        ctx.lineTo(tx - 23, ty - 17);
        ctx.lineTo(tx + 22, ty - 17);
        ctx.stroke();

        // Porous rock micro-pitting, mineral grain & weathered fracture lines
        for (let p = 0; p < 5; p++) {
          const px = tx - 18 + ((hash * (p + 3)) % 36);
          const py = ty - 12 + ((hash * (p + 7)) % 24);
          ctx.fillStyle = (p % 2 === 0) ? 'rgba(3, 7, 12, 0.72)' : 'rgba(148, 163, 184, 0.18)';
          ctx.beginPath();
          ctx.arc(px, py, 1.1 + (p % 2) * 0.7, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.strokeStyle = 'rgba(3, 6, 10, 0.72)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(tx - 14 + (hash % 9), ty - 7);
        ctx.lineTo(tx + 3, ty + 4);
        ctx.lineTo(tx + 15, ty - 2);
        ctx.stroke();

        // Lush 3D cushion moss & lichen clusters growing across stone seams
        if (hash % 3 !== 0) {
          const mossX = tx + ((hash % 5) - 2) * 7;
          const mossY = ty + ((hash % 4) - 1.5) * 6;
          // Moss cushion drop shadow
          ctx.fillStyle = 'rgba(1, 5, 3, 0.75)';
          ctx.beginPath();
          ctx.ellipse(mossX + 2.5, mossY + 3, 16 + (hash % 7), 11 + (hash % 5), (hash % 6) * 0.5, 0, Math.PI * 2);
          ctx.fill();

          const mGrad = ctx.createRadialGradient(mossX - 4, mossY - 4, 1, mossX, mossY, 16 + (hash % 8));
          mGrad.addColorStop(0, '#86efac');
          mGrad.addColorStop(0.32, '#22c55e');
          mGrad.addColorStop(0.72, '#14532d');
          mGrad.addColorStop(1, 'rgba(5, 46, 22, 0)');
          ctx.fillStyle = mGrad;
          ctx.beginPath();
          ctx.ellipse(mossX, mossY, 16 + (hash % 7), 11 + (hash % 5), (hash % 6) * 0.5, 0, Math.PI * 2);
          ctx.fill();

          // Micro moss spore-stalks / velvety texture tufts
          ctx.fillStyle = '#bbf7d0';
          for (let mt = 0; mt < 4; mt++) {
            const mx = mossX - 6 + ((hash + mt * 11) % 13);
            const my = mossY - 4 + ((hash + mt * 7) % 9);
            ctx.fillRect(mx, my, 1.3, 1.3);
          }
        }

        // Specular subterranean water puddles with animated dew-drip ripples
        if (hash === 12 || hash === 47 || hash === 78 || hash === 33) {
          const pGrad = ctx.createRadialGradient(tx - 4, ty - 3, 2, tx, ty, 24);
          pGrad.addColorStop(0, 'rgba(224, 242, 254, 0.48)');
          pGrad.addColorStop(0.5, 'rgba(14, 116, 144, 0.32)');
          pGrad.addColorStop(1, 'rgba(8, 47, 73, 0)');
          ctx.fillStyle = pGrad;
          ctx.beginPath();
          ctx.ellipse(tx, ty, 23, 13.5, 0.18, 0, Math.PI * 2);
          ctx.fill();

          // Concentric water-droplet ripple ring in the puddle
          const ripProg = ((now * 0.0012 + hash * 0.17) % 1.0);
          ctx.strokeStyle = `rgba(224, 242, 254, ${(1 - ripProg) * 0.55})`;
          ctx.lineWidth = 1.0;
          ctx.beginPath();
          ctx.ellipse(tx, ty, 3 + ripProg * 18, 1.8 + ripProg * 10, 0.18, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    // 2. Creeping Gnarled Dungeon Roots & Tangled Ground Vines with Cast Shadows
    for (let v = 0; v < 9; v++) {
      const vy = -130 + v * 32;
      // Cast shadow from overhead light
      ctx.strokeStyle = 'rgba(1, 4, 3, 0.72)';
      ctx.lineWidth = 5.5 - (v % 2) * 1.2;
      ctx.beginPath();
      ctx.moveTo(-256, vy + 4);
      ctx.bezierCurveTo(-106, vy + 28, 34, vy - 22, 224, vy + 18);
      ctx.stroke();

      // Main woody root / vine stem
      ctx.strokeStyle = '#052e16';
      ctx.lineWidth = 4.6 - (v % 2) * 1.2;
      ctx.beginPath();
      ctx.moveTo(-260, vy);
      ctx.bezierCurveTo(-110, vy + 24, 30, vy - 26, 220, vy + 14);
      ctx.stroke();

      // Specular wet highlight along top edge of root
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }

    // 3. Crumbled Dungeon Wall & Dark Escape Hole in the Rubble + Toppled 3D Fluted Stone Pillars (Right Side: x = 115..220)
    ctx.save();
    ctx.translate(148, -12);

    // Long directional shadow cast by the crumbled wall & toppled pillars onto the dungeon floor
    ctx.fillStyle = 'rgba(1, 4, 6, 0.82)';
    ctx.beginPath();
    ctx.ellipse(28, 18, 78, 94, -0.15, 0, Math.PI * 2);
    ctx.fill();

    // Deep pitch-black escape hole in the ruined wall base (where the snake is slithering toward!)
    const holeGrad = ctx.createRadialGradient(2, 6, 4, 6, 6, 38);
    holeGrad.addColorStop(0, '#000000');
    holeGrad.addColorStop(0.68, '#020408');
    holeGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = holeGrad;
    ctx.beginPath();
    ctx.ellipse(4, 6, 29, 35, -0.1, 0, Math.PI * 2);
    ctx.fill();

    // Jagged broken masonry blocks framing the hole with 3D depth planes, rock pores & dew drops
    const rubbleBlocks = [
      { rx: -18, ry: -32, rw: 35, rh: 23, rot: -0.28 },
      { rx:  16, ry: -38, rw: 39, rh: 25, rot:  0.22 },
      { rx: -14, ry:  32, rw: 37, rh: 21, rot:  0.18 },
      { rx:  22, ry:  28, rw: 33, rh: 23, rot: -0.35 },
      { rx:  34, ry:  -4, rw: 31, rh: 37, rot:  0.12 },
    ];
    rubbleBlocks.forEach((rb, rbIdx) => {
      ctx.save();
      ctx.translate(rb.rx, rb.ry);
      ctx.rotate(rb.rot);
      // Directional cast shadow from overhead light
      ctx.fillStyle = 'rgba(0, 2, 5, 0.82)';
      ctx.fillRect(-rb.rw * 0.5 + 5, -rb.rh * 0.5 + 7, rb.rw + 2, rb.rh + 2);

      // Extruded 3D dark underside plane
      ctx.fillStyle = '#090d16';
      ctx.fillRect(-rb.rw * 0.5 - 2, -rb.rh * 0.5 - 2, rb.rw + 4, rb.rh + 6);

      const bGrad = ctx.createLinearGradient(-rb.rw * 0.5, -rb.rh * 0.5, rb.rw * 0.5, rb.rh * 0.5);
      bGrad.addColorStop(0, '#94a3b8');
      bGrad.addColorStop(0.35, '#475569');
      bGrad.addColorStop(0.8, '#1e293b');
      bGrad.addColorStop(1, '#090d16');
      ctx.fillStyle = bGrad;
      ctx.fillRect(-rb.rw * 0.5, -rb.rh * 0.5, rb.rw, rb.rh);

      // Chiseled fracture lines & rock pores
      ctx.strokeStyle = 'rgba(2, 6, 12, 0.78)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-rb.rw * 0.3, -rb.rh * 0.2);
      ctx.lineTo(0, rb.rh * 0.15);
      ctx.lineTo(rb.rw * 0.35, -rb.rh * 0.1);
      ctx.stroke();

      // Thick velvety moss cap + glinting dew drop on the wet stone
      ctx.fillStyle = '#15803d';
      ctx.fillRect(-rb.rw * 0.45, -rb.rh * 0.5, rb.rw * 0.72, 5.5);
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(-rb.rw * 0.42, -rb.rh * 0.5, rb.rw * 0.5, 2.2);
      drawMacroDewDrop(-rb.rw * 0.15, -rb.rh * 0.35, 2.2, now, rbIdx + 10);
      ctx.restore();
    });

    // Two Massive 3D Fluted Stone Pillars that have toppled onto each other over the ruined wall!
    const toppledPillars = [
      { px: -6, py: -42, len: 120, rad: 18.5, ang:  0.52 },
      { px: 12, py:  44, len: 114, rad: 17.5, ang: -0.64 },
    ];
    toppledPillars.forEach((pl, pIdx) => {
      ctx.save();
      ctx.translate(pl.px, pl.py);
      ctx.rotate(pl.ang);
      // Long directional cast shadow under toppled pillar
      ctx.fillStyle = 'rgba(1, 3, 7, 0.85)';
      ctx.fillRect(-pl.len * 0.5 + 8, -pl.rad + 10, pl.len, pl.rad * 2.1);

      // Cylindrical 3D shaded stone column shaft
      const cylGrad = ctx.createLinearGradient(0, -pl.rad, 0, pl.rad);
      cylGrad.addColorStop(0, '#cbd5e1');
      cylGrad.addColorStop(0.22, '#64748b');
      cylGrad.addColorStop(0.65, '#334155');
      cylGrad.addColorStop(1, '#090d16');
      ctx.fillStyle = cylGrad;
      ctx.fillRect(-pl.len * 0.5, -pl.rad, pl.len, pl.rad * 2);

      // Carved stone flutes, deep shadow grooves & specular ridge highlights
      for (let fl = -pl.rad + 4.5; fl < pl.rad - 2; fl += 5.5) {
        ctx.strokeStyle = 'rgba(9, 13, 22, 0.82)';
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        ctx.moveTo(-pl.len * 0.48, fl);
        ctx.lineTo(pl.len * 0.48, fl);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(226, 232, 240, 0.25)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-pl.len * 0.48, fl - 1.2);
        ctx.lineTo(pl.len * 0.48, fl - 1.2);
        ctx.stroke();
      }
      // Overgrown ivy & moss wrapping the fallen pillar + dew drop
      ctx.strokeStyle = '#14532d';
      ctx.lineWidth = 4.2;
      ctx.beginPath();
      ctx.moveTo(-pl.len * 0.35, -pl.rad);
      ctx.quadraticCurveTo(0, pl.rad, pl.len * 0.3, -pl.rad);
      ctx.stroke();
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      drawMacroDewDrop(8, -4, 2.5, now, pIdx + 20);
      ctx.restore();
    });
    ctx.restore();

    // 4. Lush Multi-Frond 3D Dungeon Ferns, Unfurling Fiddleheads & Dew-Covered Flora Clusters
    const fernClusters = [
      { fx: -165, fy: -48, sc: 1.28 },
      { fx: -105, fy:  54, sc: 1.38 },
      { fx:  -45, fy: -62, sc: 1.18 },
      { fx:   25, fy:  62, sc: 1.34 },
      { fx:   82, fy: -56, sc: 1.42 },
      { fx:   95, fy:  48, sc: 1.28 },
      { fx: -195, fy:  36, sc: 1.22 },
      { fx:  135, fy: -68, sc: 1.36 },
      { fx:  -12, fy:  46, sc: 1.15 },
      { fx:  -78, fy: -28, sc: 1.12 },
    ];
    fernClusters.forEach((fcItem, idx) => {
      ctx.save();
      ctx.translate(fcItem.fx, fcItem.fy);
      ctx.scale(fcItem.sc, fcItem.sc);
      const sway = Math.sin(now * 0.0025 + idx * 1.4) * 0.07;

      // Directional cast shadow projected onto the stones from overhead light beams
      ctx.fillStyle = 'rgba(1, 4, 3, 0.80)';
      ctx.beginPath();
      ctx.ellipse(9, 11, 28, 16, 0.25, 0, Math.PI * 2);
      ctx.fill();

      // 10 Radiating serrated fern fronds with individual pinnae leaflets, midrib, lateral veins & subsurface scattering!
      for (let f = 0; f < 10; f++) {
        const ang = (f / 10) * Math.PI * 2 + sway + idx * 0.5;
        const frondLen = 24 + (f % 3) * 6.5;
        ctx.save();
        ctx.rotate(ang);

        // Frond drop shadow on lower leaves
        ctx.fillStyle = 'rgba(2, 8, 5, 0.55)';
        ctx.beginPath();
        ctx.ellipse(frondLen * 0.52, 2.5, frondLen * 0.48, 5.2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Main serrated leaf blade with translucent backlit subsurface scattering gradient
        const lGrad = ctx.createLinearGradient(0, -6, frondLen, 6);
        lGrad.addColorStop(0, '#052e16');
        lGrad.addColorStop(0.45, '#15803d');
        lGrad.addColorStop(0.82, '#22c55e');
        lGrad.addColorStop(1, '#bef264'); // Translucent lime-emerald backlit tip
        ctx.fillStyle = lGrad;
        ctx.beginPath();
        ctx.moveTo(0, -2.2);
        // Serrated pinnae lobes along top edge
        for (let p = 1; p <= 5; p++) {
          const px = (p / 5) * frondLen;
          const pw = Math.sin((p / 5) * Math.PI) * 7.2;
          ctx.lineTo(px - 2.2, -pw);
          ctx.lineTo(px, -pw * 0.55);
        }
        ctx.lineTo(frondLen + 1.5, 0);
        // Serrated pinnae lobes along bottom edge
        for (let p = 5; p >= 1; p--) {
          const px = (p / 5) * frondLen;
          const pw = Math.sin((p / 5) * Math.PI) * 7.2;
          ctx.lineTo(px, pw * 0.55);
          ctx.lineTo(px - 2.2, pw);
        }
        ctx.closePath();
        ctx.fill();

        // Crisp central midrib & angled lateral leaf venation
        ctx.strokeStyle = '#dcfce7';
        ctx.lineWidth = 0.85;
        ctx.beginPath();
        ctx.moveTo(1.5, 0);
        ctx.lineTo(frondLen - 1.5, 0);
        for (let v = 1; v <= 4; v++) {
          const vx = (v / 5) * frondLen;
          const vw = Math.sin((v / 5) * Math.PI) * 4.8;
          ctx.moveTo(vx, 0); ctx.lineTo(vx + 2.2, -vw);
          ctx.moveTo(vx, 0); ctx.lineTo(vx + 2.2,  vw);
        }
        ctx.stroke();

        // Place glinting 3D spherical dew drops on select fern fronds!
        if (f % 3 === 0) {
          drawMacroDewDrop(frondLen * 0.62, -1.2, 2.1, now, idx * 7 + f);
        }
        ctx.restore();
      }

      // Coiled unfurling fern fiddlehead spirals rising from the center of the plant!
      ctx.strokeStyle = '#86efac';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(5, -7, 2, -11);
      ctx.arc(0.5, -9.5, 2.2, 0, Math.PI * 1.6);
      ctx.stroke();

      ctx.restore();
    });

    // If camera is tilting sky/ceiling-ward (Shot 2), draw broken vaulted ceiling arches above!
    if (camTiltSky > 0.05) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, camTiltSky * 1.3);
      const ceilGrad = ctx.createLinearGradient(0, -340, 0, -80);
      ceilGrad.addColorStop(0, '#020609');
      ceilGrad.addColorStop(0.6, 'rgba(9, 18, 28, 0.88)');
      ceilGrad.addColorStop(1, 'rgba(9, 18, 28, 0)');
      ctx.fillStyle = ceilGrad;
      ctx.fillRect(-450, -380, 900, 320);

      // Cracked overhead ceiling stone ribs & hanging vines where sky light pours through
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 18;
      ctx.beginPath();
      ctx.arc(0, -80, 220, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      ctx.restore();
    }
  }

  // =============================================================
  // NEXT-GEN HIGH-DEFINITION SNAKE CLAN WARRIOR
  // 28 articulated sinusoidal body segments, individual 3D keeled diamond
  // scales with micro-ridges & iridescent wet glints, directional overhead
  // cast shadows, reflective Pharaonic gold armor plates, flared Royal Cobra
  // hood, slit viper eye, venom fangs & forked tongue!
  // =============================================================
  function drawNextGenHDSnake(snakeX, snakeY, now, squirmIntensity, isDead) {
    ctx.save();
    ctx.translate(snakeX, snakeY);

    const slitherSpeed = isDead ? 0 : (squirmIntensity > 0 ? 0.028 : 0.011);
    const waveAmp = isDead ? 3.5 : (squirmIntensity > 0 ? 11.5 : 8.5);
    const phase = isDead ? 2.4 : (now * slitherSpeed);

    // 1. Compute 28 articulated spine nodes from tail (-105) to head (0)
    const numSegs = 28;
    const nodes = [];
    for (let i = 0; i < numSegs; i++) {
      const frac = i / (numSegs - 1); // 0 = tail tip, 1 = neck/head
      const sx = -105 * (1 - frac);
      const env = Math.sin(frac * Math.PI);
      const sy = Math.sin(phase - (1 - frac) * 6.2) * waveAmp * (0.35 + 0.65 * env) +
                 (squirmIntensity > 0 && !isDead ? Math.cos(now * 0.045 + i * 0.6) * 4.5 * squirmIntensity : 0);
      const radius = 2.5 + Math.pow(frac, 0.65) * 11.5;
      nodes.push({ x: sx, y: sy, r: radius, frac });
    }

    // 1A. Long directional cast shadow projected by the overhead light beams onto the mossy stones
    ctx.fillStyle = 'rgba(1, 3, 6, 0.62)';
    nodes.forEach(n => {
      ctx.beginPath();
      ctx.ellipse(n.x + 11, n.y + 14, n.r * 1.28, n.r * 0.85, 0.15, 0, Math.PI * 2);
      ctx.fill();
    });

    // 1B. Deep tight contact ambient occlusion shadow directly beneath the undulating serpent body
    ctx.fillStyle = 'rgba(1, 4, 6, 0.88)';
    nodes.forEach(n => {
      ctx.beginPath();
      ctx.ellipse(n.x + 2, n.y + 5.5, n.r * 1.12, n.r * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    // 2. Render Royal Cobra Flared Hood behind the upper neck (matching index.html Snake Clan hood!)
    const neckNode = nodes[numSegs - 4];
    const headNode = nodes[numSegs - 1];
    const hoodFlare = isDead ? 0.82 : (1.0 + (squirmIntensity > 0 ? Math.sin(now * 0.04) * 0.16 : 0.05));
    ctx.save();
    ctx.translate(neckNode.x + 4, neckNode.y);
    ctx.scale(1.0, hoodFlare);

    // Directional shadow cast by the flared cobra hood from overhead light
    ctx.fillStyle = 'rgba(1, 3, 6, 0.72)';
    ctx.beginPath();
    ctx.ellipse(9, 12, 20, 24, 0.12, 0, Math.PI * 2);
    ctx.fill();

    const hoodGrad = ctx.createRadialGradient(-3, -4, 3, 0, 0, 24);
    hoodGrad.addColorStop(0, '#86efac');
    hoodGrad.addColorStop(0.38, '#16a34a');
    hoodGrad.addColorStop(0.78, '#064e3b');
    hoodGrad.addColorStop(1, '#022c22');
    ctx.fillStyle = hoodGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, 19, 23, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#04120b';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Elongated ribbed hood-scale striation lines radiating from neck
    ctx.strokeStyle = 'rgba(4, 47, 46, 0.65)';
    ctx.lineWidth = 1.0;
    for (let hr = -3; hr <= 3; hr++) {
      if (hr === 0) continue;
      ctx.beginPath();
      ctx.moveTo(-6, hr * 2);
      ctx.quadraticCurveTo(2, hr * 6, -4, hr * 7.2);
      ctx.stroke();
    }

    // Twin hypnotic cobra hood spectacle eye-spots (matching index.html lines 9903-9908)
    [-12, 12].forEach(hy => {
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.ellipse(-2, hy, 4.6, 3.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.arc(-2, hy, 1.9, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // 3. Render 28 3D-Shaded Cylindrical Serpent Segments + Keeled Diamond Reptile Scutellation & Wet Iridescent Glints!
    for (let i = 0; i < numSegs - 1; i++) {
      const n = nodes[i];
      const next = nodes[i + 1];
      const ang = Math.atan2(next.y - n.y, next.x - n.x);

      ctx.save();
      ctx.translate(n.x, n.y);
      ctx.rotate(ang);

      // 3D Cylindrical Normal-Lit Body Segment (bright dorsal top lit by overhead god-rays, deep shaded underside)
      const segGrad = ctx.createLinearGradient(0, -n.r, 0, n.r);
      segGrad.addColorStop(0, '#042f1e');
      segGrad.addColorStop(0.22, '#4ade80');
      segGrad.addColorStop(0.50, '#15803d');
      segGrad.addColorStop(0.78, '#ca8a04'); // Golden-ochre ventral belly scutes
      segGrad.addColorStop(1, '#021008');
      ctx.fillStyle = segGrad;
      ctx.beginPath();
      ctx.ellipse(0, 0, n.r * 0.96, n.r, 0, 0, Math.PI * 2);
      ctx.fill();

      // Segmented golden ventral belly scutes (transverse overlapping plates) along lower edge
      if (i > 2) {
        ctx.fillStyle = (i % 2 === 0) ? '#fde047' : '#eab308';
        ctx.fillRect(-n.r * 0.48, n.r * 0.46, n.r * 0.85, 2.4);
        ctx.strokeStyle = '#422006';
        ctx.lineWidth = 0.7;
        ctx.strokeRect(-n.r * 0.48, n.r * 0.46, n.r * 0.85, 2.4);
      }

      // Interlocking keeled diamond/hexagonal reptile scales (scutellation) with central longitudinal keel ridge & wet iridescent specular glints!
      if (i > 2) {
        for (let sr = -1; sr <= 1; sr++) {
          const syOff = sr * (n.r * 0.46);
          const sxOff = (sr === 0) ? n.r * 0.18 : -n.r * 0.12;
          const sw = n.r * 0.42;
          const sh = n.r * 0.28;
          const specSheen = Math.max(0, Math.sin(now * 0.009 + i * 0.58 + sr * 1.3));

          // Deep interstitial skin pocket shadow around each scale
          ctx.fillStyle = '#02180e';
          ctx.beginPath();
          ctx.moveTo(sxOff - sw - 0.8, syOff);
          ctx.lineTo(sxOff, syOff - sh - 0.8);
          ctx.lineTo(sxOff + sw + 0.8, syOff);
          ctx.lineTo(sxOff, syOff + sh + 0.8);
          ctx.closePath();
          ctx.fill();

          // Individual 3D convex scale face
          const scGrad = ctx.createLinearGradient(sxOff, syOff - sh, sxOff, syOff + sh);
          if (specSheen > 0.72) {
            scGrad.addColorStop(0, '#ecfdf5'); // Wet iridescent emerald-cyan glint!
            scGrad.addColorStop(0.5, '#6ee7b7');
            scGrad.addColorStop(1, '#047857');
          } else {
            scGrad.addColorStop(0, sr === -1 ? '#86efac' : '#4ade80');
            scGrad.addColorStop(0.55, '#15803d');
            scGrad.addColorStop(1, '#064e3b');
          }
          ctx.fillStyle = scGrad;
          ctx.beginPath();
          ctx.moveTo(sxOff - sw, syOff);
          ctx.lineTo(sxOff, syOff - sh);
          ctx.lineTo(sxOff + sw, syOff);
          ctx.lineTo(sxOff, syOff + sh);
          ctx.closePath();
          ctx.fill();

          // Raised central longitudinal keel ridge across the scale (authentic viper/cobra keeled scale anatomy)
          ctx.strokeStyle = specSheen > 0.65 ? '#ffffff' : 'rgba(187, 247, 208, 0.72)';
          ctx.lineWidth = 0.85;
          ctx.beginPath();
          ctx.moveTo(sxOff - sw * 0.65, syOff);
          ctx.lineTo(sxOff + sw * 0.65, syOff);
          ctx.stroke();
        }
      }

      // 4. Ornate Reflective Pharaonic Gold Armor Cuirass & Pauldrons on Upper Torso Segments (i === 18..23)
      if (i === 19 || i === 21 || i === 23) {
        // Cast shadow of gold armor band onto scales
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(-3.5, -n.r * 1.05, 11, n.r * 2.14);

        const armGrad = ctx.createLinearGradient(-6, -n.r * 1.08, 6, n.r * 1.08);
        const glintPos = 0.3 + Math.sin(now * 0.006 + i) * 0.2;
        armGrad.addColorStop(0, '#78350f');
        armGrad.addColorStop(Math.max(0.05, glintPos - 0.12), '#d97706');
        armGrad.addColorStop(glintPos, '#ffffff'); // High-contrast metallic specular reflection!
        armGrad.addColorStop(Math.min(0.95, glintPos + 0.14), '#ca8a04');
        armGrad.addColorStop(1, '#451a03');

        ctx.fillStyle = armGrad;
        ctx.strokeStyle = '#1c0a00';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.roundRect(-5, -n.r * 1.08, 10, n.r * 2.16, 2.5);
        ctx.fill();
        ctx.stroke();

        // Engraved beveled trim & crimson chest scarab gem on center armor plate
        if (i === 21) {
          ctx.fillStyle = '#dc2626';
          ctx.beginPath();
          ctx.arc(0, 0, 3.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-1.4, -1.6, 1.8, 1.8);
        }
      }

      ctx.restore();
    }

    // 5. Angular High-Definition Viper Head, Supraocular Scale Plates, Golden Brow Crown, Slit Eye, Venom Fangs & Forked Tongue
    ctx.save();
    ctx.translate(headNode.x + 8, headNode.y);
    const headTilt = isDead ? 0.35 : (squirmIntensity > 0 ? Math.sin(now * 0.05) * 0.42 : Math.cos(phase) * 0.14);
    ctx.rotate(headTilt);

    // Directional shadow cast by the viper head onto the stones
    ctx.fillStyle = 'rgba(1, 3, 6, 0.72)';
    ctx.beginPath();
    ctx.ellipse(6, 11, 16, 11, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // 3D Viper Cranium & Snout
    const headGrad = ctx.createRadialGradient(-2, -3, 2, 2, 0, 18);
    headGrad.addColorStop(0, '#bbf7d0');
    headGrad.addColorStop(0.32, '#22c55e');
    headGrad.addColorStop(0.75, '#14532d');
    headGrad.addColorStop(1, '#052e16');
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.moveTo(-12, -11);
    ctx.lineTo(6, -9);
    ctx.lineTo(19, -3.5);
    ctx.lineTo(19, 3.5);
    ctx.lineTo(6, 9);
    ctx.lineTo(-12, 11);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#04120b';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // polygonal cranial parietal/frontal head scutes
    ctx.strokeStyle = 'rgba(4, 47, 46, 0.75)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-9, 0); ctx.lineTo(-2, -4); ctx.lineTo(5, 0); ctx.lineTo(-2, 4); ctx.closePath();
    ctx.moveTo(5, 0); ctx.lineTo(14, -2); ctx.moveTo(5, 0); ctx.lineTo(14, 2);
    ctx.stroke();

    // Head scale ridge & golden crown brow plate (matching index.html lines 9954-9957)
    ctx.fillStyle = '#fde047';
    ctx.fillRect(-8, -7.5, 11, 2.5);
    ctx.fillRect(-8, 5.0, 11, 2.5);

    // Flickering Forked Crimson Tongue (or hanging limp when dead)
    if (isDead || Math.sin(now * 0.018) > -0.25) {
      const tongueExt = isDead ? 10 : (11 + Math.sin(now * 0.04) * 5);
      const tongueDrop = isDead ? 6 : 0;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(18 + tongueExt, tongueDrop);
      ctx.lineTo(18 + tongueExt + 5, tongueDrop - 3.5);
      ctx.moveTo(18 + tongueExt, tongueDrop);
      ctx.lineTo(18 + tongueExt + 5, tongueDrop + 3.5);
      ctx.stroke();
    }

    // Curved Ivory Venom Fangs + Glinting Neon-Green Venom Droplet
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(12, -6); ctx.lineTo(17, -8.5); ctx.lineTo(14, -4);
    ctx.moveTo(12,  6); ctx.lineTo(17,  8.5); ctx.lineTo(14,  4);
    ctx.fill();
    ctx.fillStyle = '#39ff14';
    ctx.beginPath();
    ctx.arc(17, 8.5, 1.9, 0, Math.PI * 2);
    ctx.fill();

    // Fierce Glowing Viper Eyes with Vertical Crimson Slit & Specular Glint
    [-5.5, 5.5].forEach(ey => {
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.ellipse(2, ey, 4.2, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!isDead) {
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.ellipse(2, ey, 3.4, 2.0, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(1.2, ey - 2.0, 1.6, 4.0);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(2.2, ey - 1.4, 1.3, 1.3);
      } else {
        // Dimmed lifeless eye after death growl
        ctx.fillStyle = '#475569';
        ctx.beginPath();
        ctx.ellipse(2, ey, 2.8, 1.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    ctx.restore();
    ctx.restore();
  }

  // =============================================================
  // NEXT-GEN HD MUDDY ARMORED BOOT STOMP (Shot 2 & Shot 3)
  // =============================================================
  function drawNextGenMuddyArmoredBoot(bx, by, bootLiftZ, scaleMul) {
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(scaleMul, scaleMul);

    // Expanding directional & contact shadow on the snake as the boot descends through the overhead light beam
    const shadowScale = Math.max(0.25, 1.0 - bootLiftZ / 260);
    ctx.fillStyle = `rgba(1, 3, 7, ${0.86 * shadowScale})`;
    ctx.beginPath();
    ctx.ellipse(6 * shadowScale, 9, 36 * shadowScale, 19 * shadowScale, 0.12, 0, Math.PI * 2);
    ctx.fill();

    // Muddy splatter, water droplets & shockwave ring on the stones when boot impacts (bootLiftZ <= 2)
    if (bootLiftZ <= 2) {
      ctx.fillStyle = 'rgba(69, 26, 3, 0.82)';
      for (let m = 0; m < 10; m++) {
        const ma = (m / 10) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(Math.cos(ma) * 33, 6 + Math.sin(ma) * 16, 7.5, 4.2, ma, 0, Math.PI * 2);
        ctx.fill();
      }
      // Glinting water/dew droplets kicked up by the muddy boot impact
      ctx.fillStyle = 'rgba(224, 242, 254, 0.85)';
      for (let d = 0; d < 6; d++) {
        const da = (d / 6) * Math.PI * 2 + 0.3;
        ctx.beginPath();
        ctx.arc(Math.cos(da) * 36, 4 + Math.sin(da) * 18, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.translate(0, -bootLiftZ);

    // 1. Heavy Dark-Leather War-Boot Sole & Deep Lug Tread Caked in Wet Glossy Dungeon Mud
    ctx.fillStyle = '#090c10';
    ctx.beginPath();
    ctx.roundRect(-24, -8, 48, 22, 7);
    ctx.fill();

    const bootGrad = ctx.createLinearGradient(-22, -8, 22, 12);
    bootGrad.addColorStop(0, '#4e342e');
    bootGrad.addColorStop(0.55, '#27170e');
    bootGrad.addColorStop(1, '#110904');
    ctx.fillStyle = bootGrad;
    ctx.beginPath();
    ctx.roundRect(-22, -6, 44, 18, 6);
    ctx.fill();

    // Deep lug-tread notches along the boot sole bottom edge
    ctx.fillStyle = '#05070a';
    for (let lg = -18; lg <= 16; lg += 7) {
      ctx.fillRect(lg, 9, 4, 3.5);
    }

    // Thick 3D clumps of wet dungeon mud, crushed moss & specular moisture glints stuck to boot toe & sole!
    ctx.fillStyle = '#451a03';
    ctx.beginPath();
    ctx.ellipse(-10, 8, 12.5, 5.2, 0.1, 0, Math.PI * 2);
    ctx.ellipse(11, 7, 13.5, 5.8, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.ellipse(-8, 6, 7.5, 3.0, 0, 0, Math.PI * 2);
    ctx.ellipse(12, 5.5, 8.2, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Wet mud specular moisture highlight
    ctx.fillStyle = 'rgba(254, 243, 199, 0.55)';
    ctx.fillRect(-11, 5, 4, 1.4);
    ctx.fillRect(10, 4.5, 4.5, 1.4);

    // 2. 3D Fluted Steel Shin-Greave Plates & Riveted Leather Straps above the Boot
    const greaveGrad = ctx.createLinearGradient(-18, -42, 18, -4);
    greaveGrad.addColorStop(0, '#f8fafc');
    greaveGrad.addColorStop(0.28, '#94a3b8');
    greaveGrad.addColorStop(0.68, '#334155');
    greaveGrad.addColorStop(1, '#090d16');
    ctx.fillStyle = greaveGrad;
    ctx.strokeStyle = '#090d14';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-17, -42, 34, 32, 4);
    ctx.fill();
    ctx.stroke();

    // Metallic specular ridge, battle scratch & brass rivets on shin greave
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-12, -39, 4.5, 26);
    ctx.fillStyle = '#fbbf24';
    [-34, -22, -12].forEach(ry => {
      ctx.beginPath();
      ctx.arc(-13, ry, 1.9, 0, Math.PI * 2);
      ctx.arc(13, ry, 1.9, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }

  // =============================================================
  // NEXT-GEN HIGH-DEFINITION BADGER WARRIOR (Shot 3 & Shot 4)
  // Faithful to drawPlayerHero: directional coarse guard-hair fur strands,
  // crisp twin silver-white skull-blaze stripes, rim-lit fur tips from
  // overhead light shafts, directional ground shadow, 3D fluted steel & gold
  // plate armor, muddy greaves crushing the snake, and runed greatsword!
  // =============================================================
  function drawNextGenHDBadgerWarrior(bx, by, now) {
    ctx.save();
    ctx.translate(bx, by);

    const breathe = Math.sin(now * 0.004) * 1.5;

    // 0. Elongated Directional Cast Shadow Projected onto the Dungeon Stones from the Overhead Light Shafts!
    ctx.save();
    ctx.fillStyle = 'rgba(1, 3, 7, 0.78)';
    ctx.beginPath();
    ctx.ellipse(22, 22, 46, 22, 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 1. Back Leg (planted firmly on mossy stones) + Right Leg (planting muddy boot squarely onto the Snake at +14, +10!)
    drawNextGenMuddyArmoredBoot(-22, 12, 0, 0.72);
    drawNextGenMuddyArmoredBoot(14, 10, 0, 0.86);

    // 2. Layered Flowing Battle Cloak behind Badger's shoulders with weathered hem & rim lighting
    ctx.fillStyle = '#090d14';
    ctx.beginPath();
    ctx.moveTo(-28, -42);
    ctx.quadraticCurveTo(-38, -2, -34, 16);
    ctx.lineTo(18, 14);
    ctx.lineTo(24, -40);
    ctx.closePath();
    ctx.fill();

    const cloakGrad = ctx.createLinearGradient(-28, -42, 14, 16);
    cloakGrad.addColorStop(0, '#991b1b');
    cloakGrad.addColorStop(0.45, '#7f1d1d');
    cloakGrad.addColorStop(0.85, '#3b0707');
    cloakGrad.addColorStop(1, '#110404');
    ctx.fillStyle = cloakGrad;
    ctx.beginPath();
    ctx.moveTo(-25, -40);
    ctx.quadraticCurveTo(-34, -2, -30, 14);
    ctx.lineTo(14, 12);
    ctx.lineTo(20, -38);
    ctx.closePath();
    ctx.fill();

    // 3. Muscular Badger Torso & 3D Fluted Steel/Gold Cuirass Armor
    ctx.save();
    ctx.translate(0, -28 + breathe);

    // Charcoal badger fur torso base + layered directional guard-hair fur tufts along flanks
    ctx.fillStyle = '#1c1510';
    ctx.beginPath();
    ctx.ellipse(0, 0, 29, 24, 0, 0, Math.PI * 2);
    ctx.fill();

    // 3D Metallic Plate Cuirass with central fuller, battle scratches & overhead specular sheen
    const chestGrad = ctx.createLinearGradient(-24, -18, 24, 18);
    chestGrad.addColorStop(0, '#f8fafc');
    chestGrad.addColorStop(0.24, '#cbd5e1');
    chestGrad.addColorStop(0.55, '#475569');
    chestGrad.addColorStop(0.85, '#1e293b');
    chestGrad.addColorStop(1, '#090d14');
    ctx.fillStyle = chestGrad;
    ctx.strokeStyle = '#070a0e';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.roundRect(-23, -18, 46, 32, 6);
    ctx.fill();
    ctx.stroke();

    // Diagonal battle-scratch gouges across steel cuirass
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.45)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-14, -8); ctx.lineTo(-4, 2);
    ctx.moveTo(6, -10);  ctx.lineTo(15, -1);
    ctx.stroke();

    // Gold trim & central fuller ridge (matching drawPlayerHero lines 9120-9122)
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-21, -17, 42, 4);
    ctx.fillRect(-3, -15, 6, 26);

    // Heavy leather war-belt & forged brass buckle
    ctx.fillStyle = '#27170e';
    ctx.fillRect(-23, 8, 46, 6.5);
    ctx.fillStyle = '#d97706';
    ctx.fillRect(-6, 6.5, 12, 9);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(-3, 8.5, 6, 5);

    // 4. Articulated Steel Pauldrons, Kite Shield & Runed Greatsword
    // Left Shoulder Pauldron & Shield
    ctx.save();
    ctx.translate(-25, -6);
    ctx.fillStyle = '#64748b';
    ctx.strokeStyle = '#090d14';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 11.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Heavy Iron Kite Shield with gold rim & specular boss
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-14, 2);
    ctx.lineTo(4, 2);
    ctx.lineTo(0, 26);
    ctx.lineTo(-14, 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Right Shoulder Pauldron & Battle-Worn Greatsword planted/held at side
    ctx.save();
    ctx.translate(25, -6);
    ctx.fillStyle = '#94a3b8';
    ctx.strokeStyle = '#090d14';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 11.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.rotate(0.38);
    // Crossguard
    ctx.fillStyle = '#d97706';
    ctx.fillRect(-11, 8, 22, 5);
    // 3D Steel & Cyan-Rune Greatsword Blade
    const bladeGrad = ctx.createLinearGradient(-4, 13, 4, 58);
    bladeGrad.addColorStop(0, '#ffffff');
    bladeGrad.addColorStop(0.5, '#94a3b8');
    bladeGrad.addColorStop(1, '#38bdf8');
    ctx.fillStyle = bladeGrad;
    ctx.beginPath();
    ctx.moveTo(-4.8, 13);
    ctx.lineTo(4.8, 13);
    ctx.lineTo(0, 56);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 5. High-Definition Badger Warrior Head (layered coarse guard-hair fur strands, rim-lit fur tips, twin white skull-blaze stripes, fierce eyes, scarred snout)
    ctx.save();
    ctx.translate(0, -26);

    // Deep cast shadow from Badger's head & ruff onto the steel cuirass collar
    ctx.fillStyle = 'rgba(2, 5, 9, 0.78)';
    ctx.beginPath();
    ctx.ellipse(2, 16, 21, 8, 0.08, 0, Math.PI * 2);
    ctx.fill();

    // Rounded Badger Ears with dark rim, silver-white guard-hair tips & overhead light rim-glint
    [-19, 19].forEach(ex => {
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.arc(ex, -14, 7.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1f1813';
      ctx.beginPath();
      ctx.arc(ex, -14, 6.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(ex, -15.2, 3.4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Badger Cranium with jagged multi-layered cheek fur ruff
    const headFurGrad = ctx.createRadialGradient(-3, -6, 3, 0, 0, 24);
    headFurGrad.addColorStop(0, '#4a3728');
    headFurGrad.addColorStop(0.52, '#1f1813');
    headFurGrad.addColorStop(1, '#090c10');
    ctx.fillStyle = headFurGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, 22.5, 19.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Individual directional guard-hair fur strands radiating along cheeks, brow & ruff (silver-tipped agouti badger pelage!)
    for (let f = 0; f < 22; f++) {
      const side = (f % 2 === 0) ? -1 : 1;
      const row = Math.floor(f / 2); // 0..10
      const ang = (row / 10) * 1.35 - 0.55;
      const rInner = 16.5;
      const rOuter = 23.5 + (row % 3) * 1.8;
      const x0 = side * Math.cos(ang) * rInner;
      const y0 = Math.sin(ang) * rInner;
      const x1 = side * Math.cos(ang + 0.08) * rOuter;
      const y1 = Math.sin(ang + 0.08) * rOuter + 1.5;

      // Dark undercoat fur strand
      ctx.strokeStyle = '#090c10';
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();

      // Rim-lit silver-white guard-hair tip where overhead god-rays illuminate the fur!
      ctx.strokeStyle = (row < 5) ? '#f8fafc' : '#94a3b8';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo((x0 + x1) * 0.5, (y0 + y1) * 0.5);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    // Iconic Badger White Skull-Blaze Stripe + Fine Individual White Fur Strands
    const blazeGrad = ctx.createLinearGradient(0, -18, 0, 14);
    blazeGrad.addColorStop(0, '#ffffff');
    blazeGrad.addColorStop(0.55, '#f1f5f9');
    blazeGrad.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = blazeGrad;
    ctx.beginPath();
    ctx.roundRect(-7.5, -18, 15, 28, 5);
    ctx.fill();

    // Fine directional fur-strand striations inside the white skull blaze
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.48)';
    ctx.lineWidth = 0.85;
    for (let fs = -5; fs <= 5; fs += 2.5) {
      ctx.beginPath();
      ctx.moveTo(fs * 0.7, -17);
      ctx.lineTo(fs, 8);
      ctx.stroke();
    }

    // Dark Charcoal Cheek/Eye Masks flanking the white blaze
    ctx.fillStyle = '#090d14';
    ctx.beginPath();
    ctx.roundRect(-17.5, -9, 11, 11, 3);
    ctx.roundRect(6.5, -9, 11, 11, 3);
    ctx.fill();

    // Fierce Glowing Eyes with intense brow scowl
    [-11.5, 11.5].forEach(eyeX => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(eyeX, -3.5, 3.8, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(eyeX + 0.5, -3.5, 1.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // 3D Badger Snout, Battle Scar & Wet Specular Black Nose Button
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.roundRect(-9.5, 2, 19, 11, 4);
    ctx.fill();
    ctx.fillStyle = '#090d14';
    ctx.beginPath();
    ctx.roundRect(-5.5, 5, 11, 6.5, 2.5);
    ctx.fill();
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(-3.2, 5.8, 4.5, 1.8);

    ctx.restore();
    ctx.restore();
    ctx.restore();
  }

  // =============================================================
  // NEXT-GEN HD TETHER CHAIN + QUILL BEAST DRAGGING BATTLE-TORN WOLF BEAST (Shot 4)
  // =============================================================
  function drawNextGenHDTetherChain(x1, y1, x2, y2) {
    const links = 14;
    ctx.save();
    for (let i = 0; i <= links; i++) {
      const f = i / links;
      const lx = x1 + (x2 - x1) * f;
      const sag = Math.sin(f * Math.PI) * 18;
      const ly = y1 + (y2 - y1) * f + sag;

      // Directional floor shadow under hanging chain link
      ctx.fillStyle = 'rgba(1, 3, 7, 0.68)';
      ctx.beginPath();
      ctx.ellipse(lx + 6, ly + 13, 6.0, 2.8, 0.1, 0, Math.PI * 2);
      ctx.fill();

      // 3D Metallic Iron Chain Link with specular highlight
      ctx.strokeStyle = '#090d14';
      ctx.lineWidth = 5.2;
      ctx.beginPath();
      ctx.ellipse(lx, ly, 5.2, 3.2, (i % 2 === 0 ? 0.25 : -0.25), 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = (i % 2 === 0) ? '#94a3b8' : '#64748b';
      ctx.lineWidth = 2.6;
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(lx - 2, ly - 2.2, 2, 1.4);
    }
    ctx.restore();
  }

  function drawNextGenHDQuillBeastDraggingWolf(qx, qy, now) {
    ctx.save();
    ctx.translate(qx, qy);

    const prowlStep = Math.sin(now * 0.011) * 4.5;
    const breathe = Math.sin(now * 0.006) * 1.6;

    // 0. Elongated Directional Cast Shadows from Overhead Light Beams for both Quill Beast & the Dragged Wolf Beast!
    ctx.fillStyle = 'rgba(1, 3, 7, 0.78)';
    ctx.beginPath();
    ctx.ellipse(12, 24, 44, 19, 0.2, 0, Math.PI * 2);
    ctx.ellipse(42, 26, 36, 16, 0.25, 0, Math.PI * 2);
    ctx.fill();

    // =========================================================
    // A. BATTLE-TORN WOLF BEAST ENEMY DRAGGED IN QUILL BEAST'S JAWS!
    // Matches index.html Wolf Clan Raider (#607d8b fur, #cbd5e1 ruff,
    // clumped directional lupine guard-hair strands, #5d4037/#94a3b8
    // riveted brigandine armor, broken iron buckler, digitigrade greave legs,
    // and bushy silver-tipped tail)
    // =========================================================
    ctx.save();
    ctx.translate(30, 14 + Math.sin(now * 0.011) * 1.5);
    ctx.rotate(0.18);

    // Blood & mud drag trail behind the limp Wolf Beast on the stones
    const bloodGrad = ctx.createLinearGradient(-55, 6, 10, 6);
    bloodGrad.addColorStop(0, 'rgba(127, 29, 29, 0)');
    bloodGrad.addColorStop(0.5, 'rgba(153, 27, 27, 0.58)');
    bloodGrad.addColorStop(1, 'rgba(185, 28, 28, 0.82)');
    ctx.fillStyle = bloodGrad;
    ctx.beginPath();
    ctx.ellipse(-20, 8, 42, 9.5, -0.08, 0, Math.PI * 2);
    ctx.fill();

    // Limp bushy silver-tipped wolf tail dragging on the left with splayed fur strands
    ctx.strokeStyle = '#070a0e';
    ctx.lineWidth = 11.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-22, 4);
    ctx.quadraticCurveTo(-40, 10, -48, 6);
    ctx.stroke();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 7.8;
    ctx.stroke();
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(-48, 6, 4.2, 0, Math.PI * 2);
    ctx.fill();

    // Limp digitigrade wolf hindlegs with dented steel shin greaves
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-26, 6, 14, 7);
    ctx.fillRect(-10, 9, 14, 7);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(-22, 7, 8, 5);
    ctx.fillRect(-6, 10, 8, 5);

    // Wolf Torso in Matted Slate-Grey Fur (#607d8b) & Clumped Directional Guard-Hair Tufts
    ctx.fillStyle = '#070a0e';
    ctx.beginPath();
    ctx.ellipse(-6, 0, 23.5, 15.5, 0, 0, Math.PI * 2);
    ctx.fill();
    const wolfFurGrad = ctx.createRadialGradient(-8, -4, 3, -6, 0, 23);
    wolfFurGrad.addColorStop(0, '#94a3b8');
    wolfFurGrad.addColorStop(0.55, '#475569');
    wolfFurGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = wolfFurGrad;
    ctx.beginPath();
    ctx.ellipse(-6, 0, 21.5, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Layered directional wolf fur hackle strands along back & haunches
    for (let wf = 0; wf < 12; wf++) {
      const wx = -22 + wf * 2.8;
      const wy = -10 + (wf % 3) * 3.5;
      ctx.strokeStyle = (wf % 2 === 0) ? '#cbd5e1' : '#334155';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx - 4.5, wy - 2.2);
      ctx.stroke();
    }

    // Torn & Cracked Leather/Steel Brigandine Chestplate
    ctx.fillStyle = '#451a03';
    ctx.strokeStyle = '#090d14';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(-18, -11, 26, 20, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(-16, -10, 22, 3);

    // Deep crimson claw battle-gashes across the wolf's armor & flank!
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2.4;
    for (let g = -1; g <= 1; g++) {
      ctx.beginPath();
      ctx.moveTo(-12 + g * 4, -8);
      ctx.lineTo(-2 + g * 4, 7);
      ctx.stroke();
    }

    // Shattered Iron Buckler Shield lying cracked on the wolf's shoulder
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(-12, 8, 8.5, 0.2, Math.PI * 1.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Battle-Torn Wolf Head (pointed lupine ears, shaggy pale cheek ruff, long snout, bared fangs, dazed/defeated eye)
    ctx.save();
    ctx.translate(14, -2);
    ctx.rotate(0.25);
    // Pointed wolf ears (one notched/torn from battle)
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(-6, -10); ctx.lineTo(-2, -21); ctx.lineTo(3, -10);
    ctx.moveTo(2, -10);  ctx.lineTo(7, -18);  ctx.lineTo(10, -9);
    ctx.fill();
    // Wolf head & shaggy pale cheek ruff strands
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.arc(2, -3, 11.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(-6, -3); ctx.lineTo(-10, 1); ctx.lineTo(-5, 3); ctx.lineTo(-8, 6); ctx.lineTo(1, 5);
    ctx.closePath();
    ctx.fill();
    // Long lupine muzzle & fangs
    ctx.fillStyle = '#334155';
    ctx.fillRect(6, -6, 13, 8);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(10, 1, 2, 3);
    ctx.fillRect(15, 1, 2, 3);
    // Dimmed golden wolf eye
    ctx.fillStyle = '#d97706';
    ctx.fillRect(5, -6, 3.5, 2.2);
    ctx.restore();
    ctx.restore();

    // =========================================================
    // B. NEXT-GEN HIGH-DEFINITION QUILL BEAST PROWLING TOWARD BADGER
    // Authentic Theropod Dinosaur Quills / Protofeathers (stiff hollow
    // keratinous rachis shafts, banded dark-umber/fiery-orange/pale-gold
    // pigmentation, fine barbule filaments at the base, and moisture glints),
    // armored pangolin/dinosaur dermal scutes, golden-amber dappled spots,
    // 3 golden claws per paw, forged iron collar, and jaws clamped on the Wolf!
    // =========================================================
    drawSoftContactShadow(0, 18, 39, 16.5);

    // 1. Segmented Armored Tail with Dermal Scutes
    ctx.fillStyle = '#070a0e';
    ctx.beginPath();
    ctx.moveTo(-18, 2);
    ctx.lineTo(-42, 6 + prowlStep * 0.3);
    ctx.lineTo(-39, 13 + prowlStep * 0.3);
    ctx.lineTo(-16, 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#475569';
    ctx.fillRect(-35, 5 + prowlStep * 0.25, 16, 5);

    // 2. Back Legs with 3 Golden-Cream Claws
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-20, 8 - prowlStep * 0.7, 10, 12);
    ctx.fillRect(4, 8 + prowlStep * 0.7, 10, 12);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-19, 18 - prowlStep * 0.7, 9, 3.5);
    ctx.fillRect(5, 18 + prowlStep * 0.7, 9, 3.5);

    // 3. 14 Bristling Multi-Layered Theropod Dinosaur Quills & Protofeathers!
    // Reference anatomy: hollow cylindrical keratinous rachis shaft, transverse
    // banded pigmentation (#431407 -> #9a3412 -> #ea580c -> #fef08a), fine downy
    // protofeather barbules at the follicle base, and rim-lit specular glints!
    for (let q = 0; q < 14; q++) {
      const qFrac = q / 13;
      const bx = -22 + qFrac * 36;
      const by = -8 - Math.sin(qFrac * Math.PI) * 7.5 - breathe * 0.7;
      const tipX = bx - 10 - (1 - qFrac) * 8;
      const tipY = by - 18 - Math.sin(qFrac * Math.PI) * 14 - breathe * 1.2;
      const qw = 3.8 + Math.sin(qFrac * Math.PI) * 2.1;

      // Dark keratin outline & quill drop shadow on adjacent quills
      ctx.fillStyle = '#05070b';
      ctx.beginPath();
      ctx.moveTo(bx - qw - 1.2, by + 2);
      ctx.lineTo(tipX - 1, tipY - 2);
      ctx.lineTo(bx + qw + 1.2, by + 2);
      ctx.closePath();
      ctx.fill();

      // Banded keratinous dinosaur quill shaft gradient
      const qGrad = ctx.createLinearGradient(bx, by, tipX, tipY);
      qGrad.addColorStop(0, '#270e05');    // Deep follicle base
      qGrad.addColorStop(0.25, '#9a3412'); // Dark chestnut band
      qGrad.addColorStop(0.45, '#431407'); // Dark dinosaur stripe band
      qGrad.addColorStop(0.68, '#ea580c'); // Fiery orange band
      qGrad.addColorStop(0.88, '#facc15'); // Amber-gold sub-tip
      qGrad.addColorStop(1, '#fef9c3');    // Ivory-white needle apex
      ctx.fillStyle = qGrad;
      ctx.beginPath();
      ctx.moveTo(bx - qw, by + 1);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(bx + qw, by + 1);
      ctx.closePath();
      ctx.fill();

      // Central hollow-shaft rachis ridge + specular rim highlight along top edge of quill
      ctx.strokeStyle = 'rgba(254, 249, 195, 0.75)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();

      // Fine downy protofeather barbule filaments splaying from the lower quill shaft
      ctx.strokeStyle = 'rgba(251, 146, 60, 0.65)';
      ctx.lineWidth = 0.75;
      for (let b = 1; b <= 3; b++) {
        const bf = b * 0.18;
        const sx = bx + (tipX - bx) * bf;
        const sy = by + (tipY - by) * bf;
        ctx.beginPath();
        ctx.moveTo(sx, sy); ctx.lineTo(sx - 4.5, sy - 1.5);
        ctx.moveTo(sx, sy); ctx.lineTo(sx + 3.5, sy - 3.0);
        ctx.stroke();
      }
    }

    // 4. 3D Armored Dinosaur/Pangolin Dermal-Scute Carapace Body & Golden-Amber Dappled Spots
    const caraGrad = ctx.createRadialGradient(-4, -6, 4, 0, 0, 29);
    caraGrad.addColorStop(0, '#94a3b8');
    caraGrad.addColorStop(0.38, '#475569');
    caraGrad.addColorStop(0.78, '#1e293b');
    caraGrad.addColorStop(1, '#070a0e');
    ctx.fillStyle = caraGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, 27.5, 18.5 + breathe * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#070a0e';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Textured hexagonal dermal scutes & fine coarse bristly under-fur along lower flank
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.lineWidth = 0.9;
    for (let scX = -18; scX <= 10; scX += 7) {
      ctx.beginPath();
      ctx.arc(scX, 6, 3.5, 0, Math.PI);
      ctx.stroke();
    }

    // Signature golden-amber dappled osteoderm spots across flank (matching drawQuillCompanion lines 9539-9553)
    const hdSpots = [
      { sx: -15, sy: -5, r: 3.6, col: '#f59e0b' },
      { sx:  -7, sy: -8, r: 4.1, col: '#fde047' },
      { sx:   2, sy: -5, r: 3.9, col: '#f59e0b' },
      { sx: -10, sy:  1, r: 3.3, col: '#fbbf24' },
      { sx:  -1, sy:  2, r: 3.6, col: '#fde047' },
      { sx:   7, sy: -1, r: 3.1, col: '#f59e0b' },
    ];
    hdSpots.forEach(sp => {
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.arc(sp.sx, sp.sy, sp.r + 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = sp.col;
      ctx.beginPath();
      ctx.arc(sp.sx, sp.sy, sp.r, 0, Math.PI * 2);
      ctx.fill();
      // Specular moisture glint on raised osteoderm spot
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sp.sx - sp.r * 0.4, sp.sy - sp.r * 0.4, 1.3, 1.3);
    });

    // 5. Muscular Front Legs & 3 Golden Claws
    ctx.fillStyle = '#334155';
    ctx.fillRect(-13, 9 + prowlStep, 10, 12);
    ctx.fillRect(7, 9 - prowlStep, 10, 12);
    ctx.fillStyle = '#fde047';
    ctx.fillRect(-12, 19 + prowlStep, 9, 3.5);
    ctx.fillRect(8, 19 - prowlStep, 9, 3.5);

    // 6. Forged Iron Tether Collar & Pointed Golden-Cream Head Clamping the Wolf Beast in Its Jaws!
    ctx.fillStyle = '#070a0e';
    ctx.fillRect(10, -9, 7, 18);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(11, -8, 5, 16);

    // Cranial brow & upper/lower jaws clamped down onto the wolf's shoulder
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.moveTo(14, -11);
    ctx.lineTo(31, -4);
    ctx.lineTo(29, 4);
    ctx.lineTo(14, 6);
    ctx.closePath();
    ctx.fill();

    const snoutGrad = ctx.createLinearGradient(15, -6, 32, 8);
    snoutGrad.addColorStop(0, '#f59e0b');
    snoutGrad.addColorStop(0.6, '#fbbf24');
    snoutGrad.addColorStop(1, '#fef08a');
    ctx.fillStyle = snoutGrad;
    ctx.beginPath();
    ctx.moveTo(15, -5);
    ctx.lineTo(33, -1);
    ctx.lineTo(31, 9);
    ctx.lineTo(15, 8);
    ctx.closePath();
    ctx.fill();

    // Bared white fangs biting into the wolf's brigandine scruff
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(21, 5, 2.5, 4.5);
    ctx.fillRect(26, 5, 2.5, 4.5);

    // Fierce Glowing Lime-Gold Eye (matching drawQuillCompanion line 9592)
    ctx.fillStyle = '#070a0e';
    ctx.fillRect(18, -7, 6.5, 5.5);
    ctx.fillStyle = '#bef264';
    ctx.fillRect(19.5, -5.8, 4.5, 3.5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(21, -5.8, 2, 2);

    ctx.restore();
  }

  // =============================================================
  // DUNGEON-THEMED "OUROBOROS ABYSS 2 - BROKEN KINGDOM" TITLE BLAST (Shot 5)
  // Stays on screen for nearly 6 full seconds (trT = 8.65s .. 14.5s)
  // =============================================================
  function drawDungeonThemedTitleBlast(w, h, trT, now) {
    const blastAge = Math.max(0, trT - 8.65);
    const slamScale = 1.0 + Math.max(0, 1.0 - blastAge / 0.24) * 0.85;
    const shakeX = blastAge < 0.35 ? (Math.random() - 0.5) * 14 * (1 - blastAge / 0.35) : 0;
    const shakeY = blastAge < 0.35 ? (Math.random() - 0.5) * 14 * (1 - blastAge / 0.35) : 0;

    ctx.save();
    ctx.translate(w * 0.5 + shakeX, h * 0.5 + shakeY);

    // 1. Deep Subterranean Dungeon Stone Archway & Volumetric God-Rays Behind the Title
    const bgGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, Math.max(w, h) * 0.75);
    bgGrad.addColorStop(0, '#14261c');
    bgGrad.addColorStop(0.5, '#09110e');
    bgGrad.addColorStop(1, '#020403');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(-w * 0.6, -h * 0.6, w * 1.2, h * 1.2);

    // Volumetric emerald & golden god-rays radiating from behind the carved dungeon crest
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let r = 0; r < 6; r++) {
      const ang = -0.55 + r * 0.22 + Math.sin(now * 0.002 + r) * 0.04;
      ctx.save();
      ctx.rotate(ang);
      const rGrad = ctx.createLinearGradient(0, -h * 0.55, 0, h * 0.55);
      rGrad.addColorStop(0, 'rgba(134, 239, 172, 0.24)');
      rGrad.addColorStop(0.5, 'rgba(251, 191, 36, 0.16)');
      rGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = rGrad;
      ctx.beginPath();
      ctx.moveTo(-22, -h * 0.55);
      ctx.lineTo(22, -h * 0.55);
      ctx.lineTo(68, h * 0.55);
      ctx.lineTo(-68, h * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    ctx.scale(slamScale, slamScale);

    // 2. 3D Carved Mossy Dungeon Stone Tablet & Shattered Ouroboros Ring Crest
    const tabW = Math.min(w * 0.90, 440);
    const tabH = Math.min(h * 0.58, 185);

    // Heavy stone drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
    ctx.beginPath();
    ctx.roundRect(-tabW * 0.5 + 7, -tabH * 0.5 + 9, tabW, tabH, 12);
    ctx.fill();

    // Carved 3D dungeon stone tablet
    const stoneGrad = ctx.createLinearGradient(0, -tabH * 0.5, 0, tabH * 0.5);
    stoneGrad.addColorStop(0, '#334155');
    stoneGrad.addColorStop(0.45, '#1e293b');
    stoneGrad.addColorStop(1, '#090d16');
    ctx.fillStyle = stoneGrad;
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(-tabW * 0.5, -tabH * 0.5, tabW, tabH, 10);
    ctx.fill();
    ctx.stroke();

    // Inner recessed obsidian rune border
    ctx.strokeStyle = '#ca8a04';
    ctx.lineWidth = 2;
    ctx.strokeRect(-tabW * 0.5 + 8, -tabH * 0.5 + 8, tabW - 16, tabH - 16);

    // Lush creeping dungeon ivy vines, veined leaves & glinting dew drops draped across the stone tablet corners!
    const vineCorners = [
      { vx: -tabW * 0.46, vy: -tabH * 0.46, sx: 1, sy: 1 },
      { vx:  tabW * 0.46, vy: -tabH * 0.46, sx: -1, sy: 1 },
      { vx: -tabW * 0.46, vy:  tabH * 0.46, sx: 1, sy: -1 },
      { vx:  tabW * 0.46, vy:  tabH * 0.46, sx: -1, sy: -1 },
    ];
    vineCorners.forEach((vc, cIdx) => {
      ctx.save();
      ctx.translate(vc.vx, vc.vy);
      ctx.scale(vc.sx, vc.sy);
      ctx.strokeStyle = '#14532d';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(34, 12, 68, 4);
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(14, 28, 8, 52);
      ctx.stroke();
      // Moss & fern leaves along the stone border + dew drops
      ctx.fillStyle = '#22c55e';
      for (let lf = 0; lf < 5; lf++) {
        ctx.beginPath();
        ctx.ellipse(12 + lf * 12, 6 + (lf % 2) * 5, 6, 3, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      drawMacroDewDrop(24, 7, 2.2, now, cIdx + 30);
      ctx.restore();
    });

    // Shattered Golden Ouroboros Serpent Ring Emblem behind the text
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.34)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, tabH * 0.38, 0.2, Math.PI * 0.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, tabH * 0.38, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    // 3. 3D Chiseled Gold & Stone Title Typography: "OUROBOROS ABYSS 2 - BROKEN KINGDOM"
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const mainFontPx = Math.max(17, Math.min(28, Math.floor(tabW * 0.064)));
    ctx.font = `900 ${mainFontPx}px serif`;

    // Deep 3D extruded stone shadow
    ctx.fillStyle = '#020408';
    for (let d = 4; d >= 1; d--) {
      ctx.fillText('OUROBOROS ABYSS 2', d * 0.8, -18 + d * 1.2);
    }

    const goldGrad = ctx.createLinearGradient(0, -36, 0, -2);
    goldGrad.addColorStop(0, '#fef9c3');
    goldGrad.addColorStop(0.45, '#facc15');
    goldGrad.addColorStop(0.8, '#ca8a04');
    goldGrad.addColorStop(1, '#713f12');
    ctx.fillStyle = goldGrad;
    ctx.fillText('OUROBOROS ABYSS 2', 0, -18);

    // Divider sword/vine rule with glowing emerald dungeon gem
    ctx.strokeStyle = '#ca8a04';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-tabW * 0.36, 4);
    ctx.lineTo(tabW * 0.36, 4);
    ctx.stroke();
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(0, 4, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Subtitle: "BROKEN KINGDOM" in chiseled crimson-amber & dungeon stone
    const subFontPx = Math.max(13, Math.min(20, Math.floor(tabW * 0.046)));
    ctx.font = `bold ${subFontPx}px serif`;
    ctx.fillStyle = '#020408';
    ctx.fillText('— BROKEN KINGDOM —', 2, 29);

    const subGrad = ctx.createLinearGradient(0, 14, 0, 40);
    subGrad.addColorStop(0, '#fde047');
    subGrad.addColorStop(0.5, '#f97316');
    subGrad.addColorStop(1, '#dc2626');
    ctx.fillStyle = subGrad;
    ctx.fillText('— BROKEN KINGDOM —', 0, 27);

    // Drifting golden pollen & spore particles floating across the title tablet
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let p = 0; p < 28; p++) {
      const px = -tabW * 0.55 + ((p * 37 + now * 0.015 * ((p % 3) + 1)) % (tabW * 1.1));
      const py = -tabH * 0.55 + ((p * 29 - now * 0.011 * ((p % 2) + 1)) % (tabH * 1.1));
      const pAlpha = 0.35 + Math.sin(now * 0.005 + p) * 0.25;
      ctx.fillStyle = (p % 2 === 0) ? `rgba(254, 240, 138, ${pAlpha})` : `rgba(187, 247, 208, ${pAlpha})`;
      ctx.beginPath();
      ctx.arc(px, py, 1.4 + (p % 2) * 1.0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Initial white-gold impact flash when title blasts onto screen
    if (blastAge < 0.25) {
      ctx.fillStyle = `rgba(254, 249, 195, ${(1 - blastAge / 0.25) * 0.85})`;
      ctx.fillRect(-w, -h, w * 2, h * 2);
    }

    // Smooth fade to black at the very end of the 6-second title hold (13.8s .. 14.5s)
    if (trT >= 13.8) {
      const endFade = Math.min(1, (trT - 13.8) / 0.7);
      ctx.fillStyle = `rgba(0, 0, 0, ${endFade})`;
      ctx.fillRect(-w, -h, w * 2, h * 2);
    }

    ctx.restore();
  }

  // Master Renderer for the Next-Gen HD Trailer (Act 4: 47.0s .. 61.5s — 14.5s total)
  function renderNextGenAbyss2Trailer(w, h, trT, now) {
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    // Shot 5 (8.65s .. 14.5s — almost 6 full seconds!): Blast Title "Ouroboros Abyss 2 - Broken Kingdom"
    if (trT >= 8.65) {
      drawDungeonThemedTitleBlast(w, h, trT, now);
      ctx.restore();
      return;
    }

    // Compute dynamic camera zoom, focus, and sky/ceiling pan across Shots 1..4:
    let snakeX = 82;
    let snakeY = 8;
    let camX = 82;
    let camY = 0;
    let camZoom = 2.35;
    let camTiltSky = 0;
    let squirmIntensity = 0;
    let isSnakeDead = false;

    if (trT < 3.5) {
      const prog = trT / 3.5;
      snakeX = -48 + prog * 130; // Slithers from -48 right up to +82 (just before the hole at +148!)
      camX = snakeX + 18;
      camY = 2 + Math.sin(trT * 2.5) * 3;
      camZoom = 2.38 - prog * 0.12;
    } else if (trT < 4.7) {
      snakeX = 82;
      if (trT < 4.05) {
        const upProg = (trT - 3.5) / 0.55;
        camTiltSky = Math.sin(upProg * Math.PI * 0.5);
        camX = 82;
        camY = -115 * camTiltSky;
        camZoom = 2.26 - camTiltSky * 0.35;
      } else {
        const stompProg = Math.min(1, (trT - 4.05) / 0.22);
        camTiltSky = Math.max(0, 1.0 - stompProg * 1.2);
        camX = 82 + (stompProg >= 0.8 ? (Math.random() - 0.5) * 12 : 0);
        camY = -115 * camTiltSky + (stompProg >= 0.8 ? (Math.random() - 0.5) * 12 : 0);
        camZoom = 2.15;
        squirmIntensity = stompProg >= 0.8 ? 1.0 : 0;
      }
    } else if (trT < 6.6) {
      // Shot 3: Badger crushing the squirming snake -> final death growl -> snake dies at 5.95s
      snakeX = 82;
      camX = 68;
      camY = -16;
      camZoom = 1.74;
      if (trT < 5.95) {
        squirmIntensity = Math.max(0, 1.0 - (trT - 4.7) / 1.25);
        isSnakeDead = false;
      } else {
        squirmIntensity = 0;
        isSnakeDead = true;
      }
    } else {
      // Shot 4: Pan & zoom out further to reveal Quill Beast chained to Badger, dragging the battle-torn Wolf Beast!
      snakeX = 82;
      isSnakeDead = true;
      const panOutProg = Math.min(1, (trT - 6.6) / 1.45);
      const smooth = panOutProg * panOutProg * (3 - 2 * panOutProg);
      camX = 68 - smooth * 64;   // Pans left to frame both Badger (+68) and Quill Beast (-58)
      camY = -16 + smooth * 10;
      camZoom = 1.74 - smooth * 0.62; // Zooms out from 1.74x to 1.12x wide room view
    }

    ctx.save();
    ctx.translate(w * 0.5, h * 0.5);
    ctx.scale(camZoom, camZoom);
    ctx.translate(-camX, -camY);

    // 1. Render Lush, Plant-Rich 3D Dungeon Room, Porous Rocks, Veined Ferns, Dew Drops, Crumbled Wall Hole & Toppled Pillars
    drawNextGenLushDungeonRoom(now, camTiltSky);

    // 2. Render Next-Gen HD Snake Enemy (with directional overhead cast shadow & keeled scales)
    drawNextGenHDSnake(snakeX, snakeY, now, squirmIntensity, isSnakeDead);

    // 3. Shot 2: Muddy Armored Boot Descending from Ceiling Light Rays to Crush the Snake!
    if (trT >= 3.82 && trT < 4.7) {
      const stompDescend = Math.min(1, (trT - 3.82) / 0.34);
      const easeIn = stompDescend * stompDescend;
      const bootLiftZ = (1.0 - easeIn) * 240;
      drawNextGenMuddyArmoredBoot(snakeX + 4, snakeY, bootLiftZ, 1.0);
    }

    // 4. Shot 3 & Shot 4: Next-Gen HD Badger Warrior Standing Over & Crushing the Snake
    if (trT >= 4.7) {
      const badgerX = snakeX - 10;
      const badgerY = snakeY - 10;

      // In Shot 4 (6.4s+), Quill Beast prowls in from the left, chained to Badger and dragging the Wolf Beast!
      if (trT >= 6.4) {
        const walkProg = Math.min(1, Math.max(0, (trT - 6.5) / 1.7));
        const quillX = -115 + walkProg * 48; // Moves toward Badger from -115 to -67
        const quillY = 12;
        drawNextGenHDTetherChain(badgerX - 18, badgerY - 14, quillX + 12, quillY - 2);
        drawNextGenHDQuillBeastDraggingWolf(quillX, quillY, now);
      }

      drawNextGenHDBadgerWarrior(badgerX, badgerY, now);
    }

    // 5. Volumetric Ceiling Light Beams, Floor Light-Pool Caustics & Floating Pollen / Dew-Mist Air Particles!
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const rayPositions = [-110, -12, 76, 142];
    rayPositions.forEach((rx, idx) => {
      const rayPulse = 0.86 + Math.sin(now * 0.0025 + idx * 1.5) * 0.14;

      // 5A. Dappled Floor Light-Pool where the overhead beam strikes the wet stones & foliage
      const poolGrad = ctx.createRadialGradient(rx + 18, 12, 2, rx + 18, 12, 54 * rayPulse);
      poolGrad.addColorStop(0, 'rgba(220, 252, 231, 0.24)');
      poolGrad.addColorStop(0.5, 'rgba(134, 239, 172, 0.10)');
      poolGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = poolGrad;
      ctx.beginPath();
      ctx.ellipse(rx + 18, 12, 54 * rayPulse, 26 * rayPulse, 0.15, 0, Math.PI * 2);
      ctx.fill();

      // 5B. Slanted Volumetric Light Shaft from overhead ceiling openings
      ctx.save();
      ctx.translate(rx, -20);
      ctx.rotate(-0.26);
      const rayGrad = ctx.createLinearGradient(0, -260, 0, 180);
      rayGrad.addColorStop(0, 'rgba(240, 253, 244, 0.38)');
      rayGrad.addColorStop(0.45, 'rgba(134, 239, 172, 0.18)');
      rayGrad.addColorStop(0.85, 'rgba(74, 222, 128, 0.06)');
      rayGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = rayGrad;
      ctx.beginPath();
      ctx.moveTo(-26 * rayPulse, -260);
      ctx.lineTo(26 * rayPulse, -260);
      ctx.lineTo(62 * rayPulse, 180);
      ctx.lineTo(-62 * rayPulse, 180);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });

    // 5C. 75 Floating Air Particles: Golden-Green Pollen Grains with Soft Bokeh Halos, Spores & Glinting Dew Mist!
    for (let p = 0; p < 75; p++) {
      const driftX = Math.sin(now * 0.0018 + p * 1.7) * 14;
      const px = -230 + ((p * 43 + now * 0.011 * ((p % 3) + 1)) % 460) + driftX;
      const py = -165 + ((p * 29 - now * 0.008 * ((p % 2) + 1)) % 330);
      const pAlpha = 0.30 + Math.sin(now * 0.005 + p * 0.9) * 0.24;

      if (p % 5 === 0) {
        // Out-of-focus foreground golden-green pollen bokeh orb
        const bokR = 3.8 + (p % 3) * 1.4;
        const bGrad = ctx.createRadialGradient(px, py, 0.5, px, py, bokR);
        bGrad.addColorStop(0, `rgba(254, 240, 138, ${pAlpha * 0.85})`);
        bGrad.addColorStop(0.55, `rgba(163, 230, 53, ${pAlpha * 0.45})`);
        bGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = bGrad;
        ctx.beginPath();
        ctx.arc(px, py, bokR, 0, Math.PI * 2);
        ctx.fill();
      } else if (p % 3 === 0) {
        // Glinting airborne dew-mist micro-droplet catching the god-rays
        ctx.fillStyle = `rgba(224, 242, 254, ${pAlpha + 0.22})`;
        ctx.beginPath();
        ctx.arc(px, py, 1.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Crisp drifting golden-green pollen grain
        ctx.fillStyle = (p % 2 === 0) ? `rgba(254, 249, 195, ${pAlpha + 0.15})` : `rgba(187, 247, 208, ${pAlpha + 0.18})`;
        ctx.beginPath();
        ctx.arc(px, py, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    ctx.restore();

    // 6. Deep Cinematic Vignette & Fade-to-Black Transitions (Shot 2 -> Shot 3 and Shot 4 -> Shot 5)
    const vigGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.28, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
    vigGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vigGrad.addColorStop(1, 'rgba(0, 0, 0, 0.72)');
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, w, h);

    // Fade to black when the Muddy Boot crushes the snake (4.22 .. 4.7s), then re-illuminate on Badger (4.7 .. 5.1s)
    let blackFade = 0;
    if (trT < 0.35) {
      blackFade = 1.0 - (trT / 0.35);
    } else if (trT >= 4.22 && trT < 4.70) {
      blackFade = Math.min(1, (trT - 4.22) / 0.28);
    } else if (trT >= 4.70 && trT < 5.10) {
      blackFade = 1.0 - ((trT - 4.70) / 0.40);
    } else if (trT >= 8.25 && trT < 8.65) {
      blackFade = Math.min(1, (trT - 8.25) / 0.32);
    }
    if (blackFade > 0.01) {
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, blackFade)})`;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.restore();
  }

  // -------------------------------------------------------------
  // SCREEN-SPACE CINEMATIC OVERLAY & TRANSITIONS
  // Zero text or captioning audio during the acts!
  // Keeps ONLY:
  // - Act 2: "Badger Warrior and Quill Beast will return."
  // - Act 4: Next-Gen Trailer ending with extended 6-Second "Ouroboros Abyss 2 - Broken Kingdom" title screen
  // - Act 5: "End" and option to press 'A' to start a new game
  // -------------------------------------------------------------
  function renderFinaleCinematicOverlay(w, h, now) {
    const fc = state.finaleCinematic;
    if (!fc || !fc.active) return;
    const t = fc.elapsed;

    ctx.save();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.scale(dpr, dpr);

    // =============================================================
    // ACT 1 (0.0s .. 12.0s): IN-ENGINE SHATTERING DUNGEON ESCAPE
    // Pure uninterrupted dungeon view (no caption bars, no HUDs, no text!)
    // =============================================================
    if (t < 12.0) {
      if (t > 10.7) {
        const flareAlpha = Math.min(1, (t - 10.7) / 1.3);
        ctx.fillStyle = 'rgba(255, 255, 255, ' + flareAlpha + ')';
        ctx.fillRect(0, 0, w, h);
      }
    }

    // =============================================================
    // ACT 2 (12.0s .. 17.0s): BLARING WHITE -> PITCH BLACKNESS ->
    // "Badger Warrior and Quill Beast will return."
    // =============================================================
    else if (t < 17.0) {
      const localT = t - 12.0;
      if (localT < 1.1) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
      } else if (localT < 2.2) {
        const blackProg = (localT - 1.1) / 1.1;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(0, 0, 0, ' + Math.min(1, blackProg) + ')';
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);
        const textAlpha = Math.min(1, (localT - 2.2) / 0.8);
        ctx.save();
        ctx.globalAlpha = textAlpha;
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 15px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Badger Warrior and Quill Beast will return.', w * 0.5, h * 0.5);
        ctx.restore();
      }
    }

    // =============================================================
    // ACT 3 (17.0s .. 47.0s — 30 SECONDS): IN-ENGINE CAMERA PAN ACROSS
    // THE 5 DESTROYED DUNGEONS WITH SOMBER SOFT MUSIC (No text/captions!)
    // =============================================================
    else if (t < 47.0) {
      const panT = t - 17.0; // 0 .. 30s
      const sceneLocal = panT % 6.0;

      // Subtle somber twilight tint over the real destroyed dungeon map
      ctx.fillStyle = 'rgba(8, 12, 24, 0.22)';
      ctx.fillRect(0, 0, w, h);

      // Smooth cross-fade at the start/end of each 6-second dungeon pan
      let fadeAlpha = 0;
      if (sceneLocal < 0.55) fadeAlpha = 1 - (sceneLocal / 0.55);
      else if (sceneLocal > 5.45) fadeAlpha = (sceneLocal - 5.45) / 0.55;
      if (fadeAlpha > 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, ' + Math.min(1, fadeAlpha) + ')';
        ctx.fillRect(0, 0, w, h);
      }
    }

    // =============================================================
    // ACT 4 (47.0s .. 61.5s — 14.5 SECONDS): NEXT-GEN HD TRAILER
    // "OUROBOROS ABYSS 2 - BROKEN KINGDOM" (WITH 6-SECOND TITLE HOLD!)
    // =============================================================
    else if (t < 61.5) {
      const trT = t - 47.0; // 0.0 .. 14.5s
      renderNextGenAbyss2Trailer(w, h, trT, now);
    }

    // =============================================================
    // ACT 5 (61.5s+): FADE TO BLACK WITH 'End' ON SCREEN &
    // OPTION TO PRESS 'A' TO START A NEW GAME
    // =============================================================
    else {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);

      const fadeIn = Math.min(1, (t - 61.5) / 1.5);
      ctx.save();
      ctx.globalAlpha = fadeIn;

      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 42px serif';
      ctx.textAlign = 'center';
      ctx.fillText('End', w * 0.5, h * 0.42);

      const pulse = 0.65 + Math.sin(now * 0.006) * 0.35;
      ctx.globalAlpha = fadeIn * pulse;
      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 13px monospace';
      ctx.fillText("PRESS 'A' TO START A NEW GAME", w * 0.5, h * 0.66);
      ctx.restore();
    }

    ctx.restore();
  }

  // Allow tapping the canvas during Act 5 ("End" screen) to also trigger Button A (Start New Game)
  if (typeof canvas !== 'undefined' && canvas && !canvas._boundFinaleTap) {
    canvas._boundFinaleTap = true;
    canvas.addEventListener('pointerdown', () => {
      if (state.finaleCinematic && state.finaleCinematic.active && state.finaleCinematic.elapsed >= 61.2) {
        window.handleFinaleCinematicButtonA();
      }
    });
  }

  // =============================================================
  // 8. GENERATION 2.6 WAVE OF REFINEMENTS:
  //    A) GLOBAL WIND FIELD, DIRECTIONAL LIGHT-CAST SHADOWS, METALLIC
  //       REFLECTIONS, PHYSICAL BLOCKING & TRUE 2.5D DEPTH MAPPING
  //    B) HYPER-DETAILED WOOD, PLANT, STONE & METAL ENVIRONMENTAL ASSETS
  //       (Grass, Ferns, Trees, Rope Ladders, Canopy Treehouses, Staircases,
  //        Multi-Tier Cliffs, Ensnaring Ground Vines, Metal Grates & Huts)
  // =============================================================

  // Travelling 2D subterranean wind wave so grass, ferns, trees, vines, and capes blow in unison
  function sampleWindField(wx, wy, now) {
    const t = (now || performance.now()) * 0.001;
    const primaryGust = Math.sin(t * 2.1 + wx * 0.0045 + wy * 0.0022);
    const secondaryEddy = Math.cos(t * 4.3 - wx * 0.008 + wy * 0.006) * 0.42;
    const gustEnvelope = 0.65 + 0.35 * Math.sin(t * 0.65 + (wx + wy) * 0.0012);
    const windX = (primaryGust + secondaryEddy) * gustEnvelope;
    const windY = Math.sin(t * 1.7 + wy * 0.005) * 0.35 * gustEnvelope;
    return { x: windX, y: windY, strength: Math.abs(windX), gust: gustEnvelope };
  }

  // Computes directional shadow offset away from the nearest torch, god-ray, forge fire, or boss core
  function computeDirectionalShadowVector(wx, wy) {
    let bestDistSq = 340 * 340;
    let lightX = wx - 90;
    let lightY = wy - 130;
    let found = false;

    if (state.props && state.props.length > 0) {
      for (let i = 0; i < state.props.length; i++) {
        const pr = state.props[i];
        if (pr.type !== 'torch') continue;
        const dx = wx - pr.x;
        const dy = wy - pr.y;
        const dSq = dx * dx + dy * dy;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          lightX = pr.x;
          lightY = pr.y - 12;
          found = true;
        }
      }
    }

    if (state.godRays && state.godRays.length > 0) {
      for (let i = 0; i < state.godRays.length; i++) {
        const gr = state.godRays[i];
        const dx = wx - gr.x;
        const dy = wy - gr.y;
        const dSq = dx * dx + dy * dy;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          lightX = gr.x - 24;
          lightY = gr.y - 80;
          found = true;
        }
      }
    }

    if (!found && state.player) {
      const pdx = wx - state.player.x;
      const pdy = wy - (state.player.y - 24);
      if (pdx * pdx + pdy * pdy < 260 * 260) {
        lightX = state.player.x;
        lightY = state.player.y - 28;
      }
    }

    const vx = wx - lightX;
    const vy = wy - lightY;
    const dist = Math.hypot(vx, vy) || 1;
    const stretch = Math.min(1.45, Math.max(0.45, dist / 180));
    return {
      dx: (vx / dist) * 9 * stretch,
      dy: Math.max(2.5, (vy / dist) * 6 * stretch + 3.5),
      alpha: Math.max(0.28, Math.min(0.62, 0.58 - (dist / 520) * 0.25))
    };
  }

  function drawDirectionalCastShadow(wx, wy, localX, localY, rx, ry, heightScale = 1.0) {
    const safeRx = Math.max(2, Math.min(64, rx || 16));
    const safeRy = Math.max(2, Math.min(40, ry || 8));
    const safeH = Math.max(0.2, Math.min(2.2, heightScale || 1.0));
    const sv = computeDirectionalShadowVector(wx, wy);
    ctx.save();
    ctx.fillStyle = `rgba(2, 5, 9, ${(sv.alpha * 0.72).toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(
      localX + sv.dx * safeH,
      localY + sv.dy * safeH,
      safeRx * (1 + 0.18 * safeH),
      safeRy * (0.85 + 0.12 * safeH),
      Math.atan2(sv.dy, sv.dx) * 0.25,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Inner core contact occlusion
    ctx.fillStyle = 'rgba(1, 3, 6, 0.66)';
    ctx.beginPath();
    ctx.ellipse(localX, localY, safeRx * 0.76, safeRy * 0.68, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Physical blocking for 3D objects in open areas while keeping all pathways & hidden loot vaults 100% accessible
  function hasSurroundingWallsOrBarriers(tx, ty) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nt = state.map[ty + dy]?.[tx + dx];
        if (nt === undefined || isWallTile(nt) || nt === T_ABYSS || nt === T_WALL_SECRET) {
          return true;
        }
      }
    }
    return false;
  }

  const _gen25CanWalkAt = canWalkAt;
  canWalkAt = function (wx, wy) {
    if (!_gen25CanWalkAt(wx, wy)) return false;
    if (state.finaleCinematic && state.finaleCinematic.active) return true;

    const tx = Math.floor(wx / TILE_SIZE);
    const ty = Math.floor(wy / TILE_SIZE);
    const tType = state.map[ty]?.[tx];
    const cx = tx * TILE_SIZE + 32;
    const cy = ty * TILE_SIZE + 32;

    // 1. Trigger Trash Hut Ambush on approach, and only apply a small inner pedestal core
    //    if the tile is in an open room interior (NEVER block pathways with barriers on either side!)
    if (tType === T_TRASH_HUT) {
      const hut = state.trashHuts && state.trashHuts.find(h => h.tx === tx && h.ty === ty);
      if (hut && !hut.triggered && hut.hasAmbush && Math.hypot(wx - cx, wy - cy) < 36) {
        triggerTrashHutAmbush(hut);
      }
      if (!hasSurroundingWallsOrBarriers(tx, ty) && Math.hypot(wx - cx, wy - (cy - 2)) < 9) {
        return false;
      }
    } else if (tType === T_LORE_OBELISK || tType === T_FORGE_ANVIL) {
      if (!hasSurroundingWallsOrBarriers(tx, ty) && Math.hypot(wx - cx, wy - cy) < 8) {
        return false;
      }
    }

    // 2. Solid 3D tree trunks only have a small heartwood core in open room interiors,
    //    never blocking doorways, hallways, secret vault approaches, or narrow pathways!
    if (state.props && state.props.length > 0 && !hasSurroundingWallsOrBarriers(tx, ty)) {
      for (let i = 0; i < state.props.length; i++) {
        const pr = state.props[i];
        if (pr.type === 'wall_tree') {
          const tdx = wx - pr.x;
          const tdy = wy - pr.y;
          if (tdx * tdx + tdy * tdy < 7.5 * 7.5) {
            if (!state.player || Math.hypot(state.player.x - pr.x, state.player.y - pr.y) >= 8) {
              return false;
            }
          }
        }
      }
    }

    return true;
  };

  // -------------------------------------------------------------
  // B1. GRASS TILE: Humus Soil, 3D Velvet Moss Cushions, Wind-Blown
  //     Multi-Segment Grass Blades, Physical Trampling & Glinting Dew Drops
  // -------------------------------------------------------------
  drawTileFloorGrass = function (x, y, theme, now) {
    const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
    const turfBase = theme.grassTint || '#112214';
    const ivyCol = theme.ivyColor || '#26422b';
    const wind = sampleWindField(x + 32, y + 32, now);

    // 1. Deep loamy subterranean soil & root-woven humus base
    ctx.fillStyle = '#070f09';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = turfBase;
    ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);

    // Soil micro-pebbles & root veins
    ctx.fillStyle = '#050b06';
    ctx.fillRect(x + 8 + (hash % 11), y + 10, 4, 2);
    ctx.fillRect(x + 38 + ((hash >> 3) % 13), y + 48, 5, 2);

    // 2. 3D Cushioned Velvet Moss Mounds (cast shadow -> dark base -> mid moss -> sunlit top ridge)
    const m1x = x + 19 + (hash % 8);
    const m1y = y + 21;
    const m2x = x + 44;
    const m2y = y + 44 - (hash % 7);

    ctx.fillStyle = 'rgba(2, 5, 3, 0.55)';
    ctx.beginPath();
    ctx.ellipse(m1x + 2, m1y + 3, 19, 12.5, 0.2, 0, Math.PI * 2);
    ctx.ellipse(m2x + 2, m2y + 3, 20, 13.5, -0.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#132a17';
    ctx.beginPath();
    ctx.ellipse(m1x, m1y, 18, 12, 0.2, 0, Math.PI * 2);
    ctx.ellipse(m2x, m2y, 19, 13, -0.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = ivyCol;
    ctx.beginPath();
    ctx.ellipse(m1x - 1, m1y - 1.5, 13.5, 8, 0.2, 0, Math.PI * 2);
    ctx.ellipse(m2x - 1, m2y - 1.5, 14.5, 8.8, -0.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#345e3d';
    ctx.beginPath();
    ctx.ellipse(m1x - 3, m1y - 3, 7.5, 4, 0.2, 0, Math.PI * 2);
    ctx.ellipse(m2x - 3, m2y - 3, 8.5, 4.5, -0.25, 0, Math.PI * 2);
    ctx.fill();

    // 3. Embedded Weathered Flagstone Stepping Stone with wet mineral glint
    if (hash % 2 === 0) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
      ctx.fillRect(x + 21, y + 27, 22, 15);
      ctx.fillStyle = '#202924';
      ctx.fillRect(x + 21, y + 24, 21, 14);
      ctx.fillStyle = '#38473e';
      ctx.fillRect(x + 21, y + 24, 21, 2.5);
      ctx.fillRect(x + 21, y + 24, 2.5, 14);
      ctx.fillStyle = '#0c110e';
      ctx.fillRect(x + 21, y + 36, 21, 2);
    }

    // 4. Physical entity parting (grass bends away when Badger, Quill, or Enemies walk over it)
    let trampleBendX = 0;
    let trampleCrush = 1.0;
    if (state.player) {
      const pdx = (x + 32) - state.player.x;
      const pdy = (y + 32) - state.player.y;
      const pDist = Math.hypot(pdx, pdy);
      if (pDist < 42) {
        trampleBendX = (pdx / (pDist || 1)) * (1 - pDist / 42) * 7.5;
        trampleCrush = 0.62 + 0.38 * (pDist / 42);
      }
    }

    // 5. 5 Multi-Blade Articulated Grass Tufts with Wind Wave + Cast Blade Shadows
    const tuftPositions = [
      { gx: x + 12 + (hash % 5), gy: y + 17, hScale: 1.0 },
      { gx: x + 49 - (hash % 5), gy: y + 19, hScale: 0.92 },
      { gx: x + 31 + ((hash >> 2) % 5), gy: y + 34, hScale: 1.08 },
      { gx: x + 15, gy: y + 51 - (hash % 6), hScale: 0.96 },
      { gx: x + 45 + (hash % 6), gy: y + 53, hScale: 1.04 },
    ];

    for (let i = 0; i < tuftPositions.length; i++) {
      const tp = tuftPositions[i];
      const localSway = (wind.x * 4.2 + Math.sin(now * 0.004 + i * 1.3) * 1.1) * tp.hScale + trampleBendX;
      const bladeH = 10.5 * tp.hScale * trampleCrush;

      // Cast shadow of grass blades onto the moss
      ctx.strokeStyle = 'rgba(2, 6, 3, 0.52)';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(tp.gx - 3, tp.gy + 1);
      ctx.lineTo(tp.gx - 4 + localSway + 3, tp.gy + 2);
      ctx.moveTo(tp.gx + 2, tp.gy + 1);
      ctx.lineTo(tp.gx + 4 + localSway + 3, tp.gy + 2);
      ctx.stroke();

      // 4 curved blades per tuft (dark sheath -> mid emerald -> sunlit tip)
      const offsets = [-3.5, -1.2, 1.2, 3.5];
      for (let b = 0; b < offsets.length; b++) {
        const bo = offsets[b];
        const tipX = tp.gx + bo * 1.55 + localSway * (0.85 + b * 0.12);
        const tipY = tp.gy - bladeH + Math.abs(bo) * 0.8;
        ctx.strokeStyle = (b % 2 === 0) ? '#14532d' : '#166534';
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        ctx.moveTo(tp.gx + bo * 0.4, tp.gy);
        ctx.quadraticCurveTo(tp.gx + bo + localSway * 0.4, tp.gy - bladeH * 0.55, tipX, tipY);
        ctx.stroke();

        // Sunlit blade tip
        ctx.fillStyle = (b === 1 || b === 2) ? '#4ade80' : '#22c55e';
        ctx.fillRect(tipX - 0.8, tipY - 0.8, 1.8, 2.0);
      }
    }

    // 6. Glistening 3D Dew Drop & Bioluminescent Cave Florets
    if (hash % 2 === 0) {
      const dx = x + 16 + ((hash >> 4) % 32);
      const dy = y + 14 + ((hash >> 6) % 34);
      const glint = 0.55 + 0.45 * Math.sin(now * 0.006 + hash);
      // Dew drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.arc(dx + 1, dy + 1.5, 2.2, 0, Math.PI * 2);
      ctx.fill();
      // Refractive aqua-emerald droplet body
      ctx.fillStyle = `rgba(125, 211, 252, ${(0.55 + glint * 0.35).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(dx, dy, 2.1, 0, Math.PI * 2);
      ctx.fill();
      // Pure white specular glint
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(dx - 1, dy - 1, 1.4, 1.4);
    }
  };

  // -------------------------------------------------------------
  // B2. FERN BUSH: Directional Cast Shadow, Coiled Fiddleheads,
  //     Serrated Pinnae Leaflets, Subsurface Rim-Light & Physical Parting
  // -------------------------------------------------------------
  drawDungeonFernBush = function (pr, now) {
    const wind = sampleWindField(pr.x, pr.y, now);
    // Physical parting when player, Quill, or enemy walks through the fern
    let partX = 0;
    let partOpen = 0;
    if (state.player) {
      const dx = pr.x - state.player.x;
      const dy = pr.y - state.player.y;
      const d = Math.hypot(dx, dy);
      if (d < 44) {
        partX = (dx / (d || 1)) * (1 - d / 44) * 9;
        partOpen = (1 - d / 44) * 0.38;
      }
    }

    ctx.save();
    ctx.translate(pr.x, pr.y);

    // 1. Directional Cast Shadow + Deep Root Contact Shadow
    drawDirectionalCastShadow(pr.x, pr.y, wind.x * 2.5, 4, 22, 10.5, 0.9);

    // 2. Back-Layer Deep Shadow Fronds (5 serrated fronds)
    const totalFronds = 7;
    for (let i = 0; i < 5; i++) {
      const norm = (i / 4) - 0.5;
      const ang = norm * 2.1 + (norm >= 0 ? partOpen : -partOpen) + wind.x * 0.08 + partX * 0.015;
      ctx.save();
      ctx.rotate(ang);
      ctx.fillStyle = '#07120b';
      ctx.beginPath();
      ctx.ellipse(0, -13, 6.2, 14.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 3. Front & Mid-Layer True Serrated Pinnae Fern Fronds with Rachis & Lateral Veins
    for (let i = 0; i < totalFronds; i++) {
      const norm = (i / (totalFronds - 1)) - 0.5;
      const sideSign = norm >= 0 ? 1 : -1;
      const ang = norm * 2.35 + sideSign * partOpen + wind.x * (0.11 + Math.abs(norm) * 0.05) + partX * 0.02;
      const frondLen = (i === 2 || i === 3 || i === 4) ? 24 : 19;
      const isLitFrond = (i % 2 === 1);

      ctx.save();
      ctx.rotate(ang);

      // Dark woody rachis stem base
      ctx.strokeStyle = '#09150d';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(wind.x * 1.4, -frondLen * 0.5, wind.x * 2.4, -frondLen);
      ctx.stroke();

      // 6 pairs of individual serrated pinnae (leaflets) along the frond stem
      const pairs = 6;
      for (let p = 1; p <= pairs; p++) {
        const t = p / (pairs + 0.5);
        const py = -t * frondLen;
        const px = wind.x * 2.4 * t * t;
        const pinnaW = (1 - Math.abs(t - 0.45) * 1.15) * 6.8;
        const pinnaH = 2.5;

        // Dark leaflet underside outline
        ctx.fillStyle = '#08130c';
        ctx.beginPath();
        ctx.ellipse(px - pinnaW * 0.55, py, pinnaW * 0.65, pinnaH + 0.6, -0.35, 0, Math.PI * 2);
        ctx.ellipse(px + pinnaW * 0.55, py, pinnaW * 0.65, pinnaH + 0.6, 0.35, 0, Math.PI * 2);
        ctx.fill();

        // Mid-tone chlorophyll leaflet blade
        ctx.fillStyle = isLitFrond ? '#1f472b' : '#163520';
        ctx.beginPath();
        ctx.ellipse(px - pinnaW * 0.52, py - 0.3, pinnaW * 0.58, pinnaH, -0.35, 0, Math.PI * 2);
        ctx.ellipse(px + pinnaW * 0.52, py - 0.3, pinnaW * 0.58, pinnaH, 0.35, 0, Math.PI * 2);
        ctx.fill();

        // Sunlit subsurface-scattered lime tip on upper pinnae
        if (p >= 3) {
          ctx.fillStyle = isLitFrond ? '#4ade80' : '#2e6f40';
          ctx.fillRect(px - pinnaW * 0.85, py - 1.1, 2.2, 1.3);
          ctx.fillRect(px + pinnaW * 0.65, py - 1.1, 2.2, 1.3);
        }
      }

      // Crisp pale central rachis vein
      ctx.strokeStyle = isLitFrond ? '#6ee7b7' : '#3d7a52';
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.moveTo(0, -1);
      ctx.quadraticCurveTo(wind.x * 1.2, -frondLen * 0.5, wind.x * 2.2, -frondLen * 0.94);
      ctx.stroke();

      ctx.restore();
    }

    // 4. Coiled Unfurling Fiddlehead Sprouts & Fibrous Rhizome Crown at Center
    ctx.fillStyle = '#120c07';
    ctx.beginPath();
    ctx.arc(0, 1, 4.5, 0, Math.PI * 2);
    ctx.fill();

    for (let fh = -1; fh <= 1; fh += 2) {
      const fx = fh * 3.5 + wind.x * 1.1;
      const fy = -9;
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(fh * 1.2, 0);
      ctx.quadraticCurveTo(fx * 1.2, -5, fx, fy);
      ctx.stroke();
      ctx.fillStyle = '#86efac';
      ctx.beginPath();
      ctx.arc(fx, fy, 2.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#14532d';
      ctx.fillRect(fx - 0.8, fy - 0.8, 1.5, 1.5);
    }

    // 5. Refractive Dew Drop glinting on the front frond
    const dewPulse = 0.6 + 0.4 * Math.sin(now * 0.007 + pr.x);
    ctx.fillStyle = `rgba(186, 230, 253, ${dewPulse.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(4 + wind.x * 1.5, -11, 2.0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(3.3 + wind.x * 1.5, -11.7, 1.3, 1.3);

    ctx.restore();
  };

  // -------------------------------------------------------------
  // B3. WALL & GLADE TREES: Gnarled Buttress Roots, Furrowed Heartwood
  //     Bark, Bracket Fungi, Wind-Blown Leaf Clusters & Cast Canopy Shadow
  // -------------------------------------------------------------
  drawWallClimbingTree = function (pr, now) {
    ctx.save();
    ctx.translate(pr.x, pr.y);
    const sc = pr.scale || 1.0;
    ctx.scale(sc, sc);

    const wind = sampleWindField(pr.x, pr.y, now);
    const sway = wind.x * 4.2;

    // 1. Directional Ground & Canopy Shadow Cast onto Dungeon Floor
    drawDirectionalCastShadow(pr.x, pr.y, sway * 0.6, 8, 32, 14, 1.35);
    ctx.fillStyle = 'rgba(2, 6, 4, 0.52)';
    ctx.beginPath();
    ctx.ellipse(8 + sway * 0.8, -48, 32, 26, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Buttressed 3D Root System Gripping the Stone & Moss
    const roots = [
      { rx: -24, ry: 10, cx: -11, cy: 1 },
      { rx: -10, ry: 14, cx: -4,  cy: 4 },
      { rx: 10,  ry: 14, cx: 5,   cy: 4 },
      { rx: 24,  ry: 9,  cx: 11,  cy: 1 },
    ];
    ctx.lineCap = 'round';
    for (let r = 0; r < roots.length; r++) {
      const rt = roots[r];
      // Root shadow
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.68)';
      ctx.lineWidth = 8.5;
      ctx.beginPath();
      ctx.moveTo(rt.rx, rt.ry + 2);
      ctx.quadraticCurveTo(rt.cx, rt.cy + 2, 0, -12);
      ctx.stroke();

      // Dark bark base
      ctx.strokeStyle = '#140c07';
      ctx.lineWidth = 7.2;
      ctx.beginPath();
      ctx.moveTo(rt.rx, rt.ry);
      ctx.quadraticCurveTo(rt.cx, rt.cy, 0, -13);
      ctx.stroke();

      // Warm heartwood bark ridge
      ctx.strokeStyle = '#3b2618';
      ctx.lineWidth = 4.2;
      ctx.beginPath();
      ctx.moveTo(rt.rx + 1, rt.ry - 1);
      ctx.quadraticCurveTo(rt.cx, rt.cy - 1, 0, -13);
      ctx.stroke();

      // Upper wood grain highlight
      ctx.strokeStyle = '#5c3d28';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rt.rx + 1, rt.ry - 1.5);
      ctx.quadraticCurveTo(rt.cx - 1, rt.cy - 2, -1, -13);
      ctx.stroke();
    }

    // 3. Twisted Timber Trunk & Primary Boughs with Longitudinal Bark Furrows
    ctx.strokeStyle = '#0d0704';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.quadraticCurveTo(-7, -34, sway * 0.45, -58);
    ctx.stroke();

    const trunkGrad = ctx.createLinearGradient(-9, -35, 9, -35);
    trunkGrad.addColorStop(0, '#593a25');
    trunkGrad.addColorStop(0.45, '#3b2416');
    trunkGrad.addColorStop(1, '#1a0e08');
    ctx.strokeStyle = trunkGrad;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.quadraticCurveTo(-6, -34, sway * 0.45, -58);
    ctx.stroke();

    // Spreading upper timber branches supporting the canopy
    const branches = [
      { sx: -2, sy: -42, ex: -19 + sway * 0.7, ey: -54, w: 6.5 },
      { sx: 1,  sy: -44, ex: 18 + sway * 0.7,  ey: -52, w: 6.0 },
      { sx: sway * 0.3, sy: -52, ex: sway * 0.85, ey: -66, w: 5.5 },
    ];
    branches.forEach(br => {
      ctx.strokeStyle = '#120a06';
      ctx.lineWidth = br.w + 2.5;
      ctx.beginPath();
      ctx.moveTo(br.sx, br.sy);
      ctx.lineTo(br.ex, br.ey);
      ctx.stroke();

      ctx.strokeStyle = '#42291a';
      ctx.lineWidth = br.w;
      ctx.stroke();
    });

    // Deep vertical bark grain ridges & knots
    ctx.strokeStyle = '#6e4930';
    ctx.lineWidth = 1.6;
    for (let g = -4; g <= 2; g += 3) {
      ctx.beginPath();
      ctx.moveTo(g, -11);
      ctx.quadraticCurveTo(g - 5, -34, g + sway * 0.4, -55);
      ctx.stroke();
    }

    // Hollow owl-knot & shelf bracket fungi on trunk
    ctx.fillStyle = '#080402';
    ctx.beginPath();
    ctx.ellipse(-2, -29, 3, 4.5, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6e4930';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Shelf mushrooms (bracket fungi) on the side of the bark
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.ellipse(5, -22, 4.5, 2.2, 0.1, 0, Math.PI * 2);
    ctx.ellipse(4, -19, 3.5, 1.8, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(2.5, -23, 4, 1.2);

    // 4. 5-Tier Volumetric Leaf Canopy with Individual Serrated Leaf Clusters & Wind Flutter
    const canopyClusters = [
      { cx: -20, cy: -50, r: 17, tier: 0 },
      { cx: 20,  cy: -48, r: 16, tier: 0 },
      { cx: 0,   cy: -62, r: 22, tier: 0 },
      { cx: -17, cy: -54, r: 15, tier: 1 },
      { cx: 17,  cy: -52, r: 14, tier: 1 },
      { cx: 0,   cy: -65, r: 19, tier: 1 },
      { cx: -11, cy: -59, r: 13, tier: 2 },
      { cx: 11,  cy: -57, r: 12, tier: 2 },
      { cx: -1,  cy: -68, r: 15, tier: 2 },
      { cx: -12, cy: -62, r: 8.5, tier: 3 },
      { cx: 9,   cy: -61, r: 8.0, tier: 3 },
      { cx: -2,  cy: -71, r: 9.5, tier: 3 },
    ];
    const tierColors = ['#07120a', '#112616', '#1e4227', '#356e43'];

    for (let c = 0; c < canopyClusters.length; c++) {
      const cl = canopyClusters[c];
      const tierSway = sway * (0.55 + cl.tier * 0.18) + Math.sin(now * 0.004 + c) * 1.2;
      const lx = cl.cx + tierSway;
      const ly = cl.cy + wind.y * 1.5;

      ctx.fillStyle = tierColors[cl.tier];
      ctx.beginPath();
      ctx.arc(lx, ly, cl.r, 0, Math.PI * 2);
      ctx.fill();

      // Individual scalloped leaf tips around cluster perimeter for realistic foliage silhouette
      if (cl.tier >= 2) {
        const leafCol = (cl.tier === 3) ? '#4ade80' : '#2d5c39';
        ctx.fillStyle = leafCol;
        for (let a = 0; a < 5; a++) {
          const ang = -2.4 + a * 0.65 + wind.x * 0.12;
          const px = lx + Math.cos(ang) * (cl.r * 0.78);
          const py = ly + Math.sin(ang) * (cl.r * 0.78);
          ctx.beginPath();
          ctx.ellipse(px, py, 4.2, 2.2, ang, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.restore();
  };

  // -------------------------------------------------------------
  // B4. CLIMBABLE GIANT TREE & ROPE LADDER: Deep Bark Grain, Buttress
  //     Roots, Twisted Hemp Ropes, Ash-Wood Rungs & Cast Ladder Shadows
  // -------------------------------------------------------------
  drawClimbableTreeTrunkTile = function (x, y, theme, now) {
    drawTileFloorGrass(x, y, theme, now);
    const wind = sampleWindField(x + 32, y + 32, now);

    ctx.save();
    // 1. Directional Cast Shadow of the Giant World-Tree Trunk
    drawDirectionalCastShadow(x + 32, y + 48, x + 32, y + 54, 31, 14, 1.4);

    // 2. Massive Flared Buttress Trunk with 3D Cylindrical Bark Shading
    const trunkGrad = ctx.createLinearGradient(x + 6, y, x + 58, y);
    trunkGrad.addColorStop(0, '#1c1008');
    trunkGrad.addColorStop(0.22, '#4a2e1b');
    trunkGrad.addColorStop(0.48, '#694228');
    trunkGrad.addColorStop(0.76, '#382214');
    trunkGrad.addColorStop(1, '#140b05');

    ctx.fillStyle = '#090503';
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 61);
    ctx.quadraticCurveTo(x + 11, y + 32, x + 12, y - 18);
    ctx.lineTo(x + 52, y - 18);
    ctx.quadraticCurveTo(x + 53, y + 32, x + 61, y + 61);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = trunkGrad;
    ctx.beginPath();
    ctx.moveTo(x + 5, y + 60);
    ctx.quadraticCurveTo(x + 13, y + 32, x + 14, y - 16);
    ctx.lineTo(x + 50, y - 16);
    ctx.quadraticCurveTo(x + 51, y + 32, x + 59, y + 60);
    ctx.closePath();
    ctx.fill();

    // 3. Deep Vertical Bark Furrows, Cross-Fissures & Wood Grain
    for (let bx = 16; bx <= 48; bx += 5) {
      const flare = (bx - 32) * 0.18;
      ctx.strokeStyle = (bx % 2 === 0) ? '#170d06' : '#2b190e';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(x + bx, y - 15);
      ctx.quadraticCurveTo(x + bx + flare * 0.5, y + 22, x + bx + flare, y + 58);
      ctx.stroke();

      if (bx < 36) {
        ctx.strokeStyle = 'rgba(146, 98, 62, 0.35)';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(x + bx + 1.2, y - 14);
        ctx.lineTo(x + bx + 1.2 + flare * 0.7, y + 55);
        ctx.stroke();
      }
    }

    // Spiraling Flowering Ivy Vine Wrapping the Trunk
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 54);
    ctx.bezierCurveTo(x + 50, y + 38, x + 14, y + 20, x + 50, y - 4);
    ctx.stroke();

    ctx.strokeStyle = '#15803d';
    ctx.lineWidth = 3.0;
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 52);
    ctx.bezierCurveTo(x + 50, y + 36, x + 14, y + 18, x + 50, y - 6);
    ctx.stroke();

    // Ivy leaves along the trunk
    const ivyPts = [[16, 46], [34, 36], [24, 22], [42, 6]];
    ivyPts.forEach(([ix, iy], idx) => {
      ctx.fillStyle = idx % 2 === 0 ? '#22c55e' : '#4ade80';
      ctx.beginPath();
      ctx.ellipse(x + ix + wind.x * 1.2, y + iy, 4.5, 2.4, idx * 0.6, 0, Math.PI * 2);
      ctx.fill();
    });

    // 4. 3D Rope & Split-Ash Timber Ladder with Cast Shadows, Iron Pitons & Braided Rope
    const ladSway = wind.x * 1.1;
    const leftRopeX = x + 20 + ladSway * 0.4;
    const rightRopeX = x + 44 + ladSway * 0.4;

    // Cast shadow of side ropes onto the bark
    ctx.strokeStyle = 'rgba(5, 3, 1, 0.72)';
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(leftRopeX + 2.5, y - 15);
    ctx.lineTo(leftRopeX + 2.5, y + 56);
    ctx.moveTo(rightRopeX + 2.5, y - 15);
    ctx.lineTo(rightRopeX + 2.5, y + 56);
    ctx.stroke();

    // Twisted 3-ply hemp side ropes
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(leftRopeX, y - 15);
    ctx.lineTo(leftRopeX, y + 56);
    ctx.moveTo(rightRopeX, y - 15);
    ctx.lineTo(rightRopeX, y + 56);
    ctx.stroke();

    // Braided hemp rope twist highlights
    ctx.strokeStyle = '#fcd34d';
    ctx.lineWidth = 1.2;
    for (let ty = y - 12; ty < y + 54; ty += 5) {
      ctx.beginPath();
      ctx.moveTo(leftRopeX - 1, ty);
      ctx.lineTo(leftRopeX + 1, ty + 2.5);
      ctx.moveTo(rightRopeX - 1, ty);
      ctx.lineTo(rightRopeX + 1, ty + 2.5);
      ctx.stroke();
    }

    // Cylindrical Wooden Ladder Rungs with Wood Grain, End-Grain Circles & Rope Lashings
    for (let ry = y - 8; ry <= y + 50; ry += 10) {
      // Cast rung shadow onto tree bark
      ctx.fillStyle = 'rgba(4, 2, 1, 0.76)';
      ctx.fillRect(leftRopeX - 2, ry + 3.5, 28, 4.5);

      // Rung dark timber underside
      ctx.fillStyle = '#451a03';
      ctx.fillRect(leftRopeX - 3, ry, 30, 5.5);

      // Rung cylindrical lit oak surface
      ctx.fillStyle = '#b45309';
      ctx.fillRect(leftRopeX - 2, ry + 0.6, 28, 3.2);

      // Wood grain & center boot-wear highlight
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(leftRopeX + 3, ry + 0.8, 18, 1.3);

      // End-grain timber circles on left & right ends of rung
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.arc(leftRopeX - 2.5, ry + 2.7, 2.2, 0, Math.PI * 2);
      ctx.arc(rightRopeX + 2.5, ry + 2.7, 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Criss-cross leather lashing knots binding rung to hemp ropes
      ctx.fillStyle = '#78350f';
      ctx.fillRect(leftRopeX - 1.8, ry - 0.5, 3.6, 6.5);
      ctx.fillRect(rightRopeX - 1.8, ry - 0.5, 3.6, 6.5);
    }

    // Forged Iron Piton Anchors at top of ladder with metallic glint
    ctx.fillStyle = '#64748b';
    ctx.fillRect(leftRopeX - 2, y - 15, 4, 4);
    ctx.fillRect(rightRopeX - 2, y - 15, 4, 4);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(leftRopeX - 1, y - 14.5, 2, 1.5);
    ctx.fillRect(rightRopeX - 1, y - 14.5, 2, 1.5);

    const bob = Math.sin(now * 0.006) * 2.5;
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('▲ CLIMB TREE', x + 33, y + 63 + bob);
    ctx.fillStyle = '#fde047';
    ctx.fillText('▲ CLIMB TREE', x + 32, y + 62 + bob);
    ctx.restore();
  };

  // -------------------------------------------------------------
  // B5. CANOPY TREEHOUSE: Timber Support Struts, Diagonal Bracing,
  //     Beveled Cedar Planks, Wood Grain, Forged Nails & Swinging Lanterns
  // -------------------------------------------------------------
  drawCanopyTreehouseFloorTile = function (x, y, r, c, theme, now) {
    drawTileFloorGrass(x, y, theme, now);
    const wind = sampleWindField(x + 32, y + 32, now);

    // 1. Deep Dappled Canopy & Platform Cast Shadow on the Ground Below
    ctx.fillStyle = 'rgba(2, 6, 4, 0.68)';
    ctx.fillRect(x - 2, y + 10, TILE_SIZE + 4, TILE_SIZE - 4);

    const elevY = y - 36;

    // 2. Heavy Load-Bearing Timber Support Columns & Diagonal Mortise Braces
    const postPositions = [x + 5, x + TILE_SIZE - 15];
    postPositions.forEach((px, idx) => {
      // Post shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillRect(px + 3, elevY + TILE_SIZE - 6, 10, 44);

      // Post heartwood body
      const postGrad = ctx.createLinearGradient(px, 0, px + 10, 0);
      postGrad.addColorStop(0, '#27150b');
      postGrad.addColorStop(0.4, '#5c341d');
      postGrad.addColorStop(1, '#1a0d06');
      ctx.fillStyle = postGrad;
      ctx.fillRect(px, elevY + TILE_SIZE - 6, 10, 42);

      // Diagonal timber knee-brace under deck
      ctx.strokeStyle = '#432514';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(px + 5, elevY + TILE_SIZE + 14);
      ctx.lineTo(px + (idx === 0 ? 18 : -8), elevY + TILE_SIZE - 4);
      ctx.stroke();
    });

    // 3. Swaying Perimeter Canopy Boughs Framing the Treehouse Deck
    const boughSway = wind.x * 3.2;
    const boughs = [
      { bx: x + 8 + boughSway, by: elevY + 8, r: 17, col: '#0d3b1e' },
      { bx: x + 56 + boughSway, by: elevY + 8, r: 17, col: '#0d3b1e' },
      { bx: x + 32 + boughSway, by: elevY + 4, r: 19, col: '#14532d' },
      { bx: x + 10 + boughSway * 1.1, by: elevY + 6, r: 11, col: '#22c55e' },
      { bx: x + 54 + boughSway * 1.1, by: elevY + 6, r: 11, col: '#22c55e' },
    ];
    boughs.forEach(b => {
      ctx.fillStyle = b.col;
      ctx.beginPath();
      ctx.arc(b.bx, b.by, b.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // 4. Individual Beveled Cedar/Oak Deck Planks with Wood Grain, Knots & Iron Nail Glints
    ctx.fillStyle = '#1c0c04';
    ctx.fillRect(x + 1, elevY + 1, TILE_SIZE - 2, TILE_SIZE - 2);

    const numPlanks = 5;
    const plankH = (TILE_SIZE - 6) / numPlanks;
    for (let pIdx = 0; pIdx < numPlanks; pIdx++) {
      const py = elevY + 3 + pIdx * plankH;
      const pGrad = ctx.createLinearGradient(x + 3, py, x + 3, py + plankH - 1.5);
      pGrad.addColorStop(0, (pIdx % 2 === 0) ? '#9a4a17' : '#853f12');
      pGrad.addColorStop(0.65, (pIdx % 2 === 0) ? '#78350f' : '#6b2e0c');
      pGrad.addColorStop(1, '#3f1905');
      ctx.fillStyle = pGrad;
      ctx.fillRect(x + 3, py, TILE_SIZE - 6, plankH - 1.5);

      // Top bevel highlight on each wooden plank
      ctx.fillStyle = 'rgba(253, 224, 71, 0.18)';
      ctx.fillRect(x + 3, py, TILE_SIZE - 6, 1.3);

      // Wood grain striations & knot rings
      ctx.strokeStyle = 'rgba(45, 18, 6, 0.48)';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(x + 8, py + plankH * 0.48);
      ctx.quadraticCurveTo(x + 32, py + plankH * (pIdx % 2 === 0 ? 0.25 : 0.72), x + TILE_SIZE - 8, py + plankH * 0.5);
      ctx.stroke();

      if ((pIdx + r + c) % 3 === 0) {
        const kx = x + 20 + ((pIdx * 17 + c * 9) % 24);
        ctx.fillStyle = '#2e1204';
        ctx.beginPath();
        ctx.ellipse(kx, py + plankH * 0.5, 3.2, 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Countersunk forged-iron nail heads at plank ends with metallic glint
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x + 5, py + 2.5, 2.5, 2.5);
      ctx.fillRect(x + TILE_SIZE - 7.5, py + 2.5, 2.5, 2.5);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(x + 5.5, py + 2.5, 1.2, 1.2);
      ctx.fillRect(x + TILE_SIZE - 7, py + 2.5, 1.2, 1.2);
    }

    // Exposed timber deck rim joist along bottom edge
    ctx.fillStyle = '#271105';
    ctx.fillRect(x + 1, elevY + TILE_SIZE - 4, TILE_SIZE - 2, 5);
    ctx.fillStyle = '#5c2b0e';
    ctx.fillRect(x + 2, elevY + TILE_SIZE - 3, TILE_SIZE - 4, 2);

    // 5. Rustic Timber & Braided-Rope Safety Railings + Swinging Brass Wind-Lantern
    const isTopEdge = (r > 0 && state.map[r - 1][c] !== T_TREEHOUSE_FLOOR && state.map[r - 1][c] !== T_TREEHOUSE_NPC);
    const isLeftEdge = (c > 0 && state.map[r][c - 1] !== T_TREEHOUSE_FLOOR && state.map[r][c - 1] !== T_TREEHOUSE_NPC);
    const isRightEdge = (c < DUNGEON_COLS - 1 && state.map[r][c + 1] !== T_TREEHOUSE_FLOOR && state.map[r][c + 1] !== T_TREEHOUSE_NPC);

    if (isTopEdge) {
      // Railing posts + top log rail
      ctx.fillStyle = '#3f1d0b';
      ctx.fillRect(x + 3, elevY - 11, 5, 13);
      ctx.fillRect(x + TILE_SIZE - 8, elevY - 11, 5, 13);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(x + 2, elevY - 9, TILE_SIZE - 4, 4.5);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(x + 2, elevY - 9, TILE_SIZE - 4, 1.5);

      // Swinging brass lantern in center of top rail
      const lanternSwing = wind.x * 2.2;
      const lx = x + 32 + lanternSwing;
      const ly = elevY - 5;
      const glow = 0.72 + Math.sin(now * 0.006 + c) * 0.22;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const lGrad = ctx.createRadialGradient(lx, ly, 1, lx, ly, 22);
      lGrad.addColorStop(0, `rgba(254, 240, 138, ${glow})`);
      lGrad.addColorStop(0.5, `rgba(245, 158, 11, ${glow * 0.45})`);
      lGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = lGrad;
      ctx.beginPath();
      ctx.arc(lx, ly, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#d97706';
      ctx.fillRect(lx - 3, ly - 4, 6, 7);
      ctx.fillStyle = '#fef9c3';
      ctx.fillRect(lx - 1.8, ly - 2.5, 3.6, 4);
    }
    if (isLeftEdge) {
      ctx.fillStyle = '#5c2b0e';
      ctx.fillRect(x + 1, elevY - 4, 5.5, TILE_SIZE + 2);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(x + 2, elevY - 4, 2, TILE_SIZE + 2);
    }
    if (isRightEdge) {
      ctx.fillStyle = '#5c2b0e';
      ctx.fillRect(x + TILE_SIZE - 6.5, elevY - 4, 5.5, TILE_SIZE + 2);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(x + TILE_SIZE - 5.5, elevY - 4, 2, TILE_SIZE + 2);
    }
  };

  // -------------------------------------------------------------
  // B6. MONUMENTAL 3D STAIRCASES & STEPPED RAMPS: Carved Stone
  //     Balustrades, Overhanging Beveled Treads, Riser Shadows & Reflections
  // -------------------------------------------------------------
  drawStairsDown = function (x, y, theme, now) {
    // 1. Deep sunken stairwell abyssal pit
    ctx.fillStyle = '#020407';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

    // 2. Heavy 3D Carved Stone Side-Balustrades (left & right wing walls casting shadows inward)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.fillRect(x - 2, y + 2, TILE_SIZE + 4, TILE_SIZE);

    const balGrad = ctx.createLinearGradient(x, y, x, y + TILE_SIZE);
    balGrad.addColorStop(0, '#475569');
    balGrad.addColorStop(0.5, '#334155');
    balGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = balGrad;
    ctx.fillRect(x + 1, y + 1, 8, TILE_SIZE - 2);
    ctx.fillRect(x + TILE_SIZE - 9, y + 1, 8, TILE_SIZE - 2);

    // Chiseled gold-bronze trim along balustrade caps
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(x + 2, y + 2, 6, 3);
    ctx.fillRect(x + TILE_SIZE - 8, y + 2, 6, 3);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(x + 2, y + 5, 2, TILE_SIZE - 8);
    ctx.fillRect(x + TILE_SIZE - 8, y + 5, 2, TILE_SIZE - 8);

    // 3. 5 Descending 3D Chiseled Stone Steps (perspectival narrowing + riser occlusion shadow + wet glint)
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const sy = y + 6 + i * 10.5;
      const inset = i * 1.4;
      const treadW = TILE_SIZE - 18 - inset * 2;
      const sx = x + 9 + inset;
      const lum = Math.max(14, 64 - i * 11);

      // Step tread surface
      ctx.fillStyle = `rgb(${lum}, ${lum + 7}, ${lum + 14})`;
      ctx.fillRect(sx, sy, treadW, 7.5);

      // Overhanging front nosing bevel + wet golden reflection
      ctx.fillStyle = `rgba(253, 224, 71, ${(0.52 - i * 0.08).toFixed(2)})`;
      ctx.fillRect(sx, sy, treadW, 1.8);

      // Vertical stone mortar joints & chipped stone detail
      ctx.fillStyle = 'rgba(5, 8, 13, 0.65)';
      ctx.fillRect(sx + treadW * 0.35 + (i % 2) * 5, sy, 1.5, 7.5);
      ctx.fillRect(sx + treadW * 0.68 - (i % 2) * 4, sy, 1.5, 7.5);

      // Deep vertical step riser shadow underneath tread
      ctx.fillStyle = '#03060a';
      ctx.fillRect(sx, sy + 7.2, treadW, 3.8);

      // Creeping subterranean moss in step corners
      if (i < 3) {
        ctx.fillStyle = '#15803d';
        ctx.fillRect(sx + 1, sy + 1, 5, 2.5);
        ctx.fillRect(sx + treadW - 6, sy + 1, 5, 2.5);
      }
    }

    // 4. Diagonal Wall-Shadow Cast Across the Stairwell + Warm Portal Glow at Bottom
    ctx.fillStyle = 'rgba(2, 4, 8, 0.42)';
    ctx.beginPath();
    ctx.moveTo(x + 9, y + 6);
    ctx.lineTo(x + 28, y + 6);
    ctx.lineTo(x + 14, y + TILE_SIZE - 4);
    ctx.lineTo(x + 9, y + TILE_SIZE - 4);
    ctx.closePath();
    ctx.fill();

    const glow = Math.sin(now * 0.006) * 5;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const pGrad = ctx.createRadialGradient(x + 32, y + 52, 2, x + 32, y + 52, 26);
    pGrad.addColorStop(0, 'rgba(254, 240, 138, 0.65)');
    pGrad.addColorStop(0.55, 'rgba(245, 158, 11, 0.28)');
    pGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = pGrad;
    ctx.fillRect(x + 8, y + 32, TILE_SIZE - 16, 28);

    // Twin flaming brazier finials at the top of the staircase balustrades
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(x + 5, y + 12, 4.5 + glow * 0.2, 0, Math.PI * 2);
    ctx.arc(x + TILE_SIZE - 5, y + 12, 4.5 + glow * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000000';
    ctx.fillText('▼ NEXT FLOOR ▼', x + TILE_SIZE / 2 + 1, y + 7);
    ctx.fillStyle = '#fde047';
    ctx.fillText('▼ NEXT FLOOR ▼', x + TILE_SIZE / 2, y + 6);
  };

  drawStairsUp = function (x, y, theme, now) {
    ctx.fillStyle = '#05080f';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

    // 1. Cast shadow around the base of the ascending stone staircase
    drawDirectionalCastShadow(x + 32, y + 52, x + 32, y + 56, 32, 12, 1.2);

    // 2. Stepped 3D Stone Side-Banisters rising toward the upper portal
    const banGrad = ctx.createLinearGradient(x, y + TILE_SIZE, x, y);
    banGrad.addColorStop(0, '#1e293b');
    banGrad.addColorStop(0.5, '#475569');
    banGrad.addColorStop(1, '#94a3b8');
    ctx.fillStyle = banGrad;
    ctx.fillRect(x + 2, y - 4, 8, TILE_SIZE + 2);
    ctx.fillRect(x + TILE_SIZE - 10, y - 4, 8, TILE_SIZE + 2);

    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(x + 3, y - 4, 6, 3);
    ctx.fillRect(x + TILE_SIZE - 9, y - 4, 6, 3);

    // 3. 5 Ascending 3D Stone Treads (rising upward with overhanging shadow lips & cyan daylight reflection)
    const steps = 5;
    for (let i = steps - 1; i >= 0; i--) {
      const sy = y + 4 + i * 11;
      const elevLift = (steps - 1 - i) * 1.5;
      const lum = Math.min(115, 32 + (steps - 1 - i) * 17);
      const sx = x + 10;
      const treadW = TILE_SIZE - 20;

      // Riser face & drop shadow onto step below
      ctx.fillStyle = '#04070c';
      ctx.fillRect(sx, sy - elevLift + 7, treadW, 5.5);

      // Chiseled granite tread
      ctx.fillStyle = `rgb(${lum}, ${lum + 12}, ${lum + 24})`;
      ctx.fillRect(sx, sy - elevLift, treadW, 7.5);

      // Specular cyan-silver edge highlight from upper floor light shaft
      ctx.fillStyle = `rgba(186, 230, 253, ${(0.22 + (steps - 1 - i) * 0.11).toFixed(2)})`;
      ctx.fillRect(sx, sy - elevLift, treadW, 2.0);

      // Block mortar seams
      ctx.fillStyle = 'rgba(7, 11, 18, 0.55)';
      ctx.fillRect(sx + 14 + (i % 2) * 8, sy - elevLift, 1.5, 7.5);
    }

    // 4. Overhead Light Shaft Streaming Down Onto the Top Steps
    const glow = Math.sin(now * 0.006) * 4;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const rayGrad = ctx.createLinearGradient(x + 32, y - 8, x + 32, y + 36);
    rayGrad.addColorStop(0, 'rgba(125, 211, 252, 0.52)');
    rayGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = rayGrad;
    ctx.fillRect(x + 10, y - 6, TILE_SIZE - 20, 42);

    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(x + 6, y + 12, 4.5 + glow * 0.2, 0, Math.PI * 2);
    ctx.arc(x + TILE_SIZE - 6, y + 12, 4.5 + glow * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const label = '▲ PREV FLOOR ▲';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000000';
    ctx.fillText(label, x + TILE_SIZE / 2 + 1, y + 7);
    ctx.fillStyle = '#7dd3fc';
    ctx.fillText(label, x + TILE_SIZE / 2, y + 6);
  };

  // -------------------------------------------------------------
  // B7. ENSNARING GROUND VINES: Coiled Woody Lianas, Bark Striations,
  //     Cast Tendril Shadows, Crimson Thorns, Leaves & Venom Sap Droplets
  // -------------------------------------------------------------
  drawBossBattlegroundVine = function (vine, now) {
    if (!vine || !inView(vine.x, vine.y, 64)) return;
    const wind = sampleWindField(vine.x, vine.y, now);
    ctx.save();
    ctx.translate(vine.x, vine.y);

    // 1. Cracked Subterranean Earth Crater & Root Shadow
    drawDirectionalCastShadow(vine.x, vine.y, 0, 5, 28, 14, 0.85);
    ctx.fillStyle = '#040a06';
    ctx.beginPath();
    ctx.ellipse(0, 3, 24, 11.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1b2e1e';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Central woody root-burl knot emerging from the ground fissure
    ctx.fillStyle = '#29180d';
    ctx.beginPath();
    ctx.ellipse(0, 2, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a2c18';
    ctx.beginPath();
    ctx.ellipse(-2, 0, 7, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. 6 Writhing 3D Muscular Thorny Tendrils with Cast Shadows, Leaves & Sap
    const lashBoost = (vine.lashingAnim > 0) ? 16 : 0;
    const numTendrils = 6;
    for (let t = 0; t < numTendrils; t++) {
      const ang = (t / numTendrils) * Math.PI * 2 + (vine.phase || 0);
      const sway = Math.sin(now * 0.0065 + t * 1.35) * 7.5 + wind.x * 3.5;
      const vx = Math.cos(ang) * 16;
      const vy = Math.sin(ang) * 8;
      const tipX = vx * 1.35 - sway * 0.55;
      const tipY = vy - 22 - lashBoost - (t % 2) * 4;
      const ctrlX = vx + sway;
      const ctrlY = vy - 11 - lashBoost * 0.5;

      // Cast shadow of tendril on the dungeon floor
      ctx.strokeStyle = 'rgba(2, 6, 3, 0.62)';
      ctx.lineWidth = 5.0;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(vx * 0.25, vy * 0.25 + 3);
      ctx.quadraticCurveTo(ctrlX + 5, vy + 5, tipX + 7, vy + 3);
      ctx.stroke();

      // Dark woody outer bark silhouette
      ctx.strokeStyle = '#07140b';
      ctx.lineWidth = 5.4;
      ctx.beginPath();
      ctx.moveTo(vx * 0.25, vy * 0.25);
      ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
      ctx.stroke();

      // Mid-tone fibrous vine body
      ctx.strokeStyle = (t % 2 === 0) ? '#15803d' : '#166534';
      ctx.lineWidth = 3.4;
      ctx.stroke();

      // Specular sapwood ridge highlight
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(vx * 0.25 - 0.8, vy * 0.25 - 0.8);
      ctx.quadraticCurveTo(ctrlX - 1, ctrlY - 1, tipX - 0.8, tipY);
      ctx.stroke();

      // Hooked Crimson-Amber Rose Thorns along the tendril
      const thornX = (vx * 0.25 + ctrlX + tipX) / 3;
      const thornY = (vy * 0.25 + ctrlY + tipY) / 3;
      ctx.fillStyle = '#9f1239';
      ctx.beginPath();
      ctx.moveTo(thornX - 2, thornY);
      ctx.lineTo(thornX + (t % 2 === 0 ? 4.5 : -4.5), thornY - 3.5);
      ctx.lineTo(thornX + 1.5, thornY + 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fda4af';
      ctx.fillRect(thornX, thornY - 2, 1.5, 1.5);

      // Serrated creeper leaf fluttering on alternating tendrils
      if (t % 2 === 0) {
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.ellipse(ctrlX * 0.7, ctrlY + 2, 4.5, 2.3, sway * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }

      // Glistening venom/sap droplet at the curled tip
      ctx.fillStyle = '#a3e635';
      ctx.beginPath();
      ctx.arc(tipX, tipY, 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(tipX - 0.8, tipY - 0.8, 1.2, 1.2);
    }

    ctx.restore();
  };

  // -------------------------------------------------------------
  // B8. METAL GRATES, SPIKE BLADES & CORRUGATED SCRAP-METAL HUTS:
  //     Brushed Anisotropic Steel, Rivets, Rust Patina & Specular Glints
  // -------------------------------------------------------------
  drawSpikeGrateBase = function (sp) {
    const now = performance.now();
    // 1. Deep recessed mechanical shaft pit beneath the grate
    ctx.fillStyle = '#030508';
    ctx.fillRect(sp.x, sp.y, sp.w, sp.h);

    // 2. Heavy Beveled Forged-Iron Perimeter Frame with Corner Hex Bolts
    const frameGrad = ctx.createLinearGradient(sp.x, sp.y, sp.x + sp.w, sp.y + sp.h);
    frameGrad.addColorStop(0, '#475569');
    frameGrad.addColorStop(0.5, '#1e293b');
    frameGrad.addColorStop(1, '#334155');
    ctx.strokeStyle = frameGrad;
    ctx.lineWidth = 4;
    ctx.strokeRect(sp.x + 2, sp.y + 2, sp.w - 4, sp.h - 4);

    // Specular top-left metallic rim highlight
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(sp.x + 1, sp.y + sp.h - 1);
    ctx.lineTo(sp.x + 1, sp.y + 1);
    ctx.lineTo(sp.x + sp.w - 1, sp.y + 1);
    ctx.stroke();

    // 3. Cross-Hatched Industrial Steel Grate Bars with Cast Sub-Pit Shadows
    const stepX = sp.w / sp.cols;
    const stepY = sp.h / sp.rows;

    for (let c = 1; c < sp.cols; c++) {
      const bx = sp.x + c * stepX;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(bx + 1.5, sp.y + 4, 3, sp.h - 8);
      ctx.fillStyle = '#334155';
      ctx.fillRect(bx - 1.5, sp.y + 4, 3, sp.h - 8);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(bx - 1.5, sp.y + 4, 1.2, sp.h - 8);
    }
    for (let r = 1; r < sp.rows; r++) {
      const by = sp.y + r * stepY;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(sp.x + 4, by + 1.5, sp.w - 8, 3);
      ctx.fillStyle = '#334155';
      ctx.fillRect(sp.x + 4, by - 1.5, sp.w - 8, 3);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(sp.x + 4, by - 1.5, sp.w - 8, 1.2);
    }

    // 4. Individual Machined Steel Spike Sockets, Rust Patina & Warning Glow
    for (let r = 0; r < sp.rows; r++) {
      for (let c = 0; c < sp.cols; c++) {
        const hx = sp.x + (c + 0.5) * stepX;
        const hy = sp.y + (r + 0.5) * stepY;

        // Beveled octagonal steel collar around spike hole
        ctx.fillStyle = '#475569';
        ctx.fillRect(hx - 7, hy - 5.5, 14, 11);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(hx - 7, hy - 5.5, 14, 1.8);

        // Oxidation rust stain on alternating sockets
        if ((r + c) % 2 === 0) {
          ctx.fillStyle = 'rgba(154, 52, 18, 0.55)';
          ctx.fillRect(hx + 3, hy + 2, 4, 3);
        }

        // Dark socket aperture
        ctx.fillStyle = '#020306';
        ctx.fillRect(hx - 5, hy - 3.8, 10, 7.6);

        if (sp.phase === 'warning') {
          const warnPulse = 0.65 + 0.35 * Math.sin(now * 0.035);
          ctx.fillStyle = `rgba(255, 145, 0, ${warnPulse.toFixed(2)})`;
          ctx.fillRect(hx - 3.5, hy - 2.5, 7, 5);
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(hx - 1.5, hy - 1, 3, 2);
        }
      }
    }

    // Corner hex rivets with specular steel glints
    const corners = [
      [sp.x + 5, sp.y + 5],
      [sp.x + sp.w - 7, sp.y + 5],
      [sp.x + 5, sp.y + sp.h - 7],
      [sp.x + sp.w - 7, sp.y + sp.h - 7]
    ];
    corners.forEach(([cx, cy]) => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(cx - 1, cy - 1, 4, 4);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(cx, cy, 2, 2);
    });
  };

  drawVolumetricSpikeBlades = function (sp) {
    const stepX = sp.w / sp.cols;
    const stepY = sp.h / sp.rows;
    const spikeH = sp.ext * 36;
    const glintSweep = ((performance.now() * 0.04) % 24) / 24;

    for (let r = 0; r < sp.rows; r++) {
      for (let c = 0; c < sp.cols; c++) {
        const sx = sp.x + (c + 0.5) * stepX;
        const sy = sp.y + (r + 0.5) * stepY;

        // 1. Directional Cast Shadow of the Steel Spike on the Grate
        ctx.fillStyle = 'rgba(0, 0, 0, 0.74)';
        ctx.beginPath();
        ctx.moveTo(sx - 4, sy + 2);
        ctx.lineTo(sx + spikeH * 0.52, sy + 6);
        ctx.lineTo(sx + 5, sy + 2);
        ctx.closePath();
        ctx.fill();

        // 2. Left Dark Tempered-Iron Facet
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.moveTo(sx - 6.5, sy + 2);
        ctx.lineTo(sx, sy - spikeH);
        ctx.lineTo(sx, sy + 4);
        ctx.closePath();
        ctx.fill();

        // 3. Right Brushed-Steel Sunlit Facet
        const steelGrad = ctx.createLinearGradient(sx, sy - spikeH, sx + 6.5, sy + 2);
        steelGrad.addColorStop(0, '#f8fafc');
        steelGrad.addColorStop(0.45, '#cbd5e1');
        steelGrad.addColorStop(1, '#64748b');
        ctx.fillStyle = steelGrad;
        ctx.beginPath();
        ctx.moveTo(sx + 6.5, sy + 2);
        ctx.lineTo(sx, sy - spikeH);
        ctx.lineTo(sx, sy + 4);
        ctx.closePath();
        ctx.fill();

        // 4. Recessed Blood-Fuller Groove & Central Bevel Ridge
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(sx - 1.5, sy + 1);
        ctx.lineTo(sx - 0.5, sy - spikeH * 0.65);
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(sx, sy + 3);
        ctx.lineTo(sx, sy - spikeH);
        ctx.stroke();

        // 5. Crimson Blood-Stained Impaler Tip + Moving Specular Glint
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.moveTo(sx - 2.8, sy - spikeH + 8);
        ctx.lineTo(sx, sy - spikeH);
        ctx.lineTo(sx + 2.8, sy - spikeH + 8);
        ctx.closePath();
        ctx.fill();

        const gy = sy - spikeH * (0.25 + glintSweep * 0.55);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sx - 0.8, gy, 2.2, 2.2);
      }
    }
  };

  drawScrapMetalTrashHutTile = function (x, y, theme, now) {
    drawTileFloorTrash(x, y, theme, now);
    const hut = state.trashHuts.find(h => Math.abs(h.x - (x + 32)) < 16 && Math.abs(h.y - (y + 32)) < 16);
    const shudderX = (hut && hut.shudderAnim > 0) ? Math.sin(now * 0.08) * 3.8 : 0;

    ctx.save();
    ctx.translate(x + 32 + shudderX, y + 36);

    // 1. Directional Ground Cast Shadow + Ambient Contact Shadow
    drawDirectionalCastShadow(x + 32, y + 36, 2, 10, 34, 15, 1.3);

    // 2. Scattered Scrap-Iron & Rusted Barrel Debris Around Base
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-29, 3, 14, 10);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(-28, 4, 12, 2);
    ctx.fillStyle = '#7c2d12';
    ctx.fillRect(16, 1, 13, 12);
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(17, 2, 11, 2);

    // 3. Corrugated Sheet-Metal Walls with Sinusoidal Lit Ridges & Shadow Valleys
    ctx.fillStyle = '#090d14';
    ctx.fillRect(-25, -27, 50, 40);

    for (let cx = -23; cx < 23; cx += 4) {
      const isRidge = ((cx + 23) % 8 === 0);
      ctx.fillStyle = isRidge ? '#64748b' : '#334155';
      ctx.fillRect(cx, -25, 2.5, 36);
      ctx.fillStyle = isRidge ? '#cbd5e1' : '#1e293b';
      ctx.fillRect(cx + 2.5, -25, 1.5, 36);
    }

    // Diagonal Anisotropic Metallic Specular Sheen Across Sheet Metal
    ctx.save();
    ctx.fillStyle = 'rgba(241, 245, 249, 0.16)';
    ctx.beginPath();
    ctx.moveTo(-22, -10);
    ctx.lineTo(-4, -25);
    ctx.lineTo(6, -25);
    ctx.lineTo(-14, -4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Welded Rust-Pitted Steel Patch Plates & Rivet Rows
    ctx.fillStyle = '#7c2d12';
    ctx.fillRect(-22, -20, 13, 11);
    ctx.fillStyle = '#9a3412';
    ctx.fillRect(9, -11, 13, 13);
    ctx.fillStyle = '#e2e8f0';
    [[-20, -18], [-11, -18], [-20, -11], [11, -9], [20, -9], [11, 0], [20, 0]].forEach(([rx, ry]) => {
      ctx.fillRect(rx, ry, 1.6, 1.6);
    });

    // Angle-iron corner structural posts
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-25, -26, 3, 38);
    ctx.fillRect(22, -26, 3, 38);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(-24, -25, 1.2, 36);
    ctx.fillRect(22.5, -25, 1.2, 36);

    // 4. Recessed Doorway Aperture & Barricaded Corrugated Iron Door
    ctx.fillStyle = '#030508';
    ctx.fillRect(-9, -13, 18, 25);

    if (!hut || !hut.triggered) {
      const blink = Math.sin(now * 0.0055) > -0.75;
      if (blink) {
        ctx.fillStyle = '#ff1744';
        ctx.fillRect(-5, -4, 3, 3);
        ctx.fillRect(2, -4, 3, 3);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(-4, -3.5, 1.2, 1.2);
        ctx.fillRect(3, -3.5, 1.2, 1.2);
      }
      // Half-ajar corrugated iron door with rivets & handle
      ctx.fillStyle = '#475569';
      ctx.fillRect(-11, -12, 6, 23);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-10, -11, 1.5, 21);
    } else {
      // Kicked-down iron door lying flat on the ground in front of the hut
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillRect(-12, 13, 25, 8);
      ctx.fillStyle = '#475569';
      ctx.fillRect(-12, 11, 24, 7);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(-10, 12, 20, 1.5);
    }

    // 5. Pitched Corrugated Sheet-Metal Roof, Stovepipe Chimney & Rising Smoke
    ctx.fillStyle = '#090d14';
    ctx.beginPath();
    ctx.moveTo(-31, -23);
    ctx.lineTo(0, -43);
    ctx.lineTo(31, -21);
    ctx.lineTo(27, -15);
    ctx.lineTo(-29, -17);
    ctx.closePath();
    ctx.fill();

    const roofGrad = ctx.createLinearGradient(-28, -40, 28, -18);
    roofGrad.addColorStop(0, '#64748b');
    roofGrad.addColorStop(0.45, '#334155');
    roofGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = roofGrad;
    ctx.beginPath();
    ctx.moveTo(-29, -23);
    ctx.lineTo(0, -41);
    ctx.lineTo(29, -21);
    ctx.lineTo(25, -16);
    ctx.lineTo(-27, -18);
    ctx.closePath();
    ctx.fill();

    // Corrugated roof ribs with bright steel specular edge
    for (let rx = -22; rx <= 22; rx += 5) {
      ctx.strokeStyle = (rx % 10 === 0) ? '#e2e8f0' : '#94a3b8';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(rx, -35 + Math.abs(rx) * 0.36);
      ctx.lineTo(rx - 2, -17);
      ctx.stroke();
    }

    // Oxidation rust patches on roof
    ctx.fillStyle = 'rgba(180, 58, 14, 0.76)';
    ctx.fillRect(-16, -29, 12, 6);
    ctx.fillRect(6, -27, 10, 5);

    // Riveted iron stovepipe chimney with cap & drifting smoke puff
    ctx.fillStyle = '#334155';
    ctx.fillRect(10, -47, 6.5, 15);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(11, -46, 1.8, 13);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(8.5, -48.5, 9.5, 3);

    const smokeY = -52 - ((now * 0.015 + x) % 14);
    const smokeX = 13 + Math.sin(now * 0.004 + y) * 3;
    ctx.fillStyle = 'rgba(148, 163, 184, 0.32)';
    ctx.beginPath();
    ctx.arc(smokeX, smokeY, 4.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  // Helper PRNG & Math Utilities for Procedural Generation & Depth Mapping
  function mulberry32(a) {
    return function () {
      let t = (a += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  // -------------------------------------------------------------
  // B9. ELEVATED PLATEAUS, STEPPED RAMPS, CHAIN BRIDGES, CEILING VINES,
  //     HANGING CHAINS, FORGE ANVILS, LORE OBELISKS & OAK CHESTS
  // -------------------------------------------------------------
  drawTileElevatedPlateau = function (x, y, r, c, theme, now) {
    now = now || performance.now();
    theme = theme || {};
    const elevOffset = 10;
    const py = y - elevOffset;

    // 1. Stratified 3D Cliff Wall Face on South Edge + Cast Cliff Shadow
    const hasSouthDrop = (r < DUNGEON_ROWS - 1 && state.map[r + 1][c] !== T_FLOOR_HIGH && state.map[r + 1][c] !== T_STAIRS_RAMP);
    if (hasSouthDrop) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.68)';
      ctx.fillRect(x, y + TILE_SIZE - 8, TILE_SIZE, 20);

      const cliffGrad = ctx.createLinearGradient(x, py + TILE_SIZE, x, y + TILE_SIZE + 4);
      cliffGrad.addColorStop(0, '#334155');
      cliffGrad.addColorStop(0.5, '#1e293b');
      cliffGrad.addColorStop(1, '#090d14');
      ctx.fillStyle = cliffGrad;
      ctx.fillRect(x, py + TILE_SIZE - 2, TILE_SIZE, elevOffset + 6);

      // Vertical rock strata fissures on cliff face
      ctx.fillStyle = '#05080d';
      ctx.fillRect(x + 14, py + TILE_SIZE - 1, 2, elevOffset + 4);
      ctx.fillRect(x + 38, py + TILE_SIZE - 1, 2, elevOffset + 4);
      ctx.fillRect(x + 52, py + TILE_SIZE - 1, 1.5, elevOffset + 4);
    }

    // 2. Elevated Stone Slab Surface with Chiseled Bevels & Moss Overhang
    const platGrad = ctx.createLinearGradient(x, py, x + TILE_SIZE, py + TILE_SIZE);
    platGrad.addColorStop(0, theme.wallTop || '#334155');
    platGrad.addColorStop(1, theme.floorA || '#1e293b');
    ctx.fillStyle = platGrad;
    ctx.fillRect(x, py, TILE_SIZE, TILE_SIZE);

    ctx.strokeStyle = 'rgba(226, 232, 240, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);

    // Chiseled stone flagstones + wet mineral reflection
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(x + 6, py + 5, 24, 18);
    ctx.fillRect(x + 34, py + 28, 22, 20);

    // Hanging moss tendrils along the cliff lip
    if (hasSouthDrop) {
      const wind = sampleWindField(x + 32, y + 32, now);
      ctx.fillStyle = '#15803d';
      for (let m = 0; m < 5; m++) {
        const mx = x + 6 + m * 12;
        const mh = 5 + ((m * 7 + c * 3) % 6);
        ctx.beginPath();
        ctx.moveTo(mx, py + TILE_SIZE - 2);
        ctx.lineTo(mx + 3 + wind.x * 1.2, py + TILE_SIZE - 2 + mh);
        ctx.lineTo(mx + 6, py + TILE_SIZE - 2);
        ctx.closePath();
        ctx.fill();
      }
    }
  };

  drawTileSteppedRamp = function (x, y, theme, now) {
    now = now || performance.now();
    theme = theme || {};
    ctx.fillStyle = theme.floorB || '#0f172a';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

    // 1. Heavy Timber & Iron Side Stringer Rails with Cast Shadow
    drawDirectionalCastShadow(x + 32, y + 34, x + 32, y + 34, 24, 12, 0.9);
    ctx.fillStyle = '#3f1d0b';
    ctx.fillRect(x + 3, y + 2, 6, TILE_SIZE - 4);
    ctx.fillRect(x + TILE_SIZE - 9, y + 2, 6, TILE_SIZE - 4);
    ctx.fillStyle = '#9a4a17';
    ctx.fillRect(x + 4, y + 2, 2, TILE_SIZE - 4);
    ctx.fillRect(x + TILE_SIZE - 8, y + 2, 2, TILE_SIZE - 4);

    // 2. 6 Stepped Stone & Timber Treads with Riser Shadows & Iron Brackets
    const steps = 6;
    const stepH = (TILE_SIZE - 8) / steps;
    for (let i = 0; i < steps; i++) {
      const sy = y + 4 + i * stepH;
      const elev = (steps - 1 - i) * 1.2;
      ctx.fillStyle = '#04070c';
      ctx.fillRect(x + 9, sy - elev + stepH - 3.2, TILE_SIZE - 18, 3.8);

      const lum = 44 + (steps - 1 - i) * 9;
      ctx.fillStyle = `rgb(${lum}, ${lum + 6}, ${lum + 14})`;
      ctx.fillRect(x + 9, sy - elev, TILE_SIZE - 18, stepH - 2.8);

      // Beveled nosing highlight
      ctx.fillStyle = 'rgba(226, 232, 240, 0.32)';
      ctx.fillRect(x + 9, sy - elev, TILE_SIZE - 18, 1.5);

      // Iron corner brackets bolted to stringers
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(x + 9, sy - elev + 1, 2.5, 2.5);
      ctx.fillRect(x + TILE_SIZE - 11.5, sy - elev + 1, 2.5, 2.5);
    }
  };

  drawChainBridgeTile = function (x, y) {
    const now = performance.now();
    // 1. Deep Abyssal Chasm Below Bridge
    ctx.fillStyle = '#030508';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    const wind = sampleWindField(x + 32, y + 32, now);
    const swayX = wind.x * 1.4;

    // 2. Deep Drop Shadow Cast into the Abyssal Fog Below
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.fillRect(x + 6 + swayX + 4, y + 6, TILE_SIZE - 12, TILE_SIZE - 4);

    // 3. Twin Heavy Forged-Iron Suspension Chains Running Vertically
    for (let side = 0; side < 2; side++) {
      const cx = (side === 0 ? x + 9 : x + TILE_SIZE - 9) + swayX;
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.lineTo(cx, y + TILE_SIZE);
      ctx.stroke();

      for (let ly = y + 3; ly < y + TILE_SIZE; ly += 8) {
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 2.2;
        ctx.strokeRect(cx - 2.5, ly, 5, 6);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(cx - 1.5, ly + 1, 1.5, 2);
      }
    }

    // 4. Individual Weathered Hardwood Bridge Planks with Wood Grain, Gaps & Iron Bolts
    const planks = 5;
    const stepY = TILE_SIZE / planks;
    for (let i = 0; i < planks; i++) {
      const py = y + i * stepY + 1;
      const ph = stepY - 3;

      // Plank underside thickness
      ctx.fillStyle = '#1f0d04';
      ctx.fillRect(x + 5 + swayX, py + ph - 1, TILE_SIZE - 10, 3);

      // Hardwood surface with warm grain gradient
      const wGrad = ctx.createLinearGradient(x + 5, py, x + TILE_SIZE - 5, py + ph);
      wGrad.addColorStop(0, (i % 2 === 0) ? '#853f12' : '#71340e');
      wGrad.addColorStop(0.5, '#9a4a17');
      wGrad.addColorStop(1, '#542409');
      ctx.fillStyle = wGrad;
      ctx.fillRect(x + 5 + swayX, py, TILE_SIZE - 10, ph);

      // Top sunlight bevel on plank
      ctx.fillStyle = 'rgba(254, 240, 138, 0.22)';
      ctx.fillRect(x + 5 + swayX, py, TILE_SIZE - 10, 1.4);

      // Wood grain line
      ctx.strokeStyle = 'rgba(30, 12, 4, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 12 + swayX, py + ph * 0.5);
      ctx.quadraticCurveTo(x + 32 + swayX, py + ph * (i % 2 === 0 ? 0.25 : 0.75), x + TILE_SIZE - 12 + swayX, py + ph * 0.5);
      ctx.stroke();

      // Forged iron bolts clamping plank to suspension chains
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(x + 8 + swayX, py + ph * 0.35, 2.2, 2.2);
      ctx.fillRect(x + TILE_SIZE - 10.2 + swayX, py + ph * 0.35, 2.2, 2.2);
    }
  };

  drawSwingingCeilingVine = function (v, now) {
    if (!v) return;
    now = now || performance.now();
    const wind = sampleWindField(v.x, v.y, now);
    const vLen = v.h || v.length || 72;
    const vThick = v.thick || 3.5;
    const sway = Math.sin(now * 0.0025 + v.x * 0.05) * (6 + (v.sway || 2)) + wind.x * 6;

    // 1. Soft Shadow Cast on Floor Below the Hanging Vine
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(v.x + sway * 0.7 + 8, v.y + vLen * 0.85, 10, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Twisted Woody Liana Stem with Bark Shadow & Lit Sapwood Ridge
    const ctrlX = v.x + sway * 0.55;
    const ctrlY = v.y + vLen * 0.5;
    const endX = v.x + sway;
    const endY = v.y + vLen;

    ctx.strokeStyle = '#07170c';
    ctx.lineWidth = vThick + 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(v.x, v.y);
    ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
    ctx.stroke();

    ctx.strokeStyle = v.color || '#15803d';
    ctx.lineWidth = vThick;
    ctx.stroke();

    ctx.strokeStyle = '#86efac';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(v.x - 1, v.y);
    ctx.quadraticCurveTo(ctrlX - 1, ctrlY, endX - 1, endY);
    ctx.stroke();

    // 3. Alternating Tropical Leaves, Thorns & Dew Glints Along the Vine
    const steps = 6;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const inv = 1 - t;
      const px = inv * inv * v.x + 2 * inv * t * ctrlX + t * t * endX;
      const py = inv * inv * v.y + 2 * inv * t * ctrlY + t * t * endY;
      const side = (s % 2 === 0) ? 1 : -1;
      const leafAng = side * (0.55 + wind.gust * 0.12);

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(leafAng);
      ctx.fillStyle = '#14532d';
      ctx.beginPath();
      ctx.ellipse(side * 6, 1, 6.5, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.ellipse(side * 5.5, 0, 6.0, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Leaf central vein
      ctx.strokeStyle = '#bbf7d0';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(side * 10, 0);
      ctx.stroke();
      ctx.restore();
    }
  };

  drawVolumetricHangingChain = function (ch, now) {
    if (!ch) return;
    now = now || performance.now();
    const wind = sampleWindField(ch.x, ch.y, now);
    const cLen = ch.h || ch.length || 76;
    const sway = Math.sin(now * 0.002 + ch.x * 0.04) * (4.5 + (ch.sway || 1.5)) + wind.x * 4.5;
    const links = Math.max(4, Math.floor(cLen / 11));

    // Cast floor shadow beneath hanging chain
    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    ctx.beginPath();
    ctx.ellipse(ch.x + sway * 0.8 + 6, ch.y + cLen * 0.85, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < links; i++) {
      const t = i / links;
      const lx = ch.x + sway * (t * t);
      const ly = ch.y + i * 10.5;

      // Cast link shadow
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.lineWidth = 3.5;
      ctx.strokeRect(lx - 3 + 2, ly + 2, 7, 9);

      // Forged iron link body
      ctx.strokeStyle = (i % 2 === 0) ? '#475569' : '#334155';
      ctx.lineWidth = 2.8;
      ctx.strokeRect(lx - 3.5, ly, 7, 9);

      // Rust patina on weathered links
      if ((i + Math.floor(ch.x)) % 3 === 0) {
        ctx.fillStyle = '#9a3412';
        ctx.fillRect(lx + 1, ly + 4, 2.5, 2.5);
      }

      // Bright specular metallic highlight on link shoulder
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(lx - 2.5, ly + 1, 2, 2.5);
    }
  };

  drawForgeAnvil = function (x, y, now) {
    now = now || performance.now();
    // Called from render() as drawForgeAnvil(tx + 32, ty + 32, now)
    drawDirectionalCastShadow(x, y + 12, x, y + 12, 22, 11, 1.15);

    ctx.save();
    ctx.translate(x, y + 4);

    // 1. Iron-Banded Oak Timber Stump Base with Wood Grain & Forged Hoops
    const stumpGrad = ctx.createLinearGradient(-15, -4, 15, 14);
    stumpGrad.addColorStop(0, '#78350f');
    stumpGrad.addColorStop(0.5, '#451a03');
    stumpGrad.addColorStop(1, '#270e02');
    ctx.fillStyle = stumpGrad;
    ctx.fillRect(-15, -2, 30, 16);

    // Wood grain vertical cracks on oak block
    ctx.fillStyle = '#1c0a01';
    ctx.fillRect(-8, 0, 1.5, 13);
    ctx.fillRect(5, 1, 1.5, 12);

    // Forged iron hoop strap around oak stump
    ctx.fillStyle = '#334155';
    ctx.fillRect(-16, 4, 32, 3.5);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(-14, 4.5, 28, 1.2);

    // 2. Heavy Cast-Steel Anvil Foot & Waist
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(-17, -2);
    ctx.lineTo(17, -2);
    ctx.lineTo(11, -12);
    ctx.lineTo(-11, -12);
    ctx.closePath();
    ctx.fill();

    // 3. Tempered Steel Anvil Face, Conical Horn & Heel with Specular Glint
    const anvilGrad = ctx.createLinearGradient(-26, -22, 24, -12);
    anvilGrad.addColorStop(0, '#94a3b8');
    anvilGrad.addColorStop(0.45, '#64748b');
    anvilGrad.addColorStop(1, '#334155');
    ctx.fillStyle = anvilGrad;
    ctx.beginPath();
    ctx.moveTo(-27, -17); // Conical horn tip
    ctx.lineTo(-13, -22);
    ctx.lineTo(22, -22);  // Flat face & heel
    ctx.lineTo(22, -14);
    ctx.lineTo(11, -12);
    ctx.lineTo(-11, -12);
    ctx.lineTo(-27, -15);
    ctx.closePath();
    ctx.fill();

    // Polished mirror-steel top face highlight + hardy hole
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(-13, -22, 34, 2.5);
    ctx.fillStyle = '#090d14';
    ctx.fillRect(13, -21.5, 4, 2);

    // Glowing forge ember core & resting blacksmith hammer
    const pulse = 0.65 + 0.35 * Math.sin(now * 0.008);
    ctx.fillStyle = `rgba(251, 146, 60, ${pulse.toFixed(2)})`;
    ctx.fillRect(-6, -24, 12, 2.5);
    ctx.restore();

    if (state && state.player && Math.hypot(state.player.x - x, state.player.y - y) < 88) {
      const canFuseNow = typeof getAvailableForgeCombinations === 'function' && getAvailableForgeCombinations().length > 0;
      ctx.fillStyle = canFuseNow ? '#ffeb3b' : '#ffcc80';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(canFuseNow ? '⚒️ FUSE READY! [A]' : 'FORGE ANVIL [A]', x, y - 24);
    }
  };

  drawLoreObelisk = function (x, y, theme, now) {
    if (typeof theme === 'number') {
      now = theme;
      theme = null;
    }
    now = now || performance.now();
    // Called from render() as drawLoreObelisk(tx + 32, ty + 32, theme, now)
    drawDirectionalCastShadow(x - 10, y + 14, x - 10, y + 14, 16, 9, 1.35);
    drawDirectionalCastShadow(x + 13, y + 14, x + 13, y + 14, 12, 7, 1.1);

    ctx.save();
    ctx.translate(x - 10, y + 12);

    // 1. Stepped Basalt Pedestal Plinth
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-14, -2, 28, 10);
    ctx.fillStyle = '#334155';
    ctx.fillRect(-11, -7, 22, 6);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(-11, -7, 22, 1.8);

    // 2. 3D Faceted Obsidian Monolith Shaft (Left Lit Face + Right Shadow Face)
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(-9, -7);
    ctx.lineTo(-6, -42);
    ctx.lineTo(0, -52);
    ctx.lineTo(0, -7);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#090d16';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(0, -52);
    ctx.lineTo(6, -42);
    ctx.lineTo(9, -7);
    ctx.closePath();
    ctx.fill();

    // Sharp specular ridge down the center of the obelisk
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -52);
    ctx.lineTo(0, -7);
    ctx.stroke();

    // 3. Pulsing Engraved Arcane Runes
    const runeGlow = 0.6 + 0.4 * Math.sin(now * 0.006);
    ctx.fillStyle = `rgba(56, 189, 248, ${runeGlow.toFixed(2)})`;
    for (let ry = -38; ry <= -14; ry += 7) {
      ctx.fillRect(-4, ry, 2.5, 3);
      ctx.fillRect(1.5, ry + 1.5, 2.5, 3);
    }
    ctx.restore();

    // 4. Warden Chronicler (Elder Badger Lore-Keeper NPC standing beside Obelisk)
    const nx = x + 13;
    const ny = y + 3 + Math.sin(now * 0.0035) * 1.2;
    ctx.fillStyle = '#1e1b4b';
    ctx.beginPath();
    ctx.moveTo(nx - 8, ny + 12);
    ctx.lineTo(nx - 6, ny - 4);
    ctx.lineTo(nx + 6, ny - 4);
    ctx.lineTo(nx + 8, ny + 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(nx, ny - 8, 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(nx - 3, ny - 12, 1.8, 6.5);
    ctx.fillRect(nx + 1.2, ny - 12, 1.8, 6.5);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(nx - 2.2, ny - 8.5, 1.5, 1.5);
    ctx.fillRect(nx + 1.0, ny - 8.5, 1.5, 1.5);

    if (state && state.player && Math.hypot(state.player.x - x, state.player.y - y) < 88) {
      ctx.fillStyle = '#80d8ff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('WARDEN LORE [A]', x, y - 42);
    }
  };

  drawLootChest = function (x, y, opened, now) {
    if (typeof opened === 'number') {
      now = opened;
      opened = false;
    }
    now = now || performance.now();
    // Called from render() as drawLootChest(tx + 16, ty + 16, now)
    // so tile center is (x + 16, y + 16)
    const cx = x + 16;
    const cy = y + 18;
    drawDirectionalCastShadow(cx, cy + 8, cx, cy + 8, 18, 9, 1.05);

    ctx.save();
    ctx.translate(cx, cy);

    // 1. Aged Oak Chest Box with Plank Grain
    const oakGrad = ctx.createLinearGradient(-15, -10, 15, 10);
    oakGrad.addColorStop(0, '#9a4a17');
    oakGrad.addColorStop(0.5, '#78350f');
    oakGrad.addColorStop(1, '#3f1d0b');
    ctx.fillStyle = oakGrad;
    ctx.fillRect(-15, -9, 30, 17);

    // Horizontal plank seams & wood grain
    ctx.fillStyle = '#271105';
    ctx.fillRect(-15, -3, 30, 1.5);
    ctx.fillRect(-15, 3, 30, 1.5);

    // 2. Forged Iron Straps & Brass Corner Brackets with Specular Glint
    ctx.fillStyle = '#334155';
    ctx.fillRect(-15, -9, 4, 17);
    ctx.fillRect(11, -9, 4, 17);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-11.5, -9, 3, 17);
    ctx.fillRect(8.5, -9, 3, 17);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(-11, -8, 1.2, 15);
    ctx.fillRect(9, -8, 1.2, 15);

    if (!opened) {
      // 3A. Vaulted Barrel Lid (Closed) + Heavy Gold Lock Escutcheon
      const lidGrad = ctx.createLinearGradient(-16, -18, 16, -8);
      lidGrad.addColorStop(0, '#b45309');
      lidGrad.addColorStop(0.6, '#78350f');
      lidGrad.addColorStop(1, '#451a03');
      ctx.fillStyle = lidGrad;
      ctx.beginPath();
      ctx.moveTo(-16, -9);
      ctx.quadraticCurveTo(0, -19, 16, -9);
      ctx.closePath();
      ctx.fill();

      // Gold lock plate & keyhole
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(-4, -12, 8, 8);
      ctx.fillStyle = '#fef9c3';
      ctx.fillRect(-3, -11, 6, 2);
      ctx.fillStyle = '#090d14';
      ctx.fillRect(-1, -9, 2, 3.2);
    } else {
      // 3B. Thrown-Back Open Lid + Overflowing Gold Coins & Gem Glints
      ctx.fillStyle = '#271105';
      ctx.fillRect(-14, -15, 28, 6);
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.ellipse(0, -9, 12, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  // ============================================================================
  // PART 3: UPGRADED 3/4-VIEW 16-BIT CHARACTER, COMPANION, ENEMY & BOSS DESIGNS
  //         (Preserving original 3/4-view silhouettes & anatomy with enhanced
  //          textures, bevels, specular reflections, shadows & physical motion)
  // ============================================================================

  // -------------------------------------------------------------
  // C1. UPGRADED 3/4-VIEW EQUIPPED WEAPON RENDERER
  //     (Vertical blade orientation in hand, blood fullers, wire-wrapped hilt,
  //      riveted crossguards & animated specular sweep)
  // -------------------------------------------------------------
  drawEquippedWeapon = function (wep, now) {
    if (typeof now !== 'number') now = performance.now();
    if (!wep) {
      // Unarmed clawed badger paw
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-2.5, -0.5, 5, 4);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(-2, 0, 1.2, 3);
      ctx.fillRect(-0.4, 0, 1.2, 3.4);
      ctx.fillRect(1.2, 0, 1.2, 3);
      return;
    }

    const isLeg = !!(wep.isLegendary || wep.isGodly || wep.ascended || (wep.tier && wep.tier >= 5));
    const glintY = -6 - ((now * 0.04) % 18);

    // Legendary / Ascended Weapon Glow & Warping Energy Halo
    if (isLeg) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = hexToRgba(wep.glowColor || '#39ff14', 0.36);
      ctx.beginPath();
      ctx.ellipse(0, -16, 9 + Math.sin(now * 0.015) * 3, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Wire-wrapped leather handle grip & faceted pommel below crossguard
    ctx.fillStyle = '#070a0e';
    ctx.fillRect(-2.5, -1, 5, 7.5);
    ctx.fillStyle = '#451a03';
    ctx.fillRect(-1.8, 0, 3.6, 5.5);
    ctx.fillStyle = '#d97706';
    ctx.fillRect(-1.8, 1.2, 3.6, 1);
    ctx.fillRect(-1.8, 3.2, 3.6, 1);
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(0, 6.2, 2.6, 0, Math.PI * 2);
    ctx.fill();

    if (wep.type === 'axe') {
      // Iron-shod ash wood haft
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-3, -26, 6, 27);
      ctx.fillStyle = '#5c2d16';
      ctx.fillRect(-2, -25, 4, 25);
      ctx.fillStyle = '#854d0e';
      ctx.fillRect(-1, -24, 1.5, 23);

      // Crescent bearded battleaxe blade with multi-bevel steel & razor glint
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.arc(6, -18, 11.8, -Math.PI / 2, Math.PI / 2);
      ctx.fill();

      const axeCol = isLeg ? (wep.glowColor || '#ff6d00') : (wep.color || '#64748b');
      ctx.fillStyle = axeCol;
      ctx.beginPath();
      ctx.arc(6, -18, 10.2, -Math.PI / 2, Math.PI / 2);
      ctx.fill();

      // Inner dark fuller bevel
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.arc(5, -18, 6.2, -Math.PI / 2, Math.PI / 2);
      ctx.fill();

      // Honed cutting edge & specular glint
      ctx.strokeStyle = isLeg ? '#fef08a' : '#f8fafc';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(6, -18, 10.0, -Math.PI * 0.45, Math.PI * 0.45);
      ctx.stroke();

      // Brass haft collar rivets
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(-2.5, -21, 5, 2);
      ctx.fillRect(-2.5, -15, 5, 2);

    } else if (wep.type === 'spear') {
      // Long ash-wood partisan shaft with leather grip bindings
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-2.5, -43, 5, 44);
      ctx.fillStyle = '#5c2d16';
      ctx.fillRect(-1.5, -42, 3, 42);
      ctx.fillStyle = '#854d0e';
      ctx.fillRect(-0.8, -41, 1.2, 40);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(-3.5, -41, 7, 2.5);

      // Diamond-faceted steel spearhead
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.moveTo(-5.5, -41);
      ctx.lineTo(0, -58);
      ctx.lineTo(5.5, -41);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = isLeg ? (wep.glowColor || '#39ff14') : '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(-4.2, -42);
      ctx.lineTo(0, -56);
      ctx.lineTo(0, -42);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -42);
      ctx.lineTo(0, -56);
      ctx.lineTo(4.2, -42);
      ctx.closePath();
      ctx.fill();

    } else if (wep.type === 'bow') {
      // Composite recurve bow with horn tips & taut bowstring
      ctx.strokeStyle = '#070a0e';
      ctx.lineWidth = 5.2;
      ctx.beginPath();
      ctx.arc(0, 0, 16, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.strokeStyle = '#854d0e';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(0, 0, 16, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, 16, -0.35, 0.35);
      ctx.stroke();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.lineTo(0, 16);
      ctx.stroke();

    } else {
      // Forged Broadsword / Relic Blade (preserving classic vertical orientation)
      const isRusty = (wep.id === 'wep_rusty_sword');
      // Dark outline + pointed tip
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.moveTo(-3.4, -2);
      ctx.lineTo(-3.4, -25);
      ctx.lineTo(0, -30);
      ctx.lineTo(3.4, -25);
      ctx.lineTo(3.4, -2);
      ctx.closePath();
      ctx.fill();

      // Left shaded blade bevel
      ctx.fillStyle = isRusty ? '#78350f' : (isLeg ? (wep.glowColor || '#e879f9') : (wep.color || '#64748b'));
      ctx.beginPath();
      ctx.moveTo(-2.4, -2);
      ctx.lineTo(-2.4, -24.5);
      ctx.lineTo(0, -28.5);
      ctx.lineTo(0, -2);
      ctx.closePath();
      ctx.fill();

      // Right sunlit blade bevel
      ctx.fillStyle = isRusty ? '#b45309' : (isLeg ? '#ffffff' : '#e2e8f0');
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.lineTo(0, -28.5);
      ctx.lineTo(2.4, -24.5);
      ctx.lineTo(2.4, -2);
      ctx.closePath();
      ctx.fill();

      // Central blood-fuller groove
      ctx.fillStyle = isRusty ? '#451a03' : (isLeg ? (wep.glowColor || '#38bdf8') : '#1e293b');
      ctx.fillRect(-0.7, -22, 1.4, 18);

      // Moving metallic specular glint along blade
      if (!isRusty) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-2.0, glintY, 4.0, 2.2);
      }

      // Ornate Crossguard Quillons & Center Gem
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-7.5, -3.5, 15, 5);
      ctx.fillStyle = isRusty ? '#451a03' : '#d97706';
      ctx.fillRect(-6.5, -2.5, 13, 3);
      ctx.fillStyle = isRusty ? '#92400e' : '#fef08a';
      ctx.fillRect(-4.5, -2.5, 9, 1.3);
      ctx.fillStyle = isLeg ? (wep.glowColor || '#38bdf8') : '#ef4444';
      ctx.fillRect(-1.2, -2.2, 2.4, 2.4);
    }
  };

  // -------------------------------------------------------------
  // C2. UPGRADED 3/4-VIEW BADGER WARRIOR RENDERER
  //     (Preserves classic 3/4 Badger Hero look + adds billowing mantle,
  //      clawed greaves, beveled armor cuirass, cheek ruff fur, snarling fangs,
  //      and all Status Effect Overlays: Vines, Spider Web, Poison, Disorient)
  // -------------------------------------------------------------
  drawPlayerHero = function (p, now) {
    if (!p) return;
    now = now || performance.now();

    // Directional Ground Cast Shadow
    drawDirectionalCastShadow(p.x, p.y, p.x, p.y + 15, 16, 8, 1.15);

    ctx.save();
    ctx.translate(p.x, p.y - (p.z || 0));

    // Deep multi-layer contact & occlusion shadow for strong floor separation
    drawSoftContactShadow(0, 16, 22, 11);
    ctx.fillStyle = 'rgba(2, 4, 7, 0.55)';
    ctx.beginPath();
    ctx.ellipse(0, 16, 13, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    if (p.hitStun > 0) {
      ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4);
    }

    const isMoving = (p.walkAnim > 0);
    const walkCycle = Math.sin(p.walkAnim);
    const bounce = isMoving ? Math.abs(walkCycle) * 3 : Math.sin(now * 0.003) * 1;
    const tilt = isMoving && (p.facing === 'left' || p.facing === 'right') ? walkCycle * 0.08 : 0;
    const isBlinking = (now % 3500) < 130;
    const wind = sampleWindField(p.x, p.y, now);

    ctx.save();
    ctx.translate(0, -bounce + (p.inLiquid ? 5 : 0));

    if (p.dodgeTimer > 0 && p.dodgeDuration > 0) {
      const rollSpin = (1 - (p.dodgeTimer / p.dodgeDuration)) * Math.PI * 2;
      ctx.rotate(rollSpin);
    } else {
      ctx.rotate(tilt);
    }

    if (p.facing === 'left') {
      ctx.scale(-1, 1);
    }

    // 1. Billowing Tattered Warrior Cape / Mantle & Banded Badger Tail behind body
    const capeWave = Math.sin(now * 0.009 + p.walkAnim * 0.8) * 3.5 + wind.x * 1.8;
    ctx.fillStyle = '#05080b';
    ctx.beginPath();
    ctx.moveTo(-11, -9);
    ctx.quadraticCurveTo(-19 + capeWave * 0.5, 2, -16 + capeWave, 14);
    ctx.lineTo(8 + capeWave * 0.3, 13);
    ctx.lineTo(10, -8);
    ctx.closePath();
    ctx.fill();

    const capeGrad = ctx.createLinearGradient(-4, -9, -14 + capeWave, 13);
    capeGrad.addColorStop(0, '#7f1d1d');
    capeGrad.addColorStop(0.65, '#450a0a');
    capeGrad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = capeGrad;
    ctx.beginPath();
    ctx.moveTo(-10, -8);
    ctx.quadraticCurveTo(-17 + capeWave * 0.5, 2, -14.5 + capeWave, 12.5);
    ctx.lineTo(7 + capeWave * 0.3, 11.5);
    ctx.lineTo(9, -7);
    ctx.closePath();
    ctx.fill();
    // Gold cape hem brocade
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-14 + capeWave, 12);
    ctx.lineTo(6.5 + capeWave * 0.3, 11);
    ctx.stroke();

    // Dark silhouette rim behind character for depth separation against dungeon floors
    ctx.fillStyle = '#05080b';
    ctx.beginPath();
    ctx.ellipse(0, -3, 18, 19, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Articulated Legs with Iron Greaves, Knee Cops & 3 Ivory Digging Claws
    if (!p.inLiquid) {
      const legOffset = isMoving ? walkCycle * 7 : 0;
      ctx.fillStyle = '#090c10';
      ctx.fillRect(-11, 5 + legOffset, 9, 14);
      ctx.fillRect(2, 5 - legOffset, 9, 14);
      ctx.fillStyle = '#241b15';
      ctx.fillRect(-10, 6 + legOffset, 7, 12);
      ctx.fillRect(3, 6 - legOffset, 7, 12);
      // Beveled Steel Greave plates + gold knee-cop trim + specular highlight
      ctx.fillStyle = '#475569';
      ctx.fillRect(-11, 12 + legOffset, 9, 6);
      ctx.fillRect(2, 12 - legOffset, 9, 6);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(-11, 11.5 + legOffset, 9, 1.5);
      ctx.fillRect(2, 11.5 - legOffset, 9, 1.5);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(-10, 13.5 + legOffset, 7, 2);
      ctx.fillRect(3, 13.5 - legOffset, 7, 2);
      // 3 Ivory badger claws per foot
      ctx.fillStyle = '#f8fafc';
      for (let c = 0; c < 3; c++) {
        ctx.fillRect(-10 + c * 2.5, 17.5 + legOffset, 1.5, 2);
        ctx.fillRect(3 + c * 2.5, 17.5 - legOffset, 1.5, 2);
      }
    }

    // 3. Badger Torso Fur Base with Grizzled Flank Guard-Hair Tufts
    ctx.fillStyle = '#070a0e';
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2e2219';
    ctx.beginPath();
    ctx.ellipse(0, 0, 15.5, 13.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Grizzled silver-brown flank fur tufts
    ctx.fillStyle = '#64748b';
    ctx.fillRect(-16, -4, 2.5, 2);
    ctx.fillRect(-16.5, 0, 2.5, 2);
    ctx.fillRect(14, -4, 2.5, 2);
    ctx.fillRect(14, 0, 2.5, 2);

    // 4. Dynamic Armor Rendering (Unarmored Badger Tunic vs Equipped Armor vs Legendary Armor Aura)
    if (p.armor) {
      if (p.armor.isLegendary) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const armAura = ctx.createRadialGradient(0, -1, 4, 0, -1, 26);
        armAura.addColorStop(0, hexToRgba(p.armor.glowColor || '#fbbf24', 0.34));
        armAura.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = armAura;
        ctx.beginPath();
        ctx.arc(0, -1, 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      const armCol = p.armor.armorColor || p.armor.primaryColor || p.armor.color || '#334155';
      const trimCol = p.armor.trimColor || '#94a3b8';
      ctx.fillStyle = '#090d14';
      ctx.fillRect(-12.5, -9, 25, 16);
      // 3D Beveled Chestplate Cuirass
      const chestGrad = ctx.createLinearGradient(-11.5, -8, 11.5, 6);
      chestGrad.addColorStop(0, '#e2e8f0');
      chestGrad.addColorStop(0.3, armCol);
      chestGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = chestGrad;
      ctx.fillRect(-11.5, -8, 23, 14);
      // Trim, center plastron ridge & corner rivets
      ctx.fillStyle = trimCol;
      ctx.fillRect(-11, -8, 22, 2.5);
      ctx.fillRect(-1.5, -7, 3, 11);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-9.5, -4, 2, 2);
      ctx.fillRect(7.5, -4, 2, 2);
      ctx.fillRect(-9.5, 1, 2, 2);
      ctx.fillRect(7.5, 1, 2, 2);

      // Animated metallic specular glint across chestplate
      const sweepX = ((now * 0.028) % 30) - 15;
      if (sweepX > -10 && sweepX < 9) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.26)';
        ctx.fillRect(sweepX, -7.5, 3, 11);
      }
    } else {
      // Bare prisoner badger chest fur with rugged cross-chest leather bandolier strap & iron buckle
      ctx.fillStyle = '#3d2d22';
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1c120c';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(-9, -8);
      ctx.lineTo(9, 6);
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-2, -2, 3.5, 3.5);
    }

    // Studded Leather War-Belt & Brass Buckle
    ctx.fillStyle = '#27170e';
    ctx.fillRect(-11.5, 3, 23, 3.5);
    ctx.fillStyle = '#d97706';
    ctx.fillRect(-3, 2.5, 6, 4.5);
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(-1.5, 3.5, 3, 2.5);

    let armAngle = isMoving ? -walkCycle * 0.6 : 0;
    let weaponAngle = 0;

    if (p.isAttacking > 0) {
      const prog = 1.0 - (p.isAttacking / 0.22);
      armAngle = -1.2 + prog * 2.4;
      weaponAngle = armAngle;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const isLegWep = p.weapon && p.weapon.isLegendary;
      ctx.strokeStyle = isLegWep ? (p.weapon.glowColor || '#39ff14') : 'rgba(254, 240, 138, 0.85)';
      ctx.lineWidth = isLegWep ? 9 : 6;
      ctx.beginPath();
      ctx.arc(0, 0, isLegWep ? 44 : 36, armAngle - 0.9, armAngle + 0.25);
      ctx.stroke();

      if (isLegWep) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 38, armAngle - 0.85, armAngle + 0.2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 5. Off-Hand Arm + Layered Shoulder Pauldron + 3D Contoured Shield
    ctx.save();
    ctx.translate(-12, -2);
    ctx.rotate(-armAngle * 0.8);
    ctx.fillStyle = '#090d14';
    ctx.beginPath();
    ctx.arc(-1, -1, 6.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.armor ? (p.armor.armorColor || p.armor.primaryColor || '#64748b') : '#2e2219';
    ctx.beginPath();
    ctx.arc(-1, -1, 5.2, 0, Math.PI * 2);
    ctx.fill();
    if (p.armor) {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(-3.5, -4, 3, 1.8);
    }

    if (p.shield) {
      if (p.shield.isLegendary) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.strokeStyle = p.shield.glowColor || '#ff6d00';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(-5, 8, 12 + Math.sin(now * 0.01) * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      // 3D Heater Shield with dark border, metallic bevel, rim rivets & central boss
      ctx.fillStyle = '#090d14';
      ctx.beginPath();
      ctx.moveTo(-12.5, -0.5);
      ctx.lineTo(2.5, -0.5);
      ctx.lineTo(-1, 16.5);
      ctx.lineTo(-12.5, 12.5);
      ctx.closePath();
      ctx.fill();

      const shCol = p.shield.shieldColor || p.shield.primaryColor || p.shield.color || '#334155';
      const shGrad = ctx.createLinearGradient(-11, 1, 1, 15);
      shGrad.addColorStop(0, '#f8fafc');
      shGrad.addColorStop(0.35, shCol);
      shGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = shGrad;
      ctx.beginPath();
      ctx.moveTo(-10.5, 1.5);
      ctx.lineTo(0.5, 1.5);
      ctx.lineTo(-2, 14.5);
      ctx.lineTo(-10.5, 10.5);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = p.shield.rimColor || p.shield.trimColor || '#94a3b8';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // Raised central shield boss
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(-6.5, 5.5, 3, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-6, 6, 1.4, 1.4);
    } else {
      ctx.fillStyle = '#241b15';
      ctx.fillRect(-4, 2, 5, 8);
    }
    ctx.restore();

    // 6. Main Weapon Arm + Shoulder Pauldron + Vambrace Gauntlet + Weapon
    ctx.save();
    ctx.translate(12, -2);
    ctx.rotate(armAngle);
    ctx.fillStyle = '#090d14';
    ctx.beginPath();
    ctx.arc(1, -1, 6.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.armor ? (p.armor.armorColor || p.armor.primaryColor || '#64748b') : '#2e2219';
    ctx.beginPath();
    ctx.arc(1, -1, 5.2, 0, Math.PI * 2);
    ctx.fill();
    if (p.armor) {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(-0.5, -4, 3, 1.8);
    }
    ctx.fillStyle = '#241b15';
    ctx.fillRect(-2, 1, 6, 9);
    // Steel wrist vambrace
    ctx.fillStyle = '#475569';
    ctx.fillRect(-2.2, 4, 6.4, 4);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(-1.5, 4.5, 5, 1.5);

    ctx.save();
    ctx.translate(2, 8);
    ctx.rotate(weaponAngle);
    drawEquippedWeapon(p.weapon, now);
    ctx.restore();
    ctx.restore();

    // Orbiting Star-Sparkles if any Legendary Gear is equipped
    if ((p.weapon && p.weapon.isLegendary) || (p.shield && p.shield.isLegendary) || (p.armor && p.armor.isLegendary)) {
      const legCol = (p.weapon && p.weapon.glowColor) || (p.shield && p.shield.glowColor) || (p.armor && p.armor.glowColor) || '#fbbf24';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let sp = 0; sp < 3; sp++) {
        const sAng = (now * 0.0045) + sp * ((Math.PI * 2) / 3);
        const sx = Math.cos(sAng) * 22;
        const sy = Math.sin(sAng) * 14 - 4;
        ctx.fillStyle = legCol;
        ctx.fillRect(sx - 2.5, sy - 0.8, 5, 1.6);
        ctx.fillRect(sx - 0.8, sy - 2.5, 1.6, 5);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sx - 1, sy - 1, 2, 2);
      }
      ctx.restore();
    }

    // 7. Badger Head with Drop Shadow onto Chestplate, Cheek Ruff Tufts, Classic White Blaze & Snarling Fangs
    ctx.save();
    ctx.translate(0, -14);

    // Head cast shadow onto chestplate
    ctx.fillStyle = 'rgba(4, 7, 11, 0.55)';
    ctx.beginPath();
    ctx.ellipse(0, 10, 11, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Flared cheek-ruff fur spikes on left & right of skull
    ctx.fillStyle = '#070a0e';
    ctx.beginPath();
    ctx.moveTo(-12, -2); ctx.lineTo(-16, 1); ctx.lineTo(-12, 4);
    ctx.moveTo(12, -2);  ctx.lineTo(16, 1);  ctx.lineTo(12, 4);
    ctx.fill();
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(-11, -1); ctx.lineTo(-14.5, 1); ctx.lineTo(-11, 3);
    ctx.moveTo(11, -1);  ctx.lineTo(14.5, 1);  ctx.lineTo(11, 3);
    ctx.fill();

    // Outer head silhouette rim
    ctx.fillStyle = '#070a0e';
    ctx.beginPath();
    ctx.arc(0, 0, 13.5, 0, Math.PI * 2);
    ctx.fill();

    if (p.facing === 'up') {
      ctx.fillStyle = '#1f1813';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f0b08';
      ctx.fillRect(-12, -12, 6, 6);
      ctx.fillRect(6, -12, 6, 6);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(-4.5, -7, 9, 13);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-2.5, -6, 5, 11);
    } else {
      ctx.fillStyle = '#1f1813';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();

      // Textured white badger blaze stripe with shaded edges
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(-4.5, -12, 9, 18);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-3, -12, 6, 17);

      // Dark cheek/eye masks
      ctx.fillStyle = '#090d14';
      ctx.fillRect(-10.5, -5.5, 6.5, 6.5);
      ctx.fillRect(4, -5.5, 6.5, 6.5);

      if (!isBlinking) {
        ctx.fillStyle = (p.isAttacking > 0) ? '#fde047' : '#ffffff';
        ctx.fillRect(-8, -4, 3, 3);
        ctx.fillRect(5, -4, 3, 3);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(-7, -3, 1.5, 1.5);
        ctx.fillRect(6, -3, 1.5, 1.5);
      } else {
        ctx.strokeStyle = '#090d14';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-9, -3); ctx.lineTo(-5, -3);
        ctx.moveTo(4, -3); ctx.lineTo(8, -3);
        ctx.stroke();
      }

      // Snout, wet dark nose button & bared ivory canine fangs
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(-5.5, 2, 11, 6.5);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-4, 2, 8, 5);
      ctx.fillStyle = '#090d14';
      ctx.fillRect(-3, 4, 6, 4);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(-1.5, 4.5, 2.5, 1.5);
      // Ivory fangs
      ctx.fillStyle = '#ffffff';
      const fangH = (p.isAttacking > 0) ? 3.2 : 1.8;
      ctx.fillRect(-4.5, 7.5, 1.8, fangH);
      ctx.fillRect(2.7, 7.5, 1.8, fangH);

      // Rounded badger ears with dark rim and white tips
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-13.5, -11.5, 6, 6);
      ctx.fillRect(7.5, -11.5, 6, 6);
      ctx.fillStyle = '#1f1813';
      ctx.fillRect(-13, -11, 5, 5);
      ctx.fillRect(8, -11, 5, 5);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-12, -10, 3, 3);
      ctx.fillRect(9, -10, 3, 3);
    }
    ctx.restore();

    ctx.restore();
    ctx.restore();

    // 8. STATUS EFFECT OVERLAYS (Thorny Entangler Vines, Spider Web, Poison Bubbles, Eagle Dizziness)
    if (p.status) {
      const st = p.status;
      if (st.poisonTimer > 0 || st.disorientTimer > 0 || st.webTimer > 0 || (st.vineTimer || 0) > 0) {
        const wadeSink = p.inLiquid ? 5 : 0;
        ctx.save();
        ctx.translate(p.x, p.y - bounce - (p.z || 0) + wadeSink);

        // Thorny Entangler Vines wrapped tightly around Badger's legs & waist!
        if ((st.vineTimer || 0) > 0) {
          ctx.save();
          ctx.strokeStyle = '#14532d';
          ctx.lineWidth = 4.5;
          for (let vy = -2; vy <= 12; vy += 5) {
            ctx.beginPath();
            ctx.moveTo(-16, vy);
            ctx.quadraticCurveTo(0, vy + 5, 16, vy - 1);
            ctx.stroke();
          }
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 2.6;
          for (let vy = -2; vy <= 12; vy += 5) {
            ctx.beginPath();
            ctx.moveTo(-15, vy);
            ctx.quadraticCurveTo(0, vy + 5, 15, vy - 1);
            ctx.stroke();
          }
          ctx.fillStyle = '#f43f5e';
          ctx.fillRect(-10, 2, 3, 3);
          ctx.fillRect(7, 4, 3, 3);
          ctx.fillRect(-2, 8, 3, 3);
          ctx.restore();
        }

        // Spider Web Spray wrapped around body
        if (st.webTimer > 0) {
          ctx.save();
          ctx.strokeStyle = 'rgba(241, 245, 249, 0.92)';
          ctx.lineWidth = 1.8;
          for (let wy = -12; wy <= 8; wy += 6) {
            ctx.beginPath();
            ctx.moveTo(-15, wy);
            ctx.quadraticCurveTo(0, wy + 4, 15, wy - 1);
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.moveTo(-14, -12); ctx.lineTo(14, 8);
          ctx.moveTo(14, -12);  ctx.lineTo(-14, 8);
          ctx.moveTo(0, -16);   ctx.lineTo(0, 11);
          ctx.stroke();
          ctx.restore();
        }

        // Snake Poison Bubbles floating above head
        if (st.poisonTimer > 0) {
          ctx.save();
          for (let b = 0; b < 5; b++) {
            const cycle = ((now * 0.0028 + b * 0.22) % 1.0);
            const bx = Math.sin(now * 0.005 + b * 1.7) * 13;
            const by = -28 - cycle * 24;
            const rad = (2.8 + (b % 2) * 1.4) * (1 - cycle * 0.35);
            ctx.fillStyle = 'rgba(217, 70, 239, 0.45)';
            ctx.beginPath();
            ctx.arc(bx, by, rad + 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#d946ef';
            ctx.beginPath();
            ctx.arc(bx, by, rad, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // Eagle Sonic Boom Disorientation Swirls
        if (st.disorientTimer > 0) {
          ctx.save();
          const headY = -30;
          const baseSpin = now * 0.0085;
          for (let ring = 0; ring < 2; ring++) {
            const aStart = baseSpin + ring * Math.PI;
            ctx.strokeStyle = ring === 0 ? '#38bdf8' : '#fde047';
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            for (let step = 0; step <= 14; step++) {
              const t = step / 14;
              const ang = aStart + t * Math.PI * 1.35;
              const sx = Math.cos(ang) * (16 - ring * 3);
              const sy = headY + Math.sin(ang) * 5.5 - ring * 3;
              if (step === 0) ctx.moveTo(sx, sy);
              else ctx.lineTo(sx, sy);
            }
            ctx.stroke();
          }
          ctx.restore();
        }

        ctx.restore();
      }
    }
  };

  // -------------------------------------------------------------
  // C3. TETHER CHAIN & UPGRADED 3/4-VIEW QUILL BEAST COMPANION
  //     (Preserves the classic side-profile pangolin/echidna Quill Beast with
  //      6 flame-tipped dorsal spines, charcoal-slate osteoderm carapace,
  //      golden dappled spots, 4 clawed legs, pointed snout & blinking lime-gold eye)
  // -------------------------------------------------------------
  drawTetherChain = function (a, b, c, d) {
    const now = performance.now();
    let x1, y1, x2, y2;
    let qState = 'follow';
    let tetherRadius = 165;
    if (typeof a === 'number') {
      x1 = a; y1 = b; x2 = c; y2 = d;
      if (state && state.minion) {
        qState = state.minion.mode || state.minion.state || 'follow';
      }
    } else if (a && b) {
      x1 = a.x; y1 = a.y; x2 = b.x; y2 = b.y;
      qState = b.mode || b.state || 'follow';
      tetherRadius = b.tetherRadius || 165;
    } else {
      return;
    }

    const links = 15;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    const tautness = Math.min(1, dist / tetherRadius);
    const sagAmp = (1 - tautness * 0.88) * 14;

    // 1. Directional Cast Shadow of the Heavy Iron Tether Chain on the Floor
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    for (let i = 0; i <= links; i++) {
      const t = i / links;
      const sag = Math.sin(t * Math.PI) * sagAmp;
      const lx = x1 + dx * t + 3;
      const ly = y1 + dy * t + sag + 11;
      if (i === 0) ctx.moveTo(lx, ly);
      else ctx.lineTo(lx, ly);
    }
    ctx.stroke();

    // 2. Individual 3D Interlocking Forged-Iron Chain Links with Specular Glints
    const linkAng = Math.atan2(dy, dx);
    for (let i = 1; i < links; i++) {
      const t = i / links;
      const sag = Math.sin(t * Math.PI) * sagAmp;
      const wave = (qState === 'whirlwind' || qState === 'returning' || qState === 'spin')
        ? Math.sin(now * 0.035 + i * 0.9) * 3.8
        : 0;
      const lx = x1 + dx * t;
      const ly = y1 + dy * t + sag + wave;

      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(linkAng + (i % 2 === 0 ? 0.22 : -0.22));
      ctx.strokeStyle = (qState === 'whirlwind' || qState === 'spin') ? '#38bdf8' : (tautness > 0.85 ? '#f59e0b' : '#64748b');
      ctx.lineWidth = 2.6;
      ctx.strokeRect(-4.2, -2.4, 8.4, 4.8);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-3.2, -1.8, 3.0, 1.2);
      ctx.restore();
    }
  };

  drawQuillCompanion = function (m, now) {
    if (!m) return;
    now = now || performance.now();

    drawDirectionalCastShadow(m.x, m.y, m.x, m.y + 11, 16, 8, 1.15);

    ctx.save();
    ctx.translate(m.x, m.y - (m.z || 0));

    // Deep floor contact shadow + ambient occlusion core
    drawSoftContactShadow(0, 11, 20, 9);
    ctx.fillStyle = 'rgba(2, 4, 7, 0.58)';
    ctx.beginPath();
    ctx.ellipse(0, 11, 14, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();

    const qMode = m.mode || m.state || 'follow';
    const isSpinning = (qMode === 'spin' || qMode === 'whirlwind' || (m.spinTimer && m.spinTimer > 0));
    if (isSpinning) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(0, 0, 23 + Math.sin(now * 0.04) * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const trot = Math.sin(now * 0.02) * 3.5;
    const breathe = Math.sin(now * 0.005) * 1.3;
    const isBlinking = (now % 3200) < 120;
    const faceLeft = (state.player && state.player.x < m.x - 4);

    if (faceLeft) {
      ctx.scale(-1, 1);
    }

    // 1. Tapering segmented armored tail at rear (-15 to -24) with osteoderm ridges
    ctx.fillStyle = '#070a0e';
    ctx.beginPath();
    ctx.moveTo(-11, 1);
    ctx.lineTo(-24, 3 + trot * 0.25);
    ctx.lineTo(-23, 7.5 + trot * 0.25);
    ctx.lineTo(-10, 7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#334155';
    ctx.fillRect(-20, 3 + trot * 0.2, 9, 3.2);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(-22, 3.4 + trot * 0.2, 6, 1.6);

    // 2. Back-side legs with golden-tan pixel claws
    ctx.fillStyle = '#070a0e';
    ctx.fillRect(-11, 6 - trot * 0.7, 6, 7);
    ctx.fillRect(3, 6 + trot * 0.7, 6, 7);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-10, 7 - trot * 0.7, 4, 5);
    ctx.fillRect(4, 7 + trot * 0.7, 4, 5);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-9, 10.5 - trot * 0.7, 4, 2);
    ctx.fillRect(5, 10.5 + trot * 0.7, 4, 2);

    // 3. 6 Flame-Tipped Dorsal Spines/Quills (dark outline -> crimson-rust base -> fiery orange mid -> golden-ivory tip)
    const quillFlare = isSpinning ? 3.5 : 0;
    const quillSpecs = [
      { bx: -11, by: -6,  tx: -15 - quillFlare * 0.5, ty: -15 - quillFlare, w: 3.3 },
      { bx: -7,  by: -9,  tx: -9  - quillFlare * 0.3, ty: -21 - quillFlare, w: 3.9 },
      { bx: -2,  by: -10, tx: -3,                     ty: -24 - quillFlare, w: 4.3 },
      { bx: 3,   by: -9,  tx: 3,                      ty: -21 - quillFlare, w: 3.9 },
      { bx: 7,   by: -7,  tx: 8   + quillFlare * 0.3, ty: -17 - quillFlare, w: 3.4 },
      { bx: 10,  by: -4,  tx: 12  + quillFlare * 0.5, ty: -12 - quillFlare, w: 2.9 },
    ];
    for (let q = 0; q < quillSpecs.length; q++) {
      const qs = quillSpecs[q];
      const qy = qs.by - breathe * 0.7;
      const ty = qs.ty - breathe * 1.1;

      // Dark pixel-ink outline
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.moveTo(qs.bx - qs.w - 1, qy + 1);
      ctx.lineTo(qs.tx, ty - 1.5);
      ctx.lineTo(qs.bx + qs.w + 1, qy + 1);
      ctx.closePath();
      ctx.fill();

      // Deep rust-orange quill base
      ctx.fillStyle = '#9a3412';
      ctx.beginPath();
      ctx.moveTo(qs.bx - qs.w, qy + 1);
      ctx.lineTo(qs.tx, ty);
      ctx.lineTo(qs.bx + qs.w, qy + 1);
      ctx.closePath();
      ctx.fill();

      // Fiery orange mid-spine
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(qs.bx - qs.w * 0.65, qy);
      ctx.lineTo(qs.tx, ty);
      ctx.lineTo(qs.bx + qs.w * 0.65, qy);
      ctx.closePath();
      ctx.fill();

      // Glowing golden-yellow needle tip
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(qs.tx - 1.2, ty, 2.4, 3.8);
    }

    // 4. Armored Pangolin/Echidna Carapace Body (dark outline -> charcoal slate -> dorsal highlight -> golden dappled spots)
    ctx.fillStyle = '#070a0e';
    ctx.beginPath();
    ctx.ellipse(0, 0, 16.5, 11.5 + breathe * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#27303f';
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 10 + breathe * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Lighter slate dorsal armor band + osteoderm scale seams
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.ellipse(-1, -3, 12.5, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(-9, -7 - breathe * 0.4, 14, 2.2);

    // Warm dark-slate underside & golden-amber dappled spots across flank
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-11, 2, 20, 6);
    const spots = [
      { sx: -9, sy: -3, sw: 3,   sh: 2.5, col: '#f59e0b' },
      { sx: -4, sy: -5, sw: 3.5, sh: 2.5, col: '#fde047' },
      { sx: 1,  sy: -3, sw: 3.5, sh: 2.5, col: '#f59e0b' },
      { sx: -6, sy: 0,  sw: 3,   sh: 2,   col: '#fbbf24' },
      { sx: -1, sy: 1,  sw: 3,   sh: 2,   col: '#fde047' },
      { sx: 4,  sy: -1, sw: 2.5, sh: 2,   col: '#f59e0b' },
    ];
    for (let s = 0; s < spots.length; s++) {
      const sp = spots[s];
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(sp.sx - 0.5, sp.sy - 0.5, sp.sw + 1, sp.sh + 1);
      ctx.fillStyle = sp.col;
      ctx.fillRect(sp.sx, sp.sy, sp.sw, sp.sh);
    }

    // 5. Front-side legs with 3 golden-cream claws
    ctx.fillStyle = '#070a0e';
    ctx.fillRect(-8, 6 + trot, 6.5, 7.5);
    ctx.fillRect(4, 6 - trot, 6.5, 7.5);
    ctx.fillStyle = '#334155';
    ctx.fillRect(-7, 7 + trot, 4.5, 5.5);
    ctx.fillRect(5, 7 - trot, 4.5, 5.5);
    ctx.fillStyle = '#fde047';
    ctx.fillRect(-6.5, 11 + trot, 4.5, 2);
    ctx.fillRect(5.5, 11 - trot, 4.5, 2);

    // 6. Pointed Golden-Cream Reptilian/Echidna Head, Fang & Fierce Lime-Gold Eye
    ctx.fillStyle = '#070a0e';
    ctx.beginPath();
    ctx.moveTo(6, -7);
    ctx.lineTo(19, -1);
    ctx.lineTo(18, 5);
    ctx.lineTo(6, 6);
    ctx.closePath();
    ctx.fill();

    // Slate cranial brow plate
    ctx.fillStyle = '#475569';
    ctx.fillRect(6, -6, 8, 4);
    // Golden-cream pointed snout & lower jaw
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(7, -3, 10, 7);
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(8, 0, 9.5, 3.5);
    // Dark mouth line & sharp white fang
    ctx.fillStyle = '#070a0e';
    ctx.fillRect(11, 2.5, 6.5, 1.2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(14, 1.5, 1.6, 2.2);

    // Expressive angled eye socket + glowing lime-gold iris + white pixel glint
    if (!isBlinking) {
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(9.5, -4, 4.5, 4);
      ctx.fillStyle = '#bef264';
      ctx.fillRect(10.5, -3, 3, 2.5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(11.5, -3, 1.5, 1.5);
    } else {
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(9.5, -2.5, 4.5, 1.5);
    }

    // Forged iron tether collar & chain ring at throat
    ctx.fillStyle = '#070a0e';
    ctx.fillRect(5, -5, 4, 10);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(5.5, -4, 2.8, 8);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(6, -3, 1.8, 2.5);

    ctx.restore();
  };

  // -------------------------------------------------------------
  // C4. UPGRADED 3/4-VIEW 16-BIT ENEMY WEAPONRY & 6 ENEMY CLAN RENDERERS
  //     (Preserves the 6 distinct 3/4-view clan warriors: Snake, Wolf, Eagle,
  //      Spider, Boar, Reptile, plus their weapons, shields, sub-boss crowns,
  //      henchman banners, ceiling drop-in threads & overhead HP bars, enhanced
  //      with directional cast shadows, metallic reflections & physical motion)
  // -------------------------------------------------------------
  drawEnemyWeapon = function (wepType, swingAngle, accentCol) {
    // Support both (wepType, swingAngle, accentCol) and (enemyObj, isLunging)
    if (wepType && typeof wepType === 'object') {
      const eObj = wepType;
      wepType = eObj.wepType || 'sword';
      swingAngle = swingAngle ? 0.45 : 0;
      accentCol = eObj.glowColor || '#39ff14';
    }
    ctx.save();
    ctx.rotate(swingAngle || 0);
    if (wepType === 'spear') {
      // Long diagonal wooden shaft with pixel-stepped dark outline & wood grain highlight
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-16, -3, 44, 5.5);
      ctx.fillStyle = '#5c2d16';
      ctx.fillRect(-15, -2, 42, 3.5);
      ctx.fillStyle = '#854d0e';
      ctx.fillRect(-14, -2, 40, 1.4);
      // Leather grip bindings
      ctx.fillStyle = '#271206';
      ctx.fillRect(-4, -2.5, 3, 4.5);
      ctx.fillRect(4, -2.5, 3, 4.5);

      // Cross-lugged 16-bit steel spearhead
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(22, -6.5, 4, 12.5);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(23, -5.5, 2.5, 10.5);

      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.moveTo(25, -7.5);
      ctx.lineTo(43, -0.2);
      ctx.lineTo(25, 7.2);
      ctx.closePath();
      ctx.fill();

      // Lower shadow facet
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.moveTo(26, -0.2);
      ctx.lineTo(41, -0.2);
      ctx.lineTo(26, 5.8);
      ctx.closePath();
      ctx.fill();

      // Upper sunlit steel facet + pure white pixel edge glint
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.moveTo(26, -6);
      ctx.lineTo(41, -0.2);
      ctx.lineTo(26, -0.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(28, -3.2, 8, 1.6);

    } else if (wepType === 'axe' || wepType === 'hammer') {
      // Heavy iron-shod haft
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-4, -24, 6.5, 32);
      ctx.fillStyle = '#451a03';
      ctx.fillRect(-3, -23, 4.5, 30);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(-2, -22, 1.8, 28);

      if (wepType === 'hammer') {
        // Two-handed riveted war-maul head
        ctx.fillStyle = '#070a0e';
        ctx.fillRect(-12, -28, 23, 13);
        ctx.fillStyle = '#475569';
        ctx.fillRect(-11, -27, 21, 11);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(-10, -26, 19, 3.5);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(-2, -25, 3.5, 7);
      } else {
        // Bearded executioner battleaxe blade with bright steel bevel
        ctx.fillStyle = '#070a0e';
        ctx.beginPath();
        ctx.moveTo(0, -22);
        ctx.lineTo(15, -28);
        ctx.lineTo(16, -6);
        ctx.lineTo(0, -11);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#475569';
        ctx.beginPath();
        ctx.moveTo(1, -21);
        ctx.lineTo(14, -26.5);
        ctx.lineTo(14.5, -7.5);
        ctx.lineTo(1, -12);
        ctx.closePath();
        ctx.fill();

        // Honed cutting edge
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(11.5, -25.5, 3, 17);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(13, -24, 1.5, 14);
      }
    } else if (wepType === 'bow') {
      // Recurve composite hunter bow + nocked feathered arrow
      ctx.strokeStyle = '#070a0e';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(5, 0, 13, -Math.PI * 0.46, Math.PI * 0.46);
      ctx.stroke();
      ctx.strokeStyle = '#854d0e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(5, 0, 13, -Math.PI * 0.46, Math.PI * 0.46);
      ctx.stroke();
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(5, 0, 13, -0.35, 0.35);
      ctx.stroke();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(5, -12); ctx.lineTo(5, 12);
      ctx.stroke();
      ctx.fillStyle = '#78350f';
      ctx.fillRect(4, -1, 16, 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(19, -2, 4, 4);
    } else if (wepType === 'daggers' || wepType === 'scimitar') {
      // Curved venomous scimitar / Kris blade
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.moveTo(-2, 2);
      ctx.lineTo(-2, -21);
      ctx.lineTo(6, -24);
      ctx.lineTo(5, 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#64748b';
      ctx.fillRect(-1, -20, 4.5, 20);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(1.5, -21, 2, 19);
      ctx.fillStyle = accentCol || '#39ff14';
      ctx.fillRect(2, -22, 1.5, 7);
      // Ornate brass crossguard
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-5, -1, 12, 4);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(-4, 0, 10, 2.5);
    } else {
      // Forged broadsword matching Badger Hero's blade quality
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-2.5, -24, 6, 25);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(-1.5, -23, 4, 23);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0.5, -23, 1.8, 22);
      // Crossguard & pommel
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-6.5, -3, 14, 4.5);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(-5.5, -2, 12, 2.5);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(-3.5, -2, 8, 1.2);
    }
    ctx.restore();
  };

  drawEnemySprite = function (e, now) {
    if (!e) return;
    now = now || performance.now();

    // Ceiling drop-in web thread / chain & landing shadow
    if (e.ceilingDropZ && e.ceilingDropZ > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(2, 6, 12, 0.65)';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y - (e.z || 0) + 12, 16, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      const dropY = e.y - (e.z || 0) - e.ceilingDropZ;
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.9)';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(e.x, dropY - 220);
      ctx.lineTo(e.x, dropY - 6);
      ctx.stroke();
      ctx.restore();
    }

    const eScale = e.scale || 1.0;
    const dropZ = e.ceilingDropZ || 0;
    const totalZ = (e.z || 0) + dropZ;

    // Directional Ground Cast Shadow
    drawDirectionalCastShadow(e.x, e.y, e.x, e.y + 15 * eScale, 15 * eScale, 7.5 * eScale, 1.05);

    ctx.save();
    ctx.translate(e.x, e.y - totalZ);

    if (e.isMiniBoss) {
      // Sub-Boss Warlord pulsing ground command ring
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = e.glowColor || '#fde047';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(0, 17, 26 + Math.sin(now * 0.006) * 3, 11, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (e.inLiquid) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(163, 255, 18, 0.65)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(0, 10, 21 + Math.sin(now * 0.008) * 3, 9, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else {
      drawSoftContactShadow(0, 16 * eScale, 23 * eScale, 11 * eScale);
      ctx.fillStyle = 'rgba(2, 4, 7, 0.58)';
      ctx.beginPath();
      ctx.ellipse(0, 16 * eScale, 14.5 * eScale, 6.2 * eScale, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (e.hitStun > 0) {
      ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3);
    }

    const step = Math.sin(e.walkAnim || 0) * 5;
    const bounce = Math.abs(Math.cos(e.walkAnim || 0)) * 2.5;
    const isBlinking = ((now + Math.floor((e.blinkTimer || 0) * 1000)) % 3100) < 135;
    const atkSwing = (e.attackAnim > 0)
      ? (-0.9 + Math.sin((1 - e.attackAnim / 0.25) * Math.PI) * 2.1)
      : Math.sin(e.walkAnim || 0) * 0.22;
    const glintX = ((now * 0.025 + e.x) % 24) - 12;

    ctx.save();
    ctx.translate(0, -bounce + (e.inLiquid ? 6 : 0));
    if (eScale !== 1.0) {
      ctx.scale(eScale, eScale);
    }

    if (e.facing === 'left') {
      ctx.scale(-1, 1);
    }

    const sp = e.species || e.clanId || 'reptile';

    // Weapon slash trail when enemy attacks
    if (e.attackAnim > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = e.isMiniBoss ? 'rgba(253, 224, 71, 0.85)' : 'rgba(251, 191, 36, 0.65)';
      ctx.lineWidth = e.isMiniBoss ? 6.5 : 5;
      ctx.beginPath();
      ctx.arc(4, -2, 30, atkSwing - 0.6, atkSwing + 0.3);
      ctx.stroke();
      ctx.restore();
    }

    if (sp === 'snake') {
      // =========================================================
      // SNAKE CLAN: 16-BIT ARMOURED NAGA / ROYAL COBRA WARRIOR
      // =========================================================
      const wave1 = Math.sin((e.walkAnim || 0) * 1.3) * 4.5;
      const wave2 = Math.cos((e.walkAnim || 0) * 1.3) * 4.5;
      const scaleCol = e.color || '#2e7d32';
      const armCol = e.armorColor || '#d4af37';

      // 1. Multi-layered slithering serpent tail coils
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#070a0e';
      ctx.lineWidth = 15;
      ctx.beginPath();
      ctx.moveTo(-18, 12 + wave1 * 0.5);
      ctx.quadraticCurveTo(-7, 15 - wave2 * 0.5, 5, 10);
      ctx.quadraticCurveTo(1, 2, 0, -5);
      ctx.stroke();

      ctx.strokeStyle = '#14331b';
      ctx.lineWidth = 11.5;
      ctx.stroke();

      ctx.strokeStyle = scaleCol;
      ctx.lineWidth = 9;
      ctx.stroke();

      // Segmented golden-ochre ventral belly plates with dark rib seams
      ctx.fillStyle = '#ca8a04';
      ctx.fillRect(-12, 9, 14, 4);
      ctx.fillRect(-5, 3, 9, 6);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(-10, 10, 10, 2);
      ctx.fillRect(-3.5, 4, 6, 4);
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-7, 9, 1.5, 4);
      ctx.fillRect(-2, 9, 1.5, 4);
      ctx.fillRect(-4, 6, 7, 1.2);

      // 2. Wide Flared Royal Cobra Hood with twin hypnotic eye-spots
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.ellipse(0, -10, 17, 13.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#14331b';
      ctx.beginPath();
      ctx.ellipse(0, -10, 15, 11.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = scaleCol;
      ctx.beginPath();
      ctx.ellipse(0, -10, 13, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.fillRect(-11, -13, 3.5, 5);
      ctx.fillRect(7.5, -13, 3.5, 5);
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-10, -11.5, 2, 2.5);
      ctx.fillRect(8, -11.5, 2, 2.5);

      // 3. Ornate Pharaonic Scale Cuirass & Belt + Specular Glint
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-11.5, -7, 23, 13);
      ctx.fillStyle = armCol;
      ctx.fillRect(-10.5, -6, 21, 11);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(-10, -6, 20, 2.2);
      ctx.fillRect(-2, -4, 4, 8);
      if (glintX > -9 && glintX < 8) {
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fillRect(glintX, -5.5, 2.5, 9);
      }
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(-1.5, -2.5, 3, 3);
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-11, 3, 22, 3.5);
      ctx.fillStyle = '#451a03';
      ctx.fillRect(-10, 3.5, 20, 2.5);

      // 4. Articulated Left & Right Scaled Arms + Pauldrons
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.arc(-11, -3, 5.5, 0, Math.PI * 2);
      ctx.arc(11, -3, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = armCol;
      ctx.beginPath();
      ctx.arc(-11, -3, 4.2, 0, Math.PI * 2);
      ctx.arc(11, -3, 4.2, 0, Math.PI * 2);
      ctx.fill();

      // 5. Angular Viper Head with head-cast shadow, brow scales, slit eye, venom fangs & forked tongue
      ctx.fillStyle = 'rgba(4, 7, 11, 0.55)';
      ctx.beginPath();
      ctx.ellipse(2, -6, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.ellipse(3, -14, 12.5, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = scaleCol;
      ctx.beginPath();
      ctx.ellipse(3, -14, 11, 7.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#86efac';
      ctx.fillRect(-2, -19, 10, 2.5);
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(-3, -10, 14, 3);

      // Flickering forked red tongue
      if (Math.sin(now * 0.015 + (e.walkAnim || 0)) > 0.1) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(14, -12); ctx.lineTo(21, -12);
        ctx.lineTo(24, -14.5); ctx.moveTo(21, -12); ctx.lineTo(24, -9.5);
        ctx.stroke();
      }

      // Twin curved white fangs with neon-green venom tip
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(8, -9, 2, 3.5);
      ctx.fillRect(12, -9, 2, 3.5);
      ctx.fillStyle = '#39ff14';
      ctx.fillRect(12, -6.5, 2, 1.5);

      if (!isBlinking) {
        ctx.fillStyle = '#070a0e';
        ctx.fillRect(4.5, -17.5, 5, 4);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(5, -17, 4, 3);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(6.5, -17, 1.5, 3);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(5.5, -17, 1.5, 1.5);
      }

      ctx.save();
      ctx.translate(10, -1);
      drawEnemyWeapon(e.wepType, atkSwing, '#39ff14');
      ctx.restore();

    } else if (sp === 'wolf') {
      // =========================================================
      // WOLF CLAN: 16-BIT LUPINE RAIDER / DIREWOLF KNIGHT
      // =========================================================
      const furCol = e.color || '#607d8b';
      const armCol = e.armorColor || '#5d4037';

      // 1. Bushy multi-tone wolf tail with silver-white tip
      ctx.strokeStyle = '#070a0e';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-10, 4);
      ctx.quadraticCurveTo(-22, -2 + step * 0.6, -25, 6);
      ctx.stroke();
      ctx.strokeStyle = furCol;
      ctx.lineWidth = 6.5;
      ctx.stroke();
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(-26, 3 + step * 0.3, 5, 4);

      // 2. Digitigrade legs with iron greaves & 3-clawed paws
      if (!e.inLiquid) {
        ctx.fillStyle = '#070a0e';
        ctx.fillRect(-10, 5 + step, 8.5, 13);
        ctx.fillRect(2, 5 - step, 8.5, 13);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-9, 6 + step, 6.5, 11);
        ctx.fillRect(3, 6 - step, 6.5, 11);
        ctx.fillStyle = '#475569';
        ctx.fillRect(-10, 11 + step, 8.5, 5);
        ctx.fillRect(2, 11 - step, 8.5, 5);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(-9, 12 + step, 6.5, 2);
        ctx.fillRect(3, 12 - step, 6.5, 2);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(-9, 16 + step, 6.5, 2);
        ctx.fillRect(3, 16 - step, 6.5, 2);
      }

      // 3. Wolf torso + Riveted Brigandine / Fluted Steel Cuirass + Belt
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.ellipse(0, 0, 16.5, 14.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = furCol;
      ctx.beginPath();
      ctx.ellipse(0, 0, 15, 13, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-12.5, -9, 25, 16);
      ctx.fillStyle = armCol;
      ctx.fillRect(-11.5, -8, 23, 14);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-11, -8, 22, 2.5);
      ctx.fillRect(-1.5, -7, 3, 11);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(-9, -4, 2, 2);
      ctx.fillRect(7, -4, 2, 2);
      ctx.fillRect(-9, 1, 2, 2);
      ctx.fillRect(7, 1, 2, 2);
      if (glintX > -10 && glintX < 9) {
        ctx.fillStyle = 'rgba(255,255,255,0.24)';
        ctx.fillRect(glintX, -7, 2.5, 10);
      }

      ctx.fillStyle = '#27170e';
      ctx.fillRect(-11.5, 3, 23, 3.5);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(-3, 2.5, 6, 4.5);
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(-1.5, 3.5, 3, 2.5);

      // 4. Off-hand Pauldron & Riveted Iron Buckler Shield
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.arc(-11, -3, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.arc(-11, -3, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.arc(-11, 3, 8.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.arc(-11, 3, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(-12.5, 1.5, 3, 3);

      // 5. Expressive 16-Bit Wolf Head
      ctx.fillStyle = 'rgba(4, 7, 11, 0.55)';
      ctx.beginPath();
      ctx.ellipse(0, -5, 11, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.moveTo(-10, -18); ctx.lineTo(-5, -30); ctx.lineTo(0, -19);
      ctx.moveTo(0, -19);  ctx.lineTo(6, -30);  ctx.lineTo(10, -18);
      ctx.fill();
      ctx.fillStyle = furCol;
      ctx.beginPath();
      ctx.moveTo(-9, -18); ctx.lineTo(-5, -28); ctx.lineTo(-1, -19);
      ctx.moveTo(1, -19);  ctx.lineTo(6, -28);  ctx.lineTo(9, -18);
      ctx.fill();
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(-6, -25, 2, 5);
      ctx.fillRect(4.5, -25, 2, 5);

      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.arc(0, -13, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = furCol;
      ctx.beginPath();
      ctx.arc(0, -13, 10.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(-9, -12, 6, 6);
      ctx.fillRect(-3, -21, 7, 3);

      // Long lupine muzzle & bared white fangs
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(3, -16.5, 14, 9.5);
      ctx.fillStyle = furCol;
      ctx.fillRect(4, -15.5, 12, 5);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(4, -11, 11, 3);
      ctx.fillStyle = '#090d14';
      ctx.fillRect(13, -16, 4, 3.5);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(14, -15.5, 2, 1.5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(7.5, -8.5, 2, 3);
      ctx.fillRect(12, -8.5, 2, 3);

      ctx.fillStyle = '#090d14';
      ctx.fillRect(1.5, -18, 6, 4.5);
      if (!isBlinking) {
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(2.5, -17, 4, 3);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(4, -17, 1.5, 1.5);
      }

      ctx.save();
      ctx.translate(11, -1);
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.arc(0, -2, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.arc(0, -2, 4.2, 0, Math.PI * 2);
      ctx.fill();
      drawEnemyWeapon(e.wepType, atkSwing);
      ctx.restore();

    } else if (sp === 'eagle') {
      // =========================================================
      // EAGLE CLAN: 16-BIT PLUMED RAPTOR VALKYRIE / LANCER
      // =========================================================
      const wingFlap = Math.sin(now * 0.015 + (e.walkAnim || 0)) * 9;
      const featherCol = e.color || '#5d4037';
      const armCol = e.armorColor || '#ffd54f';

      // 1. Multi-tiered Feathered Wings
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.moveTo(-4, -6);
      ctx.lineTo(-29, -19 + wingFlap);
      ctx.lineTo(-24, -3 + wingFlap * 0.6);
      ctx.lineTo(-18, 6 + wingFlap * 0.4);
      ctx.lineTo(-4, 4);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = featherCol;
      ctx.beginPath();
      ctx.moveTo(-5, -5);
      ctx.lineTo(-27, -17 + wingFlap);
      ctx.lineTo(-22, -3 + wingFlap * 0.6);
      ctx.lineTo(-17, 5 + wingFlap * 0.4);
      ctx.lineTo(-5, 3);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.moveTo(-6, -4);
      ctx.lineTo(-19, -11 + wingFlap * 0.6);
      ctx.lineTo(-14, 1 + wingFlap * 0.3);
      ctx.closePath();
      ctx.fill();

      // 2. Scaled Raptor Legs & 3 Curved Golden Talons
      if (!e.inLiquid) {
        ctx.fillStyle = '#070a0e';
        ctx.fillRect(-8, 6 + step * 0.6, 6.5, 11);
        ctx.fillRect(2, 6 - step * 0.6, 6.5, 11);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(-7, 7 + step * 0.6, 4.5, 9);
        ctx.fillRect(3, 7 - step * 0.6, 4.5, 9);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(-8, 15 + step * 0.6, 6.5, 2.2);
        ctx.fillRect(2, 15 - step * 0.6, 6.5, 2.2);
      }

      // 3. Raptor Torso & Engraved Sun-Gold Breastplate + Pleated War-Kilt
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.ellipse(0, -1, 15.5, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = featherCol;
      ctx.beginPath();
      ctx.ellipse(0, -1, 14, 12.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#991b1b';
      ctx.fillRect(-10, 4, 20, 5);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(-8, 4, 2, 5);
      ctx.fillRect(-1, 4, 2, 5);
      ctx.fillRect(6, 4, 2, 5);

      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-12, -9, 24, 14);
      ctx.fillStyle = armCol;
      ctx.fillRect(-11, -8, 22, 12);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(-10, -8, 20, 2.5);
      ctx.fillRect(-2, -6, 4, 9);
      ctx.fillStyle = '#0ea5e9';
      ctx.fillRect(-1.5, -3, 3, 3.5);

      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.arc(-11, -4, 6, 0, Math.PI * 2);
      ctx.arc(11, -4, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(-11, -4, 4.6, 0, Math.PI * 2);
      ctx.arc(11, -4, 4.6, 0, Math.PI * 2);
      ctx.fill();

      // 4. White-Plumed Raptor Head, Crest Feathers, Fierce Eye & Hooked Golden Beak
      ctx.fillStyle = 'rgba(4, 7, 11, 0.55)';
      ctx.beginPath();
      ctx.ellipse(0, -5, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.moveTo(-4, -21); ctx.lineTo(-14, -26); ctx.lineTo(-9, -15);
      ctx.moveTo(1, -22);  ctx.lineTo(-7, -28);  ctx.lineTo(-2, -16);
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.moveTo(-3, -20); ctx.lineTo(-12, -25); ctx.lineTo(-8, -15);
      ctx.moveTo(1, -21);  ctx.lineTo(-6, -26);  ctx.lineTo(-2, -16);
      ctx.fill();

      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.arc(1, -13, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(1, -13, 9.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-5, -20, 11, 6);

      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.moveTo(7, -18);
      ctx.lineTo(20, -13);
      ctx.lineTo(16, -6);
      ctx.lineTo(7, -9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.moveTo(8, -17);
      ctx.lineTo(18.5, -13);
      ctx.lineTo(15.5, -7.5);
      ctx.lineTo(8, -10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(8, -16.5, 8, 2.5);

      ctx.fillStyle = '#090d14';
      ctx.fillRect(2, -17, 5.5, 4);
      if (!isBlinking) {
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(3, -16, 3.5, 2.8);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(4.5, -16, 1.5, 1.5);
      }

      ctx.save();
      ctx.translate(11, -1);
      drawEnemyWeapon(e.wepType, atkSwing);
      ctx.restore();

    } else if (sp === 'spider') {
      // =========================================================
      // SPIDER CLAN: 16-BIT IRONCLAD ARACHNID WEAVER / DUELIST
      // =========================================================
      const chitinCol = e.color || '#311b92';
      const armCol = e.armorColor || '#7e57c2';

      // 1. 8 Jointed Chitinous Legs with Knee Spikes & Ivory Claw Tips
      for (let l = 0; l < 4; l++) {
        const legSwing = Math.sin((e.walkAnim || 0) * 1.5 + l * 1.2) * 4.2;
        const ly = -5 + l * 4;
        const kneeX = 19 + (l % 2) * 2;
        const tipX = 26 + (l % 2) * 2;

        ctx.lineCap = 'round';
        ctx.strokeStyle = '#070a0e';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(-7, ly);
        ctx.lineTo(-kneeX, ly - 6 + legSwing);
        ctx.lineTo(-tipX, ly + 6 + legSwing);
        ctx.moveTo(7, ly);
        ctx.lineTo(kneeX, ly - 6 - legSwing);
        ctx.lineTo(tipX, ly + 6 - legSwing);
        ctx.stroke();

        ctx.strokeStyle = chitinCol;
        ctx.lineWidth = 2.6;
        ctx.stroke();

        ctx.fillStyle = armCol;
        ctx.fillRect(-kneeX - 1.5, ly - 7 + legSwing, 3, 3);
        ctx.fillRect(kneeX - 1.5, ly - 7 - legSwing, 3, 3);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(-tipX - 1, ly + 5 + legSwing, 2.5, 2.5);
        ctx.fillRect(tipX - 1, ly + 5 - legSwing, 2.5, 2.5);
      }

      // 2. Bulbous Armored Abdomen with Riveted Saddle-Plates & Glowing Hourglass Sigil
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.ellipse(-6, -3, 16, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = chitinCol;
      ctx.beginPath();
      ctx.ellipse(-6, -3, 14.5, 11.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-16, -10, 17, 13);
      ctx.fillStyle = armCol;
      ctx.fillRect(-15, -9, 15, 11);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(-14, -9, 13, 2);
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(-10, -6); ctx.lineTo(-5, -6); ctx.lineTo(-10, 0); ctx.lineTo(-5, 0);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-13, -13, 2.5, 3.5);
      ctx.fillRect(-8, -14, 2.5, 4);

      // 3. Armored Cephalothorax, 6 Glowing Arachnid Eyes & Venomous Pincer Mandibles
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.arc(6, 0, 11.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(6, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#64748b';
      ctx.fillRect(1, -8, 10, 3);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(2, -8, 8, 1.5);

      ctx.fillStyle = '#070a0e';
      ctx.fillRect(13, -4, 6, 4);
      ctx.fillRect(13, 1, 6, 4);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(14, -3, 4.5, 2.2);
      ctx.fillRect(14, 1.8, 4.5, 2.2);
      ctx.fillStyle = '#39ff14';
      ctx.fillRect(17, -2, 2, 2);
      ctx.fillRect(17, 2, 2, 2);

      if (!isBlinking) {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(7, -4.5, 3.5, 3);
        ctx.fillRect(11.5, -3, 2.5, 2.5);
        ctx.fillRect(7, 1, 3.5, 3);
        ctx.fillRect(11.5, 0.5, 2.5, 2.5);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(8, -4, 1.5, 1.5);
        ctx.fillRect(8, 1.5, 1.5, 1.5);
      }

      ctx.save();
      ctx.translate(12, 2);
      drawEnemyWeapon(e.wepType, atkSwing, '#ef4444');
      ctx.restore();

    } else if (sp === 'boar') {
      // =========================================================
      // BOAR CLAN: 16-BIT BRUTE BOAR WARRIOR
      // =========================================================
      const furCol = e.color || '#5d4037';

      // 1. Stocky Furred Hind Legs & Cloven Hooves
      if (!e.inLiquid) {
        ctx.fillStyle = '#070a0e';
        ctx.fillRect(-11, 5 + step, 9, 13);
        ctx.fillRect(2, 5 - step, 9, 13);
        ctx.fillStyle = '#3b2316';
        ctx.fillRect(-10, 6 + step, 7, 11);
        ctx.fillRect(3, 6 - step, 7, 11);
        ctx.fillStyle = '#6e4733';
        ctx.fillRect(-9, 8 + step, 5, 4);
        ctx.fillRect(4, 8 - step, 5, 4);
        ctx.fillStyle = '#a8a29e';
        ctx.fillRect(-10, 15 + step, 3, 2.5);
        ctx.fillRect(-6, 15 + step, 3, 2.5);
        ctx.fillRect(3, 15 - step, 3, 2.5);
        ctx.fillRect(7, 15 - step, 3, 2.5);
      }

      // 2. Hulking Muscular Boar Torso with Dithered Fur & Leather Loincloth
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.ellipse(0, -1, 18.5, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3b2316';
      ctx.beginPath();
      ctx.ellipse(0, -1, 17, 14.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = furCol;
      ctx.beginPath();
      ctx.ellipse(1, -2, 15, 13, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.moveTo(-5, 6); ctx.lineTo(5, 6); ctx.lineTo(1, 14); ctx.lineTo(-2, 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#b45309';
      ctx.fillRect(-3.5, 7, 7, 4);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(-2, 7, 4, 5.5);

      // 3. Forged Dark-Iron Chest Plate & Leather Straps
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-13, -7, 26, 13);
      ctx.fillStyle = '#334155';
      ctx.fillRect(-12, -6, 24, 11);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(-10, -5, 19, 5);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(-8, -4, 9, 2.5);
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-12, 2, 24, 2.5);

      // 4. Jagged Mohawk Dorsal Bristle Mane along top hump
      for (let bx = -11; bx <= 5; bx += 4) {
        ctx.fillStyle = '#070a0e';
        ctx.beginPath();
        ctx.moveTo(bx - 2, -13);
        ctx.lineTo(bx, -22);
        ctx.lineTo(bx + 4, -13);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#7c4d34';
        ctx.beginPath();
        ctx.moveTo(bx - 1, -13);
        ctx.lineTo(bx, -20);
        ctx.lineTo(bx + 3, -13);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#d99b66';
        ctx.fillRect(bx - 0.5, -19, 1.8, 3);
      }

      // 5. Massive Spiked Rust-Orange Shoulder Pauldron with Wide Steel Rim
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.arc(-9, -5, 10.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(-9, -5, 9.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9a3412';
      ctx.beginPath();
      ctx.arc(-9, -5, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ea580c';
      ctx.fillRect(-13, -9, 7, 5);
      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(-11, -8, 2.5, 2.5);

      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.moveTo(-16, -9); ctx.lineTo(-19, -18); ctx.lineTo(-11, -11);
      ctx.moveTo(-11, -12); ctx.lineTo(-11, -21); ctx.lineTo(-6, -12);
      ctx.moveTo(-5, -10); ctx.lineTo(-3, -18); ctx.lineTo(-1, -9);
      ctx.fill();
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(-15, -9); ctx.lineTo(-18, -16); ctx.lineTo(-11, -11);
      ctx.moveTo(-10, -12); ctx.lineTo(-10.5, -19); ctx.lineTo(-6.5, -12);
      ctx.fill();
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(-11, -18, 2, 3);

      // 6. Muscular Back Arm with Riveted Steel Wrist Gauntlet
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-17, -1, 8, 12);
      ctx.fillStyle = '#4d3022';
      ctx.fillRect(-16, 0, 6, 10);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(-16.5, 3, 7, 4);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(-15.5, 3.5, 5, 1.8);

      // 7. Detailed Boar Head: Pointed Ears, Scowling Brow, Glowing Eye, Coral-Pink Snout Disk & Twin Ivory Tusks
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-4, -19, 5, 6);
      ctx.fillRect(6, -19, 5, 6);
      ctx.fillStyle = '#6e4733';
      ctx.fillRect(-3, -18, 3.5, 4.5);
      ctx.fillRect(7, -18, 3.5, 4.5);
      ctx.fillStyle = '#e07a65';
      ctx.fillRect(-2, -17, 2, 2.5);

      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-3, -15, 16, 13);
      ctx.fillStyle = furCol;
      ctx.fillRect(-2, -14, 14, 11);
      ctx.fillStyle = '#8c583c';
      ctx.fillRect(0, -14, 9, 4);

      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.moveTo(4, -3); ctx.lineTo(4, -12); ctx.lineTo(8, -4);
      ctx.moveTo(13, -3); ctx.lineTo(19, -12); ctx.lineTo(17, -3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(4.8, -10.5, 2.5, 6.5);
      ctx.fillRect(14.5, -10.5, 2.5, 6.5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(5, -10.5, 1.5, 3);
      ctx.fillRect(15, -10.5, 1.5, 3);

      ctx.fillStyle = '#070a0e';
      ctx.fillRect(7, -10, 10, 8.5);
      ctx.fillStyle = '#d97762';
      ctx.fillRect(8, -9, 8, 6.5);
      ctx.fillStyle = '#f4a293';
      ctx.fillRect(8.5, -9, 7, 2.2);
      ctx.fillStyle = '#2a0f0a';
      ctx.fillRect(9.8, -7, 1.8, 3.5);
      ctx.fillRect(13.2, -7, 1.8, 3.5);

      ctx.fillStyle = '#070a0e';
      ctx.fillRect(2, -13, 5.5, 4);
      if (!isBlinking) {
        ctx.fillStyle = '#fde047';
        ctx.fillRect(3, -12, 3.5, 2.5);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(4.5, -12, 1.5, 1.5);
      }

      ctx.save();
      ctx.translate(11, 1);
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-3, -2, 6, 8);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(-2, 0, 4, 4);
      drawEnemyWeapon(e.wepType, atkSwing);
      ctx.restore();

    } else {
      // =========================================================
      // REPTILE CLAN: 16-BIT SAURIAN SPEARMAN
      // =========================================================
      const scaleCol = e.color || '#5c7332';

      // 1. Thick S-Curved Reptilian Tail with Ochre Underbelly Stripes
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#070a0e';
      ctx.lineWidth = 10.5;
      ctx.beginPath();
      ctx.moveTo(-9, 5);
      ctx.quadraticCurveTo(-23, 9 + step * 0.6, -26, -3 + step * 0.4);
      ctx.stroke();

      ctx.strokeStyle = scaleCol;
      ctx.lineWidth = 7;
      ctx.stroke();

      ctx.strokeStyle = '#d99b4e';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-10, 7);
      ctx.quadraticCurveTo(-21, 10 + step * 0.6, -24, 1 + step * 0.4);
      ctx.stroke();

      // 2. Muscular Digitigrade Reptile Legs with 3 Distinct Ivory Claws
      if (!e.inLiquid) {
        ctx.fillStyle = '#070a0e';
        ctx.fillRect(-10, 5 + step, 8.5, 13);
        ctx.fillRect(2, 5 - step, 8.5, 13);
        ctx.fillStyle = '#3f4f22';
        ctx.fillRect(-9, 6 + step, 6.5, 11);
        ctx.fillRect(3, 6 - step, 6.5, 11);
        ctx.fillStyle = '#84a149';
        ctx.fillRect(-8, 7 + step, 4.5, 5);
        ctx.fillRect(4, 7 - step, 4.5, 5);
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(-9.5, 15.5 + step, 1.8, 2.5);
        ctx.fillRect(-7, 15.5 + step, 1.8, 2.5);
        ctx.fillRect(-4.5, 15.5 + step, 1.8, 2.5);
        ctx.fillRect(2.5, 15.5 - step, 1.8, 2.5);
        ctx.fillRect(5, 15.5 - step, 1.8, 2.5);
        ctx.fillRect(7.5, 15.5 - step, 1.8, 2.5);
      }

      // 3. Scaled Torso & 3-Tier Segmented Bronze/Leather Cuirass
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 14.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = scaleCol;
      ctx.beginPath();
      ctx.ellipse(0, 0, 14.5, 13, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-10.5, -8, 21, 16);
      ctx.fillStyle = '#7c3f1d';
      ctx.fillRect(-9.5, -7, 19, 14);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(-8.5, -6.5, 17, 3.5);
      ctx.fillRect(-8, -2, 16, 3);
      ctx.fillRect(-7, 2.5, 14, 3.5);
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(-6, -6, 8, 1.5);
      ctx.fillRect(-5, -1.5, 7, 1.2);

      // 4. Round Reddish-Bronze Shoulder Pauldron with Silver-Steel Rim & Rivets
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.arc(-9, -4, 8.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(-9, -4, 6.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9a3412';
      ctx.beginPath();
      ctx.arc(-9, -4, 5.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fdba74';
      ctx.fillRect(-11.5, -7, 4, 2.2);

      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-14, 1, 6.5, 8);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(-13, 2, 4.5, 4);
      ctx.fillStyle = scaleCol;
      ctx.fillRect(-13, 6, 4.5, 2.5);

      // 5. Detailed Saurian Head: 5 Curved Golden Crest Spines, Ochre Lower Jaw, Fang & Fierce Eye
      ctx.fillStyle = 'rgba(4, 7, 11, 0.55)';
      ctx.beginPath();
      ctx.ellipse(1, -5, 10.5, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      const crestX = [-8, -4.5, -1, 2.5, 6];
      for (let i = 0; i < crestX.length; i++) {
        const cx = crestX[i];
        const ch = (i === 1 || i === 2) ? 8 : 6;
        ctx.fillStyle = '#070a0e';
        ctx.beginPath();
        ctx.moveTo(cx - 2, -18);
        ctx.lineTo(cx - 3.5, -18 - ch);
        ctx.lineTo(cx + 3, -18);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(cx - 1, -18);
        ctx.lineTo(cx - 2.5, -17 - ch);
        ctx.lineTo(cx + 2, -18);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(cx - 2, -17 - ch, 2, 2.5);
      }

      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.ellipse(3, -13, 13, 9.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = scaleCol;
      ctx.beginPath();
      ctx.ellipse(3, -13, 11.5, 7.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#84a149';
      ctx.fillRect(-2, -18, 12, 3.5);
      ctx.fillRect(6, -15, 8, 4);

      ctx.fillStyle = '#d99b4e';
      ctx.fillRect(0, -9.5, 13, 3.5);
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(2, -10.5, 12, 1.5);
      ctx.fillRect(12, -14, 1.8, 1.8);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(6, -10, 2, 2);

      ctx.fillStyle = '#070a0e';
      ctx.fillRect(2.5, -17, 5, 4);
      if (!isBlinking) {
        ctx.fillStyle = '#f97316';
        ctx.fillRect(3.5, -16, 3, 2.5);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(4.5, -16, 1.5, 1.5);
      }

      ctx.save();
      ctx.translate(10, 0);
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-2, -3, 6, 7);
      ctx.fillStyle = scaleCol;
      ctx.fillRect(-1, -2, 4, 5);
      drawEnemyWeapon(e.wepType, atkSwing);
      ctx.restore();
    }

    // Sub-Boss Warlord Golden Horned Crown OR Henchman Back-Banner Pennant!
    if (e.isMiniBoss) {
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.moveTo(-7, -23);
      ctx.lineTo(-9, -31);
      ctx.lineTo(-3, -26);
      ctx.lineTo(0, -33);
      ctx.lineTo(3, -26);
      ctx.lineTo(9, -31);
      ctx.lineTo(7, -23);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(-6, -24);
      ctx.lineTo(-7.5, -29.5);
      ctx.lineTo(-2.5, -25.5);
      ctx.lineTo(0, -31.5);
      ctx.lineTo(2.5, -25.5);
      ctx.lineTo(7.5, -29.5);
      ctx.lineTo(6, -24);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#fef08a';
      ctx.fillRect(-4, -26, 8, 2);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-1.5, -27, 3, 2.5);
    } else if (e.isHenchman) {
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-11, -28, 2.5, 22);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(-10.5, -27, 1.5, 20);
      ctx.fillStyle = e.color || '#ef4444';
      ctx.beginPath();
      ctx.moveTo(-9, -27);
      ctx.lineTo(-20, -23 + Math.sin(now * 0.01 + (e.walkAnim || 0)) * 2);
      ctx.lineTo(-9, -19);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
    ctx.restore();

    const labelY = e.y - totalZ - ((e.radius || 16) * eScale) - (e.isMiniBoss ? 18 : 14);
    const eName = e.name || 'Clan Warrior';
    const shortName = e.isMiniBoss
      ? ('👑 ' + eName + ' [SUB-BOSS]')
      : ('Lv.' + (e.level || 1) + ' ' + eName.split(' ').slice(0, 2).join(' '));
    ctx.font = e.isMiniBoss ? 'bold 10.5px monospace' : 'bold 9.5px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000000';
    ctx.fillText(shortName, e.x + 1, labelY + 1);
    ctx.fillStyle = e.isMiniBoss ? '#fde047' : (e.isHenchman ? '#cbd5e1' : '#ffffff');
    ctx.fillText(shortName, e.x, labelY);

    const bw = e.isMiniBoss ? 52 : 34;
    const bh = e.isMiniBoss ? 5 : 4;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(e.x - bw / 2, labelY + 4, bw, bh);
    ctx.fillStyle = e.isMiniBoss ? '#f59e0b' : '#ef4444';
    ctx.fillRect(e.x - bw / 2, labelY + 4, bw * Math.max(0, e.hp / e.maxHp), bh);
  };

  // -------------------------------------------------------------
  // C5. UPGRADED 3/4-VIEW 16-BIT TITAN BOSS RENDERERS
  //     (Preserves the 3/4-view designs of Steam Colossus, Brood Matriarch,
  //      and Ouroboros Prime with enhanced armor bevels, steam exhausts,
  //      molten furnace core, 8 jointed chitin legs, brood sac & cosmic coils)
  // -------------------------------------------------------------
  drawBossSprite = function (b, now) {
    if (!b) return;
    now = now || performance.now();
    const r = b.radius || 32;
    const step = Math.sin(b.walkAnim || 0) * 5;
    const bob = Math.sin((b.walkAnim || 0) * 2) * 3.5;
    const isBlinking = (now % 3400) < 140;
    const slamOffset = (b.attackAnim > 0) ? Math.sin(b.attackAnim * Math.PI * 4) * 10 : 0;

    // Monumental Directional Ground Shadow
    drawDirectionalCastShadow(b.x, b.y, b.x, b.y + 26, r * 1.25, r * 0.62, 1.55);

    ctx.save();
    ctx.translate(b.x, b.y - (b.z || 0));

    drawSoftContactShadow(0, 28, 54, 24);
    ctx.fillStyle = 'rgba(2, 4, 8, 0.72)';
    ctx.beginPath();
    ctx.ellipse(0, 28, 42, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(0, bob);

    // Controlled screen-blended emissive aura ring around boss
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const auraR = r + 12 + Math.sin(now * 0.008) * 4;
    const auraGrad = ctx.createRadialGradient(0, -4, r * 0.4, 0, -4, auraR + 14);
    auraGrad.addColorStop(0, hexToRgba(b.glowColor || '#39ff14', 0.22));
    auraGrad.addColorStop(0.6, hexToRgba(b.glowColor || '#39ff14', 0.08));
    auraGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(0, -4, auraR + 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = b.glowColor || '#ff6d00';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -4, r + 8 + Math.sin(now * 0.008) * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (b.id === 'steam_colossus') {
      // =========================================================
      // FLOOR 5 BOSS: STEAM COLOSSUS (THE IRON BOAR KING)
      // =========================================================
      // 1. Piston-Driven Iron Greave Legs & Brass Treads
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-26, 12 + step, 18, 20);
      ctx.fillRect(8, 12 - step, 18, 20);
      ctx.fillStyle = '#334155';
      ctx.fillRect(-24, 13 + step, 14, 17);
      ctx.fillRect(10, 13 - step, 14, 17);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(-21, 14 + step, 8, 5);
      ctx.fillRect(13, 14 - step, 8, 5);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(-25, 25 + step, 16, 4);
      ctx.fillRect(9, 25 - step, 16, 4);

      // 2. Twin Brass-Rimmed Exhaust Smokestacks on Back Venting Steam
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-29, -56, 14, 30);
      ctx.fillRect(15, -56, 14, 30);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-27, -54, 10, 26);
      ctx.fillRect(17, -54, 10, 26);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(-28, -56, 12, 4.5);
      ctx.fillRect(16, -56, 12, 4.5);
      // Rising volumetric steam puffs
      ctx.fillStyle = 'rgba(226, 232, 240, 0.5)';
      ctx.beginPath();
      ctx.arc(-22, -64 + Math.sin(now * 0.01) * 5, 8.5, 0, Math.PI * 2);
      ctx.arc(22, -64 + Math.cos(now * 0.01) * 5, 8.5, 0, Math.PI * 2);
      ctx.fill();

      // 3. Colossal Bristled Boar Body & Riveted Boiler-Plate Armor
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.arc(0, -4, r + 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3e2723';
      ctx.beginPath();
      ctx.arc(0, -4, r, 0, Math.PI * 2);
      ctx.fill();

      // Boiler cuirass with steel bevels & corner rivets
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-31, -22, 62, 40);
      const hullGrad = ctx.createLinearGradient(-29, -20, 29, 16);
      hullGrad.addColorStop(0, '#64748b');
      hullGrad.addColorStop(0.5, '#334155');
      hullGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = hullGrad;
      ctx.fillRect(-29, -20, 58, 36);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-27, -19, 54, 6);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.strokeRect(-27, -19, 54, 34);

      // Glowing Molten Furnace Grate Core with vertical iron bars
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#ff6d00';
      ctx.fillRect(-16, -8, 32, 18);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(-12, -5, 24, 12);
      ctx.restore();
      ctx.fillStyle = '#070a0e';
      for (let gx = -10; gx <= 10; gx += 5) {
        ctx.fillRect(gx - 1.2, -8, 2.4, 18);
      }

      // 4. Twin Giant Spiked Pauldrons (Rust-Orange & Steel)
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.arc(-30, -12, 14.5, 0, Math.PI * 2);
      ctx.arc(30, -12, 14.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9a3412';
      ctx.beginPath();
      ctx.arc(-30, -12, 12, 0, Math.PI * 2);
      ctx.arc(30, -12, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.moveTo(-36, -20); ctx.lineTo(-46, -35); ctx.lineTo(-27, -22);
      ctx.moveTo(36, -20);  ctx.lineTo(46, -35);  ctx.lineTo(27, -22);
      ctx.fill();

      // 5. Armored Boar Monarch Head, Iron Snout Mask & Giant War-Tusks
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.moveTo(-24, 5); ctx.lineTo(-46, -18); ctx.lineTo(-17, -4);
      ctx.moveTo(24, 5);  ctx.lineTo(46, -18);  ctx.lineTo(17, -4);
      ctx.fill();
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.moveTo(-24, 4); ctx.lineTo(-43, -16); ctx.lineTo(-18, -4);
      ctx.moveTo(24, 4);  ctx.lineTo(43, -16);  ctx.lineTo(18, -4);
      ctx.fill();

      // Coral-bronze armored snout disk
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-11, -13, 22, 14);
      ctx.fillStyle = '#d97762';
      ctx.fillRect(-9, -11, 18, 10);
      ctx.fillStyle = '#2a0f0a';
      ctx.fillRect(-5, -8, 3, 5);
      ctx.fillRect(2, -8, 3, 5);

      // 6. Molten Piston Warhammer in Right Hand
      ctx.save();
      ctx.translate(36, slamOffset * 0.6);
      ctx.rotate(b.attackAnim > 0 ? 0.55 : Math.sin(now * 0.006) * 0.45);
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-5, -38, 10, 56);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(-3.5, -36, 7, 52);
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-20, -48, 40, 20);
      ctx.fillStyle = '#475569';
      ctx.fillRect(-18, -46, 36, 16);
      ctx.fillStyle = '#ff6d00';
      ctx.fillRect(-14, -42, 28, 8);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;
      ctx.strokeRect(-18, -46, 36, 16);
      ctx.restore();

    } else if (b.id === 'brood_matriarch') {
      // =========================================================
      // FLOOR 10 BOSS: BROOD MATRIARCH (THE ARACHNID EMPRESS)
      // =========================================================
      // 1. 8 Articulated Scythe-Tipped Chitin Legs with Golden Knee Armor
      for (let i = 0; i < 4; i++) {
        const s = Math.sin((b.walkAnim || 0) + i * 1.1) * 8;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#070a0e';
        ctx.lineWidth = 9.5;
        ctx.beginPath();
        ctx.moveTo(-20, -10 + i * 8); ctx.lineTo(-52, -22 + i * 12 + s); ctx.lineTo(-65, 5 + i * 10 + s * 0.5);
        ctx.moveTo(20, -10 + i * 8);  ctx.lineTo(52, -22 + i * 12 - s);  ctx.lineTo(65, 5 + i * 10 - s * 0.5);
        ctx.stroke();

        ctx.strokeStyle = '#14532d';
        ctx.lineWidth = 5.5;
        ctx.stroke();

        // Golden knee-plates & ivory scythe tips
        ctx.fillStyle = '#eab308';
        ctx.fillRect(-54, -24 + i * 12 + s, 5.5, 5.5);
        ctx.fillRect(49, -24 + i * 12 - s, 5.5, 5.5);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(-67, 3 + i * 10 + s * 0.5, 4.5, 5.5);
        ctx.fillRect(63, 3 + i * 10 - s * 0.5, 4.5, 5.5);
      }

      // 2. Pulsing Bioluminescent Brood Abdomen with Chitinous Rib-Cage & Egg Clusters
      const sacPulse = Math.sin(now * 0.008) * 2.5;
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.ellipse(0, -14, 42 + sacPulse, 34 + sacPulse * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1b4332';
      ctx.beginPath();
      ctx.ellipse(0, -14, 39 + sacPulse, 31 + sacPulse * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Glowing neon acid brood sac + rib bands
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(57, 255, 20, 0.55)';
      ctx.beginPath();
      ctx.ellipse(0, -18, 25 + sacPulse, 17 + sacPulse * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Glowing brood-egg nodes
      ctx.fillStyle = '#bef264';
      [[-15, -22], [15, -22], [0, -27], [-10, -11], [10, -11]].forEach(([ex, ey]) => {
        ctx.beginPath();
        ctx.arc(ex, ey, 4, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.strokeStyle = '#070a0e';
      ctx.lineWidth = 3;
      for (let ry = -28; ry <= -8; ry += 8) {
        ctx.beginPath();
        ctx.moveTo(-24, ry); ctx.quadraticCurveTo(0, ry + 5, 24, ry);
        ctx.stroke();
      }

      // 3. Golden Empress Crown & Venomous Mandibles
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.moveTo(-21, -27); ctx.lineTo(-12, -47); ctx.lineTo(0, -34); ctx.lineTo(12, -47); ctx.lineTo(21, -27);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#eab308';
      ctx.beginPath();
      ctx.moveTo(-19, -28); ctx.lineTo(-11, -44); ctx.lineTo(0, -32); ctx.lineTo(11, -44); ctx.lineTo(19, -28);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(-3, -38, 6, 6);

      // Twin venomous chelicerae
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.moveTo(-16, 4); ctx.lineTo(-24, 22); ctx.lineTo(-8, 12);
      ctx.moveTo(16, 4);  ctx.lineTo(24, 22);  ctx.lineTo(8, 12);
      ctx.fill();
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(-15, 5); ctx.lineTo(-22, 19); ctx.lineTo(-9, 11);
      ctx.moveTo(15, 5);  ctx.lineTo(22, 19);  ctx.lineTo(9, 11);
      ctx.fill();
      ctx.fillStyle = '#39ff14';
      ctx.fillRect(-23, 17, 4, 4);
      ctx.fillRect(19, 17, 4, 4);

      // Venom Staff Scepter
      ctx.save();
      ctx.translate(38, -6 + slamOffset * 0.5);
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-4, -44, 8, 62);
      ctx.fillStyle = '#3f6212';
      ctx.fillRect(-2.5, -42, 5, 58);
      ctx.fillStyle = '#76ff03';
      ctx.beginPath();
      ctx.arc(0, -46, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

    } else {
      // =========================================================
      // FLOOR 13 FINAL BOSS: OUROBOROS PRIME (COSMIC SERPENT GOD)
      // =========================================================
      // 0. Abyssal Wings & Rotating Runic Halo behind Coils
      const wingBeat = Math.sin(now * 0.006) * 8;
      for (let side = -1; side <= 1; side += 2) {
        ctx.fillStyle = '#180526';
        ctx.strokeStyle = '#d500f9';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(side * 22, -22);
        ctx.lineTo(side * 72, -56 + wingBeat);
        ctx.lineTo(side * 62, -10 + wingBeat * 0.5);
        ctx.lineTo(side * 38, 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // 1. Shifting Star-Scaled Cosmic Coils & Golden Ventral Plates
      for (let c = 3; c >= 1; c--) {
        const coilX = Math.sin(now * 0.004 + c) * 14;
        const cy = c * 9 - 8;
        ctx.fillStyle = '#070a0e';
        ctx.beginPath();
        ctx.ellipse(coilX, cy, 45 - c * 5, 21, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = (c % 2 === 0) ? '#3b0764' : '#1e1b4b';
        ctx.beginPath();
        ctx.ellipse(coilX, cy, 42 - c * 5, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        // Golden ventral scales on each coil
        ctx.fillStyle = '#d97706';
        ctx.fillRect(coilX - 14, cy + 4, 28, 6);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(coilX - 10, cy + 5, 20, 3);
      }

      // 2. Grand Winged Royal Cobra Hood with Celestial Eye-Sigils
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.ellipse(0, -18, 44, 31, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4c1d95';
      ctx.beginPath();
      ctx.ellipse(0, -18, 41, 28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Twin celestial hood eye-markings
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(-26, -20, 7, 0, Math.PI * 2);
      ctx.arc(26, -20, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff1744';
      ctx.fillRect(-28, -22, 4, 4);
      ctx.fillRect(24, -22, 4, 4);

      // 3. Golden Cosmic Horns & World-Rending Fangs
      ctx.fillStyle = '#070a0e';
      ctx.beginPath();
      ctx.moveTo(-18, -42); ctx.lineTo(-28, -62); ctx.lineTo(-8, -44);
      ctx.moveTo(18, -42);  ctx.lineTo(28, -62);  ctx.lineTo(8, -44);
      ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.moveTo(-17, -42); ctx.lineTo(-26, -59); ctx.lineTo(-9, -44);
      ctx.moveTo(17, -42);  ctx.lineTo(26, -59);  ctx.lineTo(9, -44);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-10, -2, 4, 9);
      ctx.fillRect(6, -2, 4, 9);

      // Cosmic Glaive in Right Hand
      ctx.save();
      ctx.translate(48, -14 + slamOffset * 0.6);
      ctx.rotate(b.attackAnim > 0 ? 0.6 : 0.15);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(-3, -52, 6, 104);
      ctx.fillStyle = '#ff1744';
      ctx.beginPath();
      ctx.moveTo(0, -58); ctx.lineTo(22, -32); ctx.lineTo(3, -16);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Boss Expressive Blazing Eyes with Specular Glints
    if (!isBlinking) {
      ctx.fillStyle = '#070a0e';
      ctx.fillRect(-16, -20, 12, 10);
      ctx.fillRect(4, -20, 12, 10);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-14, -18, 9, 7);
      ctx.fillRect(6, -18, 9, 7);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = b.glowColor || '#ff1744';
      ctx.fillRect(-12, -16, 5, 5);
      ctx.fillRect(8, -16, 5, 5);
      ctx.restore();
    }

    ctx.restore();
  };

  // ============================================================================
  // PART 4: DUNGEON MAP VARIETY, BIG ROOMS, HALLWAY DIVERSITY, SINGLE FARTHEST
  //         PROGRESSION STAIRWAY, CYCLE MUTATION & 2.5D ROOF/CANOPY OCCLUSION
  // ============================================================================

  // -------------------------------------------------------------
  // D1. 2.5D FOREGROUND CANOPY & ROOF OCCLUSION OVERLAY PASS
  //     When Badger or enemies walk immediately north (behind) tall 3D
  //     structures (Climbable Trees, Scrap-Metal Huts, Lore Obelisks),
  //     re-draw their upper canopy/roof crown so characters pass behind them!
  // -------------------------------------------------------------
  function renderForeground3DOcclusionCrowns(now) {
    if (!state || !state.map || state.cinematicEnding || state.act > 0) return;
    now = now || performance.now();
    const theme = typeof getEffectiveFloorTheme === 'function'
      ? getEffectiveFloorTheme(state.currentFloor || 1, state.cycle || 1)
      : {};
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const viewW = canvas.width / dpr;
    const viewH = canvas.height / dpr;
    const rStart = Math.max(1, Math.floor((state.camera.y - viewH * 0.5 - 64) / TILE_SIZE));
    const rEnd = Math.min(DUNGEON_ROWS - 1, Math.ceil((state.camera.y + viewH * 0.5 + 96) / TILE_SIZE));
    const cStart = Math.max(1, Math.floor((state.camera.x - viewW * 0.5 - 64) / TILE_SIZE));
    const cEnd = Math.min(DUNGEON_COLS - 1, Math.ceil((state.camera.x + viewW * 0.5 + 64) / TILE_SIZE));

    const py = state.player ? state.player.y : -9999;
    const px = state.player ? state.player.x : -9999;

    for (let r = rStart; r < rEnd; r++) {
      for (let c = cStart; c < cEnd; c++) {
        const t = state.map[r][c];
        const x = c * TILE_SIZE;
        const y = r * TILE_SIZE;
        const baseCenterY = y + 36;

        // Check if player is standing just north (behind) this tall 3D tile
        const playerBehind = (py < baseCenterY - 2 && py > y - 42 && Math.abs(px - (x + 32)) < 44);
        if (!playerBehind) continue;

        ctx.save();
        ctx.beginPath();
        ctx.rect(x - 24, y - 64, TILE_SIZE + 48, 54);
        ctx.clip();

        if (t === T_TREE_CLIMB) {
          drawClimbableTreeTrunkTile(x, y, theme, now);
        } else if (t === T_TRASH_HUT) {
          drawScrapMetalTrashHutTile(x, y, theme, now);
        } else if (t === T_LORE_OBELISK) {
          drawLoreObelisk(x + 32, y + 32, theme, now);
        }
        ctx.restore();
      }
    }
  }

  // -------------------------------------------------------------
  // B10. COHESIVE CONNECTED LIQUID DYNAMICS FOR WATER LAKES/PUDDLES
  //      & ACID PONDS/LAKES + RISING BUBBLES, RIPPLES, LIGHT GLINTS
  //      & OCCASIONAL PURPLE ACID TENTACLE (10-15% OF ACID TILES, 2s ENSNARE)
  // -------------------------------------------------------------
  drawTileFloorPuddle = function (x, y, theme, now) {
    now = now || performance.now();
    const c = Math.floor(x / TILE_SIZE);
    const r = Math.floor(y / TILE_SIZE);
    const map = state.map;

    const isW = (rr, cc) => map[rr]?.[cc] === T_FLOOR_PUDDLE;
    const n = isW(r - 1, c);
    const s = isW(r + 1, c);
    const w = isW(r, c - 1);
    const e = isW(r, c + 1);
    const nw = isW(r - 1, c - 1);
    const ne = isW(r - 1, c + 1);
    const sw = isW(r + 1, c - 1);
    const se = isW(r + 1, c + 1);

    const k1 = (Math.PI * 2) / TILE_SIZE; // 64px period for C1-continuous waves across tile seams
    const k2 = (Math.PI * 4) / TILE_SIZE; // 32px harmonic
    const wind = sampleWindField(x + 32, y + 32, now);

    // 1. Seamless Continuous Water Basin Base (zero seams between connected cells!)
    ctx.fillStyle = '#0a2138';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

    // Deep interior bathymetry when connected to neighbors
    const topPad = n ? 0 : 8;
    const botPad = s ? 0 : 8;
    const leftPad = w ? 0 : 8;
    const rightPad = e ? 0 : 8;
    ctx.fillStyle = (n && s && w && e) ? '#061526' : '#0d2b47';
    ctx.fillRect(x + leftPad, y + topPad, TILE_SIZE - leftPad - rightPad, TILE_SIZE - topPad - botPad);

    // 2. Continuous World-Space Flowing Caustics & Liquid Wave Ribbons Across Connected Cells
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + (w ? 0 : 6), y + (n ? 0 : 6), TILE_SIZE - (w ? 0 : 6) - (e ? 0 : 6), TILE_SIZE - (n ? 0 : 6) - (s ? 0 : 6));
    ctx.clip();

    for (let band = 0; band < 3; band++) {
      const baseWy = y + 12 + band * 20;
      const phase = now * 0.0026 + band * 1.7 + r * 0.9;
      ctx.strokeStyle = (band % 2 === 0) ? 'rgba(125, 211, 252, 0.24)' : 'rgba(56, 189, 248, 0.18)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let dx = 0; dx <= TILE_SIZE; dx += 8) {
        const wx = x + dx;
        const wy = baseWy + Math.sin(wx * k1 + phase) * 3.2 + Math.cos((wx + baseWy) * k2 - now * 0.003) * 1.4;
        if (dx === 0) ctx.moveTo(wx, wy);
        else ctx.lineTo(wx, wy);
      }
      ctx.stroke();
    }

    // 3. Small Expanding Concentric Surface Ripples on the Water
    const cellSeed = ((c * 73856093) ^ (r * 19349663)) >>> 0;
    for (let rp = 0; rp < 2; rp++) {
      const rpCycle = ((now * 0.00055 + (cellSeed % 17) * 0.13 + rp * 0.5) % 1.0);
      const rx = x + 18 + ((cellSeed >> (rp * 4)) % 28) + wind.x * 1.5;
      const ry = y + 18 + ((cellSeed >> (rp * 4 + 2)) % 28);
      const radX = 3.5 + rpCycle * 13.5;
      const radY = radX * 0.58;
      const alpha = (1 - rpCycle) * 0.48;

      ctx.strokeStyle = `rgba(186, 230, 253, ${alpha.toFixed(2)})`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(rx, ry, radX, radY, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 4. Sparkling Specular Light Glints Dancing Across Wave Crests
    for (let g = 0; g < 3; g++) {
      const gx = x + 12 + ((cellSeed >> (g * 3)) % 40) + Math.sin(now * 0.003 + g) * 2.5;
      const gy = y + 12 + ((cellSeed >> (g * 3 + 1)) % 40) + Math.cos(now * 0.0025 + g) * 1.5;
      const glintPulse = Math.max(0, Math.sin(now * 0.0065 + g * 2.1 + (c + r) * 0.8));
      if (glintPulse > 0.15) {
        const sz = 1.4 + glintPulse * 2.2;
        ctx.fillStyle = `rgba(125, 211, 252, ${(glintPulse * 0.55).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(gx, gy, sz * 1.6, 0, Math.PI * 2);
        ctx.fill();

        // 4-point starlight specular glint core
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(gx - sz, gy - 0.6, sz * 2, 1.2);
        ctx.fillRect(gx - 0.6, gy - sz, 1.2, sz * 2);
      }
    }
    ctx.restore();

    // 5. Cohesive 3D Stone Shoreline Banks & Lapping Meniscus ONLY on Non-Water Edges & Corners
    const bankCol = '#111822';
    const lipCol = '#060c14';
    const foamCol = 'rgba(186, 230, 253, 0.42)';

    if (!n) {
      ctx.fillStyle = bankCol;
      ctx.fillRect(x, y, TILE_SIZE, 6);
      ctx.fillStyle = lipCol;
      ctx.fillRect(x, y + 5, TILE_SIZE, 3);
      ctx.strokeStyle = foamCol;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let dx = 0; dx <= TILE_SIZE; dx += 8) {
        const wy = y + 8.5 + Math.sin((x + dx) * k2 + now * 0.004) * 1.6;
        if (dx === 0) ctx.moveTo(x + dx, wy);
        else ctx.lineTo(x + dx, wy);
      }
      ctx.stroke();
    }
    if (!s) {
      ctx.fillStyle = bankCol;
      ctx.fillRect(x, y + TILE_SIZE - 6, TILE_SIZE, 6);
      ctx.fillStyle = lipCol;
      ctx.fillRect(x, y + TILE_SIZE - 8, TILE_SIZE, 2.5);
      ctx.strokeStyle = foamCol;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let dx = 0; dx <= TILE_SIZE; dx += 8) {
        const wy = y + TILE_SIZE - 8.5 + Math.sin((x + dx) * k2 - now * 0.004) * 1.6;
        if (dx === 0) ctx.moveTo(x + dx, wy);
        else ctx.lineTo(x + dx, wy);
      }
      ctx.stroke();
    }
    if (!w) {
      ctx.fillStyle = bankCol;
      ctx.fillRect(x, y, 6, TILE_SIZE);
      ctx.fillStyle = lipCol;
      ctx.fillRect(x + 5, y, 3, TILE_SIZE);
      ctx.strokeStyle = foamCol;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let dy = 0; dy <= TILE_SIZE; dy += 8) {
        const wx = x + 8.5 + Math.sin((y + dy) * k2 + now * 0.004) * 1.6;
        if (dy === 0) ctx.moveTo(wx, y + dy);
        else ctx.lineTo(wx, y + dy);
      }
      ctx.stroke();
    }
    if (!e) {
      ctx.fillStyle = bankCol;
      ctx.fillRect(x + TILE_SIZE - 6, y, 6, TILE_SIZE);
      ctx.fillStyle = lipCol;
      ctx.fillRect(x + TILE_SIZE - 8, y, 2.5, TILE_SIZE);
      ctx.strokeStyle = foamCol;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let dy = 0; dy <= TILE_SIZE; dy += 8) {
        const wx = x + TILE_SIZE - 8.5 + Math.sin((y + dy) * k2 - now * 0.004) * 1.6;
        if (dy === 0) ctx.moveTo(wx, y + dy);
        else ctx.lineTo(wx, y + dy);
      }
      ctx.stroke();
    }

    // Outer & Concave Inner Corner Rounding for Organic Lake Contours
    ctx.fillStyle = bankCol;
    if (!n && !w) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 16, y);
      ctx.quadraticCurveTo(x + 8, y + 8, x, y + 16);
      ctx.closePath();
      ctx.fill();
    }
    if (!n && !e) {
      ctx.beginPath();
      ctx.moveTo(x + TILE_SIZE, y);
      ctx.lineTo(x + TILE_SIZE - 16, y);
      ctx.quadraticCurveTo(x + TILE_SIZE - 8, y + 8, x + TILE_SIZE, y + 16);
      ctx.closePath();
      ctx.fill();
    }
    if (!s && !w) {
      ctx.beginPath();
      ctx.moveTo(x, y + TILE_SIZE);
      ctx.lineTo(x + 16, y + TILE_SIZE);
      ctx.quadraticCurveTo(x + 8, y + TILE_SIZE - 8, x, y + TILE_SIZE - 16);
      ctx.closePath();
      ctx.fill();
    }
    if (!s && !e) {
      ctx.beginPath();
      ctx.moveTo(x + TILE_SIZE, y + TILE_SIZE);
      ctx.lineTo(x + TILE_SIZE - 16, y + TILE_SIZE);
      ctx.quadraticCurveTo(x + TILE_SIZE - 8, y + TILE_SIZE - 8, x + TILE_SIZE, y + TILE_SIZE - 16);
      ctx.closePath();
      ctx.fill();
    }
    if (n && w && !nw) ctx.fillRect(x, y, 7, 7);
    if (n && e && !ne) ctx.fillRect(x + TILE_SIZE - 7, y, 7, 7);
    if (s && w && !sw) ctx.fillRect(x, y + TILE_SIZE - 7, 7, 7);
    if (s && e && !se) ctx.fillRect(x + TILE_SIZE - 7, y + TILE_SIZE - 7, 7, 7);
  };

  drawTileFloorSludge = function (x, y, theme, now) {
    now = now || performance.now();
    const c = Math.floor(x / TILE_SIZE);
    const r = Math.floor(y / TILE_SIZE);
    const map = state.map;

    const isA = (rr, cc) => map[rr]?.[cc] === T_FLOOR_SLUDGE;
    const n = isA(r - 1, c);
    const s = isA(r + 1, c);
    const w = isA(r, c - 1);
    const e = isA(r, c + 1);
    const nw = isA(r - 1, c - 1);
    const ne = isA(r - 1, c + 1);
    const sw = isA(r + 1, c - 1);
    const se = isA(r + 1, c + 1);

    const k1 = (Math.PI * 2) / TILE_SIZE;
    const k2 = (Math.PI * 4) / TILE_SIZE;

    // 1. Seamless Continuous Radioactive Acid Pool Base (merges connected cells into one body!)
    ctx.fillStyle = '#0f5e2c';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

    const topPad = n ? 0 : 7;
    const botPad = s ? 0 : 7;
    const leftPad = w ? 0 : 7;
    const rightPad = e ? 0 : 7;
    ctx.fillStyle = (n && s && w && e) ? '#168a3d' : '#157535';
    ctx.fillRect(x + leftPad, y + topPad, TILE_SIZE - leftPad - rightPad, TILE_SIZE - topPad - botPad);

    // 2. Continuous World-Space Viscous Bioluminescent Acid Currents & Swirls
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + (w ? 0 : 6), y + (n ? 0 : 6), TILE_SIZE - (w ? 0 : 6) - (e ? 0 : 6), TILE_SIZE - (n ? 0 : 6) - (s ? 0 : 6));
    ctx.clip();

    for (let band = 0; band < 3; band++) {
      const baseWy = y + 11 + band * 21;
      const phase = now * 0.0032 + band * 2.1 + r * 0.7;
      ctx.strokeStyle = (band === 1) ? 'rgba(204, 255, 0, 0.42)' : 'rgba(57, 255, 20, 0.38)';
      ctx.lineWidth = (band === 1) ? 4.5 : 3.2;
      ctx.beginPath();
      for (let dx = 0; dx <= TILE_SIZE; dx += 8) {
        const wx = x + dx;
        const wy = baseWy + Math.sin(wx * k1 + phase) * 4.0 + Math.cos((wx - baseWy) * k2 + now * 0.0025) * 1.8;
        if (dx === 0) ctx.moveTo(wx, wy);
        else ctx.lineTo(wx, wy);
      }
      ctx.stroke();
    }

    // Glowing chartreuse convection vortex in deeper acid cells
    const swirlWave = Math.sin(now * 0.004 + (c + r) * 0.9) * 3;
    ctx.fillStyle = 'rgba(190, 242, 100, 0.28)';
    ctx.beginPath();
    ctx.ellipse(x + 32 + swirlWave, y + 32 - swirlWave * 0.6, 18, 12, 0.25, 0, Math.PI * 2);
    ctx.fill();

    // 3. Small Rising & Popping Acid Bubbles (5 staggered bubbles per cell)
    const cellSeed = ((c * 92837111) ^ (r * 51827391)) >>> 0;
    for (let b = 0; b < 5; b++) {
      const speed = 0.00048 + (b % 3) * 0.00014;
      const phase = ((now * speed + ((cellSeed >> (b * 3)) % 100) * 0.01 + b * 0.21) % 1.0);
      const baseBx = x + 12 + ((cellSeed >> (b * 4)) % 40);
      const baseBy = y + 16 + ((cellSeed >> (b * 4 + 2)) % 36);

      if (phase < 0.78) {
        // RISING SMALL ACID BUBBLE: drifts upward & sways while growing
        const riseT = phase / 0.78;
        const bx = baseBx + Math.sin(riseT * Math.PI * 2 + b) * 2.2;
        const by = baseBy - riseT * 10.5;
        const rad = 1.2 + riseT * 2.6;

        // Subtle dark underside shadow of bubble in the acid
        ctx.fillStyle = 'rgba(5, 46, 22, 0.55)';
        ctx.beginPath();
        ctx.arc(bx + 0.6, by + 1.2, rad, 0, Math.PI * 2);
        ctx.fill();

        // Translucent neon-lime bubble sphere
        ctx.fillStyle = 'rgba(217, 249, 157, 0.45)';
        ctx.beginPath();
        ctx.arc(bx, by, rad, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ecfccb';
        ctx.lineWidth = 1.0;
        ctx.stroke();

        // Tiny white specular droplet glint on upper-left rim
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(bx - rad * 0.45, by - rad * 0.45, 1.3, 1.3);
      } else {
        // POPPING ACID BUBBLE RING: expands & bursts at surface
        const popT = (phase - 0.78) / 0.22;
        const bx = baseBx;
        const by = baseBy - 10.5;
        const ringRad = 3.8 + popT * 5.5;
        const alpha = (1 - popT) * 0.75;

        ctx.strokeStyle = `rgba(247, 254, 231, ${alpha.toFixed(2)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(bx, by, ringRad, ringRad * 0.65, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();

    // 4. Corroded Stone Shoreline Banks & Bubbling Toxic Meniscus ONLY on Non-Acid Edges & Corners
    const bankCol = '#060e08';
    const lipCol = '#102215';
    const acidEdgeCol = 'rgba(190, 242, 100, 0.62)';

    if (!n) {
      ctx.fillStyle = bankCol;
      ctx.fillRect(x, y, TILE_SIZE, 6);
      ctx.fillStyle = lipCol;
      ctx.fillRect(x, y + 5, TILE_SIZE, 2.5);
      ctx.strokeStyle = acidEdgeCol;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let dx = 0; dx <= TILE_SIZE; dx += 8) {
        const wy = y + 8 + Math.sin((x + dx) * k2 + now * 0.0045) * 1.6;
        if (dx === 0) ctx.moveTo(x + dx, wy);
        else ctx.lineTo(x + dx, wy);
      }
      ctx.stroke();
    }
    if (!s) {
      ctx.fillStyle = bankCol;
      ctx.fillRect(x, y + TILE_SIZE - 6, TILE_SIZE, 6);
      ctx.fillStyle = lipCol;
      ctx.fillRect(x, y + TILE_SIZE - 8, TILE_SIZE, 2.5);
      ctx.strokeStyle = acidEdgeCol;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let dx = 0; dx <= TILE_SIZE; dx += 8) {
        const wy = y + TILE_SIZE - 8 + Math.sin((x + dx) * k2 - now * 0.0045) * 1.6;
        if (dx === 0) ctx.moveTo(x + dx, wy);
        else ctx.lineTo(x + dx, wy);
      }
      ctx.stroke();
    }
    if (!w) {
      ctx.fillStyle = bankCol;
      ctx.fillRect(x, y, 6, TILE_SIZE);
      ctx.fillStyle = lipCol;
      ctx.fillRect(x + 5, y, 2.5, TILE_SIZE);
      ctx.strokeStyle = acidEdgeCol;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let dy = 0; dy <= TILE_SIZE; dy += 8) {
        const wx = x + 8 + Math.sin((y + dy) * k2 + now * 0.0045) * 1.6;
        if (dy === 0) ctx.moveTo(wx, y + dy);
        else ctx.lineTo(wx, y + dy);
      }
      ctx.stroke();
    }
    if (!e) {
      ctx.fillStyle = bankCol;
      ctx.fillRect(x + TILE_SIZE - 6, y, 6, TILE_SIZE);
      ctx.fillStyle = lipCol;
      ctx.fillRect(x + TILE_SIZE - 8, y, 2.5, TILE_SIZE);
      ctx.strokeStyle = acidEdgeCol;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let dy = 0; dy <= TILE_SIZE; dy += 8) {
        const wx = x + TILE_SIZE - 8 + Math.sin((y + dy) * k2 - now * 0.0045) * 1.6;
        if (dy === 0) ctx.moveTo(wx, y + dy);
        else ctx.lineTo(wx, y + dy);
      }
      ctx.stroke();
    }

    // Outer & Concave Inner Corner Rounding for Organic Acid Lake Contours
    ctx.fillStyle = bankCol;
    if (!n && !w) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 15, y);
      ctx.quadraticCurveTo(x + 7, y + 7, x, y + 15);
      ctx.closePath();
      ctx.fill();
    }
    if (!n && !e) {
      ctx.beginPath();
      ctx.moveTo(x + TILE_SIZE, y);
      ctx.lineTo(x + TILE_SIZE - 15, y);
      ctx.quadraticCurveTo(x + TILE_SIZE - 7, y + 7, x + TILE_SIZE, y + 15);
      ctx.closePath();
      ctx.fill();
    }
    if (!s && !w) {
      ctx.beginPath();
      ctx.moveTo(x, y + TILE_SIZE);
      ctx.lineTo(x + 15, y + TILE_SIZE);
      ctx.quadraticCurveTo(x + 7, y + TILE_SIZE - 7, x, y + TILE_SIZE - 15);
      ctx.closePath();
      ctx.fill();
    }
    if (!s && !e) {
      ctx.beginPath();
      ctx.moveTo(x + TILE_SIZE, y + TILE_SIZE);
      ctx.lineTo(x + TILE_SIZE - 15, y + TILE_SIZE);
      ctx.quadraticCurveTo(x + TILE_SIZE - 7, y + TILE_SIZE - 7, x + TILE_SIZE, y + TILE_SIZE - 15);
      ctx.closePath();
      ctx.fill();
    }
    if (n && w && !nw) ctx.fillRect(x, y, 7, 7);
    if (n && e && !ne) ctx.fillRect(x + TILE_SIZE - 7, y, 7, 7);
    if (s && w && !sw) ctx.fillRect(x, y + TILE_SIZE - 7, 7, 7);
    if (s && e && !se) ctx.fillRect(x + TILE_SIZE - 7, y + TILE_SIZE - 7, 7, 7);
  };

  // Render 3D Purple Acid Tentacle emerging from 10-15% of acid tiles
  function drawAcidTentacle(tent, now) {
    if (!tent || !inView(tent.x, tent.y, 72)) return;
    now = now || performance.now();
    const isEnsnaring = (tent.state === 'ensnaring');
    const emerge = isEnsnaring
      ? 1.0
      : (0.34 + 0.18 * Math.sin(now * 0.0035 + (tent.phase || 0)));

    ctx.save();
    ctx.translate(tent.x, tent.y);

    // 1. Swirling Dark-Violet & Neon-Green Acid Vortex Collar at Base
    const rippleR = 13 + Math.sin(now * 0.008 + tent.phase) * 2.5 + (isEnsnaring ? 5 : 0);
    ctx.fillStyle = 'rgba(46, 16, 101, 0.68)';
    ctx.beginPath();
    ctx.ellipse(0, 4, rippleR, rippleR * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = isEnsnaring ? '#f0abfc' : 'rgba(192, 132, 252, 0.72)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(0, 4, rippleR + 2.5, (rippleR + 2.5) * 0.52, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 2. Segmented 3D Muscular Purple Tentacle Stalk with Hydrostat S-Curve & Suction Cups
    const height = 18 + emerge * 28;
    const sway1 = Math.sin(now * (isEnsnaring ? 0.016 : 0.005) + tent.phase) * (isEnsnaring ? 11 : 7);
    const sway2 = Math.cos(now * (isEnsnaring ? 0.014 : 0.004) + tent.phase) * (isEnsnaring ? -9 : -5);

    const segs = 9;
    for (let i = 0; i < segs; i++) {
      const t = i / (segs - 1);
      const sx = Math.sin(t * Math.PI) * sway1 + t * t * sway2;
      const sy = 3 - t * height;
      const rad = (1 - t * 0.72) * (isEnsnaring ? 8.5 : 6.8) + 1.4;

      // Deep dark-indigo contour shadow
      ctx.fillStyle = '#1e0938';
      ctx.beginPath();
      ctx.arc(sx + 1.2, sy + 1.2, rad + 1.0, 0, Math.PI * 2);
      ctx.fill();

      // Royal purple muscular body
      ctx.fillStyle = (i % 2 === 0) ? '#6b21a8' : '#7e22ce';
      ctx.beginPath();
      ctx.arc(sx, sy, rad, 0, Math.PI * 2);
      ctx.fill();

      // Lit dorsal magenta-violet highlight & wet slime glint
      ctx.fillStyle = '#c084fc';
      ctx.beginPath();
      ctx.arc(sx - rad * 0.28, sy - rad * 0.28, rad * 0.52, 0, Math.PI * 2);
      ctx.fill();

      if (i % 2 === 1 && i < segs - 1) {
        // Anatomical underside violet-pink suction cup
        const cupX = sx + rad * 0.65;
        const cupY = sy + 0.8;
        ctx.fillStyle = '#f0abfc';
        ctx.beginPath();
        ctx.arc(cupX, cupY, Math.max(1.5, rad * 0.42), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3b0764';
        ctx.beginPath();
        ctx.arc(cupX, cupY, Math.max(0.7, rad * 0.18), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();

    // 3. When Actively Ensnaring Player: Draw Coiling Purple Tentacle Rings Around Badger!
    if (isEnsnaring && state.player && state.player.status && state.player.status.acidTentacleTimer > 0) {
      const p = state.player;
      ctx.save();
      ctx.translate(p.x, p.y - (p.z || 0));
      for (let ring = 0; ring < 3; ring++) {
        const ry = -2 + ring * 5.5;
        const wriggle = Math.sin(now * 0.018 + ring * 1.4) * 2.5;
        ctx.strokeStyle = '#3b0764';
        ctx.lineWidth = 5.2;
        ctx.beginPath();
        ctx.moveTo(-14, ry + wriggle * 0.4);
        ctx.quadraticCurveTo(0, ry + 5 + wriggle, 14, ry - wriggle * 0.4);
        ctx.stroke();

        ctx.strokeStyle = (ring % 2 === 0) ? '#9333ea' : '#c084fc';
        ctx.lineWidth = 3.0;
        ctx.stroke();

        //Glowing suction cups on the coiled wrap
        ctx.fillStyle = '#f5d0fe';
        ctx.beginPath();
        ctx.arc(-6 + ring * 5, ry + 2 + wriggle * 0.5, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // Wrap stepPlayerMovement & executeActionB & updateHud so the 2-second Purple Acid Tentacle ensnare
  // holds the player in place and shows clear status feedback!
  const _preTentacleStepPlayerMovement = stepPlayerMovement;
  stepPlayerMovement = function (dt, isImmediateImpulse = false) {
    if (state.isPaused && state.pauseReason !== 'manual') {
      window.setGamePaused(false, 'auto_resume');
    }
    if (state.isPaused || isCodexOpen()) return;
    const p = state.player;
    if (p && p.status && p.status.acidTentacleTimer > 0) {
      p.status.acidTentacleTimer = Math.min(2.0, p.status.acidTentacleTimer);
      p.walkAnim = 0;
      if (isImmediateImpulse) {
        showFloater("🐙 ENSNARED BY TENTACLE! (" + p.status.acidTentacleTimer.toFixed(1) + "s)", p.x, p.y - 30 - (p.z || 0), '#e879f9');
      }
      return;
    }
    _preTentacleStepPlayerMovement(dt, isImmediateImpulse);
  };

  const _preTentacleExecuteActionB = executeActionB;
  executeActionB = function () {
    if (state.isPaused && state.pauseReason !== 'manual') {
      window.setGamePaused(false, 'auto_resume');
    }
    if (state.isPaused) return;
    const p = state.player;
    if (p && p.status && p.status.acidTentacleTimer > 0) {
      showFloater("🐙 TENTACLE ENSNARED! (" + p.status.acidTentacleTimer.toFixed(1) + "s)", p.x, p.y - 28 - (p.z || 0), '#e879f9');
      return;
    }
    _preTentacleExecuteActionB();
  };

  const _preTentacleUpdateHud = updateHud;
  updateHud = function () {
    _preTentacleUpdateHud();
    const defTextEl = document.getElementById('hud-def-text');
    if (defTextEl && state.player && state.player.status && state.player.status.acidTentacleTimer > 0) {
      if (!defTextEl.innerHTML.includes('TENT')) {
        defTextEl.innerHTML += ' <span style="color:#e879f9">🐙TENT</span>';
      }
    }
  };

  // Hook update() so ensnaring ground vines (state.bossVines) AND purple acid tentacles (state.acidTentacles) animate & ensnare on ALL floors
  const _preDepthUpdate = update;
  update = function (dt) {
    _preDepthUpdate(dt);
    if (!state || state.paused || state.isPaused || state.gameOver || state.cinematicEnding || state.act > 0) return;

    const p = state.player;
    if (p) {
      if (!p.status) {
        p.status = { poisonTimer: 0, poisonTickAccum: 0, disorientTimer: 0, webTimer: 0, vineTimer: 0, acidTentacleTimer: 0 };
      }
      if (p.status.acidTentacleTimer > 0) {
        const prevTent = p.status.acidTentacleTimer;
        p.status.acidTentacleTimer = Math.max(0, Math.min(2.0, p.status.acidTentacleTimer) - dt);
        if (prevTent > 0 && p.status.acidTentacleTimer === 0) {
          showFloater("🐙 BROKE FREE OF ACID TENTACLE!", p.x, p.y - 32 - (p.z || 0), '#e879f9');
          updateHud();
        }
      }
    }

    // Update Purple Acid Tentacles (present at 10-15% of acid tiles)
    if (Array.isArray(state.acidTentacles) && state.acidTentacles.length > 0 && p) {
      for (let i = 0; i < state.acidTentacles.length; i++) {
        const tent = state.acidTentacles[i];
        tent.phase = (tent.phase || 0) + dt * 2.4;
        if (tent.cooldown > 0) tent.cooldown = Math.max(0, tent.cooldown - dt);

        if (tent.state === 'ensnaring') {
          tent.timer = Math.max(0, (tent.timer || 0) - dt);
          if (tent.timer <= 0 || (p.status && p.status.acidTentacleTimer <= 0)) {
            tent.state = 'lurking';
          }
        } else if (tent.cooldown <= 0 && (!p.status || !p.status.acidTentacleTimer) && (!p.status || !p.status.vineTimer)) {
          const dist = Math.hypot(p.x - tent.x, p.y - tent.y);
          if (dist < 36 && (p.z || 0) < 12) {
            tent.state = 'ensnaring';
            tent.timer = 2.0;
            tent.cooldown = 7.5;
            p.status.acidTentacleTimer = 2.0;
            if (typeof audio !== 'undefined' && audio && typeof audio.playSfx === 'function') {
              audio.playSfx('web_spray');
            }
            if (typeof spawnWaterRipple === 'function') {
              spawnWaterRipple(tent.x, tent.y, 'rgba(217, 70, 239, 0.85)', 36);
            }
            if (typeof createSparks === 'function') {
              createSparks(p.x, p.y, 16, '#d946ef');
            }
            showFloater("🐙 ACID TENTACLE ENSNARED! (2.0s)", p.x, p.y - 34 - (p.z || 0), '#e879f9');
            showToast("PURPLE ACID TENTACLE: ENSNARED FOR 2 SECONDS!");
            updateHud();
          }
        }
      }
    }

    // Keep non-boss floor ensnaring ground vines active & responsive (never splice/delete on pass)
    if (!state.boss && Array.isArray(state.bossVines) && state.bossVines.length > 0 && p) {
      for (let i = 0; i < state.bossVines.length; i++) {
        const v = state.bossVines[i];
        if (!Number.isFinite(v.cooldown)) v.cooldown = 0;
        if (!Number.isFinite(v.lashingAnim)) v.lashingAnim = 0;
        const dPlayer = Math.hypot(p.x - v.x, p.y - v.y);
        if (dPlayer < (v.radius || 24) + 14 && p.status && p.status.vineTimer > 0) {
          v.lashingAnim = Math.max(v.lashingAnim, 0.35);
        }
      }
    }
  };

  // Hook render() so purple acid tentacles and 2.5D foreground crowns render seamlessly
  const _preDepthRender = render;
  render = function () {
    _preDepthRender();
    if (!state || state.cinematicEnding || state.act > 0) return;
    const now = performance.now();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const viewW = canvas.width / dpr;
    const viewH = canvas.height / dpr;

    ctx.save();
    try {
      ctx.scale(dpr, dpr);
      ctx.translate(
        Math.round(viewW * 0.5 - state.camera.x),
        Math.round(viewH * 0.5 - state.camera.y)
      );
      // Draw Purple Acid Tentacles emerging from 10-15% of acid tiles
      if (Array.isArray(state.acidTentacles)) {
        for (let i = 0; i < state.acidTentacles.length; i++) {
          drawAcidTentacle(state.acidTentacles[i], now);
        }
      }
      // Render 2.5D foreground canopy/roof occlusion crowns over characters walking behind tall structures
      renderForeground3DOcclusionCrowns(now);
    } finally {
      ctx.restore();
    }
  };

  // -------------------------------------------------------------
  // D2. ARCHITECTURAL DUNGEON VARIETY, BIG ROOMS, DIVERSE HALLWAYS,
  //     CYCLE MUTATIONS & SINGLE FARTHEST PROGRESSION STAIRWAY
  // -------------------------------------------------------------
  const ARCHETYPE_NAMES = [
    'PILLARED GREAT HALL & COLONNADE',
    'ABYSSAL RIVER GORGE & CHAIN-BRIDGES',
    'OCTAGONAL ROTUNDA CITADEL',
    'CRUCIFORM CATHEDRAL & OVERLOOKS',
    'TERRACED QUARRY & ROOT CAVERNS'
  ];

  function isProtectedSpecialTile(t) {
    return (
      t === T_DOOR_PREV ||
      t === T_DOOR_EXIT ||
      t === T_STARTER_SWORD ||
      t === T_FORGE_ANVIL ||
      t === T_LORE_OBELISK ||
      t === T_CHEST_ALCOVE ||
      t === T_WALL_SECRET ||
      t === T_STAIRS_RAMP ||
      t === T_BRIDGE_CHAIN ||
      t === T_SPIKE_TRAP ||
      t === T_TREE_CLIMB ||
      t === T_TREEHOUSE_FLOOR ||
      t === T_TREEHOUSE_NPC ||
      t === T_TRASH_HUT
    );
  }

  function isInsideProtectedVaultOrLandmark(r, c) {
    if (!state || !state.map) return false;
    // Protect all hidden loot vaults (state.secretVaults) + 2-tile approach margin
    if (Array.isArray(state.secretVaults)) {
      for (let i = 0; i < state.secretVaults.length; i++) {
        const v = state.secretVaults[i];
        if (!v) continue;
        const vx = Number.isFinite(v.vx) ? v.vx : v.x;
        const vy = Number.isFinite(v.vy) ? v.vy : v.y;
        const vw = Number.isFinite(v.vw) ? v.vw : v.w;
        const vh = Number.isFinite(v.vh) ? v.vh : v.h;
        if (Number.isFinite(vx) && Number.isFinite(vy) && Number.isFinite(vw) && Number.isFinite(vh)) {
          if (r >= vy - 2 && r <= vy + vh + 1 && c >= vx - 2 && c <= vx + vw + 1) return true;
        }
        if (Number.isFinite(v.breachY) && Number.isFinite(v.breachX)) {
          if (Math.abs(r - v.breachY) <= 2 && Math.abs(c - v.breachX) <= 2) return true;
        }
      }
    }
    // Protect 2-tile radius around Player, Minion, Floor Start Spawn, and all Room Checkpoints
    if (state.player) {
      const pr = Math.floor(state.player.y / TILE_SIZE);
      const pc = Math.floor(state.player.x / TILE_SIZE);
      if (Math.abs(r - pr) <= 2 && Math.abs(c - pc) <= 2) return true;
    }
    if (state.minion) {
      const mr = Math.floor(state.minion.y / TILE_SIZE);
      const mc = Math.floor(state.minion.x / TILE_SIZE);
      if (Math.abs(r - mr) <= 1 && Math.abs(c - mc) <= 1) return true;
    }
    if (Array.isArray(state.rooms)) {
      for (let i = 0; i < state.rooms.length; i++) {
        const rm = state.rooms[i];
        if (rm && rm.savePoint) {
          const sr = Math.floor(rm.savePoint.y / TILE_SIZE);
          const sc = Math.floor(rm.savePoint.x / TILE_SIZE);
          if (Math.abs(r - sr) <= 1 && Math.abs(c - sc) <= 1) return true;
        }
      }
    }
    // Protect 1-tile perimeter around any secret wall or chest alcove
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < DUNGEON_ROWS && nc >= 0 && nc < DUNGEON_COLS) {
          const nt = state.map[nr][nc];
          if (
            nt === T_WALL_SECRET ||
            nt === T_CHEST_ALCOVE ||
            nt === T_DOOR_PREV ||
            nt === T_DOOR_EXIT ||
            nt === T_STARTER_SWORD ||
            nt === T_TREE_CLIMB
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  function canSafelyPlaceInteriorPillar(r, c) {
    if (!state || !state.map) return false;
    // Must have all 8 surrounding tiles walkable so a pillar never blocks a pathway or doorway
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr <= 1 || nr >= DUNGEON_ROWS - 2 || nc <= 1 || nc >= DUNGEON_COLS - 2) return false;
        const t = state.map[nr][nc];
        if (isWallTile(t) || t === T_ABYSS || isProtectedSpecialTile(t)) return false;
      }
    }
    return true;
  }

  function safeSetTile(r, c, newTile) {
    if (r <= 2 || r >= DUNGEON_ROWS - 3 || c <= 2 || c >= DUNGEON_COLS - 3) return;
    const cur = state.map[r][c];
    if (isProtectedSpecialTile(cur)) return;
    if (isInsideProtectedVaultOrLandmark(r, c)) return;
    // Do not overwrite Room 0 (spawn room)
    if (state.rooms && state.rooms[0]) {
      const rm0 = state.rooms[0];
      if (r >= rm0.y - 1 && r <= rm0.y + rm0.h && c >= rm0.x - 1 && c <= rm0.x + rm0.w) return;
    }
    // Never allow a pillar or abyss tile to pinch or block a narrow pathway
    if (isWallTile(newTile) || newTile === T_ABYSS) {
      if (!canSafelyPlaceInteriorPillar(r, c)) return;
    }
    state.map[r][c] = newTile;
    if (newTile === T_FLOOR_HIGH && state.heightMap && state.heightMap[r]) {
      state.heightMap[r][c] = 1;
    }
  }

  function carveVariedArchitecturalLayout(floorIdx, cycle, rng) {
    const archetype = (floorIdx + cycle * 3) % 5;
    state.floorArchetypeName = ARCHETYPE_NAMES[archetype];

    const midR = Math.floor(DUNGEON_ROWS / 2) + ((cycle + floorIdx) % 3) - 1;
    const midC = Math.floor(DUNGEON_COLS / 2) + ((cycle * 2 + floorIdx) % 5) - 2;

    if (archetype === 0) {
      // ARCHETYPE 0: Colossal Pillared Great Hall (18x12) with Load-Bearing Pillars & High Dais
      const hallW = 16 + (cycle % 4);
      const hallH = 10 + (floorIdx % 3);
      const r0 = Math.max(5, midR - Math.floor(hallH / 2));
      const c0 = Math.max(6, midC - Math.floor(hallW / 2));

      for (let r = r0; r < Math.min(DUNGEON_ROWS - 5, r0 + hallH); r++) {
        for (let c = c0; c < Math.min(DUNGEON_COLS - 6, c0 + hallW); c++) {
          safeSetTile(r, c, ((r + c) % 5 === 0) ? T_FLOOR_GRASS : T_FLOOR_COBBLE);
        }
      }
      // Symmetrical colonnade of 3D stone/root pillars inside the Great Hall (only where wide open)
      for (let r = r0 + 2; r <= r0 + hallH - 3; r += 3) {
        safeSetTile(r, c0 + 3, T_WALL_STONE);
        safeSetTile(r, c0 + hallW - 4, T_WALL_STONE);
        if (state.wallDecor && state.wallDecor[r]) {
          if (state.map[r][c0 + 3] === T_WALL_STONE) state.wallDecor[r][c0 + 3] = 'torch';
          if (state.map[r][c0 + hallW - 4] === T_WALL_STONE) state.wallDecor[r][c0 + hallW - 4] = 'torch';
        }
      }
      // Central Elevated Sanctuary Dais with Stepped Ramps
      for (let r = midR - 2; r <= midR + 2; r++) {
        for (let c = midC - 3; c <= midC + 3; c++) {
          safeSetTile(r, c, T_FLOOR_HIGH);
        }
      }
      safeSetTile(midR - 2, midC, T_STAIRS_RAMP);
      safeSetTile(midR + 2, midC, T_STAIRS_RAMP);
      safeSetTile(midR, midC - 3, T_STAIRS_RAMP);
      safeSetTile(midR, midC + 3, T_STAIRS_RAMP);

    } else if (archetype === 1) {
      // ARCHETYPE 1: Subterranean River Gorge with Twin Suspension Chain Bridges (always walkable liquid/bridges)
      const gorgeW = 18;
      const gorgeH = 12;
      const r0 = Math.max(5, midR - 6);
      const c0 = Math.max(6, midC - 9);

      for (let r = r0; r < Math.min(DUNGEON_ROWS - 5, r0 + gorgeH); r++) {
        for (let c = c0; c < Math.min(DUNGEON_COLS - 6, c0 + gorgeW); c++) {
          safeSetTile(r, c, T_FLOOR_GRASS);
        }
      }
      const riverTile = (floorIdx % 2 === 0) ? T_FLOOR_PUDDLE : T_FLOOR_SLUDGE;
      for (let c = c0 + 1; c < Math.min(DUNGEON_COLS - 6, c0 + gorgeW - 1); c++) {
        const waveR = midR + Math.round(Math.sin((c + cycle * 2) * 0.45) * 1.2);
        safeSetTile(waveR - 1, c, riverTile);
        safeSetTile(waveR, c, riverTile);
        // Twin 2-tile-wide timber & iron chain bridges spanning the gorge
        if (Math.abs(c - (midC - 4)) <= 1 || Math.abs(c - (midC + 4)) <= 1) {
          safeSetTile(waveR - 1, c, T_BRIDGE_CHAIN);
          safeSetTile(waveR, c, T_BRIDGE_CHAIN);
          safeSetTile(waveR - 2, c, T_FLOOR_COBBLE);
          safeSetTile(waveR + 1, c, T_FLOOR_COBBLE);
        }
      }

    } else if (archetype === 2) {
      // ARCHETYPE 2: Octagonal Vaulted Rotunda Citadel with Concentric Rings & Radial Spokes
      const outerRad = 7.5 + (cycle % 2);
      for (let r = Math.max(4, Math.floor(midR - outerRad)); r <= Math.min(DUNGEON_ROWS - 5, Math.ceil(midR + outerRad)); r++) {
        for (let c = Math.max(4, Math.floor(midC - outerRad)); c <= Math.min(DUNGEON_COLS - 5, Math.ceil(midC + outerRad)); c++) {
          const d = Math.hypot(r - midR, c - midC);
          if (d <= outerRad) {
            if (Math.abs(d - 4.2) < 0.65 && Math.abs(r - midR) > 2 && Math.abs(c - midC) > 2) {
              safeSetTile(r, c, T_WALL_STONE);
              if (state.wallDecor && state.wallDecor[r] && state.map[r][c] === T_WALL_STONE) {
                state.wallDecor[r][c] = ((r + c) % 2 === 0) ? 'torch' : 'chain';
              }
            } else if (d < 2.2) {
              safeSetTile(r, c, (cycle % 2 === 0) ? T_FLOOR_PUDDLE : T_FLOOR_SLUDGE);
            } else {
              safeSetTile(r, c, T_FLOOR_COBBLE);
            }
          }
        }
      }

    } else if (archetype === 3) {
      // ARCHETYPE 3: Cruciform Grand Cathedral Nave & Transept with Elevated Overlook Balconies
      for (let r = midR - 3; r <= midR + 3; r++) {
        for (let c = Math.max(5, midC - 11); c <= Math.min(DUNGEON_COLS - 6, midC + 11); c++) {
          safeSetTile(r, c, T_FLOOR_COBBLE);
        }
      }
      for (let r = Math.max(4, midR - 8); r <= Math.min(DUNGEON_ROWS - 5, midR + 8); r++) {
        for (let c = midC - 4; c <= midC + 4; c++) {
          safeSetTile(r, c, T_FLOOR_COBBLE);
        }
      }
      const corners = [
        [midR - 5, midC - 7],
        [midR - 5, midC + 5],
        [midR + 4, midC - 7],
        [midR + 4, midC + 5]
      ];
      corners.forEach(([cr, cc]) => {
        for (let dr = 0; dr < 2; dr++) {
          for (let dc = 0; dc < 3; dc++) {
            safeSetTile(cr + dr, cc + dc, T_FLOOR_HIGH);
          }
        }
        safeSetTile(cr + 1, cc + 1, T_STAIRS_RAMP);
      });

    } else {
      // ARCHETYPE 4: Multi-Tiered Terraced Quarry & Winding Overgrown Root Caverns
      const numBlobs = 4 + (cycle % 3);
      for (let b = 0; b < numBlobs; b++) {
        const ang = (b / numBlobs) * Math.PI * 2 + (cycle * 0.7 + floorIdx * 0.4);
        const br = Math.round(midR + Math.sin(ang) * 6);
        const bc = Math.round(midC + Math.cos(ang) * 9);
        const rad = 4.5 + (b % 2) * 1.5;
        for (let r = br - 5; r <= br + 5; r++) {
          for (let c = bc - 5; c <= bc + 5; c++) {
            if (Math.hypot(r - br, c - bc) <= rad) {
              safeSetTile(r, c, (b % 2 === 0) ? T_FLOOR_GRASS : T_FLOOR_TRASH);
            }
          }
        }
      }
    }

    // Carve Cohesive Multi-Cell Connected Water Ponds & Acid Ponds in Non-Spawn Chambers
    if (Array.isArray(state.rooms) && state.rooms.length > 2) {
      for (let i = 1; i < state.rooms.length; i++) {
        const rm = state.rooms[i];
        if (!rm || rm.w < 7 || rm.h < 7) continue;
        const rCenter = rm.y + Math.floor(rm.h * 0.5);
        const cCenter = rm.x + Math.floor(rm.w * 0.5);
        if (i % 3 === 1) {
          // Cohesive 2x3 Connected Acid Pond (T_FLOOR_SLUDGE)
          for (let dr = -1; dr <= 0; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              safeSetTile(rCenter + dr, cCenter + dc, T_FLOOR_SLUDGE);
            }
          }
        } else if (i % 3 === 2) {
          // Cohesive 2x3 Connected Water Pond (T_FLOOR_PUDDLE)
          for (let dr = 0; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              safeSetTile(rCenter + dr, cCenter + dc, T_FLOOR_PUDDLE);
            }
          }
        }
      }
    }

    // Carve Varied Hallways Between Rooms (Wide Colonnades, Root Tunnels & Canal Causeways — never placing blocking walls)
    if (Array.isArray(state.rooms) && state.rooms.length > 1) {
      for (let i = 0; i < state.rooms.length - 1; i++) {
        const rmA = state.rooms[i];
        const rmB = state.rooms[(i + 1 + (cycle % 2)) % state.rooms.length];
        if (!rmA || !rmB) continue;
        const rmACx = Number.isFinite(rmA.cx) ? rmA.cx : (rmA.x + Math.floor(rmA.w / 2));
        const rmACy = Number.isFinite(rmA.cy) ? rmA.cy : (rmA.y + Math.floor(rmA.h / 2));
        const rmBCx = Number.isFinite(rmB.cx) ? rmB.cx : (rmB.x + Math.floor(rmB.w / 2));
        const hallStyle = (i + floorIdx + cycle) % 3;
        const cStart = Math.min(rmACx, rmBCx);
        const cEnd = Math.max(rmACx, rmBCx);

        for (let c = cStart; c <= cEnd; c++) {
          if (hallStyle === 0) {
            safeSetTile(rmACy - 1, c, T_FLOOR_COBBLE);
            safeSetTile(rmACy, c, T_FLOOR_COBBLE);
            safeSetTile(rmACy + 1, c, T_FLOOR_COBBLE);
          } else if (hallStyle === 1) {
            safeSetTile(rmACy - 1, c, T_FLOOR_GRASS);
            safeSetTile(rmACy, c, T_FLOOR_COBBLE);
            safeSetTile(rmACy + 1, c, T_FLOOR_GRASS);
          } else {
            safeSetTile(rmACy - 1, c, T_FLOOR_COBBLE);
            safeSetTile(rmACy, c, T_FLOOR_COBBLE);
            if (c % 3 === 0) safeSetTile(rmACy + 1, c, T_FLOOR_PUDDLE);
          }
        }
      }
    }

    // Populate 3D Ensnaring Ground Vines (`state.bossVines`) Across the Dungeon
    if (!state.boss) {
      state.bossVines = [];
    } else if (!Array.isArray(state.bossVines)) {
      state.bossVines = [];
    }
    const startX = state.floorStartSpawn ? state.floorStartSpawn.x : TILE_SIZE * 5;
    const startY = state.floorStartSpawn ? state.floorStartSpawn.y : TILE_SIZE * 5;
    const curPx = state.player ? state.player.x : startX;
    const curPy = state.player ? state.player.y : startY;
    let addedVines = 0;
    const targetVines = 8 + (floorIdx % 5) + Math.min(6, cycle);

    for (let attempt = 0; attempt < 90 && addedVines < targetVines; attempt++) {
      const r = 4 + Math.floor(rng() * (DUNGEON_ROWS - 8));
      const c = 4 + Math.floor(rng() * (DUNGEON_COLS - 8));
      const t = state.map[r][c];
      if (t !== T_FLOOR_GRASS && t !== T_FLOOR_COBBLE) continue;
      const wx = (c + 0.5) * TILE_SIZE;
      const wy = (r + 0.5) * TILE_SIZE;
      if (Math.hypot(wx - startX, wy - startY) < 220) continue;
      if (Math.hypot(wx - curPx, wy - curPy) < 200) continue;

      state.bossVines.push({
        x: wx,
        y: wy,
        radius: 24,
        hp: 120 + floorIdx * 15,
        maxHp: 120 + floorIdx * 15,
        phase: rng() * Math.PI * 2,
        cooldown: 0,
        lashingAnim: 0
      });
      addedVines++;
    }
  }

  // Guarantee that every room, hidden loot vault (`state.secretVaults`), and chest alcove
  // has an unobstructed walkable pathway from the player spawn, and clear any blocking props in hallways
  function ensureAllPathwaysAndLootAccessible() {
    if (!state || !state.map) return;

    // 1. Verify and repair all Hidden Loot Vaults (`state.secretVaults`)
    if (Array.isArray(state.secretVaults)) {
      for (let i = 0; i < state.secretVaults.length; i++) {
        const v = state.secretVaults[i];
        if (!v) continue;
        const vx = Number.isFinite(v.vx) ? v.vx : v.x;
        const vy = Number.isFinite(v.vy) ? v.vy : v.y;
        const vw = Number.isFinite(v.vw) ? v.vw : v.w;
        const vh = Number.isFinite(v.vh) ? v.vh : v.h;
        if (Number.isFinite(vx) && Number.isFinite(vy) && Number.isFinite(vw) && Number.isFinite(vh)) {
          for (let r = vy; r < vy + vh; r++) {
            for (let c = vx; c < vx + vw; c++) {
              if (r > 0 && r < DUNGEON_ROWS - 1 && c > 0 && c < DUNGEON_COLS - 1) {
                if (state.map[r][c] !== T_CHEST_ALCOVE) {
                  state.map[r][c] = T_FLOOR_HIGH;
                }
                if (state.heightMap && state.heightMap[r]) {
                  state.heightMap[r][c] = 1;
                }
              }
            }
          }
        }
        if (Number.isFinite(v.chestY) && Number.isFinite(v.chestX)) {
          state.map[v.chestY][v.chestX] = T_CHEST_ALCOVE;
        }
        if (Number.isFinite(v.breachY) && Number.isFinite(v.breachX)) {
          if (!v.revealed) {
            state.map[v.breachY][v.breachX] = T_WALL_SECRET;
          } else if (isWallTile(state.map[v.breachY][v.breachX])) {
            state.map[v.breachY][v.breachX] = T_FLOOR_COBBLE;
          }
          // Ensure the tile immediately outside the secret wall is walkable floor
          if (v.dir) {
            const approachR = clamp(v.breachY - v.dir.dy, 2, DUNGEON_ROWS - 3);
            const approachC = clamp(v.breachX - v.dir.dx, 2, DUNGEON_COLS - 3);
            if (isWallTile(state.map[approachR][approachC]) || state.map[approachR][approachC] === T_ABYSS) {
              state.map[approachR][approachC] = T_FLOOR_COBBLE;
            }
          }
        }
      }
    }

    // 2. Ensure Player's Current Position & Spawn Anchor Are Walkable
    const anchorX = state.floorStartSpawn ? state.floorStartSpawn.x : TILE_SIZE * 6;
    const anchorY = state.floorStartSpawn ? state.floorStartSpawn.y : TILE_SIZE * 6;
    const startR = clamp(Math.floor(anchorY / TILE_SIZE), 2, DUNGEON_ROWS - 3);
    const startC = clamp(Math.floor(anchorX / TILE_SIZE), 2, DUNGEON_COLS - 3);
    if (isWallTile(state.map[startR][startC]) || state.map[startR][startC] === T_ABYSS) {
      state.map[startR][startC] = T_FLOOR_COBBLE;
    }

    if (state.player) {
      const pr = clamp(Math.floor(state.player.y / TILE_SIZE), 2, DUNGEON_ROWS - 3);
      const pc = clamp(Math.floor(state.player.x / TILE_SIZE), 2, DUNGEON_COLS - 3);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = pr + dr;
          const nc = pc + dc;
          if (nr > 1 && nr < DUNGEON_ROWS - 2 && nc > 1 && nc < DUNGEON_COLS - 2) {
            if (isWallTile(state.map[nr][nc]) || state.map[nr][nc] === T_ABYSS) {
              state.map[nr][nc] = T_FLOOR_COBBLE;
            }
          }
        }
      }
      if (typeof getWorldElevation === 'function') {
        state.player.z = getWorldElevation(state.player.x, state.player.y);
      }
    }

    const computeReachable = () => {
      const visited = Array.from({ length: DUNGEON_ROWS }, () => new Uint8Array(DUNGEON_COLS));
      const q = [[startR, startC]];
      visited[startR][startC] = 1;
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      let head = 0;
      while (head < q.length) {
        const [r, c] = q[head++];
        for (let d = 0; d < 4; d++) {
          const nr = r + dirs[d][0];
          const nc = c + dirs[d][1];
          if (nr <= 1 || nr >= DUNGEON_ROWS - 2 || nc <= 1 || nc >= DUNGEON_COLS - 2) continue;
          if (visited[nr][nc]) continue;
          const t = state.map[nr][nc];
          if (isWallTile(t) || t === T_ABYSS) continue;
          visited[nr][nc] = 1;
          q.push([nr, nc]);
        }
      }
      return visited;
    };

    const carveTunnelBetween = (r1, c1, r2, c2) => {
      let cr = r1;
      let cc = c1;
      while (cc !== c2) {
        cc += (c2 > cc) ? 1 : -1;
        if (cr > 1 && cr < DUNGEON_ROWS - 2 && cc > 1 && cc < DUNGEON_COLS - 2) {
          if (isWallTile(state.map[cr][cc]) || state.map[cr][cc] === T_ABYSS) {
            state.map[cr][cc] = T_FLOOR_COBBLE;
          }
        }
      }
      while (cr !== r2) {
        cr += (r2 > cr) ? 1 : -1;
        if (cr > 1 && cr < DUNGEON_ROWS - 2 && cc > 1 && cc < DUNGEON_COLS - 2) {
          if (isWallTile(state.map[cr][cc]) || state.map[cr][cc] === T_ABYSS) {
            state.map[cr][cc] = T_FLOOR_COBBLE;
          }
        }
      }
    };

    let visited = computeReachable();

    // Ensure player position is reachable from startR, startC
    if (state.player) {
      const pr = clamp(Math.floor(state.player.y / TILE_SIZE), 2, DUNGEON_ROWS - 3);
      const pc = clamp(Math.floor(state.player.x / TILE_SIZE), 2, DUNGEON_COLS - 3);
      if (!visited[pr][pc]) {
        carveTunnelBetween(startR, startC, pr, pc);
        visited = computeReachable();
      }
    }

    // Check every room center
    if (Array.isArray(state.rooms)) {
      for (let i = 0; i < state.rooms.length; i++) {
        const rm = state.rooms[i];
        if (!rm) continue;
        const rCy = clamp(Number.isFinite(rm.cy) ? rm.cy : (rm.y + Math.floor(rm.h / 2)), 2, DUNGEON_ROWS - 3);
        const rCx = clamp(Number.isFinite(rm.cx) ? rm.cx : (rm.x + Math.floor(rm.w / 2)), 2, DUNGEON_COLS - 3);
        if (!visited[rCy][rCx]) {
          carveTunnelBetween(startR, startC, rCy, rCx);
          visited = computeReachable();
        }
        if (typeof findSafeSavePointInRoom === 'function') {
          rm.savePoint = findSafeSavePointInRoom(rm);
        }
      }
    }

    // Check every secret vault approach tile
    if (Array.isArray(state.secretVaults)) {
      for (let i = 0; i < state.secretVaults.length; i++) {
        const v = state.secretVaults[i];
        if (!v || !v.dir || !Number.isFinite(v.breachY) || !Number.isFinite(v.breachX)) continue;
        const appR = clamp(v.breachY - v.dir.dy, 2, DUNGEON_ROWS - 3);
        const appC = clamp(v.breachX - v.dir.dx, 2, DUNGEON_COLS - 3);
        if (!visited[appR][appC]) {
          carveTunnelBetween(startR, startC, appR, appC);
          visited = computeReachable();
        }
      }
    }
  }

  // Spawn Purple Acid Tentacles at 10-15% (~12.5%) of all T_FLOOR_SLUDGE tiles on the floor
  function spawnAcidTentaclesForFloor(floorIdx, cycle, rng) {
    state.acidTentacles = [];
    if (!state || !state.map) return;

    const startX = state.floorStartSpawn ? state.floorStartSpawn.x : TILE_SIZE * 5;
    const startY = state.floorStartSpawn ? state.floorStartSpawn.y : TILE_SIZE * 5;
    const curPx = state.player ? state.player.x : startX;
    const curPy = state.player ? state.player.y : startY;
    const candidateAcidTiles = [];

    for (let r = 2; r < DUNGEON_ROWS - 2; r++) {
      for (let c = 2; c < DUNGEON_COLS - 2; c++) {
        if (state.map[r][c] === T_FLOOR_SLUDGE) {
          const wx = c * TILE_SIZE + 32;
          const wy = r * TILE_SIZE + 32;
          if (Math.hypot(wx - startX, wy - startY) > 160 && Math.hypot(wx - curPx, wy - curPy) > 160) {
            candidateAcidTiles.push({ r, c, wx, wy });
          }
        }
      }
    }

    for (let i = 0; i < candidateAcidTiles.length; i++) {
      // 12.5% probability (right in the middle of 10-15% of acid locations!)
      if (rng() < 0.125) {
        const cell = candidateAcidTiles[i];
        state.acidTentacles.push({
          tx: cell.c,
          ty: cell.r,
          x: cell.wx,
          y: cell.wy,
          phase: rng() * Math.PI * 2,
          state: 'lurking',
          timer: 0,
          cooldown: 0
        });
      }
    }

    // Guarantee at least 1 tentacle if the floor has >= 6 acid tiles and RNG happened to roll 0
    if (state.acidTentacles.length === 0 && candidateAcidTiles.length >= 6) {
      const pick = candidateAcidTiles[Math.floor(rng() * candidateAcidTiles.length)];
      state.acidTentacles.push({
        tx: pick.c,
        ty: pick.r,
        x: pick.wx,
        y: pick.wy,
        phase: rng() * Math.PI * 2,
        state: 'lurking',
        timer: 0,
        cooldown: 0
      });
    }
  }

  // Enforce EXACTLY ONE Progression Stairway (`T_DOOR_EXIT`) Placed at the
  // Farthest Reachable Point from the Return-to-Previous-Level Stairway (`T_DOOR_PREV`)
  function enforceSingleFarthestProgressionStairway() {
    if (!state || !state.map) return;

    // 1. Strip any existing T_DOOR_EXIT tiles from the map
    for (let r = 0; r < DUNGEON_ROWS; r++) {
      for (let c = 0; c < DUNGEON_COLS; c++) {
        if (state.map[r][c] === T_DOOR_EXIT) {
          state.map[r][c] = T_FLOOR_COBBLE;
        }
      }
    }
    state.exitPorts = [];

    // 2. Determine anchor point (T_DOOR_PREV if present, otherwise player spawn)
    const anchorX = state.prevPort
      ? state.prevPort.x
      : (state.floorStartSpawn ? state.floorStartSpawn.x : TILE_SIZE * 6);
    const anchorY = state.prevPort
      ? state.prevPort.y
      : (state.floorStartSpawn ? state.floorStartSpawn.y : TILE_SIZE * 6);
    const startR = clamp(Math.floor(anchorY / TILE_SIZE), 2, DUNGEON_ROWS - 3);
    const startC = clamp(Math.floor(anchorX / TILE_SIZE), 2, DUNGEON_COLS - 3);

    // 3. Run BFS shortest-path flood fill across walkable tiles from T_DOOR_PREV
    //    so we find the TRUE farthest reachable tile in the dungeon!
    const distGrid = Array.from({ length: DUNGEON_ROWS }, () => new Int32Array(DUNGEON_COLS).fill(-1));
    const queue = [[startR, startC]];
    distGrid[startR][startC] = 0;

    let bestR = startR;
    let bestC = startC;
    let bestScore = -1;

    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    let head = 0;
    while (head < queue.length) {
      const [r, c] = queue[head++];
      const d = distGrid[r][c];

      for (let i = 0; i < 4; i++) {
        const nr = r + dirs[i][0];
        const nc = c + dirs[i][1];
        if (nr <= 2 || nr >= DUNGEON_ROWS - 3 || nc <= 2 || nc >= DUNGEON_COLS - 3) continue;
        if (distGrid[nr][nc] !== -1) continue;

        const tile = state.map[nr][nc];
        if (isWallTile(tile) || tile === T_ABYSS) continue;

        distGrid[nr][nc] = d + 1;
        queue.push([nr, nc]);

        // Candidate check: must not overwrite special tiles or sit right next to return door or current player position
        if (!isProtectedSpecialTile(tile) && tile !== T_FLOOR_PUDDLE && tile !== T_FLOOR_SLUDGE) {
          const wx = (nc + 0.5) * TILE_SIZE;
          const wy = (nr + 0.5) * TILE_SIZE;
          const euclid = Math.hypot(wx - anchorX, wy - anchorY);
          const distFromPlayer = state.player ? Math.hypot(wx - state.player.x, wy - state.player.y) : 9999;
          if (euclid > TILE_SIZE * 4 && distFromPlayer > TILE_SIZE * 2.5) {
            const combinedScore = d * TILE_SIZE * 0.65 + euclid * 0.35;
            if (combinedScore > bestScore) {
              bestScore = combinedScore;
              bestR = nr;
              bestC = nc;
            }
          }
        }
      }
    }

    // Fallback to farthest room center if BFS was constrained
    if (bestScore < 0 && Array.isArray(state.rooms) && state.rooms.length > 0) {
      let maxD = -1;
      for (let i = 0; i < state.rooms.length; i++) {
        const rm = state.rooms[i];
        const rmCx = Number.isFinite(rm.cx) ? rm.cx : (rm.x + Math.floor(rm.w / 2));
        const rmCy = Number.isFinite(rm.cy) ? rm.cy : (rm.y + Math.floor(rm.h / 2));
        const d = Math.hypot(rmCx * TILE_SIZE - anchorX, rmCy * TILE_SIZE - anchorY);
        if (d > maxD) {
          maxD = d;
          bestR = clamp(rmCy, 3, DUNGEON_ROWS - 4);
          bestC = clamp(rmCx, 3, DUNGEON_COLS - 4);
        }
      }
    }

    // 4. Carve a clear 3x3 Royal Staircase Landing around the single farthest point
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = bestR + dr;
        const cc = bestC + dc;
        if (!isProtectedSpecialTile(state.map[rr][cc])) {
          state.map[rr][cc] = T_FLOOR_COBBLE;
        }
      }
    }

    state.map[bestR][bestC] = T_DOOR_EXIT;
    const singleExitPort = {
      x: (bestC + 0.5) * TILE_SIZE,
      y: (bestR + 0.5) * TILE_SIZE,
      r: bestR,
      c: bestC,
      label: 'NEXT FLOOR'
    };
    state.exitPorts = [singleExitPort];
    state.exitPos = { x: singleExitPort.x, y: singleExitPort.y };

    // 5. Recompute Wayfinder Path from Player Spawn to the Single Farthest Stairway
    if (typeof computeWayfinderPath === 'function' && state.floorStartSpawn) {
      const sCol = clamp(Math.floor(state.floorStartSpawn.x / TILE_SIZE), 1, DUNGEON_COLS - 2);
      const sRow = clamp(Math.floor(state.floorStartSpawn.y / TILE_SIZE), 1, DUNGEON_ROWS - 2);
      state.wayfinderPath = computeWayfinderPath(sCol, sRow, bestC, bestR);
    }
  }

  // Wrap generateDungeonFloor so every floor gets architectural variety, cycle mutation,
  // cohesive connected liquid bodies, 10-15% purple acid tentacles, unobstructed pathways, and EXACTLY ONE progression stairway!
  const _preVarietyGenerateDungeonFloor = generateDungeonFloor;
  generateDungeonFloor = function (floorIdx, entryDir = 'down') {
    _preVarietyGenerateDungeonFloor(floorIdx, entryDir);
    const fIdx = floorIdx || (state && state.currentFloor) || 1;
    const cycle = (state && state.cycle) || 1;
    const rng = mulberry32(fIdx * 918273 + cycle * 472882 + 1337);
    carveVariedArchitecturalLayout(fIdx, cycle, rng);
    ensureAllPathwaysAndLootAccessible();
    enforceSingleFarthestProgressionStairway();
    spawnAcidTentaclesForFloor(fIdx, cycle, rng);
    if (typeof window.scaleFloorCombatEntities === 'function') {
      window.scaleFloorCombatEntities();
    }
    if (typeof window.ensureRetroactiveBossMoves === 'function') {
      window.ensureRetroactiveBossMoves();
    }
  };

  // ============================================================================
  // PART 5: EVOLVING ADAPTIVE MULTI-SYNTH AI DUBSTEP, 404 BASS, METAL GUITAR
  //         SKIRMISH & DEATH-METAL BOSS AUDIO ENGINE
  // ============================================================================
  if (typeof audio !== 'undefined' && audio) {
    // 7 Distinct Musical Scales & Modes that evolve across floors and cycles
    const ADAPTIVE_SCALES = [
      { name: 'D_PHRYGIAN_DOM', root: 36.71, ratios: [1, 1.0595, 1.2599, 1.3348, 1.4983, 1.5874, 1.7818, 2] },
      { name: 'E_HARMONIC_MIN', root: 41.20, ratios: [1, 1.1225, 1.1892, 1.3348, 1.4983, 1.5874, 1.8877, 2] },
      { name: 'C_DORIAN_LIQUID', root: 32.70, ratios: [1, 1.1225, 1.1892, 1.3348, 1.4983, 1.6818, 1.7818, 2] },
      { name: 'FSHARP_LOCRIAN_METAL', root: 46.25, ratios: [1, 1.0595, 1.1892, 1.3348, 1.4142, 1.5874, 1.7818, 2] },
      { name: 'G_HUNGARIAN_MIN', root: 49.00, ratios: [1, 1.1225, 1.1892, 1.4142, 1.4983, 1.5874, 1.8877, 2] },
      { name: 'A_AEOLIAN_UPBEAT', root: 55.00, ratios: [1, 1.1225, 1.1892, 1.3348, 1.4983, 1.5874, 1.7818, 2] },
      { name: 'BB_DARK_LYDIAN', root: 58.27, ratios: [1, 1.1225, 1.2599, 1.4142, 1.4983, 1.6818, 1.8877, 2] }
    ];

    // 6 Synth Voices the AI cycles & blends
    const SYNTH_VOICES = ['growl_formant', 'neuro_reese', 'acid_303', 'cyber_fm', 'crystal_bell', 'supersaw_chord'];

    // Tube-Amp / Death-Metal Guitar Distortion Curve Cache
    audio._metalDistCurve = null;
    audio.getMetalDistortionCurve = function (drive = 65) {
      if (this._metalDistCurve && this._metalDistCurveDrive === drive) return this._metalDistCurve;
      const n = 2048;
      const curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i * 2) / n - 1;
        // Asymmetric high-gain tube clipping with tight low-end saturation
        curve[i] = Math.tanh(x * (drive * 0.12)) * 0.85 + Math.atan(x * drive) * 0.15;
      }
      this._metalDistCurve = curve;
      this._metalDistCurveDrive = drive;
      return curve;
    };

    // 1. ROLAND 404 SATURATED SUB / REESE GLIDE BASS SYNTH
    audio.trigger404Bass = function (t, freq, dur, glideFreq = null, grit = 0.5) {
      if (!this.ctx || !this.musicBus) return;
      const subOsc = this.ctx.createOscillator();
      const reeseA = this.ctx.createOscillator();
      const reeseB = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const shaper = this.ctx.createWaveShaper();
      const gain = this.ctx.createGain();

      subOsc.type = 'sine';
      reeseA.type = 'sawtooth';
      reeseB.type = 'triangle';

      subOsc.frequency.setValueAtTime(freq, t);
      reeseA.frequency.setValueAtTime(freq * 1.006, t);
      reeseB.frequency.setValueAtTime(freq * 0.994, t);

      if (glideFreq && glideFreq > 20) {
        subOsc.frequency.exponentialRampToValueAtTime(glideFreq, t + dur * 0.82);
        reeseA.frequency.exponentialRampToValueAtTime(glideFreq * 1.006, t + dur * 0.82);
        reeseB.frequency.exponentialRampToValueAtTime(glideFreq * 0.994, t + dur * 0.82);
      }

      // Warm SP-404 vinyl/tape saturation + resonant lowpass punch
      shaper.curve = this.getMetalDistortionCurve(14 + grit * 28);
      filter.type = 'lowpass';
      filter.Q.value = 4.2 + grit * 3.5;
      filter.frequency.setValueAtTime(160 + grit * 420, t);
      filter.frequency.exponentialRampToValueAtTime(68 + grit * 90, t + dur);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.34, t + 0.014);
      gain.gain.setValueAtTime(0.28, t + dur * 0.55);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      subOsc.connect(shaper);
      reeseA.connect(shaper);
      reeseB.connect(shaper);
      shaper.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicBus);

      subOsc.start(t);
      reeseA.start(t);
      reeseB.start(t);
      subOsc.stop(t + dur + 0.02);
      reeseA.stop(t + dur + 0.02);
      reeseB.stop(t + dur + 0.02);
    };

    // 2. DISTORTED METAL / DEATH-METAL ELECTRIC GUITAR ENGINE
    //    (Palm-Muted Power Chord Chugs, Tritone Death-Metal Shreds & Pinch Harmonics)
    audio.triggerMetalGuitarRiff = function (t, rootFreq, dur, style = 'palm_mute') {
      if (!this.ctx || !this.musicBus) return;
      const gRoot = rootFreq * 2; // Guitar register (E2–E3 range)
      const fifthRatio = (style === 'death_tritone') ? 1.4142 : 1.4983; // Diminished 5th tritone vs Power 5th
      const octRatio = 2.0;

      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const osc3 = this.ctx.createOscillator();
      const preFilter = this.ctx.createBiquadFilter();
      const ampShaper = this.ctx.createWaveShaper();
      const cabFilter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'sawtooth';
      osc3.type = (style === 'pinch_harmonic') ? 'square' : 'sawtooth';

      const baseF = (style === 'pinch_harmonic') ? gRoot * 2 : gRoot;
      osc1.frequency.setValueAtTime(baseF, t);
      osc2.frequency.setValueAtTime(baseF * fifthRatio, t);
      osc3.frequency.setValueAtTime(baseF * octRatio * 1.003, t);

      if (style === 'pinch_harmonic') {
        // Screaming vibrato pitch bend
        osc1.frequency.exponentialRampToValueAtTime(baseF * 1.06, t + dur * 0.5);
        osc1.frequency.exponentialRampToValueAtTime(baseF * 0.99, t + dur);
      }

      // Tight tube-screamer highpass before distortion
      preFilter.type = 'highpass';
      preFilter.frequency.value = 110;

      ampShaper.curve = this.getMetalDistortionCurve(style === 'palm_mute' ? 55 : 95);

      // 4x12 Guitar Cabinet Impulse Approximation (resonant mid-bite + 3.4kHz roll-off)
      cabFilter.type = 'lowpass';
      cabFilter.Q.value = (style === 'palm_mute') ? 2.4 : 4.2;
      cabFilter.frequency.setValueAtTime(style === 'palm_mute' ? 980 : 2850, t);
      if (style === 'palm_mute') {
        cabFilter.frequency.exponentialRampToValueAtTime(340, t + dur * 0.85);
      }

      const peakVol = (style === 'palm_mute') ? 0.22 : 0.27;
      const envDur = (style === 'palm_mute') ? Math.min(dur, 0.13) : dur;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(peakVol, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + envDur);

      osc1.connect(preFilter);
      osc2.connect(preFilter);
      osc3.connect(preFilter);
      preFilter.connect(ampShaper);
      ampShaper.connect(cabFilter);
      cabFilter.connect(gain);
      gain.connect(this.musicBus);
      if (this.reverbSend && style !== 'palm_mute') {
        gain.connect(this.reverbSend);
      }

      osc1.start(t);
      osc2.start(t);
      osc3.start(t);
      osc1.stop(t + envDur + 0.02);
      osc2.stop(t + envDur + 0.02);
      osc3.stop(t + envDur + 0.02);
    };

    // 3. MULTI-ARTICULATION SNARE & CYMBAL ENGINE
    //    (404 Rimshot, Crisp Electronic 909, Acoustic Metal Guitar Snare & China Trash Crash)
    audio.triggerVariedSnare = function (t, snareType = 'electronic', pan = 0) {
      if (!this.ctx || !this.musicBus) return;

      // Tonal drum shell fundamental
      const shellOsc = this.ctx.createOscillator();
      const shellGain = this.ctx.createGain();
      shellOsc.type = (snareType === 'metal') ? 'triangle' : 'sine';

      if (snareType === 'rimshot_404') {
        shellOsc.frequency.setValueAtTime(390, t);
        shellOsc.frequency.exponentialRampToValueAtTime(145, t + 0.055);
        shellGain.gain.setValueAtTime(0.24, t);
        shellGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.065);
      } else if (snareType === 'metal') {
        // High-tension bronze/steel metal snare shell (245Hz -> 125Hz with ring)
        shellOsc.frequency.setValueAtTime(255, t);
        shellOsc.frequency.exponentialRampToValueAtTime(128, t + 0.11);
        shellGain.gain.setValueAtTime(0.46, t);
        shellGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      } else {
        // Heavy dubstep snare punch
        shellOsc.frequency.setValueAtTime(220, t);
        shellOsc.frequency.exponentialRampToValueAtTime(92, t + 0.11);
        shellGain.gain.setValueAtTime(0.42, t);
        shellGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      }

      shellOsc.connect(shellGain);
      shellGain.connect(this.musicBus);
      shellOsc.start(t);
      shellOsc.stop(t + 0.15);

      // Snare wire / China cymbal noise burst
      const noiseDur = (snareType === 'china_crash') ? 0.42 : (snareType === 'rimshot_404' ? 0.08 : 0.24);
      const bufSize = Math.floor(this.ctx.sampleRate * noiseDur);
      const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, snareType === 'china_crash' ? 1.15 : 1.7);
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = (snareType === 'china_crash') ? 'bandpass' : 'highpass';
      filter.frequency.value = (snareType === 'china_crash') ? 3200 : (snareType === 'metal' ? 1150 : 880);
      filter.Q.value = (snareType === 'china_crash') ? 2.2 : 1.4;

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(snareType === 'rimshot_404' ? 0.16 : 0.34, t);
      nGain.gain.exponentialRampToValueAtTime(0.0001, t + noiseDur);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.musicBus);
      if (this.reverbSend && snareType !== 'rimshot_404') {
        nGain.connect(this.reverbSend);
      }
      noise.start(t);
    };

    // 4. MULTI-SYNTH MELODIC & HARMONIC VOICE ENGINE
    audio.triggerMultiSynthVoice = function (t, freq, dur, synthType = 'cyber_fm', pan = 0) {
      if (!this.ctx || !this.musicBus) return;
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      if (synthType === 'acid_303') {
        // Squelchy Roland TB-303 Acid resonant saw/square synth
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq * 2, t);
        filter.type = 'lowpass';
        filter.Q.value = 12.5;
        filter.frequency.setValueAtTime(2400, t);
        filter.frequency.exponentialRampToValueAtTime(240, t + dur * 0.9);
        gain.gain.setValueAtTime(0.16, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicBus);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      } else if (synthType === 'crystal_bell') {
        // Softer exploration ambient FM glass bell / kalimba
        const carrier = this.ctx.createOscillator();
        const mod = this.ctx.createOscillator();
        const modGain = this.ctx.createGain();
        carrier.type = 'sine';
        mod.type = 'sine';
        carrier.frequency.setValueAtTime(freq * 4, t);
        mod.frequency.setValueAtTime(freq * 14, t);
        modGain.gain.setValueAtTime(freq * 2.5, t);
        modGain.gain.exponentialRampToValueAtTime(0.1, t + dur * 0.6);

        gain.gain.setValueAtTime(0.13, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        mod.connect(modGain);
        modGain.connect(carrier.frequency);
        carrier.connect(gain);
        gain.connect(this.musicBus);
        if (this.reverbSend) gain.connect(this.reverbSend);
        carrier.start(t);
        mod.start(t);
        carrier.stop(t + dur + 0.02);
        mod.stop(t + dur + 0.02);
      } else if (synthType === 'supersaw_chord') {
        // Upbeat detuned 3-oscillator Supersaw minor-9th stab
        const ratios = [1, 1.1892, 1.4983];
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(3200, t);
        filter.frequency.exponentialRampToValueAtTime(650, t + dur);
        gain.gain.setValueAtTime(0.11, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        filter.connect(gain);
        gain.connect(this.musicBus);
        if (this.reverbSend) gain.connect(this.reverbSend);

        ratios.forEach((rat, idx) => {
          const o = this.ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(freq * 2 * rat * (1 + (idx - 1) * 0.005), t);
          o.connect(filter);
          o.start(t);
          o.stop(t + dur + 0.02);
        });
      } else {
        // Cyber-FM / Neuro lead
        this.triggerArpPluck(t, freq * 2, dur, pan);
      }
    };

    // Bridge & Synth Voice Helpers for Kick, HiHat, ArpPluck, WobbleBass, and DarkPad
    audio.triggerKick = function (t, boost = 1.0) {
      if (typeof this.playSmoothKick === 'function') {
        this.playSmoothKick(t, Math.min(0.55, 0.36 * boost));
      }
      if (this.subGain) {
        this.subGain.gain.setTargetAtTime(0.05, t, 0.010);
        this.subGain.gain.setTargetAtTime(0.22 * boost, t + 0.065, 0.045);
      }
    };

    audio.triggerHiHat = function (t, isOpen = false, pan = 0) {
      if (typeof this.playSmoothHat === 'function') {
        this.playSmoothHat(t, !!isOpen, isOpen ? 0.075 : 0.05);
      }
    };

    audio.triggerArpPluck = function (t, freq, dur = 0.2, pan = 0) {
      if (typeof this.playMelodicDubPluck === 'function') {
        this.playMelodicDubPluck(t, freq, 0.065);
      }
    };

    audio.triggerDarkPad = function (t, rootFreq, dur = 1.5) {
      if (this.padOscs && this.padOscs.length === 4) {
        const ratios = [1, 1.1892, 1.4983, 2.0];
        for (let i = 0; i < 4; i++) {
          this.padOscs[i].frequency.setTargetAtTime(rootFreq * 2 * ratios[i], t, 0.08);
        }
      }
      if (this.padFilter) {
        this.padFilter.frequency.setTargetAtTime(640, t, 0.12);
      }
      if (this.padGain) {
        this.padGain.gain.setTargetAtTime(0.05, t, 0.10);
      }
    };

    audio.triggerWobbleBass = function (t, noteFreq, dur = 0.4, lfoRate = 6, voiceType = 'growl_formant', intensity = 0.7) {
      if (this.subOsc && this.wobOsc1 && this.wobOsc2) {
        this.subOsc.frequency.setTargetAtTime(noteHzClamp(noteFreq), t, 0.025);
        this.wobOsc1.frequency.setTargetAtTime(noteHzClamp(noteFreq * 2), t, 0.025);
        this.wobOsc2.frequency.setTargetAtTime(noteHzClamp(noteFreq), t, 0.025);
      }
      if (this.wobLfo && this.wobFilter1 && this.wobFilter2 && this.wobLfoDepth && this.wobGain) {
        const baseCut = 380 + intensity * 380;
        this.wobLfo.frequency.setTargetAtTime(lfoRate, t, 0.03);
        this.wobFilter1.frequency.setTargetAtTime(baseCut, t, 0.028);
        this.wobFilter2.frequency.setTargetAtTime(baseCut * 1.15, t, 0.028);
        this.wobLfoDepth.gain.setTargetAtTime(220 + intensity * 180, t, 0.028);
        this.wobGain.gain.setTargetAtTime(0.11 + intensity * 0.06, t, 0.022);
      }
      if (this.wobFormant) {
        const formantTarget = (voiceType === 'growl_formant') ? 680 : 480;
        this.wobFormant.frequency.setTargetAtTime(formantTarget, t, 0.035);
      }
    };

    function noteHzClamp(f) {
      return Math.max(28, Math.min(880, f || 55));
    }

    // 5. TRAINED ADAPTIVE AI DIRECTOR & STEP SEQUENCER (`updateDynamicState` & `tick`)
    audio.updateDynamicState = function () {
      if (!state || !state.player) return;
      const floorIdx = state.currentFloor || state.floor || 1;
      const cycle = state.cycle || 1;
      const hasBoss = !!(state.boss && state.boss.hp > 0);

      let nearEnemies = 0;
      let aggroEnemies = 0;
      const px = state.player.x;
      const py = state.player.y;
      if (Array.isArray(state.enemies)) {
        for (let i = 0; i < state.enemies.length; i++) {
          const e = state.enemies[i];
          if (!e || e.hp <= 0) continue;
          const d = Math.hypot(e.x - px, e.y - py);
          if (d < 360) nearEnemies++;
          if (d < 230 || e.state === 'chase' || e.state === 'lunge' || e.state === 'windup' || (e.attackAnim || 0) > 0) {
            aggroEnemies++;
          }
        }
      }

      const hpRatio = state.player.hp / Math.max(1, state.player.maxHp);
      let targetIntensity = 0.14;
      if (hasBoss) {
        targetIntensity = 1.0;
      } else if (aggroEnemies > 0) {
        targetIntensity = Math.min(0.92, 0.45 + aggroEnemies * 0.12 + nearEnemies * 0.04);
      } else if (nearEnemies > 0) {
        targetIntensity = Math.min(0.55, 0.25 + nearEnemies * 0.06);
      } else {
        // Alternate general exploration between Softer Liquid/Ambient & Upbeat Groove across phrases/floors
        const phraseWave = Math.sin((this.barCount || 0) * 0.45 + floorIdx * 1.1);
        targetIntensity = phraseWave > 0 ? 0.34 : 0.12;
      }
      if (hpRatio < 0.35) targetIntensity = Math.min(1.0, targetIntensity + 0.18);

      this.combatIntensity = (this.combatIntensity || 0.2) * 0.88 + targetIntensity * 0.12;
      this.isBossMetal = hasBoss;
      this.isEnemySkirmish = (!hasBoss && (aggroEnemies > 0 || this.combatIntensity > 0.42));

      // Select floor + cycle + phrase scale and synth voice so the track continuously evolves
      const scaleIdx = (floorIdx + cycle * 2 + Math.floor((this.barCount || 0) / 4)) % ADAPTIVE_SCALES.length;
      const activeScale = ADAPTIVE_SCALES[scaleIdx];
      this.rootFreq = activeScale.root;
      this.scaleRatios = activeScale.ratios;
      this.activeSynthVoice = SYNTH_VOICES[(floorIdx + cycle + Math.floor((this.barCount || 0) / 2)) % SYNTH_VOICES.length];

      // Exploration sub-style: 'soft_liquid' vs 'upbeat_breakbeat'
      this.exploreMode = (((floorIdx + Math.floor((this.barCount || 0) / 2)) % 2) === 0)
        ? 'soft_liquid'
        : 'upbeat_breakbeat';

      if (this.isBossMetal) {
        this.bpm = 152 + (floorIdx % 5);
      } else if (this.isEnemySkirmish) {
        this.bpm = 144 + (floorIdx % 4);
      } else if (this.exploreMode === 'upbeat_breakbeat') {
        this.bpm = 140 + (floorIdx % 4);
      } else {
        this.bpm = 130 + (floorIdx % 3);
      }
      this.targetBpm = this.bpm;
    };

    audio.tick = function () {
      if (!this._enabled || !this.ctx || this.ctx.state !== 'running' || (state && (state.paused || state.isPaused || state.act > 0))) return;
      this.updateDynamicState();

      const stepDur = (60 / Math.max(110, this.bpm || 136)) / 4; // 16th-note duration
      const now = this.ctx.currentTime + 0.02;
      const s = this.step % 16;
      const curFloor = (state && (state.currentFloor || state.floor)) || 1;

      if (s === 0) {
        this.barCount = (this.barCount || 0) + 1;
        this.phraseBar = this.barCount % 8;
        this.currentStyle = (this.phraseBar + curFloor) % 4;
      }

      const degProg = [0, 3, 5, 1, 4, 2, 6, 1];
      const deg = degProg[(this.phraseBar + curFloor) % degProg.length];
      const noteFreq = this.rootFreq * (this.scaleRatios[deg % this.scaleRatios.length] || 1);
      const tritoneFreq = this.rootFreq * 1.4142;

      if (this.isBossMetal) {
        // ===========================================================
        // MODE A: BOSS DEATH-METAL / INDUSTRIAL TEAROUT DUBSTEP
        // (Double-kick thrash, distorted tritone death-metal guitars,
        //  china cymbal crashes, acoustic metal snare & tearout growls)
        // ===========================================================
        // 1. Rapid Double-Kick Pedal Bass Drum Rolls
        if (s % 2 === 0 || s === 3 || s === 7 || s === 11 || s === 14 || s === 15) {
          this.triggerKick(now, (s % 4 === 0) ? 1.15 : 0.82);
        }
        // 2. Ferocious Metal Snare + China Cymbal Crashes
        if (s === 4 || s === 12 || (this.phraseBar % 2 === 1 && s === 10)) {
          this.triggerVariedSnare(now, 'metal', 0);
        }
        if (s === 0 || s === 8) {
          this.triggerVariedSnare(now, 'china_crash', (s === 0 ? -0.35 : 0.35));
        }
        // 3. High-Gain Death-Metal Guitar Chugs, Tritone Riffs & Pinch Harmonics
        const metalRiffDegs = [0, 0, 1, 0, 4, 3, 1, 0, 0, 1, 4, 0, 6, 4, 1, 0];
        const mFreq = this.rootFreq * (this.scaleRatios[metalRiffDegs[s] % this.scaleRatios.length] || 1);
        if (s === 6 || s === 14) {
          this.triggerMetalGuitarRiff(now, tritoneFreq, stepDur * 1.9, 'pinch_harmonic');
        } else if (s === 4 || s === 12) {
          this.triggerMetalGuitarRiff(now, mFreq, stepDur * 2.1, 'death_tritone');
        } else {
          this.triggerMetalGuitarRiff(now, mFreq, stepDur * 0.92, 'palm_mute');
        }
        // 4. Industrial Tearout Dubstep Wobble + 404 Sub Drop on Off-Beats
        if (s === 0 || s === 8) {
          this.trigger404Bass(now, noteFreq, stepDur * 3.5, tritoneFreq, 0.95);
        }
        if (s === 2 || s === 10) {
          this.triggerWobbleBass(now, noteFreq, stepDur * 3.2, 12, 'growl_formant', 1.0);
        }

      } else if (this.isEnemySkirmish) {
        // ===========================================================
        // MODE B: ENEMY INTERACTION / SKIRMISH HYBRID DUB-METAL
        // (404 bass + varying dubstep synths + palm-muted metal guitar
        //  riffs + crisp acoustic metal snare backbeat)
        // ===========================================================
        if (s === 0 || s === 6 || s === 10) {
          this.triggerKick(now, 1.0);
        }
        if (s === 4 || s === 12 || (s === 15 && this.phraseBar % 2 === 1)) {
          this.triggerVariedSnare(now, 'metal', 0);
        }
        if (s % 2 === 1) {
          this.triggerHiHat(now, s === 7 || s === 15, (s % 4 - 1.5) * 0.25);
        }
        // Palm-muted Metal Guitar riff backing the dubstep wobble
        if (s === 0 || s === 2 || s === 3 || s === 8 || s === 11 || s === 14) {
          const gFreq = (s === 14) ? tritoneFreq : noteFreq;
          this.triggerMetalGuitarRiff(now, gFreq, stepDur * (s === 14 ? 1.8 : 0.95), s === 14 ? 'death_tritone' : 'palm_mute');
        }
        // 404 Bass + Evolving Dubstep Wobble Synth
        if (s === 0) {
          this.trigger404Bass(now, noteFreq, stepDur * 5.5, this.rootFreq, 0.72);
        }
        if (s === 4 || s === 10) {
          const lfoRates = [4, 6, 8, 12];
          const lfo = lfoRates[(this.step + curFloor) % lfoRates.length];
          this.triggerWobbleBass(now, noteFreq, stepDur * 3.6, lfo, this.activeSynthVoice, this.combatIntensity);
        }
        if (s === 7 || s === 13) {
          this.triggerMultiSynthVoice(now, noteFreq * 1.5, stepDur * 1.8, this.activeSynthVoice, 0.3);
        }

      } else if (this.exploreMode === 'upbeat_breakbeat') {
        // ===========================================================
        // MODE C: UPBEAT EXPLORATION & DISCOVERY (Syncopated Breakbeat,
        //         404 Bass Glides, Acid 303 / Supersaw & Melodic Arps)
        // ===========================================================
        if (s === 0 || s === 3 || s === 10) {
          this.triggerKick(now, 0.85);
        }
        if (s === 4 || s === 12) {
          this.triggerVariedSnare(now, 'electronic', 0);
        } else if (s === 9 || s === 15) {
          this.triggerVariedSnare(now, 'rimshot_404', 0.25);
        }
        if (s % 2 === 0) {
          this.triggerHiHat(now, s === 6, 0.2);
        }
        // Bouncy 404 Sub-Bass with pitch glides
        if (s === 0 || s === 6 || s === 10) {
          const nextDeg = degProg[(this.phraseBar + 2) % degProg.length];
          const glideTo = (s === 10) ? this.rootFreq * (this.scaleRatios[nextDeg % this.scaleRatios.length] || 1) : null;
          this.trigger404Bass(now, noteFreq, stepDur * 3.8, glideTo, 0.45);
        }
        // Upbeat Multi-Synth Arpeggios & Chords
        if (s === 2 || s === 5 || s === 8 || s === 11 || s === 14) {
          const arpRatio = this.scaleRatios[(s + this.phraseBar) % this.scaleRatios.length] || 1;
          const vType = (s === 8) ? 'supersaw_chord' : this.activeSynthVoice;
          this.triggerMultiSynthVoice(now, this.rootFreq * arpRatio, stepDur * 2.2, vType, ((s % 3) - 1) * 0.35);
        }

      } else {
        // ===========================================================
        // MODE D: SOFTER LIQUID / ATMOSPHERIC DUNGEON EXPLORATION
        // (Warm 404 Sub-Bass Glides, 404 Rimshot Snares, Crystal Bell
        //  Melodies, Lush Reverb Pads & Gentle Halftime Pulse)
        // ===========================================================
        if (s === 0 || (s === 11 && this.phraseBar % 2 === 0)) {
          this.triggerKick(now, 0.68);
        }
        if (s === 8) {
          this.triggerVariedSnare(now, 'rimshot_404', 0);
        }
        if (s === 4 || s === 12) {
          this.triggerHiHat(now, false, -0.2);
        }
        // Deep warm 404 sub-bass glide on bar start
        if (s === 0) {
          const targetGlide = this.rootFreq * (this.scaleRatios[(deg + 2) % this.scaleRatios.length] || 1);
          this.trigger404Bass(now, noteFreq, stepDur * 10.5, targetGlide, 0.22);
          this.triggerDarkPad(now, noteFreq, stepDur * 15);
        }
        // Delicate Crystal Bell & Cyber-FM ambient discovery notes
        if (s === 3 || s === 7 || s === 12 || s === 14) {
          const bellRatio = this.scaleRatios[(s * 2 + curFloor) % this.scaleRatios.length] || 1;
          const voice = (s === 12) ? 'supersaw_chord' : 'crystal_bell';
          this.triggerMultiSynthVoice(now, this.rootFreq * bellRatio, stepDur * 3.2, voice, (s === 7 ? -0.4 : 0.4));
        }
      }

      this.step++;
    };
  }

  // ============================================================================
  // 7. PROGRESSIVE ENEMY, SUB-BOSS & BOSS DIFFICULTY SCALING ENGINE
  //    + 'X' & 'Y' CONTROLLER BUTTONS AND LEARNABLE / PROGRAMMABLE BOSS MOVES
  // ============================================================================

  const SPECIAL_MOVES_CATALOG = [
    {
      id: 'cyclone_spin',
      name: 'Cyclone Weapon Spin',
      shortLabel: '🌀 SPIN',
      icon: '🌀',
      type: 'spin',
      cooldown: 4.5,
      dmgMult: 2.85,
      radius: 118,
      unlockBossWins: 1,
      unlockHint: 'Discoverable upon defeating your 1st Dungeon Boss (Floor 5 Steam Colossus)',
      desc: 'High-speed 360° weapon whirlwind that slashes all surrounding foes 3 times, deflects nearby projectiles, and scatters steel sparks.',
      color: '#38bdf8',
      ringColor: '#fde047',
    },
    {
      id: 'meteor_slam',
      name: 'Meteor Jump Shockwave',
      shortLabel: '☄️ SLAM',
      icon: '☄️',
      type: 'jump_shockwave',
      cooldown: 6.5,
      dmgMult: 3.9,
      radius: 175,
      jumpHeight: 68,
      unlockBossWins: 2,
      unlockHint: 'Discoverable upon defeating your 2nd Dungeon Boss (Floor 10 / Loop 1 Finale)',
      desc: 'Launches Badger high into the air to evade ground hazards, then drops down with a seismic shockwave that deals heavy AoE damage and stuns enemies.',
      color: '#f97316',
      ringColor: '#fef08a',
    },
    {
      id: 'chain_tempest',
      name: 'Abyssal Chain Tempest',
      shortLabel: '⛓️ CHAIN',
      icon: '⛓️',
      type: 'spin_chain',
      cooldown: 5.5,
      dmgMult: 3.4,
      radius: 148,
      unlockBossWins: 4,
      unlockHint: 'Discoverable after 4 Boss Battle victories across Dungeon Loops',
      desc: 'Whirls a blazing crimson-iron tether chain in a wide 360° vortex, shredding enemy armor, pulling foes off-balance, and dealing heavy bleed damage.',
      color: '#f43f5e',
      ringColor: '#fda4af',
    },
    {
      id: 'thunder_dive',
      name: 'Thunderclap Sky-Drop',
      shortLabel: '⚡ THUNDER',
      icon: '⚡',
      type: 'jump_shockwave_lightning',
      cooldown: 7.5,
      dmgMult: 4.35,
      radius: 188,
      jumpHeight: 76,
      unlockBossWins: 6,
      unlockHint: 'Discoverable after 6 Boss Battle victories (Loop 2 Finale)',
      desc: 'Sky-high vault that crashes down with a high-voltage shockwave and arcs chain-lightning bolts into up to 6 nearby enemies and bosses.',
      color: '#a855f7',
      ringColor: '#67e8f9',
    },
    {
      id: 'venom_nova',
      name: 'Corrosive Acid Vortex',
      shortLabel: '☣️ VENOM',
      icon: '☣️',
      type: 'spin_nova',
      cooldown: 6.0,
      dmgMult: 3.65,
      radius: 155,
      unlockBossWins: 8,
      unlockHint: 'Discoverable after 8 Boss Battle victories (Loop 3 Boss Milestone)',
      desc: 'Rapid weapon spin that erupts 12 pressurized bio-acid orbs in all directions plus a caustic shockwave that melts enemy defense.',
      color: '#22c55e',
      ringColor: '#bef264',
    },
    {
      id: 'ouroboros_cataclysm',
      name: 'Ouroboros Gravity Slam',
      shortLabel: '🌌 RIFT SLAM',
      icon: '🌌',
      type: 'jump_cataclysm',
      cooldown: 9.0,
      dmgMult: 5.2,
      radius: 215,
      jumpHeight: 84,
      unlockBossWins: 10,
      unlockHint: 'Discoverable after 10 Boss Battle victories (Deep Loop Mastery)',
      desc: 'Ascends into an Abyssal rift and drops with twin dark-matter shockwaves that deal massive crushing damage and siphon +18% Max HP.',
      color: '#ec4899',
      ringColor: '#f472b6',
    },
  ];

  window.SPECIAL_MOVES_CATALOG = SPECIAL_MOVES_CATALOG;

  function getSpecialMoveById(moveId) {
    if (!moveId) return null;
    return SPECIAL_MOVES_CATALOG.find(m => m.id === moveId) || null;
  }

  function ensurePlayerMoveFields() {
    const p = state.player;
    if (!p) return;
    if (!Array.isArray(p.learnedMoves)) p.learnedMoves = [];
    if (typeof p.bossMoveWinsCount !== 'number') p.bossMoveWinsCount = 0;
    if (p.equippedMoveX === undefined) p.equippedMoveX = null;
    if (p.equippedMoveY === undefined) p.equippedMoveY = null;
    if (typeof p.moveCooldownX !== 'number') p.moveCooldownX = 0;
    if (typeof p.moveCooldownY !== 'number') p.moveCooldownY = 0;
    if (typeof p.specialJumpZ !== 'number') p.specialJumpZ = 0;
    if (!Array.isArray(state.specialShockwaves)) state.specialShockwaves = [];
  }

  // Retroactively grant moves if the player is on a higher floor/cycle save file
  window.ensureRetroactiveBossMoves = function () {
    ensurePlayerMoveFields();
    const p = state.player;
    if (!p) return;
    const cycle = Math.max(1, state.cycle || 1);
    const floor = Math.max(1, state.currentFloor || 1);
    const estimatedWins = (cycle - 1) * 3 + (floor > 5 ? 1 : 0) + (floor > 10 ? 1 : 0);
    if (estimatedWins > (p.bossMoveWinsCount || 0)) {
      p.bossMoveWinsCount = estimatedWins;
    }
    SPECIAL_MOVES_CATALOG.forEach(mv => {
      if (p.bossMoveWinsCount >= mv.unlockBossWins && !p.learnedMoves.includes(mv.id)) {
        p.learnedMoves.push(mv.id);
      }
    });
    if (!p.equippedMoveX && p.learnedMoves.length > 0) {
      p.equippedMoveX = p.learnedMoves[0];
    }
    if (!p.equippedMoveY && p.learnedMoves.length > 1) {
      p.equippedMoveY = p.learnedMoves[1];
    }
    window.syncControllerXYLabels();
  };

  // Unlock a new move when a boss is defeated at a milestone win count
  window.checkAndUnlockBossSpecialMove = function (bossFloor, currentCycle) {
    ensurePlayerMoveFields();
    const p = state.player;
    if (!p) return null;
    p.bossMoveWinsCount = (p.bossMoveWinsCount || 0) + 1;

    // Find any move whose unlockBossWins <= p.bossMoveWinsCount that isn't learned yet
    let newlyUnlocked = null;
    for (let i = 0; i < SPECIAL_MOVES_CATALOG.length; i++) {
      const mv = SPECIAL_MOVES_CATALOG[i];
      if (p.bossMoveWinsCount >= mv.unlockBossWins && !p.learnedMoves.includes(mv.id)) {
        p.learnedMoves.push(mv.id);
        newlyUnlocked = mv;
        break; // Unlock at most 1 new move per boss battle win so discoveries feel special!
      }
    }

    if (newlyUnlocked) {
      let assignedBtn = null;
      if (!p.equippedMoveX) {
        p.equippedMoveX = newlyUnlocked.id;
        assignedBtn = 'X';
      } else if (!p.equippedMoveY && p.equippedMoveX !== newlyUnlocked.id) {
        p.equippedMoveY = newlyUnlocked.id;
        assignedBtn = 'Y';
      }
      window.syncControllerXYLabels();
      const assignText = assignedBtn
        ? `Auto-programmed to [${assignedBtn}]! Open ARSENAL -> MOVES (X/Y) anytime to reprogram your X & Y buttons!`
        : `Open ARSENAL -> MOVES (X/Y) in the Game Menu to program it to your [X] or [Y] button!`;

      showFloater(`⚡ NEW MOVE LEARNED: ${newlyUnlocked.name.toUpperCase()}!`, p.x, p.y - 54, '#fde047');
      showToast(`NEW [X/Y] MOVE DISCOVERED: ${newlyUnlocked.icon} ${newlyUnlocked.name.toUpperCase()}!`);
      setTimeout(() => {
        if (typeof dialogue !== 'undefined' && dialogue && typeof dialogue.show === 'function') {
          dialogue.show(
            `⚡ NEW BOSS SPECIAL MOVE DISCOVERED: ${newlyUnlocked.icon} ${newlyUnlocked.name.toUpperCase()}`,
            `${newlyUnlocked.desc} ${assignText}`,
            6800
          );
        }
      }, 900);
    }
    return newlyUnlocked;
  };

  window.assignSpecialMoveToButton = function (moveId, buttonKey) {
    ensurePlayerMoveFields();
    const p = state.player;
    if (!p) return false;
    const mv = getSpecialMoveById(moveId);
    if (!mv) return false;
    if (!p.learnedMoves.includes(moveId)) {
      showToast(`🔒 LOCKED! ${mv.unlockHint.toUpperCase()}`);
      audio.playSfx('spikes');
      return false;
    }

    const btn = String(buttonKey || 'X').toUpperCase();
    if (btn === 'X') {
      if (p.equippedMoveY === moveId) p.equippedMoveY = p.equippedMoveX || null;
      p.equippedMoveX = moveId;
    } else if (btn === 'Y') {
      if (p.equippedMoveX === moveId) p.equippedMoveX = p.equippedMoveY || null;
      p.equippedMoveY = moveId;
    }
    audio.playSfx('magic_chime');
    window.syncControllerXYLabels();
    renderMovesCodexTab();
    saveGameProgress('move_assign', false);
    showToast(`PROGRAMMED ${mv.icon} ${mv.name.toUpperCase()} TO [${btn}] BUTTON!`);
    return true;
  };

  window.syncControllerXYLabels = function () {
    ensurePlayerMoveFields();
    const p = state.player;
    const xLabelEl = document.getElementById('btn-x-label');
    const yLabelEl = document.getElementById('btn-y-label');
    const xBtnEl = document.getElementById('btn-x');
    const yBtnEl = document.getElementById('btn-y');
    if (!p) return;

    const mvX = getSpecialMoveById(p.equippedMoveX);
    const mvY = getSpecialMoveById(p.equippedMoveY);

    if (xLabelEl) {
      if (mvX) {
        if (p.moveCooldownX > 0.05) {
          xLabelEl.textContent = `${mvX.icon} ${p.moveCooldownX.toFixed(1)}s`;
          xLabelEl.style.color = '#94a3b8';
        } else {
          xLabelEl.textContent = mvX.shortLabel;
          xLabelEl.style.color = '#fde047';
        }
      } else {
        xLabelEl.textContent = p.learnedMoves.length > 0 ? 'SET [X]' : 'LOCKED [X]';
        xLabelEl.style.color = '#64748b';
      }
    }
    if (xBtnEl) {
      xBtnEl.style.opacity = (mvX && p.moveCooldownX <= 0.05) ? '1' : '0.72';
    }

    if (yLabelEl) {
      if (mvY) {
        if (p.moveCooldownY > 0.05) {
          yLabelEl.textContent = `${mvY.icon} ${p.moveCooldownY.toFixed(1)}s`;
          yLabelEl.style.color = '#94a3b8';
        } else {
          yLabelEl.textContent = mvY.shortLabel;
          yLabelEl.style.color = '#34d399';
        }
      } else {
        yLabelEl.textContent = p.learnedMoves.length > 0 ? 'SET [Y]' : 'LOCKED [Y]';
        yLabelEl.style.color = '#64748b';
      }
    }
    if (yBtnEl) {
      yBtnEl.style.opacity = (mvY && p.moveCooldownY <= 0.05) ? '1' : '0.72';
    }
  };

  function spawnSparks(x, y, count = 8, color = '#fde047') {
    if (typeof spawnParticles === 'function') {
      spawnParticles(x, y, color, count, 95);
    }
  }

  // Damage helper for X/Y special moves that works on both enemies and bosses
  function applySpecialMoveAoE(centerX, centerY, radius, rawDamage, moveObj, stunSec = 0.85, applyPoison = false) {
    const p = state.player;
    let hitCount = 0;

    // 1. Hit all regular & sub-boss enemies in radius
    if (Array.isArray(state.enemies)) {
      for (let i = state.enemies.length - 1; i >= 0; i--) {
        const e = state.enemies[i];
        if (!e || e.hp <= 0) continue;
        const dist = Math.hypot(e.x - centerX, e.y - centerY);
        if (dist <= radius + (e.radius || 18)) {
          const falloff = Math.max(0.65, 1 - (dist / (radius * 1.45)));
          const dmg = Math.max(4, Math.round(rawDamage * falloff));
          damageEnemy(e, dmg);
          hitCount++;
          if (e.hp > 0) {
            e.hitStun = Math.max(e.hitStun || 0, stunSec);
            const pushAng = Math.atan2(e.y - centerY, e.x - centerX);
            const pushDist = (moveObj && moveObj.type === 'spin_chain') ? -16 : 22;
            const nx = e.x + Math.cos(pushAng) * pushDist;
            const ny = e.y + Math.sin(pushAng) * pushDist;
            if (!isWallPixel(nx, ny)) {
              e.x = nx;
              e.y = ny;
            }
            if (applyPoison) {
              e.poisonTimer = 6.0;
              e.poisonDps = Math.max(6, Math.round(rawDamage * 0.22));
            }
          }
        }
      }
    }

    // 2. Hit active floor Boss if in radius
    if (state.boss && state.boss.hp > 0) {
      const b = state.boss;
      const bDist = Math.hypot(b.x - centerX, b.y - centerY);
      if (bDist <= radius + (b.radius || 34) + 18) {
        const dmg = Math.max(8, Math.round(rawDamage * 0.92));
        damageBoss(dmg);
        b.hitFlash = 0.25;
        hitCount++;
      }
    }

    // 3. Deflect/clear hostile projectiles inside radius
    if (Array.isArray(state.projectiles)) {
      for (let i = state.projectiles.length - 1; i >= 0; i--) {
        const pr = state.projectiles[i];
        if (pr && pr.fromEnemy && Math.hypot(pr.x - centerX, pr.y - centerY) <= radius + 16) {
          spawnSparks(pr.x, pr.y, 4, moveObj ? moveObj.ringColor : '#fde047');
          state.projectiles.splice(i, 1);
        }
      }
    }

    // 4. Break nearby ensnaring vines or acid tentacles around the hero
    if (p && p.status) {
      if (p.status.vineTimer > 0) p.status.vineTimer = 0;
      if (p.status.acidTentacleTimer > 0) p.status.acidTentacleTimer = 0;
      if (p.status.webTimer > 0) p.status.webTimer = 0;
    }

    return hitCount;
  }

  function triggerSpecialMoveExecution(moveObj, buttonSlot) {
    ensurePlayerMoveFields();
    const p = state.player;
    if (!p || !moveObj) return false;
    if (state.isTransitioning || state.isRecoveringFromDeath) return false;

    const baseAtk = Math.max(6, getPlayerTotalAtk(p));
    const totalDmg = Math.round(baseAtk * (moveObj.dmgMult || 2.8));

    if (buttonSlot === 'X') {
      p.moveCooldownX = moveObj.cooldown || 5.0;
    } else {
      p.moveCooldownY = moveObj.cooldown || 5.0;
    }
    window.syncControllerXYLabels();

    if (moveObj.type === 'spin' || moveObj.type === 'spin_chain' || moveObj.type === 'spin_nova') {
      // =========================================================
      // SPIN MOVE (360° Weapon Spin / Chain Tempest / Acid Nova)
      // =========================================================
      audio.playSfx('whirlwind');
      p.whirlwindAnim = 0.62;
      p.attackAnim = 0.55;
      p.spikeInvuln = Math.max(p.spikeInvuln || 0, 0.55);
      p.specialMoveAnim = {
        type: moveObj.type,
        moveId: moveObj.id,
        timer: 0.62,
        duration: 0.62,
        radius: moveObj.radius || 120,
        color: moveObj.color,
        ringColor: moveObj.ringColor,
        tickAccum: 0,
        rawDamage: Math.round(totalDmg * 0.42),
      };

      state.screenShake = Math.max(state.screenShake || 0, 6);
      spawnSparks(p.x, p.y, 18, moveObj.ringColor);
      state.specialShockwaves.push({
        x: p.x,
        y: p.y,
        r: 16,
        maxR: moveObj.radius || 120,
        color: moveObj.color,
        ringColor: moveObj.ringColor,
        alpha: 1.0,
        lineWidth: 6,
      });

      // Immediate first slash hit
      applySpecialMoveAoE(
        p.x,
        p.y,
        moveObj.radius || 120,
        Math.round(totalDmg * 0.55),
        moveObj,
        0.65,
        moveObj.type === 'spin_nova'
      );

      // If Venom Nova, fire 12 corrosive acid globes outward in a 360° ring!
      if (moveObj.type === 'spin_nova') {
        for (let i = 0; i < 12; i++) {
          const ang = (i / 12) * Math.PI * 2;
          state.projectiles.push({
            x: p.x + Math.cos(ang) * 14,
            y: p.y + Math.sin(ang) * 14,
            vx: Math.cos(ang) * 250,
            vy: Math.sin(ang) * 250,
            dmg: Math.round(baseAtk * 1.45),
            color: '#22c55e',
            radius: 6,
            life: 0.85,
            fromPlayer: true,
          });
        }
      }

      showFloater(`${moveObj.icon} ${moveObj.name.toUpperCase()}!`, p.x, p.y - 36, moveObj.ringColor);
      return true;
    } else {
      // =========================================================
      // JUMP + GROUND-SLAM SHOCKWAVE MOVE
      // (Launches hero high into the air, then drops & releases
      //  an expanding heavy-damage seismic shockwave on landing!)
      // =========================================================
      audio.playSfx('dodge');
      const jumpDur = 0.48;
      p.spikeInvuln = Math.max(p.spikeInvuln || 0, jumpDur + 0.35);
      p.dodgeCooldown = Math.max(p.dodgeCooldown || 0, 0.25);
      p.specialMoveAnim = {
        type: moveObj.type,
        moveId: moveObj.id,
        timer: jumpDur,
        duration: jumpDur,
        radius: moveObj.radius || 175,
        jumpHeight: moveObj.jumpHeight || 68,
        color: moveObj.color,
        ringColor: moveObj.ringColor,
        rawDamage: totalDmg,
        landed: false,
      };
      p.specialJumpZ = 12;
      spawnSparks(p.x, p.y, 12, moveObj.color);
      showFloater(`${moveObj.icon} SKY LEAP!`, p.x, p.y - 40, moveObj.ringColor);
      return true;
    }
  }

  window.executeActionX = function () {
    ensurePlayerMoveFields();
    audio.init();
    if (isCodexOpen()) {
      handleCodexMenuInput('X');
      return;
    }
    const p = state.player;
    if (!p) return;
    if (!p.equippedMoveX) {
      if (p.learnedMoves && p.learnedMoves.length > 0) {
        window.openMovesProgrammerMenu();
        showToast("SELECT A LEARNED MOVE TO PROGRAM ONTO [X]!");
      } else {
        showFloater("🔒 [X] MOVE LOCKED — DEFEAT FLOOR 5 BOSS!", p.x, p.y - 30, '#fbbf24');
        showToast("DEFEAT DUNGEON BOSSES TO DISCOVER NEW [X] & [Y] MOVES!");
      }
      return;
    }
    if (p.moveCooldownX > 0.05) {
      showFloater(`⏳ [X] COOLDOWN ${p.moveCooldownX.toFixed(1)}s`, p.x, p.y - 28, '#94a3b8');
      return;
    }
    const mv = getSpecialMoveById(p.equippedMoveX);
    if (mv) triggerSpecialMoveExecution(mv, 'X');
  };

  window.executeActionY = function () {
    ensurePlayerMoveFields();
    audio.init();
    if (isCodexOpen()) {
      handleCodexMenuInput('Y');
      return;
    }
    const p = state.player;
    if (!p) return;
    if (!p.equippedMoveY) {
      if (p.learnedMoves && p.learnedMoves.length > 0) {
        window.openMovesProgrammerMenu();
        showToast("SELECT A LEARNED MOVE TO PROGRAM ONTO [Y]!");
      } else {
        showFloater("🔒 [Y] MOVE LOCKED — DEFEAT BOSSES TO UNLOCK!", p.x, p.y - 30, '#34d399');
        showToast("DEFEAT DUNGEON BOSSES TO DISCOVER NEW [X] & [Y] MOVES!");
      }
      return;
    }
    if (p.moveCooldownY > 0.05) {
      showFloater(`⏳ [Y] COOLDOWN ${p.moveCooldownY.toFixed(1)}s`, p.x, p.y - 28, '#94a3b8');
      return;
    }
    const mv = getSpecialMoveById(p.equippedMoveY);
    if (mv) triggerSpecialMoveExecution(mv, 'Y');
  };

  // Update active Special Move animations (Jump arc, Landing Shockwave, Multi-hit Spin, Cooldowns)
  function updateSpecialMovesAndShockwaves(dt) {
    ensurePlayerMoveFields();
    const p = state.player;
    if (!p) return;

    let cdChanged = false;
    if (p.moveCooldownX > 0) {
      const prev = Math.ceil(p.moveCooldownX * 10);
      p.moveCooldownX = Math.max(0, p.moveCooldownX - dt);
      if (Math.ceil(p.moveCooldownX * 10) !== prev || p.moveCooldownX === 0) cdChanged = true;
    }
    if (p.moveCooldownY > 0) {
      const prev = Math.ceil(p.moveCooldownY * 10);
      p.moveCooldownY = Math.max(0, p.moveCooldownY - dt);
      if (Math.ceil(p.moveCooldownY * 10) !== prev || p.moveCooldownY === 0) cdChanged = true;
    }
    if (cdChanged) {
      window.syncControllerXYLabels();
    }

    // Update active Special Move state on the hero
    if (p.specialMoveAnim) {
      const anim = p.specialMoveAnim;
      anim.timer -= dt;
      const progress = Math.max(0, Math.min(1, 1 - (anim.timer / Math.max(0.01, anim.duration))));

      if (anim.type === 'spin' || anim.type === 'spin_chain' || anim.type === 'spin_nova') {
        p.specialJumpZ = 0;
        anim.tickAccum = (anim.tickAccum || 0) + dt;
        if (anim.tickAccum >= 0.18) {
          anim.tickAccum = 0;
          const mv = getSpecialMoveById(anim.moveId);
          applySpecialMoveAoE(p.x, p.y, anim.radius, anim.rawDamage, mv, 0.45, anim.type === 'spin_nova');
          spawnSparks(
            p.x + (Math.random() - 0.5) * anim.radius * 0.9,
            p.y + (Math.random() - 0.5) * anim.radius * 0.9,
            6,
            anim.ringColor
          );
          state.specialShockwaves.push({
            x: p.x,
            y: p.y,
            r: 12,
            maxR: anim.radius,
            color: anim.color,
            ringColor: anim.ringColor,
            alpha: 0.85,
            lineWidth: 4,
          });
        }
        if (anim.timer <= 0) {
          p.specialMoveAnim = null;
        }
      } else {
        // Jump-Slam Parabolic Arc: sin(progress * PI) peaks at jumpHeight!
        p.specialJumpZ = Math.sin(progress * Math.PI) * (anim.jumpHeight || 68);
        if (anim.timer <= 0 && !anim.landed) {
          anim.landed = true;
          p.specialJumpZ = 0;
          const mv = getSpecialMoveById(anim.moveId);
          audio.playSfx('boss_roar');
          audio.playSfx('whirlwind');
          state.screenShake = Math.max(state.screenShake || 0, 14);

          // Spawn twin concentric ground shockwave rings!
          state.specialShockwaves.push({
            x: p.x,
            y: p.y,
            r: 10,
            maxR: anim.radius,
            color: anim.color,
            ringColor: anim.ringColor,
            alpha: 1.0,
            lineWidth: 8,
            isSeismic: true,
          });
          state.specialShockwaves.push({
            x: p.x,
            y: p.y,
            r: 4,
            maxR: anim.radius * 0.68,
            color: anim.ringColor,
            ringColor: '#ffffff',
            alpha: 0.95,
            lineWidth: 5,
            isSeismic: true,
          });

          spawnSparks(p.x, p.y, 28, anim.ringColor);
          const hits = applySpecialMoveAoE(p.x, p.y, anim.radius, anim.rawDamage, mv, 1.35, false);

          // Thunderclap Sky-Drop: strike up to 6 targets with chain lightning bolts!
          if (anim.type === 'jump_shockwave_lightning') {
            let bolts = 0;
            if (Array.isArray(state.enemies)) {
              state.enemies.forEach(e => {
                if (e && e.hp > 0 && bolts < 6 && Math.hypot(e.x - p.x, e.y - p.y) <= anim.radius * 1.25) {
                  bolts++;
                  damageEnemy(e, Math.round(anim.rawDamage * 0.35));
                  spawnSparks(e.x, e.y, 10, '#67e8f9');
                }
              });
            }
            if (state.boss && state.boss.hp > 0 && Math.hypot(state.boss.x - p.x, state.boss.y - p.y) <= anim.radius * 1.35) {
              damageBoss(Math.round(anim.rawDamage * 0.32));
              spawnSparks(state.boss.x, state.boss.y, 14, '#67e8f9');
            }
          }

          // Ouroboros Gravity Cataclysm: heal +18% Max HP on impact!
          if (anim.type === 'jump_cataclysm') {
            const healAmt = Math.max(15, Math.round(p.maxHp * 0.18));
            p.hp = Math.min(p.maxHp, p.hp + healAmt);
            showFloater(`+${healAmt} HP RIFT SIPHON!`, p.x, p.y - 52, '#4ade80');
            updateHud();
          }

          showFloater(
            `💥 ${mv ? mv.name.toUpperCase() : 'SHOCKWAVE SLAM'}! (${hits} HIT)`,
            p.x,
            p.y - 34,
            anim.ringColor
          );
          p.specialMoveAnim = null;
        }
      }
    } else {
      p.specialJumpZ = 0;
    }

    // Update expanding shockwave rings
    if (Array.isArray(state.specialShockwaves)) {
      for (let i = state.specialShockwaves.length - 1; i >= 0; i--) {
        const sw = state.specialShockwaves[i];
        const expandSpeed = (sw.maxR || 160) * 3.1;
        sw.r += expandSpeed * dt;
        sw.alpha = Math.max(0, 1 - (sw.r / Math.max(1, sw.maxR)));
        if (sw.r >= sw.maxR || sw.alpha <= 0.02) {
          state.specialShockwaves.splice(i, 1);
        }
      }
    }
  }

  // Render active Special Move shockwaves, weapon spin vortex, and mid-air jump shadow
  function renderSpecialMovesOverlay() {
    const p = state.player;
    if (!p || !ctx || !canvas) return;
    if (state.finaleCinematic && state.finaleCinematic.active) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const viewW = canvas.width / dpr;
    const viewH = canvas.height / dpr;
    if (viewW <= 0 || viewH <= 0) return;

    ctx.save();
    try {
      ctx.scale(dpr, dpr);
      ctx.translate(
        Math.round(viewW * 0.5 - state.camera.x),
        Math.round(viewH * 0.5 - state.camera.y)
      );

      // 1. Expanding Ground Shockwaves (from Jump Slam / Spin / Boss Stomp)
      if (Array.isArray(state.specialShockwaves)) {
        for (let i = 0; i < state.specialShockwaves.length; i++) {
          const sw = state.specialShockwaves[i];
          if (!sw || !Number.isFinite(sw.x) || !Number.isFinite(sw.y) || !Number.isFinite(sw.r) || sw.r <= 0) continue;
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, sw.alpha || 0));

          // Ground fissure glow
          const rInner = Math.max(1, sw.r * 0.55);
          const rOuter = Math.max(rInner + 1, sw.r);
          const grad = ctx.createRadialGradient(sw.x, sw.y, rInner, sw.x, sw.y, rOuter);
          grad.addColorStop(0, 'rgba(0,0,0,0)');
          grad.addColorStop(0.75, sw.color || '#f97316');
          grad.addColorStop(1, sw.ringColor || '#fde047');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.ellipse(sw.x, sw.y, rOuter, rOuter * 0.62, 0, 0, Math.PI * 2);
          ctx.fill();

          // Outer shockwave crest ring
          ctx.strokeStyle = sw.ringColor || '#fde047';
          ctx.lineWidth = sw.lineWidth || 5;
          ctx.beginPath();
          ctx.ellipse(sw.x, sw.y, rOuter, rOuter * 0.62, 0, 0, Math.PI * 2);
          ctx.stroke();

          // Jagged radial shock spikes for seismic slams
          if (sw.isSeismic) {
            const spikes = 10;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            for (let k = 0; k < spikes; k++) {
              const a = (k / spikes) * Math.PI * 2 + rOuter * 0.02;
              const rIn = rOuter * 0.72;
              const rOut = rOuter * 1.06;
              ctx.beginPath();
              ctx.moveTo(sw.x + Math.cos(a) * rIn, sw.y + Math.sin(a) * rIn * 0.62);
              ctx.lineTo(sw.x + Math.cos(a) * rOut, sw.y + Math.sin(a) * rOut * 0.62);
              ctx.stroke();
            }
          }
          ctx.restore();
        }
      }

      // 2. Active Spin Blade / Chain Vortex / Mid-Air Jump Reticle around Player
      if (p.specialMoveAnim && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        const anim = p.specialMoveAnim;
        const now = performance.now();
        if (anim.type === 'spin' || anim.type === 'spin_chain' || anim.type === 'spin_nova') {
          ctx.save();
          ctx.translate(p.x, p.y - (p.z || 0));
          const rot = now * 0.028;
          const blades = (anim.type === 'spin_chain') ? 4 : 3;
          for (let b = 0; b < blades; b++) {
            const a = rot + (b / blades) * Math.PI * 2;
            ctx.strokeStyle = (b % 2 === 0) ? (anim.ringColor || '#fde047') : (anim.color || '#38bdf8');
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(0, 0, (anim.radius || 115) * 0.78, a, a + 1.15);
            ctx.stroke();

            // Spinning weapon tip / chain weight
            const wx = Math.cos(a + 1.15) * (anim.radius || 115) * 0.78;
            const wy = Math.sin(a + 1.15) * (anim.radius || 115) * 0.78;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(wx, wy, 6, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        } else if (p.specialJumpZ > 1) {
          // Draw ground target shadow ring where the Jump-Slam will impact!
          ctx.save();
          ctx.strokeStyle = anim.ringColor || '#fde047';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y + 8, (anim.radius || 175) * 0.45, (anim.radius || 175) * 0.26, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          // Draw ascending/descending energy trail beneath leaping Badger
          const trailGrad = ctx.createLinearGradient(p.x, p.y - p.specialJumpZ, p.x, p.y + 8);
          trailGrad.addColorStop(0, anim.ringColor || '#fde047');
          trailGrad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = trailGrad;
          ctx.fillRect(p.x - 12, p.y - p.specialJumpZ, 24, p.specialJumpZ);
          ctx.restore();
        }
      }
    } catch (e) {
      // Never allow overlay rendering to interrupt frame rendering
    } finally {
      ctx.restore();
    }
  }

  // Render the MOVES (X/Y) tab inside the Codex Game Menu
  let selectedMovesMenuIdx = 0;
  function renderMovesCodexTab() {
    ensurePlayerMoveFields();
    const p = state.player;
    const summaryEl = document.getElementById('active-xy-moves-summary');
    const listEl = document.getElementById('moves-list-container');
    const tabMovesEl = document.getElementById('codex-tab-moves');
    if (tabMovesEl && p) {
      tabMovesEl.textContent = `MOVES (${p.learnedMoves.length}/${SPECIAL_MOVES_CATALOG.length})`;
    }
    if (!summaryEl || !listEl || !p) return;

    const mvX = getSpecialMoveById(p.equippedMoveX);
    const mvY = getSpecialMoveById(p.equippedMoveY);

    summaryEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(245,158,11,0.14);border:1px solid #fbbf24;border-radius:4px;padding:4px 7px;">
        <span>🟡 <b>[X] BUTTON:</b> ${mvX ? `${mvX.icon} <b style="color:#fde047;">${mvX.name}</b> (${mvX.cooldown}s CD)` : '<span style="color:#94a3b8;">None Programmed</span>'}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(16,185,129,0.14);border:1px solid #34d399;border-radius:4px;padding:4px 7px;">
        <span>🟢 <b>[Y] BUTTON:</b> ${mvY ? `${mvY.icon} <b style="color:#34d399;">${mvY.name}</b> (${mvY.cooldown}s CD)` : '<span style="color:#94a3b8;">None Programmed</span>'}</span>
      </div>
      <div style="font-size:8px;color:#38bdf8;margin-top:2px;">
        BOSS VICTORIES: <b>${p.bossMoveWinsCount || 0}</b> • New moves unlock after periodic Boss Battle wins! Tap <b>[SET X]</b> or <b>[SET Y]</b> (or press X/Y on controller) to program!
      </div>
    `;

    let html = '';
    SPECIAL_MOVES_CATALOG.forEach((mv, idx) => {
      const unlocked = p.learnedMoves.includes(mv.id);
      const isX = (p.equippedMoveX === mv.id);
      const isY = (p.equippedMoveY === mv.id);
      const isFocused = (selectedMovesMenuIdx === idx);

      html += `
        <div class="stat-card" data-move-card="${mv.id}" data-move-idx="${idx}" style="margin-bottom:0;border:2px solid ${isFocused ? '#fde047' : (unlocked ? '#38bdf8' : '#334155')};background:${unlocked ? 'rgba(15,23,42,0.95)' : 'rgba(9,13,22,0.75)'};padding:7px 9px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
            <span style="font-size:10.5px;font-weight:900;color:${unlocked ? '#f8fafc' : '#64748b'};">
              ${unlocked ? mv.icon : '🔒'} ${mv.name}
            </span>
            <span style="font-size:8px;font-weight:900;padding:2px 6px;border-radius:3px;background:${isX ? '#d97706' : (isY ? '#059669' : (unlocked ? '#0284c7' : '#1e293b'))};color:#fff;">
              ${isX ? 'EQUIPPED ON [X]' : (isY ? 'EQUIPPED ON [Y]' : (unlocked ? 'UNLOCKED' : `BOSS WINS: ${p.bossMoveWinsCount || 0}/${mv.unlockBossWins}`))}
            </span>
          </div>
          <div style="font-size:8.5px;color:${unlocked ? '#cbd5e1' : '#64748b'};line-height:1.3;margin-bottom:5px;">
            ${unlocked ? mv.desc : mv.unlockHint}
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
            <span style="font-size:8px;color:#fde047;font-weight:800;">
              DMG: ${mv.dmgMult}x ATK • RADIUS: ${mv.radius}px • CD: ${mv.cooldown}s
            </span>
            ${unlocked ? `
              <div style="display:flex;gap:5px;">
                <button type="button" data-assign-x="${mv.id}" style="background:${isX ? '#f59e0b' : '#78350f'};color:#fff;border:1px solid #fbbf24;border-radius:4px;padding:4px 8px;font-size:8.5px;font-weight:900;font-family:monospace;cursor:pointer;">
                  ${isX ? '✓ ON [X]' : 'PROGRAM [X]'}
                </button>
                <button type="button" data-assign-y="${mv.id}" style="background:${isY ? '#10b981' : '#064e3b'};color:#fff;border:1px solid #34d399;border-radius:4px;padding:4px 8px;font-size:8.5px;font-weight:900;font-family:monospace;cursor:pointer;">
                  ${isY ? '✓ ON [Y]' : 'PROGRAM [Y]'}
                </button>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    });

    listEl.innerHTML = html;

    listEl.querySelectorAll('[data-assign-x]').forEach(btn => {
      const mId = btn.getAttribute('data-assign-x');
      bindModalTap(btn, () => window.assignSpecialMoveToButton(mId, 'X'), true);
    });
    listEl.querySelectorAll('[data-assign-y]').forEach(btn => {
      const mId = btn.getAttribute('data-assign-y');
      bindModalTap(btn, () => window.assignSpecialMoveToButton(mId, 'Y'), true);
    });
    listEl.querySelectorAll('[data-move-card]').forEach(card => {
      const idx = parseInt(card.getAttribute('data-move-idx') || '0', 10);
      bindModalTap(card, () => {
        selectedMovesMenuIdx = idx;
        renderMovesCodexTab();
      }, false);
    });
  }

  window.openMovesProgrammerMenu = function () {
    toggleCodex(true);
    const tabs = document.querySelectorAll('.codex-tab');
    const pages = document.querySelectorAll('.codex-page');
    tabs.forEach(t => t.classList.remove('active'));
    pages.forEach(p => p.classList.remove('active'));
    const movesTab = document.querySelector('.codex-tab[data-tab="moves"]');
    const movesPage = document.getElementById('tab-moves');
    if (movesTab) movesTab.classList.add('active');
    if (movesPage) movesPage.classList.add('active');
    renderMovesCodexTab();
  };

  // Hook Codex rendering & navigation so the MOVES (X/Y) tab works with both touch and D-Pad/X/Y/A buttons
  const _origRenderCodex = typeof renderCodex === 'function' ? renderCodex : null;
  if (_origRenderCodex) {
    renderCodex = function () {
      _origRenderCodex();
      renderMovesCodexTab();
    };
  }

  const _prevHandleCodexMenuInput = handleCodexMenuInput;
  handleCodexMenuInput = function (action) {
    if (state.startMenu && state.startMenu.open) {
      handleStartMenuInput(action);
      return;
    }
    const movesPage = document.getElementById('tab-moves');
    const isMovesTabActive = movesPage && movesPage.classList.contains('active');
    if (isMovesTabActive) {
      if (action === 'up') {
        selectedMovesMenuIdx = (selectedMovesMenuIdx - 1 + SPECIAL_MOVES_CATALOG.length) % SPECIAL_MOVES_CATALOG.length;
        audio.playSfx('slash');
        renderMovesCodexTab();
        return;
      }
      if (action === 'down') {
        selectedMovesMenuIdx = (selectedMovesMenuIdx + 1) % SPECIAL_MOVES_CATALOG.length;
        audio.playSfx('slash');
        renderMovesCodexTab();
        return;
      }
      const focusedMove = SPECIAL_MOVES_CATALOG[selectedMovesMenuIdx];
      if (focusedMove) {
        if (action === 'X') {
          window.assignSpecialMoveToButton(focusedMove.id, 'X');
          return;
        }
        if (action === 'Y') {
          window.assignSpecialMoveToButton(focusedMove.id, 'Y');
          return;
        }
        if (action === 'A') {
          const targetSlot = (state.player.equippedMoveX === focusedMove.id) ? 'Y' : 'X';
          window.assignSpecialMoveToButton(focusedMove.id, targetSlot);
          return;
        }
      }
    }
    _prevHandleCodexMenuInput(action);
    renderMovesCodexTab();
  };

  function bindXYControllerButtons() {
    const btnX = document.getElementById('btn-x');
    const btnY = document.getElementById('btn-y');

    if (btnX && !btnX._boundGen25XY) {
      btnX._boundGen25XY = true;
      const fireX = (e) => {
        if (e && e.cancelable) e.preventDefault();
        btnX.classList.add('pressed');
        window.executeActionX();
      };
      const releaseX = () => btnX.classList.remove('pressed');
      btnX.addEventListener('pointerdown', fireX, { passive: false });
      btnX.addEventListener('touchstart', fireX, { passive: false });
      btnX.addEventListener('pointerup', releaseX);
      btnX.addEventListener('pointercancel', releaseX);
      btnX.addEventListener('touchend', releaseX);
    }

    if (btnY && !btnY._boundGen25XY) {
      btnY._boundGen25XY = true;
      const fireY = (e) => {
        if (e && e.cancelable) e.preventDefault();
        btnY.classList.add('pressed');
        window.executeActionY();
      };
      const releaseY = () => btnY.classList.remove('pressed');
      btnY.addEventListener('pointerdown', fireY, { passive: false });
      btnY.addEventListener('touchstart', fireY, { passive: false });
      btnY.addEventListener('pointerup', releaseY);
      btnY.addEventListener('pointercancel', releaseY);
      btnY.addEventListener('touchend', releaseY);
    }

    if (!window._boundGen25KeyboardXY) {
      window._boundGen25KeyboardXY = true;
      window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        const k = (e.key || '').toLowerCase();
        if (k === 'x' || k === 'q') {
          if (btnX) btnX.classList.add('pressed');
          window.executeActionX();
        } else if (k === 'y' || k === 'e') {
          if (btnY) btnY.classList.add('pressed');
          window.executeActionY();
        }
      });
      window.addEventListener('keyup', (e) => {
        const k = (e.key || '').toLowerCase();
        if (k === 'x' || k === 'q') {
          if (btnX) btnX.classList.remove('pressed');
        } else if (k === 'y' || k === 'e') {
          if (btnY) btnY.classList.remove('pressed');
        }
      });
    }

    // Also ensure clicking any codex tab renders the Moves tab properly
    document.querySelectorAll('.codex-tab').forEach(tabEl => {
      if (!tabEl._boundMovesTabClick) {
        tabEl._boundMovesTabClick = true;
        tabEl.addEventListener('click', () => {
          setTimeout(renderMovesCodexTab, 10);
        });
      }
    });
  }

  // ============================================================================
  // PROGRESSIVE ENEMY, SUB-BOSS & BOSS DIFFICULTY SCALING ENGINE
  // ============================================================================
  function computeDifficultyScaleFactors(floorNum, cycleNum) {
    const f = Math.max(1, floorNum || state.currentFloor || 1);
    const c = Math.max(1, cycleNum || state.cycle || 1);
    const p = state.player || { level: 1, maxHp: 80 };
    const playerAtk = Math.max(6, typeof getPlayerTotalAtk === 'function' ? getPlayerTotalAtk(p) : 6);
    const playerDef = Math.max(0, typeof getPlayerTotalDef === 'function' ? getPlayerTotalDef(p) : 0);

    // Exponential Loop scaling + nonlinear depth curve so later floors and dungeon loops scale fiercely!
    const loopHpMult = Math.pow(1.75, c - 1) * (1 + (c - 1) * 0.55);
    const loopAtkMult = Math.pow(1.48, c - 1) * (1 + (c - 1) * 0.38);
    const floorHpMult = 1 + Math.pow(f - 1, 1.35) * 0.24;
    const floorAtkMult = 1 + Math.pow(f - 1, 1.25) * 0.16;

    return {
      f,
      c,
      playerAtk,
      playerDef,
      playerMaxHp: Math.max(80, p.maxHp || 80),
      loopHpMult,
      loopAtkMult,
      floorHpMult,
      floorAtkMult,
      speedMult: Math.min(1.55, 1 + (f - 1) * 0.018 + (c - 1) * 0.075),
    };
  }

  function applyDifficultyScalingToEnemy(e) {
    if (!e || e._scaledGen25Difficulty) return;
    e._scaledGen25Difficulty = true;

    const sc = computeDifficultyScaleFactors(state.currentFloor, state.cycle);
    const isSubBoss = !!e.isSubBoss;
    const isHenchman = !!e.isHenchman;

    // Ensure enemies cannot be trivially 1-shotted as player weapon ATK & Forge Stars climb!
    const minHitsToKill = isSubBoss
      ? (8.5 + sc.f * 0.65 + (sc.c - 1) * 3.2)
      : (isHenchman
          ? (4.0 + sc.f * 0.35 + (sc.c - 1) * 1.6)
          : (2.2 + (sc.f / 13) * 2.2 + (sc.c - 1) * 1.15));

    const scaledBaseHp = Math.round((e.maxHp || e.hp || 30) * sc.floorHpMult * sc.loopHpMult * (isSubBoss ? 1.45 : 1.18));
    const powerMatchedHp = Math.round(sc.playerAtk * minHitsToKill);
    e.maxHp = Math.max(scaledBaseHp, powerMatchedHp);
    e.hp = e.maxHp;

    // Scale enemy ATK so it stays dangerous even against high Armor DEF
    const scaledBaseAtk = Math.round((e.atk || 8) * sc.floorAtkMult * sc.loopAtkMult);
    const defPiercingFloor = Math.round(sc.playerDef * (0.45 + Math.min(0.35, (sc.c - 1) * 0.06))) +
      Math.round(sc.playerMaxHp * (isSubBoss ? (0.14 + (sc.c - 1) * 0.025) : (0.08 + (sc.c - 1) * 0.018)));
    e.atk = Math.max(scaledBaseAtk, defPiercingFloor);

    // Speed & aggro cadence boost on deeper floors and higher loops
    e.speed = Math.round((e.speed || 58) * sc.speedMult);
    e.damageResilience = isSubBoss
      ? Math.min(0.58, 0.22 + (sc.f * 0.015) + (sc.c - 1) * 0.08)
      : Math.min(0.42, (sc.f > 4 ? 0.10 : 0) + (sc.c - 1) * 0.06);
  }

  function applyDifficultyScalingToBoss(b) {
    if (!b || b._scaledGen25Difficulty) return;
    b._scaledGen25Difficulty = true;

    const sc = computeDifficultyScaleFactors(state.currentFloor, state.cycle);
    // Boss requires sustained multi-phase combat (at least 30..65+ hits worth of player ATK)
    const minBossHits = 30 + sc.f * 1.8 + (sc.c - 1) * 11;
    const scaledBaseHp = Math.round((b.maxHp || b.hp || 450) * sc.floorHpMult * sc.loopHpMult * 1.85);
    const powerMatchedBossHp = Math.round(sc.playerAtk * minBossHits);

    b.maxHp = Math.max(scaledBaseHp, powerMatchedBossHp);
    b.hp = b.maxHp;

    const scaledBossAtk = Math.round((b.atk || 22) * sc.floorAtkMult * sc.loopAtkMult * 1.25);
    const minBossThreatAtk = Math.round(sc.playerDef * 0.58) + Math.round(sc.playerMaxHp * (0.17 + Math.min(0.15, (sc.c - 1) * 0.03)));
    b.atk = Math.max(scaledBossAtk, minBossThreatAtk);
    b.speed = Math.round((b.speed || 52) * Math.min(1.6, sc.speedMult * 1.08));

    // Boss armor mitigation & per-hit burst cap so high-tier weapons cannot 2-shot bosses
    b.armorMitigation = Math.min(0.55, 0.20 + (sc.f / 13) * 0.14 + (sc.c - 1) * 0.07);
    b.maxBurstRatio = Math.max(0.038, 0.075 - (sc.c - 1) * 0.006);
    b.enragePhase = 1;
    b.specialShockwaveTimer = 4.2;

    if (typeof updateBossHpBar === 'function') updateBossHpBar();
  }

  window.scaleFloorCombatEntities = function () {
    if (Array.isArray(state.enemies)) {
      for (let i = 0; i < state.enemies.length; i++) {
        applyDifficultyScalingToEnemy(state.enemies[i]);
      }
    }
    if (state.boss && state.boss.hp > 0) {
      applyDifficultyScalingToBoss(state.boss);
    }
  };

  // Hook spawnChamberEnemies, spawnBossEnemy, and spawnBossHenchmanSquad so all newly spawned foes scale automatically
  if (typeof spawnChamberEnemies === 'function') {
    const _origSpawnChamberEnemies = spawnChamberEnemies;
    spawnChamberEnemies = function (...args) {
      const res = _origSpawnChamberEnemies.apply(this, args);
      window.scaleFloorCombatEntities();
      return res;
    };
  }
  if (typeof spawnBossEnemy === 'function') {
    const _origSpawnBossEnemy = spawnBossEnemy;
    spawnBossEnemy = function (...args) {
      const res = _origSpawnBossEnemy.apply(this, args);
      window.scaleFloorCombatEntities();
      return res;
    };
  }
  if (typeof spawnBossHenchmanSquad === 'function') {
    const _origSpawnBossHenchmanSquad = spawnBossHenchmanSquad;
    spawnBossHenchmanSquad = function (...args) {
      const res = _origSpawnBossHenchmanSquad.apply(this, args);
      window.scaleFloorCombatEntities();
      return res;
    };
  }

  // Wrap damageEnemy & damageBoss to enforce Elite/Boss Armor Resilience, Burst Caps, and Boss Move Discovery!
  const _prevDamageEnemy = damageEnemy;
  damageEnemy = function (e, amt) {
    if (e && !e._scaledGen25Difficulty) applyDifficultyScalingToEnemy(e);
    let finalAmt = amt;
    if (e && e.damageResilience > 0) {
      finalAmt = Math.max(2, Math.round(amt * (1 - e.damageResilience)));
      // Sub-boss per-hit burst cap (cannot lose more than 22% maxHp in a single hit)
      if (e.isSubBoss && e.maxHp > 0) {
        finalAmt = Math.min(finalAmt, Math.max(6, Math.round(e.maxHp * 0.22)));
      }
    }
    return _prevDamageEnemy(e, finalAmt);
  };

  const _prevDamageBoss = damageBoss;
  damageBoss = function (amt) {
    const b = state.boss;
    const wasAlive = !!(b && b.hp > 0);
    const bossFloor = state.currentFloor || 5;
    const currentCycle = state.cycle || 1;

    let finalAmt = amt;
    if (b && b.hp > 0) {
      if (!b._scaledGen25Difficulty) applyDifficultyScalingToBoss(b);
      const mitig = b.armorMitigation || 0.22;
      finalAmt = Math.max(3, Math.round(amt * (1 - mitig)));
      const maxSingleHit = Math.max(10, Math.round((b.maxHp || 500) * (b.maxBurstRatio || 0.07)));
      finalAmt = Math.min(finalAmt, maxSingleHit);
    }

    const res = _prevDamageBoss(finalAmt);

    // Check if the Boss was just defeated to trigger Periodic Special Move Discovery!
    if (wasAlive && (!state.boss || state.boss.hp <= 0)) {
      window.checkAndUnlockBossSpecialMove(bossFloor, currentCycle);
    }
    return res;
  };

  // Multi-phase Boss Enrage & Elite Sub-Boss Shockwave AI ticks during update()
  function updateBossAndEliteEscalation(dt) {
    const p = state.player;
    if (!p || state.isPaused || state.isTransitioning) return;

    // 1. Boss Multi-Phase Enrage & Seismic Counter-Slam
    const b = state.boss;
    if (b && b.hp > 0) {
      if (!b._scaledGen25Difficulty) applyDifficultyScalingToBoss(b);
      const hpRatio = b.hp / Math.max(1, b.maxHp);
      const targetPhase = (hpRatio <= 0.32) ? 3 : (hpRatio <= 0.65 ? 2 : 1);
      if (targetPhase > (b.enragePhase || 1)) {
        b.enragePhase = targetPhase;
        b.speed = Math.round(b.speed * 1.16);
        b.atk = Math.round(b.atk * 1.15);
        state.screenShake = Math.max(state.screenShake || 0, 12);
        audio.playSfx('boss_roar');
        showFloater(
          targetPhase === 3 ? `🔥 BOSS ABYSSAL OVERDRIVE!` : `⚠️ BOSS ENRAGED (PHASE 2)!`,
          b.x,
          b.y - 46,
          '#ff1744'
        );
      }

      // Faster attack recovery in Phase 2 & Phase 3 + periodic Boss Seismic Shockwave
      if ((b.enragePhase || 1) >= 2 && b.attackCooldown > 0) {
        b.attackCooldown = Math.max(0, b.attackCooldown - dt * ((b.enragePhase === 3) ? 0.55 : 0.30));
      }

      b.specialShockwaveTimer = (b.specialShockwaveTimer || 4.0) - dt;
      if (b.specialShockwaveTimer <= 0) {
        const cycle = Math.max(1, state.cycle || 1);
        b.specialShockwaveTimer = Math.max(2.4, 5.2 - (b.enragePhase || 1) * 0.7 - (cycle - 1) * 0.25);
        const distToHero = Math.hypot(p.x - b.x, p.y - b.y);
        if (distToHero < 210) {
          const shockRadius = 125 + (b.enragePhase || 1) * 18;
          state.specialShockwaves.push({
            x: b.x,
            y: b.y,
            r: 14,
            maxR: shockRadius,
            color: '#dc2626',
            ringColor: '#fb7185',
            alpha: 0.95,
            lineWidth: 6,
            isSeismic: true,
          });
          state.screenShake = Math.max(state.screenShake || 0, 8);
          if (distToHero <= shockRadius && (p.specialJumpZ || 0) < 22 && (p.spikeInvuln || 0) <= 0) {
            if (!attemptShieldBlock(b)) {
              const minDmg = Math.max(7, Math.round(p.maxHp * (0.10 + (cycle - 1) * 0.02)));
              const rawDmg = Math.max(minDmg, Math.round(b.atk * 0.85) - Math.round(getPlayerTotalDef(p) * 0.55));
              p.hp = Math.max(0, p.hp - rawDmg);
              p.spikeInvuln = 0.65;
              state.redFlash = 0.32;
              showFloater(`-${rawDmg} BOSS SHOCKWAVE!`, p.x, p.y - 28, '#ff1744');
              updateHud();
            }
          }
        }
      }
    }
  }

  // Validate and repair player, minion, camera, and floor tile coordinates so corrupted/legacy save data can never cause a black screen
  window.ensureValidPlayerAndCameraPosition = function () {
    if (!state) return;
    if (!Number.isFinite(state.currentFloor) || state.currentFloor < 1 || state.currentFloor > 13) {
      state.currentFloor = 1;
    }
    if (!Number.isFinite(state.cycle) || state.cycle < 1) {
      state.cycle = 1;
    }
    if (!Array.isArray(state.map) || state.map.length < DUNGEON_ROWS) {
      try {
        generateDungeonFloor(state.currentFloor || 1);
      } catch (e) {}
    }
    const p = state.player;
    if (!p) return;

    if (!Number.isFinite(p.maxHp) || p.maxHp < 40) p.maxHp = 80;
    if (!Number.isFinite(p.hp) || p.hp <= 0) p.hp = p.maxHp;

    const minWorld = TILE_SIZE * 2;
    const maxWorldX = (DUNGEON_COLS - 2) * TILE_SIZE;
    const maxWorldY = (DUNGEON_ROWS - 2) * TILE_SIZE;

    let defaultX = TILE_SIZE * 10 + 32;
    let defaultY = TILE_SIZE * 10 + 32;
    if (state.floorStartSpawn && Number.isFinite(state.floorStartSpawn.x) && Number.isFinite(state.floorStartSpawn.y)) {
      defaultX = state.floorStartSpawn.x;
      defaultY = state.floorStartSpawn.y;
    } else if (Array.isArray(state.rooms) && state.rooms[0]) {
      const rm0 = state.rooms[0];
      defaultX = (rm0.x + Math.floor(rm0.w / 2)) * TILE_SIZE + 32;
      defaultY = (rm0.y + Math.floor(rm0.h / 2)) * TILE_SIZE + 32;
    }

    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < minWorld || p.x > maxWorldX || p.y < minWorld || p.y > maxWorldY) {
      p.x = defaultX;
      p.y = defaultY;
    }
    if (!Number.isFinite(p.z)) {
      p.z = 0;
    }

    // Ensure the tile beneath the player is walkable floor (never T_ABYSS or wall)
    if (Array.isArray(state.map) && state.map.length === DUNGEON_ROWS) {
      const pr = Math.max(2, Math.min(DUNGEON_ROWS - 3, Math.floor(p.y / TILE_SIZE)));
      const pc = Math.max(2, Math.min(DUNGEON_COLS - 3, Math.floor(p.x / TILE_SIZE)));
      const curTile = state.map[pr] ? state.map[pr][pc] : T_ABYSS;
      if (curTile === T_ABYSS || isWallTile(curTile)) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const rr = pr + dr;
            const cc = pc + dc;
            if (state.map[rr] && (state.map[rr][cc] === T_ABYSS || isWallTile(state.map[rr][cc]))) {
              state.map[rr][cc] = T_FLOOR_COBBLE;
            }
          }
        }
      }
    }

    if (state.minion) {
      if (!Number.isFinite(state.minion.x) || !Number.isFinite(state.minion.y) || Math.hypot(state.minion.x - p.x, state.minion.y - p.y) > TILE_SIZE * 8) {
        state.minion.x = p.x - 36;
        state.minion.y = p.y + 6;
      }
      if (!Number.isFinite(state.minion.z)) {
        state.minion.z = p.z || 0;
      }
    }

    const inCinematic = !!(state.finaleCinematic && state.finaleCinematic.active);
    if (!state.camera) {
      state.camera = { x: p.x, y: p.y };
    } else if (
      !Number.isFinite(state.camera.x) ||
      !Number.isFinite(state.camera.y) ||
      (!inCinematic && Math.hypot(state.camera.x - p.x, state.camera.y - p.y) > TILE_SIZE * 20)
    ) {
      state.camera.x = p.x;
      state.camera.y = p.y;
    }
  };

  // Hook into update() and render() to run Special Moves, Shockwaves, and Difficulty Scaling
  const _prevUpdateForMoves = update;
  update = function (dt) {
    // While hero is high in the air during a Jump-Slam move, grant temporary invulnerability to ground traps/strikes
    if (state.player && state.player.specialJumpZ > 18) {
      state.player.spikeInvuln = Math.max(state.player.spikeInvuln || 0, 0.12);
    }
    _prevUpdateForMoves(dt);
    try {
      updateSpecialMovesAndShockwaves(dt);
      updateBossAndEliteEscalation(dt);
    } catch (e) {}
  };

  // Elevate Badger's rendered Y position by `p.specialJumpZ` during Jump-Slam moves!
  const _prevDrawPlayerHeroForMoves = drawPlayerHero;
  drawPlayerHero = function (p, now) {
    const jumpZ = (p && p.specialJumpZ > 0) ? p.specialJumpZ : 0;
    const origZ = p ? (p.z || 0) : 0;
    if (p && jumpZ > 0) {
      p.z = origZ + jumpZ;
    }
    try {
      _prevDrawPlayerHeroForMoves(p, now);
    } finally {
      if (p && jumpZ > 0) {
        p.z = origZ;
      }
    }
  };

  const _prevRenderForMoves = render;
  render = function () {
    _prevRenderForMoves();
    renderSpecialMovesOverlay();
  };

  // Unified single-instance Game Loop with Dual-Heartbeat (requestAnimationFrame + setInterval fallback)
  // so Android WebView timer/rAF throttling can NEVER freeze the game or leave a black canvas!
  let _lastLoopWallMs = 0;
  let _loopTickInProgress = false;
  let _backupIntervalId = null;

  function executeGameLoopStep(nowTs) {
    if (_loopTickInProgress) return;
    _loopTickInProgress = true;
    try {
      const now = (typeof nowTs === 'number' && Number.isFinite(nowTs)) ? nowTs : performance.now();
      _lastLoopWallMs = performance.now();
      if (!Number.isFinite(state.lastTime) || now < state.lastTime) {
        state.lastTime = now - 16.67;
      }
      const dt = Math.max(0.001, Math.min(0.1, (now - state.lastTime) / 1000));
      state.lastTime = now;

      if (!state.isPaused) {
        update(dt);
      }
      render();
    } catch (err) {
      console.error("Game loop frame error:", err);
    } finally {
      _loopTickInProgress = false;
    }
  }

  gameLoop = function (now) {
    requestAnimationFrame(gameLoop);
    executeGameLoopStep(now);
  };

  function ensureDualHeartbeatRunning() {
    if (!_backupIntervalId) {
      _backupIntervalId = setInterval(() => {
        const elapsedSinceLastFrame = performance.now() - _lastLoopWallMs;
        if (elapsedSinceLastFrame > 52) {
          executeGameLoopStep(performance.now());
        }
      }, 33);
    }
  }

  window.forceWakeupAndRenderGame = function () {
    try {
      if (state.finaleCinematic && state.finaleCinematic.active && state.finaleCinematic.elapsed === 0) {
        state.finaleCinematic.active = false;
      }
      if (state.isPaused && state.pauseReason !== 'manual') {
        state.isPaused = false;
        state.pauseReason = null;
      }
      resizeCanvas();
      window.ensureValidPlayerAndCameraPosition();
      updatePauseButtonUi();
      if (typeof updateHud === 'function') updateHud();
      if (typeof window.syncControllerXYLabels === 'function') window.syncControllerXYLabels();
      render();
      ensureDualHeartbeatRunning();
      if (performance.now() - _lastLoopWallMs > 40) {
        state.lastTime = performance.now();
        requestAnimationFrame(gameLoop);
      }
    } catch (e) {
      console.error("forceWakeupAndRenderGame error:", e);
    }
  };

  let _hasInitializedGame = false;
  const _origInitGame = initGame;
  initGame = function () {
    if (_hasInitializedGame && state.map && state.map.length === DUNGEON_ROWS) {
      window.forceWakeupAndRenderGame();
      return;
    }
    _hasInitializedGame = true;
    state.isPaused = false;
    state.pauseReason = null;
    if (state.finaleCinematic) {
      state.finaleCinematic.active = false;
    }
    loadSaveSlotsFromStorage();
    try {
      _origInitGame();
    } catch (err) {
      console.error("InitGame fallback recovery:", err);
      try {
        generateDungeonFloor(1);
      } catch (e2) {
        console.error("Floor 1 fallback error:", e2);
      }
    }
    if (!state.map || state.map.length === 0) {
      try {
        generateDungeonFloor(1);
      } catch (e3) {}
    }
    state.isPaused = false;
    state.pauseReason = null;
    ensurePlayerMoveFields();
    window.ensureRetroactiveBossMoves();
    window.scaleFloorCombatEntities();
    window.ensureValidPlayerAndCameraPosition();
    ensureStartMenuModalDom();
    bindStartMenuControllerButton();
    bindPauseControllerButtonAndLifecycle();
    bindXYControllerButtons();
    window.syncControllerXYLabels();
    updatePauseButtonUi();
    syncActivePlaythroughToSlots();

    // Immediately resize and paint Frame 0 synchronously so the canvas is never black on startup!
    resizeCanvas();
    render();
    ensureDualHeartbeatRunning();
    state.lastTime = performance.now();
    requestAnimationFrame(gameLoop);

    // Schedule layout-stabilization re-renders as Android WebView finalizes viewport dimensions
    [30, 120, 350, 900].forEach(delayMs => {
      setTimeout(() => {
        window.forceWakeupAndRenderGame();
      }, delayMs);
    });
  };

  // Start the game immediately (since script is at the end of <body>) AND hook DOMContentLoaded / load
  initGame();
  window.addEventListener('DOMContentLoaded', () => window.forceWakeupAndRenderGame());
  window.addEventListener('load', () => window.forceWakeupAndRenderGame());
})();



