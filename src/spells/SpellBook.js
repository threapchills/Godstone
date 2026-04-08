import { BoltSpell, PlaceSpell, GeasSpell, ElementalBurstSpell } from './Spell.js'

// The player's spell loadout, with progressive unlocks tied to total
// tablets ever picked up. Owns the active selection, dispatches casts,
// and ticks down per-spell cooldowns.
//
// Slot order: bolt → elemental burst → place → geas. Bolt is the first
// gift; the elemental burst is the second, biggest, and the spell that
// makes the world's element matter mechanically; place and geas are
// the utility / soft-power tail.

const UNLOCK_ORDER = ['bolt', 'burst', 'place', 'geas']

export default class SpellBook {
  constructor(params) {
    this.params = params
    // Build all four spells up front; the unlock check just gates which
    // are usable at any given moment.
    this.allSpells = {
      bolt: new BoltSpell(),
      burst: new ElementalBurstSpell(params.element1),
      place: new PlaceSpell(params.element1),
      geas: new GeasSpell(),
    }
    this.unlockedCount = 0 // updated each frame from God.highestTablet
    this.activeIndex = 0
  }

  // unlockCount: how many slots are visible. Derived from the god's
  // highest tablet level (since tablets are persistent and incremental):
  // 0 = none, 1 = bolt, 2 = +burst, 3 = +place, 4+ = full loadout.
  setUnlockCount(highestTablet) {
    this.unlockedCount = Math.min(4, highestTablet)
  }

  unlockedSpells() {
    return UNLOCK_ORDER.slice(0, this.unlockedCount).map(k => this.allSpells[k])
  }

  // Returns the active spell, or null if no spells are unlocked.
  active() {
    const list = this.unlockedSpells()
    if (list.length === 0) return null
    return list[this.activeIndex % list.length]
  }

  cycle(direction) {
    const n = this.unlockedSpells().length
    if (n === 0) return
    this.activeIndex = ((this.activeIndex + direction) % n + n) % n
  }

  // Try to cast the active spell at the given world coordinates.
  // Returns true on success. Casts cost mana from the god; an empty
  // pool blocks the cast and surfaces a hint.
  cast(scene, targetX, targetY) {
    const spell = this.active()
    if (!spell) return false
    if (spell.cooldownRemaining > 0) return false
    const god = scene.god
    if (god && god.mana < spell.manaCost) {
      if (scene.showMessage) scene.showMessage('Not enough mana. Keep moving to recharge.', 1200)
      return false
    }
    if (spell.cast(scene, targetX, targetY)) {
      spell.cooldownRemaining = spell.cooldown
      if (god) god.mana = Math.max(0, god.mana - spell.manaCost)
      return true
    }
    return false
  }

  update(delta) {
    for (const key of UNLOCK_ORDER) {
      const sp = this.allSpells[key]
      if (sp.cooldownRemaining > 0) {
        sp.cooldownRemaining = Math.max(0, sp.cooldownRemaining - delta)
      }
    }
  }
}
