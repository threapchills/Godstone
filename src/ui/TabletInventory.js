import { GAME_WIDTH, TILE_SIZE } from '../core/Constants.js'

// Corner HUD: a column of tablet glyphs with carry counts. The slot
// the nearest village currently wants is ringed in gold so the player
// always knows what to fetch next.

const SLOT_W = 28
const SLOT_H = 28
const PADDING_X = 12
const PADDING_Y = 96

export default class TabletInventory {
  constructor(scene, stages) {
    this.scene = scene
    this.stages = [...stages].sort((a, b) => a - b)
    this.slots = []

    const baseX = PADDING_X
    const baseY = PADDING_Y

    // Heading
    this.heading = scene.add.text(baseX, baseY - 14, 'Tablets', {
      fontFamily: 'Georgia, serif',
      fontSize: '11px',
      color: '#9affe6',
      stroke: '#000000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(50)

    // Build a slot per known stage
    this.stages.forEach((stage, i) => {
      const x = baseX + i * (SLOT_W + 4)
      const y = baseY

      const back = scene.add.rectangle(x + SLOT_W / 2, y + SLOT_H / 2, SLOT_W, SLOT_H, 0x000000, 0.55)
        .setStrokeStyle(1, 0x444444, 0.8)
        .setScrollFactor(0)
        .setDepth(50)

      const glyph = this._ensureGlyph(stage)
      const icon = scene.add.image(x + SLOT_W / 2, y + SLOT_H / 2 - 2, glyph)
        .setScrollFactor(0)
        .setDepth(51)

      const label = scene.add.text(x + SLOT_W - 4, y + SLOT_H - 4, '0', {
        fontFamily: 'Georgia, serif',
        fontSize: '10px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(1, 1).setScrollFactor(0).setDepth(52)

      this.slots.push({ stage, back, icon, label, glow: null })
    })
  }

  // Build a tiny canvas glyph per tablet stage so they read distinct.
  // Stage 2: dot. 3: vertical bar. 4: triangle. 5: square. 6: pentagon. 7: star.
  _ensureGlyph(stage) {
    const key = `tablet-glyph-${stage}`
    if (this.scene.textures.exists(key)) return key
    const c = document.createElement('canvas')
    c.width = 16
    c.height = 16
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#9affe6'
    ctx.strokeStyle = '#003322'
    ctx.lineWidth = 1

    const cx = 8, cy = 8
    if (stage <= 2) {
      ctx.beginPath()
      ctx.arc(cx, cy, 4, 0, Math.PI * 2)
      ctx.fill()
    } else if (stage === 3) {
      ctx.fillRect(cx - 1, 2, 2, 12)
    } else if (stage === 4) {
      ctx.beginPath()
      ctx.moveTo(cx, 2)
      ctx.lineTo(14, 13)
      ctx.lineTo(2, 13)
      ctx.closePath()
      ctx.fill()
    } else if (stage === 5) {
      ctx.fillRect(3, 3, 10, 10)
    } else if (stage === 6) {
      // Pentagon
      ctx.beginPath()
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5
        const px = cx + Math.cos(a) * 6
        const py = cy + Math.sin(a) * 6
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.fill()
    } else {
      // Star
      ctx.beginPath()
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        const r = i % 2 === 0 ? 7 : 3
        const px = cx + Math.cos(a) * r
        const py = cy + Math.sin(a) * r
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.fill()
    }
    this.scene.textures.addCanvas(key, c)
    return key
  }

  // Drive the HUD from God state + the nearest village's wanted stage.
  // wantedStage may be null when no village is in range or all are maxed.
  update(godTablets, wantedStage) {
    for (const slot of this.slots) {
      const count = godTablets[slot.stage] || 0
      slot.label.setText(String(count))

      const isWanted = wantedStage === slot.stage
      const isHeld = count > 0

      // Subtle visual states: held tablets glow soft teal, the wanted
      // slot rings gold, empty slots fade.
      if (isWanted) {
        slot.back.setStrokeStyle(2, 0xdaa520, 1)
        slot.icon.setAlpha(1)
        slot.icon.setScale(1.1)
      } else if (isHeld) {
        slot.back.setStrokeStyle(1, 0x9affe6, 0.9)
        slot.icon.setAlpha(1)
        slot.icon.setScale(1)
      } else {
        slot.back.setStrokeStyle(1, 0x444444, 0.6)
        slot.icon.setAlpha(0.35)
        slot.icon.setScale(1)
      }
    }
  }
}
