import { TILE_SIZE } from '../core/Constants.js'
import Phaser from 'phaser'

// An ancient tablet: the key to advancing a village's civilisational stage.
// Found deep underground; must be physically carried to a village. The
// visual treatment is deliberately loud — bloom halo, vertical godray,
// orbiting motes, drifting glyph pip — so it reads through pitch black
// caves from at least eight tiles away. When the god draws close the
// glow swells and a procedural shimmer plays.

const PROXIMITY_TRIGGER = TILE_SIZE * 2.5
const PROXIMITY_RELEASE = TILE_SIZE * 4
const SHAFT_HEIGHT = TILE_SIZE * 12
const MOTE_COUNT = 5

export default class Tablet {
  constructor(scene, tileX, tileY, stage) {
    this.scene = scene
    this.tileX = tileX
    this.tileY = tileY
    this.stage = stage // which civilisational stage this unlocks
    this.collected = false
    this._proximate = false
    this._motePhase = Math.random() * Math.PI * 2
    this._bobPhase = Math.random() * Math.PI * 2

    const px = tileX * TILE_SIZE + TILE_SIZE / 2
    const py = tileY * TILE_SIZE + TILE_SIZE / 2

    this.createSprite(scene, px, py)
    this.createAura(scene, px, py)
  }

  createSprite(scene, px, py) {
    const size = TILE_SIZE
    const key = 'tablet-sprite'

    if (!scene.textures.exists(key)) {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')

      // Tablet: a small stone slab with glowing runes
      ctx.fillStyle = '#8a8a7a'
      ctx.fillRect(1, 1, size - 2, size - 2)
      ctx.fillStyle = '#00ffaa'
      ctx.fillRect(2, 2, 1, 1)
      ctx.fillRect(4, 3, 1, 1)
      ctx.fillRect(3, 5, 2, 1)
      ctx.fillRect(5, 2, 1, 2)
      ctx.strokeStyle = '#6a6a5a'
      ctx.strokeRect(0.5, 0.5, size - 1, size - 1)

      scene.textures.addCanvas(key, canvas)
    }

    this.sprite = scene.add.sprite(px, py, key)
    this.sprite.setDepth(6)
  }

  // Build the loud advertisement layers around the slab. Each one uses
  // additive blending so the disc reads as a literal light source rather
  // than a flat decal painted on top of the world.
  createAura(scene, px, py) {
    const ADD = Phaser.BlendModes.ADD

    // Outer soft halo: huge, low alpha, slow pulse. Provides the
    // overall "there is a thing here" beacon visible from far away.
    this.outerHalo = scene.add.circle(px, py, TILE_SIZE * 6, 0x00ffcc, 0.18)
      .setDepth(4)
      .setBlendMode(ADD)
    scene.tweens.add({
      targets: this.outerHalo,
      scale: { from: 0.85, to: 1.15 },
      alpha: { from: 0.18, to: 0.08 },
      duration: 1800,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    })

    // Inner bright core: tighter, brighter, faster pulse. Carries the
    // urgency once the eye has been drawn in by the outer halo.
    this.innerHalo = scene.add.circle(px, py, TILE_SIZE * 2.2, 0x9affe6, 0.6)
      .setDepth(5)
      .setBlendMode(ADD)
    scene.tweens.add({
      targets: this.innerHalo,
      scale: { from: 0.9, to: 1.25 },
      alpha: { from: 0.6, to: 0.35 },
      duration: 900,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    })

    // Vertical godray: a slim rectangle reaching toward the ceiling so
    // the tablet's location is readable as a column of light from above.
    this.shaft = scene.add.rectangle(px, py - SHAFT_HEIGHT / 2, TILE_SIZE * 1.4, SHAFT_HEIGHT, 0x00ffcc, 0.22)
      .setDepth(5)
      .setBlendMode(ADD)
    this.shaft.setOrigin(0.5, 0.5)
    scene.tweens.add({
      targets: this.shaft,
      scaleX: { from: 0.7, to: 1.15 },
      alpha: { from: 0.22, to: 0.12 },
      duration: 1200,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    })

    // Orbiting motes: small additive dots circling on a slow rotation.
    // Phase-staggered so they spread evenly around the circle.
    this.motes = []
    for (let i = 0; i < MOTE_COUNT; i++) {
      const mote = scene.add.circle(px, py, 1.6, 0xc8fff0, 0.95)
        .setDepth(7)
        .setBlendMode(ADD)
      mote.baseAngle = (i / MOTE_COUNT) * Math.PI * 2
      this.motes.push(mote)
    }

    // Glyph pip: a small diamond hovering above the slab, gently bobbing.
    // Visible against any background because of additive blend.
    const pipKey = 'tablet-glyph'
    if (!scene.textures.exists(pipKey)) {
      const c = document.createElement('canvas')
      c.width = 6
      c.height = 6
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#9affe6'
      ctx.beginPath()
      ctx.moveTo(3, 0)
      ctx.lineTo(6, 3)
      ctx.lineTo(3, 6)
      ctx.lineTo(0, 3)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(2, 2, 2, 2)
      scene.textures.addCanvas(pipKey, c)
    }
    this.pip = scene.add.image(px, py - TILE_SIZE * 1.6, pipKey)
      .setDepth(7)
      .setBlendMode(ADD)
  }

  // Called from WorldScene each frame. Animates the orbiting motes and
  // checks proximity for the swell + shimmer cue.
  update(delta, godSprite, ambience) {
    if (this.collected) return

    const px = this.tileX * TILE_SIZE + TILE_SIZE / 2
    const py = this.tileY * TILE_SIZE + TILE_SIZE / 2

    // Rotate the motes around the slab. Slight radius wobble for life.
    this._motePhase += delta * 0.0015
    this._bobPhase += delta * 0.003
    const baseRadius = TILE_SIZE * 1.5 + Math.sin(this._motePhase * 1.7) * 1.5
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i]
      const a = m.baseAngle + this._motePhase
      m.x = px + Math.cos(a) * baseRadius
      m.y = py + Math.sin(a) * baseRadius * 0.55 // squashed orbit reads as 3d
    }

    // Glyph pip gentle bob
    this.pip.y = py - TILE_SIZE * 1.6 - Math.sin(this._bobPhase) * 1.5
    this.pip.alpha = 0.75 + Math.sin(this._bobPhase * 1.3) * 0.2

    // Proximity reactivity: swell on entry, play one-shot shimmer.
    // Hysteresis (trigger ≠ release) prevents rapid re-trigger if the
    // god is dancing on the boundary.
    if (godSprite) {
      const dx = godSprite.x - px
      const dy = godSprite.y - py
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (!this._proximate && dist < PROXIMITY_TRIGGER) {
        this._proximate = true
        this.swell()
        if (ambience && ambience.playTabletShimmer) ambience.playTabletShimmer()
      } else if (this._proximate && dist > PROXIMITY_RELEASE) {
        this._proximate = false
      }
    }
  }

  // One-shot bloom on the inner halo and the pip when the god draws near.
  swell() {
    this.scene.tweens.add({
      targets: this.innerHalo,
      scale: 2.0,
      alpha: 1.0,
      duration: 220,
      ease: 'Quad.easeOut',
      yoyo: true,
    })
    this.scene.tweens.add({
      targets: this.pip,
      scale: 1.8,
      duration: 280,
      ease: 'Quad.easeOut',
      yoyo: true,
    })
  }

  collect() {
    if (this.collected) return false
    this.collected = true
    this.sprite.setVisible(false)
    this.outerHalo.setVisible(false)
    this.innerHalo.setVisible(false)
    this.shaft.setVisible(false)
    this.pip.setVisible(false)
    for (const m of this.motes) m.setVisible(false)
    return true
  }

  get worldX() { return this.tileX * TILE_SIZE + TILE_SIZE / 2 }
  get worldY() { return this.tileY * TILE_SIZE + TILE_SIZE / 2 }
}
