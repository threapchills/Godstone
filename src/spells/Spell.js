import Phaser from 'phaser'
import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT, GRAVITY } from '../core/Constants.js'
import { TILES, SOLID_TILES, LIQUID_TILES, renderIdFor } from '../world/TileTypes.js'

// ═══════════════════════════════════════════════════════════════
// GODSTONE SPELL SYSTEM
// 12 element spells (3 per element) + 6 hybrids (1 per pair).
// Each god gets 3 spells: dominant element Slot 1+2, secondary Slot 3.
// At 5/5 ratio: element1 Slot 1, element2 Slot 2, hybrid Slot 3.
// ═══════════════════════════════════════════════════════════════

// Element colours used for tinting spell visuals
const ELEM_COLOURS = {
  fire: 0xff6644, water: 0x44aaff, air: 0xddeeff, earth: 0xaa8866,
}

// ── Base class ──────────────────────────────────────────────

export class Spell {
  constructor({ name, glyph, cooldown, colour, manaCost = 1, element }) {
    this.name = name
    this.glyph = glyph
    this.cooldown = cooldown
    this.colour = colour
    this.manaCost = manaCost
    this.element = element || 'fire'
    this.cooldownRemaining = 0
  }
  cast(scene, targetX, targetY) { return false }
}

// ── Helpers ─────────────────────────────────────────────────

function spawnSprite(scene, x, y, key, opts = {}) {
  const fallback = scene.textures.exists(key) ? key : null
  if (!fallback) return scene.add.circle(x, y, opts.radius || 6, opts.colour || 0xffffff, 0.8)
  const s = scene.add.sprite(x, y, key)
  if (opts.scale) { const h = s.height || 64; s.setScale(opts.scale / h) }
  if (opts.tint != null) s.setTint(opts.tint)
  if (opts.alpha != null) s.setAlpha(opts.alpha)
  if (opts.blend) s.setBlendMode(Phaser.BlendModes.ADD)
  if (opts.depth != null) s.setDepth(opts.depth)
  if (opts.rotation != null) s.setRotation(opts.rotation)
  if (opts.origin) s.setOrigin(...opts.origin)
  return s
}

function addProjectile(scene, proj) {
  if (!scene._activeProjectiles) scene._activeProjectiles = []
  scene._activeProjectiles.push(proj)
}

function addZone(scene, zone) {
  if (!scene._activeZones) scene._activeZones = []
  scene._activeZones.push(zone)
}

function addBuff(scene, buff) {
  if (!scene._activeBuffs) scene._activeBuffs = []
  scene._activeBuffs.push(buff)
}

function angleTo(sx, sy, tx, ty) { return Math.atan2(ty - sy, tx - sx) }

function carve(scene, x, y, radius) {
  const grid = scene.worldGrid?.grid
  if (!grid) return
  const cx = Math.floor(x / TILE_SIZE)
  const cy = Math.floor(y / TILE_SIZE)
  const r = Math.ceil(radius / TILE_SIZE)
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue
      const tx = ((cx + dx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH
      const ty = cy + dy
      if (ty < 0 || ty >= WORLD_HEIGHT) continue
      const idx = ty * WORLD_WIDTH + tx
      const tile = grid[idx]
      if (tile === TILES.BEDROCK || tile === TILES.MAGMA_ROCK) continue
      if (SOLID_TILES.has(tile)) {
        grid[idx] = TILES.AIR
        if (scene.worldGrid?.layer) {
          const pad = scene.worldGrid.padOffset || 0
          scene.worldGrid.layer.putTileAt(-1, tx + pad, ty)
        }
      }
    }
  }
}

function damageInRadius(scene, x, y, radius, damage, team) {
  const r2 = radius * radius
  // Enemy god
  if (scene.enemyGod?.alive && scene.enemyGod.sprite) {
    const eg = scene.enemyGod.sprite
    const dx = eg.x - x, dy = (eg.y - 12) - y
    if (dx * dx + dy * dy <= r2 && team !== 'enemy') {
      scene.damageEnemyGod(damage)
    }
  }
  // Player god (for enemy spells)
  if (scene.god?.sprite && team === 'enemy') {
    const pg = scene.god.sprite
    const dx = pg.x - x, dy = (pg.y - 12) - y
    if (dx * dx + dy * dy <= r2) {
      scene.god.hp = Math.max(0, (scene.god.hp || 100) - damage)
      if (scene.addJuice) scene.addJuice('medium')
    }
  }
  // Combat units
  if (scene.warDirector?.units) {
    for (const u of scene.warDirector.units) {
      if (!u.alive) continue
      if (team === 'home' && u.team === 'home') continue
      if (team === 'enemy' && u.team === 'enemy') continue
      const dx = u.sprite.x - x, dy = u.sprite.y - y
      if (dx * dx + dy * dy <= r2) u.takeDamage(damage)
    }
  }
  // Critters
  if (scene.critters?.damageInRadius) {
    scene.critters.damageInRadius(x, y, radius, damage * 0.6)
  }
}

function drainVillages(scene, x, y, radius, amount) {
  if (!scene.villages) return
  const r2 = radius * radius
  for (const v of scene.villages) {
    if (v.team === 'home') continue
    const dx = v.worldX - x, dy = v.worldY - y
    if (dx * dx + dy * dy < r2) {
      v.population = Math.max(0, v.population - amount)
      v.belief = Math.max(0, v.belief - 20)
    }
  }
}

function trailMote(scene, x, y, colour, scale = 1) {
  const m = scene.add.circle(x, y, 1.5 * scale, colour, 0.8)
    .setDepth(20).setBlendMode(Phaser.BlendModes.ADD)
  scene.tweens.add({
    targets: m, alpha: 0, scale: 0.1, duration: 200 + Math.random() * 100,
    onComplete: () => m.destroy(),
  })
}

// ═══════════════════════════════════════════════════════════════
// FIRE SPELLS
// ═══════════════════════════════════════════════════════════════

export class Firebolt extends Spell {
  constructor() {
    super({ name: 'Firebolt', glyph: 'firebolt', cooldown: 1200, colour: 0xff6644, element: 'fire' })
  }
  cast(scene, tx, ty) {
    const god = scene.god
    if (!god?.sprite) return false
    const sx = god.sprite.x, sy = god.sprite.y - TILE_SIZE
    const angle = angleTo(sx, sy, tx, ty)
    const speed = 400

    const ball = spawnSprite(scene, sx, sy, 'sb_fireball_spell', {
      scale: 14, blend: true, depth: 20, alpha: 0.9, rotation: angle,
    })
    const glow = spawnSprite(scene, sx, sy, 'sb_fireball_spell', {
      scale: 28, blend: true, depth: 19, alpha: 0.3, tint: 0xffaa44,
    })

    addProjectile(scene, {
      sprites: [ball, glow],
      x: sx, y: sy,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      gravity: 0, life: 2200, damage: 10, radius: TILE_SIZE * 4,
      team: god.team || 'home', gracePeriod: 80,
      onTick: (p, dt) => {
        ball.setPosition(p.x, p.y)
        glow.setPosition(p.x, p.y)
        trailMote(scene, p.x, p.y, 0xff6644)
      },
      onHit: (p) => {
        damageInRadius(scene, p.x, p.y, p.radius, p.damage, p.team)
        // Splash damage
        damageInRadius(scene, p.x, p.y, p.radius * 0.6, 4, p.team)
        carve(scene, p.x, p.y, TILE_SIZE * 1.5)
        // Impact burst
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2
          const m = scene.add.circle(p.x, p.y, 2, 0xff8833, 0.9)
            .setDepth(21).setBlendMode(Phaser.BlendModes.ADD)
          scene.tweens.add({
            targets: m, x: p.x + Math.cos(a) * 30, y: p.y + Math.sin(a) * 30,
            alpha: 0, scale: 0.2, duration: 300, onComplete: () => m.destroy(),
          })
        }
        if (scene.addJuice) scene.addJuice('medium')
      },
    })
    if (scene.ambience?.playMagic) scene.ambience.playMagic()
    return true
  }
}

export class InfernoWall extends Spell {
  constructor() {
    super({ name: 'Inferno Wall', glyph: 'inferno', cooldown: 4000, colour: 0xff4422, element: 'fire' })
  }
  cast(scene, tx, ty) {
    const god = scene.god
    if (!god?.sprite) return false
    const team = god.team || 'home'
    const wallW = TILE_SIZE * 4, wallH = TILE_SIZE * 10
    const visuals = []

    // Fire column particles
    for (let i = 0; i < 12; i++) {
      const fx = tx + (Math.random() - 0.5) * wallW
      const fy = ty + (Math.random() - 0.5) * wallH
      const p = spawnSprite(scene, fx, fy, 'sb_fireball_spell', {
        scale: 8 + Math.random() * 6, blend: true, depth: 18, alpha: 0.6,
        tint: i % 3 === 0 ? 0xff8844 : 0xff4422,
      })
      visuals.push(p)
    }
    // Glow backdrop
    const glow = scene.add.rectangle(tx, ty, wallW, wallH, 0xff4400, 0.25)
      .setDepth(17).setBlendMode(Phaser.BlendModes.ADD)
    visuals.push(glow)

    addZone(scene, {
      x: tx, y: ty, radius: Math.max(wallW, wallH) / 2,
      halfW: wallW / 2, halfH: wallH / 2,
      duration: 3000, tickDamage: 8, team,
      visuals,
      onTick: (z, dt) => {
        // Damage enemies in the wall area
        if (scene.warDirector?.units) {
          for (const u of scene.warDirector.units) {
            if (!u.alive || u.team === team) continue
            if (Math.abs(u.sprite.x - z.x) < z.halfW && Math.abs(u.sprite.y - z.y) < z.halfH) {
              u.takeDamage(z.tickDamage * dt / 1000)
            }
          }
        }
        // Animate fire particles drifting upward
        for (const v of z.visuals) {
          if (v.y != null) v.y -= 12 * dt / 1000
          if (v.y < z.y - z.halfH) v.y = z.y + z.halfH
        }
      },
      onExpire: (z) => {
        for (const v of z.visuals) {
          scene.tweens.add({ targets: v, alpha: 0, duration: 300, onComplete: () => v.destroy() })
        }
      },
    })
    if (scene.addJuice) scene.addJuice('light')
    return true
  }
}

export class Cataclysm extends Spell {
  constructor() {
    super({ name: 'Cataclysm', glyph: 'cataclysm', cooldown: 10000, colour: 0xff2200, element: 'fire' })
  }
  cast(scene, tx, ty) {
    const god = scene.god
    if (!god?.sprite) return false
    const sx = god.sprite.x, sy = god.sprite.y - TILE_SIZE * 3
    const angle = angleTo(sx, sy, tx, Math.min(ty, sy))
    const speed = 280
    const team = god.team || 'home'

    const ball = spawnSprite(scene, sx, sy, 'sb_fireball_spell', {
      scale: 32, blend: true, depth: 20, alpha: 0.9,
    })
    const glow = spawnSprite(scene, sx, sy, 'sb_fireball_spell', {
      scale: 56, blend: true, depth: 19, alpha: 0.3, tint: 0xffaa44,
    })

    addProjectile(scene, {
      sprites: [ball, glow],
      x: sx, y: sy,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      gravity: GRAVITY * 0.25, life: 3000, damage: 40,
      radius: TILE_SIZE * 14, team, gracePeriod: 120,
      onTick: (p, dt) => {
        ball.setPosition(p.x, p.y)
        glow.setPosition(p.x, p.y)
        // Smoke trail
        const smoke = spawnSprite(scene, p.x, p.y, 'sb_dark_smoke', {
          scale: 12, blend: true, depth: 18, alpha: 0.5, tint: 0x442200,
        })
        scene.tweens.add({ targets: smoke, alpha: 0, scale: 0.3, y: p.y - 10, duration: 600, onComplete: () => smoke.destroy() })
      },
      onHit: (p) => {
        damageInRadius(scene, p.x, p.y, p.radius, p.damage, p.team)
        drainVillages(scene, p.x, p.y, p.radius, 300)
        carve(scene, p.x, p.y, TILE_SIZE * 4)
        // Three-stage detonation
        const flash = scene.add.circle(p.x, p.y, 10, 0xffffff, 0.9)
          .setDepth(25).setBlendMode(Phaser.BlendModes.ADD)
        scene.tweens.add({
          targets: flash, radius: p.radius * 0.8, alpha: 0, duration: 500,
          onComplete: () => flash.destroy(),
        })
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * Math.PI * 2
          const sp = 40 + Math.random() * 60
          const ember = scene.add.circle(p.x, p.y, 2.5, 0xff6633, 0.9)
            .setDepth(22).setBlendMode(Phaser.BlendModes.ADD)
          scene.tweens.add({
            targets: ember,
            x: p.x + Math.cos(a) * sp, y: p.y + Math.sin(a) * sp,
            alpha: 0, duration: 500 + Math.random() * 300,
            onComplete: () => ember.destroy(),
          })
        }
        if (scene.addJuice) scene.addJuice('severe')
      },
    })
    if (scene.addJuice) scene.addJuice('medium')
    return true
  }
}

// ═══════════════════════════════════════════════════════════════
// WATER SPELLS
// ═══════════════════════════════════════════════════════════════

export class IcicleShard extends Spell {
  constructor() {
    super({ name: 'Icicle Shard', glyph: 'icicle', cooldown: 1200, colour: 0x44aaff, element: 'water' })
  }
  cast(scene, tx, ty) {
    const god = scene.god
    if (!god?.sprite) return false
    const sx = god.sprite.x, sy = god.sprite.y - TILE_SIZE
    const baseAngle = angleTo(sx, sy, tx, ty)
    const team = god.team || 'home'
    const spread = 0.13 // ~15 degrees total

    for (let i = -1; i <= 1; i++) {
      const angle = baseAngle + i * spread
      const speed = i === 0 ? 350 : 330
      const shard = spawnSprite(scene, sx, sy, 'sb_icicle_projectile', {
        scale: 10, depth: 20, alpha: 0.9, rotation: angle, tint: 0xaaddff,
      })

      addProjectile(scene, {
        sprites: [shard],
        x: sx, y: sy,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        gravity: 0, life: 1800, damage: 4, radius: TILE_SIZE * 2,
        team, gracePeriod: 60,
        onTick: (p) => { shard.setPosition(p.x, p.y) },
        onHit: (p) => {
          damageInRadius(scene, p.x, p.y, p.radius, p.damage, p.team)
          // Shatter fragments
          for (let j = 0; j < 4; j++) {
            const fa = Math.random() * Math.PI * 2
            const frag = scene.add.circle(p.x, p.y, 1.5, 0xaaddff, 0.8)
              .setDepth(20).setBlendMode(Phaser.BlendModes.ADD)
            scene.tweens.add({
              targets: frag, x: p.x + Math.cos(fa) * 15, y: p.y + Math.sin(fa) * 15,
              alpha: 0, duration: 200, onComplete: () => frag.destroy(),
            })
          }
        },
      })
    }
    if (scene.addJuice) scene.addJuice('light')
    return true
  }
}

export class HealingTide extends Spell {
  constructor() {
    super({ name: 'Healing Tide', glyph: 'heal', cooldown: 4000, colour: 0x44ddff, element: 'water' })
  }
  cast(scene, tx, ty) {
    const god = scene.god
    if (!god?.sprite) return false
    const cx = god.sprite.x, cy = god.sprite.y
    const radius = TILE_SIZE * 10

    // Heal god
    god.hp = Math.min(god.maxHp || 100, (god.hp || 100) + 20)

    // Heal friendly units
    if (scene.warDirector?.units) {
      for (const u of scene.warDirector.units) {
        if (!u.alive || u.team !== 'home') continue
        const dx = u.sprite.x - cx, dy = u.sprite.y - cy
        if (dx * dx + dy * dy < radius * radius) u.hp = Math.min(u.maxHp, u.hp + 15)
      }
    }

    // Belief surge
    if (scene.villages) {
      let best = null, bestD = Infinity
      for (const v of scene.villages) {
        if (v.team !== 'home') continue
        const d = Math.abs(v.worldX - cx) + Math.abs(v.worldY - cy)
        if (d < bestD) { bestD = d; best = v }
      }
      if (best && bestD < radius * 2) {
        best.belief = Math.min(100, best.belief + 15)
        best.updateBeliefBar()
      }
    }

    // Visual: expanding ring
    const ring = spawnSprite(scene, cx, cy, 'sb_heal_aura', {
      scale: 10, blend: true, depth: 20, alpha: 0.7, tint: 0x44ddff,
    })
    scene.tweens.add({
      targets: ring, scaleX: radius / 30, scaleY: radius / 30, alpha: 0,
      duration: 800, onComplete: () => ring.destroy(),
    })
    // Water droplets spiralling outward
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      const drop = scene.add.circle(cx, cy, 2, 0x66ccff, 0.8)
        .setDepth(20).setBlendMode(Phaser.BlendModes.ADD)
      scene.tweens.add({
        targets: drop,
        x: cx + Math.cos(a) * radius * 0.7, y: cy + Math.sin(a) * radius * 0.7,
        alpha: 0, duration: 700, delay: i * 30, onComplete: () => drop.destroy(),
      })
    }
    if (scene.addJuice) scene.addJuice('medium')
    return true
  }
}

export class MaelstromSpell extends Spell {
  constructor() {
    super({ name: 'Maelstrom', glyph: 'maelstrom', cooldown: 10000, colour: 0x2288cc, element: 'water' })
  }
  cast(scene, tx, ty) {
    const god = scene.god
    if (!god?.sprite) return false
    const team = god.team || 'home'
    const radius = TILE_SIZE * 12
    const visuals = []

    // Orbiting icicle shards
    for (let i = 0; i < 6; i++) {
      const shard = spawnSprite(scene, tx, ty, 'sb_icicle_projectile', {
        scale: 12, depth: 20, alpha: 0.7, tint: 0x66aadd,
      })
      visuals.push(shard)
    }
    // Central dark body
    const body = spawnSprite(scene, tx, ty, 'sb_dark_smoke', {
      scale: 30, blend: true, depth: 18, alpha: 0.4, tint: 0x224466,
    })
    visuals.push(body)

    let elapsed = 0
    addZone(scene, {
      x: tx, y: ty, radius, duration: 4000, tickDamage: 8, team, visuals,
      onTick: (z, dt) => {
        elapsed += dt
        const speed = 1.5 + (elapsed / z.duration) * 3 // accelerating orbit
        // Rotate orbiting shards
        for (let i = 0; i < 6; i++) {
          const a = (elapsed / 1000) * speed + (i / 6) * Math.PI * 2
          const r = radius * 0.5
          visuals[i].setPosition(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r)
          visuals[i].setRotation(a + Math.PI / 2)
        }
        // Pull enemies inward
        if (scene.warDirector?.units) {
          for (const u of scene.warDirector.units) {
            if (!u.alive || u.team === team) continue
            const dx = z.x - u.sprite.x, dy = z.y - u.sprite.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < radius && dist > 10 && u.sprite.body) {
              u.sprite.body.setVelocity(
                u.sprite.body.velocity.x + (dx / dist) * 80 * dt / 1000,
                u.sprite.body.velocity.y + (dy / dist) * 80 * dt / 1000,
              )
              u.takeDamage(z.tickDamage * dt / 1000)
            }
          }
        }
      },
      onExpire: (z) => {
        // Final burst
        damageInRadius(scene, z.x, z.y, radius, 20, team)
        for (const v of z.visuals) {
          scene.tweens.add({ targets: v, alpha: 0, scale: 0.1, duration: 400, onComplete: () => v.destroy() })
        }
        // Fling particles outward
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2
          const spray = scene.add.circle(z.x, z.y, 2, 0x88ccff, 0.9)
            .setDepth(22).setBlendMode(Phaser.BlendModes.ADD)
          scene.tweens.add({
            targets: spray,
            x: z.x + Math.cos(a) * radius, y: z.y + Math.sin(a) * radius,
            alpha: 0, duration: 400, onComplete: () => spray.destroy(),
          })
        }
        if (scene.addJuice) scene.addJuice('severe')
      },
    })
    if (scene.addJuice) scene.addJuice('heavy')
    return true
  }
}

// ═══════════════════════════════════════════════════════════════
// AIR SPELLS
// ═══════════════════════════════════════════════════════════════

export class GaleBolt extends Spell {
  constructor() {
    super({ name: 'Gale Bolt', glyph: 'gale', cooldown: 1200, colour: 0xddeeff, element: 'air' })
  }
  cast(scene, tx, ty) {
    const god = scene.god
    if (!god?.sprite) return false
    const sx = god.sprite.x, sy = god.sprite.y - TILE_SIZE
    const dist = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2)
    const reach = Math.min(dist, TILE_SIZE * 18)
    const ux = (tx - sx) / (dist || 1), uy = (ty - sy) / (dist || 1)
    const ex = sx + ux * reach, ey = sy + uy * reach
    const team = god.team || 'home'

    // Hitscan line
    const slash = spawnSprite(scene, (sx + ex) / 2, (sy + ey) / 2, 'sb_sword_slash', {
      scale: 16, blend: true, depth: 20, alpha: 0.8, tint: 0xddeeff,
      rotation: angleTo(sx, sy, ex, ey),
    })
    scene.tweens.add({ targets: slash, alpha: 0, duration: 250, onComplete: () => slash.destroy() })

    // Trail motes
    for (let i = 1; i <= 5; i++) {
      const t = i / 6
      trailMote(scene, sx + ux * reach * t, sy + uy * reach * t, 0xddeeff, 1.5)
    }

    // Damage + knockback
    const hitRadius = TILE_SIZE * 3
    damageInRadius(scene, ex, ey, hitRadius, 8, team)

    // Knockback enemies near impact point
    if (scene.warDirector?.units) {
      for (const u of scene.warDirector.units) {
        if (!u.alive || u.team === team) continue
        const dx = u.sprite.x - ex, dy = u.sprite.y - ey
        if (dx * dx + dy * dy < hitRadius * hitRadius && u.sprite.body) {
          u.sprite.body.setVelocity(ux * 300, uy * 200 - 150)
        }
      }
    }

    carve(scene, ex, ey, TILE_SIZE * 1.5)
    if (scene.addJuice) scene.addJuice('medium')
    if (scene.ambience?.playMagic) scene.ambience.playMagic()
    return true
  }
}

export class ZephyrShield extends Spell {
  constructor() {
    super({ name: 'Zephyr Shield', glyph: 'shield', cooldown: 4000, colour: 0xbbddff, element: 'air' })
  }
  cast(scene, tx, ty) {
    const god = scene.god
    if (!god?.sprite) return false

    const shield = spawnSprite(scene, god.sprite.x, god.sprite.y, 'sb_shield_bubble', {
      scale: 28, blend: true, depth: 18, alpha: 0.5, tint: 0xbbddff,
    })

    addBuff(scene, {
      target: god, duration: 3000, visual: shield,
      onTick: (b, dt) => {
        if (god.sprite) shield.setPosition(god.sprite.x, god.sprite.y - 6)
        // Deflect arrows
        if (scene._activeProjectiles) {
          for (const p of scene._activeProjectiles) {
            if (p.team === 'enemy' && !p.dead) {
              const dx = p.x - god.sprite.x, dy = p.y - god.sprite.y
              if (dx * dx + dy * dy < (TILE_SIZE * 4) ** 2) {
                p.vx *= -1; p.vy *= -0.5
                p.team = 'home' // deflected, now friendly
              }
            }
          }
        }
        // Push nearby enemies
        if (scene.warDirector?.units) {
          for (const u of scene.warDirector.units) {
            if (!u.alive || u.team === 'home' || !u.sprite.body) continue
            const dx = u.sprite.x - god.sprite.x, dy = u.sprite.y - god.sprite.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < TILE_SIZE * 3 && dist > 1) {
              u.sprite.body.setVelocity(
                u.sprite.body.velocity.x + (dx / dist) * 60,
                u.sprite.body.velocity.y + (dy / dist) * 40 - 30,
              )
            }
          }
        }
      },
      onExpire: (b) => {
        scene.tweens.add({ targets: shield, alpha: 0, duration: 300, onComplete: () => shield.destroy() })
      },
    })
    if (scene.addJuice) scene.addJuice('light')
    return true
  }
}

export class DivineTempest extends Spell {
  constructor() {
    super({ name: 'Divine Tempest', glyph: 'tempest', cooldown: 10000, colour: 0xeeeeff, element: 'air' })
  }
  cast(scene, tx, ty) {
    const god = scene.god
    if (!god?.sprite) return false
    const cx = god.sprite.x, cy = god.sprite.y
    const team = god.team || 'home'
    const radius = TILE_SIZE * 16

    // Ascend the god
    if (god.sprite.body) god.sprite.body.setVelocityY(-400)

    // Find up to 3 enemy targets in radius
    const targets = []
    if (scene.warDirector?.units) {
      for (const u of scene.warDirector.units) {
        if (!u.alive || u.team === team) continue
        const dx = u.sprite.x - cx, dy = u.sprite.y - cy
        if (dx * dx + dy * dy < radius * radius) targets.push(u)
        if (targets.length >= 3) break
      }
    }
    // Also target enemy god if in range
    if (scene.enemyGod?.alive && scene.enemyGod.sprite && team !== 'enemy') {
      const eg = scene.enemyGod.sprite
      const dx = eg.x - cx, dy = eg.y - cy
      if (dx * dx + dy * dy < radius * radius) {
        targets.push({ sprite: eg, isGod: true })
      }
    }

    // Sequential lightning strikes with delays
    targets.forEach((t, i) => {
      scene.time.delayedCall(300 + i * 400, () => {
        if (!t.sprite) return
        const bolt = spawnSprite(scene, (cx + t.sprite.x) / 2, (cy + t.sprite.y) / 2, 'sb_lightning_bolt', {
          scale: 40, blend: true, depth: 22, alpha: 0.9,
          rotation: angleTo(cx, cy, t.sprite.x, t.sprite.y),
        })
        scene.tweens.add({ targets: bolt, alpha: 0, duration: 200, onComplete: () => bolt.destroy() })

        // Screen flash
        const flash = scene.add.rectangle(scene.cameras.main.scrollX + scene.cameras.main.width / 2,
          scene.cameras.main.scrollY + scene.cameras.main.height / 2,
          scene.cameras.main.width, scene.cameras.main.height, 0xffffff, 0.12)
          .setScrollFactor(0).setDepth(30)
        scene.tweens.add({ targets: flash, alpha: 0, duration: 120, onComplete: () => flash.destroy() })

        // Damage
        if (t.isGod) {
          scene.damageEnemyGod(15)
        } else if (t.takeDamage) {
          t.takeDamage(15)
          if (t.sprite?.body) t.sprite.body.setVelocityY(-350)
        }

        // Impact sparkles
        const sparkle = spawnSprite(scene, t.sprite.x, t.sprite.y, 'sb_star_particles', {
          scale: 16, blend: true, depth: 21, alpha: 0.8,
        })
        scene.tweens.add({ targets: sparkle, alpha: 0, scale: 0.3, duration: 400, onComplete: () => sparkle.destroy() })

        if (scene.addJuice) scene.addJuice(i === 0 ? 'heavy' : 'medium')
      })
    })

    // If no targets, still do a visual lightning strike at cursor
    if (targets.length === 0) {
      const bolt = spawnSprite(scene, (cx + tx) / 2, (cy + ty) / 2, 'sb_lightning_bolt', {
        scale: 40, blend: true, depth: 22, alpha: 0.9,
        rotation: angleTo(cx, cy, tx, ty),
      })
      scene.tweens.add({ targets: bolt, alpha: 0, duration: 250, onComplete: () => bolt.destroy() })
      damageInRadius(scene, tx, ty, TILE_SIZE * 4, 15, team)
      carve(scene, tx, ty, TILE_SIZE * 2)
      if (scene.addJuice) scene.addJuice('heavy')
    }
    return true
  }
}

// ═══════════════════════════════════════════════════════════════
// EARTH SPELLS
// ═══════════════════════════════════════════════════════════════

export class BoulderToss extends Spell {
  constructor() {
    super({ name: 'Boulder Toss', glyph: 'boulder', cooldown: 1200, colour: 0xaa8866, element: 'earth' })
  }
  cast(scene, tx, ty) {
    const god = scene.god
    if (!god?.sprite) return false
    const sx = god.sprite.x, sy = god.sprite.y - TILE_SIZE * 2
    const angle = angleTo(sx, sy, tx, ty)
    const speed = 300
    const team = god.team || 'home'

    const rock = spawnSprite(scene, sx, sy, 'sb_boulder_projectile', {
      scale: 14, depth: 20, alpha: 0.95,
    })

    let rot = 0
    addProjectile(scene, {
      sprites: [rock],
      x: sx, y: sy,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      gravity: GRAVITY * 0.4, life: 2500, damage: 12, radius: TILE_SIZE * 4,
      team, gracePeriod: 80,
      onTick: (p, dt) => {
        rock.setPosition(p.x, p.y)
        rot += dt * 0.005
        rock.setRotation(rot)
        trailMote(scene, p.x, p.y, 0x886644, 0.8)
      },
      onHit: (p) => {
        damageInRadius(scene, p.x, p.y, p.radius, p.damage, p.team)
        carve(scene, p.x, p.y, TILE_SIZE * 2)
        // Stone fragments
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2
          const frag = scene.add.circle(p.x, p.y, 2.5, 0x887766, 0.9).setDepth(21)
          scene.tweens.add({
            targets: frag,
            x: p.x + Math.cos(a) * 25, y: p.y + Math.sin(a) * 20 + 15,
            alpha: 0, duration: 400, onComplete: () => frag.destroy(),
          })
        }
        // Dust cloud
        const dust = spawnSprite(scene, p.x, p.y, 'sb_dark_smoke', {
          scale: 18, blend: true, depth: 19, alpha: 0.5, tint: 0x776655,
        })
        scene.tweens.add({ targets: dust, alpha: 0, scaleX: 0.5, scaleY: 0.5, y: p.y - 15, duration: 500, onComplete: () => dust.destroy() })
        if (scene.addJuice) scene.addJuice('medium')
      },
    })
    return true
  }
}

export class StoneBulwark extends Spell {
  constructor() {
    super({ name: 'Stone Bulwark', glyph: 'bulwark', cooldown: 4000, colour: 0x887766, element: 'earth' })
  }
  cast(scene, tx, ty) {
    const god = scene.god
    if (!god?.sprite) return false
    const grid = scene.worldGrid?.grid
    if (!grid) return false

    const wallW = 6, wallH = 5
    const cx = Math.floor(tx / TILE_SIZE)
    const cy = Math.floor(ty / TILE_SIZE)
    const placed = []

    // Place stone tiles
    for (let dx = -Math.floor(wallW / 2); dx <= Math.floor(wallW / 2); dx++) {
      for (let dy = -Math.floor(wallH / 2); dy <= Math.floor(wallH / 2); dy++) {
        const wx = ((cx + dx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH
        const wy = cy + dy
        if (wy < 0 || wy >= WORLD_HEIGHT) continue
        const idx = wy * WORLD_WIDTH + wx
        if (grid[idx] === TILES.BEDROCK || grid[idx] === TILES.MAGMA_ROCK) continue
        const oldTile = grid[idx]
        grid[idx] = TILES.STONE
        placed.push({ wx, wy, oldTile, idx })
        if (scene.worldGrid?.layer) {
          const pad = scene.worldGrid.padOffset || 0
          scene.worldGrid.layer.putTileAt(renderIdFor(TILES.STONE, wx, wy), wx + pad, wy)
        }
      }
    }

    // Crush damage to anything under the wall
    damageInRadius(scene, tx, ty, TILE_SIZE * 4, 15, god.team || 'home')

    // Rising dust particles
    for (let i = 0; i < 6; i++) {
      const dust = spawnSprite(scene, tx + (Math.random() - 0.5) * wallW * TILE_SIZE,
        ty + wallH * TILE_SIZE / 2, 'sb_boulder_projectile', {
          scale: 6, depth: 20, alpha: 0.6,
        })
      scene.tweens.add({
        targets: dust, y: ty - wallH * TILE_SIZE / 2, alpha: 0,
        duration: 400, delay: i * 50, onComplete: () => dust.destroy(),
      })
    }

    // Remove wall after 5 seconds
    scene.time.delayedCall(5000, () => {
      for (const p of placed) {
        if (grid[p.idx] === TILES.STONE) {
          grid[p.idx] = TILES.SAND // crumble to sand (feeds falling-sand sim)
          if (scene.worldGrid?.layer) {
            const pad = scene.worldGrid.padOffset || 0
            scene.worldGrid.layer.putTileAt(renderIdFor(TILES.SAND, p.wx, p.wy), p.wx + pad, p.wy)
          }
        }
      }
    })
    if (scene.addJuice) scene.addJuice('light')
    return true
  }
}

export class EarthquakeSpell extends Spell {
  constructor() {
    super({ name: 'Earthquake', glyph: 'earthquake', cooldown: 10000, colour: 0x776644, element: 'earth' })
  }
  cast(scene, tx, ty) {
    const god = scene.god
    if (!god?.sprite) return false
    const cx = god.sprite.x, cy = god.sprite.y
    const radius = TILE_SIZE * 16
    const team = god.team || 'home'

    // Damage + launch enemies
    damageInRadius(scene, cx, cy, radius, 35, team)
    if (scene.warDirector?.units) {
      for (const u of scene.warDirector.units) {
        if (!u.alive || u.team === team) continue
        const dx = u.sprite.x - cx, dy = u.sprite.y - cy
        if (dx * dx + dy * dy < radius * radius && u.sprite.body) {
          u.sprite.body.setVelocityY(-500)
        }
      }
    }
    // Launch enemy god
    if (scene.enemyGod?.alive && scene.enemyGod.sprite && team !== 'enemy') {
      const eg = scene.enemyGod.sprite
      const dx = eg.x - cx, dy = eg.y - cy
      if (dx * dx + dy * dy < radius * radius && eg.body) {
        eg.body.setVelocityY(-480)
      }
    }

    drainVillages(scene, cx, cy, radius, 200)

    // Terrain collapse: convert a ring of tiles to sand
    const grid = scene.worldGrid?.grid
    if (grid) {
      const innerR = Math.ceil(4)
      const outerR = Math.ceil(radius / TILE_SIZE)
      const gcx = Math.floor(cx / TILE_SIZE)
      const gcy = Math.floor(cy / TILE_SIZE)
      for (let dy = -outerR; dy <= outerR; dy++) {
        for (let dx = -outerR; dx <= outerR; dx++) {
          const d2 = dx * dx + dy * dy
          if (d2 < innerR * innerR || d2 > outerR * outerR) continue
          if (Math.random() > 0.35) continue // partial destruction
          const wx = ((gcx + dx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH
          const wy = gcy + dy
          if (wy < 0 || wy >= WORLD_HEIGHT) continue
          const idx = wy * WORLD_WIDTH + wx
          if (grid[idx] === TILES.BEDROCK || grid[idx] === TILES.MAGMA_ROCK) continue
          if (SOLID_TILES.has(grid[idx])) {
            grid[idx] = TILES.SAND
          }
        }
      }
    }

    // Dust wave expanding outward
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2
      const dust = spawnSprite(scene, cx, cy, 'sb_dark_smoke', {
        scale: 8, blend: true, depth: 19, alpha: 0.6, tint: 0x776655,
      })
      scene.tweens.add({
        targets: dust,
        x: cx + Math.cos(a) * radius * 0.7, y: cy + Math.sin(a) * radius * 0.5,
        alpha: 0, scale: 0.2, duration: 700, onComplete: () => dust.destroy(),
      })
    }
    // Debris particles
    for (let i = 0; i < 10; i++) {
      const bx = cx + (Math.random() - 0.5) * radius
      const frag = spawnSprite(scene, bx, cy, 'sb_boulder_projectile', {
        scale: 5 + Math.random() * 4, depth: 21, alpha: 0.8,
      })
      scene.tweens.add({
        targets: frag, y: cy - 30 - Math.random() * 40, alpha: 0,
        duration: 500 + Math.random() * 300, ease: 'Quad.easeOut',
        onComplete: () => frag.destroy(),
      })
    }

    if (scene.addJuice) scene.addJuice('severe')
    return true
  }
}

// ═══════════════════════════════════════════════════════════════
// HYBRID SPELLS (one per element pair, for 5/5 ratio)
// ═══════════════════════════════════════════════════════════════

export class SteamEruption extends Spell {
  constructor() {
    super({ name: 'Steam Eruption', glyph: 'steam', cooldown: 10000, colour: 0xddaa88, element: 'hybrid' })
  }
  cast(scene, tx, ty) {
    const god = scene.god
    if (!god?.sprite) return false
    const team = god.team || 'home'
    const visuals = []

    for (let i = 0; i < 10; i++) {
      const steam = spawnSprite(scene, tx + (Math.random() - 0.5) * 20, ty, 'sb_dark_smoke', {
        scale: 10 + Math.random() * 8, blend: true, depth: 20, alpha: 0.5, tint: 0xddccbb,
      })
      visuals.push(steam)
    }

    addZone(scene, {
      x: tx, y: ty, radius: TILE_SIZE * 8, duration: 3000, tickDamage: 10, team, visuals,
      onTick: (z, dt) => {
        damageInRadius(scene, z.x, z.y, z.radius, z.tickDamage * dt / 1000, z.team)
        for (const v of z.visuals) v.y -= 20 * dt / 1000
      },
      onExpire: (z) => {
        for (const v of z.visuals) scene.tweens.add({ targets: v, alpha: 0, duration: 500, onComplete: () => v.destroy() })
      },
    })
    if (scene.addJuice) scene.addJuice('severe')
    return true
  }
}

export class MagmaFissure extends Spell {
  constructor() {
    super({ name: 'Magma Fissure', glyph: 'fissure', cooldown: 10000, colour: 0xff4400, element: 'hybrid' })
  }
  cast(scene, tx, ty) {
    const god = scene.god
    if (!god?.sprite) return false
    const grid = scene.worldGrid?.grid
    if (!grid) return false
    const team = god.team || 'home'
    const sx = god.sprite.x
    const ux = tx > sx ? 1 : -1
    const length = 20

    for (let i = 0; i < length; i++) {
      scene.time.delayedCall(i * 25, () => {
        const wx = ((Math.floor(sx / TILE_SIZE) + i * ux) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH
        const wy = Math.floor(ty / TILE_SIZE)
        for (let dy = 0; dy < 2; dy++) {
          const y = wy + dy
          if (y < 0 || y >= WORLD_HEIGHT) continue
          const idx = y * WORLD_WIDTH + wx
          if (grid[idx] !== TILES.BEDROCK && grid[idx] !== TILES.MAGMA_ROCK) {
            grid[idx] = TILES.LAVA
            if (scene.worldGrid?.layer) {
              const pad = scene.worldGrid.padOffset || 0
              scene.worldGrid.layer.putTileAt(renderIdFor(TILES.LAVA, wx, y), wx + pad, y)
            }
          }
        }
        // Eruption particles
        const px = wx * TILE_SIZE + TILE_SIZE / 2
        const py = wy * TILE_SIZE
        const erupt = spawnSprite(scene, px, py, 'sb_fireball_spell', {
          scale: 8, blend: true, depth: 20, alpha: 0.8,
        })
        scene.tweens.add({ targets: erupt, y: py - 20, alpha: 0, duration: 400, onComplete: () => erupt.destroy() })
      })
    }
    damageInRadius(scene, tx, ty, TILE_SIZE * 10, 30, team)
    if (scene.addJuice) scene.addJuice('heavy')
    return true
  }
}

export class FirestormSpell extends Spell {
  constructor() {
    super({ name: 'Firestorm', glyph: 'firestorm', cooldown: 10000, colour: 0xff8833, element: 'hybrid' })
  }
  cast(scene, tx, ty) {
    const god = scene.god
    if (!god?.sprite) return false
    const team = god.team || 'home'
    const radius = TILE_SIZE * 10
    const visuals = []

    for (let i = 0; i < 8; i++) {
      const flame = spawnSprite(scene, god.sprite.x, god.sprite.y, 'sb_fireball_spell', {
        scale: 10, blend: true, depth: 20, alpha: 0.7,
      })
      visuals.push(flame)
    }

    let elapsed = 0
    addBuff(scene, {
      target: god, duration: 4000, visual: null,
      _visuals: visuals,
      onTick: (b, dt) => {
        elapsed += dt
        if (!god.sprite) return
        const cx = god.sprite.x, cy = god.sprite.y
        const speed = 2 + (elapsed / b.duration) * 4
        for (let i = 0; i < visuals.length; i++) {
          const a = (elapsed / 1000) * speed + (i / visuals.length) * Math.PI * 2
          visuals[i].setPosition(cx + Math.cos(a) * radius * 0.5, cy + Math.sin(a) * radius * 0.4)
        }
        // Damage enemies in the tornado
        damageInRadius(scene, cx, cy, radius, 8 * dt / 1000, team)
      },
      onExpire: (b) => {
        // Final explosion
        if (god.sprite) damageInRadius(scene, god.sprite.x, god.sprite.y, radius, 20, team)
        for (const v of visuals) scene.tweens.add({ targets: v, alpha: 0, duration: 300, onComplete: () => v.destroy() })
        if (scene.addJuice) scene.addJuice('severe')
      },
    })
    if (scene.addJuice) scene.addJuice('heavy')
    return true
  }
}

export class Mudslide extends Spell {
  constructor() {
    super({ name: 'Mudslide', glyph: 'mudslide', cooldown: 10000, colour: 0x886644, element: 'hybrid' })
  }
  cast(scene, tx, ty) {
    const god = scene.god
    if (!god?.sprite) return false
    const sx = god.sprite.x, sy = god.sprite.y
    const angle = angleTo(sx, sy, tx, ty)
    const speed = 200
    const team = god.team || 'home'

    // Wave of mud projectiles
    for (let i = 0; i < 6; i++) {
      const spread = (i - 2.5) * TILE_SIZE * 1.5
      const bx = sx + Math.cos(angle + Math.PI / 2) * spread
      const by = sy + Math.sin(angle + Math.PI / 2) * spread
      const chunk = spawnSprite(scene, bx, by, 'sb_boulder_projectile', {
        scale: 10, depth: 20, alpha: 0.8, tint: 0x664422,
      })

      addProjectile(scene, {
        sprites: [chunk],
        x: bx, y: by,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        gravity: 0, life: 2000, damage: 25, radius: TILE_SIZE * 3,
        team, gracePeriod: 100,
        onTick: (p) => { chunk.setPosition(p.x, p.y); trailMote(scene, p.x, p.y, 0x664422, 0.6) },
        onHit: (p) => {
          damageInRadius(scene, p.x, p.y, p.radius, p.damage / 6, p.team)
        },
      })
    }
    if (scene.addJuice) scene.addJuice('heavy')
    return true
  }
}

export class ThunderstormSpell extends Spell {
  constructor() {
    super({ name: 'Thunderstorm', glyph: 'thunder', cooldown: 10000, colour: 0x6688bb, element: 'hybrid' })
  }
  cast(scene, tx, ty) {
    const god = scene.god
    if (!god?.sprite) return false
    const team = god.team || 'home'
    const radius = TILE_SIZE * 14
    const visuals = []

    // Storm cloud
    const cloud = spawnSprite(scene, tx, ty - TILE_SIZE * 6, 'sb_dark_smoke', {
      scale: 50, depth: 17, alpha: 0.5, tint: 0x334466,
    })
    visuals.push(cloud)

    let elapsed = 0
    addZone(scene, {
      x: tx, y: ty, radius, duration: 5000, tickDamage: 15, team, visuals,
      onTick: (z, dt) => {
        elapsed += dt
        // Lightning strike once per second
        if (Math.floor(elapsed / 1000) > Math.floor((elapsed - dt) / 1000)) {
          // Find random enemy in radius
          let target = null
          if (scene.warDirector?.units) {
            const enemies = scene.warDirector.units.filter(u =>
              u.alive && u.team !== team &&
              (u.sprite.x - z.x) ** 2 + (u.sprite.y - z.y) ** 2 < radius * radius
            )
            if (enemies.length) target = enemies[Math.floor(Math.random() * enemies.length)]
          }
          const hitX = target ? target.sprite.x : z.x + (Math.random() - 0.5) * radius
          const hitY = target ? target.sprite.y : z.y + (Math.random() - 0.5) * radius * 0.5

          const bolt = spawnSprite(scene, hitX, hitY - TILE_SIZE * 6, 'sb_lightning_bolt', {
            scale: 30, blend: true, depth: 22, alpha: 0.9, rotation: Math.PI / 2,
          })
          scene.tweens.add({ targets: bolt, alpha: 0, duration: 150, onComplete: () => bolt.destroy() })
          damageInRadius(scene, hitX, hitY, TILE_SIZE * 3, z.tickDamage, z.team)
          if (scene.addJuice) scene.addJuice('medium')
        }
        // Heal friendly units under the storm (rain)
        if (scene.warDirector?.units) {
          for (const u of scene.warDirector.units) {
            if (!u.alive || u.team !== team) continue
            const dx = u.sprite.x - z.x, dy = u.sprite.y - z.y
            if (dx * dx + dy * dy < radius * radius) u.hp = Math.min(u.maxHp, u.hp + 5 * dt / 1000)
          }
        }
      },
      onExpire: (z) => {
        for (const v of z.visuals) scene.tweens.add({ targets: v, alpha: 0, duration: 800, onComplete: () => v.destroy() })
      },
    })
    if (scene.addJuice) scene.addJuice('heavy')
    return true
  }
}

export class Avalanche extends Spell {
  constructor() {
    super({ name: 'Avalanche', glyph: 'avalanche', cooldown: 10000, colour: 0x99aa88, element: 'hybrid' })
  }
  cast(scene, tx, ty) {
    const god = scene.god
    if (!god?.sprite) return false
    const team = god.team || 'home'
    const radius = TILE_SIZE * 12

    // 5 falling boulders with staggered delays
    for (let i = 0; i < 5; i++) {
      const bx = tx + (Math.random() - 0.5) * radius
      const by = ty - TILE_SIZE * 20
      scene.time.delayedCall(i * 200, () => {
        const rock = spawnSprite(scene, bx, by, 'sb_boulder_projectile', {
          scale: 12 + Math.random() * 6, depth: 21, alpha: 0.9,
        })
        addProjectile(scene, {
          sprites: [rock],
          x: bx, y: by,
          vx: (Math.random() - 0.5) * 30, vy: 50,
          gravity: GRAVITY * 0.6, life: 3000, damage: 12, radius: TILE_SIZE * 4,
          team, gracePeriod: 0,
          onTick: (p) => { rock.setPosition(p.x, p.y); rock.rotation += 0.03 },
          onHit: (p) => {
            damageInRadius(scene, p.x, p.y, p.radius, p.damage, p.team)
            carve(scene, p.x, p.y, TILE_SIZE * 1.5)
            // Dust impact
            for (let j = 0; j < 5; j++) {
              trailMote(scene, p.x + (Math.random() - 0.5) * 20, p.y, 0x887766, 1.5)
            }
            if (scene.addJuice) scene.addJuice('medium')
          },
        })
      })
    }
    // Wind push
    if (scene.warDirector?.units) {
      for (const u of scene.warDirector.units) {
        if (!u.alive || u.team === team || !u.sprite.body) continue
        const dx = u.sprite.x - tx, dy = u.sprite.y - ty
        if (dx * dx + dy * dy < radius * radius) {
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          u.sprite.body.setVelocity(
            u.sprite.body.velocity.x + (dx / dist) * 200,
            u.sprite.body.velocity.y - 100,
          )
        }
      }
    }
    if (scene.addJuice) scene.addJuice('heavy')
    return true
  }
}

// ═══════════════════════════════════════════════════════════════
// SPELL POOL + SELECTION
// ═══════════════════════════════════════════════════════════════

export const SPELL_POOL = {
  fire:  { offensive: Firebolt, tactical: InfernoWall, ultimate: Cataclysm },
  water: { offensive: IcicleShard, tactical: HealingTide, ultimate: MaelstromSpell },
  air:   { offensive: GaleBolt, tactical: ZephyrShield, ultimate: DivineTempest },
  earth: { offensive: BoulderToss, tactical: StoneBulwark, ultimate: EarthquakeSpell },
}

function pairKey(a, b) { return [a, b].sort().join('+') }

export const HYBRID_POOL = {
  'fire+water': SteamEruption,
  'air+fire': FirestormSpell,
  'earth+fire': MagmaFissure,
  'earth+water': Mudslide,
  'air+water': ThunderstormSpell,
  'air+earth': Avalanche,
}

// Select 3 spells for a god based on elements and ratio
export function selectSpells(element1, element2, elementRatio) {
  const e1points = elementRatio ?? 5
  const e2points = 10 - e1points
  const isHybrid = e1points === 5

  if (isHybrid) {
    const hybrid = HYBRID_POOL[pairKey(element1, element2)]
    return [
      new (SPELL_POOL[element1]?.offensive || Firebolt)(),
      new (SPELL_POOL[element2]?.tactical || InfernoWall)(),
      hybrid ? new hybrid() : new (SPELL_POOL[element1]?.ultimate || Cataclysm)(),
    ]
  }

  const dominant = e1points > e2points ? element1 : element2
  const secondary = e1points > e2points ? element2 : element1
  return [
    new (SPELL_POOL[dominant]?.offensive || Firebolt)(),
    new (SPELL_POOL[dominant]?.tactical || InfernoWall)(),
    new (SPELL_POOL[secondary]?.ultimate || Cataclysm)(),
  ]
}
