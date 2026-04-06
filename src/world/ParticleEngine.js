import { TILE_SIZE, GAME_WIDTH, GAME_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT } from '../core/Constants.js'
import { TILES } from './TileTypes.js'
import { buildPalette } from './TileTypes.js'

const POOL_SIZE = 150
const BASE_SPAWN_RATE = 8
const SOFT_TEX_SIZE = 32  // px; soft circle texture resolution
const SOFT_TEX_HALF = SOFT_TEX_SIZE / 2

// Wind tendencies per element; blended by the world's element ratio
const ELEMENT_WINDS = {
  fire:  { x: 0,  y: -12 },
  water: { x: 15, y: 2 },
  air:   { x: 25, y: -3 },
  earth: { x: 3,  y: -5 },
}

// Generate a radial-gradient circle: bright centre, transparent edge
function createSoftCircleTexture(scene) {
  const key = '_softParticle'
  if (scene.textures.exists(key)) return key

  const canvas = document.createElement('canvas')
  canvas.width = SOFT_TEX_SIZE
  canvas.height = SOFT_TEX_SIZE
  const ctx = canvas.getContext('2d')
  const grad = ctx.createRadialGradient(
    SOFT_TEX_HALF, SOFT_TEX_HALF, 0,
    SOFT_TEX_HALF, SOFT_TEX_HALF, SOFT_TEX_HALF
  )
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.3, 'rgba(255,255,255,0.7)')
  grad.addColorStop(0.7, 'rgba(255,255,255,0.2)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, SOFT_TEX_SIZE, SOFT_TEX_SIZE)

  scene.textures.addCanvas(key, canvas)
  return key
}

export default class ParticleEngine {
  constructor(scene, params, worldGrid, surfaceHeights) {
    this.scene = scene
    this.worldGrid = worldGrid
    this.surfaceHeights = surfaceHeights

    // Colour banks keyed by particle type, sourced from the world palette
    const palette = buildPalette(params.element1, params.element2, params.elementRatio)
    this.colours = {
      ember:      [palette[TILES.LAVA] || 0xff4500, 0xff6600, 0xff3300],
      smoke:      [0x666666, 0x777777, 0x555555],
      shimmer:    [0xffeedd],
      magmaSpark: [palette[TILES.LAVA] || 0xff4500, 0xffaa00],
      spray:      [palette[TILES.WATER] || 0x4a9aba, 0xc0d8e8, 0xaaccdd],
      foam:       [0xc0d8e8, 0xd0e0f0],
      drip:       [palette[TILES.WATER] || 0x4a9aba],
      leaf:       [palette[TILES.TREE_LEAVES] || 0x4a7a2a, palette[TILES.BUSH] || 0x3a6a2a],
      cloudWisp:  [palette[TILES.CLOUD] || 0xc8d8e8, 0xd8e8f0],
      dustMote:   [0x998866, 0x887755],
      pollen:     [0xaacc44, 0xbbdd55, 0x99bb33],
      spore:      [palette[TILES.MUSHROOM] || 0xaa6644, 0xcc8855],
      firefly:    [0xccff44, 0xddff66, 0xbbee33],
      dust:       [palette[TILES.SOIL] || 0x5a4a2a, palette[TILES.SAND] || 0xc2a64e],
    }

    // Dominant element gets ~60% of spawns
    const ratio = params.elementRatio / 10
    this.el1 = params.element1
    this.el2 = params.element2
    this.el1Weight = 0.2 + ratio * 0.6

    // World-level wind: blended from both elements
    const w1 = ELEMENT_WINDS[params.element1]
    const w2 = ELEMENT_WINDS[params.element2]
    this.wind = {
      x: w1.x * ratio + w2.x * (1 - ratio),
      y: w1.y * ratio + w2.y * (1 - ratio),
    }

    // Soft-edged texture shared by default particles
    this.defaultTexKey = createSoftCircleTexture(scene)

    // Pre-allocate the pool with image sprites
    this.pool = new Array(POOL_SIZE)
    for (let i = 0; i < POOL_SIZE; i++) {
        const sprite = scene.add.image(0, 0, this.defaultTexKey)
        .setVisible(false).setDepth(6).setAlpha(0).setOrigin(0.5)
      this.pool[i] = {
        sprite,
        x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 1,
        sizeStart: 2, sizeEnd: 2,
        flickerRate: 0,
        spinSpeed: 0,
        type: '',
        active: false,
      }
    }

    this.spawnAccum = 0
  }

  // ── Main tick ──────────────────────────────────────────────

  update(delta, godSprite, dayTime) {
    const cam = this.scene.cameras.main
    const vl = cam.scrollX
    const vt = cam.scrollY
    const vr = vl + GAME_WIDTH
    const vb = vt + GAME_HEIGHT
    const margin = 120

    const dtSec = delta / 1000
    for (let i = 0; i < POOL_SIZE; i++) {
      const p = this.pool[i]
      if (!p.active) continue

      p.life -= delta
      if (p.life <= 0) { p.active = false; p.sprite.setVisible(false); continue }

      // Movement + wind
      p.vx += this.wind.x * dtSec * 0.3
      p.vy += this.wind.y * dtSec * 0.3
      p.x += p.vx * dtSec
      p.y += p.vy * dtSec
      
      if (p.spinSpeed) {
        p.sprite.rotation += p.spinSpeed * dtSec * p.vx * 0.05
      }

      // Life progress: 0 at birth, 1 at death
      const t = p.life / p.maxLife
      const progress = 1 - t

      // Fade envelope: ramp in over first 20%, ramp out over last 30%
      let alpha = t < 0.3 ? t / 0.3 : t > 0.8 ? (1 - t) / 0.2 : 1
      if (p.flickerRate > 0) {
        alpha *= 0.4 + 0.6 * Math.abs(Math.sin(Date.now() * p.flickerRate))
      } else {
        alpha *= 0.85
      }

      // Size over lifetime: lerp between start and end
      const currentSize = p.sizeStart + (p.sizeEnd - p.sizeStart) * progress
      const scale = currentSize / SOFT_TEX_HALF

      p.sprite.setPosition(p.x, p.y)
      p.sprite.setAlpha(Math.max(0, alpha))
      p.sprite.setScale(scale)

      if (p.x < vl - margin || p.x > vr + margin || p.y < vt - margin || p.y > vb + margin) {
        p.active = false
        p.sprite.setVisible(false)
      }
    }

    // Spawn
    this.spawnAccum += delta
    const interval = 1000 / BASE_SPAWN_RATE
    while (this.spawnAccum >= interval) {
      this.spawnAccum -= interval
      this.emitAmbient(godSprite, dayTime, vl, vt, vr, vb)
    }
  }

  // ── Context-sensitive spawn decision ───────────────────────

  emitAmbient(godSprite, dayTime, vl, vt, vr, vb) {
    const godTileX = ((Math.floor(godSprite.x / TILE_SIZE) % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH
    const godTileY = Math.floor(godSprite.y / TILE_SIZE)
    const surfaceY = this.surfaceHeights[godTileX] || WORLD_HEIGHT * 0.3
    const underground = godTileY > surfaceY + 5
    const night = dayTime > 0.5

    const el = Math.random() < this.el1Weight ? this.el1 : this.el2
    const defs = this.candidatesFor(el, underground, night)
    if (defs.length === 0) return

    const def = defs[Math.floor(Math.random() * defs.length)]

    let x, y
    if (def.spawn === 'edge') {
      const edge = Math.random() * 4 | 0
      if (edge === 0)      { x = vl - 10; y = vt + Math.random() * GAME_HEIGHT }
      else if (edge === 1) { x = vr + 10; y = vt + Math.random() * GAME_HEIGHT }
      else if (edge === 2) { x = vl + Math.random() * GAME_WIDTH; y = vt - 10 }
      else                 { x = vl + Math.random() * GAME_WIDTH; y = vb + 10 }
    } else if (def.spawn === 'area') {
      x = vl + Math.random() * GAME_WIDTH
      y = vt + Math.random() * GAME_HEIGHT
    } else if (def.spawn === 'tile') {
      const pos = this.findTile(def.tiles, vl, vt, vr, vb)
      if (!pos) return
      x = pos.x; y = pos.y
    }

    const bank = this.colours[def.key]
    const colour = bank[Math.random() * bank.length | 0]
    this.spawn(def, x, y, colour)
  }

  // ── Particle type catalogues ───────────────────────────────
  // sizeEnd: final radius relative to spawn size. >1 = expands, <1 = shrinks.

  candidatesFor(element, underground, night) {
    const c = []

    if (element === 'fire') {
      if (!underground) {
        c.push({ key: 'ember', size: [2, 4], sizeEnd: 0.3, life: [2000, 4000], vx: [-5, 5], vy: [-20, -8], spawn: 'edge', depth: 11, flickerRate: 0.006 })
        c.push({ key: 'smoke', size: [4, 8], sizeEnd: 2.0, life: [3000, 6000], vx: [-8, 8], vy: [-15, -5], spawn: 'edge', depth: 5 })
        if (!night) c.push({ key: 'shimmer', size: [6, 12], sizeEnd: 1.3, life: [1500, 3000], vx: [-2, 2], vy: [-3, 3], spawn: 'area', depth: 5, flickerRate: 0.01 })
      } else {
        c.push({ key: 'magmaSpark', size: [2, 3], sizeEnd: 0.2, life: [800, 1500], vx: [-15, 15], vy: [-30, -10], spawn: 'tile', tiles: [TILES.LAVA, TILES.MAGMA_ROCK], depth: 11, flickerRate: 0.008 })
        c.push({ key: 'ember', size: [2, 3.5], sizeEnd: 0.3, life: [1500, 3000], vx: [-5, 5], vy: [-12, -4], spawn: 'area', depth: 6, flickerRate: 0.005 })
      }
    }

    if (element === 'water') {
      if (!underground) {
        c.push({ key: 'spray', size: [2, 4], sizeEnd: 0.5, life: [1500, 3000], vx: [-10, 10], vy: [-8, 2], spawn: 'tile', tiles: [TILES.WATER, TILES.DEEP_WATER], depth: 6 })
        c.push({ key: 'foam', size: [3, 5], sizeEnd: 1.5, life: [2000, 4000], vx: [-12, 12], vy: [-3, 3], spawn: 'edge', depth: 5 })
      } else {
        c.push({ key: 'drip', size: [1.5, 2.5], sizeEnd: 0.4, life: [1000, 2000], vx: [-1, 1], vy: [15, 30], spawn: 'tile', tiles: [TILES.WATER, TILES.DEEP_WATER], depth: 6 })
        c.push({ key: 'spray', size: [2, 3.5], sizeEnd: 1.3, life: [1500, 2500], vx: [-5, 5], vy: [-3, 3], spawn: 'area', depth: 5 })
      }
    }

    if (element === 'air') {
      if (!underground) {
        c.push({ key: 'leaf', sprite: 'leaf', size: [6, 10], sizeEnd: 0.8, life: [3000, 6000], vx: [10, 30], vy: [-5, 8], spawn: 'edge', depth: 6, spinSpeed: 0.8 })
        c.push({ key: 'cloudWisp', size: [6, 12], sizeEnd: 1.5, life: [4000, 7000], vx: [5, 15], vy: [-2, 2], spawn: 'edge', depth: 5 })
      } else {
        c.push({ key: 'dustMote', size: [2, 3.5], sizeEnd: 1.2, life: [3000, 5000], vx: [-3, 3], vy: [-2, 2], spawn: 'area', depth: 5 })
      }
    }

    if (element === 'earth') {
      if (!underground) {
        c.push({ key: 'pollen', size: [2, 3.5], sizeEnd: 0.7, life: [3000, 5000], vx: [-5, 8], vy: [-10, -3], spawn: 'area', depth: 6 })
        c.push({ key: 'leaf', sprite: 'leaf', size: [4, 8], sizeEnd: 0.8, life: [3000, 5000], vx: [-5, 5], vy: [-5, 10], spawn: 'area', depth: 6, spinSpeed: 0.5 })
        c.push({ key: 'dust', size: [3, 5], sizeEnd: 1.4, life: [2000, 4000], vx: [-8, 8], vy: [-3, 3], spawn: 'edge', depth: 5 })
        if (night) c.push({ key: 'firefly', size: [2, 3.5], sizeEnd: 1.0, life: [4000, 8000], vx: [-5, 5], vy: [-5, 5], spawn: 'area', depth: 11, flickerRate: 0.004 })
      } else {
        c.push({ key: 'spore', size: [2, 3.5], sizeEnd: 1.3, life: [2500, 4000], vx: [-3, 3], vy: [-8, -2], spawn: 'tile', tiles: [TILES.MUSHROOM], depth: 6 })
        c.push({ key: 'dustMote', size: [2, 3.5], sizeEnd: 1.2, life: [3000, 5000], vx: [-2, 2], vy: [-2, 2], spawn: 'area', depth: 5 })
        if (night) c.push({ key: 'firefly', size: [2, 3], sizeEnd: 1.0, life: [3000, 6000], vx: [-4, 4], vy: [-4, 4], spawn: 'area', depth: 11, flickerRate: 0.003 })
      }
    }

    return c
  }

  // ── Tile scanner ───────────────────────────────────────────

  findTile(tileTypes, vl, vt, vr, vb) {
    const wanted = new Set(tileTypes)
    const minY = Math.max(0, Math.floor(vt / TILE_SIZE))
    const maxY = Math.min(WORLD_HEIGHT - 1, Math.floor(vb / TILE_SIZE))
    if (maxY <= minY) return null

    for (let attempt = 0; attempt < 10; attempt++) {
      const px = vl + Math.random() * GAME_WIDTH
      const tileX = ((Math.floor(px / TILE_SIZE) % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH
      for (let s = 0; s < 5; s++) {
        const tileY = minY + (Math.random() * (maxY - minY) | 0)
        if (wanted.has(this.worldGrid.grid[tileY * WORLD_WIDTH + tileX])) {
          return {
            x: tileX * TILE_SIZE + TILE_SIZE / 2 + (Math.random() - 0.5) * TILE_SIZE * 2,
            y: tileY * TILE_SIZE + (Math.random() - 0.5) * TILE_SIZE,
          }
        }
      }
    }
    return null
  }

  // ── Pool recycler ──────────────────────────────────────────

  spawn(def, x, y, colour) {
    let p = null
    for (let i = 0; i < POOL_SIZE; i++) {
      if (!this.pool[i].active) { p = this.pool[i]; break }
    }
    if (!p) return

    const size = def.size[0] + Math.random() * (def.size[1] - def.size[0])
    const life = def.life[0] + Math.random() * (def.life[1] - def.life[0])
    const endMultiplier = def.sizeEnd !== undefined ? def.sizeEnd : 1.0

    p.active = true
    p.type = def.key
    p.x = x
    p.y = y
    p.vx = def.vx[0] + Math.random() * (def.vx[1] - def.vx[0])
    p.vy = def.vy[0] + Math.random() * (def.vy[1] - def.vy[0])
    p.life = life
    p.maxLife = life
    p.sizeStart = size
    p.sizeEnd = size * endMultiplier
    p.flickerRate = def.flickerRate || 0
    p.spinSpeed = def.spinSpeed || 0

    p.sprite.setTexture(def.sprite || this.defaultTexKey)

    p.sprite.setTint(colour)
    p.sprite.setPosition(x, y)
    p.sprite.setScale(size / SOFT_TEX_HALF)
    p.sprite.setDepth(def.depth || 6)
    p.sprite.setVisible(true)
    p.sprite.setAlpha(0)
  }

  // ── Cleanup ────────────────────────────────────────────────

  destroy() {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].sprite.destroy()
    }
    this.pool = []
  }
}
