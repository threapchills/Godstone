import Phaser from 'phaser'
import { TILE_SIZE, GOD_SPEED, GOD_JUMP, GRAVITY, WORLD_WIDTH, WORLD_HEIGHT } from '../core/Constants.js'
import { TILES, LIQUID_TILES, SOLID_TILES } from '../world/TileTypes.js'
import { createGodTexture, GOD_W, GOD_H } from './GodRenderer.js'
import { COMBAT } from '../combat/Combat.js'

const FLAP_IMPULSE = -220       // upward burst per space press
const FLAP_COOLDOWN = 180       // ms between flaps
const DIG_RATE = 100            // ms between dig ticks when held
const AIR_CONTROL = 0.85        // horizontal speed multiplier in air
const COYOTE_TIME = 80          // ms of grace after walking off edge

export default class God {
  constructor(scene, x, y, params) {
    this.scene = scene
    this.params = params

    this.createSprite(scene, x, y, params)

    // Physics: hitbox smaller than visual for forgiving collisions
    scene.physics.add.existing(this.sprite)
    this.sprite.body.setGravityY(GRAVITY)
    this.sprite.body.setSize(14, 24)
    this.sprite.body.setOffset(5, 8)
    this.sprite.body.setCollideWorldBounds(false)
    this.sprite.body.setBounce(0)
    this.sprite.body.setMaxVelocityY(500)

    // State
    this.isInLiquid = false
    this.facingRight = true
    // Tablets are persistent and level-agnostic. Each pickup increments
    // highestTablet by one; the first one found is level 1, second is
    // level 2, and so on. A village at stage N can advance whenever the
    // god's highestTablet >= N. Tablets are never consumed.
    this.highestTablet = 0

    // Combat
    this.maxHp = COMBAT.god.maxHp
    this.hp = this.maxHp
    this._lastDamageTime = 0

    // Mana: enough for one of each spell (3 total). Regenerates while
    // the god is moving (walking, flying, falling). Full regen from
    // empty takes about two minutes of constant motion.
    this.maxMana = 3
    this.mana = this.maxMana
    this._lastManaPosX = 0
    this._lastManaPosY = 0
    this.lastFlapTime = 0
    this.lastDigTime = 0
    this.coyoteTimer = 0
    this.isFlying = false
    this.wasOnGround = true
    this.lastFallSpeed = 0

    // Input
    this.cursors = scene.input.keyboard.createCursorKeys()
    this.wasd = {
      up: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }
    this.spaceKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
  }

  createSprite(scene, x, y, params) {
    const { key } = createGodTexture(scene, params)
    this.sprite = scene.add.sprite(x, y, key)
    this.sprite.setOrigin(0.5, 1)
    this.sprite.setScale(0.5) // human-sized relative to 8px tiles
    this.sprite.setDepth(10)
  }

  update(worldGrid, time, delta = 16) {
    const body = this.sprite.body
    const onGround = body.blocked.down

    // Mana regen tied to actual movement (any displacement counts).
    // Stationary god gets nothing; this rewards exploration.
    const dx = this.sprite.x - this._lastManaPosX
    const dy = this.sprite.y - this._lastManaPosY
    const moved = (dx * dx + dy * dy) > 0.25
    if (moved && this.mana < this.maxMana) {
      // Full bar (3 mana) regenerates over ~120 seconds of motion
      this.mana = Math.min(this.maxMana, this.mana + (3 / 120) * (delta / 1000))
    }
    this._lastManaPosX = this.sprite.x
    this._lastManaPosY = this.sprite.y

    // Landing detection
    if (onGround && !this.wasOnGround) {
      if (this.lastFallSpeed > 150) {
        // Calculate shake amount based on fall severity (maxes out around 0.3)
        const traumaAmount = Math.min(0.3, (this.lastFallSpeed - 150) / 1000)
        if (this.scene.addTrauma) this.scene.addTrauma(traumaAmount)
      }
    }
    this.wasOnGround = onGround
    this.lastFallSpeed = body.velocity.y

    // Coyote time: brief grace period after leaving ground
    if (onGround) {
      this.coyoteTimer = COYOTE_TIME
      this.isFlying = false
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - 16)
    }

    this.checkLiquid(worldGrid)

    // -- Horizontal movement --
    const speed = this.isInLiquid ? GOD_SPEED * 0.6 : GOD_SPEED
    const effectiveSpeed = onGround ? speed : speed * AIR_CONTROL
    let moving = false
    let movingLeft = this.cursors.left.isDown || this.wasd.left.isDown
    let movingRight = this.cursors.right.isDown || this.wasd.right.isDown

    if (movingLeft) {
      body.setVelocityX(-effectiveSpeed)
      moving = true
      if (this.facingRight) { this.sprite.setFlipX(true); this.facingRight = false }
    } else if (movingRight) {
      body.setVelocityX(effectiveSpeed)
      moving = true
      if (!this.facingRight) { this.sprite.setFlipX(false); this.facingRight = true }
    } else {
      // Friction: decelerate smoothly instead of stopping dead
      body.setVelocityX(body.velocity.x * (onGround ? 0.7 : 0.92))
    }

    // -- Jump (up arrow / W) --
    const wantsJump = this.cursors.up.isDown || this.wasd.up.isDown
    if (this.isInLiquid) {
      body.setGravityY(GRAVITY * 0.3)
      if (wantsJump) body.setVelocityY(-GOD_SPEED * 0.8)
      if (this.cursors.down.isDown || this.wasd.down.isDown) body.setVelocityY(GOD_SPEED * 0.6)
    } else {
      body.setGravityY(GRAVITY)
      if (wantsJump && this.coyoteTimer > 0) {
        body.setVelocityY(GOD_JUMP)
        this.coyoteTimer = 0
      }
    }

    // -- Fly / flap (space) --
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey) && !this.isInLiquid) {
      if (time - this.lastFlapTime > FLAP_COOLDOWN) {
        // Flap: upward impulse that works anywhere, even underground
        const currentVy = body.velocity.y
        body.setVelocityY(Math.min(currentVy, 0) + FLAP_IMPULSE)
        this.lastFlapTime = time
        this.isFlying = true
        this.spawnFlapEffect()
        if (this.scene.addTrauma) this.scene.addTrauma(0.2)
      }
    }
    // Holding space gives a gentle sustained lift (slower than flap bursts)
    if (this.spaceKey.isDown && !this.isInLiquid && !onGround) {
      body.setGravityY(GRAVITY * 0.4) // reduced gravity while holding space
    }

    // -- Directional digging --
    // Down digs downward or in movement direction
    const wantsDigDown = this.cursors.down.isDown || this.wasd.down.isDown
    if (wantsDigDown && time - this.lastDigTime > DIG_RATE) {
      this.lastDigTime = time
      let dug = false
      if (movingLeft) {
        dug = this.digAt(worldGrid, -1, 0) || dug
        dug = this.digAt(worldGrid, -1, 1) || dug
      } else if (movingRight) {
        dug = this.digAt(worldGrid, 1, 0) || dug
        dug = this.digAt(worldGrid, 1, 1) || dug
      } else {
        dug = this.digAt(worldGrid, 0, 1) || dug
        dug = this.digAt(worldGrid, 0, 2) || dug
      }
      if (dug && this.scene.addTrauma) this.scene.addTrauma(0.04)
    }
    // Up digs upward (critical for escaping underground)
    if (wantsJump && time - this.lastDigTime > DIG_RATE) {
      this.lastDigTime = time
      let dug = false
      dug = this.digAt(worldGrid, 0, -1) || dug
      dug = this.digAt(worldGrid, 0, -2) || dug
      if (movingLeft) dug = this.digAt(worldGrid, -1, -1) || dug
      if (movingRight) dug = this.digAt(worldGrid, 1, -1) || dug
      if (dug && this.scene.addTrauma) this.scene.addTrauma(0.04)
    }

    // Auto-dig when walking into walls
    if (moving && body.blocked.left) this.digAt(worldGrid, -1, 0)
    if (moving && body.blocked.right) this.digAt(worldGrid, 1, 0)

    // Auto-dig upward when hitting ceiling (prevents getting stuck underground)
    if (body.blocked.up) {
      this.digAt(worldGrid, 0, -1)
      this.digAt(worldGrid, 0, -2)
    }

    // When flying upward, carve a path through terrain
    if (this.isFlying && body.velocity.y < 0) {
      this.digAt(worldGrid, 0, -1)
      this.digAt(worldGrid, 0, -2)
    }

    // Rescue: if completely boxed in (stuck), clear surrounding tiles
    if (body.blocked.left && body.blocked.right && body.blocked.down && body.blocked.up) {
      this.digAt(worldGrid, 0, -1)
      this.digAt(worldGrid, 0, -2)
      this.digAt(worldGrid, -1, 0)
      this.digAt(worldGrid, 1, 0)
      this.digAt(worldGrid, 0, 1)
    }

    // -- Animation --
    if (time) {
      if (this.isFlying && !onGround) {
        // Gentle float wobble while flying
        this.sprite.rotation = Math.sin(time * 0.008) * 0.1
      } else if (moving && onGround) {
        this.sprite.rotation = Math.sin(time * 0.012) * 0.06
      } else {
        this.sprite.rotation *= 0.85
      }
    }
  }

  spawnFlapEffect() {
    // Small burst of air particles below the god
    for (let i = 0; i < 4; i++) {
      const px = this.sprite.x + (Math.random() - 0.5) * 10
      const py = this.sprite.y + 2
      const particle = this.scene.add.circle(px, py, 1.5, 0xcccccc, 0.5).setDepth(9)
      this.scene.tweens.add({
        targets: particle,
        y: py + 10 + Math.random() * 8,
        x: px + (Math.random() - 0.5) * 12,
        alpha: 0,
        scale: 0.3,
        duration: 300 + Math.random() * 200,
        onComplete: () => particle.destroy(),
      })
    }
  }

  checkLiquid(worldGrid) {
    if (!worldGrid) { this.isInLiquid = false; return }
    const tileX = Math.floor(this.sprite.x / TILE_SIZE) % worldGrid.width
    const tileY = Math.floor((this.sprite.y - TILE_SIZE) / TILE_SIZE)
    if (tileX < 0 || tileX >= worldGrid.width || tileY < 0 || tileY >= worldGrid.height) {
      this.isInLiquid = false
      return
    }
    const tile = worldGrid.grid[tileY * worldGrid.width + tileX]
    this.isInLiquid = LIQUID_TILES.has(tile)
  }

  // Dig relative to the god's position: dx/dy in tile offsets
  digAt(worldGrid, dx, dy) {
    if (!worldGrid) return false
    const baseTileX = Math.floor(this.sprite.x / TILE_SIZE)
    const baseTileY = Math.floor((this.sprite.y - TILE_SIZE / 2) / TILE_SIZE)
    const tileX = ((baseTileX + dx) % worldGrid.width + worldGrid.width) % worldGrid.width
    const tileY = baseTileY + dy
    if (tileY < 0 || tileY >= worldGrid.height) return false

    const idx = tileY * worldGrid.width + tileX
    const tile = worldGrid.grid[idx]
    if (tile === TILES.BEDROCK || tile === TILES.AIR) return false
    if (LIQUID_TILES.has(tile)) return false

    worldGrid.grid[idx] = TILES.AIR
    if (worldGrid.layer) {
      const pad = worldGrid.padOffset || 0
      worldGrid.layer.putTileAt(-1, tileX + pad, tileY)
      // Sync mirrored padding columns so the wrap seam stays consistent
      if (tileX < pad) {
        worldGrid.layer.putTileAt(-1, tileX + pad + worldGrid.width, tileY)
      }
      if (tileX >= worldGrid.width - pad) {
        worldGrid.layer.putTileAt(-1, tileX + pad - worldGrid.width, tileY)
      }
    }
    this.spawnDebris(tileX * TILE_SIZE + TILE_SIZE / 2, tileY * TILE_SIZE + TILE_SIZE / 2)
    return true
  }

  spawnDebris(x, y) {
    for (let i = 0; i < 4; i++) {
      const particle = this.scene.add.circle(
        x + (Math.random() - 0.5) * TILE_SIZE,
        y + (Math.random() - 0.5) * TILE_SIZE,
        1 + Math.random(), 0x8a7a5a, 1
      ).setDepth(11)
      this.scene.tweens.add({
        targets: particle,
        x: particle.x + (Math.random() - 0.5) * 16,
        y: particle.y - Math.random() * 12,
        alpha: 0,
        duration: 300 + Math.random() * 150,
        onComplete: () => particle.destroy(),
      })
    }
  }

  // Pick up a tablet. Each pickup is automatically the next level in
  // sequence: the first you find is level 1, the second is level 2, etc.
  // Returns the level granted, useful for HUD messaging.
  collectTablet() {
    this.highestTablet++
    return this.highestTablet
  }

  // Damage with brief invulnerability so a sustained beam doesn't drain
  // HP in a single frame.
  takeDamage(amount, time = performance.now()) {
    if (time - this._lastDamageTime < 500) return
    this._lastDamageTime = time
    this.hp = Math.max(0, this.hp - amount)
    if (this.sprite) {
      this.sprite.setTint(0xff5555)
      this.scene.time.delayedCall(140, () => this.sprite && this.sprite.clearTint())
    }
    if (this.hp <= 0) {
      // Reset HP on respawn; the scene's respawnGod handles the move
      this.hp = this.maxHp
      if (this.scene.respawnGod) this.scene.respawnGod()
    }
  }

  get position() {
    return { x: this.sprite.x, y: this.sprite.y }
  }
}
