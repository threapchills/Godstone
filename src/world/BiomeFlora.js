import { WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE } from '../core/Constants.js'
import { TILES, SOLID_TILES } from './TileTypes.js'
import { findGroundTileY } from '../utils/Grounding.js'

// Biome-specific decoration sprites overlaid on top of the tilemap.
// These are pure-additive: they don't change tile data, so the
// existing rendering, simulation, and collision continue to work
// untouched. Each biome has 1-2 signature flora that read the world
// as something more than a generic earth-and-stone backdrop.
//
// Decorations are tiny canvas sprites generated procedurally so we
// don't need any image assets. Drawing routines live next to the
// flora type definitions so it's all in one place.

// ── Procedural sprite drawing ───────────────────────────────

function drawCrystal(ctx, w, h, hex, dark) {
  // Vertical shard with a brighter inner stripe
  ctx.fillStyle = dark
  ctx.beginPath()
  ctx.moveTo(w / 2, 0)
  ctx.lineTo(w - 1, h - 1)
  ctx.lineTo(1, h - 1)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = hex
  ctx.fillRect(Math.floor(w / 2) - 1, 1, 2, h - 2)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(Math.floor(w / 2) - 1, 1, 1, Math.max(1, Math.floor(h * 0.4)))
}

function drawGlowMushroom(ctx, w, h, hex, dark) {
  // Stem
  ctx.fillStyle = '#dddddd'
  ctx.fillRect(Math.floor(w / 2) - 1, Math.floor(h * 0.45), 2, Math.ceil(h * 0.55))
  // Cap
  ctx.fillStyle = hex
  const cy = Math.floor(h * 0.35)
  ctx.beginPath()
  ctx.ellipse(w / 2, cy, w / 2, h * 0.35, 0, 0, Math.PI * 2)
  ctx.fill()
  // Glow dots
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(Math.floor(w * 0.3), cy, 1, 1)
  ctx.fillRect(Math.floor(w * 0.65), cy + 1, 1, 1)
}

function drawCoral(ctx, w, h, hex, dark) {
  // Branching coral fan
  ctx.fillStyle = hex
  ctx.fillRect(Math.floor(w / 2), Math.floor(h * 0.4), 1, Math.ceil(h * 0.6))
  ctx.fillRect(Math.floor(w * 0.3), Math.floor(h * 0.55), 1, Math.ceil(h * 0.45))
  ctx.fillRect(Math.floor(w * 0.7), Math.floor(h * 0.55), 1, Math.ceil(h * 0.45))
  ctx.fillRect(2, Math.floor(h * 0.7), w - 4, 1)
  ctx.fillStyle = dark
  ctx.fillRect(2, h - 1, w - 4, 1)
}

function drawCactus(ctx, w, h, hex, dark) {
  // Saguaro-style: tall central column with two short arms
  ctx.fillStyle = hex
  ctx.fillRect(Math.floor(w / 2) - 1, 0, 3, h - 1)
  ctx.fillRect(0, Math.floor(h * 0.45), 2, Math.ceil(h * 0.35))
  ctx.fillRect(w - 2, Math.floor(h * 0.55), 2, Math.ceil(h * 0.3))
  // Spines (highlight)
  ctx.fillStyle = dark
  for (let y = 1; y < h - 1; y += 2) ctx.fillRect(Math.floor(w / 2), y, 1, 1)
}

function drawFlowers(ctx, w, h, hex, dark) {
  // Cluster of 3 small dots on stems
  ctx.fillStyle = '#3a6a2a'
  ctx.fillRect(2, Math.floor(h * 0.4), 1, Math.ceil(h * 0.6))
  ctx.fillRect(Math.floor(w / 2), Math.floor(h * 0.3), 1, Math.ceil(h * 0.7))
  ctx.fillRect(w - 3, Math.floor(h * 0.5), 1, Math.ceil(h * 0.5))
  ctx.fillStyle = hex
  ctx.fillRect(1, Math.floor(h * 0.4) - 1, 2, 2)
  ctx.fillRect(Math.floor(w / 2) - 1, Math.floor(h * 0.3) - 1, 2, 2)
  ctx.fillRect(w - 4, Math.floor(h * 0.5) - 1, 2, 2)
}

function drawFern(ctx, w, h, hex, dark) {
  // Two arching fronds
  ctx.fillStyle = hex
  ctx.fillRect(Math.floor(w / 2), 0, 1, h - 1)
  for (let i = 1; i < h - 1; i += 2) {
    const reach = Math.max(1, Math.floor((h - i) / 2))
    ctx.fillRect(Math.floor(w / 2) - reach, i, reach, 1)
    ctx.fillRect(Math.floor(w / 2) + 1, i, reach, 1)
  }
  ctx.fillStyle = dark
  ctx.fillRect(Math.floor(w / 2), h - 1, 1, 1)
}

function drawIcePillar(ctx, w, h, hex, dark) {
  ctx.fillStyle = hex
  ctx.fillRect(1, 1, w - 2, h - 1)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(2, 2, 1, h - 4)
  ctx.fillStyle = dark
  ctx.fillRect(0, h - 1, w, 1)
}

function drawAshPile(ctx, w, h, hex, dark) {
  // Mound with subtle highlights
  ctx.fillStyle = dark
  ctx.beginPath()
  ctx.ellipse(w / 2, h - 1, w / 2 - 1, h * 0.7, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = hex
  ctx.fillRect(Math.floor(w * 0.3), Math.floor(h * 0.6), 2, 1)
  ctx.fillRect(Math.floor(w * 0.55), Math.floor(h * 0.7), 2, 1)
}

function drawReed(ctx, w, h, hex, dark) {
  ctx.fillStyle = hex
  ctx.fillRect(1, 0, 1, h)
  ctx.fillRect(Math.floor(w / 2), 1, 1, h - 1)
  ctx.fillRect(w - 2, 0, 1, h)
  // Tassels
  ctx.fillStyle = dark
  ctx.fillRect(1, 0, 1, 1)
  ctx.fillRect(Math.floor(w / 2), 1, 1, 1)
  ctx.fillRect(w - 2, 0, 1, 1)
}

// ── Flora type registry, keyed by biome name ────────────────

const FLORA_BY_BIOME = {
  // Fire + Earth
  scorched_flats:   { surface: { name: 'cactus', size: [6, 10], colour: 0x4a7a2a, dark: 0x2a4a1a, draw: drawCactus, density: 0.04 } },
  obsidian_wastes:  { surface: { name: 'ash-pile', size: [8, 4], colour: 0x665566, dark: 0x332233, draw: drawAshPile, density: 0.05 } },
  magma_forge:      { underground: { name: 'magma-shard', size: [6, 9], colour: 0xff6633, dark: 0xaa2200, draw: drawCrystal, density: 0.06 } },
  crystal_caverns:  { underground: { name: 'crystal', size: [6, 10], colour: 0x9988ff, dark: 0x4422aa, draw: drawCrystal, density: 0.10 } },
  // Fire + Water
  volcanic_shore:   { surface: { name: 'ash-mound', size: [8, 4], colour: 0x554433, dark: 0x221100, draw: drawAshPile, density: 0.04 } },
  coral_shelf:      { surface: { name: 'coral-fan', size: [7, 8], colour: 0xee6688, dark: 0x884466, draw: drawCoral, density: 0.06 } },
  steam_vents:      { surface: { name: 'sulphur-pile', size: [7, 4], colour: 0xddcc44, dark: 0x886622, draw: drawAshPile, density: 0.04 } },
  deep_trench:      { underground: { name: 'deep-coral', size: [6, 8], colour: 0x4488aa, dark: 0x224466, draw: drawCoral, density: 0.05 } },
  // Fire + Air
  cinder_plains:    { surface: { name: 'ember-cactus', size: [5, 8], colour: 0xaa6644, dark: 0x553322, draw: drawCactus, density: 0.04 } },
  ember_peaks:      { surface: { name: 'ash-pile', size: [8, 4], colour: 0x886655, dark: 0x442211, draw: drawAshPile, density: 0.05 } },
  ash_drifts:       { surface: { name: 'ash-pile', size: [9, 4], colour: 0x99aaaa, dark: 0x444455, draw: drawAshPile, density: 0.07 } },
  thermal_canyons:  { underground: { name: 'fire-crystal', size: [6, 9], colour: 0xff8844, dark: 0xaa3311, draw: drawCrystal, density: 0.06 } },
  // Earth + Water
  mudflats:         { surface: { name: 'reed', size: [6, 8], colour: 0x88aa44, dark: 0x335522, draw: drawReed, density: 0.06 } },
  marshland:        { surface: { name: 'reed', size: [6, 9], colour: 0x66aa33, dark: 0x224411, draw: drawReed, density: 0.10 } },
  fungal_grove:     { underground: { name: 'glow-mushroom', size: [7, 9], colour: 0x88ffdd, dark: 0x226655, draw: drawGlowMushroom, density: 0.12 } },
  flooded_caverns:  { underground: { name: 'pale-mushroom', size: [6, 8], colour: 0xccddee, dark: 0x335566, draw: drawGlowMushroom, density: 0.08 } },
  // Air + Water
  storm_coast:      { surface: { name: 'sea-fern', size: [6, 8], colour: 0x447788, dark: 0x223344, draw: drawFern, density: 0.05 } },
  ice_ridge:        { surface: { name: 'ice-spike', size: [6, 9], colour: 0xbbeeff, dark: 0x6688aa, draw: drawIcePillar, density: 0.07 } },
  mist_valley:      { surface: { name: 'mist-fern', size: [7, 9], colour: 0x88aabb, dark: 0x445566, draw: drawFern, density: 0.06 } },
  floating_reef:    { surface: { name: 'reef-coral', size: [7, 8], colour: 0x88ddee, dark: 0x336688, draw: drawCoral, density: 0.05 } },
  // Earth + Air
  windswept_plateau:{ surface: { name: 'wind-flower', size: [7, 6], colour: 0xddcc66, dark: 0x886622, draw: drawFlowers, density: 0.05 } },
  mountain_meadow:  { surface: { name: 'meadow-flower', size: [7, 6], colour: 0xee8866, dark: 0x884422, draw: drawFlowers, density: 0.10 } },
  cliff_face:       { surface: { name: 'cliff-fern', size: [6, 8], colour: 0x66aa55, dark: 0x335522, draw: drawFern, density: 0.04 } },
  deep_root:        { underground: { name: 'root-mushroom', size: [7, 9], colour: 0xaa66cc, dark: 0x442266, draw: drawGlowMushroom, density: 0.08 } },
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
      if (placed >= MAX_FLORA) break
    }
  }

  _spawn(scene, tileX, tileY, flora) {
    const key = `flora-${flora.name}`
    if (!scene.textures.exists(key)) {
      const [w, h] = flora.size
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d')
      const hex = `rgb(${(flora.colour >> 16) & 0xff},${(flora.colour >> 8) & 0xff},${flora.colour & 0xff})`
      const dark = `rgb(${(flora.dark >> 16) & 0xff},${(flora.dark >> 8) & 0xff},${flora.dark & 0xff})`
      flora.draw(ctx, w, h, hex, dark)
      scene.textures.addCanvas(key, c)
    }
    const px = tileX * TILE_SIZE + TILE_SIZE / 2
    const py = tileY * TILE_SIZE
    const sprite = scene.add.sprite(px, py, key)
    sprite.setOrigin(0.5, 1)
    sprite.setDepth(4)
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
