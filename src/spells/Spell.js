import Phaser from 'phaser'
import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT } from '../core/Constants.js'
import { TILES, LIQUID_TILES, renderIdFor } from '../world/TileTypes.js'
import { COMBAT } from '../combat/Combat.js'

// Base class: every spell has a name, glyph, cooldown, and a cast(scene, x, y)
// method. Spells reach into scene state directly because they always need
// the grid, the god, the villages, or the camera. Keeping them dumb data
// objects with a single behaviour method keeps the call sites legible.

export class Spell {
  constructor({ name, glyph, cooldown, colour, manaCost = 1 }) {
    this.name = name
    this.glyph = glyph
    this.cooldown = cooldown
    this.colour = colour
    this.manaCost = manaCost
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

    // Visual: a bright additive line from source to landing point,
    // plus a glowing sphere at the impact and a small trailing comet
    // along the path so the spell reads as a thrown projectile rather
    // than a static beam.
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

    // Impact glow
    const head = scene.add.circle(ex, ey, 6, this.colour, 0.9)
      .setDepth(21)
      .setBlendMode(Phaser.BlendModes.ADD)
    scene.tweens.add({
      targets: head,
      scale: 2.2,
      alpha: 0,
      duration: 320,
      ease: 'Quad.easeOut',
      onComplete: () => head.destroy(),
    })

    // Trail of small additive motes along the path; spawn 5 staggered
    // dots so the comet has a brief tail before everything fades.
    for (let i = 1; i <= 5; i++) {
      const t = i / 6
      const tx = sx + ux * reach * t
      const ty = sy + uy * reach * t
      const mote = scene.add.circle(tx, ty, 2.5, 0xffffff, 1)
        .setDepth(20)
        .setBlendMode(Phaser.BlendModes.ADD)
      scene.tweens.add({
        targets: mote,
        scale: 0.2,
        alpha: 0,
        duration: 220 + i * 30,
        delay: i * 18,
        onComplete: () => mote.destroy(),
      })
    }

    // Carve soft tiles along the path so digging bolts feel useful even
    // before enemies exist. Skip bedrock, magma rock, and liquids — the
    // same undiggable set the god honours when digging by hand.
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
        if (tile === TILES.AIR || tile === TILES.BEDROCK || tile === TILES.MAGMA_ROCK) continue
        if (LIQUID_TILES.has(tile)) continue
        grid[idx] = TILES.AIR
        if (scene.worldLayer) {
          const pad = scene.worldGrid.padOffset || 0
          scene.worldLayer.putTileAt(-1, tx + pad, ty)
        }
      }
    }

    // Hit detection: any enemy god whose centre is within 12 px of the
    // line segment takes damage. Distance from a point to a segment is
    // the cleanest test for this geometry.
    const ex2 = sx + ux * reach
    const ey2 = sy + uy * reach
    if (scene.enemyGod?.alive && scene.enemyGod.sprite) {
      const eg = scene.enemyGod.sprite
      if (this._segmentHitsPoint(sx, sy, ex2, ey2, eg.x, eg.y - 12, 14)) {
        scene.damageEnemyGod(COMBAT.spells.boltDamage)
      }
    }

    // Critters caught along the bolt's path take damage too.
    if (scene.critters?.damageInRadius) {
      const samples = 6
      for (let i = 0; i <= samples; i++) {
        const t = i / samples
        const px = sx + ux * reach * t
        const py = sy + uy * reach * t
        scene.critters.damageInRadius(px, py, 10, COMBAT.spells.boltDamage * 0.6)
      }
    }

    // Devastate enemy villages near the bolt impact. A god's bolt
    // annihilates a village's population in a single strike; this is
    // how you conquer on raid worlds.
    if (scene.villages) {
      const blastR = TILE_SIZE * 10
      for (const v of scene.villages) {
        if (v.team !== 'enemy' || v._destroyed) continue
        const vdx = v.worldX - ex2
        const vdy = v.worldY - ey2
        if (vdx * vdx + vdy * vdy < blastR * blastR) {
          v.population = Math.max(0, v.population - (COMBAT.spells.villagePopDrain || 500))
          v.belief = 0
          if (scene.showMessage) scene.showMessage(`${v.name} is devastated!`, 1200)
        }
      }
    }

    // Also kill all enemy combat units near the impact
    if (scene.warDirector?.units) {
      const killR = TILE_SIZE * 6
      for (const u of scene.warDirector.units) {
        if (!u.alive || u.team === 'home') continue
        const udx = u.sprite.x - ex2
        const udy = u.sprite.y - ey2
        if (udx * udx + udy * udy < killR * killR) {
          u.takeDamage(9999, null)
        }
      }
    }

    if (scene.addJuice) scene.addJuice('heavy')
    if (scene.ambience?.playMagic) scene.ambience.playMagic()
    return true
  }

  _segmentHitsPoint(x1, y1, x2, y2, px, py, radius) {
    const ax = x2 - x1
    const ay = y2 - y1
    const lenSq = ax * ax + ay * ay
    if (lenSq < 0.01) return false
    let t = ((px - x1) * ax + (py - y1) * ay) / lenSq
    t = Math.max(0, Math.min(1, t))
    const cx = x1 + ax * t
    const cy = y1 + ay * t
    const dx = px - cx
    const dy = py - cy
    return (dx * dx + dy * dy) <= radius * radius
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

    // Refuse to place on bedrock or magma so we never silently break the
    // world floor or let the player vent the molten core.
    const anchorTile = grid[ty * WORLD_WIDTH + tx]
    if (anchorTile === TILES.BEDROCK || anchorTile === TILES.MAGMA_ROCK) return false

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
        if (grid[idx] === TILES.BEDROCK || grid[idx] === TILES.MAGMA_ROCK) continue
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
          const wx = (x + WORLD_WIDTH) % WORLD_WIDTH
          const t = grid[y * WORLD_WIDTH + wx]
          if (t === TILES.AIR) {
            layer.putTileAt(-1, x + pad, y)
          } else {
            layer.putTileAt(renderIdFor(t, wx, y), x + pad, y)
          }
        }
      }
    }

    if (scene.addJuice) scene.addJuice('light')
    return true
  }
}

// ── ELEMENTAL BURST ─────────────────────────────────────────
// The big Sky Baby-style spell, fitted to Godstone's element system.
// Effect varies by the god's primary element:
//
//   fire  → fireball projectile that burns vegetation, damages units
//           and the rival god in a radius, time-dilates briefly
//   water → tide of life: rain cloud over the cursor that heals
//           friendly combat units and pushes belief into nearby villages
//   air   → gale: omnidirectional shockwave that hurls all enemies
//           outward and lifts the god, with a satisfying camera punch
//   earth → earthquake: knocks every grounded enemy in range up and
//           damages them, scaled by stage; heaviest camera trauma
//
// All four cost 1 mana, share a 1.5 s cooldown, and trigger heavy
// camera juice. The visual is bespoke per element so the spell reads
// instantly without needing a label.
export class ElementalBurstSpell extends Spell {
  constructor(element) {
    const colours = {
      fire: 0xff5522,
      water: 0x55aaff,
      air: 0xddeeff,
      earth: 0xaa7733,
    }
    super({
      name: 'Burst',
      glyph: 'burst',
      cooldown: 1500,
      colour: colours[element] || 0xffffff,
      manaCost: 1,
    })
    this.element = element
  }

  cast(scene, targetX, targetY) {
    const god = scene.god
    if (!god?.sprite) return false
    switch (this.element) {
      case 'fire':  return this._castFire(scene, targetX, targetY)
      case 'water': return this._castWater(scene, targetX, targetY)
      case 'air':   return this._castAir(scene, targetX, targetY)
      case 'earth':
      default:      return this._castEarth(scene, targetX, targetY)
    }
  }

  // Fireball: a slow-moving glowing comet that explodes on impact.
  // Damages enemy combat units and the rival god in a radius. Burns
  // vegetation tiles within the blast. The fireball is registered on
  // the scene's _activeFireballs list and ticked from the main scene
  // update loop so it inherits time dilation and survives impact-frame
  // freezes consistently. Sky Baby uses the same pattern: projectiles
  // live in a flat list outside the entity tree.
  _castFire(scene, targetX, targetY) {
    const god = scene.god
    // Spawn the fireball well above the god's head so the projectile
    // doesn't immediately collide with whatever surface he's standing
    // on. Clamp the aim so the fireball never travels significantly
    // downward; otherwise a target standing on flat ground at the
    // god's elevation gets passed up by an arc that buries in the
    // surface tile beneath him.
    const sx = god.sprite.x
    const sy = god.sprite.y - TILE_SIZE * 3
    const dx = targetX - sx
    // Cap dy so the angle never tilts more than ~20 degrees below horizontal
    const rawDy = (targetY - TILE_SIZE * 2) - sy
    const maxDownDy = Math.abs(dx) * 0.36 // tan(20°)
    const dy = Math.max(-Math.abs(dx) * 1.5, Math.min(maxDownDy, rawDy))
    const angle = Math.atan2(dy, dx)
    const speed = 360
    const ball = scene.add.circle(sx, sy, 10, 0xff7733, 0.85)
      .setDepth(20)
      .setBlendMode(Phaser.BlendModes.ADD)
    const glow = scene.add.circle(sx, sy, 22, 0xffaa44, 0.35)
      .setDepth(19)
      .setBlendMode(Phaser.BlendModes.ADD)
    if (!scene._activeFireballs) scene._activeFireballs = []
    scene._activeFireballs.push({
      ball, glow,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.8,
      damage: 28,
      radius: TILE_SIZE * 6,
      team: 'home',
      // Skip terrain collision for the first 80 ms so the spawn cell
      // doesn't insta-detonate the fireball when the god is standing
      // next to a wall or on a surface tile.
      gracePeriod: 80,
    })
    if (scene.addJuice) scene.addJuice('medium')
    return true
  }

  // Tide of life: rain cloud over the cursor that heals nearby home
  // combat units, douses any lava in range, and surges belief in the
  // closest village.
  _castWater(scene, targetX, targetY) {
    const radius = TILE_SIZE * 8
    // Visual rain cloud sprite
    const cloud = scene.add.ellipse(targetX, targetY - TILE_SIZE * 4, TILE_SIZE * 14, TILE_SIZE * 4, 0xaaccee, 0.6)
      .setDepth(13)
      .setBlendMode(Phaser.BlendModes.SCREEN)
    scene.tweens.add({
      targets: cloud, alpha: 0, duration: 1800, onComplete: () => cloud.destroy(),
    })
    // Spawn falling rain drops in the radius for ~1.5 s
    let dropTimer = 0
    const dropEvent = scene.time.addEvent({
      delay: 40, repeat: 35, callback: () => {
        const dx = (Math.random() - 0.5) * TILE_SIZE * 14
        const drop = scene.add.rectangle(targetX + dx, targetY - TILE_SIZE * 4, 2, 6, 0xaaf0ff, 0.8)
          .setDepth(13)
          .setBlendMode(Phaser.BlendModes.ADD)
        scene.tweens.add({
          targets: drop, y: targetY + TILE_SIZE * 2, alpha: 0,
          duration: 600, onComplete: () => drop.destroy(),
        })
      },
    })
    // Heal home units in radius
    if (scene.warDirector?.units) {
      for (const u of scene.warDirector.units) {
        if (!u.alive || u.team !== 'home') continue
        const dx = u.sprite.x - targetX
        const dy = u.sprite.y - targetY
        if (dx * dx + dy * dy < radius * radius) {
          u.hp = Math.min(u.maxHp, u.hp + 25)
        }
      }
    }
    // Belief surge to closest village in radius
    if (scene.villages) {
      let best = null, bestD = Infinity
      for (const v of scene.villages) {
        const dx = v.worldX - targetX
        const dy = v.worldY - targetY
        const d = dx * dx + dy * dy
        if (d < bestD) { bestD = d; best = v }
      }
      if (best && bestD < radius * radius * 4) {
        best.belief = Math.min(100, best.belief + 18)
        best.updateBeliefBar()
      }
    }
    if (scene.addJuice) scene.addJuice('medium')
    return true
  }

  // Gale: an omnidirectional shockwave from the god that hurls every
  // enemy outward and gives the god a brief upward boost.
  _castAir(scene, targetX, targetY) {
    const god = scene.god
    const sx = god.sprite.x
    const sy = god.sprite.y - TILE_SIZE
    const radius = TILE_SIZE * 12

    // Expanding ring
    const ring = scene.add.circle(sx, sy, 10, 0xddeeff, 0.6)
      .setStrokeStyle(3, 0xffffff, 0.85)
      .setDepth(20)
      .setBlendMode(Phaser.BlendModes.ADD)
    scene.tweens.add({
      targets: ring, radius: radius, alpha: 0,
      duration: 500, onComplete: () => ring.destroy(),
    })

    // Boost god upward
    if (god.sprite.body) god.sprite.body.setVelocityY(-360)

    // Knock back any enemy in range
    if (scene.warDirector?.units) {
      for (const u of scene.warDirector.units) {
        if (!u.alive || u.team === 'home') continue
        const dx = u.sprite.x - sx
        const dy = u.sprite.y - sy
        const distSq = dx * dx + dy * dy
        if (distSq < radius * radius && u.sprite.body) {
          const dist = Math.sqrt(distSq) || 1
          const force = 320
          u.sprite.body.setVelocity(
            (dx / dist) * force,
            -180 + (dy / dist) * force * 0.4,
          )
          u.takeDamage(8)
        }
      }
    }
    if (scene.addJuice) scene.addJuice('heavy')
    return true
  }

  // Earthquake: knocks every grounded enemy near the god into the air
  // and deals damage. Heaviest camera trauma in the spellbook.
  _castEarth(scene, targetX, targetY) {
    const god = scene.god
    const sx = god.sprite.x
    const sy = god.sprite.y
    const radius = TILE_SIZE * 14

    // Visual: a shockwave of dust along the ground
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2
      const px = sx + Math.cos(angle) * 8
      const py = sy + 8
      const puff = scene.add.circle(px, py, 4, 0xc0a070, 0.7)
        .setDepth(15)
        .setBlendMode(Phaser.BlendModes.ADD)
      scene.tweens.add({
        targets: puff,
        x: sx + Math.cos(angle) * radius * 0.7,
        y: py - 6,
        alpha: 0,
        scale: 0.3,
        duration: 700,
        onComplete: () => puff.destroy(),
      })
    }

    // Knock enemies up + damage
    let hits = 0
    if (scene.warDirector?.units) {
      for (const u of scene.warDirector.units) {
        if (!u.alive || u.team === 'home') continue
        const dx = u.sprite.x - sx
        const dy = u.sprite.y - sy
        if (dx * dx + dy * dy < radius * radius) {
          if (u.sprite.body) u.sprite.body.setVelocityY(-540)
          u.takeDamage(28)
          hits++
        }
      }
    }
    // Damage rival god if in range
    if (scene.enemyGod?.alive && scene.enemyGod.sprite) {
      const dx = scene.enemyGod.sprite.x - sx
      const dy = scene.enemyGod.sprite.y - sy
      if (dx * dx + dy * dy < radius * radius) {
        scene.damageEnemyGod(20)
        if (scene.enemyGod.sprite.body) scene.enemyGod.sprite.body.setVelocityY(-480)
      }
    }
    if (scene.addJuice) scene.addJuice(hits > 4 ? 'severe' : 'heavy')
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
