import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT } from '../core/Constants.js'
import { TILES, SOLID_TILES, LIQUID_TILES } from './TileTypes.js'

// Soft terrain edge overlay system. Covers the harsh 8px tile grid
// at terrain boundaries with overlapping storybook sprites that give
// the landscape an organic, illustrated feel. The physics grid is
// untouched; this is purely cosmetic.
//
// Three overlay types:
//  1. Top canopy: large bush sprites along the terrain surface that
//     create a grass/earth canopy hiding the top-of-terrain staircase
//  2. Side vines: smaller rock/leaf sprites on exposed vertical faces
//  3. Corner softeners: tiny decorations at inner/outer corners
//
// Only tiles within the camera viewport get overlays. A fixed sprite
// pool is recycled each time the camera moves.

const POOL_SIZE = 600
const UPDATE_INTERVAL = 80 // ms between full overlay refreshes

export default class TerrainEdges {
  constructor(scene, worldGrid, palette) {
    this.scene = scene
    this.worldGrid = worldGrid
    this.palette = palette

    this._pool = []
    this._active = []
    this._timer = 0
    this._lastCamKey = ''
    this._initialized = false

    // Tints from palette
    this._surfaceTint = palette?.[TILES.SURFACE] || 0x4a7a2a
    this._soilTint = palette?.[TILES.SOIL] || 0x5a4a2a
    this._stoneTint = palette?.[TILES.STONE] || 0x5a5a4a
  }

  _ensurePool() {
    if (this._initialized) return
    this._initialized = true

    // Pick the best available sprite for canopy edges
    const scene = this.scene
    this._canopyKey = scene.textures.exists('sb_bushes') ? 'sb_bushes' : 'leaf'
    this._rockKey = scene.textures.exists('sb_rocks') ? 'sb_rocks' : this._canopyKey
    this._leafKey = scene.textures.exists('leaf') ? 'leaf' : this._canopyKey

    for (let i = 0; i < POOL_SIZE; i++) {
      const sprite = scene.add.sprite(0, 0, this._canopyKey)
        .setOrigin(0.5, 1)
        .setVisible(false)
        .setDepth(1.5)
      this._pool.push(sprite)
    }
  }

  update(delta, camera) {
    this._timer += delta
    if (this._timer < UPDATE_INTERVAL) return
    this._timer = 0
    this._ensurePool()

    const zoom = camera.zoom || 1
    const halfW = (camera.width / zoom) * 0.5
    const halfH = (camera.height / zoom) * 0.5
    const camCX = camera.scrollX + halfW
    const camCY = camera.scrollY + halfH

    // Wide margin so edge sprites materialise well beyond the camera
    // view and the player never sees the pop-in transition.
    const margin = TILE_SIZE * 16
    const startX = Math.max(0, Math.floor((camCX - halfW - margin) / TILE_SIZE))
    const startY = Math.max(0, Math.floor((camCY - halfH - margin) / TILE_SIZE))
    const endX = Math.min(WORLD_WIDTH, Math.ceil((camCX + halfW + margin) / TILE_SIZE))
    const endY = Math.min(WORLD_HEIGHT, Math.ceil((camCY + halfH + margin) / TILE_SIZE))

    const camKey = `${startX},${startY},${endX},${endY}`
    if (camKey === this._lastCamKey) return
    this._lastCamKey = camKey

    // Return active sprites to pool
    for (const s of this._active) {
      s.setVisible(false)
      this._pool.push(s)
    }
    this._active = []

    const grid = this.worldGrid.grid
    let placed = 0

    // Deterministic hash for per-position variation
    const hash = (x, y) => {
      let h = (x * 374761393 + y * 668265263) | 0
      h = (h ^ (h >>> 13)) * 1274126177
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296
    }

    for (let y = startY; y < endY && placed < POOL_SIZE - 20; y++) {
      for (let x = startX; x < endX && placed < POOL_SIZE - 20; x++) {
        const wx = ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH
        const idx = y * WORLD_WIDTH + wx
        const tile = grid[idx]
        if (!SOLID_TILES.has(tile)) continue

        const above = y > 0 ? grid[(y - 1) * WORLD_WIDTH + wx] : TILES.AIR
        const left = grid[y * WORLD_WIDTH + ((wx - 1 + WORLD_WIDTH) % WORLD_WIDTH)]
        const right = grid[y * WORLD_WIDTH + ((wx + 1) % WORLD_WIDTH)]

        const airAbove = !SOLID_TILES.has(above) && !LIQUID_TILES.has(above)
        const airLeft = !SOLID_TILES.has(left) && !LIQUID_TILES.has(left)
        const airRight = !SOLID_TILES.has(right) && !LIQUID_TILES.has(right)

        if (!airAbove && !airLeft && !airRight) continue

        const px = x * TILE_SIZE + TILE_SIZE * 0.5
        const py = y * TILE_SIZE
        const rng = hash(wx, y)

        // Top edge: large bush canopy that overhangs the air-to-solid boundary.
        // This is the key visual trick - the bush hides the staircase edge.
        if (airAbove) {
          const sprite = this._pool.pop()
          if (!sprite) break
          sprite.setTexture(this._canopyKey)
          // Position so the bush bottom sits at the tile top, bush body extends above
          sprite.setPosition(px + (rng - 0.5) * TILE_SIZE * 0.6, py + TILE_SIZE * 0.15)
          sprite.setVisible(true)
          // Bushes are ~100-200px source; we want ~12-18px rendered
          const srcH = sprite.height || 100
          const targetH = 10 + rng * 8
          sprite.setScale(targetH / srcH)
          sprite.setAlpha(0.65 + rng * 0.25)
          sprite.setTint(this._surfaceTint)
          sprite.setRotation((rng - 0.5) * 0.5)
          sprite.setFlipX(rng > 0.5)
          this._active.push(sprite)
          placed++
        }

        // Left exposed face: small rock/vine decoration
        if (airLeft && placed < POOL_SIZE - 5) {
          const sprite = this._pool.pop()
          if (!sprite) break
          sprite.setTexture(this._rockKey)
          sprite.setPosition(px - TILE_SIZE * 0.4, py + TILE_SIZE * 0.5)
          sprite.setVisible(true)
          const srcH = sprite.height || 100
          sprite.setScale((6 + rng * 4) / srcH)
          sprite.setAlpha(0.4 + rng * 0.2)
          sprite.setTint(this._soilTint)
          sprite.setRotation(Math.PI * 0.5 + (rng - 0.5) * 0.4)
          sprite.setFlipX(false)
          this._active.push(sprite)
          placed++
        }

        // Right exposed face
        if (airRight && placed < POOL_SIZE - 5) {
          const sprite = this._pool.pop()
          if (!sprite) break
          sprite.setTexture(this._rockKey)
          sprite.setPosition(px + TILE_SIZE * 0.4, py + TILE_SIZE * 0.5)
          sprite.setVisible(true)
          const srcH = sprite.height || 100
          sprite.setScale((6 + rng * 4) / srcH)
          sprite.setAlpha(0.4 + rng * 0.2)
          sprite.setTint(this._soilTint)
          sprite.setRotation(-Math.PI * 0.5 + (rng - 0.5) * 0.4)
          sprite.setFlipX(true)
          this._active.push(sprite)
          placed++
        }
      }
    }
  }

  destroy() {
    for (const s of this._active) s.destroy()
    for (const s of this._pool) s.destroy()
    this._active = []
    this._pool = []
  }
}
