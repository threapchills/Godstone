import { GAME_WIDTH, GAME_HEIGHT } from '../core/Constants.js'

// Three-slot spell bar: element-coloured glyphs, cooldown sweeps,
// mana segments, active ring. Slot 1 = offensive, 2 = tactical, 3 = ultimate.

const SLOT_W = 36
const SLOT_H = 36
const SLOT_GAP = 6
const SLOT_COUNT = 3

const ELEM_GLYPH_COLOURS = {
  fire: '#ff7733', water: '#5588ee', air: '#ddeeff', earth: '#aa8844', hybrid: '#cc88dd',
}

// Glyph shapes by slot type (offensive / tactical / ultimate)
const SLOT_SHAPES = ['projectile', 'shield', 'star']

export default class SpellBar {
  constructor(scene) {
    this.scene = scene
    this.slots = []

    const totalW = SLOT_W * SLOT_COUNT + SLOT_GAP * (SLOT_COUNT - 1)
    const baseX = (GAME_WIDTH - totalW) / 2
    const baseY = GAME_HEIGHT - SLOT_H - 18

    this.label = scene.add.text(GAME_WIDTH / 2, baseY - 14, '', {
      fontFamily: 'Georgia, serif',
      fontSize: '11px',
      color: '#9affe6',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(50)

    // Mana bar
    const manaW = totalW
    const manaY = baseY - 26
    this.manaBack = scene.add.rectangle(GAME_WIDTH / 2, manaY, manaW, 4, 0x222244, 0.85)
      .setScrollFactor(0).setDepth(50)
    this.manaFill = scene.add.rectangle(GAME_WIDTH / 2 - manaW / 2, manaY, manaW, 4, 0x4488dd, 1)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(51)
    this.manaTicks = []
    for (let i = 1; i < 3; i++) {
      this.manaTicks.push(
        scene.add.rectangle(GAME_WIDTH / 2 - manaW / 2 + (manaW * i / 3), manaY, 1, 4, 0x000000, 0.6)
          .setScrollFactor(0).setDepth(52)
      )
    }

    for (let i = 0; i < SLOT_COUNT; i++) {
      const x = baseX + i * (SLOT_W + SLOT_GAP)
      const cx = x + SLOT_W / 2
      const cy = baseY + SLOT_H / 2

      const back = scene.add.rectangle(cx, cy, SLOT_W, SLOT_H, 0x000000, 0.55)
        .setStrokeStyle(1, 0x444444, 0.8)
        .setScrollFactor(0).setDepth(50)

      const glyphKey = this._ensureSlotGlyph(i)
      const icon = scene.add.image(cx, cy - 2, glyphKey)
        .setScrollFactor(0).setDepth(51)

      const cdMask = scene.add.rectangle(cx, cy + SLOT_H / 2, SLOT_W - 2, 0, 0x000000, 0.55)
        .setOrigin(0.5, 1).setScrollFactor(0).setDepth(52)

      const hotkey = scene.add.text(cx - SLOT_W / 2 + 3, cy - SLOT_H / 2 + 2, String(i + 1), {
        fontFamily: 'Georgia, serif',
        fontSize: '9px',
        color: '#888888',
        stroke: '#000000',
        strokeThickness: 1,
      }).setScrollFactor(0).setDepth(52)

      this.slots.push({ back, icon, cdMask, hotkey, cx, cy })
    }
  }

  getAllObjects() {
    const objs = [this.label, this.manaBack, this.manaFill, ...this.manaTicks]
    for (const s of this.slots) objs.push(s.back, s.icon, s.cdMask, s.hotkey)
    return objs
  }

  _ensureSlotGlyph(slotIdx) {
    // Determine element colour from the spell that will occupy this slot
    const params = this.scene.params || {}
    const e1 = params.element1 || 'fire'
    const e2 = params.element2 || 'earth'
    const ratio = params.elementRatio ?? 5
    const isHybrid = ratio === 5

    let elemForSlot
    if (isHybrid) {
      elemForSlot = slotIdx === 0 ? e1 : slotIdx === 1 ? e2 : 'hybrid'
    } else {
      const dominant = ratio > 5 ? e1 : e2
      const secondary = ratio > 5 ? e2 : e1
      elemForSlot = slotIdx < 2 ? dominant : secondary
    }

    const colour = ELEM_GLYPH_COLOURS[elemForSlot] || '#ffffff'
    const shape = SLOT_SHAPES[slotIdx] || 'projectile'
    const key = `spell-glyph-${slotIdx}-${elemForSlot}`
    if (this.scene.textures.exists(key)) return key

    const c = document.createElement('canvas')
    c.width = 22; c.height = 22
    const ctx = c.getContext('2d')

    if (shape === 'projectile') {
      // Arrow/bolt shape
      ctx.fillStyle = colour
      ctx.beginPath()
      ctx.moveTo(4, 11)
      ctx.lineTo(18, 4)
      ctx.lineTo(16, 11)
      ctx.lineTo(18, 18)
      ctx.closePath()
      ctx.fill()
    } else if (shape === 'shield') {
      // Shield/circle
      ctx.strokeStyle = colour
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(11, 11, 8, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = colour
      ctx.globalAlpha = 0.3
      ctx.beginPath()
      ctx.arc(11, 11, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    } else {
      // Star burst (ultimate)
      ctx.fillStyle = colour
      ctx.beginPath()
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2
        const r = i % 2 === 0 ? 10 : 4
        const method = i === 0 ? 'moveTo' : 'lineTo'
        ctx[method](11 + Math.cos(a) * r, 11 + Math.sin(a) * r)
      }
      ctx.closePath()
      ctx.fill()
    }

    this.scene.textures.addCanvas(key, c)
    return key
  }

  update(spellBook, god) {
    const list = spellBook.unlockedSpells()
    const active = spellBook.active()

    if (god && this.manaFill) {
      const totalW = this.manaBack.width
      const fraction = Math.max(0, Math.min(1, god.mana / god.maxMana))
      this.manaFill.width = totalW * fraction
    }

    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]
      const spell = list[i]
      if (!spell) {
        slot.back.setStrokeStyle(1, 0x222222, 0.5)
        slot.icon.setAlpha(0.18)
        slot.cdMask.height = 0
        continue
      }

      const isActive = spell === active
      if (isActive) {
        slot.back.setStrokeStyle(2, 0xdaa520, 1)
        slot.icon.setAlpha(1)
      } else {
        slot.back.setStrokeStyle(1, 0x9affe6, 0.7)
        slot.icon.setAlpha(0.85)
      }

      const cdFraction = spell.cooldown > 0 ? spell.cooldownRemaining / spell.cooldown : 0
      slot.cdMask.height = (SLOT_H - 2) * cdFraction
    }

    if (active) {
      this.label.setText(active.name)
    } else {
      this.label.setText('')
    }
  }
}
