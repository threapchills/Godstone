import { WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE } from '../core/Constants.js'
import { TILES } from './TileTypes.js'

export default class FoliageRenderer {
  constructor(scene, worldGrid, palette) {
    this.scene = scene
    this.worldGrid = worldGrid
    this.trees = []

    const texGroup = []
    
    // Scan the world and spawn massive trees where the world generator placed trunks
    for (let x = 0; x < WORLD_WIDTH; x++) {
      for (let y = 1; y < WORLD_HEIGHT; y++) {
        const idx = y * WORLD_WIDTH + x
        if (worldGrid.grid[idx] === TILES.TREE_TRUNK) {
          // Check if it's the base of the tree
          const below = worldGrid.grid[(y + 1) * WORLD_WIDTH + x]
          if (below !== TILES.TREE_TRUNK) {
            this.spawnTree(x, y, palette)
          }
        }
      }
    }
  }

  spawnTree(tileX, tileY, palette) {
    // We add randomness based on coordinates so it's deterministic
    const rngVal = ((tileX * 73856) ^ (tileY * 19349)) % 1000 / 1000
    
    const worldX = tileX * TILE_SIZE + TILE_SIZE / 2
    const worldY = (tileY + 1) * TILE_SIZE // Base of tree

    const sprite = this.scene.add.sprite(worldX, worldY, 'sb_tree')
    sprite.setOrigin(0.5, 1)

    // SkyBaby tree is 942x916px; our trees are ~5 tiles (40px) wide.
    // Target: 40-64px wide = scale 0.042-0.068 of the source sprite.
    const scale = 0.045 + rngVal * 0.025
    sprite.setScale(scale)

    // Tint tree based on the biome procedural colour assigned to tree leaves
    const colour = palette[TILES.TREE_LEAVES] || 0x4a7a2a
    sprite.setTint(colour)

    // Put them behind the player but in front of parallax
    sprite.setDepth(2)

    this.trees.push({
      sprite,
      baseIndex: tileY * WORLD_WIDTH + tileX
    })
  }

  update() {
    // Check if trees have been destroyed by the grid simulator (e.g. lava)
    for (let i = this.trees.length - 1; i >= 0; i--) {
      const tree = this.trees[i]
      if (this.worldGrid.grid[tree.baseIndex] !== TILES.TREE_TRUNK) {
        // Tree burned/destroyed!
        tree.sprite.destroy()
        this.trees.splice(i, 1)
      }
    }
  }

  destroy() {
    this.trees.forEach(t => t.sprite.destroy())
    this.trees = []
  }
}
