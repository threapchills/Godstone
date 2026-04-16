import Phaser from 'phaser'
import { TILE_SIZE, GOD_SPEED, GOD_JUMP, GRAVITY, WORLD_WIDTH, WORLD_HEIGHT } from '../core/Constants.js'
import { TILES, LIQUID_TILES, SOLID_TILES } from '../world/TileTypes.js'
import { createGodTexture, GOD_W, GOD_H } from './GodRenderer.js'
import { compositeGod, COMPOSITE_W, COMPOSITE_H, GOD_DISPLAY_SCALE } from './GodCompositor.js'
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
    if (this._useComposite) {
      // Composite is 128x192 at GOD_DISPLAY_SCALE (~0.085).
      // Effective on-screen: ~11x16px. Hitbox needs to be defined
      // in source-texture coordinates so Phaser scales it automatically.
      this.sprite.body.setSize(80, 160)
      this.sprite.body.setOffset(24, 28)
    } else {
      this.sprite.body.setSize(14, 24)
      this.sprite.body.setOffset(5, 8)
    }
    this.sprite.body.setCollideWorldBounds(false)
    this.sprite.body.setBounce(0)
    this.sprite.body.setMaxVelocityY(500)

    // State
    this.isInLiquid = false
    this.facingRight = true
    // Ghost mode: when the god's HP hits zero, rather than snapping back
    // to a village immediately they wander as a translucent spirit for
    // ~60 s. Combat, digging, and spell casting are all suppressed while
    // this flag is true. The scene wires the phase-out timer and the
    // resurrection into respawnGod().
    this.isGhost = false
    this._ghostTimer = 0
    this._ghostBobPhase = Math.random() * Math.PI * 2
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
    // empty takes about six seconds of constant motion — fast enough
    // that combat has rhythm, slow enough that spells still feel weighty.
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
    // Use modular composite if god parts were chosen on the creation screen;
    // otherwise fall back to the procedural canvas renderer.
    if (params.godHead && params.godBody && params.godLegs) {
      const uniqueId = `player-${params.seed || 0}`
      const { key } = compositeGod(scene, params.godHead, params.godBody, params.godLegs, uniqueId)
      this.sprite = scene.add.sprite(x, y, key)
      this.sprite.setOrigin(0.5, 1)
      this.sprite.setScale(GOD_DISPLAY_SCALE)
      this.sprite.setDepth(10)
      this._useComposite = true
    } else {
      const { key } = createGodTexture(scene, params)
      this.sprite = scene.add.sprite(x, y, key)
      this.sprite.setOrigin(0.5, 1)
      this.sprite.setScale(0.5)
      this.sprite.setDepth(10)
      this._useComposite = false
    }
  }

  update(worldGrid, time, delta = 16) {
    const body = this.sprite.body
    const onGround = body.blocked.down

    // Ghost mode: move freely, no gravity, no interactions. The player
    // can wander the world as a mourner until the timer expires. Skip
    // the whole combat/dig pipeline.
    if (this.isGhost) {
      this._ghostUpdate(time, delta)
      return
    }

    // Mana regen tied to actual movement (any displacement counts).
    // Stationary god gets nothing; this rewards exploration.
    const dx = this.sprite.x - this._lastManaPosX
    const dy = this.sprite.y - this._lastManaPosY
    const moved = (dx * dx + dy * dy) > 0.25
    if (moved && this.mana < this.maxMana) {
      // Full bar (3 mana) regenerates over ~6 seconds of motion. This
      // gives the player a steady spell cadence without making them
      // infinite turrets — stationary gods get nothing.
      this.mana = Math.min(this.maxMana, this.mana + (3 / 6) * (delta / 1000))
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
    // Uncarvable: the world's structural floor and its molten core. Magma
    // rock is part of the core tier; cracking into it would let the god
    // tunnel out the bottom of the world, which breaks the geological
    // feeling of a finite planet.
    if (tile === TILES.BEDROCK || tile === TILES.MAGMA_ROCK || tile === TILES.AIR) return false
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

  // Put the god in ghost mode. Called by the scene on death so the
  // player has a chance to say goodbye to whatever they built before
  // the resurrection flash. The body is suspended and made intangible
  // so no collisions, no damage, no dig. Gravity is muted and velocity
  // cleared; ghosts drift rather than fall.
  enterGhostMode() {
    if (this.isGhost) return
    this.isGhost = true
    this._ghostTimer = 0
    if (this.sprite) {
      this.sprite.setAlpha(0.45)
      this.sprite.setTint(0xdde8ff)
    }
    const body = this.sprite.body
    if (body) {
      body.setAllowGravity(false)
      body.setVelocity(0, 0)
      // Disable terrain collision so the spirit glides through rock.
      body.checkCollision.none = true
    }
  }

  exitGhostMode() {
    if (!this.isGhost) return
    this.isGhost = false
    this._ghostTimer = 0
    if (this.sprite) {
      this.sprite.setAlpha(1)
      this.sprite.clearTint()
    }
    const body = this.sprite.body
    if (body) {
      body.setAllowGravity(true)
      body.setGravityY(GRAVITY)
      body.checkCollision.none = false
    }
  }

  // Ghost-mode tick: arrow keys/WASD drift the spirit, space accelerates,
  // and the sprite bobs for a ghostly feel. No dig, no spell, no damage.
  _ghostUpdate(time, delta) {
    const body = this.sprite.body
    this._ghostTimer += delta
    this._ghostBobPhase += delta * 0.004

    const SPEED = 120
    let vx = 0, vy = 0
    if (this.cursors.left.isDown || this.wasd.left.isDown) vx -= SPEED
    if (this.cursors.right.isDown || this.wasd.right.isDown) vx += SPEED
    if (this.cursors.up.isDown || this.wasd.up.isDown || this.spaceKey.isDown) vy -= SPEED
    if (this.cursors.down.isDown || this.wasd.down.isDown) vy += SPEED

    body.setVelocity(vx, vy)

    // Facing flip + bob
    if (vx < 0 && this.facingRight) { this.sprite.setFlipX(true); this.facingRight = false }
    else if (vx > 0 && !this.facingRight) { this.sprite.setFlipX(false); this.facingRight = true }
    this.sprite.y += Math.sin(this._ghostBobPhase) * 0.35

    // Faint trailing mote every few frames for the spirit look.
    if (Math.random() < 0.12) {
      const p = this.scene.add.circle(
        this.sprite.x + (Math.random() - 0.5) * 8,
        this.sprite.y - 10 + (Math.random() - 0.5) * 10,
        1.4 + Math.random(), 0xccddff, 0.7,
      ).setDepth(9)
      this.scene.tweens.add({
        targets: p,
        y: p.y - 12 - Math.random() * 8,
        alpha: 0, scale: 0.3,
        duration: 700 + Math.random() * 300,
        onComplete: () => p.destroy(),
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
  // HP in a single frame. Ghosts are intangible and take nothing.
  takeDamage(amount, time = performance.now()) {
    if (this.isGhost) return
    if (time - this._lastDamageTime < 500) return
    this._lastDamageTime = time
    this.hp = Math.max(0, this.hp - amount)
    if (this.sprite) {
      this.sprite.setTint(0xff5555)
      this.scene.time.delayedCall(140, () => this.sprite && this.sprite.clearTint())
      // Blood burst on the player god for visceral feedback
      this._spawnBlood(5 + Math.floor(amount * 0.4))
    }
    if (this.scene.addJuice) this.scene.addJuice('light')
    if (this.hp <= 0) {
      // Reset HP on respawn; the scene's respawnGod handles the move
      this.hp = this.maxHp
      if (this.scene.respawnGod) this.scene.respawnGod()
    }
  }

  _spawnBlood(count) {
    if (!this.scene || !this.sprite) return
    const cx = this.sprite.x
    const cy = this.sprite.y - this.sprite.height * 0.4
    const colours = [0xaa0000, 0x880011, 0xcc1111, 0x660000, 0x991100, 0xbb0022, 0x770000]
    // Fine mist
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 20 + Math.random() * 70
      const p = this.scene.add.circle(cx, cy, 1.2 + Math.random() * 1.8, colours[i % colours.length], 0.9)
        .setDepth(15)
      this.scene.tweens.add({
        targets: p,
        x: cx + Math.cos(angle) * speed * 0.6,
        y: cy + Math.sin(angle) * speed * 0.6 + 12,
        alpha: 0,
        scale: 0.08,
        duration: 320 + Math.random() * 280,
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      })
    }
    // Larger gore chunks that arc and fall
    const goreColours = [0x880000, 0x660011, 0xaa1111, 0x550000]
    for (let i = 0; i < Math.min(4, Math.floor(count / 3)); i++) {
      const angle = -Math.PI * 0.3 + Math.random() * Math.PI * 0.6 - Math.PI * 0.5
      const speed = 35 + Math.random() * 55
      const chunk = this.scene.add.circle(cx, cy, 2.0 + Math.random() * 2.2, goreColours[i % goreColours.length], 0.9).setDepth(16)
      this.scene.tweens.add({
        targets: chunk,
        x: cx + Math.cos(angle) * speed * 0.7,
        y: cy + Math.sin(angle) * speed * 0.4 + 25,
        alpha: 0,
        scale: 0.12,
        duration: 450 + Math.random() * 250,
        ease: 'Quad.easeIn',
        onComplete: () => chunk.destroy(),
      })
    }
  }

  get position() {
    return { x: this.sprite.x, y: this.sprite.y }
  }
}
