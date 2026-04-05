// Tile IDs used in the world grid
export const TILES = {
  AIR: 0,
  SURFACE: 1,
  SOIL: 2,
  STONE: 3,
  BEDROCK: 4,
  WATER: 5,
  LAVA: 6,
  SAND: 7,
  ICE: 8,
  CLAY: 9,
  VOLCANIC_ROCK: 10,
  CORAL: 11,
  CRYSTAL: 12,
  DEEP_WATER: 13,
  MAGMA_ROCK: 14,
  CLOUD: 15,
  // Vegetation (non-solid, decorative)
  TREE_TRUNK: 16,
  TREE_LEAVES: 17,
  BUSH: 18,
  TALL_GRASS: 19,
  MUSHROOM: 20,
  // Markers (non-terrain)
  VILLAGE_MARKER: 50,
  TABLET_MARKER: 51,
}

// Which tiles block movement
export const SOLID_TILES = new Set([
  TILES.SURFACE, TILES.SOIL, TILES.STONE, TILES.BEDROCK,
  TILES.ICE, TILES.CLAY, TILES.VOLCANIC_ROCK, TILES.CORAL,
  TILES.CRYSTAL, TILES.MAGMA_ROCK, TILES.SAND, TILES.CLOUD,
])

// Which tiles are liquid (god can move through, but slowly)
export const LIQUID_TILES = new Set([
  TILES.WATER, TILES.LAVA, TILES.DEEP_WATER,
])

// Colour palettes per element pair.
// Each palette maps tile IDs to hex colours.
// The ratio slider shifts emphasis between the two element sub-palettes.
const BASE_COLOURS = {
  fire: {
    surface: 0x8b4513,    // scorched brown
    soil: 0x6b3410,       // dark ash
    stone: 0x4a2a0a,      // charred rock
    bedrock: 0x1a0a04,    // obsidian
    liquid: 0xff4500,     // lava orange
    accent: 0xff6600,     // ember
    sky: 0x1a0800,        // dark smoky
  },
  water: {
    surface: 0x2e6b5e,    // sea moss
    soil: 0x1a4a3e,       // dark seabed
    stone: 0x1a3a4a,      // deep blue stone
    bedrock: 0x0a1a2a,    // abyssal
    liquid: 0x1a6b8a,     // ocean blue
    accent: 0x4a9aba,     // foam
    sky: 0x0a1a2e,        // deep night sea
  },
  air: {
    surface: 0x8aaa6a,    // windswept grass
    soil: 0x6a8a5a,       // pale soil
    stone: 0x9a9a8a,      // light grey stone
    bedrock: 0x4a4a4a,    // grey base
    liquid: 0xc0d8e8,     // mist
    accent: 0xe0e8f0,     // cloud white
    sky: 0x1a2a3a,        // high altitude dark
  },
  earth: {
    surface: 0x4a7a2a,    // rich moss
    soil: 0x5a4a2a,       // loam
    stone: 0x5a5a4a,      // granite
    bedrock: 0x2a2a1a,    // deep earth
    liquid: 0x3a5a2a,     // muddy water
    accent: 0x8a6a3a,     // ochre
    sky: 0x0a0a0e,        // cavern dark
  },
}

// Blend two hex colours by a ratio (0 = all colourA, 1 = all colourB)
function blendColour(colourA, colourB, ratio) {
  const rA = (colourA >> 16) & 0xff
  const gA = (colourA >> 8) & 0xff
  const bA = colourA & 0xff
  const rB = (colourB >> 16) & 0xff
  const gB = (colourB >> 8) & 0xff
  const bB = colourB & 0xff
  const r = Math.round(rA + (rB - rA) * ratio)
  const g = Math.round(gA + (gB - gA) * ratio)
  const b = Math.round(bA + (bB - bA) * ratio)
  return (r << 16) | (g << 8) | b
}

// Build a full tile colour map for a given element pair and ratio.
// ratio: 0-10, points allocated to element1. Higher = more element1 influence.
export function buildPalette(element1, element2, ratio) {
  const t = ratio / 10 // 0 = all element2, 1 = all element1
  const c1 = BASE_COLOURS[element1]
  const c2 = BASE_COLOURS[element2]

  return {
    [TILES.AIR]: null, // transparent
    [TILES.SURFACE]: blendColour(c2.surface, c1.surface, t),
    [TILES.SOIL]: blendColour(c2.soil, c1.soil, t),
    [TILES.STONE]: blendColour(c2.stone, c1.stone, t),
    [TILES.BEDROCK]: blendColour(c2.bedrock, c1.bedrock, t),
    [TILES.WATER]: blendColour(c2.liquid, c1.liquid, t > 0.5 ? 0.3 : 0.7),
    [TILES.LAVA]: 0xff4500,
    [TILES.SAND]: blendColour(0xc2a64e, 0x8a6a3a, t),
    [TILES.ICE]: blendColour(0xb0d0e0, 0x80a0c0, t),
    [TILES.CLAY]: blendColour(0x7a5a3a, 0x5a4a2a, t),
    [TILES.VOLCANIC_ROCK]: blendColour(0x3a2a1a, 0x2a1a0a, t),
    [TILES.CORAL]: blendColour(0xaa4a6a, 0x6a3a5a, t),
    [TILES.CRYSTAL]: blendColour(0x8aaaca, 0x6a8aba, t),
    [TILES.DEEP_WATER]: blendColour(0x0a2a4a, 0x0a1a3a, t),
    [TILES.MAGMA_ROCK]: blendColour(0x4a1a0a, 0x2a0a00, t),
    [TILES.CLOUD]: 0xc8d8e8,
    [TILES.TREE_TRUNK]: blendColour(0x5a3a1a, 0x4a2a0a, t),
    [TILES.TREE_LEAVES]: blendColour(c2.surface, c1.surface, t) | 0x002000, // greener than surface
    [TILES.BUSH]: blendColour(0x3a6a2a, 0x2a5a1a, t),
    [TILES.TALL_GRASS]: blendColour(c2.surface, c1.surface, t) | 0x001000,
    [TILES.MUSHROOM]: blendColour(0xaa6644, 0x886644, t),
    [TILES.VILLAGE_MARKER]: 0xdaa520, // gold
    [TILES.TABLET_MARKER]: 0x00ffaa, // bright teal glow
    skyColour: blendColour(c2.sky, c1.sky, t),
  }
}
