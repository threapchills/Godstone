import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT } from '../core/Constants.js'
import { TILES, SOLID_TILES } from './TileTypes.js'

// Simple ambient wildlife. Each critter is a tiny sprite that
// walks along surfaces, pauses, and reverses direction randomly.
// Purely decorative in Phase 1; becomes gameplay-relevant later.

const CRITTER_TYPES = {
  fire: { colour: 0xcc4400, name: 'salamander' },
  water: { colour: 0x3388bb, name: 'crab' },
  air: { colour: 0xccddee, name: 'moth' },
  earth: { colour: 0x667744, name: 'beetle' },
}

export default class CritterManager {
  constructor(scene, worldGrid, surfaceHeights, params) {
    this.scene = scene
    this.worldGrid = worldGrid
    this.critters = []

    const count = 15 + Math.floor(params.barrenFertile * 20)
    const type1 = CRITTER_TYPES[params.element1]
    const type2 = CRITTER_TYPES[params.element2]

    // Spawn critters along the surface
    for (let i = 0; i < count; i++) {
      const x = Math.floor(Math.random() * WORLD_WIDTH)
      const surfaceY = Math.floor(surfaceHeights[x])
      if (surfaceY <= 2 || surfaceY >= WORLD_HEIGHT - 5) continue

      // Alternate between the two element critter types
      const type = i % 2 === 0 ? type1 : type2
      const critter = this.spawnCritter(scene, x, surfaceY, type)
      if (critter) this.critters.push(critter)
    }

    // A few cave-dwelling critters
    for (let i = 0; i < Math.floor(count * 0.3); i++) {
      const x = Math.floor(Math.random() * WORLD_WIDTH)
      const surfaceY = Math.floor(surfaceHeights[x])
      // Search below surface for a cave floor
      for (let y = surfaceY + 20; y < WORLD_HEIGHT - 10; y++) {
        const idx = y * WORLD_WIDTH + x
        if (worldGrid.grid[idx] === TILES.AIR) {
          const belowIdx = (y + 1) * WORLD_WIDTH + x
          if (y + 1 < WORLD_HEIGHT && SOLID_TILES.has(worldGrid.grid[belowIdx])) {
            const critter = this.spawnCritter(scene, x, y, type2)
            if (critter) this.critters.push(critter)
            break
          }
        }
      }
    }
  }

  spawnCritter(scene, tileX, tileY, type) {
    const px = tileX * TILE_SIZE + TILE_SIZE / 2
    const py = tileY * TILE_SIZE

    // Small but visible critter sprite (one tile wide)
    const key = `critter-${type.name}`
    if (!scene.textures.exists(key)) {
      const canvas = document.createElement('canvas')
      canvas.width = 8
      canvas.height = 6
      const ctx = canvas.getContext('2d')

      const r = (type.colour >> 16) & 0xff
      const g = (type.colour >> 8) & 0xff
      const b = type.colour & 0xff

      // Body
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fillRect(1, 2, 6, 3)
      ctx.fillRect(2, 1, 4, 1)
      // Head
      ctx.fillRect(6, 1, 2, 2)
      // Highlight
      ctx.fillStyle = `rgb(${Math.min(255, r + 40)},${Math.min(255, g + 40)},${Math.min(255, b + 40)})`
      ctx.fillRect(3, 3, 2, 1)
      ctx.fillRect(7, 1, 1, 1)
      // Legs
      ctx.fillStyle = `rgb(${Math.max(0, r - 30)},${Math.max(0, g - 30)},${Math.max(0, b - 30)})`
      ctx.fillRect(2, 5, 1, 1)
      ctx.fillRect(4, 5, 1, 1)
      ctx.fillRect(6, 5, 1, 1)

      scene.textures.addCanvas(key, canvas)
    }

    const sprite = scene.add.sprite(px, py, key)
    sprite.setOrigin(0.5, 1)
    sprite.setDepth(4)

    return {
      sprite,
      tileX,
      tileY,
      typeName: type.name,
      direction: Math.random() > 0.5 ? 1 : -1,
      speed: 10 + Math.random() * 20,
      pauseTimer: 0,
      isPaused: false,
    }
  }

  update(delta) {
    const grid = this.worldGrid.grid

    for (const critter of this.critters) {
      if (critter.isPaused) {
        critter.pauseTimer -= delta
        if (critter.pauseTimer <= 0) {
          critter.isPaused = false
          // Maybe reverse direction
          if (Math.random() > 0.6) critter.direction *= -1
        }
        continue
      }

      // Move horizontally
      critter.sprite.x += critter.direction * critter.speed * delta / 1000
      critter.sprite.setFlipX(critter.direction < 0)

      // Check if there's ground ahead
      const nextTileX = Math.floor((critter.sprite.x + critter.direction * TILE_SIZE) / TILE_SIZE)
      const feetTileY = Math.floor(critter.sprite.y / TILE_SIZE)

      // Wrap horizontally
      if (critter.sprite.x < 0) critter.sprite.x += WORLD_WIDTH * TILE_SIZE
      if (critter.sprite.x >= WORLD_WIDTH * TILE_SIZE) critter.sprite.x -= WORLD_WIDTH * TILE_SIZE

      // Check for walls or edges
      if (nextTileX >= 0 && nextTileX < WORLD_WIDTH && feetTileY >= 0 && feetTileY < WORLD_HEIGHT) {
        const aheadIdx = feetTileY * WORLD_WIDTH + nextTileX
        const belowAheadIdx = (feetTileY + 1) * WORLD_WIDTH + nextTileX

        // Reverse if hitting a wall
        if (SOLID_TILES.has(grid[aheadIdx])) {
          critter.direction *= -1
        }
        // Reverse if there's no ground ahead (don't walk off ledges)
        else if (feetTileY + 1 < WORLD_HEIGHT && !SOLID_TILES.has(grid[belowAheadIdx])) {
          critter.direction *= -1
        }
      }

      // Random pause
      if (Math.random() < 0.003) {
        critter.isPaused = true
        critter.pauseTimer = 1000 + Math.random() * 3000
      }
    }
  }
}
