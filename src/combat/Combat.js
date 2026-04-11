// Combat tuning constants — all in one place so Mike can rebalance
// without hunting through entity classes. These are first-pass values;
// tune freely once the loop is playable.

export const COMBAT = {
  god: {
    maxHp: 100,
    contactDamage: 6,    // damage taken when an enemy lands a melee hit
    touchKillRadius: 18, // px; god touching a unit within this radius kills it instantly
    arrowDamageToGod: 5, // each arrow hit on a god deals this much (20 arrows to kill)
  },
  enemyGod: {
    maxHp: 120,
    boltDamage: 12,
    boltCooldown: 1300, // ms between shadow bolts
    boltRange: 18 * 8,  // tiles converted to px
    seekRange: 60 * 8,  // px
    engageRange: 14 * 8,
    fleeBelowHpFraction: 0.3,
    speed: 130,
    jumpVelocity: -300,
    flyVelocity: -180,
    flyHorizSpeed: 110,
    touchKillRadius: 18,  // enemy god also kills units on touch
    maxMana: 3,
    boltManaCost: 1,
    manaRegenPerSecond: 3 / 120,
  },
  bodyguard: {
    maxHpByStage: { 3: 25, 4: 30, 5: 40, 6: 55, 7: 70 },
    meleeDamageByStage: { 3: 6, 4: 7, 5: 9, 6: 12, 7: 15 },
    meleeRange: 24,
    meleeCooldown: 600,
  },
  spells: {
    boltDamage: 100,   // one-shot gods, demolish villages
    boltRange: 18 * 8,
    villagePopDrain: 9999, // spell hit on village area drains this much pop
  },
  // Arrow speed and damage scale with the origin village's stage.
  // Higher stages fire faster, harder-hitting arrows with tighter
  // trajectories. This is the "calibre" system Mike requested.
  arrowByStage: {
    1: { speed: 380, damage: 3,  size: 0.8, trail: 0xaaf0ee },
    2: { speed: 400, damage: 4,  size: 0.9, trail: 0xaaf0ee },
    3: { speed: 440, damage: 6,  size: 1.0, trail: 0xbbffdd },
    4: { speed: 480, damage: 8,  size: 1.0, trail: 0xbbffdd },
    5: { speed: 520, damage: 10, size: 1.1, trail: 0xccffee },
    6: { speed: 560, damage: 13, size: 1.2, trail: 0xddffbb },
    7: { speed: 600, damage: 16, size: 1.3, trail: 0xeeff99 },
    8: { speed: 640, damage: 20, size: 1.4, trail: 0xffee77 },
    9: { speed: 680, damage: 24, size: 1.5, trail: 0xffcc55 },
    10:{ speed: 720, damage: 28, size: 1.6, trail: 0xffaa33 },
  },
}

// Convenience getter for HP / damage by stage with safe defaults.
export function bodyguardHp(stage) {
  return COMBAT.bodyguard.maxHpByStage[stage] || 30
}
export function bodyguardMeleeDamage(stage) {
  return COMBAT.bodyguard.meleeDamageByStage[stage] || 8
}
