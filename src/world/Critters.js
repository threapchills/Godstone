import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT } from '../core/Constants.js'
import { TILES, SOLID_TILES } from './TileTypes.js'
import { findGroundTileY } from '../utils/Grounding.js'

// Simple ambient wildlife. Each critter is a tiny sprite that
// walks along surfaces, pauses, and reverses direction randomly.
// Purely decorative in Phase 1; becomes gameplay-relevant later.

// Multiple subtypes per element create per-world variety: which
// subtypes dominate depends on the seed, so two fire+water worlds
// can feel quite different (salamanders + phoenixes vs ash-hares +
// ember-mites). Each world picks two distinct subtypes per element.
const CRITTER_TYPES = {
  fire: [
    { colour: 0xcc4400, name: 'salamander', size: [8, 6] },
    { colour: 0xff7733, name: 'phoenix',    size: [7, 7] },
    { colour: 0xaa2200, name: 'ember-mite', size: [5, 4] },
    { colour: 0xdd5511, name: 'ash-hare',   size: [9, 6] },
    { colour: 0xff8800, name: 'spark-toad', size: [6, 5] },
  ],
  water: [
    { colour: 0x3388bb, name: 'crab',       size: [8, 6] },
    { colour: 0x44aacc, name: 'frog',       size: [7, 6] },
    { colour: 0x2266aa, name: 'newt',       size: [9, 5] },
    { colour: 0x55bbee, name: 'mudfish',    size: [10, 5] },
    { colour: 0x88ccdd, name: 'tide-shrimp',size: [6, 4] },
  ],
  air: [
    { colour: 0xccddee, name: 'moth',       size: [7, 6] },
    { colour: 0xeeeeff, name: 'wisp',       size: [5, 5] },
    { colour: 0xaabbcc, name: 'sky-mite',   size: [6, 4] },
    { colour: 0xddccff, name: 'cloud-bat',  size: [9, 5] },
    { colour: 0xffffff, name: 'pollen-mite',size: [4, 4] },
  ],
  earth: [
    { colour: 0x667744, name: 'beetle',     size: [8, 6] },
    { colour: 0x885533, name: 'lizard',     size: [9, 5] },
    { colour: 0x445522, name: 'cricket',    size: [6, 5] },
    { colour: 0x998866, name: 'mole-rat',   size: [10, 6] },
    { colour: 0x556633, name: 'rock-louse', size: [5, 4] },
  ],
}

// Pick two distinct critter subtypes per element so each world has
// fauna duets rather than a single voice. Falls back to one-of if
// the list is short for some reason.
function pickCritterPair(element, seed) {
  const list = CRITTER_TYPES[element] || CRITTER_TYPES.earth
  if (list.length === 1) return [list[0], list[0]]
  const a = Math.abs(seed * 2654435761) % list.length
  let b = Math.abs((seed + 7919) * 374761393) % list.length
  if (b === a) b = (a + 1) % list.length
  return [list[a], list[b]]
}

export default class CritterManager {
  constructor(scene, worldGrid, surfaceHeights, params) {
    this.scene = scene
    this.worldGrid = worldGrid
    this.critters = []

    const count = 15 + Math.floor(params.barrenFertile * 20)
    // Per-world fauna duet: each element contributes two distinct
    // subtypes so the world has up to four critter voices.
    const pair1 = pickCritterPair(params.element1, params.seed)
    const pair2 = pickCritterPair(params.element2, params.seed + 9999)
    const surfacePool = [pair1[0], pair1[1], pair2[0], pair2[1]]

    // Spawn critters along the surface
    for (let i = 0; i < count; i++) {
      const x = Math.floor(Math.random() * WORLD_WIDTH)
      const surfaceY = Math.floor(surfaceHeights[x])
      if (surfaceY <= 2 || surfaceY >= WORLD_HEIGHT - 5) continue

      const type = surfacePool[i % surfacePool.length]
      const critter = this.spawnCritter(scene, x, surfaceY, type)
      if (critter) this.critters.push(critter)
    }

    // A few cave-dwelling critters; pull from a different pair so
    // underground fauna feels distinct from surface fauna
    const cavePool = [pair2[0], pair2[1]]
    for (let i = 0; i < Math.floor(count * 0.3); i++) {
      const x = Math.floor(Math.random() * WORLD_WIDTH)
      const surfaceY = Math.floor(surfaceHeights[x])
      // Search below surface for a cave floor
      for (let y = surfaceY + 20; y < WORLD_HEIGHT - 10; y++) {
        const idx = y * WORLD_WIDTH + x
        if (worldGrid.grid[idx] === TILES.AIR) {
          const belowIdx = (y + 1) * WORLD_WIDTH + x
          if (y + 1 < WORLD_HEIGHT && SOLID_TILES.has(worldGrid.grid[belowIdx])) {
            const type = cavePool[i % cavePool.length]
            const critter = this.spawnCritter(scene, x, y, type)
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

    // Small but visible critter sprite (size varies per subtype)
    const key = `critter-${type.name}`
    const [tw, th] = type.size || [8, 6]
    if (!scene.textures.exists(key)) {
      const canvas = document.createElement('canvas')
      canvas.width = tw
      canvas.height = th
      const ctx = canvas.getContext('2d')

      const r = (type.colour >> 16) & 0xff
      const g = (type.colour >> 8) & 0xff
      const b = type.colour & 0xff

      // Generic critter body proportional to canvas size
      const bodyTop = Math.max(1, Math.floor(th * 0.3))
      const bodyHeight = Math.max(2, th - bodyTop - 1)
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fillRect(1, bodyTop, tw - 2, bodyHeight)
      // Head pokes forward on the right
      ctx.fillRect(tw - 2, bodyTop - 1, 2, Math.max(1, bodyHeight - 1))
      // Highlight stripe
      ctx.fillStyle = `rgb(${Math.min(255, r + 40)},${Math.min(255, g + 40)},${Math.min(255, b + 40)})`
      ctx.fillRect(2, bodyTop + 1, Math.max(1, tw - 4), 1)
      // Legs along the bottom row
      ctx.fillStyle = `rgb(${Math.max(0, r - 30)},${Math.max(0, g - 30)},${Math.max(0, b - 30)})`
      for (let lx = 1; lx < tw - 1; lx += 2) ctx.fillRect(lx, th - 1, 1, 1)

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

      // Snap to local ground each frame so critters hug terrain when
      // walking and fall when the god terraforms beneath them. Bounded
      // so a critter next to a chasm doesn't fall through; fallback
      // is the critter's existing tile y so it holds position.
      const tileX = Math.floor(critter.sprite.x / TILE_SIZE)
      const startTileY = Math.max(0, Math.floor(critter.sprite.y / TILE_SIZE) - 3)
      const fallbackTileY = Math.floor(critter.sprite.y / TILE_SIZE)
      const groundTileY = findGroundTileY(grid, tileX, startTileY, fallbackTileY)
      critter.sprite.y = groundTileY * TILE_SIZE
    }
  }
}
