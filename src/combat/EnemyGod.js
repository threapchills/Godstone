import Phaser from 'phaser'
import { TILE_SIZE, GRAVITY, WORLD_WIDTH, WORLD_HEIGHT, ELEMENTS, ELEMENT_PAIRS } from '../core/Constants.js'
import { SOLID_TILES } from '../world/TileTypes.js'
import { COMBAT } from './Combat.js'
import { createGodTexture, GOD_W, GOD_H } from '../god/GodRenderer.js'

// A roaming rival deity. Walks, jumps, lifts off when blocked or when
// the player is far above. AI is a tiny state machine: WANDER → SEEK
// → ENGAGE → FLEE, with FLEE returning to WANDER once distance is
// restored. The shadow bolt is the only attack for v1; melee is left
// to whatever bodyguards engage in close quarters.

const STATE = { WANDER: 'wander', SEEK: 'seek', ENGAGE: 'engage', FLEE: 'flee' }

export default class EnemyGod {
  // enemySeed: optional random seed for procedural appearance.
  // If not provided, falls back to a timestamp-derived seed.
  constructor(scene, x, y, enemySeed) {
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

    // Randomly generated appearance each time
    this.enemySeed = enemySeed ?? Math.floor(Math.random() * 999999)
    this._buildSprite(scene, x, y)
    this._buildHpBar(scene)
  }

  _buildSprite(scene, x, y) {
    // Pick a random element pair for this rival god's appearance
    const pair = ELEMENT_PAIRS[this.enemySeed % ELEMENT_PAIRS.length]
    const enemyParams = {
      seed: this.enemySeed,
      element1: pair[0],
      element2: pair[1],
      elementRatio: 3 + (this.enemySeed % 5), // 3-7 for variety
    }
    const { key } = createGodTexture(scene, enemyParams)
    this.sprite = scene.add.sprite(x, y, key)
    this.sprite.setOrigin(0.5, 1)
    this.sprite.setDepth(11)
    // Red tint overlay so it reads as hostile at a glance
    this.sprite.setTint(0xff8888)
    scene.physics.add.existing(this.sprite)
    this.sprite.body.setGravityY(GRAVITY)
    this.sprite.body.setSize(14, 24)
    this.sprite.body.setOffset(5, 8)
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
    // Energy sparks
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
    // Blood droplets for visceral punch
    const bloodColours = [0xaa0000, 0x880011, 0xcc1111, 0x660000]
    for (let i = 0; i < 5; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 15 + Math.random() * 40
      const p = this.scene.add.circle(cx, cy, 1.2 + Math.random(), bloodColours[i % bloodColours.length], 0.85)
        .setDepth(21)
      this.scene.tweens.add({
        targets: p,
        x: cx + Math.cos(angle) * speed * 0.4,
        y: cy + Math.sin(angle) * speed * 0.4 + 10,
        alpha: 0,
        scale: 0.1,
        duration: 280 + Math.random() * 200,
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      })
    }
  }

  _die() {
    this.alive = false
    // Epic juice: impact-frame freeze, punch-in zoom, extreme slowmo.
    // Killing a rival god is the biggest moment in a home-world session;
    // the camera should stop the world and show you the moment.
    if (this.scene.addJuice) this.scene.addJuice('epic')
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
