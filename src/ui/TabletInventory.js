import { GAME_WIDTH, TILE_SIZE } from '../core/Constants.js'

// Corner HUD: a row of tablet glyphs, one per tablet that exists in
// the world. Tablets are persistent and level-agnostic, so each slot
// is a numbered level (1, 2, 3, ...). Slots light up as the player
// collects them in order. The slot the nearest village currently
// needs is ringed in gold.

const SLOT_W = 28
const SLOT_H = 28
const PADDING_X = 12
// Sits below the HP gauge column (top-left HUD ends at y ≈ 100)
const PADDING_Y = 122

export default class TabletInventory {
  constructor(scene, slotCount) {
    this.scene = scene
    this.slotCount = slotCount
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

    // One slot per tablet that exists in the world. Level is positional.
    for (let i = 0; i < slotCount; i++) {
      const level = i + 1
      const x = baseX + i * (SLOT_W + 4)
      const y = baseY

      const back = scene.add.rectangle(x + SLOT_W / 2, y + SLOT_H / 2, SLOT_W, SLOT_H, 0x000000, 0.55)
        .setStrokeStyle(1, 0x444444, 0.8)
        .setScrollFactor(0)
        .setDepth(50)

      const glyph = this._ensureGlyph(level)
      const icon = scene.add.image(x + SLOT_W / 2, y + SLOT_H / 2 - 2, glyph)
        .setScrollFactor(0)
        .setDepth(51)

      const label = scene.add.text(x + SLOT_W - 4, y + SLOT_H - 4, String(level), {
        fontFamily: 'Georgia, serif',
        fontSize: '10px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(1, 1).setScrollFactor(0).setDepth(52)

      this.slots.push({ level, back, icon, label })
    }
  }

  // Build a small canvas glyph per level. Different shapes per level
  // give the slots distinct silhouettes at a glance.
  _ensureGlyph(level) {
    const key = `tablet-glyph-lvl-${level}`
    if (this.scene.textures.exists(key)) return key
    const c = document.createElement('canvas')
    c.width = 16
    c.height = 16
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#9affe6'

    const cx = 8, cy = 8
    if (level === 1) {
      ctx.beginPath()
      ctx.arc(cx, cy, 4, 0, Math.PI * 2)
      ctx.fill()
    } else if (level === 2) {
      ctx.fillRect(cx - 1, 2, 2, 12)
    } else if (level === 3) {
      ctx.beginPath()
      ctx.moveTo(cx, 2)
      ctx.lineTo(14, 13)
      ctx.lineTo(2, 13)
      ctx.closePath()
      ctx.fill()
    } else if (level === 4) {
      ctx.fillRect(3, 3, 10, 10)
    } else if (level === 5) {
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
      // Star (level 6+)
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

  // Drive the HUD from the god's highest collected tablet level + the
  // nearest village's wanted level. wantedLevel may be null when no
  // village is in range or all are maxed out.
  update(highestTablet, wantedLevel) {
    for (const slot of this.slots) {
      const isOwned = highestTablet >= slot.level
      const isWanted = wantedLevel === slot.level

      if (isWanted) {
        slot.back.setStrokeStyle(2, 0xdaa520, 1)
        slot.icon.setAlpha(isOwned ? 1 : 0.55)
        slot.icon.setScale(1.1)
      } else if (isOwned) {
        slot.back.setStrokeStyle(1, 0x9affe6, 0.9)
        slot.icon.setAlpha(1)
        slot.icon.setScale(1)
      } else {
        slot.back.setStrokeStyle(1, 0x444444, 0.6)
        slot.icon.setAlpha(0.3)
        slot.icon.setScale(1)
      }
    }
  }
}
