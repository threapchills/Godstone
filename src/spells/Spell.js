import Phaser from 'phaser'
import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT } from '../core/Constants.js'
import { TILES, LIQUID_TILES } from '../world/TileTypes.js'

// Base class: every spell has a name, glyph, cooldown, and a cast(scene, x, y)
// method. Spells reach into scene state directly because they always need
// the grid, the god, the villages, or the camera. Keeping them dumb data
// objects with a single behaviour method keeps the call sites legible.

export class Spell {
  constructor({ name, glyph, cooldown, colour }) {
    this.name = name
    this.glyph = glyph
    this.cooldown = cooldown
    this.colour = colour
    this.cooldownRemaining = 0
  }

  // Returns true if cast succeeded (the SpellBook will then start cooldown)
  cast(scene, targetX, targetY) {
    return false
  }
}

// ── BOLT ────────────────────────────────────────────────────
// Direct damage line from the god to the cursor. Carves a short
// channel through soft terrain on the way and spawns a flashy streak.
export class BoltSpell extends Spell {
  constructor() {
    super({ name: 'Bolt', glyph: 'bolt', cooldown: 500, colour: 0x9affe6 })
  }

  cast(scene, targetX, targetY) {
    const god = scene.god
    if (!god?.sprite) return false

    const sx = god.sprite.x
    const sy = god.sprite.y - TILE_SIZE
    const dx = targetX - sx
    const dy = targetY - sy
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 4) return false

    const ux = dx / dist
    const uy = dy / dist
    const reach = Math.min(dist, TILE_SIZE * 18) // 18-tile range cap

    // Visual: a bright additive line from source to landing point
    const ex = sx + ux * reach
    const ey = sy + uy * reach
    const line = scene.add.line(0, 0, sx, sy, ex, ey, this.colour, 1)
      .setLineWidth(2)
      .setOrigin(0, 0)
      .setDepth(20)
      .setBlendMode(Phaser.BlendModes.ADD)
    scene.tweens.add({
      targets: line,
      alpha: 0,
      duration: 280,
      onComplete: () => line.destroy(),
    })

    // Carve soft tiles along the path so digging bolts feel useful even
    // before enemies exist. Skip bedrock and liquids.
    const grid = scene.worldGrid?.grid
    if (grid) {
      const steps = Math.floor(reach / 4)
      for (let i = 0; i < steps; i++) {
        const px = sx + ux * (i * 4)
        const py = sy + uy * (i * 4)
        const tx = Math.floor(px / TILE_SIZE)
        const ty = Math.floor(py / TILE_SIZE)
        if (tx < 0 || tx >= WORLD_WIDTH || ty < 0 || ty >= WORLD_HEIGHT) continue
        const idx = ty * WORLD_WIDTH + tx
        const tile = grid[idx]
        if (tile === TILES.AIR || tile === TILES.BEDROCK) continue
        if (LIQUID_TILES.has(tile)) continue
        grid[idx] = TILES.AIR
        if (scene.worldLayer) {
          const pad = scene.worldGrid.padOffset || 0
          scene.worldLayer.putTileAt(-1, tx + pad, ty)
        }
      }
    }

    if (scene.addJuice) scene.addJuice('medium')
    if (scene.ambience?.playMagic) scene.ambience.playMagic()
    return true
  }
}

// ── PLACE ───────────────────────────────────────────────────
// Drop a tile of the god's primary element at the cursor. Feeds the
// falling-sand simulation, so dropping water on lava actually creates
// hiss + steam events.
export class PlaceSpell extends Spell {
  constructor(element) {
    const colours = { fire: 0xff6644, water: 0x44aaff, earth: 0xaa8866, air: 0xddeeff }
    super({ name: 'Place', glyph: 'place', cooldown: 350, colour: colours[element] || 0xffffff })
    this.element = element
    const tileMap = { fire: TILES.LAVA, water: TILES.WATER, earth: TILES.SAND, air: TILES.AIR }
    this.tile = tileMap[element] ?? TILES.SAND
  }

  cast(scene, targetX, targetY) {
    const grid = scene.worldGrid?.grid
    if (!grid) return false

    const tx = Math.floor(targetX / TILE_SIZE)
    const ty = Math.floor(targetY / TILE_SIZE)
    if (tx < 0 || tx >= WORLD_WIDTH || ty < 0 || ty >= WORLD_HEIGHT) return false

    // Refuse to place on bedrock so we never silently break the world floor
    if (grid[ty * WORLD_WIDTH + tx] === TILES.BEDROCK) return false

    // Place a small 3x3 cluster centred on the cursor so the gesture
    // feels generous; the falling-sand sim handles spread.
    const radius = 1
    let placed = 0
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const x = tx + dx
        const y = ty + dy
        if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) continue
        const idx = y * WORLD_WIDTH + x
        if (grid[idx] === TILES.BEDROCK) continue
        // Air-only tiles (PlaceSpell air): clear instead of fill
        if (this.element === 'air') {
          if (grid[idx] !== TILES.AIR) {
            grid[idx] = TILES.AIR
            placed++
          }
          continue
        }
        grid[idx] = this.tile
        placed++
        if (scene.worldLayer && scene.worldGrid.layer) {
          const pad = scene.worldGrid.padOffset || 0
          // Tile id mapping handled by Phaser tilemap; let GridSimulator
          // own the layer sync on its next tick. We just touch the data.
        }
      }
    }
    if (placed === 0) return false

    // Force a tilemap repaint at this region so the placed tiles show
    // immediately rather than waiting for sim activity.
    if (scene.worldGrid?.layer) {
      const pad = scene.worldGrid.padOffset || 0
      const layer = scene.worldGrid.layer
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          const x = tx + dx
          const y = ty + dy
          if (y < 0 || y >= WORLD_HEIGHT) continue
          const t = grid[y * WORLD_WIDTH + ((x + WORLD_WIDTH) % WORLD_WIDTH)]
          if (t === TILES.AIR) {
            layer.putTileAt(-1, x + pad, y)
          } else {
            layer.putTileAt(t, x + pad, y)
          }
        }
      }
    }

    if (scene.addJuice) scene.addJuice('light')
    return true
  }
}

// ── GEAS ────────────────────────────────────────────────────
// Find the nearest village to the cursor and surge its belief.
export class GeasSpell extends Spell {
  constructor() {
    super({ name: 'Geas', glyph: 'geas', cooldown: 4000, colour: 0xdaa520 })
  }

  cast(scene, targetX, targetY) {
    const villages = scene.villages
    if (!villages?.length) return false

    let best = null
    let bestDist = Infinity
    for (const v of villages) {
      const dx = v.worldX - targetX
      const dy = v.worldY - targetY
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < bestDist) {
        best = v
        bestDist = d
      }
    }
    if (!best || bestDist > TILE_SIZE * 12) return false

    best.belief = Math.min(100, best.belief + 25)
    best.updateBeliefBar()

    // Visual: a gold rune ring expanding out of the village
    const ring = scene.add.circle(best.worldX, best.worldY, 8, 0xdaa520, 0)
      .setStrokeStyle(2, 0xdaa520, 1)
      .setDepth(20)
      .setBlendMode(Phaser.BlendModes.ADD)
    scene.tweens.add({
      targets: ring,
      radius: TILE_SIZE * 8,
      alpha: 0,
      duration: 600,
      onComplete: () => ring.destroy(),
    })

    if (scene.showMessage) scene.showMessage(`${best.name} feels your geas`, 1200)
    if (scene.ambience?.playGong) scene.ambience.playGong()
    return true
  }
}
