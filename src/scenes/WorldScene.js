import Phaser from 'phaser'
import { WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE, GAME_WIDTH, GAME_HEIGHT } from '../core/Constants.js'
import { generateWorld, findFlatSurface, findTabletLocation } from '../world/WorldGenerator.js'
import { createTilesetTexture, createTilemap, setupCollision, WRAP_PAD } from '../world/WorldRenderer.js'
import { buildPalette } from '../world/TileTypes.js'
import God from '../god/God.js'
import Village from '../civilisation/Village.js'
import Tablet from '../civilisation/Tablet.js'
import Minimap from '../ui/Minimap.js'
import PortalHenge from '../world/PortalHenge.js'
import ParallaxSky from '../ui/ParallaxSky.js'
import CritterManager from '../world/Critters.js'
import AmbienceEngine from '../sound/AmbienceEngine.js'

const VILLAGE_COUNT = 4
const TABLET_COUNT = 3
const VILLAGE_SPACING = 80 // minimum tile distance between villages
const DAY_DURATION = 120000 // 2 minutes per full day/night cycle

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
    this.baseSkyColour = palette.skyColour
    this.cameras.main.setBackgroundColor(this.baseSkyColour)

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
      padOffset: WRAP_PAD,
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

    // Place multiple villages with spacing
    this.villages = []
    const excludeZones = []
    for (let i = 0; i < VILLAGE_COUNT; i++) {
      const vx = findFlatSurface(worldData.surfaceHeights, 8, rng, excludeZones)
      if (vx < 0) continue
      const vy = Math.floor(worldData.surfaceHeights[vx])
      const village = new Village(this, vx, vy, params)
      this.villages.push(village)
      excludeZones.push({ x: vx, radius: VILLAGE_SPACING })
    }

    // Place multiple tablets underground
    this.tablets = []
    for (let i = 0; i < TABLET_COUNT; i++) {
      const pos = findTabletLocation(worldData.grid, worldData.surfaceHeights, rng)
      const tablet = new Tablet(this, pos.x, pos.y, i + 2)
      this.tablets.push(tablet)

      // Pickup zone for each tablet
      const zone = this.add.zone(tablet.worldX, tablet.worldY, TILE_SIZE * 3, TILE_SIZE * 3)
      this.physics.add.existing(zone, true)
      this.physics.add.overlap(this.god || { sprite: null }, zone, () => this.onTabletPickup(tablet))
      tablet._zone = zone
    }

    // Place portal henge away from villages
    const portalX = findFlatSurface(worldData.surfaceHeights, 8, rng, excludeZones)
    if (portalX >= 0) {
      const portalY = Math.floor(worldData.surfaceHeights[portalX])
      this.portalHenge = new PortalHenge(this, portalX, portalY, params)
      excludeZones.push({ x: portalX, radius: 40 })
    }

    // Spawn god near the first village
    const homeVillage = this.villages[0]
    const godX = homeVillage
      ? (homeVillage.tileX - 5) * TILE_SIZE + TILE_SIZE / 2
      : WORLD_WIDTH * TILE_SIZE / 2
    const godY = homeVillage
      ? (homeVillage.tileY - 3) * TILE_SIZE
      : 50 * TILE_SIZE
    this.god = new God(this, godX, godY, params)

    // Physics: god collides with terrain
    this.physics.add.collider(this.god.sprite, layer)

    // Set up tablet overlap detection (now that god exists)
    this.tablets.forEach(tablet => {
      this.physics.add.overlap(this.god.sprite, tablet._zone, () => this.onTabletPickup(tablet))
    })

    // Village delivery zones
    this.villages.forEach(village => {
      const zone = this.add.zone(
        village.worldX, village.worldY - TILE_SIZE, TILE_SIZE * 8, TILE_SIZE * 5
      )
      this.physics.add.existing(zone, true)
      this.physics.add.overlap(this.god.sprite, zone, () => this.onVillageProximity(village))
      village._zone = zone
    })

    // Camera follows god
    this.cameras.main.startFollow(this.god.sprite, true, 0.1, 0.1)
    this.cameras.main.setDeadzone(100, 50)

    // World bounds for physics (extended to cover wrap padding so collisions work at edges)
    this.physics.world.setBounds(
      -WRAP_PAD * TILE_SIZE, 0,
      (WORLD_WIDTH + 2 * WRAP_PAD) * TILE_SIZE, WORLD_HEIGHT * TILE_SIZE
    )

    // Day/night cycle overlay
    this.dayNightOverlay = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT,
      0x000022, 0
    ).setScrollFactor(0).setDepth(40)
    this.dayTime = 0

    // Parallax sky background
    this.parallaxSky = new ParallaxSky(this, params)

    // Ambient critters
    this.critters = new CritterManager(this, this.worldGrid, worldData.surfaceHeights, params)

    // HUD
    this.createHUD(params)

    // Minimap
    this.minimap = new Minimap(this, this.worldGrid, params)
    this.villages.forEach(v => this.minimap.addVillageMarker(v))
    this.tablets.forEach(t => {
      const dot = this.minimap.addTabletMarker(t)
      if (dot) t._minimapDot = dot
    })

    // World ready
    this.worldReady = true

    // Ambient sound engine; init requires user gesture so we defer
    // until the first keypress/click which will have already occurred
    // (element selection on creation screen counts).
    this.ambience = new AmbienceEngine()
    this.ambience.init().then(() => {
      this.ambience.setWorld(params)
    })
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

    // Village count
    this.villageHUD = this.add.text(pad, pad + 36, `Villages: ${this.villages.length}`, {
      fontFamily: 'Georgia, serif',
      fontSize: '12px',
      color: '#daa520',
      stroke: '#000000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(50)

    // Day/night indicator
    this.dayNightHUD = this.add.text(pad, pad + 52, '', {
      fontFamily: 'Georgia, serif',
      fontSize: '11px',
      color: '#888888',
      stroke: '#000000',
      strokeThickness: 1,
    }).setScrollFactor(0).setDepth(50)

    // Hint text
    this.hintText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 30,
      'Explore the world. Dig deep to find ancient tablets.', {
      fontFamily: 'Georgia, serif',
      fontSize: '12px',
      color: '#666666',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(50)

    this.time.delayedCall(10000, () => {
      this.tweens.add({ targets: this.hintText, alpha: 0, duration: 2000 })
    })

    // Message popup
    this.messageText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, '', {
      fontFamily: 'Georgia, serif',
      fontSize: '18px',
      color: '#daa520',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(60).setAlpha(0)

    // Coordinates
    this.coordText = this.add.text(GAME_WIDTH - pad, pad, '', {
      fontFamily: 'Georgia, serif',
      fontSize: '10px',
      color: '#444444',
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(50)

    // Depth gauge
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

  onTabletPickup(tablet) {
    if (!tablet || tablet.collected) return
    if (tablet.collect()) {
      this.god.collectTablet({ stage: tablet.stage })
      this.tabletHUD.setText(`Tablets: ${this.god.tablets.length}`)
      if (tablet._minimapDot) tablet._minimapDot.setVisible(false)
      this.showMessage('Ancient tablet found! Deliver it to a village.')

      this.hintText.setText('Visit a village to deliver knowledge')
      this.hintText.setAlpha(1)
      this.tweens.killTweensOf(this.hintText)
    }
  }

  onVillageProximity(village) {
    if (!village || this.god.tablets.length === 0) return
    if (village.hasReceivedTablet) return

    if (village.receiveTablet()) {
      this.god.tablets.shift()
      this.tabletHUD.setText(`Tablets: ${this.god.tablets.length}`)
      this.showMessage(`God has spoken! ${village.name} advances.`, 4000)

      // Count advanced villages
      const advanced = this.villages.filter(v => v.hasReceivedTablet).length
      this.villageHUD.setText(`Villages: ${this.villages.length} (${advanced} advanced)`)

      if (this.god.tablets.length > 0) {
        this.hintText.setText(`${this.god.tablets.length} tablet${this.god.tablets.length > 1 ? 's' : ''} remaining`)
      } else {
        this.hintText.setText('Explore deeper for more tablets')
      }
      this.hintText.setAlpha(1)
      this.time.delayedCall(5000, () => {
        this.tweens.add({ targets: this.hintText, alpha: 0, duration: 2000 })
      })
    }
  }

  update(time, delta) {
    if (!this.worldReady) return

    // God movement
    this.god.update(this.worldGrid, time)

    // Horizontal world wrapping
    const worldPixelWidth = WORLD_WIDTH * TILE_SIZE
    if (this.god.sprite.x < 0) {
      this.god.sprite.x += worldPixelWidth
    } else if (this.god.sprite.x >= worldPixelWidth) {
      this.god.sprite.x -= worldPixelWidth
    }

    // Kill plane
    if (this.god.sprite.y > WORLD_HEIGHT * TILE_SIZE) {
      this.respawnGod()
    }

    // Day/night cycle
    this.dayTime = (time % DAY_DURATION) / DAY_DURATION
    const nightIntensity = Math.max(0, Math.sin(this.dayTime * Math.PI * 2 - Math.PI / 2)) * 0.4
    this.dayNightOverlay.setAlpha(nightIntensity)

    const isDay = this.dayTime < 0.5
    this.dayNightHUD.setText(isDay ? 'Day' : 'Night')
    this.dayNightHUD.setColor(isDay ? '#ddaa44' : '#6666aa')

    // Update all village beliefs
    for (const village of this.villages) {
      const dx = this.god.sprite.x - village.worldX
      const dy = this.god.sprite.y - village.worldY
      const dist = Math.sqrt(dx * dx + dy * dy)
      village.updateBelief(dist, delta)
    }

    // Critter AI
    if (this.critters) this.critters.update(delta)

    // Minimap
    if (this.minimap) this.minimap.update(this.god.sprite)

    // HUD
    const tileX = Math.floor(this.god.sprite.x / TILE_SIZE)
    const tileY = Math.floor(this.god.sprite.y / TILE_SIZE)
    this.coordText.setText(`${tileX}, ${tileY}`)

    const depthPercent = Math.floor((tileY / WORLD_HEIGHT) * 100)
    this.depthText.setText(`Depth: ${depthPercent}%`)

    // Drive ambient sound from world state
    if (this.ambience?.initialized) {
      this.ambience.setTimeOfDay(this.dayTime)
      this.ambience.setDepth(tileY / WORLD_HEIGHT)
    }
  }

  shutdown() {
    if (this.ambience) { this.ambience.destroy(); this.ambience = null }
  }

  respawnGod() {
    const home = this.villages[0]
    if (home) {
      this.god.sprite.x = home.worldX
      this.god.sprite.y = home.worldY - TILE_SIZE * 5
    } else {
      this.god.sprite.x = WORLD_WIDTH * TILE_SIZE / 2
      this.god.sprite.y = TILE_SIZE * 10
    }
    this.god.sprite.body.setVelocity(0, 0)
    this.showMessage('Resurrected near the village')
  }
}
