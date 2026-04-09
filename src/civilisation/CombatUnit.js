import Phaser from 'phaser'
import { TILE_SIZE, GRAVITY, WORLD_WIDTH, WORLD_HEIGHT } from '../core/Constants.js'
import { SOLID_TILES } from '../world/TileTypes.js'
import { ensureWarriorTexture } from './Warrior.js'
import Arrow from './Arrow.js'

// CombatUnit: a physics-backed warrior with real combat AI, spawned
// during battles instead of the cheap WanderingWarrior that normally
// populates peaceful villages. Pattern is lifted from Sky Baby's
// Warrior class in SOAR/js/entities.js: a role-based state tree
// (bodyguard / homebody / raider) with target scoring, separation,
// melee clamps, and ranged arrow attacks. Adapted to Phaser arcade
// physics and Godstone's tile grid.
//
// "Team" is either 'home' (the player's civilisation) or 'enemy' (raid
// waves, hostile tribes). Home warriors engage any enemy within
// detection range; enemies prioritise home villages and the player's
// bodyguards.

const ROLE_TRANSITION_MS_MIN = 9000
const ROLE_TRANSITION_MS_MAX = 18000
const SEPARATION_RADIUS = 22           // push away if neighbour within this many px
const SEPARATION_FORCE = 180
const MAX_SPEED = 180
const MELEE_RANGE = 26
const MELEE_COOLDOWN_MS = 700
const RANGED_RANGE = 16 * TILE_SIZE
const RANGED_COOLDOWN_MS = 1800
const DETECTION_RANGE = 22 * TILE_SIZE

// Per-stage combat stats. Mirrors the Warrior texture progression:
// stage 1 = villager fists, 2 = club, 3 = spear, 4 = bow, 5 = sword,
// 6 = mounted lance, 7 = arcanist staff. Stages 8-10 inherit stage 7
// stats for now and will get raid-tier numbers in Phase 7.
const STATS_BY_STAGE = {
  1: { hp: 10, melee: 3,  ranged: 0,  rangedProb: 0.00 },
  2: { hp: 14, melee: 5,  ranged: 0,  rangedProb: 0.00 },
  3: { hp: 18, melee: 7,  ranged: 6,  rangedProb: 0.15 },
  4: { hp: 20, melee: 6,  ranged: 10, rangedProb: 0.80 },
  5: { hp: 26, melee: 10, ranged: 0,  rangedProb: 0.00 },
  6: { hp: 36, melee: 14, ranged: 0,  rangedProb: 0.00 },
  7: { hp: 44, melee: 12, ranged: 16, rangedProb: 0.60 },
  8: { hp: 55, melee: 16, ranged: 20, rangedProb: 0.55 },
  9: { hp: 68, melee: 20, ranged: 24, rangedProb: 0.55 },
  10:{ hp: 85, melee: 25, ranged: 30, rangedProb: 0.55 },
}

export default class CombatUnit {
  constructor(scene, x, y, stage, team, homeVillage, clothingColour) {
    this.scene = scene
    this.stage = Math.max(1, Math.min(10, stage))
    this.team = team
    this.homeVillage = homeVillage
    this.alive = true

    const stats = STATS_BY_STAGE[this.stage]
    this.maxHp = stats.hp
    this.hp = stats.hp
    this.meleeDamage = stats.melee
    this.rangedDamage = stats.ranged
    this.isArcher = stats.ranged > 0 && Math.random() < stats.rangedProb
    this._lastMeleeTime = 0
    this._lastRangedTime = 0

    // Role: weighted on spawn. Bodyguards flock near their village's
    // central totem; homebodies patrol inside the settlement footprint;
    // raiders seek enemy targets across the map.
    const r = Math.random()
    this.role = r < 0.25 ? 'bodyguard' : r < 0.60 ? 'homebody' : 'raider'
    this._roleTimer = ROLE_TRANSITION_MS_MIN + Math.random() * (ROLE_TRANSITION_MS_MAX - ROLE_TRANSITION_MS_MIN)

    // Patrol target for raiders
    this._patrolTargetX = null
    this._patrolTargetY = null

    // Pathfinding state: stuck detection + surface seeking
    this._stuckTimer = 0
    this._lastPosX = x
    this._isFlying = false
    this._surfaceSeekTimer = 0

    // Sprite: reuse the existing per-stage warrior texture builder
    const key = ensureWarriorTexture(scene, this.stage, clothingColour)
    this.sprite = scene.add.sprite(x, y, key)
    this.sprite.setOrigin(0.5, 1)
    this.sprite.setDepth(7)
    scene.physics.add.existing(this.sprite)
    const body = this.sprite.body
    body.setGravityY(GRAVITY)
    body.setCollideWorldBounds(false)
    body.setSize(Math.max(6, this.sprite.width - 1), Math.max(8, this.sprite.height - 1))
    body.setMaxVelocityY(600)

    // Team-tinted halo: a faint coloured ring underfoot so allies and
    // enemies read at a glance in chaotic battles
    const haloColour = team === 'enemy' ? 0xff5544 : 0x66ddaa
    this._halo = scene.add.ellipse(x, y, 14, 4, haloColour, 0.35).setDepth(6)
  }

  _tryRoleTransition(delta) {
    this._roleTimer -= delta
    if (this._roleTimer > 0) return
    this._roleTimer = ROLE_TRANSITION_MS_MIN + Math.random() * (ROLE_TRANSITION_MS_MAX - ROLE_TRANSITION_MS_MIN)
    const r = Math.random()
    if (this.role === 'bodyguard') {
      this.role = r < 0.35 ? 'homebody' : r < 0.7 ? 'raider' : 'bodyguard'
    } else if (this.role === 'homebody') {
      this.role = r < 0.3 ? 'bodyguard' : r < 0.55 ? 'raider' : 'homebody'
    } else {
      this.role = r < 0.25 ? 'bodyguard' : r < 0.5 ? 'homebody' : 'raider'
    }
  }

  takeDamage(amount, source) {
    if (!this.alive) return
    this.hp -= amount
    if (this.sprite) {
      this.sprite.setTint(0xff4444)
      this.scene.time.delayedCall(90, () => this.sprite && this.sprite.clearTint())
      // Blood splatter: a burst of crimson droplets at the impact site
      this._spawnBlood(4 + Math.floor(amount * 0.5))
    }
    if (this.hp <= 0) this._die()
  }

  _spawnBlood(count) {
    if (!this.scene || !this.sprite) return
    const cx = this.sprite.x
    const cy = this.sprite.y - this.sprite.height * 0.5
    const bloodColours = [0xaa0000, 0x880011, 0xcc1111, 0x660000, 0x991100]
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 20 + Math.random() * 60
      const colour = bloodColours[i % bloodColours.length]
      const size = 1.0 + Math.random() * 1.5
      const p = this.scene.add.circle(cx, cy, size, colour, 0.9)
        .setDepth(15)
      this.scene.tweens.add({
        targets: p,
        x: cx + Math.cos(angle) * speed * 0.5,
        y: cy + Math.sin(angle) * speed * 0.5 + 8, // gravity pull
        alpha: 0,
        scale: 0.15,
        duration: 300 + Math.random() * 250,
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      })
    }
  }

  _die() {
    this.alive = false
    // Big blood burst on death
    if (this.sprite) this._spawnBlood(10 + Math.floor(Math.random() * 6))
    if (this.sprite) {
      // Quick fade so the body stays visible for a beat
      this.scene.tweens.add({
        targets: this.sprite,
        alpha: 0,
        scaleX: 0.4,
        scaleY: 0.4,
        duration: 400,
        onComplete: () => this.sprite && this.sprite.destroy(),
      })
    }
    if (this._halo) {
      this.scene.tweens.add({
        targets: this._halo,
        alpha: 0,
        duration: 350,
        onComplete: () => this._halo && this._halo.destroy(),
      })
    }
  }

  destroy() {
    this.alive = false
    if (this.sprite) { this.sprite.destroy(); this.sprite = null }
    if (this._halo) { this._halo.destroy(); this._halo = null }
  }

  // Main AI tick. Called from the scene combat director with the full
  // unit list so separation and targeting stay coherent.
  update(delta, units, projectiles, worldGrid) {
    if (!this.alive || !this.sprite?.body) return
    const body = this.sprite.body
    const onGround = body.blocked.down
    const dt = delta / 1000

    this._tryRoleTransition(delta)

    // Separation: push away from any ally close enough to overlap
    let pushX = 0
    for (let i = 0; i < units.length; i++) {
      const other = units[i]
      if (other === this || !other.alive || !other.sprite) continue
      const dx = this.sprite.x - other.sprite.x
      const dy = this.sprite.y - other.sprite.y
      const distSq = dx * dx + dy * dy
      if (distSq > 0 && distSq < SEPARATION_RADIUS * SEPARATION_RADIUS) {
        const dist = Math.sqrt(distSq)
        pushX += (dx / dist) * (SEPARATION_RADIUS - dist) / SEPARATION_RADIUS
      }
    }
    if (Math.abs(pushX) > 0.01) body.velocity.x += pushX * SEPARATION_FORCE * dt

    // Target selection: closest enemy within detection range, weighted
    // toward chiefs and fellow warriors so a single enemy god doesn't
    // vacuum the entire village into its orbit.
    let target = null
    let bestScore = -Infinity
    for (let i = 0; i < units.length; i++) {
      const other = units[i]
      if (!other.alive || other === this) continue
      if (other.team === this.team) continue
      const dx = other.sprite.x - this.sprite.x
      const dy = other.sprite.y - this.sprite.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > DETECTION_RANGE) continue
      let score = 10000 - dist
      if (other.isChief) score += 800
      if (other.stage && other.stage >= 5) score += 200
      if (score > bestScore) { bestScore = score; target = other }
    }

    let moveX = 0

    // Role-based movement when no target is engaged
    if (!target) {
      if (this.role === 'bodyguard' && this.homeVillage) {
        moveX = this.homeVillage.worldX - this.sprite.x
      } else if (this.role === 'homebody' && this.homeVillage) {
        // Patrol a wider arc around the village
        const spread = (this.homeVillage.buildings?.length || 6) * TILE_SIZE * 2
        const goalX = this.homeVillage.worldX + Math.sin(this.scene.time.now / 1500 + this.sprite.x) * spread
        moveX = goalX - this.sprite.x
      } else {
        // Raider: pick a distant point and march
        if (this._patrolTargetX == null || Math.abs(this.sprite.x - this._patrolTargetX) < 60) {
          this._pickPatrolTarget()
        }
        if (this._patrolTargetX != null) moveX = this._patrolTargetX - this.sprite.x
      }
    } else {
      moveX = target.sprite.x - this.sprite.x
      const distToTarget = Math.abs(moveX)

      // Attack choice: arrow at range, melee at contact
      const now = this.scene.time.now
      if (this.isArcher && distToTarget > MELEE_RANGE && distToTarget < RANGED_RANGE) {
        if (now - this._lastRangedTime > RANGED_COOLDOWN_MS) {
          this._lastRangedTime = now
          const angle = Math.atan2(
            (target.sprite.y - 12) - (this.sprite.y - 12),
            target.sprite.x - this.sprite.x
          )
          const a = new Arrow(this.scene, this.sprite.x, this.sprite.y - 12, angle, this.team, this.rangedDamage)
          projectiles.push(a)
        }
      } else if (distToTarget < MELEE_RANGE) {
        if (now - this._lastMeleeTime > MELEE_COOLDOWN_MS) {
          this._lastMeleeTime = now
          target.takeDamage(this.meleeDamage, this)
          // Tiny lunge
          this.scene.tweens.add({
            targets: this.sprite,
            scaleX: 1.12, scaleY: 1.12,
            yoyo: true,
            duration: 80,
          })
        }
        moveX = 0 // stop closing during swing
      }
    }

    // ── Stuck detection: if barely moved, escalate escape behaviour ──
    if (Math.abs(this.sprite.x - this._lastPosX) < 0.5) {
      this._stuckTimer += delta
    } else {
      this._stuckTimer = 0
      this._lastPosX = this.sprite.x
    }

    // ── Surface seeking: if underground (below surface) and no target,
    // fly upward to reach the surface where villages are ──
    const surfaceHeights = worldGrid?.surfaceHeights
    if (surfaceHeights && !target) {
      const tileX = Math.floor(this.sprite.x / TILE_SIZE) % WORLD_WIDTH
      const surfaceY = surfaceHeights[Math.abs(tileX)] || WORLD_HEIGHT * 0.3
      const surfacePx = surfaceY * TILE_SIZE
      if (this.sprite.y > surfacePx + TILE_SIZE * 8) {
        // Underground: fly upward to reach the surface
        this._isFlying = true
        body.setGravityY(GRAVITY * 0.15)
        body.setVelocityY(-250)
        if (Math.abs(moveX) < 4) {
          // Drift sideways while ascending to find an opening
          body.setVelocityX((Math.sin(this.scene.time.now * 0.002 + this.sprite.x) * 0.5 + 0.5) * MAX_SPEED * (Math.random() < 0.5 ? 1 : -1))
        }
      } else if (this._isFlying && onGround) {
        this._isFlying = false
        body.setGravityY(GRAVITY)
      }
    }

    // ── Apply horizontal velocity ──
    if (Math.abs(moveX) > 4) {
      body.setVelocityX(Math.sign(moveX) * MAX_SPEED)
      this.sprite.setFlipX(moveX < 0)
    } else if (!this._isFlying) {
      body.setVelocityX(body.velocity.x * 0.7)
    }

    // ── Obstacle jumping: aggressive when stuck ──
    if (onGround && (body.blocked.left || body.blocked.right)) {
      body.setVelocityY(-350)
    }
    // Stuck escalation: if stuck for > 1s, start flying to escape
    if (this._stuckTimer > 1000 && !this._isFlying) {
      this._isFlying = true
      body.setGravityY(GRAVITY * 0.15)
      body.setVelocityY(-280)
      // Reverse direction to try a different route
      body.setVelocityX(-body.velocity.x || MAX_SPEED * (Math.random() < 0.5 ? 1 : -1))
      this._stuckTimer = 0
    }
    // Return to ground mode when landing after a fly escape
    if (this._isFlying && onGround && this._stuckTimer === 0) {
      this._isFlying = false
      body.setGravityY(GRAVITY)
    }

    // World wrap
    const worldPx = WORLD_WIDTH * TILE_SIZE
    if (this.sprite.x < -TILE_SIZE) this.sprite.x += worldPx
    else if (this.sprite.x > worldPx + TILE_SIZE) this.sprite.x -= worldPx

    // Halo follows the sprite
    if (this._halo) {
      this._halo.x = this.sprite.x
      this._halo.y = this.sprite.y - 2
    }
  }

  _pickPatrolTarget() {
    // Pick a target village from the scene's known villages, preferring
    // one that belongs to the opposite team (for raiders attacking, and
    // for home warriors deliberately pushing into enemy territory).
    const vs = this.scene.villages || []
    if (vs.length === 0) {
      this._patrolTargetX = this.sprite.x + (Math.random() - 0.5) * 600
      this._patrolTargetY = this.sprite.y
      return
    }
    const oppTeam = this.team === 'enemy' ? 'home' : 'enemy'
    const candidates = vs.filter(v => (v.team || 'home') === oppTeam)
    const pool = candidates.length ? candidates : vs
    const pick = pool[Math.floor(Math.random() * pool.length)]
    this._patrolTargetX = pick.worldX
    this._patrolTargetY = pick.worldY
  }
}
