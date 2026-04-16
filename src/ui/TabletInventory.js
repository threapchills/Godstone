import { GAME_WIDTH, TILE_SIZE } from '../core/Constants.js'

// Corner HUD: a row of tablet glyphs, one per tablet the god carries.
// Tablets are persistent and level-agnostic, so each slot is a numbered
// level (1, 2, 3, ...). Slots light up as the player collects them in
// order. The slot the nearest village currently needs is ringed gold.
//
// The widget grows on demand: whenever the god's collection outstrips
// the existing slot count (via raid statues, invading gods defeated,
// etc.), new slots are minted in place so progression toward stage 20
// is always visible. Slots wrap onto a second row past the screen
// margin so ultra-late-game displays stay legible.

const SLOT_W = 26
const SLOT_H = 26
const SLOT_GAP = 4
const PADDING_X = 12
// Sits below the HP gauge column (top-left HUD ends at y ≈ 100)
const PADDING_Y = 122
const ROW_GAP = 6

// Colours per tier: tablets below stage 8 read cyan (home-world), stage
// 8+ read gold (god statues carried home from raid worlds). The shift
// gives the player a satisfying visual sense of having earned something
// different, and keeps the late-game wall of slots from looking flat.
const COLOUR_HOME = '#9affe6'
const COLOUR_STATUE = '#ffd166'

export default class TabletInventory {
  constructor(scene, initialSlotCount) {
    this.scene = scene
    this.slots = []
    // Track starting slot count so we can prime at least as many slots
    // as the world has tablets, even before the player picks any up.
    this._initialSlotCount = Math.max(1, initialSlotCount || 1)

    const baseX = PADDING_X
    const baseY = PADDING_Y

    // Heading
    this.heading = scene.add.text(baseX, baseY - 14, 'Tablets', {
      fontFamily: 'Georgia, serif',
      fontSize: '11px',
      color: COLOUR_HOME,
      stroke: '#000000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(50)

    // Container we can scale or hide in one go if ever needed.
    this._ensureSlots(this._initialSlotCount)
  }

  // Make sure at least `count` slots exist. Called from update when the
  // god's highest tablet exceeds current capacity.
  _ensureSlots(count) {
    while (this.slots.length < count) this._addSlot()
  }

  _addSlot() {
    const idx = this.slots.length
    const level = idx + 1

    // Layout: up to 10 slots per row, then wrap. Keeps the HUD width
    // bounded even when the god holds 20+ tablets.
    const row = Math.floor(idx / 10)
    const col = idx % 10
    const x = PADDING_X + col * (SLOT_W + SLOT_GAP)
    const y = PADDING_Y + row * (SLOT_H + ROW_GAP)

    const back = this.scene.add.rectangle(x + SLOT_W / 2, y + SLOT_H / 2, SLOT_W, SLOT_H, 0x000000, 0.55)
      .setStrokeStyle(1, 0x444444, 0.8)
      .setScrollFactor(0)
      .setDepth(50)

    const glyphKey = this._ensureGlyph(level)
    const icon = this.scene.add.image(x + SLOT_W / 2, y + SLOT_H / 2 - 2, glyphKey)
      .setScrollFactor(0)
      .setDepth(51)

    const label = this.scene.add.text(x + SLOT_W - 4, y + SLOT_H - 4, String(level), {
      fontFamily: 'Georgia, serif',
      fontSize: '9px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(52)

    const slot = { level, back, icon, label, _registered: false }
    this.slots.push(slot)

    // Register the new slot with the HUD container so it picks up the
    // standard zoom-compensation. The scene exposes hudContainer.
    const hud = this.scene.hudContainer
    if (hud) {
      hud.add(back); hud.add(icon); hud.add(label)
      slot._registered = true
    }
  }

  /** All game objects belonging to this widget, for initial HUD container
   *  registration. New slots added after construction register themselves
   *  via _addSlot. */
  getAllObjects() {
    const objs = [this.heading]
    for (const s of this.slots) objs.push(s.back, s.icon, s.label)
    return objs
  }

  // Build a small canvas glyph per level. Stages 1-7 stay on geometric
  // primitives (tablets). Stages 8+ use a distinct "statue" glyph —
  // a tiny torchbearer silhouette — so raid-earned levels look earned.
  _ensureGlyph(level) {
    const key = `tablet-glyph-lvl-${level}`
    if (this.scene.textures.exists(key)) return key
    const c = document.createElement('canvas')
    c.width = 16
    c.height = 16
    const ctx = c.getContext('2d')

    const isStatue = level >= 8
    ctx.fillStyle = isStatue ? '#ffd166' : COLOUR_HOME

    const cx = 8, cy = 8
    if (isStatue) {
      // Tiny deity silhouette: a column with an orb above.
      ctx.fillRect(cx - 1, 4, 2, 10)          // column
      ctx.beginPath()                           // base
      ctx.ellipse(cx, 14, 5, 1.5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()                           // orb
      ctx.arc(cx, 3, 2.5, 0, Math.PI * 2)
      ctx.fill()
    } else if (level === 1) {
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
  // village is in range or all are maxed out. Widget self-grows if
  // the god has more tablets than slots currently rendered.
  update(highestTablet, wantedLevel) {
    // Ensure the widget has at least one slot per owned tablet plus one
    // hungry slot up front so the player always sees the next goal.
    const target = Math.max(this._initialSlotCount, highestTablet + 1)
    if (this.slots.length < target) this._ensureSlots(Math.min(20, target))

    for (const slot of this.slots) {
      const isOwned = highestTablet >= slot.level
      const isStatue = slot.level >= 8
      const isWanted = wantedLevel === slot.level
      const ownedColour = isStatue ? 0xffd166 : 0x9affe6

      if (isWanted) {
        slot.back.setStrokeStyle(2, 0xdaa520, 1)
        slot.icon.setAlpha(isOwned ? 1 : 0.55)
        slot.icon.setScale(1.1)
      } else if (isOwned) {
        slot.back.setStrokeStyle(1, ownedColour, 0.9)
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
