// World dimensions in tiles.
// 8x area bump (2.67x wide, 3x tall) vs the 600x300 launch size so the
// world reads as a proper planet: ~72 s to walk the wrap, ~10 screens
// of vertical drama, and room to bury tablets at the molten core.
export const WORLD_WIDTH = 1600
export const WORLD_HEIGHT = 900
export const TILE_SIZE = 8

// Viewport
export const GAME_WIDTH = 960
export const GAME_HEIGHT = 640

// Physics
export const GRAVITY = 800
export const GOD_SPEED = 200
export const GOD_JUMP = -350
export const GOD_FLY_SPEED = -200

// Elements
export const ELEMENTS = {
  FIRE: 'fire',
  WATER: 'water',
  AIR: 'air',
  EARTH: 'earth',
}

// Element pairs (all six combinations)
export const ELEMENT_PAIRS = [
  [ELEMENTS.FIRE, ELEMENTS.WATER],
  [ELEMENTS.FIRE, ELEMENTS.EARTH],
  [ELEMENTS.FIRE, ELEMENTS.AIR],
  [ELEMENTS.WATER, ELEMENTS.EARTH],
  [ELEMENTS.WATER, ELEMENTS.AIR],
  [ELEMENTS.EARTH, ELEMENTS.AIR],
]

// Slider ranges (0 to 1, normalised)
export const SLIDER_DEFAULTS = {
  skyCave: 0.5,
  barrenFertile: 0.5,
  sparseDense: 0.5,
  elementRatio: 5, // points allocated to first element (out of 10)
}

// World gen tuning
export const TERRAIN = {
  SURFACE_NOISE_SCALE: 0.008,
  SURFACE_AMPLITUDE: 40,
  CAVE_NOISE_SCALE: 0.04,
  CAVE_THRESHOLD: 0.3,
  SOIL_DEPTH: 8,
  // The bottom of the world is a two-tier solid mass so the planet reads
  // as having a core rather than going hollow. Top tier is bedrock (dark
  // stone); below that sits the molten core (magma rock with lava veins).
  // Every cave-carving pass is clamped to stay above CORE_DEPTH + BEDROCK_DEPTH.
  // Both tiers scale with the larger world so the core reads proportional
  // to the planet, not a thin crust at the bottom of a giant cavern.
  BEDROCK_DEPTH: 18,
  CORE_DEPTH: 28,
}
