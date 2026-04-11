import Phaser from 'phaser'
import { WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE, GAME_WIDTH, GAME_HEIGHT, TERRAIN, ELEMENTS, ELEMENT_PAIRS } from '../core/Constants.js'
import { generateWorld, findFlatSurface, findCaveSurface, findTabletLocation } from '../world/WorldGenerator.js'
import { createTilesetTexture, createTilemap, setupCollision, WRAP_PAD } from '../world/WorldRenderer.js'
import { buildPalette } from '../world/TileTypes.js'
import God from '../god/God.js'
import Village from '../civilisation/Village.js'
import Bodyguard from '../civilisation/Bodyguard.js'
import Tablet from '../civilisation/Tablet.js'
import EnemyGod from '../combat/EnemyGod.js'
import WarDirector from '../civilisation/WarDirector.js'
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
import WeatherSystem from '../world/WeatherSystem.js'
import FoliageRenderer from '../world/FoliageRenderer.js'
import TerrainEdges from '../world/TerrainEdges.js'
import MossLayer from '../world/MossLayer.js'
import { pickVariants } from '../world/AssetVariants.js'
import CombatUnit from '../civilisation/CombatUnit.js'
// ParallaxForeground removed: produced ghostly floating silhouettes

// Village and tablet counts scale with the world's footprint so the
// 8x-area planet has enough settlements to feel inhabited and enough
// tablets to reach stage 7 on the home world without raiding. Raid
// worlds override this behaviour separately (no tablets, god statues
// from conquered villages instead).
const VILLAGE_COUNT = 22      // was 4 at 600x300; scales with width + interior
const TABLET_COUNT = 7        // one per home stage (1-7); raids yield 8-10
const VILLAGE_SPACING = 70    // minimum tile distance between villages
const DAY_DURATION = 120000   // 2 minutes per full day/night cycle

// Module-level storage for the home world snapshot. Survives scene
// restarts because it lives outside the scene instance. Cleared when
// the player returns home.
let _homeWorldSnapshot = null

export default class WorldScene extends Phaser.Scene {
  constructor() {
    super({ key: 'World' })
  }

  init(data) {
    this.params = data.params
    // Carry over data for scene restarts (outbound/return transitions)
    this._initGodState = data.godState || null
    this._initWarriorCount = data.warriorCount || 0
    this._initGodStatueInventory = data.godStatueInventory || 0
    this._initRaidVillagesDestroyed = data.raidVillagesDestroyed || 0
  }

  create() {
    const params = this.params

    // Set sky colour
    const palette = buildPalette(params)
    this.baseSkyColour = palette.skyColour
    this.cameras.main.setBackgroundColor(this.baseSkyColour)

    // Loading screen while world generates. World gen is synchronous
    // but heavy; the single-frame defer lets the loading UI paint first.
    const loadContainer = this.add.container(0, 0).setScrollFactor(0).setDepth(100)

    // Dark overlay
    const loadBg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT, 0x0a0b12, 1).setScrollFactor(0)
    loadContainer.add(loadBg)

    // Title
    const loadTitle = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60,
      params.isRaid ? 'Walking between worlds...' : 'Shaping the world...', {
      fontFamily: 'Georgia, serif',
      fontSize: '22px',
      color: '#e4b660',
      stroke: '#3a2a10',
      strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0)
    loadContainer.add(loadTitle)

    // Subtitle with element pair
    const loadSub = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30,
      `${params.element1} + ${params.element2}`, {
      fontFamily: 'Georgia, serif',
      fontSize: '14px',
      color: '#7a8a6a',
      fontStyle: 'italic',
    }).setOrigin(0.5).setScrollFactor(0)
    loadContainer.add(loadSub)

    // Animated spinner: orbiting dots
    const spinnerDots = []
    for (let i = 0; i < 5; i++) {
      const dot = this.add.circle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20,
        2.5 - i * 0.3, 0xe4b660, 0.7 - i * 0.1).setScrollFactor(0)
      loadContainer.add(dot)
      spinnerDots.push(dot)
    }

    // Spin the dots
    this._loadSpinnerTween = this.tweens.addCounter({
      from: 0, to: 360, duration: 1800, repeat: -1,
      onUpdate: (tween) => {
        const base = tween.getValue() * (Math.PI / 180)
        for (let i = 0; i < spinnerDots.length; i++) {
          const a = base + (i / spinnerDots.length) * Math.PI * 2
          spinnerDots[i].x = GAME_WIDTH / 2 + Math.cos(a) * 18
          spinnerDots[i].y = GAME_HEIGHT / 2 + 20 + Math.sin(a) * 18
        }
      },
    })

    this.time.delayedCall(1, () => {
      this.buildWorld(params)
      // Fade out loading screen gracefully
      if (this._loadSpinnerTween) this._loadSpinnerTween.stop()
      this.tweens.add({
        targets: loadContainer,
        alpha: 0,
        duration: 400,
        onComplete: () => loadContainer.destroy(),
      })
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

    // Place the portal henge first so the village placement loop can't
    // saturate the surface and starve the omniverse gateway. The portal
    // is the most important entity on the world and must always exist.
    this.villages = []
    const excludeZones = []
    {
      const portalX = findFlatSurface(worldData.surfaceHeights, 12, rng, excludeZones)
      if (portalX >= 0) {
        let portalY = Math.floor(worldData.surfaceHeights[portalX])
        portalY = this.snapToGround(worldData.grid, portalX, portalY)
        this.portalHenge = new PortalHenge(this, portalX, portalY, params)
        excludeZones.push({ x: portalX, radius: 50 })
      }
    }

    // Place multiple villages with spacing.
    // First 2 on the primary surface; last 2 prefer cave/cliff floors so the
    // world's new verticality is inhabited. Fall back to surface if no cave found.
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

    // Place multiple tablets underground. Each pickup is the next
    // tablet level in the player's collection. Tablets spread across
    // depth bands: the first sits near the surface and the last hides
    // just above the molten core so reaching stage 7 rewards deep
    // exploration and the player earns a proper geological tour.
    this.tablets = []
    for (let i = 0; i < TABLET_COUNT; i++) {
      // Depth band: 0..1 where 0 is just below surface and 1 is core-guard.
      // Tablet 1 lands at ~20% depth; tablet 7 lands at ~95% depth.
      const depthFrac = 0.2 + (i / Math.max(1, TABLET_COUNT - 1)) * 0.75
      const pos = findTabletLocation(worldData.grid, worldData.surfaceHeights, rng, depthFrac)
      const tablet = new Tablet(this, pos.x, pos.y)
      this.tablets.push(tablet)

      // Pickup zone for each tablet
      const zone = this.add.zone(tablet.worldX, tablet.worldY, TILE_SIZE * 3, TILE_SIZE * 3)
      this.physics.add.existing(zone, true)
      this.physics.add.overlap(this.god || { sprite: null }, zone, () => this.onTabletPickup(tablet))
      tablet._zone = zone
    }

    // Portal henge already placed at the top of buildWorld so it can't
    // be starved by village placement.

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

    // Village delivery zones: position at the actual building Y, not the
    // original tile Y, so the trigger area matches where buildings landed
    // after grounding.
    this.villages.forEach(village => {
      const buildingY = village.buildings.length > 0
        ? village.buildings.reduce((s, b) => s + b.y, 0) / village.buildings.length
        : village.worldY
      const zone = this.add.zone(
        village.worldX, buildingY - TILE_SIZE, TILE_SIZE * 8, TILE_SIZE * 5
      )
      this.physics.add.existing(zone, true)
      this.physics.add.overlap(this.god.sprite, zone, () => this.onVillageProximity(village))
      village._zone = zone
    })

    // Custom camera tracking implemented in update loop for seamless wrapping
    this.cameras.main.scrollX = this.god.sprite.x - GAME_WIDTH / 2
    this.cameras.main.scrollY = this.god.sprite.y - GAME_HEIGHT / 2

    // Extend the camera's render area so sprites (trees, flora, critters)
    // materialise well beyond the visible viewport. Prevents pop-in at edges.
    if (this.cameras.main.setRenderPadding) {
      this.cameras.main.setRenderPadding(TILE_SIZE * 20, TILE_SIZE * 20)
    }

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

    // Depth feedback overlay: darkens the viewport as the god descends
    // below the average surface row, using a vertical gradient so the
    // bottom of the screen always feels a little deeper than the top.
    // Alpha is redrawn each frame from the camera's y position.
    this.depthOverlay = this.add.graphics()
      .setScrollFactor(0)
      .setDepth(39) // just under the day/night overlay

    // Average surface row (tiles). Used both by the depth overlay and by
    // the parallax sky's ascend-brightening hook.
    let surfaceSum = 0
    for (let i = 0; i < worldData.surfaceHeights.length; i++) {
      surfaceSum += worldData.surfaceHeights[i]
    }
    this.surfaceRowY = surfaceSum / worldData.surfaceHeights.length

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

    // Weather: drifting clouds, rainfall that replenishes surface water,
    // humidity driven by evaporation events coming out of GridSimulator.
    // The closed loop is the whole point: liquids that evaporate out of
    // exposed bodies come back as rain somewhere else, so the planet
    // never drains into a single puddle at the core.
    this.weather = new WeatherSystem(this, this.worldGrid, params)
    this._lastEvaporationTime = 0

    // Foliage Overlay
    const variants = pickVariants(params.seed || 0)
    this.variants = variants
    this.foliageRenderer = new FoliageRenderer(this, this.worldGrid, palette, variants.treeKey)

    // Terrain edge overlay: soft storybook sprites at surface boundaries
    this.terrainEdges = new TerrainEdges(this, this.worldGrid, palette)

    // Moss layer: a slowly spreading green film on surface tiles.
    this.mossLayer = new MossLayer(this, this.worldGrid, params, worldData.surfaceHeights)

    // HUD container: counter-scales against camera zoom so all UI
    // elements stay at fixed screen positions regardless of zoom level.
    // Children keep their normal screen-space coordinates; the container
    // transform cancels out the camera's zoom pivot.
    this.hudContainer = this.add.container(0, 0)
      .setScrollFactor(0)
      .setDepth(55)

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

    // Move SpellBar and TabletInventory game objects into the HUD
    // container so they get automatic zoom compensation.
    for (const obj of this.spellBar.getAllObjects()) this.hudContainer.add(obj)
    for (const obj of this.tabletInventory.getAllObjects()) this.hudContainer.add(obj)

    // Enemy god is NOT present by default. It only appears when the
    // player activates inbound mode on the portal, or when an enemy
    // world is generated. This keeps the peaceful exploration phase
    // genuinely peaceful and makes portal activation feel consequential.
    this.enemyGod = null

    // War Director: drives the periodic raid wave cycle and dispatches
    // home-village defenders during active raids. See WarDirector.js.
    this.warDirector = new WarDirector(this)

    // Minimap
    this.minimap = new Minimap(this, this.worldGrid, params)
    this.villages.forEach(v => this.minimap.addVillageMarker(v))
    this.tablets.forEach(t => {
      const dot = this.minimap.addTabletMarker(t)
      if (dot) t._minimapDot = dot
    })
    if (this.portalHenge) this.minimap.addPortalMarker(this.portalHenge)

    // Clean up resources when scene is stopped or restarted
    this.events.once('shutdown', this.shutdown, this)

    // World ready
    this.worldReady = true

    // ── Post-build setup for raid worlds and scene restarts ──
    this._applyPostBuildState()

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

    // Camera FX state. The scene owns one camera rig that all juice
    // events push into: trauma-squared shake, lerped time dilation,
    // lerped dynamic zoom, velocity look-ahead, and an impact-frame
    // freeze for epic beats. Pattern lifted from Sky Baby's Camera
    // class in SOAR/js/world.js and fitted onto Phaser's camera.
    this.trauma = 0
    this.timeDilation = 1.0
    this.targetTimeDilation = 1.0
    this.camZoom = 1.15
    this.camZoomTarget = 1.15
    this._lookAheadX = 0
    this._lookAheadY = 0
    this._impactFrameTimer = 0 // ms of frozen-world drama after epic kills
    this._dilationResetTimer = 0

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

  // During impact-frame freezes the game loop skips gameplay updates
  // but the camera still needs to interpolate zoom, settle shake, and
  // ease dilation so the freeze ends gracefully. This tick runs only
  // the camera-side effects without touching any entity.
  _tickCameraOnly(step) {
    // Zoom lerp only
    this.camZoom += (this.camZoomTarget - this.camZoom) * 3.0 * step
    this.cameras.main.setZoom(this.camZoom)
    // Trauma decay so an impact-frame shake still bleeds out
    if (this.trauma > 0) this.trauma = Math.max(0, this.trauma - 0.9 * step)
    if (this.trauma > 0) {
      const cam = this.cameras.main
      const shake = this.trauma * this.trauma
      cam.scrollX += (Math.random() - 0.5) * shake * 28
      cam.scrollY += (Math.random() - 0.5) * shake * 28
    }
  }

  addTrauma(amount) {
    this.trauma = Math.min(this.trauma + amount, 1.0)
  }

  triggerSlowmo(target = 0.2) {
    this.targetTimeDilation = Math.max(0.05, Math.min(1.0, target))
    this._dilationResetTimer = 0
  }

  // Dynamic zoom. Values around 1.0 keep the baseline frame; <1.0 zooms
  // out to reveal more of the world (big spells, earthquakes); >1.0
  // zooms in for focus (epic kills, tablet pickups).
  setCameraZoom(target) {
    this.camZoomTarget = Math.max(0.5, Math.min(1.6, target))
  }

  resetCameraFX() {
    this.targetTimeDilation = 1.0
    this.camZoomTarget = this._playerZoom || 1.15
    this._dilationResetTimer = 0
  }

  // Impact frame: a brief total freeze of entity updates so the player
  // registers an epic moment viscerally. Rendering still happens; only
  // the update loop is short-circuited inside update().
  triggerImpactFrame(ms = 120) {
    this._impactFrameTimer = ms
  }

  // Single entry point for camera juice. Severity presets keep call
  // sites legible and stop trauma values drifting toward "everything
  // shakes maximum at all times". New "epic" preset adds a brief
  // impact-frame freeze and a punch-in zoom for kills and stage unlocks.
  addJuice(severity) {
    const presets = {
      light:  { trauma: 0.22, slowmo: 0.80, zoom: 1.00, impact: 0 },
      medium: { trauma: 0.45, slowmo: 0.55, zoom: 0.95, impact: 0 },
      heavy:  { trauma: 0.70, slowmo: 0.30, zoom: 0.80, impact: 0 },
      severe: { trauma: 1.00, slowmo: 0.15, zoom: 0.70, impact: 0 },
      epic:   { trauma: 0.90, slowmo: 0.10, zoom: 1.18, impact: 140 },
    }
    const p = presets[severity] || presets.light
    this.addTrauma(p.trauma)
    this.triggerSlowmo(p.slowmo)
    this.setCameraZoom(p.zoom)
    if (p.impact > 0) this.triggerImpactFrame(p.impact)
  }

  createHUD(params) {
    const pad = 12
    const c = this.hudContainer

    // Element display
    c.add(this.add.text(pad, pad, `${params.element1} + ${params.element2}`, {
      fontFamily: 'Georgia, serif',
      fontSize: '14px',
      color: '#c07a28',
      stroke: '#000000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(50))

    // Tablet counter (small text). Detailed inventory lives in
    // TabletInventory; this line just shows total carry weight.
    this.tabletHUD = this.add.text(pad, pad + 20, 'Tablets: 0', {
      fontFamily: 'Georgia, serif',
      fontSize: '12px',
      color: '#00ffaa',
      stroke: '#000000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(50)
    c.add(this.tabletHUD)

    // Village count
    this.villageHUD = this.add.text(pad, pad + 36, `Villages: ${this.villages.length}`, {
      fontFamily: 'Georgia, serif',
      fontSize: '12px',
      color: '#daa520',
      stroke: '#000000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(50)
    c.add(this.villageHUD)

    // Day/night indicator
    this.dayNightHUD = this.add.text(pad, pad + 52, '', {
      fontFamily: 'Georgia, serif',
      fontSize: '11px',
      color: '#888888',
      stroke: '#000000',
      strokeThickness: 1,
    }).setScrollFactor(0).setDepth(50)
    c.add(this.dayNightHUD)

    // God HP gauge: simple text + horizontal bar above the HUD column
    this.hpHUD = this.add.text(pad, pad + 68, 'HP: 100', {
      fontFamily: 'Georgia, serif',
      fontSize: '11px',
      color: '#ff8888',
      stroke: '#000000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(50)
    c.add(this.hpHUD)
    this.hpBarBack = this.add.rectangle(pad, pad + 84, 80, 4, 0x222222, 0.85)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(50)
    c.add(this.hpBarBack)
    this.hpBarFill = this.add.rectangle(pad, pad + 84, 80, 4, 0xaa3333, 1)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(51)
    c.add(this.hpBarFill)

    // Hint text
    this.hintText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 30,
      'Explore the world. Dig deep to find ancient tablets.', {
      fontFamily: 'Georgia, serif',
      fontSize: '12px',
      color: '#666666',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(50)
    c.add(this.hintText)

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
    c.add(this.messageText)

    // Coordinates
    this.coordText = this.add.text(GAME_WIDTH - pad, pad, '', {
      fontFamily: 'Georgia, serif',
      fontSize: '10px',
      color: '#444444',
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(50)
    c.add(this.coordText)

    // Depth gauge
    this.depthText = this.add.text(GAME_WIDTH - pad, pad + 14, '', {
      fontFamily: 'Georgia, serif',
      fontSize: '10px',
      color: '#444444',
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(50)
    c.add(this.depthText)
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
      const count = this.god.collectTablet()
      this.tabletHUD.setText(`Tablets: ${this.god.highestTablet}`)
      if (tablet._minimapDot) tablet._minimapDot.setVisible(false)
      this.showMessage(`Ancient tablet found! ${count} collected.`)

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
    if (village.stage >= 20) return // fully ascendant; nothing left to give

    // Cannot deliver knowledge to enemy villages on raid worlds
    if (village.team === 'enemy') return

    if (!village.canAccept(this.god.highestTablet)) {
      // Throttle the rejection hint per-village so it doesn't spam every frame
      const now = this.time.now
      if (!village._lastRejectionHint || now - village._lastRejectionHint > 4000) {
        village._lastRejectionHint = now
        const need = village.nextRequiredTablet
        const have = this.god.highestTablet
        if (have > 0) {
          this.showMessage(`Find more tablets to advance ${village.name}. (${have} of ${need} collected)`, 1800)
        } else {
          this.showMessage(`${village.name} is waiting for ancient knowledge.`, 1800)
        }
      }
      return
    }

    // Lock village so overlaps during the sequence don't re-trigger
    village.isReceiving = true

    // Determine how many stages we can advance in this single walk-in.
    // A village at stage N needs highestTablet >= N+1 to advance to N+1.
    // So the maximum reachable stage equals the god's tablet count.
    const startStage = village.stage
    const maxStage = Math.min(20, this.god.highestTablet)
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
          // Stage advancement deserves a camera beat. Medium for
          // ordinary upgrades, heavy for stage 7 (home cap), epic for
          // stages 8-10 which can only be reached by carrying god
          // statues back from a raid. A proud village standing up
          // gets the same punch as a midsized spell.
          const severity = newStage >= 8 ? 'epic' : newStage >= 7 ? 'heavy' : 'medium'
          this.addJuice(severity)
        }

        // Final beat: unlock proximity after a grace period so the
        // overlap doesn't immediately fire a rejection while the god
        // is still standing in the zone.
        if (i === upgrades - 1) {
          this.time.delayedCall(2000, () => { village.isReceiving = false })

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

    // Real-time step (never dilated). The camera rig always ticks in
    // real time so shake, zoom, and dilation interpolation feel
    // consistent regardless of game-world dilation.
    const step = delta / 1000

    // Impact frame: if a juice call requested a freeze, short-circuit
    // every gameplay update for a handful of ms. The camera and zoom
    // still tick underneath so the freeze reads as a punch, not a crash.
    if (this._impactFrameTimer > 0) {
      this._impactFrameTimer -= delta
      // Still render at whatever the camera's current state shows
      this._tickCameraOnly(step)
      return
    }

    // Time dilation lerp: use real step so the blend speed is independent
    // of the dilated delta the rest of the scene is using.
    this.timeDilation += (this.targetTimeDilation - this.timeDilation) * 4.0 * step
    this.timeDilation = Math.max(0.05, Math.min(1.0, this.timeDilation))
    this.physics.world.timeScale = 1.0 / Math.max(0.05, this.timeDilation)
    const dilatedDelta = delta * this.timeDilation

    // Zoom lerp
    this.camZoom += (this.camZoomTarget - this.camZoom) * 3.0 * step
    if (Math.abs(this.camZoom - 1.0) > 0.002 ||
        Math.abs(this.cameras.main.zoom - this.camZoom) > 0.002) {
      this.cameras.main.setZoom(this.camZoom)
    }

    // Trauma decays each real frame so the shake settles even during
    // dilated time. Squared for exponential ease.
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - 0.9 * step)
    }

    // Gradually release any active slowmo / zoom targets: 0.6 s after
    // the last juice call, drift back to defaults. Earlier values used
    // 0.8 s; shorter feels snappier with the new richer presets.
    if (this.targetTimeDilation < 1.0 || this.camZoomTarget !== 1.0) {
      this._dilationResetTimer += step
      if (this._dilationResetTimer > 0.6) {
        this.targetTimeDilation = 1.0
        this.camZoomTarget = this._playerZoom || 1.15
        this._dilationResetTimer = 0
      }
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

    // Look-ahead: camera leads the god slightly in their direction of
    // motion so fast traversal gets more warning of what's ahead. Lerped
    // so direction reversals feel organic, not snappy.
    const godVx = this.god.sprite.body?.velocity?.x || 0
    const godVy = this.god.sprite.body?.velocity?.y || 0
    this._lookAheadX += (godVx * 0.18 - this._lookAheadX) * 2.2 * step
    this._lookAheadY += (godVy * 0.10 - this._lookAheadY) * 2.2 * step

    // Camera follow: Phaser 3 applies zoom around the viewport centre
    // independently of scroll, so scroll is always godPos - half-viewport
    // regardless of zoom level.
    const cam = this.cameras.main
    const targetScrollX = this.god.sprite.x + this._lookAheadX - GAME_WIDTH / 2
    const targetScrollY = this.god.sprite.y + this._lookAheadY - GAME_HEIGHT / 2 + 50
    // Snappy interpolation
    cam.scrollX += (targetScrollX - cam.scrollX) * 0.4
    cam.scrollY += (targetScrollY - cam.scrollY) * 0.4

    // Apply trauma shake visually. Trauma-squared gives the exponential
    // feel of a Sky Baby / Vlambeer-style punch.
    if (this.trauma > 0) {
      const shake = this.trauma * this.trauma
      const shakeScale = 28
      cam.scrollX += (Math.random() - 0.5) * shake * shakeScale
      cam.scrollY += (Math.random() - 0.5) * shake * shakeScale
    }

    // HUD zoom compensation: the container counter-scales against camera
    // zoom so every child stays at its intended screen position and size.
    const invZoom = 1 / (cam.zoom || 1)
    const midX = GAME_WIDTH / 2
    const midY = GAME_HEIGHT / 2
    this.hudContainer.setScale(invZoom)
    this.hudContainer.x = midX * (1 - invZoom)
    this.hudContainer.y = midY * (1 - invZoom)

    // Kill plane
    if (this.god.sprite.y > WORLD_HEIGHT * TILE_SIZE) {
      this.respawnGod()
    }

    // Day/night cycle
    this.dayTime = (time % DAY_DURATION) / DAY_DURATION
    const nightIntensity = Math.max(0, Math.sin(this.dayTime * Math.PI * 2 - Math.PI / 2)) * 0.4
    this.dayNightOverlay.setAlpha(nightIntensity)
    this.dayNightOverlay.setScale(invZoom)

    // Full-screen overlays created lazily also need zoom compensation
    if (this._deathFlash) this._deathFlash.setScale(invZoom)
    if (this._planeOverlay) this._planeOverlay.setScale(invZoom)

    // Depth feedback overlay. Compares camera midline against the world's
    // average surface y; at surface the overlay is invisible, at the edge
    // of the molten core it sits around 0.65 alpha with a vertical gradient
    // so the bottom of the screen always reads slightly darker than the top.
    if (this.depthOverlay) {
      this.depthOverlay.setScale(invZoom)
      this.depthOverlay.x = midX * (1 - invZoom)
      this.depthOverlay.y = midY * (1 - invZoom)

      const surfacePx = (this.surfaceRowY || 40) * TILE_SIZE
      const coreTopPx = (WORLD_HEIGHT - TERRAIN.BEDROCK_DEPTH - TERRAIN.CORE_DEPTH) * TILE_SIZE
      const camMid = this.cameras.main.scrollY + GAME_HEIGHT / 2
      const span = Math.max(1, coreTopPx - surfacePx)
      const depthT = Math.max(0, Math.min(1, (camMid - surfacePx) / span))
      // Ease the ramp so the first few tiles below surface feel gentle
      // and only the deeps get properly heavy.
      const eased = depthT * depthT
      const baseAlpha = eased * 0.65

      this.depthOverlay.clear()
      if (baseAlpha > 0.005) {
        // Per-corner gradient: top of screen lighter, bottom heavier.
        // Colours lean cool indigo so the effect reads as gloom, not haze.
        this.depthOverlay.fillGradientStyle(
          0x06091e, 0x06091e, 0x000000, 0x000000,
          baseAlpha * 0.45,
          baseAlpha * 0.45,
          baseAlpha * 1.0,
          baseAlpha * 1.0,
        )
        this.depthOverlay.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
      }
    }

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
      village.updateGrounding()

      // Sync the interaction zone with the village's current position.
      // Buildings fall via updateGrounding; the zone must follow so the
      // player can always reach the trigger spot near the actual houses.
      if (village._zone && village.buildings.length > 0) {
        const avgY = village.buildings.reduce((s, b) => s + b.y, 0) / village.buildings.length
        const newZoneY = avgY - TILE_SIZE
        if (Math.abs(village._zone.y - newZoneY) > 2) {
          village._zone.y = newZoneY
          village._zone.body.updateFromGameObject()
        }
        // Keep label and belief bar near the buildings too
        if (village.label) village.label.y = avgY - TILE_SIZE * 10
        if (village.beliefBar) {
          village.beliefBar.clear()
          const px = village.worldX
          const py = avgY - TILE_SIZE * 10 - 6
          const barWidth = 24
          const barHeight = 3
          village.beliefBar.fillStyle(0x333333, 0.8)
          village.beliefBar.fillRect(px - barWidth / 2, py, barWidth, barHeight)
          const fillWidth = (village.belief / 100) * barWidth
          const colour = village.belief > 60 ? 0x44aa44 : village.belief > 30 ? 0xaaaa44 : 0xaa4444
          village.beliefBar.fillStyle(colour, 1)
          village.beliefBar.fillRect(px - barWidth / 2, py, fillWidth, barHeight)
        }
      }

      // Raid world: track village destruction (pop <= 0 and enemy team)
      if (this.params?.isRaid && village.team === 'enemy' && !village._destroyed) {
        if (village.population <= 0) {
          village._destroyed = true
          this._onEnemyVillageDestroyed(village)
        }
      }

      if (village.nextRequiredTablet != null && dist < nearestVillageDist) {
        nearestVillageDist = dist
        nearestVillage = village
      }
    }

    // Portal henge: re-snap to ground so it doesn't float after digs,
    // and check for player interaction
    if (this.portalHenge?.updateGrounding) this.portalHenge.updateGrounding()
    if (this.portalHenge?.updateInteraction) this.portalHenge.updateInteraction(time, this.god.sprite)

    // Portal key handling: while the prompt is up, the player picks a
    // direction. JustDown so a held key only fires once.
    if (this._activePortal && this._portalKeys) {
      const Phaser = window.Phaser || this.scene.systems.game.Phaser
      const keyJustDown = (key) => {
        if (!key) return false
        // Phaser.Input.Keyboard.JustDown is the canonical helper; we
        // import it from the existing imports at the top of the file.
        return this.input.keyboard.checkDown(key, 0) && !key._wasDown
      }
      // Manual edge-trigger so we don't need to import JustDown again
      for (const k of Object.values(this._portalKeys)) {
        const down = k.isDown
        if (down && !k._handledDown) {
          k._handledDown = true
          if (k === this._portalKeys.i && !this.params?.isRaid) {
            this._beginPortalInbound(this._activePortal)
          } else if (k === this._portalKeys.o && !this.params?.isRaid) {
            this._beginPortalOutbound(this._activePortal)
          } else if (k === this._portalKeys.r && this.params?.isRaid) {
            this._beginPortalReturn(this._activePortal)
          }
        } else if (!down) {
          k._handledDown = false
        }
      }
    }

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

    // War Director: raid cycle, combat unit ticking, arrow hit resolution
    if (this.warDirector) this.warDirector.update(dilatedDelta)

    // God touch-kills: walking into enemy units obliterates them.
    // A god is a god; mere mortals cannot withstand contact.
    if (this.warDirector?.units && this.god?.sprite) {
      const gx = this.god.sprite.x
      const gy = this.god.sprite.y - 10
      const touchR = 18
      for (const u of this.warDirector.units) {
        if (!u.alive || u.team === 'home') continue
        const dx = u.sprite.x - gx
        const dy = u.sprite.y - gy
        if (dx * dx + dy * dy < touchR * touchR) {
          u.takeDamage(9999, null) // instant kill
        }
      }
    }
    // Enemy god also touch-kills home units it walks through
    if (this.enemyGod?.alive && this.enemyGod.sprite && this.warDirector?.units) {
      const ex = this.enemyGod.sprite.x
      const ey = this.enemyGod.sprite.y - 10
      const touchR = 18
      for (const u of this.warDirector.units) {
        if (!u.alive || u.team === 'enemy') continue
        const dx = u.sprite.x - ex
        const dy = u.sprite.y - ey
        if (dx * dx + dy * dy < touchR * touchR) {
          u.takeDamage(9999, null)
        }
      }
    }

    // Tick active fireballs spawned by the elemental burst spell. Lives
    // outside the WarDirector because spells aren't combat units; they
    // are short-lived projectiles that need their own collision and AOE
    // resolution. See ElementalBurstSpell._castFire.
    if (this._activeFireballs?.length) this._tickFireballs(dilatedDelta)

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

      // Evaporation pass: once every 900 ms, walk a dozen random water
      // tiles in the active chunk and evaporate any exposed to open sky.
      // Each event bumps the weather system's humidity, which feeds the
      // rain rate, closing the water cycle. The evaporation events are
      // also passed to processGridEvents via the shared events queue.
      if (time - this._lastEvaporationTime > 900) {
        this._lastEvaporationTime = time
        this.gridSimulator.evaporateInChunk(activeRect, 12)
      }

      // Weather ingests any vapour events the simulator emitted this tick
      // (both from evaporateInChunk and from natural lava-water reactions)
      if (this.weather) this.weather.ingestGridEvents(this.gridSimulator.events)

      this.processGridEvents()
    }

    // Drift clouds and fall rain drops. Pass the real camera so clouds
    // only spawn drops near the player's viewport.
    if (this.weather) {
      this.weather.update(dilatedDelta, this.cameras.main)
    }

    // Foliage update (wind sway + destroy burned trees)
    if (this.foliageRenderer) this.foliageRenderer.update(dilatedDelta)

    // Terrain edge overlay: soft sprites at terrain boundaries
    if (this.terrainEdges) this.terrainEdges.update(dilatedDelta, this.cameras.main)

    // Moss layer: slow spread tick + per-frame overlay redraw (cheap,
    // culled to visible tile range).
    if (this.mossLayer) this.mossLayer.update(dilatedDelta)

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

        case 'vapour':
          // Slow evaporation puff. Lighter and slower than the lava-water
          // hiss so the player can tell the two reactions apart.
          this.spawnGridParticle(wx, wy, 0xe8f0ff, -4, -18, 1200)
          this.spawnGridParticle(wx + 2, wy - 1, 0xffffff, 4, -20, 1000)
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
    if (this.mossLayer) { this.mossLayer.destroy(); this.mossLayer = null }
    if (this.weather) { this.weather.shutdown(); this.weather = null }
    if (this.warDirector) { this.warDirector.shutdown(); this.warDirector = null }
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

  // ── Portal interaction ──────────────────────────────
  // The PortalHenge class calls these scene hooks when the god
  // approaches or leaves the henge. The prompt is a single floating
  // text box centred on the screen with two key reminders.

  _showPortalPrompt(portal) {
    if (this._portalPromptUI) return
    const ui = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60)
      .setScrollFactor(0)
      .setDepth(80)
    const back = this.add.rectangle(0, 0, 360, 110, 0x05060e, 0.85)
      .setStrokeStyle(2, 0x88aacc, 0.9)
    const title = this.add.text(0, -36, 'Portal Henge', {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#9affe6',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5)
    const sub = this.params?.isRaid
      ? '[ R ] Return home'
      : '[ I ] Inbound  /  [ O ] Outbound'
    const body = this.add.text(0, -8, sub, {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#cfd8e0',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5)
    const hint = this.add.text(0, 22, this.params?.isRaid
      ? 'The home stones call to you'
      : 'Inbound: an enemy god strikes through. Outbound: you raid theirs.', {
      fontFamily: 'Georgia, serif', fontSize: '10px', color: '#7a8a99',
      stroke: '#000000', strokeThickness: 2,
      wordWrap: { width: 320 },
    }).setOrigin(0.5)
    ui.add([back, title, body, hint])
    this._portalPromptUI = ui
    this._activePortal = portal

    // Wire one-shot keys: I, O for home; R for raid
    if (!this._portalKeys) {
      this._portalKeys = {
        i: this.input.keyboard.addKey('I'),
        o: this.input.keyboard.addKey('O'),
        r: this.input.keyboard.addKey('R'),
      }
    }
  }

  _hidePortalPrompt() {
    if (this._portalPromptUI) {
      this._portalPromptUI.destroy()
      this._portalPromptUI = null
    }
    this._activePortal = null
  }

  // Inbound: a rival god materialises at the portal with an army of
  // raid-tier combat units. The WarDirector hands the war to the player.
  // Resolves when the rival god dies or the timer runs out (~120 s).
  _beginPortalInbound(portal) {
    // Block portal use if an invasion is already active
    if (this.enemyGod?.alive) {
      this.showMessage('Defeat the invading god before using the portal!', 2000)
      return
    }
    this._hidePortalPrompt()
    portal.state = 'ACTIVE_INBOUND'
    if (this.addJuice) this.addJuice('severe')
    if (this.showMessage) this.showMessage('A god strides through the portal!', 2200)

    // First inbound activates the automatic raid cycle going forward
    if (this.warDirector) this.warDirector.enableRaidCycle()

    // Spawn a randomly generated enemy god at the portal
    const portalX = portal.worldX
    const portalY = portal.worldY
    const enemySeed = Math.floor(Math.random() * 999999)
    this.enemyGod = new EnemyGod(this, portalX, portalY - 20, enemySeed)
    this.physics.add.collider(this.enemyGod.sprite, this.worldLayer)

    // Spawn a raid wave entering from the portal
    if (this.warDirector) {
      this.warDirector.launchInvasion(80, this.villages[0])
      let placed = 0
      for (const u of this.warDirector.units) {
        if (u.team === 'enemy' && placed < 18) {
          u.sprite.x = portalX + (Math.random() - 0.5) * 80
          u.sprite.y = portalY - 30
          u.sprite.body?.setVelocity(0, 0)
          placed++
        }
      }
    }

    // Track the inbound battle: when enemy god dies, reset portal
    this._inboundPortal = portal
    this._inboundCheckTimer = this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        if (!this.enemyGod?.alive) {
          portal.endSortie()
          this._inboundCheckTimer?.destroy()
          this._inboundCheckTimer = null
          this._inboundPortal = null
          // Reward: defeating an invading god yields a knowledge tablet
          this.god.highestTablet += 1
          this.tabletHUD?.setText(`Tablets: ${this.god.highestTablet}`)
          this.showMessage(`The invader is vanquished! Knowledge tablet gained. (${this.god.highestTablet} total)`, 2800)
          if (this.ambience?.playGong) this.ambience.playGong()
        }
      },
    })

    // Hard timeout: auto-end after 120s
    this.time.delayedCall(120000, () => {
      if (portal.state === 'ACTIVE_INBOUND') {
        portal.endSortie()
        this._inboundCheckTimer?.destroy()
        this._inboundCheckTimer = null
        this._inboundPortal = null
      }
    })
  }

  // Outbound: travel to a freshly seeded raid world. The current world
  // is frozen in memory and an entirely new world is generated.
  _beginPortalOutbound(portal) {
    // Block if invasion is active
    if (this.enemyGod?.alive) {
      this.showMessage('Defeat the invading god before using the portal!', 2000)
      return
    }
    this._hidePortalPrompt()
    portal.state = 'ACTIVE_OUTBOUND'
    if (this.addJuice) this.addJuice('epic')
    this._planeWalkTransition(() => this._performWorldSwap('outbound'))
  }

  // Return: come back home from a raid. Restores the saved home world
  // state and credits any god statues earned to the god's tablet count.
  _beginPortalReturn(portal) {
    this._hidePortalPrompt()
    portal.state = 'ACTIVE_OUTBOUND'
    if (this.addJuice) this.addJuice('epic')
    this._planeWalkTransition(() => this._performWorldSwap('return'))
  }

  // Plane-walking transition. A black overlay sweeps in over ~1.4 s,
  // the swap callback fires, and the overlay sweeps back out for a
  // total of ~3.6 s. Sub-4-second budget per the brief.
  _planeWalkTransition(midCallback) {
    if (!this._planeOverlay) {
      this._planeOverlay = this.add.rectangle(
        GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT,
        0x000000, 0,
      ).setScrollFactor(0).setDepth(95)
    }
    const ov = this._planeOverlay
    ov.alpha = 0
    this.tweens.add({
      targets: ov, alpha: 1, duration: 1400, ease: 'Quad.easeIn',
      onComplete: () => {
        try { midCallback?.() } catch (e) { console.error('plane walk callback failed', e) }
        // Spawn rune motes for thematic flavour
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2
          const m = this.add.circle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 3, 0x9affe6, 0.9)
            .setScrollFactor(0).setDepth(96).setBlendMode(Phaser.BlendModes.ADD)
          this.tweens.add({
            targets: m,
            x: GAME_WIDTH / 2 + Math.cos(a) * 220,
            y: GAME_HEIGHT / 2 + Math.sin(a) * 140,
            alpha: 0,
            duration: 1200,
            onComplete: () => m.destroy(),
          })
        }
        this.tweens.add({
          targets: ov, alpha: 0, duration: 1600, delay: 200, ease: 'Quad.easeOut',
        })
      },
    })
  }

  // Full world swap via scene restart. Phaser cleanly tears down and
  // rebuilds the scene, avoiding the frozen-update-loop bug that occurs
  // when destroying core scene objects mid-tween-callback.
  _performWorldSwap(direction) {
    if (direction === 'outbound') {
      this._performOutbound()
    } else if (direction === 'return') {
      this._performReturn()
    }
  }

  _performOutbound() {
    // Snapshot home world into the module-level variable
    _homeWorldSnapshot = {
      params: { ...this.params },
      godHp: this.god.hp,
      godMana: this.god.mana,
      godHighestTablet: this.god.highestTablet,
    }

    // Count warriors to bring along
    const warriorCount = this.bodyguards.length +
      (this.warDirector?.units?.filter(u => u.team === 'home' && u.alive)?.length || 0)

    // Build raid params
    const raidSeed = Math.floor(Math.random() * 999999)
    const pair = ELEMENT_PAIRS[raidSeed % ELEMENT_PAIRS.length]
    const raidParams = {
      seed: raidSeed,
      element1: pair[0],
      element2: pair[1],
      elementRatio: 3 + (raidSeed % 5),
      skyCave: 0.3 + Math.random() * 0.4,
      barrenFertile: 0.4 + Math.random() * 0.3,
      sparseDense: 0.3 + Math.random() * 0.4,
      isRaid: true,
      // Carry the player's god appearance into the raid world
      godHead: this.params.godHead,
      godBody: this.params.godBody,
      godLegs: this.params.godLegs,
    }

    // Restart the scene with raid params; Phaser handles full teardown
    this.scene.restart({
      params: raidParams,
      godState: {
        hp: this.god.hp,
        mana: this.god.mana,
        highestTablet: this.god.highestTablet,
      },
      warriorCount: Math.max(6, warriorCount),
    })
  }

  _performReturn() {
    if (!_homeWorldSnapshot) return

    const snap = _homeWorldSnapshot
    const godStatues = this._godStatueInventory || 0

    // Restart scene with home params; snapshot is read in _applyPostBuildState
    this.scene.restart({
      params: { ...snap.params, isRaid: false },
      godState: {
        hp: snap.godHp,
        mana: snap.godMana,
        highestTablet: snap.godHighestTablet + godStatues,
      },
      godStatueInventory: godStatues,
    })
  }

  // Called after buildWorld finishes. Configures raid-world villages,
  // spawns warriors, restores god state from scene restart data.
  _applyPostBuildState() {
    const godState = this._initGodState
    if (godState) {
      this.god.hp = godState.hp
      this.god.mana = godState.mana
      this.god.highestTablet = godState.highestTablet
      this.tabletHUD?.setText(`Tablets: ${this.god.highestTablet}`)
    }

    if (this.params?.isRaid) {
      // ── Raid world setup ──
      // Advance enemy villages to random stages with high population
      for (const v of this.villages) {
        v.team = 'enemy'
        const advStage = 3 + Math.floor(Math.random() * 5)
        for (let s = v.stage; s < advStage; s++) v.receiveTablet()
        v.population = 500 + Math.floor(Math.random() * 501)
        v.belief = 60 + Math.random() * 30
      }

      // Spawn enemy god at a random village
      const enemySeed = Math.floor(Math.random() * 999999)
      const spawnVillage = this.villages[Math.floor(Math.random() * this.villages.length)]
      if (spawnVillage) {
        this.enemyGod = new EnemyGod(this, spawnVillage.worldX, spawnVillage.worldY - 30, enemySeed)
        this.physics.add.collider(this.enemyGod.sprite, this.worldLayer)
      }

      // Place god at the portal henge (entry point)
      if (this.portalHenge) {
        this.god.sprite.x = this.portalHenge.worldX
        this.god.sprite.y = this.portalHenge.worldY - TILE_SIZE * 3
        this.god.sprite.body.setVelocity(0, 0)
      }

      // Spawn the player's warriors at the portal
      const count = this._initWarriorCount || 6
      if (this.warDirector && this.portalHenge) {
        const px = this.portalHenge.worldX
        const py = this.portalHenge.worldY
        for (let i = 0; i < count; i++) {
          const ox = px + (Math.random() - 0.5) * 120
          const oy = py - 20 - Math.random() * 20
          const stage = Math.min(7, Math.max(3, this.god.highestTablet))
          const unit = new CombatUnit(this, ox, oy, stage, 'home', null, 0x66ddaa)
          unit.role = 'raider'
          this.warDirector.units.push(unit)
          if (this.worldLayer && !unit._hasCollider) {
            unit._hasCollider = true
            this.physics.add.collider(unit.sprite, this.worldLayer)
          }
        }
      }

      // Tracking for god statue progression
      this._raidVillagesDestroyed = this._initRaidVillagesDestroyed || 0
      this._godStatueInventory = this._initGodStatueInventory || 0

      // Activate combat immediately on raid worlds; the war is already happening
      if (this.warDirector) {
        this.warDirector.enableRaidCycle()
        this.warDirector.state = 'RAID'
        this.warDirector.stateTimer = 30000
      }

      this.showMessage('You walk between worlds...', 2400)
    } else if (_homeWorldSnapshot && godState) {
      // ── Returning home ──
      const earned = this._initGodStatueInventory || 0
      if (earned > 0) {
        this.showMessage(`${earned} god statue${earned > 1 ? 's' : ''} carried home!`, 2800)
      } else {
        this.showMessage('You return to your world.', 2200)
      }

      // Place god at the portal
      if (this.portalHenge) {
        this.god.sprite.x = this.portalHenge.worldX
        this.god.sprite.y = this.portalHenge.worldY - TILE_SIZE * 3
        this.god.sprite.body.setVelocity(0, 0)
      }

      _homeWorldSnapshot = null
    }
  }

  // God statues: in raid worlds, destroying 3 villages yields one.
  _onEnemyVillageDestroyed(village) {
    if (!this.params?.isRaid) return
    this._raidVillagesDestroyed = (this._raidVillagesDestroyed || 0) + 1
    if (this._raidVillagesDestroyed % 3 === 0) {
      this._godStatueInventory = (this._godStatueInventory || 0) + 1
      this.showMessage(`God statue earned! (${this._godStatueInventory} total)`, 2200)
      this.addJuice('epic')
      if (this.ambience?.playGong) this.ambience.playGong()
    } else {
      const remaining = 3 - (this._raidVillagesDestroyed % 3)
      this.showMessage(`Enemy village falls. ${remaining} more for a god statue.`, 1800)
      this.addJuice('heavy')
    }
  }

  // Frame tick for fireballs spawned by the burst spell. Each fireball
  // is a small object holding two display sprites (the bright core and
  // its glow halo), a velocity, and the radius/damage to apply on
  // impact. The function steps each one, samples the world grid for
  // terrain hits, and resolves the AOE on detonation.
  _tickFireballs(delta) {
    const dt = delta / 1000
    const list = this._activeFireballs
    for (let i = list.length - 1; i >= 0; i--) {
      const fb = list[i]
      fb.life -= dt
      fb.ball.x += fb.vx * dt
      fb.ball.y += fb.vy * dt
      fb.glow.x = fb.ball.x
      fb.glow.y = fb.ball.y

      // Trail mote
      const trail = this.add.circle(
        fb.ball.x + (Math.random() - 0.5) * 8,
        fb.ball.y + (Math.random() - 0.5) * 8,
        3, 0xff5522, 0.7,
      ).setDepth(19).setBlendMode(Phaser.BlendModes.ADD)
      this.tweens.add({ targets: trail, alpha: 0, scale: 0.2, duration: 380, onComplete: () => trail.destroy() })

      // Tile collision (skipped during grace period so the spawn cell
      // can't immediately blow the fireball up if the god is leaning
      // against a wall or standing on a surface tile)
      let exploded = fb.life <= 0
      if (fb.gracePeriod > 0) fb.gracePeriod -= delta
      const grid = this.worldGrid?.grid
      if (grid && !exploded && fb.gracePeriod <= 0) {
        const tx = Math.floor(fb.ball.x / TILE_SIZE)
        const ty = Math.floor(fb.ball.y / TILE_SIZE)
        if (tx >= 0 && tx < WORLD_WIDTH && ty >= 0 && ty < WORLD_HEIGHT) {
          const tile = grid[ty * WORLD_WIDTH + tx]
          // Solid (non air, non vegetation, non liquid) triggers a hit
          if (tile !== 0 && tile !== 16 && tile !== 17 && tile !== 18 && tile !== 19 && tile !== 20) {
            if (tile !== 5 && tile !== 13 && tile !== 6) exploded = true
          }
        }
      }

      // Direct unit hit (bypass radius check for early detonation)
      if (!exploded && this.warDirector?.units) {
        for (const u of this.warDirector.units) {
          if (!u.alive || u.team === fb.team) continue
          const dx = u.sprite.x - fb.ball.x
          const dy = u.sprite.y - fb.ball.y
          if (dx * dx + dy * dy < 200) { exploded = true; break }
        }
      }

      if (exploded) {
        // Detonation ring
        const ring = this.add.circle(fb.ball.x, fb.ball.y, 8, 0xffcc66, 0.7)
          .setDepth(20)
          .setBlendMode(Phaser.BlendModes.ADD)
        this.tweens.add({
          targets: ring,
          radius: fb.radius,
          alpha: 0,
          duration: 450,
          onComplete: () => ring.destroy(),
        })
        // AOE damage to enemy combat units
        if (this.warDirector?.units) {
          for (const u of this.warDirector.units) {
            if (!u.alive || u.team === fb.team) continue
            const dx = u.sprite.x - fb.ball.x
            const dy = u.sprite.y - fb.ball.y
            if (dx * dx + dy * dy < fb.radius * fb.radius) {
              u.takeDamage(fb.damage)
            }
          }
        }
        // Damage rival god in range too
        if (this.enemyGod?.alive && this.enemyGod.sprite) {
          const dx = this.enemyGod.sprite.x - fb.ball.x
          const dy = this.enemyGod.sprite.y - fb.ball.y
          if (dx * dx + dy * dy < fb.radius * fb.radius) {
            this.damageEnemyGod(fb.damage * 1.5)
          }
        }
        // Devastate enemy villages caught in the blast
        if (this.villages) {
          for (const v of this.villages) {
            if (v.team !== 'enemy' || v._destroyed) continue
            const vdx = v.worldX - fb.ball.x
            const vdy = v.worldY - fb.ball.y
            if (vdx * vdx + vdy * vdy < fb.radius * fb.radius * 1.5) {
              v.population = Math.max(0, v.population - 200)
              v.belief = Math.max(0, v.belief - 30)
            }
          }
        }
        if (this.addJuice) this.addJuice('heavy')
        fb.ball.destroy()
        fb.glow.destroy()
        list.splice(i, 1)
      }
    }
  }

  // ── Spell input ──────────────────────────────────────
  _wireSpellInput() {
    // Mouse wheel controls camera zoom (god's-eye view ↔ close-up).
    // Spells are selected via number keys 1/2/3 only.
    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      const step = deltaY > 0 ? -0.08 : 0.08
      this._playerZoom = Math.max(0.35, Math.min(2.5, (this._playerZoom || 1.15) + step))
      this.camZoomTarget = this._playerZoom
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
    // Gods only resurrect if they still have living followers in this world.
    // Zero believers across all home villages = permanent god death.
    const homeVillages = this.villages.filter(v => v.team === 'home' || !v.team)
    const totalFollowers = homeVillages.reduce((sum, v) => sum + Math.floor(v.population), 0)
    if (totalFollowers <= 0) {
      this.addJuice('severe')
      this.showMessage('Your followers are gone. The god fades into silence.', 5000)
      // On raid worlds, return home with whatever statues were earned
      if (this.params?.isRaid && this.portalHenge) {
        this.time.delayedCall(3000, () => {
          this._beginPortalReturn(this.portalHenge)
        })
      }
      // On home world, this is game over; return to creation screen
      if (!this.params?.isRaid) {
        this.time.delayedCall(4000, () => {
          this.scene.start('Creation')
        })
      }
      return
    }

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

    // Respawn at the nearest living home village
    let bestVillage = null
    let bestPop = 0
    for (const v of homeVillages) {
      if (v.population > bestPop) { bestPop = v.population; bestVillage = v }
    }
    if (bestVillage) {
      this.god.sprite.x = bestVillage.worldX
      this.god.sprite.y = bestVillage.worldY - TILE_SIZE * 5
    } else {
      this.god.sprite.x = WORLD_WIDTH * TILE_SIZE / 2
      this.god.sprite.y = TILE_SIZE * 10
    }
    this.god.sprite.body.setVelocity(0, 0)
    this.showMessage(`Resurrected. ${totalFollowers} followers remain.`)
  }
}
