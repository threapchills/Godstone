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

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' })
  }

  preload() {
    // --- Minimal assets loaded inline for the loading screen itself ---
    // Mountains and clouds for the backdrop (small files, load fast)
    this.load.image('dist_mountains', 'assets/storybook_overhaul/distant_mountains.png')
    this.load.image('fluffy_clouds', 'assets/storybook_overhaul/fluffy_clouds.png')
    this.load.image('sb_totem', 'assets/storybook_overhaul/totem.png')
    this.load.image('sb_magic_runes', 'assets/storybook_overhaul/magic_runes.png')

    // --- All game assets ---
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

    // Storybook overhaul sprites
    this.load.image('sb_tree_ancient', 'assets/storybook_overhaul/tree_ancient.png')
    this.load.image('sb_bushes', 'assets/storybook_overhaul/bushes.png')
    this.load.image('sb_rocks', 'assets/storybook_overhaul/rocks.png')
    this.load.image('sb_fireplace', 'assets/storybook_overhaul/fireplace.png')
    this.load.image('sb_teepee', 'assets/storybook_overhaul/teepee.png')
    this.load.image('sb_stone_altar', 'assets/storybook_overhaul/stone_altar.png')
    this.load.image('sb_giant_crystals', 'assets/storybook_overhaul/giant_crystals.png')
    this.load.image('sb_stalactite', 'assets/storybook_overhaul/stalactite.png')
    this.load.image('sb_mossy_boulder', 'assets/storybook_overhaul/mossy_boulder.png')
    this.load.image('sb_giant_mushrooms', 'assets/storybook_overhaul/giant_mushrooms.png')
    this.load.image('sb_pine_tree', 'assets/storybook_overhaul/pine_tree.png')
    this.load.image('sb_dead_tree', 'assets/storybook_overhaul/dead_tree.png')

    // Sky variant paintings
    for (const key of SKY_VARIANTS) {
      this.load.image(`skyvar_${key}`, `assets/backgrounds/sky-variants/${key}.png`)
    }

    // Modular god part assets (heads, bodies, legs per element)
    for (const part of ALL_GOD_PARTS) {
      this.load.image(part.key, part.path)
    }

    // Track loading progress
    this.load.on('progress', (value) => {
      this._progress = value
    })
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
    this.add.text(cx, cy - 55, 'Shape your world. Build civilisations. Conquer the omniverse.', {
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
    this.statusText = this.add.text(cx, barY + 22, 'Preparing...', {
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

    // Animate the loading bar (assets are already loaded by preload;
    // this simulates a smooth fill then transitions)
    this._displayProgress = 0
    this._targetProgress = 1.0
    this._ready = false

    // Small delay so the screen paints before we transition
    this.time.delayedCall(800, () => {
      this._ready = true
    })
  }

  update() {
    if (!this.progressFill) return

    // Smooth progress interpolation
    const target = this._ready ? this._targetProgress : (this._progress || 0)
    this._displayProgress += (target - this._displayProgress) * 0.06

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
    if (fill < 0.3) {
      this.statusText.setText('Gathering elements...')
    } else if (fill < 0.6) {
      this.statusText.setText('Weaving the terrain...')
    } else if (fill < 0.9) {
      this.statusText.setText('Awakening the world...')
    } else {
      this.statusText.setText('Ready')
    }

    // Transition to CreationScene once the bar fills
    if (this._ready && this._displayProgress > 0.98 && !this._transitioning) {
      this._transitioning = true
      // Fade out gracefully
      this.cameras.main.fadeOut(600, 0, 0, 0)
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('Creation')
      })
    }
  }
}
