import { selectSpells } from './Spell.js'

// The god's spell loadout: 3 spells selected by element pair + ratio.
// Slot 1 (offensive) available from start, Slot 2 (tactical) at 3
// tablets, Slot 3 (ultimate) at 5 tablets. Cooldowns are fixed by
// slot: 0.9s / 3.5s / 8.5s, shaved from the original 1.2/4/10 in the
// fun pass so the cast rhythm matches the new mana generosity. All
// spells cost 1 mana; avatar form waives the cost and quickens the
// cooldown further.

const SLOT_COOLDOWNS = [900, 3500, 8500]
const UNLOCK_THRESHOLDS = [0, 3, 5] // tablets needed per slot

export default class SpellBook {
  constructor(params) {
    this.params = params
    // Element-driven spell selection
    this.spells = selectSpells(params.element1, params.element2, params.elementRatio)
    // Override cooldowns by slot position
    this.spells.forEach((s, i) => { s.cooldown = SLOT_COOLDOWNS[i] })
    this.unlockedCount = 1
    this.activeIndex = 0
  }

  setUnlockCount(highestTablet) {
    let count = 0
    for (let i = 0; i < 3; i++) {
      if (highestTablet >= UNLOCK_THRESHOLDS[i]) count = i + 1
    }
    this.unlockedCount = count
  }

  unlockedSpells() {
    return this.spells.slice(0, this.unlockedCount)
  }

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

  select(index) {
    if (index >= 0 && index < this.unlockedCount) {
      this.activeIndex = index
    }
  }

  cast(scene, targetX, targetY) {
    const spell = this.active()
    if (!spell) return false
    if (spell.cooldownRemaining > 0) return false
    const god = scene.god
    const avatar = !!god?.isAvatar
    if (god && !avatar && god.mana < spell.manaCost) {
      if (scene.showMessage) scene.showMessage('Not enough mana. Keep moving to recharge.', 1200)
      return false
    }
    if (spell.cast(scene, targetX, targetY)) {
      // Avatar form: free casts at 35% cooldown. Ten seconds of being
      // the storm is the payoff the wrath meter promises.
      spell.cooldownRemaining = avatar ? spell.cooldown * 0.35 : spell.cooldown
      if (god && !avatar) god.mana = Math.max(0, god.mana - spell.manaCost)
      return true
    }
    return false
  }

  update(delta) {
    for (const sp of this.spells) {
      if (sp.cooldownRemaining > 0) {
        sp.cooldownRemaining = Math.max(0, sp.cooldownRemaining - delta)
      }
    }
  }
}
