// World dimensions in tiles
export const WORLD_WIDTH = 600
export const WORLD_HEIGHT = 300
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
  BEDROCK_DEPTH: 6,
}
