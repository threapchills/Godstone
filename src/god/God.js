import Phaser from 'phaser'
import { TILE_SIZE, GOD_SPEED, GOD_JUMP, GRAVITY } from '../core/Constants.js'
import { TILES, LIQUID_TILES } from '../world/TileTypes.js'

// The god entity: a demi-human deity that traverses the world.
// Phase 1: basic platformer movement (walk, jump, fly hint).
// God appearance will be procedurally generated later; for now, a coloured sprite.
export default class God {
  constructor(scene, x, y, params) {
    this.scene = scene
    this.params = params

    // Generate a simple god sprite based on element colours
    this.createSprite(scene, x, y, params)

    // Physics
    scene.physics.add.existing(this.sprite)
    this.sprite.body.setGravityY(GRAVITY)
    this.sprite.body.setSize(12, 22)
    this.sprite.body.setOffset(2, 2)
    this.sprite.body.setCollideWorldBounds(false)
    this.sprite.body.setBounce(0)
    this.sprite.body.setMaxVelocityY(500)

    // State
    this.isInLiquid = false
    this.canFly = false
    this.facingRight = true
    this.tablets = [] // collected tablets

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
    const width = 16
    const height = 24
    const key = 'god-sprite'

    if (!scene.textures.exists(key)) {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')

      const elementColours = {
        fire: { body: '#e85a20', dark: '#a03a10', glow: '#ff8844' },
        water: { body: '#2888aa', dark: '#1a6688', glow: '#44ccff' },
        air: { body: '#b0c0d0', dark: '#8899aa', glow: '#ddeeff' },
        earth: { body: '#6a8a3a', dark: '#4a6a2a', glow: '#aacc66' },
      }
      const c1 = elementColours[params.element1] || elementColours.fire
      const c2 = elementColours[params.element2] || elementColours.water

      // Aura glow behind the god
      ctx.fillStyle = c1.glow
      ctx.globalAlpha = 0.3
      ctx.fillRect(3, 1, 10, 20)
      ctx.globalAlpha = 1

      // Head (round-ish)
      ctx.fillStyle = c1.body
      ctx.fillRect(5, 1, 6, 5)
      ctx.fillRect(4, 2, 8, 3)

      // Eyes
      ctx.fillStyle = c2.glow
      ctx.fillRect(6, 3, 1, 1)
      ctx.fillRect(9, 3, 1, 1)

      // Crown / divine mark
      ctx.fillStyle = '#ffd700'
      ctx.fillRect(6, 0, 1, 2)
      ctx.fillRect(8, 0, 1, 1)
      ctx.fillRect(10, 0, 1, 2)

      // Torso
      ctx.fillStyle = c1.dark
      ctx.fillRect(4, 6, 8, 8)
      ctx.fillStyle = c1.body
      ctx.fillRect(5, 7, 6, 6)

      // Belt / sash (accent colour)
      ctx.fillStyle = c2.body
      ctx.fillRect(4, 12, 8, 1)

      // Arms
      ctx.fillStyle = c1.body
      ctx.fillRect(2, 7, 2, 5)
      ctx.fillRect(12, 7, 2, 5)

      // Legs
      ctx.fillStyle = c1.dark
      ctx.fillRect(5, 14, 3, 8)
      ctx.fillRect(9, 14, 3, 8)
      // Feet
      ctx.fillStyle = c2.dark || c1.dark
      ctx.fillRect(4, 21, 4, 3)
      ctx.fillRect(9, 21, 4, 3)

      scene.textures.addCanvas(key, canvas)
    }

    this.sprite = scene.add.sprite(x, y, key)
    this.sprite.setOrigin(0.5, 1)
    this.sprite.setDepth(10)
  }

  update(worldGrid) {
    const body = this.sprite.body
    const onGround = body.blocked.down

    // Check if standing in liquid
    this.checkLiquid(worldGrid)

    // Horizontal movement
    const speed = this.isInLiquid ? GOD_SPEED * 0.6 : GOD_SPEED
    if (this.cursors.left.isDown || this.wasd.left.isDown) {
      body.setVelocityX(-speed)
      if (this.facingRight) {
        this.sprite.setFlipX(true)
        this.facingRight = false
      }
    } else if (this.cursors.right.isDown || this.wasd.right.isDown) {
      body.setVelocityX(speed)
      if (!this.facingRight) {
        this.sprite.setFlipX(false)
        this.facingRight = true
      }
    } else {
      body.setVelocityX(0)
    }

    // Jumping / swimming upward
    if (this.isInLiquid) {
      // Swim: hold up/space to rise, otherwise sink slowly
      body.setGravityY(GRAVITY * 0.3)
      if (this.cursors.up.isDown || this.wasd.up.isDown || this.spaceKey.isDown) {
        body.setVelocityY(-GOD_SPEED * 0.8)
      }
      if (this.cursors.down.isDown || this.wasd.down.isDown) {
        body.setVelocityY(GOD_SPEED * 0.6)
      }
    } else {
      body.setGravityY(GRAVITY)
      if ((this.cursors.up.isDown || this.wasd.up.isDown || this.spaceKey.isDown) && onGround) {
        body.setVelocityY(GOD_JUMP)
      }
    }

    // Dig downward (hold down while on ground)
    if ((this.cursors.down.isDown || this.wasd.down.isDown) && onGround && !this.isInLiquid) {
      this.dig(worldGrid)
    }
  }

  checkLiquid(worldGrid) {
    if (!worldGrid) { this.isInLiquid = false; return }
    // Check the tile at the god's feet
    const tileX = Math.floor(this.sprite.x / TILE_SIZE)
    const tileY = Math.floor((this.sprite.y - TILE_SIZE) / TILE_SIZE)
    if (tileX < 0 || tileX >= worldGrid.width || tileY < 0 || tileY >= worldGrid.height) {
      this.isInLiquid = false
      return
    }
    const tile = worldGrid.grid[tileY * worldGrid.width + tileX]
    this.isInLiquid = LIQUID_TILES.has(tile)
  }

  dig(worldGrid) {
    if (!worldGrid) return
    // Remove the tile directly below the god's feet
    const tileX = Math.floor(this.sprite.x / TILE_SIZE)
    const tileY = Math.floor(this.sprite.y / TILE_SIZE)
    if (tileX < 0 || tileX >= worldGrid.width || tileY < 0 || tileY >= worldGrid.height) return

    const idx = tileY * worldGrid.width + tileX
    const tile = worldGrid.grid[idx]
    // Can't dig bedrock
    if (tile === TILES.BEDROCK || tile === TILES.AIR) return
    if (LIQUID_TILES.has(tile)) return

    worldGrid.grid[idx] = TILES.AIR
    // Update the tilemap
    if (worldGrid.layer) {
      worldGrid.layer.putTileAt(-1, tileX, tileY)
    }
  }

  collectTablet(tabletData) {
    this.tablets.push(tabletData)
  }

  get position() {
    return { x: this.sprite.x, y: this.sprite.y }
  }
}
