import Phaser from 'phaser'
import { WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE, GAME_WIDTH, GAME_HEIGHT } from '../core/Constants.js'
import { generateWorld, findFlatSurface, findCaveSurface, findTabletLocation } from '../world/WorldGenerator.js'
import { createTilesetTexture, createTilemap, setupCollision, WRAP_PAD } from '../world/WorldRenderer.js'
import { buildPalette } from '../world/TileTypes.js'
import God from '../god/God.js'
import Village from '../civilisation/Village.js'
import Bodyguard from '../civilisation/Bodyguard.js'
import Tablet from '../civilisation/Tablet.js'
import EnemyGod from '../combat/EnemyGod.js'
import Minimap from '../ui/Minimap.js'
import TabletInventory from '../ui/TabletInventory.js'
import SpellBar from '../ui/SpellBar.js'
import SpellBook from '../spells/SpellBook.js'
import PortalHenge from '../world/PortalHenge.js'
import ParallaxSky from '../ui/ParallaxSky.js'
import CritterManager from '../world/Critters.js'
import BiomeFlora from '../world/BiomeFlora.js'
import AmbienceEngine from '../sound/AmbienceEngine.js'
import ParticleEngine from '../world/ParticleEngine.js'
import GridSimulator from '../world/GridSimulator.js'
import FoliageRenderer from '../world/FoliageRenderer.js'
// ParallaxForeground removed: produced ghostly floating silhouettes

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
    const palette = createTilesetTexture(this, params)
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
      surfaceHeights: worldData.surfaceHeights,
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

    // Place multiple villages with spacing.
    // First 2 on the primary surface; last 2 prefer cave/cliff floors so the
    // world's new verticality is inhabited. Fall back to surface if no cave found.
    this.villages = []
    const excludeZones = []
    for (let i = 0; i < VILLAGE_COUNT; i++) {
      let vx, vy
      if (i >= 2) {
        const cavePos = findCaveSurface(worldData.grid, worldData.surfaceHeights, 8, rng, excludeZones)
        if (cavePos) {
          vx = cavePos.x
          vy = cavePos.y
        } else {
          vx = findFlatSurface(worldData.surfaceHeights, 8, rng, excludeZones)
          if (vx < 0) continue
          vy = Math.floor(worldData.surfaceHeights[vx])
        }
      } else {
        vx = findFlatSurface(worldData.surfaceHeights, 8, rng, excludeZones)
        if (vx < 0) continue
        vy = Math.floor(worldData.surfaceHeights[vx])
      }
      // Snap downward to the actual topmost solid tile in case erosion
      // or post-pass terrain edits left the chosen y above the ground
      vy = this.snapToGround(worldData.grid, vx, vy)
      const village = new Village(this, vx, vy, params)
      this.villages.push(village)
      excludeZones.push({ x: vx, radius: VILLAGE_SPACING })
    }

    // Place multiple tablets underground. They're generic at world gen;
    // each pickup is the next tablet level in the player's collection.
    this.tablets = []
    for (let i = 0; i < TABLET_COUNT; i++) {
      const pos = findTabletLocation(worldData.grid, worldData.surfaceHeights, rng)
      const tablet = new Tablet(this, pos.x, pos.y)
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

    // Custom camera tracking implemented in update loop for seamless wrapping
    this.cameras.main.scrollX = this.god.sprite.x - GAME_WIDTH / 2
    this.cameras.main.scrollY = this.god.sprite.y - GAME_HEIGHT / 2

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
    this.parallaxSky = new ParallaxSky(this, params, palette)

    // Ambient critters
    this.critters = new CritterManager(this, this.worldGrid, worldData.surfaceHeights, params)

    // Biome-flavoured flora overlays (crystals, glow mushrooms, coral,
    // ferns, cacti, etc.) chosen by biome at each tile.
    this.biomeFlora = new BiomeFlora(
      this, this.worldGrid, worldData.surfaceHeights,
      worldData.biomeMap, worldData.biomeVocab, params
    )

    // Cosmetic ambient particles (embers, leaves, mist, fireflies, etc.)
    this.particles = new ParticleEngine(this, params, this.worldGrid, worldData.surfaceHeights)

    // Grid Sand Simulator
    this.gridSimulator = new GridSimulator(this, this.worldGrid)

    // Foliage Overlay
    this.foliageRenderer = new FoliageRenderer(this, this.worldGrid, palette)

    // HUD
    this.createHUD(params)

    // Tablet inventory widget. One slot per tablet that exists in the
    // world; level is purely positional (1, 2, 3, ...). Slots light up
    // as the player collects tablets in order.
    this.tabletInventory = new TabletInventory(this, this.tablets.length)

    // Bodyguards: dispatched escort entities, max 3 active at a time.
    // Each holds a slot index that maps to a position relative to the god.
    this.bodyguards = []
    this._bodyguardCheckTimer = 0

    // Spells: book + bar HUD. Unlocks driven by total tablets ever picked up.
    this.spellBook = new SpellBook(params)
    this.spellBar = new SpellBar(this)
    this._wireSpellInput()

    // Spawn one rival deity on the opposite side of the world from the
    // player. Far enough that the player has to travel to find it but
    // not so far it never appears on the minimap.
    this._spawnEnemyGod(worldData)

    // Minimap
    this.minimap = new Minimap(this, this.worldGrid, params)
    this.villages.forEach(v => this.minimap.addVillageMarker(v))
    this.tablets.forEach(t => {
      const dot = this.minimap.addTabletMarker(t)
      if (dot) t._minimapDot = dot
    })

    // Clean up resources when scene is stopped or restarted
    this.events.once('shutdown', this.shutdown, this)

    // World ready
    this.worldReady = true

    // Ambient sound engine; init requires user gesture so we defer
    // until the first keypress/click which will have already occurred
    // (element selection on creation screen counts).
    this.ambience = new AmbienceEngine()
    this.ambience.init().then(() => {
      this.ambience.setWorld(params)
    })

    // Population HUD tracking
    this._prevTotalPop = 0

    // Sound event tracking for detecting god actions
    this._prevDigTime = 0
    this._prevFlapTime = 0
    this._lastStepSound = 0
    this._prevInLiquid = false

    // Camera FX state
    this.trauma = 0
    this.timeDilation = 1.0
    this.targetTimeDilation = 1.0

    // Erosion timer: slow geological process
    this._lastErosionTime = 0
  }

  // Walk down from a starting tile until we hit solid ground.
  // Used to align entities with the actual surface, not the cached
  // surfaceHeights value which may be stale after late-pass edits.
  snapToGround(grid, x, startY) {
    let y = Math.max(0, startY)
    while (y < WORLD_HEIGHT - 1) {
      const tile = grid[(y + 1) * WORLD_WIDTH + x]
      // Stop just above the first non-air, non-vegetation tile
      if (tile !== 0 && tile !== 16 && tile !== 17 && tile !== 18 && tile !== 19 && tile !== 20) {
        return y + 1
      }
      y++
    }
    return startY
  }

  addTrauma(amount) {
    this.trauma = Math.min(this.trauma + amount, 1.0)
  }

  triggerSlowmo(target = 0.2) {
    this.timeDilation = target
    this.targetTimeDilation = 1.0
  }

  // Single entry point for camera juice. Severity presets keep call
  // sites legible and stop trauma values drifting toward "everything
  // shakes maximum at all times".
  addJuice(severity) {
    const presets = {
      light:  { trauma: 0.22, slowmo: 0.65 },
      medium: { trauma: 0.45, slowmo: 0.45 },
      heavy:  { trauma: 0.7,  slowmo: 0.3 },
      severe: { trauma: 1.0,  slowmo: 0.15 },
    }
    const p = presets[severity] || presets.light
    this.addTrauma(p.trauma)
    this.triggerSlowmo(p.slowmo)
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

    // Tablet counter (small text). Detailed inventory lives in
    // TabletInventory; this line just shows total carry weight.
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

    // God HP gauge: simple text + horizontal bar above the HUD column
    this.hpHUD = this.add.text(pad, pad + 68, 'HP: 100', {
      fontFamily: 'Georgia, serif',
      fontSize: '11px',
      color: '#ff8888',
      stroke: '#000000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(50)
    this.hpBarBack = this.add.rectangle(pad, pad + 84, 80, 4, 0x222222, 0.85)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(50)
    this.hpBarFill = this.add.rectangle(pad, pad + 84, 80, 4, 0xaa3333, 1)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(51)

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
      const level = this.god.collectTablet()
      this.tabletHUD.setText(`Tablets: ${this.god.highestTablet}`)
      if (tablet._minimapDot) tablet._minimapDot.setVisible(false)
      this.showMessage(`Ancient tablet found. It is the level ${level} tablet.`)

      this.hintText.setText('Visit your villages to share this knowledge')
      this.hintText.setAlpha(1)
      this.tweens.killTweensOf(this.hintText)

      this.addJuice('light')
      if (this.ambience) this.ambience.playMagic()

      // Sparkle burst at the pickup location: a small ring of additive
      // motes drifting outward and fading. Pure feedback, no logic.
      this._spawnPickupSparkle(tablet.worldX, tablet.worldY)
    }
  }

  _spawnPickupSparkle(cx, cy) {
    const colours = [0x9affe6, 0xc8fff0, 0xffffff]
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2
      const speed = 30 + Math.random() * 30
      const c = colours[i % colours.length]
      const m = this.add.circle(cx, cy, 1.6 + Math.random() * 1.2, c, 1)
        .setDepth(22)
      // Phaser BlendModes constant is 1 = ADD
      m.setBlendMode(1)
      this.tweens.add({
        targets: m,
        x: cx + Math.cos(angle) * speed,
        y: cy + Math.sin(angle) * speed - 12,
        alpha: 0,
        scale: 0.2,
        duration: 600 + Math.random() * 200,
        ease: 'Quad.easeOut',
        onComplete: () => m.destroy(),
      })
    }
  }

  // Walk-in delivery. Tablets are persistent, so a single visit can
  // chain every upgrade the player's collection allows. The animation
  // staggers each step by ~1s so the village climbs from stage 1 → N
  // with breathing room between rebuilds.
  onVillageProximity(village) {
    if (!village || village.isReceiving) return
    if (village.stage >= 7) return // already maxed

    if (!village.canAccept(this.god.highestTablet)) {
      // Throttle the rejection hint per-village so it doesn't spam every frame
      const now = this.time.now
      if (!village._lastRejectionHint || now - village._lastRejectionHint > 4000) {
        village._lastRejectionHint = now
        if (this.god.highestTablet > 0) {
          const need = village.nextRequiredTablet
          this.showMessage(`${village.name} needs the level ${need} tablet first.`, 1800)
        } else {
          this.showMessage(`${village.name} is waiting for ancient knowledge.`, 1800)
        }
      }
      return
    }

    // Lock village so overlaps during the sequence don't re-trigger
    village.isReceiving = true

    // Determine how many stages we can advance in this single walk-in
    const startStage = village.stage
    const maxStage = Math.min(7, this.god.highestTablet + 1)
    const upgrades = maxStage - startStage
    if (upgrades <= 0) {
      village.isReceiving = false
      return
    }

    // Sequenced upgrades, 1-second beats so each rebuild has air
    for (let i = 0; i < upgrades; i++) {
      this.time.delayedCall(i * 1000, () => {
        const newStage = village.receiveTablet()
        if (newStage != null) {
          if (this.ambience) this.ambience.playGong()
          this.showMessage(`${village.name} reaches stage ${newStage}.`, 900)
        }

        // Final beat: unlock proximity, refresh enlightened count, hint
        if (i === upgrades - 1) {
          village.isReceiving = false

          const advanced = this.villages.filter(v => v.stage > 1).length
          this.villageHUD.setText(`Villages: ${this.villages.length} (${advanced} enlightened)`)

          this.hintText.setText('Spread knowledge to every village')
          this.hintText.setAlpha(1)
          this.time.delayedCall(5000, () => {
            this.tweens.add({ targets: this.hintText, alpha: 0, duration: 2000 })
          })
        }
      })
    }
  }

  update(time, delta) {
    if (!this.worldReady) return

    // Screen Shake & Time Dilation
    const step = delta / 1000
    this.timeDilation += (this.targetTimeDilation - this.timeDilation) * 1.5 * step
    
    // Safety clamp in case of lag spikes
    this.timeDilation = Math.max(0.1, Math.min(1.0, this.timeDilation))
    this.physics.world.timeScale = 1.0 / this.timeDilation
    const dilatedDelta = delta * this.timeDilation

    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - 0.8 * step)
    }

    // God movement
    this.god.update(this.worldGrid, time, dilatedDelta)

    // Horizontal world wrapping
    const worldPixelWidth = WORLD_WIDTH * TILE_SIZE
    let wrapDelta = 0
    if (this.god.sprite.x < 0) {
      wrapDelta = worldPixelWidth
    } else if (this.god.sprite.x >= worldPixelWidth) {
      wrapDelta = -worldPixelWidth
    }
    
    if (wrapDelta !== 0) {
      this.god.sprite.x += wrapDelta
      this.cameras.main.scrollX += wrapDelta
      if (this.parallaxSky) this.parallaxSky.shiftWrap(wrapDelta)
    }

    // Vertical sky ceiling: god can fly up to 30 tiles above the surface
    // (lots of sky to play in) but not beyond. Beyond that, hard clamp +
    // gentle downward nudge to prevent infinite ascension.
    const SKY_CEILING = -30 * TILE_SIZE
    if (this.god.sprite.y < SKY_CEILING) {
      this.god.sprite.y = SKY_CEILING
      if (this.god.sprite.body.velocity.y < 0) {
        this.god.sprite.body.setVelocityY(20)
      }
    }

    // Custom snappy camera follow
    const cam = this.cameras.main
    const targetScrollX = this.god.sprite.x - GAME_WIDTH / 2
    const targetScrollY = this.god.sprite.y - GAME_HEIGHT / 2 + 50
    // Snappy interpolation
    cam.scrollX += (targetScrollX - cam.scrollX) * 0.4
    cam.scrollY += (targetScrollY - cam.scrollY) * 0.4

    // Apply trauma shake visually
    if (this.trauma > 0) {
      const shake = this.trauma * this.trauma
      const shakeScale = 25
      cam.scrollX += (Math.random() - 0.5) * shake * shakeScale
      cam.scrollY += (Math.random() - 0.5) * shake * shakeScale
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

    // Update all village beliefs and populations
    let nearestVillage = null
    let nearestVillageDist = Infinity
    for (const village of this.villages) {
      const dx = this.god.sprite.x - village.worldX
      const dy = this.god.sprite.y - village.worldY
      const dist = Math.sqrt(dx * dx + dy * dy)
      village.updateBelief(dist, dilatedDelta)
      village.updatePopulation(dilatedDelta)
      village.updateVillagers(dilatedDelta)
      // Re-snap buildings to the ground beneath them so terraforming
      // doesn't leave huts hovering in mid-air. Cheap (a few buildings).
      village.updateGrounding()
      if (village.nextRequiredTablet != null && dist < nearestVillageDist) {
        nearestVillageDist = dist
        nearestVillage = village
      }
    }

    // Portal henge: re-snap to ground so it doesn't float after digs
    if (this.portalHenge?.updateGrounding) this.portalHenge.updateGrounding()

    // Biome flora: re-snap decoration sprites to current ground
    if (this.biomeFlora?.update) this.biomeFlora.update()

    // Tablet inventory HUD: highlights the slot the closest village wants
    if (this.tabletInventory) {
      const wanted = nearestVillage ? nearestVillage.nextRequiredTablet : null
      this.tabletInventory.update(this.god.highestTablet, wanted)
    }

    // Bodyguards: dispatch + update + cleanup
    this._updateBodyguards(dilatedDelta)

    // Enemy god roaming + AI
    if (this.enemyGod) this.enemyGod.update(dilatedDelta, this.god.sprite)

    // Spells: tick cooldowns + refresh HUD
    if (this.spellBook) {
      this.spellBook.setUnlockCount(this.god.highestTablet)
      this.spellBook.update(dilatedDelta)
      if (this.spellBar) this.spellBar.update(this.spellBook, this.god)
    }

    // HP HUD
    if (this.hpHUD && this.god) {
      const hp = Math.floor(this.god.hp)
      const max = this.god.maxHp
      this.hpHUD.setText(`HP: ${hp}`)
      this.hpBarFill.width = 80 * Math.max(0, hp / max)
    }

    // Population HUD (only redraw when the number changes)
    const totalPop = this.villages.reduce((sum, v) => sum + Math.floor(v.population), 0)
    if (totalPop !== this._prevTotalPop) {
      this._prevTotalPop = totalPop
      const enlightened = this.villages.filter(v => v.stage > 1).length
      let hudText = `Villages: ${this.villages.length}`
      if (enlightened > 0) hudText += ` (${enlightened} enlightened)`
      hudText += ` · Pop: ${totalPop}`
      this.villageHUD.setText(hudText)
    }

    // Critter AI
    if (this.critters) this.critters.update(dilatedDelta)

    // Ambient particles
    if (this.particles) this.particles.update(dilatedDelta, this.god.sprite, this.dayTime)
    
    // Parallax sky (drives day/night colour shift internally)
    if (this.parallaxSky) this.parallaxSky.update(dilatedDelta, this.dayTime)

    // Active Chunk for Grid Simulator
    const viewPad = 15 // tiles padding outside view
    const activeRect = {
      x: Math.floor(cam.scrollX / TILE_SIZE) - viewPad,
      y: Math.floor(cam.scrollY / TILE_SIZE) - viewPad,
      w: Math.ceil(cam.width / TILE_SIZE) + viewPad * 2,
      h: Math.ceil(cam.height / TILE_SIZE) + viewPad * 2
    }
    if (this.gridSimulator) {
      this.gridSimulator.update(time, dilatedDelta, activeRect)

      // Slow erosion pass: once per second, test a handful of water tiles
      if (time - this._lastErosionTime > 1000) {
        this._lastErosionTime = time
        for (let i = 0; i < 8; i++) {
          const ex = activeRect.x + Math.floor(Math.random() * activeRect.w)
          const ey = activeRect.y + Math.floor(Math.random() * activeRect.h)
          this.gridSimulator.erodeAround(ex, ey)
        }
      }

      this.processGridEvents()
    }

    // Foliage update (wind sway + destroy burned trees)
    if (this.foliageRenderer) this.foliageRenderer.update(dilatedDelta)

    // Tablets: orbiting motes + proximity glow swell + shimmer cue
    if (this.tablets) {
      for (const t of this.tablets) {
        if (t.update) t.update(dilatedDelta, this.god.sprite, this.ambience)
      }
    }

    // Minimap (delta lets it throttle the live texture refresh)
    if (this.minimap) this.minimap.update(this.god.sprite, dilatedDelta)

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
      this.ambience.updateZones(this.worldGrid, tileX, tileY)

      // Birdsong: melodic calls near trees
      this.ambience.updateBirdsong()

      // Cavern drips: stochastic water drops underground
      this.ambience.updateCavernDrips()

      // Critter sounds: panned one-shots from nearby wildlife
      if (this.critters) {
        const camX = this.cameras.main.scrollX + GAME_WIDTH / 2
        const camY = this.cameras.main.scrollY + GAME_HEIGHT / 2
        this.ambience.updateCritters(this.critters.critters, camX, camY)
      }

      // Village proximity: ambient murmur near settlements
      this.ambience.updateVillageProximity(this.villages, this.god.sprite.x, this.god.sprite.y)

      // Villager chatter: animalese babble near settlements
      this.ambience.updateVillagerChatter(this.villages, this.god.sprite.x, this.god.sprite.y)

      // God movement: dig crunch
      if (this.god.lastDigTime !== this._prevDigTime) {
        this._prevDigTime = this.god.lastDigTime
        this.ambience.playDig()
      }
      // God movement: wing flap
      if (this.god.lastFlapTime !== this._prevFlapTime) {
        this._prevFlapTime = this.god.lastFlapTime
        this.ambience.playFlap()
      }
      // God movement: footsteps (throttled to 250ms)
      if (this.god.sprite.body.blocked.down && Math.abs(this.god.sprite.body.velocity.x) > 15) {
        if (time - this._lastStepSound > 250) {
          this._lastStepSound = time
          const stX = ((Math.floor(this.god.sprite.x / TILE_SIZE)) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH
          const stY = Math.floor(this.god.sprite.y / TILE_SIZE)
          let tile = stY >= 0 && stY < WORLD_HEIGHT ? this.worldGrid.grid[stY * WORLD_WIDTH + stX] : 0
          if (tile === 0 && stY + 1 < WORLD_HEIGHT) tile = this.worldGrid.grid[(stY + 1) * WORLD_WIDTH + stX]
          this.ambience.playStep(tile)
        }
      }
      // God movement: splash on entering water + submerge filter
      if (this.god.isInLiquid !== this._prevInLiquid) {
        if (this.god.isInLiquid) this.ambience.playSplash()
        this.ambience.setSubmerged(this.god.isInLiquid)
        this._prevInLiquid = this.god.isInLiquid
      }
    }
  }

  // Process falling-sand events: spawn visual particles and trigger sounds
  processGridEvents() {
    const events = this.gridSimulator.events
    if (events.length === 0) return

    // Throttle: max 6 sound triggers per tick to avoid audio spam
    let soundCount = 0
    const maxSounds = 6

    // Trauma accumulator: each lava-water reaction adds a tiny shake.
    // Capped so a flood doesn't peg the camera at maximum trauma forever.
    let reactionCount = 0

    for (const ev of events) {
      const wx = ev.x * TILE_SIZE + TILE_SIZE / 2
      const wy = ev.y * TILE_SIZE + TILE_SIZE / 2

      switch (ev.type) {
        case 'steam':
          // Rising white puff
          this.spawnGridParticle(wx, wy, 0xcccccc, -20, -40, 800)
          this.spawnGridParticle(wx + 3, wy - 2, 0xdddddd, -15, -35, 700)
          break

        case 'hiss':
          if (soundCount < maxSounds && this.ambience?.initialized) {
            this.ambience.playHiss()
            soundCount++
          }
          reactionCount++
          break

        case 'burn':
          // Orange ember burst upward
          this.spawnGridParticle(wx, wy, 0xff6600, -5, -25, 500)
          this.spawnGridParticle(wx, wy, 0xff3300, 5, -20, 400)
          if (soundCount < maxSounds && this.ambience?.initialized) {
            this.ambience.playBurn()
            soundCount++
          }
          reactionCount++
          break

        case 'erode':
          // Tiny dust puff
          this.spawnGridParticle(wx, wy, 0x998866, 0, -8, 300)
          break

        case 'sand_splash':
          this.spawnGridParticle(wx, wy, 0xc2a64e, -4, -12, 350)
          this.spawnGridParticle(wx, wy, 0xc2a64e, 4, -10, 300)
          break
      }
    }

    // One-shot juice burst for big elemental reactions. Threshold so
    // a single bubble doesn't shake the camera; a real flood does.
    if (reactionCount >= 6) {
      this.addJuice('heavy')
    } else if (reactionCount >= 2) {
      this.addJuice('medium')
    }
  }

  // Lightweight one-shot particle for grid events (no pool; self-destroying)
  spawnGridParticle(x, y, colour, vx, vy, duration) {
    const p = this.add.circle(x, y, 1.5, colour, 0.8).setDepth(11)
    this.tweens.add({
      targets: p,
      x: x + vx * (duration / 1000) + (Math.random() - 0.5) * 6,
      y: y + vy * (duration / 1000),
      alpha: 0,
      scale: 0.3,
      duration,
      onComplete: () => p.destroy(),
    })
  }

  shutdown() {
    if (this.particles) { this.particles.destroy(); this.particles = null }
    if (this.ambience) { this.ambience.destroy(); this.ambience = null }
  }

  // ── Enemy spawn / update ─────────────────────────────
  _spawnEnemyGod(worldData) {
    const farX = (this.god.sprite.x + (WORLD_WIDTH * TILE_SIZE) / 2) % (WORLD_WIDTH * TILE_SIZE)
    const tileX = Math.floor(farX / TILE_SIZE)
    let surfaceY = Math.floor(worldData.surfaceHeights[tileX])
    surfaceY = this.snapToGround(worldData.grid, tileX, surfaceY)
    const px = farX
    const py = surfaceY * TILE_SIZE - 4

    this.enemyGod = new EnemyGod(this, px, py)
    this.physics.add.collider(this.enemyGod.sprite, this.worldLayer)
  }

  // Public hook used by spells (and bodyguards) to damage the rival god.
  damageEnemyGod(amount) {
    if (!this.enemyGod || !this.enemyGod.alive) return
    this.enemyGod.takeDamage(amount)
  }

  // ── Spell input ──────────────────────────────────────
  _wireSpellInput() {
    // Mouse wheel cycles spells, left click casts at the cursor's
    // world position. Pointer events use the camera's world transform
    // so the cast lands where the player actually clicks.
    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      if (!this.spellBook) return
      this.spellBook.cycle(deltaY > 0 ? 1 : -1)
    })

    this.input.on('pointerdown', (pointer) => {
      if (!this.spellBook || pointer.button !== 0) return
      const wp = pointer.positionToCamera(this.cameras.main)
      this.spellBook.cast(this, wp.x, wp.y)
    })

    // Number keys 1/2/3 for direct slot selection — quality of life
    this.input.keyboard.on('keydown-ONE', () => this.spellBook?.cycle(0 - this.spellBook.activeIndex))
    this.input.keyboard.on('keydown-TWO', () => {
      if (!this.spellBook) return
      const list = this.spellBook.unlockedSpells()
      if (list.length >= 2) this.spellBook.activeIndex = 1
    })
    this.input.keyboard.on('keydown-THREE', () => {
      if (!this.spellBook) return
      const list = this.spellBook.unlockedSpells()
      if (list.length >= 3) this.spellBook.activeIndex = 2
    })
  }

  // ── Bodyguard dispatch & update ──────────────────────
  _updateBodyguards(delta) {
    // Drive each bodyguard's seek behaviour
    for (const bg of this.bodyguards) {
      bg.update(delta, this.worldGrid)
    }

    // Periodic dispatch + cull check (every ~1s) so we don't run the
    // O(N*V) loop every frame
    this._bodyguardCheckTimer += delta
    if (this._bodyguardCheckTimer < 1000) return
    this._bodyguardCheckTimer = 0

    this._cullBodyguards()

    // Cap escort size; further dispatches are ignored until a slot opens
    const MAX_BODYGUARDS = 3
    if (this.bodyguards.length >= MAX_BODYGUARDS) return

    // Look for a willing village within proximity range. The closest
    // village whose belief and stage qualify gets to send one unit.
    const range = TILE_SIZE * 18
    let candidate = null
    let candidateDist = Infinity
    for (const v of this.villages) {
      if (!v.canDispatchBodyguards()) continue
      // Already has dispatched a bodyguard? Skip until that one is gone.
      if (this.bodyguards.some(b => b.originVillage === v)) continue
      const dx = this.god.sprite.x - v.worldX
      const dy = this.god.sprite.y - v.worldY
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < range && d < candidateDist) {
        candidate = v
        candidateDist = d
      }
    }
    if (!candidate) return

    // Dispatch from the village position into the next free formation slot
    const usedSlots = new Set(this.bodyguards.map(b => b.slotIndex))
    let slot = 0
    while (usedSlots.has(slot)) slot++

    const bg = new Bodyguard(
      this,
      candidate.worldX,
      candidate.worldY - TILE_SIZE * 2,
      candidate.stage,
      candidate.clothingColour,
      this.god,
      slot,
      candidate
    )
    this.physics.add.collider(bg.sprite, this.worldLayer)
    this.bodyguards.push(bg)
  }

  // Reclaim escorts whose origin village's belief has dropped below the
  // dispatch threshold, or whose origin no longer exists.
  _cullBodyguards() {
    this.bodyguards = this.bodyguards.filter(bg => {
      if (!bg.originVillage || bg.originVillage.belief < 35) {
        bg.destroy()
        return false
      }
      return true
    })
  }

  respawnGod() {
    // Severe juice on death; the player should feel the snap.
    this.addJuice('severe')

    // Black flash overlay for a moment of death; fades back in over
    // ~700ms once the god is back at the home village.
    if (!this._deathFlash) {
      this._deathFlash = this.add.rectangle(
        GAME_WIDTH / 2, GAME_HEIGHT / 2,
        GAME_WIDTH, GAME_HEIGHT,
        0x000000, 0
      ).setScrollFactor(0).setDepth(70)
    }
    this._deathFlash.setAlpha(0.85)
    this.tweens.killTweensOf(this._deathFlash)
    this.tweens.add({
      targets: this._deathFlash,
      alpha: 0,
      duration: 700,
      ease: 'Quad.easeOut',
    })

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
