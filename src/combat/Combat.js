// Combat tuning constants — all in one place so Mike can rebalance
// without hunting through entity classes. These are first-pass values;
// tune freely once the loop is playable.

export const COMBAT = {
  god: {
    maxHp: 100,
    contactDamage: 6, // damage taken when an enemy lands a melee hit
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
    // Mana mirrors the player: a small pool that regenerates only
    // while the rival is in motion. Each shadow bolt costs 1.
    maxMana: 3,
    boltManaCost: 1,
    manaRegenPerSecond: 3 / 120, // full bar from empty over ~120s of motion
  },
  bodyguard: {
    maxHpByStage: { 3: 25, 4: 30, 5: 40, 6: 55, 7: 70 },
    meleeDamageByStage: { 3: 6, 4: 7, 5: 9, 6: 12, 7: 15 },
    meleeRange: 24,
    meleeCooldown: 600,
  },
  spells: {
    boltDamage: 18,
    boltRange: 18 * 8,
  },
}

// Convenience getter for HP / damage by stage with safe defaults.
export function bodyguardHp(stage) {
  return COMBAT.bodyguard.maxHpByStage[stage] || 30
}
export function bodyguardMeleeDamage(stage) {
  return COMBAT.bodyguard.meleeDamageByStage[stage] || 8
}
