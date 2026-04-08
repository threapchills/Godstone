import { GAME_WIDTH, GAME_HEIGHT } from '../core/Constants.js'

// Three-slot spell bar in the bottom-centre. Active slot ringed gold,
// cooldown overlay sweeps up the slot from the bottom while the spell
// is on cooldown. Locked slots fade out.

const SLOT_W = 36
const SLOT_H = 36
const SLOT_GAP = 6

export default class SpellBar {
  constructor(scene) {
    this.scene = scene
    this.slots = []

    const totalW = SLOT_W * 4 + SLOT_GAP * 3
    const baseX = (GAME_WIDTH - totalW) / 2
    const baseY = GAME_HEIGHT - SLOT_H - 18

    // Bar heading
    this.label = scene.add.text(GAME_WIDTH / 2, baseY - 14, '', {
      fontFamily: 'Georgia, serif',
      fontSize: '11px',
      color: '#9affe6',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(50)

    // Mana bar above the slot row. Width matches the row of slots so
    // it reads as part of the same widget.
    const manaW = totalW
    const manaY = baseY - 26
    this.manaBack = scene.add.rectangle(GAME_WIDTH / 2, manaY, manaW, 4, 0x222244, 0.85)
      .setScrollFactor(0).setDepth(50)
    this.manaFill = scene.add.rectangle(GAME_WIDTH / 2 - manaW / 2, manaY, manaW, 4, 0x4488dd, 1)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(51)
    // Tick marks splitting the bar into 3 segments (one per mana point)
    for (let i = 1; i < 3; i++) {
      scene.add.rectangle(GAME_WIDTH / 2 - manaW / 2 + (manaW * i / 3), manaY, 1, 4, 0x000000, 0.6)
        .setScrollFactor(0).setDepth(52)
    }

    for (let i = 0; i < 4; i++) {
      const x = baseX + i * (SLOT_W + SLOT_GAP)
      const cx = x + SLOT_W / 2
      const cy = baseY + SLOT_H / 2

      const back = scene.add.rectangle(cx, cy, SLOT_W, SLOT_H, 0x000000, 0.55)
        .setStrokeStyle(1, 0x444444, 0.8)
        .setScrollFactor(0)
        .setDepth(50)

      const glyphKey = this._ensureSlotGlyph(i)
      const icon = scene.add.image(cx, cy - 2, glyphKey)
        .setScrollFactor(0)
        .setDepth(51)

      const cdMask = scene.add.rectangle(cx, cy + SLOT_H / 2, SLOT_W - 2, 0, 0x000000, 0.55)
        .setOrigin(0.5, 1)
        .setScrollFactor(0)
        .setDepth(52)

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

  _ensureSlotGlyph(slotIdx) {
    // Slot order matches SpellBook UNLOCK_ORDER: bolt, burst, place, geas
    const keys = ['spell-bolt', 'spell-burst', 'spell-place', 'spell-geas']
    const key = keys[slotIdx]
    if (this.scene.textures.exists(key)) return key

    const c = document.createElement('canvas')
    c.width = 22
    c.height = 22
    const ctx = c.getContext('2d')

    if (slotIdx === 0) {
      // Bolt: jagged lightning
      ctx.fillStyle = '#9affe6'
      ctx.beginPath()
      ctx.moveTo(13, 1)
      ctx.lineTo(7, 12)
      ctx.lineTo(11, 12)
      ctx.lineTo(8, 21)
      ctx.lineTo(15, 9)
      ctx.lineTo(11, 9)
      ctx.closePath()
      ctx.fill()
    } else if (slotIdx === 1) {
      // Burst: a four-rayed sun. Tinted by element name on first build
      // so each god gets their own glyph colour.
      const elem = this.scene.params?.element1 || 'fire'
      const burstColours = {
        fire:  '#ff7733',
        water: '#5588ee',
        air:   '#ddeeff',
        earth: '#aa7733',
      }
      ctx.fillStyle = burstColours[elem] || '#ffffff'
      ctx.beginPath()
      ctx.arc(11, 11, 4, 0, Math.PI * 2)
      ctx.fill()
      // Four rays
      ctx.strokeStyle = burstColours[elem] || '#ffffff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(11, 1); ctx.lineTo(11, 6)
      ctx.moveTo(11, 21); ctx.lineTo(11, 16)
      ctx.moveTo(1, 11); ctx.lineTo(6, 11)
      ctx.moveTo(21, 11); ctx.lineTo(16, 11)
      ctx.stroke()
    } else if (slotIdx === 2) {
      // Place: stack of small squares
      ctx.fillStyle = '#aa8866'
      ctx.fillRect(4, 14, 14, 4)
      ctx.fillRect(6, 9, 10, 4)
      ctx.fillRect(8, 4, 6, 4)
    } else {
      // Geas: open eye / rune
      ctx.strokeStyle = '#daa520'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(2, 11)
      ctx.quadraticCurveTo(11, 2, 20, 11)
      ctx.quadraticCurveTo(11, 20, 2, 11)
      ctx.closePath()
      ctx.stroke()
      ctx.fillStyle = '#daa520'
      ctx.beginPath()
      ctx.arc(11, 11, 3, 0, Math.PI * 2)
      ctx.fill()
    }

    this.scene.textures.addCanvas(key, c)
    return key
  }

  update(spellBook, god) {
    const list = spellBook.unlockedSpells()
    const active = spellBook.active()

    // Mana bar fill: god.mana is 0..maxMana, we render as a fraction
    if (god && this.manaFill) {
      const totalW = this.manaBack.width
      const fraction = Math.max(0, Math.min(1, god.mana / god.maxMana))
      this.manaFill.width = totalW * fraction
    }

    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]
      const spell = list[i]
      if (!spell) {
        // Locked
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

      // Cooldown sweep
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
