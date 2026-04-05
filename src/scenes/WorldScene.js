import Phaser from 'phaser'
import { WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE, GAME_WIDTH, GAME_HEIGHT } from '../core/Constants.js'
import { generateWorld, findFlatSurface, findTabletLocation } from '../world/WorldGenerator.js'
import { createTilesetTexture, createTilemap, setupCollision } from '../world/WorldRenderer.js'
import { buildPalette } from '../world/TileTypes.js'
import God from '../god/God.js'
import Village from '../civilisation/Village.js'
import Tablet from '../civilisation/Tablet.js'

export default class WorldScene extends Phaser.Scene {
  constructor() {
    super({ key: 'World' })
  }

  init(data) {
    this.params = data.params
  }

  create() {
    const params = this.params

    // Set sky colour
    const palette = buildPalette(params.element1, params.element2, params.elementRatio)
    this.cameras.main.setBackgroundColor(palette.skyColour)

    // Show loading text while generating
    const loadText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Shaping the world...', {
      fontFamily: 'Georgia, serif',
      fontSize: '20px',
      color: '#c07a28',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(100)

    // Defer world gen to next frame so the loading text renders
    this.time.delayedCall(50, () => {
      this.buildWorld(params)
      loadText.destroy()
    })
  }

  buildWorld(params) {
    // Generate terrain
    const worldData = generateWorld(params)

    // Create tileset and tilemap
    createTilesetTexture(this, params)
    const { map, layer } = createTilemap(this, worldData)
    setupCollision(layer)

    this.worldMap = map
    this.worldLayer = layer

    // Store world data for physics and interaction
    this.worldGrid = {
      grid: worldData.grid,
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      layer: layer,
    }

    // Seeded RNG for entity placement
    let placementSeed = params.seed + 11111
    const rng = () => {
      placementSeed |= 0
      placementSeed = (placementSeed + 0x6d2b79f5) | 0
      let t = Math.imul(placementSeed ^ (placementSeed >>> 15), 1 | placementSeed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }

    // Place village on a flat surface
    const villageX = findFlatSurface(worldData.surfaceHeights, 6, rng)
    const villageY = Math.floor(worldData.surfaceHeights[villageX])
    this.village = new Village(this, villageX, villageY, params)

    // Place tablet underground
    const tabletPos = findTabletLocation(worldData.grid, worldData.surfaceHeights, rng)
    this.tablet = new Tablet(this, tabletPos.x, tabletPos.y, 2)

    // Spawn god near the village (slightly to the left)
    const godX = (villageX - 10) * TILE_SIZE + TILE_SIZE / 2
    const godY = (villageY - 3) * TILE_SIZE
    this.god = new God(this, godX, godY, params)

    // Physics: god collides with terrain
    this.physics.add.collider(this.god.sprite, layer)

    // Camera follows god
    this.cameras.main.startFollow(this.god.sprite, true, 0.1, 0.1)
    this.cameras.main.setDeadzone(100, 50)

    // World bounds for physics (but god can go beyond for wrapping)
    this.physics.world.setBounds(0, 0, WORLD_WIDTH * TILE_SIZE, WORLD_HEIGHT * TILE_SIZE)

    // HUD
    this.createHUD(params)

    // Tablet pickup zone
    this.tabletZone = this.add.zone(
      this.tablet.worldX, this.tablet.worldY, TILE_SIZE * 3, TILE_SIZE * 3
    )
    this.physics.add.existing(this.tabletZone, true) // static body

    // Village delivery zone
    this.villageZone = this.add.zone(
      this.village.worldX, this.village.worldY - TILE_SIZE, TILE_SIZE * 6, TILE_SIZE * 4
    )
    this.physics.add.existing(this.villageZone, true)

    // Overlap detection
    this.physics.add.overlap(this.god.sprite, this.tabletZone, () => this.onTabletPickup())
    this.physics.add.overlap(this.god.sprite, this.villageZone, () => this.onVillageProximity())

    // World ready
    this.worldReady = true
  }

  createHUD(params) {
    const pad = 12

    // Element display
    this.add.text(pad, pad, `${params.element1} + ${params.element2}`, {
      fontFamily: 'Georgia, serif',
      fontSize: '14px',
      color: '#c07a28',
      stroke: '#000000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(50)

    // Tablet counter
    this.tabletHUD = this.add.text(pad, pad + 20, 'Tablets: 0', {
      fontFamily: 'Georgia, serif',
      fontSize: '12px',
      color: '#00ffaa',
      stroke: '#000000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(50)

    // Hint text (fades after a few seconds)
    this.hintText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 30, 'Explore downward to find the ancient tablet', {
      fontFamily: 'Georgia, serif',
      fontSize: '12px',
      color: '#666666',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(50)

    this.time.delayedCall(8000, () => {
      this.tweens.add({
        targets: this.hintText,
        alpha: 0,
        duration: 2000,
      })
    })

    // Message popup (for events)
    this.messageText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, '', {
      fontFamily: 'Georgia, serif',
      fontSize: '18px',
      color: '#daa520',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(60).setAlpha(0)

    // Coordinates display (useful for testing)
    this.coordText = this.add.text(GAME_WIDTH - pad, pad, '', {
      fontFamily: 'Georgia, serif',
      fontSize: '10px',
      color: '#444444',
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(50)

    // Minimap indicator (simple depth gauge)
    this.depthText = this.add.text(GAME_WIDTH - pad, pad + 14, '', {
      fontFamily: 'Georgia, serif',
      fontSize: '10px',
      color: '#444444',
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(50)
  }

  showMessage(text, duration = 3000) {
    this.messageText.setText(text)
    this.messageText.setAlpha(1)
    this.tweens.add({
      targets: this.messageText,
      alpha: 0,
      delay: duration - 500,
      duration: 500,
    })
  }

  onTabletPickup() {
    if (!this.tablet || this.tablet.collected) return
    if (this.tablet.collect()) {
      this.god.collectTablet({ stage: this.tablet.stage })
      this.tabletHUD.setText(`Tablets: ${this.god.tablets.length}`)
      this.showMessage('Ancient tablet found! Deliver it to the village.')

      // Update hint
      this.hintText.setText('Return to the village to deliver knowledge')
      this.hintText.setAlpha(1)
      this.tweens.killTweensOf(this.hintText)
    }
  }

  onVillageProximity() {
    if (!this.village || this.god.tablets.length === 0) return
    if (this.village.hasReceivedTablet) return

    if (this.village.receiveTablet()) {
      this.god.tablets.shift()
      this.tabletHUD.setText(`Tablets: ${this.god.tablets.length}`)
      this.showMessage('God has spoken! The village advances.', 4000)

      this.hintText.setText('The village grows stronger')
      this.hintText.setAlpha(1)
      this.time.delayedCall(5000, () => {
        this.tweens.add({ targets: this.hintText, alpha: 0, duration: 2000 })
      })
    }
  }

  update(time, delta) {
    if (!this.worldReady) return

    // God movement
    this.god.update(this.worldGrid)

    // Horizontal world wrapping
    const worldPixelWidth = WORLD_WIDTH * TILE_SIZE
    if (this.god.sprite.x < 0) {
      this.god.sprite.x += worldPixelWidth
    } else if (this.god.sprite.x >= worldPixelWidth) {
      this.god.sprite.x -= worldPixelWidth
    }

    // Kill plane: if god falls below the world, respawn at surface
    if (this.god.sprite.y > WORLD_HEIGHT * TILE_SIZE) {
      this.respawnGod()
    }

    // Village belief update
    if (this.village) {
      const dx = this.god.sprite.x - this.village.worldX
      const dy = this.god.sprite.y - this.village.worldY
      const dist = Math.sqrt(dx * dx + dy * dy)
      this.village.updateBelief(dist, delta)
    }

    // HUD updates
    const tileX = Math.floor(this.god.sprite.x / TILE_SIZE)
    const tileY = Math.floor(this.god.sprite.y / TILE_SIZE)
    this.coordText.setText(`${tileX}, ${tileY}`)

    const depthPercent = Math.floor((tileY / WORLD_HEIGHT) * 100)
    this.depthText.setText(`Depth: ${depthPercent}%`)
  }

  respawnGod() {
    // Respawn above the village
    if (this.village) {
      this.god.sprite.x = this.village.worldX
      this.god.sprite.y = this.village.worldY - TILE_SIZE * 5
    } else {
      this.god.sprite.x = WORLD_WIDTH * TILE_SIZE / 2
      this.god.sprite.y = TILE_SIZE * 10
    }
    this.god.sprite.body.setVelocity(0, 0)
    this.showMessage('Resurrected near the village')
  }
}
