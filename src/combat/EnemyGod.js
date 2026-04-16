import Phaser from 'phaser'
import { TILE_SIZE, GRAVITY, WORLD_WIDTH, WORLD_HEIGHT, ELEMENTS, ELEMENT_PAIRS } from '../core/Constants.js'
import { SOLID_TILES } from '../world/TileTypes.js'
import { COMBAT } from './Combat.js'
import { createGodTexture, GOD_W, GOD_H } from '../god/GodRenderer.js'
import { compositeGod, COMPOSITE_W, COMPOSITE_H, GOD_DISPLAY_SCALE } from '../god/GodCompositor.js'
import { GOD_PARTS } from '../god/GodPartManifest.js'
import SpellBook from '../spells/SpellBook.js'

// A roaming rival deity with its own SpellBook using the same spell
// system as the player. AI state machine: WANDER → SEEK → ENGAGE →
// FLEE. All 3 spells unlocked from start (established deity).

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
    this._lastJumpTime = 0
    this._wanderTarget = x
    this._stuckTimer = 0
    this._lastX = x
    this._lastY = y
    this._isFlying = false
    this.alive = true
    this.team = 'enemy'

    // SpellBook: same system as the player god, all 3 unlocked
    const pair = ELEMENT_PAIRS[(enemySeed || 0) % ELEMENT_PAIRS.length]
    const ratio = 3 + ((enemySeed || 0) % 5) // 3-7
    this.spellBook = new SpellBook({
      element1: pair[0], element2: pair[1], elementRatio: ratio,
    })
    this.spellBook.setUnlockCount(7) // fully unlocked

    // Randomly generated appearance each time
    this.enemySeed = enemySeed ?? Math.floor(Math.random() * 999999)
    this._buildSprite(scene, x, y)
    this._buildHpBar(scene)
  }

  _buildSprite(scene, x, y) {
    // Seeded RNG for deterministic random assembly per enemy
    const seed = this.enemySeed
    let s = seed
    const rng = () => {
      s |= 0; s = (s + 0x6d2b79f5) | 0
      let t = Math.imul(s ^ (s >>> 15), 1 | s)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }

    // Randomly pick head, body, legs from the full asset pool
    const headPool = GOD_PARTS.heads
    const bodyPool = GOD_PARTS.bodies
    const legsPool = GOD_PARTS.legs
    const headEntry = headPool[Math.floor(rng() * headPool.length)]
    const bodyEntry = bodyPool[Math.floor(rng() * bodyPool.length)]
    const legsEntry = legsPool[Math.floor(rng() * legsPool.length)]

    // Check if the composite assets are loaded; fall back to procedural if not
    const assetsLoaded = scene.textures.exists(headEntry.key) &&
                         scene.textures.exists(bodyEntry.key) &&
                         scene.textures.exists(legsEntry.key)

    if (assetsLoaded) {
      // Element-based hue shift so the enemy reads as elementally distinct.
      // Fire enemies stay warm, water enemies shift cool, air enemies go pale.
      const pair = ELEMENT_PAIRS[seed % ELEMENT_PAIRS.length]
      const hueShifts = { fire: 0, water: 160, air: 200, earth: 80 }
      const baseHue = hueShifts[pair[0]] || 0
      const jitter = (rng() - 0.5) * 40

      const uniqueId = `enemy-${seed}`
      const { key } = compositeGod(
        scene, headEntry.key, bodyEntry.key, legsEntry.key,
        uniqueId, { hueShift: baseHue + jitter }
      )

      this.sprite = scene.add.sprite(x, y, key)
      this.sprite.setOrigin(0.5, 1)
      this.sprite.setScale(GOD_DISPLAY_SCALE)
      this.sprite.setDepth(11)
      // Subtle hostile tint (less aggressive than the old 0xff8888)
      this.sprite.setTint(0xffbbbb)

      // Elemental glow aura: same texture, slightly larger, additive blend
      const glowColours = { fire: 0xff4422, water: 0x2288ff, air: 0xaaccff, earth: 0x66aa33 }
      const glowColour = glowColours[pair[0]] || 0xff6644
      this._glowSprite = scene.add.sprite(x, y, key)
      this._glowSprite.setOrigin(0.5, 1)
      this._glowSprite.setScale(GOD_DISPLAY_SCALE * 1.18)
      this._glowSprite.setDepth(10) // behind the main sprite
      this._glowSprite.setTint(glowColour)
      this._glowSprite.setAlpha(0.25)
      this._glowSprite.setBlendMode(Phaser.BlendModes.ADD)

      scene.physics.add.existing(this.sprite)
      this.sprite.body.setGravityY(GRAVITY)
      this.sprite.body.setSize(80, 160)
      this.sprite.body.setOffset(24, 28)
      this.sprite.body.setMaxVelocityY(500)
    } else {
      // Fallback: procedural canvas god (pre-composite assets not available)
      const pair = ELEMENT_PAIRS[seed % ELEMENT_PAIRS.length]
      const enemyParams = {
        seed, element1: pair[0], element2: pair[1],
        elementRatio: 3 + (seed % 5),
      }
      const { key } = createGodTexture(scene, enemyParams)
      this.sprite = scene.add.sprite(x, y, key)
      this.sprite.setOrigin(0.5, 1)
      this.sprite.setDepth(11)
      this.sprite.setTint(0xff8888)
      scene.physics.add.existing(this.sprite)
      this.sprite.body.setGravityY(GRAVITY)
      this.sprite.body.setSize(14, 24)
      this.sprite.body.setOffset(5, 8)
      this.sprite.body.setMaxVelocityY(500)
    }
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
    // Fade out the glow aura in sync with the main sprite
    if (this._glowSprite) {
      this.scene.tweens.add({
        targets: this._glowSprite,
        alpha: 0, duration: 500,
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
    if (this._glowSprite) {
      this._glowSprite.destroy()
      this._glowSprite = null
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

    // Tick spell cooldowns
    if (this.spellBook) this.spellBook.update(delta)

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

    // Sync the glow aura sprite to follow the main sprite
    if (this._glowSprite && this.sprite) {
      this._glowSprite.x = this.sprite.x
      this._glowSprite.y = this.sprite.y
      this._glowSprite.setFlipX(this.sprite.flipX)
    }
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
    const dir = Math.sign(dx)
    body.setVelocityX(dir * COMBAT.enemyGod.speed * 0.3)
    this.sprite.setFlipX(dir < 0)

    if (!this.spellBook || this.mana < 1) return

    // Pulse the glow aura brighter when the enemy has mana to burn.
    // Gives the player a cast-is-coming telegraph without a separate
    // reticle sprite.
    if (this._glowSprite) {
      const pulsePhase = Math.sin(this.scene.time.now * 0.012) * 0.5 + 0.5
      const glowAlpha = 0.25 + pulsePhase * 0.35
      this._glowSprite.setAlpha(glowAlpha)
    }

    // AI spell priority: ultimate > tactical > offensive
    // Try highest-impact spell first, fall back to workhorse
    const target = godSprite
    const tx = target.x + (Math.random() - 0.5) * 8 // slight aim jitter
    const ty = target.y - TILE_SIZE

    // Temporarily set the scene's god reference for enemy spell casting
    // (spells check scene.god for source position)
    const realGod = this.scene.god
    const fakeGod = {
      sprite: this.sprite,
      hp: this.hp, maxHp: this.maxHp,
      mana: this.mana, maxMana: this.maxMana,
      team: 'enemy',
    }
    this.scene.god = fakeGod

    // Try Slot 3 (ultimate) first, then 2 (tactical), then 1 (offensive)
    let cast = false
    for (let slot = 2; slot >= 0; slot--) {
      this.spellBook.select(slot)
      const spell = this.spellBook.active()
      if (spell && spell.cooldownRemaining <= 0 && this.mana >= spell.manaCost) {
        if (this.spellBook.cast(this.scene, tx, ty)) {
          this.mana = Math.max(0, this.mana - spell.manaCost)
          cast = true
          this._flashCastBurst()
          break
        }
      }
    }

    // Restore real god
    this.scene.god = realGod

    // Tick spell cooldowns
    this.spellBook.update(0)
  }

  // A quick burst of additive motes when the enemy fires a spell.
  // Pure feedback — no damage, no logic — it just makes the cast
  // readable so the player has a chance to react.
  _flashCastBurst() {
    if (!this.scene || !this.sprite) return
    const cx = this.sprite.x
    const cy = this.sprite.y - this.sprite.height * 0.55
    const colours = [0xff7733, 0xffaa44, 0xffeeaa]
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2
      const speed = 40 + Math.random() * 30
      const m = this.scene.add.circle(cx, cy, 2.2 + Math.random(), colours[i % colours.length], 1)
        .setDepth(22)
        .setBlendMode(Phaser.BlendModes.ADD)
      this.scene.tweens.add({
        targets: m,
        x: cx + Math.cos(angle) * speed,
        y: cy + Math.sin(angle) * speed,
        alpha: 0,
        scale: 0.2,
        duration: 450 + Math.random() * 200,
        ease: 'Quad.easeOut',
        onComplete: () => m.destroy(),
      })
    }
    // Soft camera nudge so big casts register without drowning smaller beats.
    if (this.scene.addTrauma) this.scene.addTrauma(0.08)
  }

  _flee(body, onGround, dx, dy) {
    const dir = -Math.sign(dx)
    body.setVelocityX(dir * COMBAT.enemyGod.speed * 1.1)
    this.sprite.setFlipX(dir < 0)
    if (onGround && (body.blocked.left || body.blocked.right)) {
      body.setVelocityY(COMBAT.enemyGod.jumpVelocity)
    }
    this.hp = Math.min(this.maxHp, this.hp + 0.05)
  }
}
