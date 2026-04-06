import { WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE } from '../core/Constants.js'
import { TILES } from './TileTypes.js'

// Manages large SkyBaby tree sprites overlaid on the tilemap where
// the world generator placed TREE_TRUNK tiles. Handles wind sway,
// depth-based alpha, and dynamic destruction when lava burns forests.

export default class FoliageRenderer {
  constructor(scene, worldGrid, palette) {
    this.scene = scene
    this.worldGrid = worldGrid
    this.trees = []
    this.time = 0

    // Scan the world and spawn trees where the generator placed trunks
    for (let x = 0; x < WORLD_WIDTH; x++) {
      for (let y = 1; y < WORLD_HEIGHT; y++) {
        const idx = y * WORLD_WIDTH + x
        if (worldGrid.grid[idx] === TILES.TREE_TRUNK) {
          // Only spawn at the base of the tree (not mid-trunk)
          const below = worldGrid.grid[(y + 1) * WORLD_WIDTH + x]
          if (below !== TILES.TREE_TRUNK) {
            this.spawnTree(x, y, palette)
          }
        }
      }
    }
  }

  spawnTree(tileX, tileY, palette) {
    // Deterministic pseudorandom from position; no Math.random dependency
    const rng = ((tileX * 73856) ^ (tileY * 19349)) % 1000 / 1000

    // Snap to actual ground: trees should sit on the topmost solid tile
    // directly below the trunk base, not float above eroded terrain
    let groundY = tileY + 1
    while (groundY < WORLD_HEIGHT) {
      const tile = this.worldGrid.grid[groundY * WORLD_WIDTH + tileX]
      if (tile !== TILES.AIR && tile !== TILES.TREE_TRUNK && tile !== TILES.TREE_LEAVES) break
      groundY++
    }
    if (groundY >= WORLD_HEIGHT) return // no ground; abort

    const worldX = tileX * TILE_SIZE + TILE_SIZE / 2
    const worldY = groundY * TILE_SIZE // top of the actual ground tile

    const sprite = this.scene.add.sprite(worldX, worldY, 'sb_tree')
    sprite.setOrigin(0.5, 1)

    // SkyBaby tree is 942x916px; target 40-64px wide in the 8px-tile world
    const scale = 0.045 + rng * 0.025
    sprite.setScale(scale)

    // Tint to match the biome's leaf palette; slight per-tree hue shift
    // so forests aren't monotonous
    const baseColour = palette[TILES.TREE_LEAVES] || 0x4a7a2a
    const r = ((baseColour >> 16) & 0xff)
    const g = ((baseColour >> 8) & 0xff)
    const b = (baseColour & 0xff)
    // Shift hue by ±15% per tree for variety
    const shift = (rng - 0.5) * 0.3
    const tr = Math.max(0, Math.min(255, Math.round(r * (1 + shift * 0.5))))
    const tg = Math.max(0, Math.min(255, Math.round(g * (1 + shift))))
    const tb = Math.max(0, Math.min(255, Math.round(b * (1 - shift * 0.3))))
    sprite.setTint((tr << 16) | (tg << 8) | tb)

    // Deeper trees (underground) are dimmer; surface trees full brightness
    const surfaceY = this.worldGrid.surfaceHeights
      ? this.worldGrid.surfaceHeights[tileX] || WORLD_HEIGHT * 0.3
      : WORLD_HEIGHT * 0.3
    const depthFactor = tileY > surfaceY + 10 ? 0.5 : 1.0
    sprite.setAlpha(depthFactor)

    // Behind the player but in front of parallax sky
    sprite.setDepth(2)

    this.trees.push({
      sprite,
      baseIndex: tileY * WORLD_WIDTH + tileX,
      baseScale: scale,
      // Wind sway: phase offset so trees don't oscillate in lockstep
      swayPhase: rng * Math.PI * 2,
      swayAmplitude: 0.02 + rng * 0.02,
    })
  }

  update(delta) {
    // Accumulate time for wind sway animation
    this.time += (delta || 16) / 1000

    for (let i = this.trees.length - 1; i >= 0; i--) {
      const tree = this.trees[i]

      // Check if tree has been destroyed (lava, digging, etc.)
      if (this.worldGrid.grid[tree.baseIndex] !== TILES.TREE_TRUNK) {
        tree.sprite.destroy()
        this.trees.splice(i, 1)
        continue
      }

      // Wind sway: gentle sinusoidal rotation around the base
      const sway = Math.sin(this.time * 1.2 + tree.swayPhase) * tree.swayAmplitude
      tree.sprite.rotation = sway
    }
  }

  destroy() {
    this.trees.forEach(t => t.sprite.destroy())
    this.trees = []
  }
}
