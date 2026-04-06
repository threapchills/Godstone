import { BoltSpell, PlaceSpell, GeasSpell } from './Spell.js'

// The player's spell loadout, with progressive unlocks tied to total
// tablets ever picked up. Owns the active selection, dispatches casts,
// and ticks down per-spell cooldowns.

const UNLOCK_ORDER = ['bolt', 'place', 'geas']

export default class SpellBook {
  constructor(params) {
    this.params = params
    // Build all three spells up front; the unlock check just gates which
    // are usable at any given moment.
    this.allSpells = {
      bolt: new BoltSpell(),
      place: new PlaceSpell(params.element1),
      geas: new GeasSpell(),
    }
    this.unlockedCount = 0 // updated each frame from God.totalEverCollected
    this.activeIndex = 0
  }

  // unlockCount: how many slots are visible. Derived from total tablets
  // ever picked up: 0 = none, 1 = bolt, 2 = bolt+place, 3+ = full loadout.
  setUnlockCount(totalEverCollected) {
    this.unlockedCount = Math.min(3, totalEverCollected)
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
  // Returns true on success.
  cast(scene, targetX, targetY) {
    const spell = this.active()
    if (!spell) return false
    if (spell.cooldownRemaining > 0) return false
    if (spell.cast(scene, targetX, targetY)) {
      spell.cooldownRemaining = spell.cooldown
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
