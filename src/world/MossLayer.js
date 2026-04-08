import { WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE } from '../core/Constants.js'
import { TILES } from './TileTypes.js'

// Moss system: a living green film that spreads slowly across surface
// and soil tiles over real time. Stored as a bitmap mask parallel to
// the world grid; rendered as a Phaser Graphics overlay whose
// positions are refreshed only when the mask changes.
//
// Design notes:
// - The moss mask is a Uint8Array sized to the world grid. 1 bit per
//   tile means zero coupling to the main grid or collision system.
// - Spread is gated by the barrenFertile slider, ambient humidity
//   proxies (adjacent water), and distance from the sky. Fire-heavy
//   worlds end up nearly mossless; water-heavy ones quickly green over.
// - Draw cost is bounded by culling to the active camera rectangle so
//   a fully mossed world still only pays for what's on screen.

const TICK_INTERVAL = 6000 // 6 seconds between spread ticks
const BASE_SPREAD_CHANCE = 0.35 // chance per eligible neighbour per tick
const SEED_TILES = 24 // how many seed patches at world gen

export default class MossLayer {
  constructor(scene, worldGrid, params, surfaceHeights) {
    this.scene = scene
    this.worldGrid = worldGrid
    this.surfaceHeights = surfaceHeights
    this.fertility = params.barrenFertile ?? 0.5
    this.mossMask = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT)
    this._tickTimer = 0
    this._dirty = true

    // Moss colour: a lively lime-green that reads against almost any
    // base palette. Two pass rendering: a darker base film for body
    // and a brighter speckle highlight so patches feel mossy rather
    // than painted flat.
    this._mossColour = 0x2f8a26      // base film, mid lime
    this._mossHighlight = 0x9eea5c   // bright speckle highlight

    // Graphics overlay for rendering. Depth sits just above the tilemap
    // layer (which is at default 0 but ends up near 0-1) and below
    // entities like the god (depth 10+).
    this.gfx = scene.add.graphics()
      .setDepth(1.5)

    // Seed initial moss patches in fertile, shaded areas.
    this._seedInitial(params.seed || 0)
    this._redraw()
  }

  // Seed a handful of starter moss patches around the surface. Picks
  // columns with fertility-friendly conditions (near water, below
  // trees, or in the bottom band of the green biome). Every patch is
  // a small cluster so the moss has somewhere to spread from.
  _seedInitial(seed) {
    const grid = this.worldGrid.grid
    const rng = (() => {
      let s = seed | 0
      return () => {
        s = (s + 0x6d2b79f5) | 0
        let t = Math.imul(s ^ (s >>> 15), 1 | s)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
    })()

    for (let i = 0; i < SEED_TILES; i++) {
      // Pick a random column; prefer fertile ones by biasing mid-world
      const cx = Math.floor(rng() * WORLD_WIDTH)
      const baseY = Math.floor((this.surfaceHeights?.[cx] ?? WORLD_HEIGHT * 0.35))
      if (baseY >= WORLD_HEIGHT - 3) continue

      // Place a small cluster around (cx, baseY)
      const patchSize = 3 + Math.floor(rng() * 4)
      for (let j = 0; j < patchSize; j++) {
        const dx = Math.floor((rng() - 0.5) * 6)
        const dy = Math.floor((rng() - 0.5) * 3)
        const nx = ((cx + dx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH
        const ny = baseY + dy
        if (ny < 0 || ny >= WORLD_HEIGHT) continue
        const idx = ny * WORLD_WIDTH + nx
        const tile = grid[idx]
        // Only moss on the surface layer
        if (tile === TILES.SURFACE || tile === TILES.SOIL) {
          // Verify there's air above so the tile is "exposed"
          const above = ny > 0 ? grid[(ny - 1) * WORLD_WIDTH + nx] : TILES.AIR
          if (above === TILES.AIR) {
            this.mossMask[idx] = 1
          }
        }
      }
    }
  }

  // Is this tile eligible to grow moss? SURFACE/SOIL/CLAY with air above.
  _eligible(x, y, grid) {
    if (y <= 0 || y >= WORLD_HEIGHT) return false
    const tile = grid[y * WORLD_WIDTH + x]
    if (tile !== TILES.SURFACE && tile !== TILES.SOIL && tile !== TILES.CLAY) return false
    const above = grid[(y - 1) * WORLD_WIDTH + x]
    return above === TILES.AIR || above === TILES.TALL_GRASS || above === TILES.BUSH
  }

  // Is this tile near water? Used as a humidity proxy for spread speed.
  _nearWater(x, y, grid) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = ((x + dx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH
        const ny = y + dy
        if (ny < 0 || ny >= WORLD_HEIGHT) continue
        const t = grid[ny * WORLD_WIDTH + nx]
        if (t === TILES.WATER || t === TILES.DEEP_WATER) return true
      }
    }
    return false
  }

  // Spread tick: each currently mossy tile rolls to infect adjacent
  // eligible tiles. Spread chance scales with fertility and humidity.
  tick() {
    const grid = this.worldGrid.grid
    const mask = this.mossMask
    const newMoss = []

    const baseChance = BASE_SPREAD_CHANCE * (0.4 + this.fertility * 1.0)
    if (baseChance <= 0) return

    for (let y = 1; y < WORLD_HEIGHT - 1; y++) {
      for (let x = 0; x < WORLD_WIDTH; x++) {
        const idx = y * WORLD_WIDTH + x
        if (mask[idx] !== 1) continue

        // Neighbour offsets: 4-connected
        const neighbours = [
          [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
        ]
        for (const [nxRaw, ny] of neighbours) {
          const nx = ((nxRaw % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH
          if (ny < 0 || ny >= WORLD_HEIGHT) continue
          const nIdx = ny * WORLD_WIDTH + nx
          if (mask[nIdx]) continue
          if (!this._eligible(nx, ny, grid)) continue

          let chance = baseChance
          if (this._nearWater(nx, ny, grid)) chance *= 1.8
          if (Math.random() < chance) {
            newMoss.push(nIdx)
          }
        }
      }
    }

    if (newMoss.length > 0) {
      for (const idx of newMoss) mask[idx] = 1
      this._dirty = true
    }
  }

  // Kill moss on any tile that's no longer solid (e.g. dug out). Cheap
  // loop called when the grid signals potential changes.
  _sweepDestroyed() {
    const grid = this.worldGrid.grid
    const mask = this.mossMask
    let removed = 0
    // Sparse pass: only touch mossy tiles
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] !== 1) continue
      const tile = grid[i]
      if (tile !== TILES.SURFACE && tile !== TILES.SOIL && tile !== TILES.CLAY) {
        mask[i] = 0
        removed++
      }
    }
    if (removed > 0) this._dirty = true
  }

  // Redraw the Graphics overlay from the current mask. Culled to the
  // camera viewport so a fully mossed world still costs one draw per
  // visible tile, not per world tile.
  _redraw() {
    const gfx = this.gfx
    gfx.clear()

    const mask = this.mossMask
    const colour = this._mossColour
    const highlight = this._mossHighlight

    // Camera-visible tile range
    const cam = this.scene.cameras?.main
    let x0 = 0, x1 = WORLD_WIDTH
    let y0 = 0, y1 = WORLD_HEIGHT
    if (cam) {
      const pad = 2
      x0 = Math.max(0, Math.floor(cam.scrollX / TILE_SIZE) - pad)
      x1 = Math.min(WORLD_WIDTH, Math.ceil((cam.scrollX + cam.width) / TILE_SIZE) + pad)
      y0 = Math.max(0, Math.floor(cam.scrollY / TILE_SIZE) - pad)
      y1 = Math.min(WORLD_HEIGHT, Math.ceil((cam.scrollY + cam.height) / TILE_SIZE) + pad)
    }

    // Base film: a solid band across the top of each mossy tile so the
    // moss reads as a fuzzy layer sitting on the ground rather than a
    // tint on the whole tile. Pushed a pixel above the tile surface so
    // the effect feels raised.
    gfx.fillStyle(colour, 0.80)
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = y * WORLD_WIDTH + x
        if (mask[idx] !== 1) continue
        gfx.fillRect(x * TILE_SIZE, y * TILE_SIZE - 2, TILE_SIZE, 3)
      }
    }

    // Highlight speckles: bright lime dots on most mossy tiles for
    // visual grain. Deterministic speckle offset keeps each tile
    // uniquely patterned without randomness.
    gfx.fillStyle(highlight, 0.95)
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = y * WORLD_WIDTH + x
        if (mask[idx] !== 1) continue
        const h = (x * 7 + y * 13) & 7
        const dx = h & 3
        // Two speckles per tile, at different offsets
        gfx.fillRect(x * TILE_SIZE + dx, y * TILE_SIZE - 3, 2, 2)
        gfx.fillRect(x * TILE_SIZE + ((dx + 4) % TILE_SIZE), y * TILE_SIZE - 1, 1, 2)
      }
    }

    this._dirty = false
  }

  update(delta) {
    this._tickTimer += delta || 16
    if (this._tickTimer >= TICK_INTERVAL) {
      this._tickTimer = 0
      this._sweepDestroyed()
      this.tick()
    }
    // Redraw either when moss changed this frame or when the camera
    // moved (cheap enough to just redraw every frame; the loop is
    // bounded to the visible tile rectangle).
    this._redraw()
  }

  destroy() {
    if (this.gfx) this.gfx.destroy()
    this.mossMask = null
  }
}
