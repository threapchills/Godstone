import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT } from '../core/Constants.js'
import { TILES, SOLID_TILES, LIQUID_TILES } from './TileTypes.js'

// Soft terrain edge overlay system. Places storybook bush/rock sprites
// along the boundaries where solid terrain meets air, adding organic
// softness on top of the autotiled terrain edges.
//
// Architecture: sprites are created once per terrain position and
// stored in a Map keyed by position. When the camera moves, only
// positions that enter/leave the viewport are added/removed. This
// prevents the flashing caused by full-rebuild approaches.

const MAX_SPRITES = 800
const UPDATE_INTERVAL = 200 // ms between checks

export default class TerrainEdges {
  constructor(scene, worldGrid, palette) {
    this.scene = scene
    this.worldGrid = worldGrid
    this._sprites = new Map() // key: "x,y" -> sprite
    this._timer = 0
    this._initialized = false

    this._surfaceTint = palette?.[TILES.SURFACE] || 0x4a7a2a
    this._soilTint = palette?.[TILES.SOIL] || 0x5a4a2a
    this._canopyKey = null
    this._rockKey = null
  }

  _ensureInit() {
    if (this._initialized) return
    this._initialized = true
    const scene = this.scene
    this._canopyKey = scene.textures.exists('sb_bushes') ? 'sb_bushes' : 'leaf'
    this._rockKey = scene.textures.exists('sb_rocks') ? 'sb_rocks' : this._canopyKey
  }

  // Deterministic hash for per-position variation
  _hash(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0
    h = (h ^ (h >>> 13)) * 1274126177
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
  }

  update(delta, camera) {
    this._timer += delta
    if (this._timer < UPDATE_INTERVAL) return
    this._timer = 0
    this._ensureInit()

    const zoom = camera.zoom || 1
    const halfW = (camera.width / zoom) * 0.5
    const halfH = (camera.height / zoom) * 0.5
    const camCX = camera.scrollX + halfW
    const camCY = camera.scrollY + halfH

    // Wide margin so sprites exist well beyond viewport
    const margin = TILE_SIZE * 18
    const startX = Math.max(0, Math.floor((camCX - halfW - margin) / TILE_SIZE))
    const startY = Math.max(0, Math.floor((camCY - halfH - margin) / TILE_SIZE))
    const endX = Math.min(WORLD_WIDTH, Math.ceil((camCX + halfW + margin) / TILE_SIZE))
    const endY = Math.min(WORLD_HEIGHT, Math.ceil((camCY + halfH + margin) / TILE_SIZE))

    const grid = this.worldGrid.grid
    const needed = new Set()

    // Scan visible range and mark needed positions
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const wx = ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH
        const tile = grid[y * WORLD_WIDTH + wx]
        if (!SOLID_TILES.has(tile)) continue

        const above = y > 0 ? grid[(y - 1) * WORLD_WIDTH + wx] : TILES.AIR
        if (!SOLID_TILES.has(above) && !LIQUID_TILES.has(above)) {
          needed.add(`${x},${y}`)
        }
      }
    }

    // Remove sprites that are no longer needed
    for (const [key, sprite] of this._sprites) {
      if (!needed.has(key)) {
        sprite.destroy()
        this._sprites.delete(key)
      }
    }

    // Add sprites for new positions (cap total)
    for (const key of needed) {
      if (this._sprites.has(key)) continue
      if (this._sprites.size >= MAX_SPRITES) break

      const [xStr, yStr] = key.split(',')
      const x = Number(xStr)
      const y = Number(yStr)
      const rng = this._hash(x, y)

      const px = x * TILE_SIZE + TILE_SIZE * 0.5 + (rng - 0.5) * TILE_SIZE * 0.5
      const py = y * TILE_SIZE + TILE_SIZE * 0.2

      const sprite = this.scene.add.sprite(px, py, this._canopyKey)
        .setOrigin(0.5, 1)
        .setDepth(1.5)

      const srcH = sprite.height || 100
      const targetH = 8 + rng * 10
      sprite.setScale(targetH / srcH)
      sprite.setAlpha(0.5 + rng * 0.3)
      sprite.setTint(this._surfaceTint)
      sprite.setRotation((rng - 0.5) * 0.5)
      sprite.setFlipX(rng > 0.5)

      this._sprites.set(key, sprite)
    }
  }

  destroy() {
    for (const sprite of this._sprites.values()) sprite.destroy()
    this._sprites.clear()
  }
}
