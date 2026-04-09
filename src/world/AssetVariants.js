// Asset variant selection: given a world seed, deterministically picks
// sky layer textures and tree style for the world. Each world feels
// visually distinct because different sky paintings and tree shapes
// are combined per seed.
//
// The variant keys map to images preloaded in CreationScene.preload().
// Sky variants are full-viewport paintings; tree variants swap the
// foliage sprite used by FoliageRenderer and BiomeFlora.

export const SKY_VARIANTS = [
  'sky_aurora',
  'sky_crimson',
  'sky_foggy',
  'sky_pastel',
  'sky_starry',
  'sky_storm',
  'sky_sunset',
  'sky_toxic',
]

export const TREE_VARIANTS = [
  'tree_default',   // the original sb_tree
  'tree_pine',
  'tree_willow',
]

// Deterministic pick from an array using a seed-derived hash.
function seededPick(arr, seed) {
  // mulberry32 one-shot
  let t = (seed + 0x6d2b79f5) | 0
  t = Math.imul(t ^ (t >>> 15), 1 | t)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  const n = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return arr[Math.floor(n * arr.length)]
}

// Returns an object describing which variant assets this world uses.
// Each property is a Phaser texture key that must have been preloaded.
export function pickVariants(seed) {
  // Use different seed offsets so sky and tree choices are independent
  const skyKey1 = seededPick(SKY_VARIANTS, seed + 1001)
  const skyKey2 = seededPick(SKY_VARIANTS, seed + 2002)
  const skyKey3 = seededPick(SKY_VARIANTS, seed + 3003)
  const treeKey = seededPick(TREE_VARIANTS, seed + 4004)

  return {
    // Three sky layers drawn from the variant pool so different
    // paintings overlap for unique compositions per world
    skyLayer1: `skyvar_${skyKey1}`,
    skyLayer2: `skyvar_${skyKey2}`,
    skyClouds: `skyvar_${skyKey3}`,
    treeKey: treeKey === 'tree_default' ? 'sb_tree' : `treevar_${treeKey}`,
  }
}
