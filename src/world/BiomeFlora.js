import { WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE } from '../core/Constants.js'
import { TILES, SOLID_TILES } from './TileTypes.js'
import { findGroundTileY } from '../utils/Grounding.js'

// Biome-specific decoration sprites overlaid on top of the tilemap.
// Uses storybook illustration assets instead of procedural canvases.
// Each biome maps to a specific storybook sprite with per-biome tint
// so the same illustration reads differently across elemental worlds.

// ── Flora type registry ─────────────────────────────────────
// Each flora entry specifies a storybook sprite key, a tint colour,
// a target rendered height in pixels, and a spawn density. The sprite
// is loaded full-resolution and scaled to the target height so it
// looks hand-painted at any zoom level.

const FLORA_BY_BIOME = {
  // Fire + Earth
  scorched_flats:   { surface: { name: 'cactus',       sprite: 'sb_rocks',           tint: 0x8a7a4a, height: 14, density: 0.04 } },
  obsidian_wastes:  { surface: { name: 'ash-pile',      sprite: 'sb_mossy_boulder',   tint: 0x665566, height: 10, density: 0.05 } },
  magma_forge:      { underground: { name: 'magma-shard', sprite: 'sb_giant_crystals', tint: 0xff6633, height: 18, density: 0.06 } },
  crystal_caverns:  { underground: { name: 'crystal',    sprite: 'sb_giant_crystals',  tint: 0x9988ff, height: 20, density: 0.10 } },
  // Fire + Water
  volcanic_shore:   { surface: { name: 'ash-mound',     sprite: 'sb_rocks',           tint: 0x554433, height: 10, density: 0.04 } },
  coral_shelf:      { surface: { name: 'coral-fan',      sprite: 'sb_bushes',          tint: 0xee6688, height: 12, density: 0.06 } },
  steam_vents:      { surface: { name: 'sulphur-pile',   sprite: 'sb_rocks',           tint: 0xddcc44, height: 10, density: 0.04 } },
  deep_trench:      { underground: { name: 'deep-coral', sprite: 'sb_stalactite',      tint: 0x4488aa, height: 16, density: 0.05 } },
  // Fire + Air
  cinder_plains:    { surface: { name: 'ember-cactus',  sprite: 'sb_rocks',            tint: 0xaa6644, height: 12, density: 0.04 } },
  ember_peaks:      { surface: { name: 'ash-pile',      sprite: 'sb_mossy_boulder',    tint: 0x886655, height: 10, density: 0.05 } },
  ash_drifts:       { surface: { name: 'ash-pile',      sprite: 'sb_rocks',            tint: 0x99aaaa, height: 10, density: 0.07 } },
  thermal_canyons:  { underground: { name: 'fire-crystal', sprite: 'sb_giant_crystals', tint: 0xff8844, height: 18, density: 0.06 } },
  // Earth + Water
  mudflats:         { surface: { name: 'reed',          sprite: 'sb_bushes',           tint: 0x88aa44, height: 12, density: 0.06 } },
  marshland:        { surface: { name: 'reed',          sprite: 'sb_bushes',           tint: 0x66aa33, height: 14, density: 0.10 } },
  fungal_grove:     { underground: { name: 'glow-mushroom', sprite: 'sb_giant_mushrooms', tint: 0x88ffdd, height: 20, density: 0.12 } },
  flooded_caverns:  { underground: { name: 'pale-mushroom', sprite: 'sb_giant_mushrooms', tint: 0xccddee, height: 16, density: 0.08 } },
  // Air + Water
  storm_coast:      { surface: { name: 'sea-fern',      sprite: 'sb_bushes',           tint: 0x447788, height: 12, density: 0.05 } },
  ice_ridge:        { surface: { name: 'ice-spike',     sprite: 'sb_stalactite',       tint: 0xbbeeff, height: 16, density: 0.07 } },
  mist_valley:      { surface: { name: 'mist-fern',     sprite: 'sb_bushes',           tint: 0x88aabb, height: 12, density: 0.06 } },
  floating_reef:    { surface: { name: 'reef-coral',     sprite: 'sb_bushes',           tint: 0x88ddee, height: 12, density: 0.05 } },
  // Earth + Air
  windswept_plateau:{ surface: { name: 'wind-flower',   sprite: 'sb_bushes',           tint: 0xddcc66, height: 10, density: 0.05 } },
  mountain_meadow:  { surface: { name: 'meadow-flower', sprite: 'sb_bushes',           tint: 0xee8866, height: 12, density: 0.10 } },
  cliff_face:       { surface: { name: 'cliff-fern',    sprite: 'sb_rocks',            tint: 0x66aa55, height: 12, density: 0.04 } },
  deep_root:        { underground: { name: 'root-mushroom', sprite: 'sb_giant_mushrooms', tint: 0xaa66cc, height: 18, density: 0.08 } },
}

// Hard cap scales with fertility so fertile worlds visibly overflow
// with decorative flora while barren worlds stay sparse. Base 240
// was invisible at world scale; 600+ fills meadows and cave floors.
const BASE_MAX_FLORA = 300
const MAX_FLORA_FERTILE = 700

// ── Manager ─────────────────────────────────────────────────

export default class BiomeFlora {
  constructor(scene, worldGrid, surfaceHeights, biomeMap, biomeVocab, params) {
    this.scene = scene
    this.worldGrid = worldGrid
    this.flora = []

    if (!biomeMap || !biomeVocab) return

    const fertility = params?.barrenFertile ?? 0.5
    const maxFlora = Math.floor(BASE_MAX_FLORA + fertility * (MAX_FLORA_FERTILE - BASE_MAX_FLORA))
    // Fertility scales the effective density: at 0 density is halved,
    // at 1 density is boosted 50% above the base values.
    const fertilityMul = 0.5 + fertility * 1.0

    const grid = worldGrid.grid
    const seed = (params?.seed || 12345) >>> 0
    const rng = mulberry32(seed + 7777)

    // Pass 1: surface decorations
    let placed = 0
    for (let x = 0; x < WORLD_WIDTH && placed < maxFlora; x++) {
      const sy = Math.floor(surfaceHeights[x])
      if (sy <= 2 || sy >= WORLD_HEIGHT - 5) continue
      const biomeIdx = biomeMap[sy * WORLD_WIDTH + x]
      const biomeName = biomeVocab[biomeIdx]
      const flora = FLORA_BY_BIOME[biomeName]?.surface
      if (!flora) continue
      if (rng() > flora.density * fertilityMul) continue
      const sprite = this._spawn(scene, x, sy, flora)
      if (sprite) {
        this.flora.push({ sprite, tileX: x, biome: biomeName })
        placed++
      }
    }

    // Pass 2: underground (cave floor) decorations
    for (let x = 0; x < WORLD_WIDTH && placed < maxFlora; x++) {
      const sy = Math.floor(surfaceHeights[x])
      // Walk down checking biome at each cave-floor candidate
      for (let y = sy + 12; y < WORLD_HEIGHT - 10; y++) {
        if (grid[y * WORLD_WIDTH + x] !== TILES.AIR) continue
        if (!SOLID_TILES.has(grid[(y + 1) * WORLD_WIDTH + x])) continue
        const biomeIdx = biomeMap[y * WORLD_WIDTH + x]
        const biomeName = biomeVocab[biomeIdx]
        const flora = FLORA_BY_BIOME[biomeName]?.underground
        if (!flora) continue
        if (rng() > flora.density * fertilityMul) continue
        const sprite = this._spawn(scene, x, y, flora)
        if (sprite) {
          this.flora.push({ sprite, tileX: x, biome: biomeName })
          placed++
          break // one per column underground so caves don't get clogged
        }
      }
      if (placed >= maxFlora) break
    }
  }

  _spawn(scene, tileX, tileY, flora) {
    // Use the storybook sprite directly; scale to target height and tint
    const spriteKey = flora.sprite || 'sb_bushes'
    if (!scene.textures.exists(spriteKey)) return null

    const px = tileX * TILE_SIZE + TILE_SIZE / 2
    const py = tileY * TILE_SIZE
    const sprite = scene.add.sprite(px, py, spriteKey)
    sprite.setOrigin(0.5, 1)
    sprite.setDepth(4)

    // Scale so the rendered height matches the target. Storybook sprites
    // are large (100-400px); we scale them down to 10-20px so they sit
    // naturally in the 8px-tile world as small ground decorations.
    const targetH = flora.height || 14
    const srcH = sprite.height || 100
    const scale = targetH / srcH
    sprite.setScale(scale)

    // Tint to match the biome's colour scheme
    if (flora.tint) sprite.setTint(flora.tint)

    return sprite
  }

  update() {
    // Re-snap each decoration to its column's ground so digs and lava
    // don't leave them floating. Cheap (capped at MAX_FLORA = 240).
    const grid = this.worldGrid?.grid
    if (!grid) return
    for (const f of this.flora) {
      const startTileY = Math.max(0, Math.floor(f.sprite.y / TILE_SIZE) - 2)
      const fallbackTileY = Math.floor(f.sprite.y / TILE_SIZE)
      const groundTileY = findGroundTileY(grid, f.tileX, startTileY, fallbackTileY)
      f.sprite.y = groundTileY * TILE_SIZE
    }
  }

  destroy() {
    for (const f of this.flora) f.sprite.destroy()
    this.flora = []
  }
}

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
