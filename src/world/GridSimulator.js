import { TILES, SOLID_TILES, LIQUID_TILES, renderIdFor } from './TileTypes.js'

// Falling-sand simulator: Noita-style cellular automata for liquids,
// granular solids, fire, and elemental reactions. Runs on the world
// grid and syncs changes back to the Phaser tilemap layer.

const FLAMMABLE = new Set([
  TILES.TREE_TRUNK, TILES.TREE_LEAVES, TILES.BUSH,
  TILES.TALL_GRASS, TILES.MUSHROOM,
])

// Water dispersion: how many cells sideways water tries to fill per tick.
// Higher = flatter pools; lower = tall columns that slowly settle.
const WATER_DISPERSION = 3

export default class GridSimulator {
  constructor(scene, worldGrid) {
    this.scene = scene
    this.worldGrid = worldGrid
    this.width = worldGrid.width
    this.height = worldGrid.height
    this.grid = worldGrid.grid

    // Moved-flag prevents double-processing a particle in one tick.
    // Bit-packed: one Uint8Array, flipped each tick via a generation counter.
    this.moved = new Uint8Array(this.width * this.height)
    this.generation = 1

    // Throttle: ~20 ticks per second (50ms) keeps it visible but smooth
    this.tickRate = 50
    this.lastTick = 0

    // Event queue: WorldScene polls this each frame for sound/visual feedback
    this.events = []

    // Scan direction alternates each tick so liquids don't drift rightward
    this.scanLeftToRight = true
  }

  update(time, delta, activeRect) {
    if (time - this.lastTick < this.tickRate) return
    this.lastTick = time

    // Flip generation so the moved-flag resets without clearing the array
    this.generation = this.generation === 1 ? 2 : 1

    // Clear event queue
    this.events.length = 0

    // Clamp active rect to world bounds
    const startX = Math.max(0, activeRect.x)
    const endX = Math.min(this.width - 1, activeRect.x + activeRect.w)
    const startY = Math.max(0, activeRect.y)
    const endY = Math.min(this.height - 2, activeRect.y + activeRect.h)

    // Alternate scan direction each tick; prevents liquid drift bias
    this.scanLeftToRight = !this.scanLeftToRight
    const xStart = this.scanLeftToRight ? startX : endX
    const xEnd = this.scanLeftToRight ? endX : startX
    const xStep = this.scanLeftToRight ? 1 : -1

    // Bottom-to-top so falling particles settle in one pass
    for (let y = endY; y >= startY; y--) {
      for (let x = xStart; this.scanLeftToRight ? x <= xEnd : x >= xEnd; x += xStep) {
        const idx = y * this.width + x
        if (this.moved[idx] === this.generation) continue

        const tile = this.grid[idx]
        switch (tile) {
          case TILES.SAND:    this.updateSand(x, y); break
          case TILES.WATER:   this.updateWater(x, y); break
          case TILES.DEEP_WATER: this.updateWater(x, y); break
          case TILES.LAVA:    this.updateLava(x, y); break
          default: break
        }
      }
    }
  }

  // ── Tile accessors with world-wrapping ──────────────────

  getTile(x, y) {
    if (y < 0 || y >= this.height) return TILES.BEDROCK
    x = ((x % this.width) + this.width) % this.width
    return this.grid[y * this.width + x]
  }

  setTile(x, y, tileId) {
    x = ((x % this.width) + this.width) % this.width
    if (y < 0 || y >= this.height) return
    const idx = y * this.width + x
    this.grid[idx] = tileId
    this.moved[idx] = this.generation // mark so it's not re-processed
    if (this.worldGrid.layer) {
      const pad = this.worldGrid.padOffset || 0
      const renderId = tileId === TILES.AIR ? -1 : renderIdFor(tileId, x, y)
      this.worldGrid.layer.putTileAt(renderId, x + pad, y)
      // Sync mirrored padding at wrap seam
      if (x < pad) {
        this.worldGrid.layer.putTileAt(renderId, x + pad + this.width, y)
      }
      if (x >= this.width - pad) {
        this.worldGrid.layer.putTileAt(renderId, x + pad - this.width, y)
      }
    }
  }

  swap(x1, y1, x2, y2) {
    x1 = ((x1 % this.width) + this.width) % this.width
    x2 = ((x2 % this.width) + this.width) % this.width
    if (y1 < 0 || y1 >= this.height || y2 < 0 || y2 >= this.height) return
    const idx1 = y1 * this.width + x1
    const idx2 = y2 * this.width + x2
    const temp = this.grid[idx1]
    this.grid[idx1] = this.grid[idx2]
    this.grid[idx2] = temp
    this.moved[idx1] = this.generation
    this.moved[idx2] = this.generation

    const pad = this.worldGrid.padOffset || 0
    if (this.worldGrid.layer) {
      const t1 = this.grid[idx1]
      const t2 = this.grid[idx2]
      const r1 = t1 === TILES.AIR ? -1 : renderIdFor(t1, x1, y1)
      const r2 = t2 === TILES.AIR ? -1 : renderIdFor(t2, x2, y2)
      this.worldGrid.layer.putTileAt(r1, x1 + pad, y1)
      this.worldGrid.layer.putTileAt(r2, x2 + pad, y2)
      // Sync wrap padding
      if (x1 < pad) this.worldGrid.layer.putTileAt(r1, x1 + pad + this.width, y1)
      if (x1 >= this.width - pad) this.worldGrid.layer.putTileAt(r1, x1 + pad - this.width, y1)
      if (x2 < pad) this.worldGrid.layer.putTileAt(r2, x2 + pad + this.width, y2)
      if (x2 >= this.width - pad) this.worldGrid.layer.putTileAt(r2, x2 + pad - this.width, y2)
    }
  }

  // ── Helpers ─────────────────────────────────────────────

  isEmpty(tile) {
    return tile === TILES.AIR
  }

  isLiquid(tile) {
    return LIQUID_TILES.has(tile)
  }

  isLiquidOrAir(tile) {
    return tile === TILES.AIR || this.isLiquid(tile)
  }

  isSolid(tile) {
    return SOLID_TILES.has(tile)
  }

  emitEvent(type, x, y) {
    this.events.push({ type, x, y })
  }

  // ── Sand ────────────────────────────────────────────────
  // Falls straight down; cascades diagonally if blocked below;
  // displaces water (sand sinks, water rises).

  updateSand(x, y) {
    const below = this.getTile(x, y + 1)

    // Fall through air
    if (this.isEmpty(below)) {
      this.swap(x, y, x, y + 1)
      return
    }

    // Displace water: sand sinks, water floats up
    if (below === TILES.WATER || below === TILES.DEEP_WATER) {
      this.swap(x, y, x, y + 1)
      this.emitEvent('sand_splash', x, y + 1)
      return
    }

    // Diagonal cascade
    const dl = this.getTile(x - 1, y + 1)
    const dr = this.getTile(x + 1, y + 1)
    const canL = this.isLiquidOrAir(dl)
    const canR = this.isLiquidOrAir(dr)
    if (canL && canR) {
      if (Math.random() < 0.5) this.swap(x, y, x - 1, y + 1)
      else this.swap(x, y, x + 1, y + 1)
    } else if (canL) {
      this.swap(x, y, x - 1, y + 1)
    } else if (canR) {
      this.swap(x, y, x + 1, y + 1)
    }
  }

  // ── Water ───────────────────────────────────────────────
  // Falls; cascades diagonally; only spreads laterally as part of
  // a connected body. Single droplets settle immediately so they
  // don't wobble in place. Ties use position parity (deterministic)
  // to prevent oscillation back and forth.

  updateWater(x, y) {
    const below = this.getTile(x, y + 1)

    // Straight down through air
    if (this.isEmpty(below)) {
      this.swap(x, y, x, y + 1)
      return
    }

    // Fall through lava: cool it and emit steam
    if (below === TILES.LAVA) {
      this.setTile(x, y, TILES.AIR)
      this.setTile(x, y + 1, TILES.VOLCANIC_ROCK)
      this.emitEvent('steam', x, y)
      this.emitEvent('hiss', x, y)
      return
    }

    // Diagonal cascade: only when an actual downhill route exists
    const left = this.getTile(x - 1, y)
    const right = this.getTile(x + 1, y)
    const dl = this.getTile(x - 1, y + 1)
    const dr = this.getTile(x + 1, y + 1)
    const canDL = this.isEmpty(left) && this.isEmpty(dl)
    const canDR = this.isEmpty(right) && this.isEmpty(dr)
    if (canDL && canDR) {
      if ((x & 1) === 0) this.swap(x, y, x - 1, y + 1)
      else this.swap(x, y, x + 1, y + 1)
      return
    }
    if (canDL) { this.swap(x, y, x - 1, y + 1); return }
    if (canDR) { this.swap(x, y, x + 1, y + 1); return }

    // Lateral spread only if connected to a larger body of water
    // (otherwise a single droplet on flat ground would wobble forever)
    const above = this.getTile(x, y - 1)
    const inBody = this.isLiquid(above) || this.isLiquid(left) || this.isLiquid(right)
    if (!inBody) return

    // Compute open horizontal runs on each side
    let openL = 0, openR = 0
    for (let d = 1; d <= WATER_DISPERSION; d++) {
      if (this.isEmpty(this.getTile(x - d, y))) openL = d; else break
    }
    for (let d = 1; d <= WATER_DISPERSION; d++) {
      if (this.isEmpty(this.getTile(x + d, y))) openR = d; else break
    }
    if (openL === 0 && openR === 0) return

    // Always bias toward the side with more room.
    // Crucial: ties use deterministic parity (not random) to prevent
    // wobble. Two adjacent water cells with equal openings would
    // otherwise swap positions every other tick forever.
    let dir
    if (openL > openR) dir = -1
    else if (openR > openL) dir = 1
    else dir = ((x + y) & 1) === 0 ? -1 : 1

    this.swap(x, y, x + dir, y)
  }

  // ── Lava ────────────────────────────────────────────────
  // Flows like water but viscous (only moves ~15% of ticks).
  // Burns flammable neighbours; cools to obsidian on water contact.
  // Fire spreads stochastically through vegetation.

  updateLava(x, y) {
    // Viscosity: skip most ticks
    if (Math.random() > 0.15) {
      // Still check reactions even when not flowing
      this.lavaReactions(x, y)
      return
    }

    const below = this.getTile(x, y + 1)

    // Fall through air
    if (this.isEmpty(below)) {
      this.swap(x, y, x, y + 1)
      this.lavaReactions(x, y + 1)
      return
    }

    // Lateral flow: only if part of a connected body and a downhill
    // route exists (prevents single drops wobbling on flat ground)
    const left = this.getTile(x - 1, y)
    const right = this.getTile(x + 1, y)
    const above = this.getTile(x, y - 1)
    const inBody = above === TILES.LAVA || left === TILES.LAVA || right === TILES.LAVA
    if (inBody) {
      const canL = this.isEmpty(left)
      const canR = this.isEmpty(right)
      if (canL && canR) {
        if (((x + y) & 1) === 0) this.swap(x, y, x - 1, y)
        else this.swap(x, y, x + 1, y)
      } else if (canL) {
        this.swap(x, y, x - 1, y)
      } else if (canR) {
        this.swap(x, y, x + 1, y)
      }
    }

    this.lavaReactions(x, y)
  }

  lavaReactions(x, y) {
    const neighbours = [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]]

    for (const [nx, ny] of neighbours) {
      if (ny < 0 || ny >= this.height) continue
      const nTile = this.getTile(nx, ny)

      // Lava + water = obsidian + steam
      if (nTile === TILES.WATER || nTile === TILES.DEEP_WATER) {
        this.setTile(x, y, TILES.VOLCANIC_ROCK)
        this.setTile(nx, ny, TILES.AIR)
        this.emitEvent('steam', nx, ny)
        this.emitEvent('hiss', x, y)
        return // lava consumed; stop checking
      }

      // Lava + ice = water
      if (nTile === TILES.ICE) {
        this.setTile(nx, ny, TILES.WATER)
        this.emitEvent('hiss', nx, ny)
      }

      // Burn flammable material: probabilistic fire spread
      if (FLAMMABLE.has(nTile) && Math.random() < 0.06) {
        this.setTile(nx, ny, TILES.AIR)
        this.emitEvent('burn', nx, ny)

        // Fire can jump to adjacent vegetation (chain reaction)
        this.trySpreadFire(nx, ny)
      }
    }
  }

  // Stochastic fire spread: when vegetation burns, adjacent vegetation
  // has a chance to catch. Creates satisfying chain-reaction forest fires.
  trySpreadFire(x, y) {
    const spread = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
    for (const [sx, sy] of spread) {
      if (sy < 0 || sy >= this.height) continue
      const sTile = this.getTile(sx, sy)
      if (FLAMMABLE.has(sTile) && Math.random() < 0.03) {
        this.setTile(sx, sy, TILES.AIR)
        this.emitEvent('burn', sx, sy)
      }
    }
  }

  // ── Evaporation ────────────────────────────────────────
  // Called externally on a slow timer. Scans a handful of random water
  // tiles in the active chunk and removes those with an open sky column
  // above them, emitting a 'vapour' event that the weather system reads
  // as "this world is humid, spawn a cloud soon". Closes the water loop:
  // without this, every liquid particle eventually pools at the bottom.
  //
  // sampleCount is small on purpose: evaporation is meant to be visible
  // over minutes of play, not seconds. A few tiles per tick is enough
  // to keep large surface lakes slowly shrinking without making puddles
  // vanish before the player notices them.
  evaporateInChunk(activeRect, sampleCount = 12) {
    const evaporated = []
    const startX = Math.max(0, activeRect.x)
    const startY = Math.max(0, activeRect.y)
    const endX = Math.min(this.width, activeRect.x + activeRect.w)
    const endY = Math.min(this.height, activeRect.y + activeRect.h)
    if (endX <= startX || endY <= startY) return evaporated

    for (let i = 0; i < sampleCount; i++) {
      const x = startX + Math.floor(Math.random() * (endX - startX))
      const y = startY + Math.floor(Math.random() * (endY - startY))
      const tile = this.getTile(x, y)
      if (tile !== TILES.WATER) continue // only shallow water evaporates; DEEP_WATER is too dense

      // Need a clear vertical column to the sky. Walk upward; if we hit
      // any solid before y=0 we're inside a cave and don't evaporate.
      // Cap the walk so a tile near the surface doesn't waste cycles
      // scanning to the top of the world.
      let clear = true
      for (let uy = y - 1; uy >= Math.max(0, y - 40); uy--) {
        const t = this.getTile(x, uy)
        if (t === TILES.AIR) continue
        if (this.isLiquid(t)) continue // water above is fine; that's the same body
        clear = false
        break
      }
      if (!clear) continue

      this.setTile(x, y, TILES.AIR)
      this.emitEvent('vapour', x, y)
      evaporated.push({ x, y })
    }
    return evaporated
  }

  // ── Erosion ─────────────────────────────────────────────
  // Called externally (e.g. once per second) to slowly degrade
  // soil near flowing water. Creates natural cave expansion.

  erodeAround(x, y) {
    const here = this.getTile(x, y)
    if (here !== TILES.WATER && here !== TILES.DEEP_WATER) return

    const neighbours = [[x, y + 1], [x - 1, y], [x + 1, y]]
    for (const [nx, ny] of neighbours) {
      if (ny < 0 || ny >= this.height) continue
      const nTile = this.getTile(nx, ny)
      // Soil erodes into sand; surface erodes into soil
      if (nTile === TILES.SOIL && Math.random() < 0.005) {
        this.setTile(nx, ny, TILES.SAND)
        this.emitEvent('erode', nx, ny)
      } else if (nTile === TILES.SURFACE && Math.random() < 0.002) {
        this.setTile(nx, ny, TILES.SOIL)
      }
    }
  }
}
