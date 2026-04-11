import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT } from '../core/Constants.js'
import { TILES, SOLID_TILES } from './TileTypes.js'
import { findGroundTileY } from '../utils/Grounding.js'

// Living world critters. Each critter is a tiny sprite with a basic
// state machine: wander along surfaces, pause, reverse. Beyond the
// original ambient behaviour the system now supports:
//
//   - Multiple species per element (herbivores + one volatile predator)
//   - Sizes: pup and adult; pups scale up as they age
//   - Breeding: adults of the same species near each other occasionally
//     spawn a pup at their midpoint
//   - Predator AI: volatile species hunt villagers within range and
//     nibble at village population on contact
//   - HP: critters take damage from bolt spells and direct god contact
//     and fade out when killed
//
// The sim is deliberately cheap: no physics integration, just tile
// lookups and a bounded outer loop capped by the critter count.

// Herbivore vocab per element — now mapped to storybook sprites.
// Each species references a storybook illustration sprite key and
// a tint colour; the sprite is scaled to a target pixel height
// so all critters sit naturally in the 8px-tile world.
const HERBIVORES = {
  fire: [
    { colour: 0xcc4400, name: 'salamander', sprite: 'sb_pig',          height: 10, hp: 3, speed: 15 },
    { colour: 0xff7733, name: 'phoenix',    sprite: 'sb_eagle',        height: 10, hp: 3, speed: 18 },
    { colour: 0xaa2200, name: 'ember-mite', sprite: 'sb_pig',          height: 7,  hp: 2, speed: 22 },
    { colour: 0xdd5511, name: 'ash-hare',   sprite: 'sb_stag_deer',    height: 11, hp: 4, speed: 25 },
    { colour: 0xff8800, name: 'spark-toad', sprite: 'sb_pig',          height: 8,  hp: 3, speed: 14 },
  ],
  water: [
    { colour: 0x3388bb, name: 'crab',       sprite: 'sb_aquatic_fish',  height: 9,  hp: 4, speed: 12 },
    { colour: 0x44aacc, name: 'frog',       sprite: 'sb_aquatic_fish',  height: 8,  hp: 3, speed: 18 },
    { colour: 0x2266aa, name: 'newt',       sprite: 'sb_aquatic_fish',  height: 8,  hp: 3, speed: 16 },
    { colour: 0x55bbee, name: 'mudfish',    sprite: 'sb_aquatic_fish',  height: 10, hp: 3, speed: 14 },
    { colour: 0x88ccdd, name: 'tide-shrimp',sprite: 'sb_aquatic_fish',  height: 6,  hp: 2, speed: 20 },
  ],
  air: [
    { colour: 0xccddee, name: 'moth',       sprite: 'sb_eagle',        height: 9,  hp: 2, speed: 22 },
    { colour: 0xeeeeff, name: 'wisp',       sprite: 'sb_pet_cloud',    height: 7,  hp: 2, speed: 24 },
    { colour: 0xaabbcc, name: 'sky-mite',   sprite: 'sb_eagle',        height: 7,  hp: 2, speed: 20 },
    { colour: 0xddccff, name: 'cloud-bat',  sprite: 'sb_eagle',        height: 10, hp: 3, speed: 26 },
    { colour: 0xffffff, name: 'pollen-mite',sprite: 'sb_pet_cloud',    height: 6,  hp: 2, speed: 22 },
  ],
  earth: [
    { colour: 0x667744, name: 'beetle',     sprite: 'sb_pig',          height: 9,  hp: 4, speed: 12 },
    { colour: 0x885533, name: 'lizard',     sprite: 'sb_stag_deer',    height: 10, hp: 3, speed: 18 },
    { colour: 0x445522, name: 'cricket',    sprite: 'sb_pig',          height: 7,  hp: 2, speed: 20 },
    { colour: 0x998866, name: 'mole-rat',   sprite: 'sb_pig',          height: 10, hp: 4, speed: 16 },
    { colour: 0x556633, name: 'rock-louse', sprite: 'sb_pig',          height: 6,  hp: 2, speed: 14 },
  ],
}

// Volatile predators — one per element. Bears and stags serve as the
// large, menacing storybook creatures.
const PREDATORS = {
  fire:  { colour: 0xff3322, name: 'ash-wolf',    sprite: 'sb_bear',  height: 16, hp: 12, speed: 28, volatile: true },
  water: { colour: 0x125548, name: 'bog-serpent', sprite: 'sb_bear',  height: 14, hp: 10, speed: 24, volatile: true },
  air:   { colour: 0xd0d8e0, name: 'storm-crow',  sprite: 'sb_eagle', height: 14, hp:  9, speed: 32, volatile: true },
  earth: { colour: 0x4a3320, name: 'dire-mole',   sprite: 'sb_bear',  height: 16, hp: 14, speed: 22, volatile: true },
}

// Per-species breeding cooldown and pup parameters
const PUP_AGE = 30000      // ms; pups grow to adult after this
const BREED_COOLDOWN = 45000 // ms between breeds per critter
const BREED_RANGE_TILES = 6
const BREED_CHANCE = 0.35  // per tick roll for an eligible pair
const BREED_TICK_INTERVAL = 5000 // ms

// Predator hunting parameters
const HUNT_RANGE_PIXELS = 10 * TILE_SIZE
const ATTACK_RANGE_PIXELS = 2 * TILE_SIZE
const ATTACK_COOLDOWN = 1200 // ms per damage tick
const ATTACK_DAMAGE_POP = 0.12 // village population decrement per hit

// God contact damage
const GOD_HIT_COOLDOWN = 500 // ms between god collision damage ticks
const GOD_HIT_DAMAGE = 2

function pickCritterPair(element, seed) {
  const list = HERBIVORES[element] || HERBIVORES.earth
  if (list.length === 1) return [list[0], list[0]]
  const a = Math.abs(seed * 2654435761) % list.length
  let b = Math.abs((seed + 7919) * 374761393) % list.length
  if (b === a) b = (a + 1) % list.length
  return [list[a], list[b]]
}

function pickPredator(element) {
  return PREDATORS[element] || PREDATORS.earth
}

export default class CritterManager {
  constructor(scene, worldGrid, surfaceHeights, params) {
    this.scene = scene
    this.worldGrid = worldGrid
    this.critters = []
    this._breedTimer = 0
    this._params = params

    const count = 15 + Math.floor(params.barrenFertile * 20)
    const pair1 = pickCritterPair(params.element1, params.seed)
    const pair2 = pickCritterPair(params.element2, params.seed + 9999)
    const surfacePool = [pair1[0], pair1[1], pair2[0], pair2[1]]

    // Herbivore spawns along the surface
    for (let i = 0; i < count; i++) {
      const x = Math.floor(Math.random() * WORLD_WIDTH)
      const surfaceY = Math.floor(surfaceHeights[x])
      if (surfaceY <= 2 || surfaceY >= WORLD_HEIGHT - 5) continue
      const type = surfacePool[i % surfacePool.length]
      const critter = this.spawnCritter(x, surfaceY, type, false)
      if (critter) this.critters.push(critter)
    }

    // Cave herbivores (the existing behaviour)
    const cavePool = [pair2[0], pair2[1]]
    for (let i = 0; i < Math.floor(count * 0.3); i++) {
      const x = Math.floor(Math.random() * WORLD_WIDTH)
      const surfaceY = Math.floor(surfaceHeights[x])
      for (let y = surfaceY + 20; y < WORLD_HEIGHT - 10; y++) {
        const idx = y * WORLD_WIDTH + x
        if (worldGrid.grid[idx] === TILES.AIR) {
          const belowIdx = (y + 1) * WORLD_WIDTH + x
          if (y + 1 < WORLD_HEIGHT && SOLID_TILES.has(worldGrid.grid[belowIdx])) {
            const type = cavePool[i % cavePool.length]
            const critter = this.spawnCritter(x, y, type, false)
            if (critter) this.critters.push(critter)
            break
          }
        }
      }
    }

    // Predators — one species per element, a handful of each.
    // Deliberately few so they feel like rare threats, not a swarm.
    const predatorTypes = [pickPredator(params.element1), pickPredator(params.element2)]
    const predatorCount = 3 + Math.floor(params.sparseDense * 4)
    for (let i = 0; i < predatorCount; i++) {
      const x = Math.floor(Math.random() * WORLD_WIDTH)
      const surfaceY = Math.floor(surfaceHeights[x])
      if (surfaceY <= 2 || surfaceY >= WORLD_HEIGHT - 5) continue
      const type = predatorTypes[i % predatorTypes.length]
      const critter = this.spawnCritter(x, surfaceY, type, false)
      if (critter) this.critters.push(critter)
    }
  }

  // Spawn a critter using its storybook sprite, scaled to the target
  // height and tinted with the species' elemental colour.
  spawnCritter(tileX, tileY, type, isPup = false) {
    const px = tileX * TILE_SIZE + TILE_SIZE / 2
    const py = tileY * TILE_SIZE

    // Use the storybook sprite; fall back to a canvas if not loaded
    const spriteKey = type.sprite && this.scene.textures.exists(type.sprite) ? type.sprite : null
    let sprite

    if (spriteKey) {
      sprite = this.scene.add.sprite(px, py, spriteKey)
      sprite.setOrigin(0.5, 1)
      sprite.setDepth(4)

      // Scale to target height
      const targetH = type.height || 10
      const srcH = sprite.height || 100
      const scale = targetH / srcH
      sprite.setScale(isPup ? scale * 0.5 : scale)

      // Tint with species colour
      if (type.colour) sprite.setTint(type.colour)
    } else {
      // Legacy canvas fallback
      const key = `critter-${type.name}`
      const tw = 8; const th = 6
      if (!this.scene.textures.exists(key)) {
        const canvas = document.createElement('canvas')
        canvas.width = tw; canvas.height = th
        const ctx = canvas.getContext('2d')
        const r = (type.colour >> 16) & 0xff
        const g = (type.colour >> 8) & 0xff
        const b = type.colour & 0xff
        ctx.fillStyle = `rgb(${r},${g},${b})`
        ctx.fillRect(1, 1, tw - 2, th - 2)
        this.scene.textures.addCanvas(key, canvas)
      }
      sprite = this.scene.add.sprite(px, py, key)
      sprite.setOrigin(0.5, 1)
      sprite.setDepth(4)
      if (isPup) sprite.setScale(0.6)
    }

    return {
      sprite,
      type,
      typeName: type.name,
      tileX,
      tileY,
      direction: Math.random() > 0.5 ? 1 : -1,
      speed: type.speed || 15,
      pauseTimer: 0,
      isPaused: false,
      hp: type.hp || 3,
      maxHp: type.hp || 3,
      isPup,
      age: 0,
      breedCooldown: BREED_COOLDOWN * (0.5 + Math.random()), // stagger first breed
      dying: false,
      // Predator behaviour state
      volatile: !!type.volatile,
      behaviour: 'wander',
      targetVillage: null,
      attackCooldown: 0,
      godHitCooldown: 0,
    }
  }

  // Apply damage to a critter. Flashes the sprite and, if it runs out
  // of HP, marks it for a fade-out death.
  damageCritter(critter, amount) {
    if (critter.dying) return
    critter.hp -= amount
    // Red flash
    if (critter.sprite) {
      critter.sprite.setTintFill?.(0xffffff)
      this.scene.time?.delayedCall?.(80, () => {
        if (critter.sprite?.clearTint) critter.sprite.clearTint()
      })
    }
    if (critter.hp <= 0) {
      critter.dying = true
      if (this.scene.tweens && critter.sprite) {
        this.scene.tweens.add({
          targets: critter.sprite,
          alpha: 0,
          duration: 350,
          onComplete: () => { if (critter.sprite) critter.sprite.destroy() },
        })
      } else if (critter.sprite) {
        critter.sprite.destroy()
      }
    }
  }

  // Given a world point and a radius, damage any critter inside the
  // radius. Used by bolt spells to kill wildlife along their arc.
  damageInRadius(x, y, radius, amount) {
    const r2 = radius * radius
    let hit = 0
    for (const c of this.critters) {
      if (c.dying || !c.sprite) continue
      const dx = c.sprite.x - x
      const dy = c.sprite.y - y
      // Wrap dx for horizontal world wrap
      const worldPx = WORLD_WIDTH * TILE_SIZE
      const wrappedDx = ((dx % worldPx) + worldPx * 1.5) % worldPx - worldPx / 2
      if (wrappedDx * wrappedDx + dy * dy <= r2) {
        this.damageCritter(c, amount)
        hit++
      }
    }
    return hit
  }

  // Find the nearest village to a world point, within range.
  _nearestVillage(worldX, worldY, rangePx) {
    const villages = this.scene.villages || []
    if (!villages.length) return null
    let best = null
    let bestD = rangePx * rangePx
    const worldPxWidth = WORLD_WIDTH * TILE_SIZE
    for (const v of villages) {
      if (!v.worldX && v.tileX != null) v.worldX = v.tileX * TILE_SIZE
      if (!v.worldY && v.tileY != null) v.worldY = v.tileY * TILE_SIZE
      const dxRaw = v.worldX - worldX
      const wrappedDx = ((dxRaw % worldPxWidth) + worldPxWidth * 1.5) % worldPxWidth - worldPxWidth / 2
      const dy = v.worldY - worldY
      const d2 = wrappedDx * wrappedDx + dy * dy
      if (d2 < bestD) { bestD = d2; best = v }
    }
    return best
  }

  update(delta) {
    const grid = this.worldGrid.grid
    const godSprite = this.scene.god?.sprite
    const dt = delta || 16

    // Breed tick on a slow interval
    this._breedTimer += dt
    const runBreed = this._breedTimer >= BREED_TICK_INTERVAL
    if (runBreed) this._breedTimer = 0

    for (let i = this.critters.length - 1; i >= 0; i--) {
      const critter = this.critters[i]
      if (!critter.sprite) { this.critters.splice(i, 1); continue }
      if (critter.dying) {
        // sprite will self-destroy via the tween; just skip logic
        continue
      }

      // Age and pup growth
      critter.age += dt
      if (critter.isPup && critter.age >= PUP_AGE) {
        critter.isPup = false
        critter.sprite.setScale(1)
      }
      if (critter.breedCooldown > 0) critter.breedCooldown -= dt
      if (critter.attackCooldown > 0) critter.attackCooldown -= dt
      if (critter.godHitCooldown > 0) critter.godHitCooldown -= dt

      // Predator behaviour: look for a villager target and pursue
      if (critter.volatile && !critter.isPup) {
        const target = this._nearestVillage(critter.sprite.x, critter.sprite.y, HUNT_RANGE_PIXELS)
        critter.targetVillage = target
        if (target) {
          const worldPxWidth = WORLD_WIDTH * TILE_SIZE
          const dxRaw = target.worldX - critter.sprite.x
          const dx = ((dxRaw % worldPxWidth) + worldPxWidth * 1.5) % worldPxWidth - worldPxWidth / 2
          const dist = Math.abs(dx)
          if (dist > ATTACK_RANGE_PIXELS) {
            critter.direction = dx > 0 ? 1 : -1
            critter.behaviour = 'pursue'
            critter.isPaused = false
          } else if (critter.attackCooldown <= 0) {
            // Attack: nibble at village population
            critter.behaviour = 'attack'
            critter.attackCooldown = ATTACK_COOLDOWN
            if (typeof target.population === 'number') {
              target.population = Math.max(0, target.population - ATTACK_DAMAGE_POP)
              if (target._refreshLabel) target._refreshLabel()
            }
            // Feedback: a quick red flash on the critter sprite
            if (critter.sprite.setTintFill) {
              critter.sprite.setTintFill(0xff3333)
              this.scene.time?.delayedCall?.(120, () => {
                if (critter.sprite?.clearTint) critter.sprite.clearTint()
              })
            }
          }
        } else {
          critter.behaviour = 'wander'
        }
      }

      // God contact damage — any critter touching the god takes a hit,
      // on a cooldown so it isn't instant death on brush.
      if (godSprite && !critter.dying && critter.godHitCooldown <= 0) {
        const dx = godSprite.x - critter.sprite.x
        const dy = godSprite.y - critter.sprite.y
        if (dx * dx + dy * dy < (10 * 10)) {
          this.damageCritter(critter, GOD_HIT_DAMAGE)
          critter.godHitCooldown = GOD_HIT_COOLDOWN
          if (critter.dying) continue
        }
      }

      // Movement
      if (critter.isPaused) {
        critter.pauseTimer -= dt
        if (critter.pauseTimer <= 0) {
          critter.isPaused = false
          if (Math.random() > 0.6) critter.direction *= -1
        }
        continue
      }

      critter.sprite.x += critter.direction * critter.speed * dt / 1000
      critter.sprite.setFlipX(critter.direction < 0)

      // Wrap horizontally
      if (critter.sprite.x < 0) critter.sprite.x += WORLD_WIDTH * TILE_SIZE
      if (critter.sprite.x >= WORLD_WIDTH * TILE_SIZE) critter.sprite.x -= WORLD_WIDTH * TILE_SIZE

      // Ground / wall check ahead
      const nextTileX = Math.floor((critter.sprite.x + critter.direction * TILE_SIZE) / TILE_SIZE)
      const feetTileY = Math.floor(critter.sprite.y / TILE_SIZE)
      if (nextTileX >= 0 && nextTileX < WORLD_WIDTH && feetTileY >= 0 && feetTileY < WORLD_HEIGHT) {
        const aheadIdx = feetTileY * WORLD_WIDTH + nextTileX
        const belowAheadIdx = (feetTileY + 1) * WORLD_WIDTH + nextTileX
        if (SOLID_TILES.has(grid[aheadIdx])) {
          critter.direction *= -1
        } else if (feetTileY + 1 < WORLD_HEIGHT && !SOLID_TILES.has(grid[belowAheadIdx])) {
          // Predators chasing a target shouldn't walk off cliffs either,
          // but they can reverse less often so pursuit feels persistent
          if (!critter.volatile || critter.behaviour !== 'pursue' || Math.random() < 0.4) {
            critter.direction *= -1
          }
        }
      }

      // Random pause (wanderers only)
      if (!critter.volatile && Math.random() < 0.003) {
        critter.isPaused = true
        critter.pauseTimer = 1000 + Math.random() * 3000
      }

      // Snap to ground
      const tileX = Math.floor(critter.sprite.x / TILE_SIZE)
      const startTileY = Math.max(0, Math.floor(critter.sprite.y / TILE_SIZE) - 3)
      const fallbackTileY = Math.floor(critter.sprite.y / TILE_SIZE)
      const groundTileY = findGroundTileY(grid, tileX, startTileY, fallbackTileY)
      critter.sprite.y = groundTileY * TILE_SIZE
      critter.tileX = tileX
      critter.tileY = groundTileY
    }

    // Breed tick: adults of same species within range, both off
    // cooldown, roll to spawn a pup at the midpoint.
    if (runBreed) this._breedTick()
  }

  _breedTick() {
    const adults = this.critters.filter(c =>
      !c.dying && !c.isPup && c.breedCooldown <= 0 && c.sprite
    )
    const breedRangeSq = (BREED_RANGE_TILES * TILE_SIZE) ** 2
    const spawned = []
    for (let i = 0; i < adults.length; i++) {
      const a = adults[i]
      if (a.breedCooldown > 0) continue
      for (let j = i + 1; j < adults.length; j++) {
        const b = adults[j]
        if (b.breedCooldown > 0) continue
        if (a.typeName !== b.typeName) continue
        const dx = a.sprite.x - b.sprite.x
        const dy = a.sprite.y - b.sprite.y
        if (dx * dx + dy * dy > breedRangeSq) continue
        if (Math.random() >= BREED_CHANCE) continue

        // Spawn a pup at the midpoint
        const mx = (a.sprite.x + b.sprite.x) * 0.5
        const my = (a.sprite.y + b.sprite.y) * 0.5
        const tileX = Math.floor(mx / TILE_SIZE)
        const tileY = Math.floor(my / TILE_SIZE)
        const pup = this.spawnCritter(tileX, tileY, a.type, true)
        if (pup) {
          spawned.push(pup)
          a.breedCooldown = BREED_COOLDOWN
          b.breedCooldown = BREED_COOLDOWN
          break // skip remaining pair candidates for this adult
        }
      }
    }
    for (const p of spawned) this.critters.push(p)
  }

  destroy() {
    for (const c of this.critters) {
      if (c.sprite) c.sprite.destroy()
    }
    this.critters = []
  }
}
