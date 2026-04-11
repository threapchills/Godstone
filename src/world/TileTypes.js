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

// ── Tile variants ────────────────────────────────────────────
// Visual variance only: the world grid stores canonical base IDs, but
// the Phaser tilemap layer is populated with *variant* IDs so no two
// neighbouring stones look identical. Variants all behave as their base
// type for collision, physics, and game logic; they differ only in the
// sprite/colour combination baked into the tileset canvas.

export const VARIANTS_PER_TYPE = 4

// Materials that get variants. Vegetation and markers keep a single cell
// (trees/bushes go through their own renderer anyway).
const VARIANT_BASE_TYPES = [
  TILES.SURFACE, TILES.SOIL, TILES.STONE, TILES.BEDROCK,
  TILES.SAND, TILES.ICE, TILES.CLAY, TILES.VOLCANIC_ROCK,
  TILES.CORAL, TILES.CRYSTAL, TILES.MAGMA_ROCK, TILES.CLOUD,
  TILES.WATER, TILES.LAVA, TILES.DEEP_WATER,
]

// Build: baseId -> [variant_0, variant_1, ..., variant_{N-1}]
// variant_0 is the base ID itself so legacy putTileAt(baseId, ...) still works.
// Variants 1..N-1 are allocated from VARIANT_ID_START upwards.
export const VARIANT_ID_START = 100

export const TILE_VARIANTS = (() => {
  const map = {}
  let nextId = VARIANT_ID_START
  for (const baseId of VARIANT_BASE_TYPES) {
    const ids = [baseId]
    for (let i = 1; i < VARIANTS_PER_TYPE; i++) {
      ids.push(nextId++)
    }
    map[baseId] = ids
  }
  return map
})()

// Reverse lookup: any render ID -> its canonical base ID.
export const VARIANT_TO_BASE = (() => {
  const map = {}
  for (const baseIdStr of Object.keys(TILE_VARIANTS)) {
    const baseId = Number(baseIdStr)
    for (const v of TILE_VARIANTS[baseId]) map[v] = baseId
  }
  return map
})()

// ── Edge variants (autotiling) ──────────────────────────────
// Solid tiles bordering air/liquid get organic, nibbled edges instead
// of full squares. A 4-bit mask encodes which sides are exposed:
//   bit 3 = air above, bit 2 = air below, bit 1 = air left, bit 0 = air right
// Mask 0 (surrounded) uses normal variants. Masks 1-15 each get a
// dedicated render ID with transparent edge pixels.

export const EDGE_ID_START = 200

// Only solid materials get edge variants (liquids flow organically already)
const EDGE_BASE_TYPES = [
  TILES.SURFACE, TILES.SOIL, TILES.STONE, TILES.BEDROCK,
  TILES.SAND, TILES.ICE, TILES.CLAY, TILES.VOLCANIC_ROCK,
  TILES.CORAL, TILES.CRYSTAL, TILES.MAGMA_ROCK, TILES.CLOUD,
]

export const TILE_EDGE_VARIANTS = (() => {
  const map = {}
  let nextId = EDGE_ID_START
  for (const baseId of EDGE_BASE_TYPES) {
    const maskMap = {}
    for (let mask = 1; mask <= 15; mask++) {
      maskMap[mask] = nextId++
    }
    map[baseId] = maskMap
  }
  return map
})()

// Reverse lookup: edge render ID → canonical base ID
export const EDGE_TO_BASE = (() => {
  const map = {}
  for (const [baseIdStr, maskMap] of Object.entries(TILE_EDGE_VARIANTS)) {
    const baseId = Number(baseIdStr)
    for (const [, id] of Object.entries(maskMap)) {
      map[id] = baseId
    }
  }
  return map
})()

// Given a base tile ID and edge mask, return the edge render ID
export function edgeIdFor(baseId, edgeMask) {
  if (edgeMask === 0) return baseId
  return TILE_EDGE_VARIANTS[baseId]?.[edgeMask] ?? baseId
}

// Every render ID actually used: base + variants + edge variants.
export const ALL_RENDER_IDS = (() => {
  const ids = new Set()
  for (const id of Object.values(TILES)) ids.add(id)
  for (const variants of Object.values(TILE_VARIANTS)) {
    for (const v of variants) ids.add(v)
  }
  for (const maskMap of Object.values(TILE_EDGE_VARIANTS)) {
    for (const id of Object.values(maskMap)) ids.add(id)
  }
  return [...ids].sort((a, b) => a - b)
})()

export const MAX_RENDER_ID = ALL_RENDER_IDS[ALL_RENDER_IDS.length - 1]

// Fast non-crypto hash for deterministic position-based variant picking.
// Stable across re-renders because the base grid doesn't move.
function hash2(x, y) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263
  h = (h ^ (h >>> 13)) * 1274126177
  return (h ^ (h >>> 16)) >>> 0
}

// Given a base tile ID and its grid position, pick a variant to render.
// If the tile has no variants it's returned as-is.
export function renderIdFor(baseId, x, y) {
  const variants = TILE_VARIANTS[baseId]
  if (!variants) return baseId
  return variants[hash2(x, y) % variants.length]
}

// Which tiles block movement. Populated with base IDs first, then expanded
// with every variant of each solid base so consumers using
// `SOLID_TILES.has(tile)` work against the tilemap layer's variant IDs too.
export const SOLID_TILES = new Set([
  TILES.SURFACE, TILES.SOIL, TILES.STONE, TILES.BEDROCK,
  TILES.ICE, TILES.CLAY, TILES.VOLCANIC_ROCK, TILES.CORAL,
  TILES.CRYSTAL, TILES.MAGMA_ROCK, TILES.SAND, TILES.CLOUD,
])

// Which tiles are liquid (god can move through, but slowly)
export const LIQUID_TILES = new Set([
  TILES.WATER, TILES.LAVA, TILES.DEEP_WATER,
])

// Inject variants into the solid/liquid sets so variant IDs pass the checks.
for (const baseId of [...SOLID_TILES]) {
  const variants = TILE_VARIANTS[baseId]
  if (variants) for (const v of variants) SOLID_TILES.add(v)
  // Edge variants are also solid
  const edgeMaskMap = TILE_EDGE_VARIANTS[baseId]
  if (edgeMaskMap) for (const id of Object.values(edgeMaskMap)) SOLID_TILES.add(id)
}
for (const baseId of [...LIQUID_TILES]) {
  const variants = TILE_VARIANTS[baseId]
  if (variants) for (const v of variants) LIQUID_TILES.add(v)
}

// ── Colour helpers ───────────────────────────────────────────

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

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h, s
  const l = (max + min) / 2
  if (max === min) {
    h = 0; s = 0
  } else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      default: h = (r - g) / d + 4
    }
    h /= 6
  }
  return [h, s, l]
}

function hslToRgb(h, s, l) {
  let r, g, b
  if (s === 0) {
    r = g = b = l
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

// Apply a hue/sat/lum shift to a hex colour. Clamps sat and lum.
function modulateColour(hex, dHue, satMul, lumMul) {
  const r = (hex >> 16) & 0xff
  const g = (hex >> 8) & 0xff
  const b = hex & 0xff
  const [h, s, l] = rgbToHsl(r, g, b)
  let h2 = (h + dHue) % 1
  if (h2 < 0) h2 += 1
  const s2 = Math.max(0, Math.min(1, s * satMul))
  const l2 = Math.max(0, Math.min(1, l * lumMul))
  const [r2, g2, b2] = hslToRgb(h2, s2, l2)
  return (r2 << 16) | (g2 << 8) | b2
}

// Deterministic pseudo-random from a seed; no state, just a scramble.
function hashSeed(seed, salt) {
  let h = (seed ^ salt) | 0
  h = Math.imul(h ^ (h >>> 15), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489917)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

// ── Palette ──────────────────────────────────────────────────

// Base colours per element.
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

// Build a full tile colour map for a given creation params object.
// Accepts a params object (element1, element2, elementRatio, seed, sparseDense, barrenFertile, skyCave)
// OR the legacy positional form (element1, element2, ratio) for backwards compat.
// The returned palette contains:
//   - an entry for every base tile ID
//   - an entry for every variant render ID (slightly jittered per variant)
//   - skyColour (single sky tint)
//   - accentColour (the per-world signature minor colour)
export function buildPalette(paramsOrEl1, el2, ratioArg) {
  let params
  if (typeof paramsOrEl1 === 'object' && paramsOrEl1 !== null) {
    params = paramsOrEl1
  } else {
    // Legacy positional call: synthesise a params object with defaults
    params = {
      element1: paramsOrEl1,
      element2: el2,
      elementRatio: ratioArg,
      seed: 0,
      sparseDense: 0.5,
      barrenFertile: 0.5,
      skyCave: 0.5,
    }
  }

  const {
    element1, element2,
    elementRatio = 5,
    seed = 0,
    sparseDense = 0.5,
    barrenFertile = 0.5,
    skyCave = 0.5,
  } = params

  const t = elementRatio / 10 // 0 = all element2, 1 = all element1
  const c1 = BASE_COLOURS[element1]
  const c2 = BASE_COLOURS[element2]

  // Per-world colour identity. Seeded shifts keep two "fire+earth" worlds
  // from looking identical: one lands warmer, another chalkier, another
  // with a violet accent running through the stone.
  // Ranges are deliberately small so worlds stay coherent with their elements.
  const worldHueShift = (hashSeed(seed, 0x9e3779b1) - 0.5) * 0.18  // ±0.09 (≈ ±32°)
  const worldSatBase = 0.88 + hashSeed(seed, 0x85ebca6b) * 0.30    // 0.88 .. 1.18
  const worldLumBase = 0.92 + hashSeed(seed, 0xc2b2ae35) * 0.16    // 0.92 .. 1.08

  // Sliders tug those baselines:
  //   sparseDense: dense worlds feel more saturated; sparse worlds drier.
  //   barrenFertile: fertile worlds slightly brighter and warmer.
  //   skyCave: cave-heavy worlds darken to feel claustrophobic.
  const worldSatMul = worldSatBase * (0.85 + sparseDense * 0.30)
  const worldLumMul = worldLumBase * (0.93 + barrenFertile * 0.10) * (1.02 - (1 - skyCave) * 0.10)
  const worldHueDelta = worldHueShift + (barrenFertile - 0.5) * 0.04

  // Accent: a per-world signature colour threaded into crystal/stone/coral
  // so each world has a distinctive minor hue (violet, teal, rust, ochre, etc.).
  const accentHue = hashSeed(seed, 0x27d4eb2f)
  const accentSat = 0.50 + hashSeed(seed, 0x165667b1) * 0.25
  const accentLum = 0.40 + hashSeed(seed, 0xd1342543) * 0.15
  const [aR, aG, aB] = hslToRgb(accentHue, accentSat, accentLum)
  const accentColour = (aR << 16) | (aG << 8) | aB

  // Shorthand: run a raw base colour through per-world modulation.
  const worldMod = (hex) => modulateColour(hex, worldHueDelta, worldSatMul, worldLumMul)

  // Base palette entries (pre-variant)
  const baseEntries = {
    [TILES.AIR]: null,
    [TILES.SURFACE]: worldMod(blendColour(c2.surface, c1.surface, t)),
    [TILES.SOIL]: worldMod(blendColour(c2.soil, c1.soil, t)),
    [TILES.STONE]: worldMod(blendColour(c2.stone, c1.stone, t)),
    [TILES.BEDROCK]: worldMod(blendColour(c2.bedrock, c1.bedrock, t)),
    [TILES.WATER]: worldMod(blendColour(c2.liquid, c1.liquid, t > 0.5 ? 0.3 : 0.7)),
    [TILES.LAVA]: worldMod(0xff4500),
    [TILES.SAND]: worldMod(blendColour(0xc2a64e, 0x8a6a3a, t)),
    [TILES.ICE]: worldMod(blendColour(0xb0d0e0, 0x80a0c0, t)),
    [TILES.CLAY]: worldMod(blendColour(0x7a5a3a, 0x5a4a2a, t)),
    [TILES.VOLCANIC_ROCK]: worldMod(blendColour(0x3a2a1a, 0x2a1a0a, t)),
    [TILES.CORAL]: worldMod(blendColour(accentColour, blendColour(0xaa4a6a, 0x6a3a5a, t), 0.65)),
    [TILES.CRYSTAL]: worldMod(blendColour(blendColour(0x8aaaca, 0x6a8aba, t), accentColour, 0.45)),
    [TILES.DEEP_WATER]: worldMod(blendColour(0x0a2a4a, 0x0a1a3a, t)),
    [TILES.MAGMA_ROCK]: worldMod(blendColour(0x4a1a0a, 0x2a0a00, t)),
    [TILES.CLOUD]: worldMod(0xc8d8e8),
    [TILES.TREE_TRUNK]: worldMod(blendColour(0x5a3a1a, 0x4a2a0a, t)),
    [TILES.TREE_LEAVES]: worldMod(blendColour(c2.surface, c1.surface, t) | 0x002000),
    [TILES.BUSH]: worldMod(blendColour(0x3a6a2a, 0x2a5a1a, t)),
    [TILES.TALL_GRASS]: worldMod(blendColour(c2.surface, c1.surface, t) | 0x001000),
    [TILES.MUSHROOM]: worldMod(blendColour(0xaa6644, 0x886644, t)),
    [TILES.VILLAGE_MARKER]: 0xdaa520,
    [TILES.TABLET_MARKER]: 0x00ffaa,
  }

  const palette = { ...baseEntries }

  // Expand variants. Each variant gets subtle jitter in HSL space so
  // neighbouring tiles read as "same material, different rock".
  // STONE/BEDROCK variants 2-3 pick up a light accent veining for flavour.
  for (const baseIdStr of Object.keys(TILE_VARIANTS)) {
    const baseId = Number(baseIdStr)
    const baseHex = baseEntries[baseId]
    if (baseHex == null) continue
    const variants = TILE_VARIANTS[baseId]
    for (let i = 0; i < variants.length; i++) {
      const id = variants[i]
      if (i === 0) {
        palette[id] = baseHex
        continue
      }
      // Jitter: lum spread, sat spread, tiny hue drift per variant
      const phase = (i - (variants.length - 1) / 2) / (variants.length - 1)
      const vLum = 1 + phase * 0.18                       // ±9% luminance
      const vSat = 1 + phase * 0.12                       // ±6% saturation
      const vHue = phase * 0.02                           // ±1% hue drift
      let variantHex = modulateColour(baseHex, vHue, vSat, vLum)
      // Subtle accent veining into stone/bedrock variants 2-3,
      // and stronger into crystal variants
      if ((baseId === TILES.STONE || baseId === TILES.BEDROCK) && i >= 2) {
        variantHex = blendColour(variantHex, accentColour, 0.12)
      } else if (baseId === TILES.CRYSTAL && i >= 1) {
        variantHex = blendColour(variantHex, accentColour, 0.25)
      }
      palette[id] = variantHex
    }
  }

  palette.skyColour = worldMod(blendColour(c2.sky, c1.sky, t))
  palette.accentColour = accentColour
  palette.worldHueDelta = worldHueDelta
  palette.worldSatMul = worldSatMul
  palette.worldLumMul = worldLumMul

  return palette
}
