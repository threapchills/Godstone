import { WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE } from '../core/Constants.js'
import { TILES, SOLID_TILES } from './TileTypes.js'
import { findGroundTileY } from '../utils/Grounding.js'

// Manages large SkyBaby tree sprites overlaid on the tilemap where
// the world generator placed TREE_TRUNK tiles. Handles wind sway,
// depth-based alpha, dynamic destruction when lava burns forests,
// and a slow life cycle: saplings mature into full trees, full trees
// occasionally drop saplings onto adjacent surface tiles, and old
// trees wither and die. This gives forests a sense of slow change
// over real time without heavy simulation cost.

const LIFE = {
  SAPLING: 'sapling',
  YOUNG: 'young',
  MATURE: 'mature',
  OLD: 'old',
  DEAD: 'dead',
}

// Target scales per life stage, relative to the stored base scale.
// Base scale is the "mature" size; other stages scale from there.
const STAGE_SCALE = {
  sapling: 0.25,
  young: 0.55,
  mature: 1.00,
  old: 0.92,
  dead: 0.80,
}

// Tint multipliers per stage (applied to the mature tint).
// Old and dead trees desaturate and darken.
const STAGE_TINT_MUL = {
  sapling: { r: 1.05, g: 1.10, b: 1.00 }, // fresh, slightly brighter green
  young:   { r: 1.00, g: 1.05, b: 1.00 },
  mature:  { r: 1.00, g: 1.00, b: 1.00 },
  old:     { r: 0.85, g: 0.80, b: 0.70 },
  dead:    { r: 0.55, g: 0.45, b: 0.35 },
}

// How long a tree stays in each stage on average (milliseconds of
// real time). Randomised ±30% per tree so forests don't all age in
// lockstep. Numbers deliberately slow so player doesn't see manic
// growth.
const STAGE_DURATION = {
  sapling: 120000, // 2 min
  young:   240000, // 4 min
  mature:  480000, // 8 min
  old:     180000, // 3 min
  dead:    60000,  // 1 min before cleanup
}

// Sapling drop: mature trees roll once per tick to drop a sapling
// nearby; low probability so forests stay stable.
const SAPLING_DROP_CHANCE = 0.04
const SAPLING_DROP_RANGE = 6 // tiles
const TICK_INTERVAL = 8000 // 8 s

export default class FoliageRenderer {
  constructor(scene, worldGrid, palette) {
    this.scene = scene
    this.worldGrid = worldGrid
    this.palette = palette
    this.trees = []
    this.time = 0
    this._tickTimer = 0

    // Scan the world and spawn trees where the generator placed trunks.
    // Each starts at "mature" stage with a randomised age offset so the
    // existing forest isn't a single cohort.
    for (let x = 0; x < WORLD_WIDTH; x++) {
      for (let y = 1; y < WORLD_HEIGHT; y++) {
        const idx = y * WORLD_WIDTH + x
        if (worldGrid.grid[idx] === TILES.TREE_TRUNK) {
          // Only spawn at the base of the tree (not mid-trunk)
          const below = worldGrid.grid[(y + 1) * WORLD_WIDTH + x]
          if (below !== TILES.TREE_TRUNK) {
            this.spawnTree(x, y, palette, LIFE.MATURE)
          }
        }
      }
    }
  }

  // Spawn a tree at a tile position. Stage controls initial appearance
  // and age. New saplings start at 0 age in SAPLING; worldgen trees
  // start at a randomised mature age so the starting forest isn't
  // synchronised.
  spawnTree(tileX, tileY, palette, stage = LIFE.MATURE) {
    // Deterministic pseudorandom per position so two trees spawned at
    // the same coord don't come back different after rebuild.
    const rng = ((tileX * 73856) ^ (tileY * 19349)) % 1000 / 1000

    // Snap to actual ground: trees should sit on the topmost solid tile
    // directly below the trunk base, not float above eroded terrain.
    let groundY = tileY + 1
    while (groundY < WORLD_HEIGHT) {
      const tile = this.worldGrid.grid[groundY * WORLD_WIDTH + tileX]
      if (tile !== TILES.AIR && tile !== TILES.TREE_TRUNK && tile !== TILES.TREE_LEAVES) break
      groundY++
    }
    if (groundY >= WORLD_HEIGHT) return null // no ground; abort

    const worldX = tileX * TILE_SIZE + TILE_SIZE / 2
    const worldY = groundY * TILE_SIZE // top of the actual ground tile

    const sprite = this.scene.add.sprite(worldX, worldY, 'sb_tree')
    sprite.setOrigin(0.5, 1)

    // SkyBaby tree is 942x916px; target 40-64px wide in the 8px-tile world.
    // This is the MATURE scale; actual sprite scale is baseScale * stage factor.
    const baseScale = 0.045 + rng * 0.025
    sprite.setScale(baseScale * STAGE_SCALE[stage])

    // Tint to match the biome's leaf palette; slight per-tree hue shift
    // so forests aren't monotonous.
    const baseColour = palette[TILES.TREE_LEAVES] || 0x4a7a2a
    const r = ((baseColour >> 16) & 0xff)
    const g = ((baseColour >> 8) & 0xff)
    const b = (baseColour & 0xff)
    // Shift hue by ±15% per tree for variety.
    const shift = (rng - 0.5) * 0.3
    const matureTintR = Math.max(0, Math.min(255, Math.round(r * (1 + shift * 0.5))))
    const matureTintG = Math.max(0, Math.min(255, Math.round(g * (1 + shift))))
    const matureTintB = Math.max(0, Math.min(255, Math.round(b * (1 - shift * 0.3))))

    const tintMul = STAGE_TINT_MUL[stage]
    const tr = Math.max(0, Math.min(255, Math.round(matureTintR * tintMul.r)))
    const tg = Math.max(0, Math.min(255, Math.round(matureTintG * tintMul.g)))
    const tb = Math.max(0, Math.min(255, Math.round(matureTintB * tintMul.b)))
    sprite.setTint((tr << 16) | (tg << 8) | tb)

    // Deeper trees (underground) are dimmer; surface trees full brightness.
    const surfaceY = this.worldGrid.surfaceHeights
      ? this.worldGrid.surfaceHeights[tileX] || WORLD_HEIGHT * 0.3
      : WORLD_HEIGHT * 0.3
    const depthFactor = tileY > surfaceY + 10 ? 0.5 : 1.0
    sprite.setAlpha(depthFactor)

    // Behind the player but in front of parallax sky
    sprite.setDepth(2)

    // For existing worldgen trees spawning as "mature", give them a
    // randomised age inside the mature band so the starting forest is
    // naturally mixed. New saplings always begin at age 0.
    const initialAge = stage === LIFE.MATURE
      ? Math.floor(Math.random() * STAGE_DURATION.mature * 0.8)
      : 0

    const tree = {
      sprite,
      tileX,
      tileY: groundY - 1, // base row (topmost trunk tile)
      baseIndex: tileY * WORLD_WIDTH + tileX,
      baseScale,
      baseTint: { r: matureTintR, g: matureTintG, b: matureTintB },
      stage,
      age: initialAge,
      stageLength: STAGE_DURATION[stage] * (0.7 + Math.random() * 0.6),
      // Wind sway: phase offset so trees don't oscillate in lockstep
      swayPhase: rng * Math.PI * 2,
      swayAmplitude: 0.02 + rng * 0.02,
    }
    this.trees.push(tree)
    return tree
  }

  // Advance a tree to its next life stage, updating sprite scale and tint.
  _advanceStage(tree) {
    const order = [LIFE.SAPLING, LIFE.YOUNG, LIFE.MATURE, LIFE.OLD, LIFE.DEAD]
    const idx = order.indexOf(tree.stage)
    if (idx < 0 || idx >= order.length - 1) {
      // Already dead — nothing to do; cleanup happens in the main update loop.
      return
    }
    tree.stage = order[idx + 1]
    tree.age = 0
    tree.stageLength = STAGE_DURATION[tree.stage] * (0.7 + Math.random() * 0.6)

    const scale = tree.baseScale * STAGE_SCALE[tree.stage]
    tree.sprite.setScale(scale)

    const mul = STAGE_TINT_MUL[tree.stage]
    const tr = Math.max(0, Math.min(255, Math.round(tree.baseTint.r * mul.r)))
    const tg = Math.max(0, Math.min(255, Math.round(tree.baseTint.g * mul.g)))
    const tb = Math.max(0, Math.min(255, Math.round(tree.baseTint.b * mul.b)))
    tree.sprite.setTint((tr << 16) | (tg << 8) | tb)
  }

  // Drop a sapling on a nearby valid surface. Returns true if one was
  // planted. Valid: a SURFACE or SAND tile with AIR directly above,
  // no existing trunk within a couple of tiles, within drop range of
  // the parent.
  _tryDropSapling(parent) {
    const grid = this.worldGrid.grid
    // Try a handful of offsets to avoid an exhaustive scan.
    for (let attempt = 0; attempt < 5; attempt++) {
      const dx = Math.floor((Math.random() - 0.5) * 2 * SAPLING_DROP_RANGE)
      if (dx === 0) continue
      const nx = ((parent.tileX + dx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH

      // Find the topmost solid surface in this column via the usual helper.
      // Start the search a few rows above the parent so we catch hills too.
      const startY = Math.max(0, parent.tileY - 6)
      let foundY = -1
      for (let y = startY; y < WORLD_HEIGHT - 2; y++) {
        const tile = grid[y * WORLD_WIDTH + nx]
        const above = y > 0 ? grid[(y - 1) * WORLD_WIDTH + nx] : TILES.AIR
        if ((tile === TILES.SURFACE || tile === TILES.SAND) && above === TILES.AIR) {
          foundY = y
          break
        }
      }
      if (foundY < 0) continue

      // Check that nothing else is there: no existing trunk in the 3 tiles
      // above the surface, and no other tree within 3 tiles horizontally.
      let clear = true
      for (let dy = 1; dy <= 3; dy++) {
        const t = grid[(foundY - dy) * WORLD_WIDTH + nx]
        if (t === TILES.TREE_TRUNK || t === TILES.TREE_LEAVES) { clear = false; break }
      }
      if (!clear) continue
      let tooClose = false
      for (const other of this.trees) {
        if (other.stage === LIFE.DEAD) continue
        const odx = Math.min(Math.abs(other.tileX - nx), WORLD_WIDTH - Math.abs(other.tileX - nx))
        if (odx <= 2 && Math.abs(other.tileY - (foundY - 1)) <= 3) {
          tooClose = true; break
        }
      }
      if (tooClose) continue

      // Place a single trunk tile so the existing grid-coupling still
      // sees this as "a tree" and the destruction check in update()
      // continues to work. Saplings are 1 tile tall until they mature.
      grid[(foundY - 1) * WORLD_WIDTH + nx] = TILES.TREE_TRUNK
      // Also sync to the tilemap layer so re-saved world state includes
      // the sapling and the grid reflects reality. Phaser layer won't
      // render it as anything because TREE_TRUNK is filtered out of the
      // tilemap data in createTilemap, which is fine.
      this.spawnTree(nx, foundY - 1, this.palette, LIFE.SAPLING)
      return true
    }
    return false
  }

  update(delta) {
    const dt = delta || 16

    // Wind sway + ground snap per frame (cheap)
    this.time += dt / 1000
    const grid = this.worldGrid.grid

    for (let i = this.trees.length - 1; i >= 0; i--) {
      const tree = this.trees[i]

      // Check if tree has been destroyed externally (lava, digging, etc.)
      if (grid[tree.baseIndex] !== TILES.TREE_TRUNK && tree.stage !== LIFE.DEAD) {
        tree.sprite.destroy()
        this.trees.splice(i, 1)
        continue
      }

      // Wind sway: gentle sinusoidal rotation around the base.
      // Older trees sway less (heavier); saplings sway more (lighter).
      const ampMul = tree.stage === LIFE.SAPLING ? 1.5 : (tree.stage === LIFE.OLD ? 0.6 : 1.0)
      const sway = Math.sin(this.time * 1.2 + tree.swayPhase) * tree.swayAmplitude * ampMul
      tree.sprite.rotation = sway

      // Re-snap the trunk base to current ground so the tree drops
      // when the dirt beneath it is dug out. Cheap, bounded search.
      const startTileY = Math.max(0, Math.floor(tree.sprite.y / TILE_SIZE) - 2)
      const fallbackTileY = Math.floor(tree.sprite.y / TILE_SIZE)
      const groundTileY = findGroundTileY(grid, tree.tileX, startTileY, fallbackTileY)
      tree.sprite.y = groundTileY * TILE_SIZE

      // Age accumulation runs every frame for smooth stage transitions
      // (so you can in principle see a slight colour drift on a tree
      // that's about to age up). Heavy work gated to the tick timer.
      tree.age += dt
    }

    // Slow tick for life cycle decisions (stage advances, sapling drops)
    this._tickTimer += dt
    if (this._tickTimer >= TICK_INTERVAL) {
      this._tickTimer = 0
      this._lifeTick()
    }
  }

  _lifeTick() {
    for (let i = this.trees.length - 1; i >= 0; i--) {
      const tree = this.trees[i]

      // Dead trees get cleaned up after their final stage duration.
      // Clear the trunk tile so the world grid agrees that the tree is gone.
      if (tree.stage === LIFE.DEAD && tree.age >= tree.stageLength) {
        const grid = this.worldGrid.grid
        if (grid[tree.baseIndex] === TILES.TREE_TRUNK) {
          grid[tree.baseIndex] = TILES.AIR
        }
        tree.sprite.destroy()
        this.trees.splice(i, 1)
        continue
      }

      // Advance stage when this tree has served its current stage length.
      if (tree.age >= tree.stageLength && tree.stage !== LIFE.DEAD) {
        this._advanceStage(tree)
      }

      // Mature trees occasionally drop a sapling on nearby surface.
      if (tree.stage === LIFE.MATURE && Math.random() < SAPLING_DROP_CHANCE) {
        this._tryDropSapling(tree)
      }
    }
  }

  destroy() {
    this.trees.forEach(t => t.sprite.destroy())
    this.trees = []
  }
}
