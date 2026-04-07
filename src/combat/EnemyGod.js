import Phaser from 'phaser'
import { TILE_SIZE, GRAVITY, WORLD_WIDTH, WORLD_HEIGHT } from '../core/Constants.js'
import { SOLID_TILES } from '../world/TileTypes.js'
import { COMBAT } from './Combat.js'

// A roaming rival deity. Walks, jumps, lifts off when blocked or when
// the player is far above. AI is a tiny state machine: WANDER → SEEK
// → ENGAGE → FLEE, with FLEE returning to WANDER once distance is
// restored. The shadow bolt is the only attack for v1; melee is left
// to whatever bodyguards engage in close quarters.

const STATE = { WANDER: 'wander', SEEK: 'seek', ENGAGE: 'engage', FLEE: 'flee' }

export default class EnemyGod {
  constructor(scene, x, y) {
    this.scene = scene
    this.hp = COMBAT.enemyGod.maxHp
    this.maxHp = COMBAT.enemyGod.maxHp
    this.maxMana = COMBAT.enemyGod.maxMana
    this.mana = this.maxMana
    this.state = STATE.WANDER
    this._lastBoltTime = 0
    this._lastJumpTime = 0
    this._wanderTarget = x
    this._stuckTimer = 0
    this._lastX = x
    this._lastY = y
    this._isFlying = false
    this.alive = true

    this._buildSprite(scene, x, y)
    this._buildHpBar(scene)
  }

  _buildSprite(scene, x, y) {
    const key = 'enemy-god-sprite'
    if (!scene.textures.exists(key)) {
      const c = document.createElement('canvas')
      c.width = 16
      c.height = 22
      const ctx = c.getContext('2d')
      // Crimson cloak with a horned silhouette so it reads as evil
      ctx.fillStyle = '#1a0a14'
      ctx.fillRect(2, 6, 12, 14)
      ctx.fillStyle = '#3a0a1a'
      ctx.fillRect(3, 7, 10, 12)
      // Head
      ctx.fillStyle = '#5a3a2a'
      ctx.fillRect(5, 1, 6, 6)
      // Horns
      ctx.fillStyle = '#222222'
      ctx.fillRect(4, 0, 1, 3)
      ctx.fillRect(11, 0, 1, 3)
      // Glowing eyes
      ctx.fillStyle = '#ff3322'
      ctx.fillRect(6, 3, 1, 1)
      ctx.fillRect(9, 3, 1, 1)
      // Cloak hem
      ctx.fillStyle = '#0a0006'
      ctx.fillRect(1, 19, 14, 2)
      scene.textures.addCanvas(key, c)
    }
    this.sprite = scene.add.sprite(x, y, key)
    this.sprite.setOrigin(0.5, 1)
    this.sprite.setDepth(11)
    scene.physics.add.existing(this.sprite)
    this.sprite.body.setGravityY(GRAVITY)
    this.sprite.body.setSize(12, 18)
    this.sprite.body.setOffset(2, 4)
    this.sprite.body.setMaxVelocityY(500)
  }

  _buildHpBar(scene) {
    this.hpBar = scene.add.graphics().setDepth(12)
  }

  _updateHpBar() {
    if (!this.hpBar) return
    this.hpBar.clear()
    const pct = Math.max(0, this.hp / this.maxHp)
    const manaPct = Math.max(0, this.mana / this.maxMana)
    const w = 24
    const x = this.sprite.x - w / 2
    const y = this.sprite.y - this.sprite.height - 6
    // HP bar
    this.hpBar.fillStyle(0x222222, 0.85)
    this.hpBar.fillRect(x, y, w, 3)
    this.hpBar.fillStyle(pct > 0.5 ? 0xaa3333 : 0xff5544, 1)
    this.hpBar.fillRect(x, y, w * pct, 3)
    // Mana bar tucked just above the HP bar
    this.hpBar.fillStyle(0x222244, 0.85)
    this.hpBar.fillRect(x, y - 4, w, 2)
    this.hpBar.fillStyle(0x6688dd, 1)
    this.hpBar.fillRect(x, y - 4, w * manaPct, 2)
  }

  takeDamage(amount) {
    if (!this.alive) return
    this.hp = Math.max(0, this.hp - amount)
    if (this.hp <= 0) {
      this._die()
      return
    }
    // Tiny knockback flash
    if (this.sprite) {
      this.sprite.setTint(0xff8888)
      this.scene.time.delayedCall(120, () => this.sprite && this.sprite.clearTint())
    }
    // Hit particle burst: a few additive sparks at the impact site so
    // the player gets visceral feedback when their bolt lands.
    this._spawnHitBurst()
  }

  _spawnHitBurst() {
    if (!this.scene || !this.sprite) return
    const cx = this.sprite.x
    const cy = this.sprite.y - this.sprite.height * 0.6
    for (let i = 0; i < 7; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 30 + Math.random() * 50
      const colour = i % 2 === 0 ? 0xffaa44 : 0xff5533
      const p = this.scene.add.circle(cx, cy, 1.8 + Math.random(), colour, 1)
        .setDepth(22)
        .setBlendMode(Phaser.BlendModes.ADD)
      this.scene.tweens.add({
        targets: p,
        x: cx + Math.cos(angle) * speed * 0.4,
        y: cy + Math.sin(angle) * speed * 0.4,
        alpha: 0,
        scale: 0.2,
        duration: 350 + Math.random() * 150,
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      })
    }
  }

  _die() {
    this.alive = false
    if (this.scene.addJuice) this.scene.addJuice('heavy')
    if (this.scene.showMessage) this.scene.showMessage('A rival god falls', 2200)
    if (this.scene.ambience?.playGong) this.scene.ambience.playGong()
    if (this.sprite) {
      this.scene.tweens.add({
        targets: this.sprite,
        alpha: 0,
        scaleX: 0.4,
        scaleY: 0.4,
        duration: 600,
        onComplete: () => this.destroy(),
      })
    }
  }

  destroy() {
    if (this.sprite) {
      this.sprite.destroy()
      this.sprite = null
    }
    if (this.hpBar) {
      this.hpBar.destroy()
      this.hpBar = null
    }
  }

  update(delta, godSprite) {
    if (!this.alive || !this.sprite || !godSprite) return
    const body = this.sprite.body
    const onGround = body.blocked.down

    // Wrap horizontally so the world's seam doesn't trap the AI
    const worldPx = WORLD_WIDTH * TILE_SIZE
    if (this.sprite.x < 0) this.sprite.x += worldPx
    else if (this.sprite.x >= worldPx) this.sprite.x -= worldPx

    // Mana regen mirrors the player's: only while moving. The rival
    // wandering around between engagements naturally rebuilds its pool.
    const dxMove = this.sprite.x - this._lastX
    const dyMove = this.sprite.y - this._lastY
    const moved = (dxMove * dxMove + dyMove * dyMove) > 0.25
    if (moved && this.mana < this.maxMana) {
      this.mana = Math.min(this.maxMana, this.mana + COMBAT.enemyGod.manaRegenPerSecond * (delta / 1000))
    }
    this._lastY = this.sprite.y

    // Stuck detection: if barely moved while trying to seek, lift off
    if (Math.abs(this.sprite.x - this._lastX) < 0.5) {
      this._stuckTimer += delta
    } else {
      this._stuckTimer = 0
      this._lastX = this.sprite.x
    }

    const dx = godSprite.x - this.sprite.x
    const dy = godSprite.y - this.sprite.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    // ── State transitions ──
    if (this.hp / this.maxHp <= COMBAT.enemyGod.fleeBelowHpFraction) {
      this.state = STATE.FLEE
    } else if (this.state === STATE.FLEE && dist > COMBAT.enemyGod.seekRange * 1.4) {
      this.state = STATE.WANDER
    } else if (this.state === STATE.WANDER && dist < COMBAT.enemyGod.seekRange) {
      this.state = STATE.SEEK
    } else if (this.state === STATE.SEEK && dist < COMBAT.enemyGod.engageRange) {
      this.state = STATE.ENGAGE
    } else if (this.state === STATE.ENGAGE && dist > COMBAT.enemyGod.engageRange * 1.5) {
      this.state = STATE.SEEK
    } else if (this.state === STATE.SEEK && dist > COMBAT.enemyGod.seekRange * 1.4) {
      this.state = STATE.WANDER
    }

    // ── Per-state behaviour ──
    switch (this.state) {
      case STATE.WANDER:
        this._wander(body, onGround)
        break
      case STATE.SEEK:
        this._seek(body, onGround, dx, dy, dist)
        break
      case STATE.ENGAGE:
        this._engage(body, onGround, dx, dy, dist, godSprite)
        break
      case STATE.FLEE:
        this._flee(body, onGround, dx, dy)
        break
    }

    this._updateHpBar()
  }

  _wander(body, onGround) {
    // Drift toward a slow-moving wander target
    if (Math.abs(this.sprite.x - this._wanderTarget) < 8) {
      this._wanderTarget = this.sprite.x + (Math.random() - 0.5) * TILE_SIZE * 40
    }
    const dir = Math.sign(this._wanderTarget - this.sprite.x)
    body.setVelocityX(dir * COMBAT.enemyGod.speed * 0.4)
    if (onGround && (body.blocked.left || body.blocked.right)) {
      body.setVelocityY(COMBAT.enemyGod.jumpVelocity * 0.7)
    }
  }

  _seek(body, onGround, dx, dy, dist) {
    const dir = Math.sign(dx)
    body.setVelocityX(dir * COMBAT.enemyGod.speed)
    this.sprite.setFlipX(dir < 0)

    // Take to the air if the target is significantly higher OR we're stuck
    const wantFly = dy < -TILE_SIZE * 5 || this._stuckTimer > 1500
    if (wantFly) {
      this._isFlying = true
      body.setGravityY(GRAVITY * 0.2)
      body.setVelocityY(COMBAT.enemyGod.flyVelocity)
      body.setVelocityX(dir * COMBAT.enemyGod.flyHorizSpeed)
    } else if (this._isFlying && onGround) {
      this._isFlying = false
      body.setGravityY(GRAVITY)
      this._stuckTimer = 0
    }

    // Jump over obstacles when grounded
    if (!this._isFlying && onGround && (body.blocked.left || body.blocked.right)) {
      body.setVelocityY(COMBAT.enemyGod.jumpVelocity)
    }
  }

  _engage(body, onGround, dx, dy, dist, godSprite) {
    // Hold position with small lateral adjustments and lob bolts
    const dir = Math.sign(dx)
    body.setVelocityX(dir * COMBAT.enemyGod.speed * 0.3)
    this.sprite.setFlipX(dir < 0)

    // Bolts gated by both cooldown and mana. Out of mana means the
    // rival has to back off or wait until movement refills the pool;
    // wandering between engagements naturally tops it up.
    const now = this.scene.time.now
    const cooldownReady = now - this._lastBoltTime > COMBAT.enemyGod.boltCooldown
    const manaReady = this.mana >= COMBAT.enemyGod.boltManaCost
    if (cooldownReady && manaReady) {
      this._lastBoltTime = now
      this.mana = Math.max(0, this.mana - COMBAT.enemyGod.boltManaCost)
      this._fireBolt(godSprite)
    }
  }

  _flee(body, onGround, dx, dy) {
    // Run away from the player
    const dir = -Math.sign(dx)
    body.setVelocityX(dir * COMBAT.enemyGod.speed * 1.1)
    this.sprite.setFlipX(dir < 0)
    if (onGround && (body.blocked.left || body.blocked.right)) {
      body.setVelocityY(COMBAT.enemyGod.jumpVelocity)
    }
    // Heal slowly while fleeing so the loop has a recovery beat
    this.hp = Math.min(this.maxHp, this.hp + 0.05)
  }

  _fireBolt(targetSprite) {
    if (!this.scene || !targetSprite) return
    const sx = this.sprite.x
    const sy = this.sprite.y - TILE_SIZE
    const tx = targetSprite.x
    const ty = targetSprite.y - TILE_SIZE
    const dx = tx - sx
    const dy = ty - sy
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 2) return
    const ux = dx / dist
    const uy = dy / dist
    const reach = Math.min(dist, COMBAT.enemyGod.boltRange)
    const ex = sx + ux * reach
    const ey = sy + uy * reach

    const line = this.scene.add.line(0, 0, sx, sy, ex, ey, 0xff3322, 1)
      .setLineWidth(2)
      .setOrigin(0, 0)
      .setDepth(20)
      .setBlendMode(Phaser.BlendModes.ADD)
    this.scene.tweens.add({
      targets: line,
      alpha: 0,
      duration: 280,
      onComplete: () => line.destroy(),
    })

    // Hit check: if the player is within the bolt path, deal damage
    if (reach >= dist - 6) {
      // Direct line-of-sight hit
      if (this.scene.god?.takeDamage) {
        this.scene.god.takeDamage(COMBAT.enemyGod.boltDamage)
      } else if (this.scene.applyGodDamage) {
        this.scene.applyGodDamage(COMBAT.enemyGod.boltDamage)
      }
    }
  }
}
