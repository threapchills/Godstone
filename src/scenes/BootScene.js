import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../core/Constants.js'
import { SKY_VARIANTS } from '../world/AssetVariants.js'
import { ALL_GOD_PARTS } from '../god/GodPartManifest.js'

// Atmospheric loading tips that cycle while assets load and world generates.
const TIPS = [
  'Dig deep; ancient tablets hide near the core',
  'Deliver tablets to villages to grow civilisations',
  'Each element pair births a unique biome',
  'Villages need your presence; stay close to sustain belief',
  'The portal henge links your world to the omniverse',
  'Press space to fly; hold it for sustained lift',
  'Higher stages unlock warriors, bodyguards, and spells',
  'Defeat invading gods to earn extra knowledge tablets',
  'Raid enemy worlds to earn god statues',
  'God statues unlock civilisation tiers beyond stage 7',
]

// Two-phase boot: the first preload pulls in only three tiny images
// (mountains, clouds, runes) so the loading screen can paint almost
// immediately. The heavy game assets are queued in create() and loaded
// afterward, with the progress bar driven by that second pass. This
// prevents the "blank screen for ages, then a near-full progress bar
// for a split second" experience that previously leaked during the
// large initial load.

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' })
  }

  preload() {
    // Phase 1: minimal UI assets ONLY. These three files are each a
    // few hundred KB at most; they land in ~1 s on any connection and
    // the loading screen paints as soon as create() runs.
    this.load.image('dist_mountains', 'assets/storybook_overhaul/distant_mountains.png')
    this.load.image('fluffy_clouds', 'assets/storybook_overhaul/fluffy_clouds.png')
    this.load.image('sb_magic_runes', 'assets/storybook_overhaul/magic_runes.png')
  }

  create() {
    const cx = GAME_WIDTH / 2
    const cy = GAME_HEIGHT / 2

    // Dark gradient background
    this.cameras.main.setBackgroundColor('#0a0b12')

    // Distant mountains silhouette at the bottom
    if (this.textures.exists('dist_mountains')) {
      this.add.image(cx, GAME_HEIGHT - 20, 'dist_mountains')
        .setOrigin(0.5, 1).setScale(1.4).setAlpha(0.25).setTint(0x2a3a5a)
    }

    // Drifting clouds, very subtle
    if (this.textures.exists('fluffy_clouds')) {
      const cloud = this.add.image(cx + 100, cy - 80, 'fluffy_clouds')
        .setOrigin(0.5).setScale(1.2).setAlpha(0.12).setTint(0x4a5a8a)
      this.tweens.add({
        targets: cloud,
        x: cx - 100,
        duration: 18000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    }

    // Floating runes behind the title
    if (this.textures.exists('sb_magic_runes')) {
      const runes = this.add.image(cx, cy - 60, 'sb_magic_runes')
        .setOrigin(0.5).setScale(0.6).setAlpha(0.08)
      this.tweens.add({
        targets: runes,
        alpha: 0.15,
        scale: 0.65,
        duration: 3000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    }

    // Title
    this.add.text(cx, cy - 100, 'GODSTONE', {
      fontFamily: 'Georgia, serif',
      fontSize: '62px',
      color: '#e4b660',
      stroke: '#3a2a10',
      strokeThickness: 6,
    }).setOrigin(0.5).setShadow(3, 5, '#000000', 8, true, true)

    // Tagline
    this.add.text(cx, cy - 55, 'Shape your world.  Build civilisations.  Conquer the omniverse.', {
      fontFamily: 'Georgia, serif',
      fontSize: '13px',
      color: '#7a8a6a',
      fontStyle: 'italic',
    }).setOrigin(0.5)

    // Progress bar track
    const barWidth = 280
    const barHeight = 6
    const barX = cx - barWidth / 2
    const barY = cy + 20

    this.add.graphics()
      .fillStyle(0x1a1c2a, 0.9)
      .fillRoundedRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4, 4)
      .lineStyle(1, 0x3a4a5a, 0.6)
      .strokeRoundedRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4, 4)

    this.progressFill = this.add.graphics()
    this.progressGlow = this.add.graphics()

    // Status text
    this.statusText = this.add.text(cx, barY + 22, 'Preparing the altar...', {
      fontFamily: 'Georgia, serif',
      fontSize: '12px',
      color: '#5a6a7a',
    }).setOrigin(0.5)

    // Cycling tips
    this.tipText = this.add.text(cx, cy + 80, TIPS[0], {
      fontFamily: 'Georgia, serif',
      fontSize: '11px',
      color: '#4a5a6a',
      fontStyle: 'italic',
    }).setOrigin(0.5)

    this._tipIndex = 0
    this.time.addEvent({
      delay: 3000,
      loop: true,
      callback: () => {
        this._tipIndex = (this._tipIndex + 1) % TIPS.length
        this.tweens.add({
          targets: this.tipText,
          alpha: 0,
          duration: 300,
          onComplete: () => {
            this.tipText.setText(TIPS[this._tipIndex])
            this.tweens.add({ targets: this.tipText, alpha: 1, duration: 300 })
          },
        })
      },
    })

    // Orbiting motes around the title for atmosphere
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2
      const radius = 140 + Math.random() * 40
      const mote = this.add.circle(
        cx + Math.cos(angle) * radius,
        cy - 80 + Math.sin(angle) * radius * 0.35,
        1.5, 0xe4b660, 0.4,
      ).setBlendMode(1) // ADD
      this.tweens.add({
        targets: mote,
        x: cx + Math.cos(angle + Math.PI) * radius,
        y: cy - 80 + Math.sin(angle + Math.PI) * radius * 0.35,
        duration: 6000 + Math.random() * 3000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    }

    // Store bar geometry
    this._barX = barX
    this._barY = barY
    this._barWidth = barWidth
    this._barHeight = barHeight

    this._displayProgress = 0
    this._targetProgress = 0
    this._ready = false
    this._progress = 0

    // Phase 2: queue all the real game assets and kick off a fresh
    // Loader pass so the progress bar reflects genuine download state
    // rather than a purely cosmetic fill.
    this._queueGameAssets()
    this.load.on('progress', (value) => {
      this._progress = value
      this._targetProgress = value
    })
    this.load.on('complete', () => {
      this._progress = 1
      this._targetProgress = 1
      // Small pacing beat so the "Ready" status is readable before the
      // fade to Creation kicks in. Without this the bar's final fill and
      // the scene transition can feel simultaneous.
      this.time.delayedCall(500, () => {
        this._ready = true
      })
    })
    this.load.start()
  }

  // Queue the entire game asset catalogue on the existing Loader. The
  // Loader was already created by Phaser for phase 1 but is idle now,
  // so we can pile on more requests and restart it.
  _queueGameAssets() {
    // Environment
    this.load.image('sb_tileset', 'assets/environment/island_tileset.png')
    this.load.image('sb_tree', 'assets/backgrounds/tree-variant1.png')
    this.load.image('sb_grass', 'assets/environment/grass.png')
    this.load.image('sb_sky1', 'assets/backgrounds/sky_layer_1.jpeg')
    this.load.image('sb_sky2', 'assets/backgrounds/sky_layer_2.png')
    this.load.image('sb_clouds', 'assets/backgrounds/clouds_fg.png')
    this.load.image('sb_teepee_blue', 'assets/environment/teepee_blue.png')
    this.load.image('sb_teepee_green', 'assets/environment/teepee_green.png')
    this.load.image('leaf', 'assets/environment/leaf.png')

    // ── Storybook overhaul: terrain tile blocks ──
    this.load.image('sb_grass_block', 'assets/storybook_overhaul/grass_block.png')
    this.load.image('sb_dirt_block', 'assets/storybook_overhaul/dirt_block.png')
    this.load.image('sb_cave_block', 'assets/storybook_overhaul/cave_block.png')
    this.load.image('sb_lava_block', 'assets/storybook_overhaul/lava_block.png')
    this.load.image('sb_desert_block', 'assets/storybook_overhaul/desert_block.png')
    this.load.image('sb_snow_block', 'assets/storybook_overhaul/snow_block.png')
    this.load.image('sb_deep_water', 'assets/storybook_overhaul/deep_water.png')
    this.load.image('sb_water_surface', 'assets/storybook_overhaul/water_surface.png')
    this.load.image('sb_grass_ledge_left', 'assets/storybook_overhaul/grass_ledge_left.png')
    this.load.image('sb_grass_ledge_right', 'assets/storybook_overhaul/grass_ledge_right.png')

    // ── Storybook overhaul: trees and flora ──
    this.load.image('sb_tree_ancient', 'assets/storybook_overhaul/tree_ancient.png')
    this.load.image('sb_pine_tree', 'assets/storybook_overhaul/pine_tree.png')
    this.load.image('sb_dead_tree', 'assets/storybook_overhaul/dead_tree.png')
    this.load.image('sb_bushes', 'assets/storybook_overhaul/bushes.png')
    this.load.image('sb_rocks', 'assets/storybook_overhaul/rocks.png')
    this.load.image('sb_giant_mushrooms', 'assets/storybook_overhaul/giant_mushrooms.png')
    this.load.image('sb_giant_crystals', 'assets/storybook_overhaul/giant_crystals.png')
    this.load.image('sb_stalactite', 'assets/storybook_overhaul/stalactite.png')
    this.load.image('sb_mossy_boulder', 'assets/storybook_overhaul/mossy_boulder.png')

    // ── Storybook overhaul: structures ──
    this.load.image('sb_teepee', 'assets/storybook_overhaul/teepee.png')
    this.load.image('sb_fireplace', 'assets/storybook_overhaul/fireplace.png')
    this.load.image('sb_chest', 'assets/storybook_overhaul/chest.png')
    this.load.image('sb_loot_crate', 'assets/storybook_overhaul/loot_crate.png')
    this.load.image('sb_stone_altar', 'assets/storybook_overhaul/stone_altar.png')
    this.load.image('sb_signpost', 'assets/storybook_overhaul/signpost.png')
    this.load.image('sb_wooden_bridge', 'assets/storybook_overhaul/wooden_bridge.png')
    this.load.image('sb_dungeon_door', 'assets/storybook_overhaul/dungeon_door.png')
    this.load.image('sb_canoe', 'assets/storybook_overhaul/canoe.png')
    this.load.image('sb_wooden_barrel', 'assets/storybook_overhaul/wooden_barrel.png')
    this.load.image('sb_anvil', 'assets/storybook_overhaul/anvil.png')
    this.load.image('sb_totem', 'assets/storybook_overhaul/totem.png')

    // ── Storybook overhaul: characters ──
    this.load.image('sb_villager_1', 'assets/storybook_overhaul/villager_1.png')
    this.load.image('sb_villager_2', 'assets/storybook_overhaul/villager_2.png')
    this.load.image('sb_villager_3', 'assets/storybook_overhaul/villager_3.png')
    this.load.image('sb_villager_4', 'assets/storybook_overhaul/villager_4.png')
    this.load.image('sb_warrior_base', 'assets/storybook_overhaul/warrior_base.png')
    this.load.image('sb_player_base', 'assets/storybook_overhaul/player_base.png')

    // ── Storybook overhaul: critters ──
    this.load.image('sb_stag_deer', 'assets/storybook_overhaul/stag_deer.png')
    this.load.image('sb_bear', 'assets/storybook_overhaul/bear.png')
    this.load.image('sb_eagle', 'assets/storybook_overhaul/eagle.png')
    this.load.image('sb_aquatic_fish', 'assets/storybook_overhaul/aquatic_fish.png')
    this.load.image('sb_pig', 'assets/storybook_overhaul/pig.png')
    this.load.image('sb_pet_cloud', 'assets/storybook_overhaul/pet_cloud.png')

    // ── Storybook overhaul: NPCs ──
    this.load.image('sb_traveling_merchant', 'assets/storybook_overhaul/traveling_merchant.png')
    this.load.image('sb_royal_character', 'assets/storybook_overhaul/royal_character.png')
    this.load.image('sb_hooded_mystic', 'assets/storybook_overhaul/hooded_mystic.png')
    this.load.image('sb_elemental_spirit', 'assets/storybook_overhaul/elemental_spirit.png')
    this.load.image('sb_undead_warrior', 'assets/storybook_overhaul/undead_warrior.png')

    // ── Storybook overhaul: spells and projectiles ──
    this.load.image('sb_fireball_spell', 'assets/storybook_overhaul/fireball_spell.png')
    this.load.image('sb_lightning_bolt', 'assets/storybook_overhaul/lightning_bolt.png')
    this.load.image('sb_icicle_projectile', 'assets/storybook_overhaul/icicle_projectile.png')
    this.load.image('sb_heal_aura', 'assets/storybook_overhaul/heal_aura.png')
    this.load.image('sb_shield_bubble', 'assets/storybook_overhaul/shield_bubble.png')
    this.load.image('sb_star_particles', 'assets/storybook_overhaul/star_particles.png')
    this.load.image('sb_boulder_projectile', 'assets/storybook_overhaul/boulder_projectile.png')
    this.load.image('sb_sword_slash', 'assets/storybook_overhaul/sword_slash.png')
    this.load.image('sb_dark_smoke', 'assets/storybook_overhaul/dark_smoke.png')
    this.load.image('sb_arrow_projectile', 'assets/storybook_overhaul/arrow_projectile.png')

    // Sky variant paintings
    for (const key of SKY_VARIANTS) {
      this.load.image(`skyvar_${key}`, `assets/backgrounds/sky-variants/${key}.png`)
    }

    // Modular god part assets (heads, bodies, legs per element)
    for (const part of ALL_GOD_PARTS) {
      this.load.image(part.key, part.path)
    }
  }

  update() {
    if (!this.progressFill) return

    // Smooth progress interpolation — the target comes directly from
    // the Phaser Loader's progress events now, so the bar moves in
    // lockstep with real download state.
    const target = this._targetProgress || 0
    this._displayProgress += (target - this._displayProgress) * 0.08

    const fill = this._displayProgress
    const w = fill * this._barWidth

    this.progressFill.clear()
    if (w > 1) {
      this.progressFill.fillStyle(0xe4b660, 0.9)
      this.progressFill.fillRoundedRect(this._barX, this._barY, w, this._barHeight, 3)
    }

    // Glow at the leading edge
    this.progressGlow.clear()
    if (w > 4) {
      this.progressGlow.fillStyle(0xffe8a0, 0.3)
      this.progressGlow.fillCircle(this._barX + w, this._barY + this._barHeight / 2, 8)
    }

    // Status text updates
    if (fill < 0.25) {
      this.statusText.setText('Gathering elements...')
    } else if (fill < 0.55) {
      this.statusText.setText('Weaving the terrain...')
    } else if (fill < 0.85) {
      this.statusText.setText('Awakening the world...')
    } else if (fill < 0.99) {
      this.statusText.setText('Kindling the hearth...')
    } else {
      this.statusText.setText('Ready')
    }

    // Transition to CreationScene once loading finishes and the bar
    // has visibly filled. The _ready flag is set after a short beat so
    // the final state is readable.
    if (this._ready && this._displayProgress > 0.985 && !this._transitioning) {
      this._transitioning = true
      this.cameras.main.fadeOut(600, 0, 0, 0)
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('Creation')
      })
    }
  }
}
