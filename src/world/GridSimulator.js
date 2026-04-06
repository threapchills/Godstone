import { TILES } from './TileTypes.js'

export default class GridSimulator {
  constructor(scene, worldGrid) {
    this.scene = scene
    this.worldGrid = worldGrid
    this.width = worldGrid.width
    this.height = worldGrid.height
    this.grid = worldGrid.grid
    this.layer = worldGrid.layer
    
    // Track update ticks to throttle execution if necessary
    this.tickRate = 50 // ms between grid updates
    this.lastTick = 0
  }

  update(time, delta, activeRect) {
    if (time - this.lastTick < this.tickRate) return
    this.lastTick = time

    // activeRect is {x, y, w, h} in tiles defining what's visible/active near the camera
    const startX = Math.max(0, activeRect.x)
    const endX = Math.min(this.width - 1, activeRect.x + activeRect.w)
    const startY = Math.max(0, activeRect.y)
    const endY = Math.min(this.height - 2, activeRect.y + activeRect.h)

    // Process bottom to top
    const isLtr = Math.random() < 0.5
    for (let y = endY; y >= startY; y--) {
      for (let i = 0; i <= endX - startX; i++) {
        const x = isLtr ? startX + i : endX - i
        const idx = y * this.width + x
        const tile = this.grid[idx]

        if (tile === TILES.SAND) {
          this.updateSand(x, y, idx)
        } else if (tile === TILES.WATER || tile === TILES.DEEP_WATER) {
          this.updateWater(x, y, idx)
        } else if (tile === TILES.LAVA) {
          this.updateLava(x, y, idx)
        }
      }
    }
  }

  swap(x1, y1, x2, y2) {
    if (x2 < 0) x2 = this.width - 1
    if (x2 >= this.width) x2 = 0
    const idx1 = y1 * this.width + x1
    const idx2 = y2 * this.width + x2
    const temp = this.grid[idx1]
    this.grid[idx1] = this.grid[idx2]
    this.grid[idx2] = temp

    if (this.layer) {
      this.layer.putTileAt(this.grid[idx1] === TILES.AIR ? -1 : this.grid[idx1], x1 + this.worldGrid.padOffset, y1)
      this.layer.putTileAt(this.grid[idx2] === TILES.AIR ? -1 : this.grid[idx2], x2 + this.worldGrid.padOffset, y2)
    }
  }

  setTile(x, y, tileId) {
    if (x < 0) x = this.width - 1
    if (x >= this.width) x = 0
    const idx = y * this.width + x
    this.grid[idx] = tileId
    if (this.layer) {
      this.layer.putTileAt(tileId === TILES.AIR ? -1 : tileId, x + this.worldGrid.padOffset, y)
    }
  }

  getTile(x, y) {
    if (x < 0) x = this.width - 1
    if (x >= this.width) x = 0
    if (y < 0 || y >= this.height) return TILES.BEDROCK // bounds
    return this.grid[y * this.width + x]
  }

  updateSand(x, y, idx) {
    const down = this.getTile(x, y + 1)
    if (this.isLiquidOrAir(down)) {
      this.swap(x, y, x, y + 1)
      return
    }
    const downLeft = this.getTile(x - 1, y + 1)
    const downRight = this.getTile(x + 1, y + 1)
    const canLeft = this.isLiquidOrAir(downLeft)
    const canRight = this.isLiquidOrAir(downRight)

    if (canLeft && canRight) {
      if (Math.random() < 0.5) this.swap(x, y, x - 1, y + 1)
      else this.swap(x, y, x + 1, y + 1)
    } else if (canLeft) {
      this.swap(x, y, x - 1, y + 1)
    } else if (canRight) {
      this.swap(x, y, x + 1, y + 1)
    }
  }

  updateWater(x, y, idx) {
    const down = this.getTile(x, y + 1)
    if (down === TILES.AIR) {
      this.swap(x, y, x, y + 1)
      return
    }
    
    // Slip outwards randomly
    const left = this.getTile(x - 1, y)
    const right = this.getTile(x + 1, y)
    const canLeft = left === TILES.AIR
    const canRight = right === TILES.AIR

    if (canLeft && canRight) {
      if (Math.random() < 0.5) this.swap(x, y, x - 1, y)
      else this.swap(x, y, x + 1, y)
    } else if (canLeft) {
      this.swap(x, y, x - 1, y)
    } else if (canRight) {
      this.swap(x, y, x + 1, y)
    }
  }

  updateLava(x, y, idx) {
    // Flow like water but much slower
    if (Math.random() < 0.1) {
      const down = this.getTile(x, y + 1)
      if (down === TILES.AIR) {
        this.swap(x, y, x, y + 1)
      } else {
        const left = this.getTile(x - 1, y)
        const right = this.getTile(x + 1, y)
        const canLeft = left === TILES.AIR
        const canRight = right === TILES.AIR
        if (canLeft && canRight) {
          if (Math.random() < 0.5) this.swap(x, y, x - 1, y)
          else this.swap(x, y, x + 1, y)
        } else if (canLeft) {
          this.swap(x, y, x - 1, y)
        } else if (canRight) {
          this.swap(x, y, x + 1, y)
        }
      }
    }

    // Burn surrounding wood/grass/water -> reactions
    const neighbors = [
      [x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]
    ]
    for (const [nx, ny] of neighbors) {
      if (ny < 0 || ny >= this.height) continue
      const nTile = this.getTile(nx, ny)
      if (nTile === TILES.TREE_TRUNK || nTile === TILES.TREE_LEAVES || nTile === TILES.BUSH || nTile === TILES.TALL_GRASS || nTile === TILES.MUSHROOM) {
        if (Math.random() < 0.05) {
          this.setTile(nx, ny, TILES.AIR)
          // Rare crackle sound
          if (Math.random() < 0.1 && this.scene.ambience) this.scene.ambience.playDig() 
        }
      } else if (nTile === TILES.WATER || nTile === TILES.DEEP_WATER) {
        this.setTile(x, y, TILES.VOLCANIC_ROCK)
      }
    }
  }

  isLiquidOrAir(tile) {
    return tile === TILES.AIR || tile === TILES.WATER || tile === TILES.DEEP_WATER || tile === TILES.LAVA
  }
}
