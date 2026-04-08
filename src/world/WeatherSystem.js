import Phaser from 'phaser'
import { WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE, GAME_WIDTH, GAME_HEIGHT } from '../core/Constants.js'
import { TILES, SOLID_TILES, LIQUID_TILES, renderIdFor } from './TileTypes.js'

// WeatherSystem: the closing loop of the water ecology. Works with
// GridSimulator.evaporateInChunk so water that drifts out of play as
// vapour eventually returns as rain somewhere else. Three responsibilities:
//
// 1. Cloud spawning and drift. A small pool of cosmetic cloud sprites
//    floats across the sky above the world, wrapping horizontally. They
//    exist for visual continuity; their logical purpose is to "carry"
//    the humidity that evaporation has added to the world.
//
// 2. Rain. When a cloud's internal rain timer fires, it spawns a falling
//    water drop particle. Drops fall through air; when they hit solid
//    ground (including tree tops), they convert into an actual WATER tile
//    above the impact cell. This re-seeds water at arbitrary x positions,
//    stopping the "everything pools at the bottom" failure mode.
//
// 3. Humidity bookkeeping. Evaporation events from GridSimulator push
//    humidity up; each rain drop spawned pulls it down. Rain rate scales
//    with humidity so a scorching fire world with no surface water rarely
//    rains, while a water-dominated world is perpetually overcast.
//
// Design note: clouds are world-space sprites, not UI overlays, so they
// parallax naturally with the camera. Drops are pure Phaser display objects
// managed by a small pool to keep allocation churn down during storms.

const CLOUD_COUNT_DEFAULT = 22
// Cloud Y values are world-space pixels. The god's sky ceiling sits at
// y = -30 * TILE_SIZE and the typical surface starts somewhere around
// y = 40-80 tiles down. Clouds live just above the surface so they're
// always in the camera view when the god is above ground. Per-cloud
// placement uses the column's actual surface height to sit proud of
// peaks and ridges.
const CLOUD_Y_OFFSET_MIN = -TILE_SIZE * 34  // tiles above the column's surface
const CLOUD_Y_OFFSET_MAX = -TILE_SIZE * 14
const CLOUD_DRIFT_MIN = 8                   // px / s
const CLOUD_DRIFT_MAX = 28                  // px / s
const RAIN_DROP_SPEED = 560                // px / s falling velocity
const RAIN_DROP_MAX_LIFE = 8000            // ms before a drop despawns even if it never hits; deep worlds need longer
const RAIN_DROP_POOL = 320                 // max concurrent drops
const RAIN_POOL_PRE_ALLOC = 80             // initial allocation to amortise storm starts
const DEFAULT_HUMIDITY = 0.35              // baseline so even dry worlds see occasional rain
const HUMIDITY_EVAP_GAIN = 0.020           // each evaporation event adds this much
const HUMIDITY_RAIN_DRAIN = 0.004          // each rain drop removes this much (slower drain so storms persist)
// Rain rate is "drops per cloud per second" at humidity 1.0. At 3.5 a
// humid cloud dumps a steady visible shower that the player reads as
// "it's raining" without drowning the active chunk in new water tiles.
// The HUMIDITY_RAIN_DRAIN counterweight keeps the cycle self-limiting.
const RAIN_SPAWN_CHANCE_BASE = 3.5
const RAIN_SPAWN_MIN = 0.35                // minimum spawn rate so a dry world still drizzles
const MAX_SKY_REPLACEMENT_AGE_MS = 1500    // a drop older than this despawns if still in open air

export default class WeatherSystem {
  constructor(scene, worldGrid, params) {
    this.scene = scene
    this.worldGrid = worldGrid
    this.params = params
    this.width = worldGrid.width
    this.height = worldGrid.height

    // Element-aware humidity baseline. Water worlds start moist; fire or
    // air worlds start parched. Players can still see rain on a dry world,
    // just much less of it.
    const hasWater = params?.element1 === 'water' || params?.element2 === 'water'
    const hasFire = params?.element1 === 'fire' || params?.element2 === 'fire'
    this.humidity = DEFAULT_HUMIDITY + (hasWater ? 0.35 : 0) - (hasFire ? 0.2 : 0)
    this.humidity = Math.max(0.05, Math.min(1.0, this.humidity))

    // Clouds: long-lived cosmetic sprites drifting across the sky
    this.clouds = []
    this._buildCloudTexture()
    this._spawnClouds(CLOUD_COUNT_DEFAULT)

    // Rain drop pool
    this.activeDrops = []
    this.dropPool = []
    for (let i = 0; i < RAIN_POOL_PRE_ALLOC; i++) {
      const d = scene.add.rectangle(0, 0, 2, 7, 0xaad8ff, 0.85)
        .setDepth(14)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setVisible(false)
      this.dropPool.push(d)
    }

    // Secondary accumulator: short-lived puddle emitters at drop impacts
    this._nextRainCheck = 0
  }

  _buildCloudTexture() {
    const key = 'weather-cloud'
    if (this.scene.textures.exists(key)) return
    const w = 96
    const h = 36
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')

    // Layered soft ellipses with gentle fade so clouds don't read as hard blobs
    const layers = [
      { r: 28, cx: 20, cy: 20, a: 0.35 },
      { r: 22, cx: 42, cy: 14, a: 0.45 },
      { r: 18, cx: 62, cy: 22, a: 0.32 },
      { r: 14, cx: 78, cy: 16, a: 0.28 },
    ]
    for (const l of layers) {
      const grad = ctx.createRadialGradient(l.cx, l.cy, 0, l.cx, l.cy, l.r)
      grad.addColorStop(0, `rgba(255,255,255,${l.a})`)
      grad.addColorStop(0.6, `rgba(255,255,255,${l.a * 0.55})`)
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(l.cx, l.cy, l.r, 0, Math.PI * 2)
      ctx.fill()
    }

    this.scene.textures.addCanvas(key, c)
  }

  _spawnClouds(count) {
    // Compute the world's mean surface height once; clouds live above
    // that band regardless of which column they drift across. Using the
    // per-column surface is wrong for cave-heavy worlds where many
    // columns have no real "surface" near the top, only deep cave
    // ceilings, which pushed clouds underground.
    const surfaceHeights = this.worldGrid.surfaceHeights
    let meanSurfaceY = WORLD_HEIGHT * 0.2
    if (surfaceHeights?.length) {
      let sum = 0
      let valid = 0
      for (let i = 0; i < surfaceHeights.length; i++) {
        const sy = surfaceHeights[i]
        if (sy > 5 && sy < WORLD_HEIGHT * 0.4) { sum += sy; valid++ }
      }
      if (valid > 0) meanSurfaceY = sum / valid
    }
    // Sky band: from 30 tiles above the mean surface down to 10 tiles
    // above it. Clouds drift horizontally through this band.
    const skyTopPx = Math.max(0, (meanSurfaceY - 36) * TILE_SIZE)
    const skyBotPx = Math.max(skyTopPx + 16, (meanSurfaceY - 14) * TILE_SIZE)
    this._skyTopPx = skyTopPx
    this._skyBotPx = skyBotPx

    for (let i = 0; i < count; i++) {
      const x = Math.random() * WORLD_WIDTH * TILE_SIZE
      const y = skyTopPx + Math.random() * (skyBotPx - skyTopPx)
      const scale = 0.8 + Math.random() * 2.2
      const drift = (CLOUD_DRIFT_MIN + Math.random() * (CLOUD_DRIFT_MAX - CLOUD_DRIFT_MIN)) *
        (Math.random() > 0.5 ? 1 : -1)
      const sprite = this.scene.add.image(x, y, 'weather-cloud')
        .setAlpha(0.35 + Math.random() * 0.35)
        .setScale(scale, scale * 0.85)
        .setDepth(3) // behind foreground entities but above parallax sky

      this.clouds.push({
        sprite,
        vx: drift,
        rainTimer: 0,
        // Rainy cloud: darker tint and more drops
        rainy: false,
      })
    }
  }

  // Called from GridSimulator events so evaporation events bump humidity.
  // The WorldScene's event-processing loop hands us the full event list
  // each frame; we only care about 'vapour' entries.
  ingestGridEvents(events) {
    if (!events?.length) return
    for (const ev of events) {
      if (ev.type === 'vapour') {
        this.humidity = Math.min(1.0, this.humidity + HUMIDITY_EVAP_GAIN)
      }
    }
  }

  update(delta, camera) {
    const dt = delta / 1000
    const worldPx = WORLD_WIDTH * TILE_SIZE

    // Drift clouds, wrap horizontally
    for (const c of this.clouds) {
      c.sprite.x += c.vx * dt
      if (c.sprite.x < -200) c.sprite.x += worldPx + 400
      else if (c.sprite.x > worldPx + 200) c.sprite.x -= worldPx + 400

      // Darker tint for higher humidity: from bright white to heavy grey
      const tintLerp = 1 - this.humidity * 0.55
      const g = Math.floor(220 + tintLerp * 35)
      c.sprite.setTint((g << 16) | (g << 8) | (g + 10))
      c.sprite.setAlpha(0.35 + this.humidity * 0.45)

      // Rain: chance per second per cloud, scaled by humidity and whether
      // the cloud is within the camera's x range so drops only spawn near
      // the player's view (no wasted ticks far away)
      const camX = camera.scrollX
      const camW = camera.width
      const camWorldX = camX + camW / 2
      let cloudDX = c.sprite.x - camWorldX
      if (cloudDX > worldPx / 2) cloudDX -= worldPx
      else if (cloudDX < -worldPx / 2) cloudDX += worldPx
      const nearCamera = Math.abs(cloudDX) < camW * 1.2

      if (nearCamera) {
        // Per-cloud countdown timer in ms: frame-rate independent and
        // trivially tuneable. A humid cloud spawns a drop every ~40 ms;
        // a dry minimum-humidity cloud every ~240 ms. At high cloud
        // counts this produces a proper downpour without saturating
        // the active drop pool.
        c.rainTimer -= delta
        if (c.rainTimer <= 0 && this.activeDrops.length < RAIN_DROP_POOL) {
          const minInterval = 40
          const maxInterval = 240
          const perDropInterval = maxInterval - (maxInterval - minInterval) * Math.min(1, this.humidity)
          c.rainTimer = perDropInterval * (0.7 + Math.random() * 0.6)
          this._spawnDrop(c.sprite.x + (Math.random() - 0.5) * 80, c.sprite.y + 18)
          this.humidity = Math.max(0, this.humidity - HUMIDITY_RAIN_DRAIN)
        }
      }
    }

    // Update rain drops: fall, test for ground hit, convert to water tile
    // when they land on a solid surface.
    for (let i = this.activeDrops.length - 1; i >= 0; i--) {
      const d = this.activeDrops[i]
      d.life -= delta
      d.sprite.y += RAIN_DROP_SPEED * dt

      // Slight drift so drops don't all fall parallel
      d.sprite.x += d.windVx * dt
      if (d.sprite.x < 0) d.sprite.x += worldPx
      else if (d.sprite.x >= worldPx) d.sprite.x -= worldPx

      const tileX = ((Math.floor(d.sprite.x / TILE_SIZE) % this.width) + this.width) % this.width
      const tileY = Math.floor(d.sprite.y / TILE_SIZE)

      // Out of bounds: despawn
      if (tileY >= this.height - 1) {
        this._retireDrop(i)
        continue
      }
      if (tileY < 0) continue // still above world

      const cell = this.worldGrid.grid[tileY * this.width + tileX]
      // Hit solid or liquid: deposit water in the cell above
      if (SOLID_TILES.has(cell) || LIQUID_TILES.has(cell)) {
        const depositY = tileY - 1
        if (depositY >= 0) {
          const depositIdx = depositY * this.width + tileX
          if (this.worldGrid.grid[depositIdx] === TILES.AIR) {
            this.worldGrid.grid[depositIdx] = TILES.WATER
            // Sync the tilemap layer so the droplet appears immediately.
            if (this.worldGrid.layer) {
              const pad = this.worldGrid.padOffset || 0
              const renderId = renderIdFor(TILES.WATER, tileX, depositY)
              this.worldGrid.layer.putTileAt(renderId, tileX + pad, depositY)
              if (tileX < pad) {
                this.worldGrid.layer.putTileAt(renderId, tileX + pad + this.width, depositY)
              }
              if (tileX >= this.width - pad) {
                this.worldGrid.layer.putTileAt(renderId, tileX + pad - this.width, depositY)
              }
            }
          }
        }
        this._spawnSplash(d.sprite.x, tileY * TILE_SIZE)
        this._retireDrop(i)
        continue
      }

      // Expired from old age even while falling through air (fell into a
      // chasm with no floor in range). Despawn so the pool doesn't leak.
      if (d.life <= 0) {
        this._retireDrop(i)
      }
    }
  }

  _spawnDrop(x, y) {
    let drop = this.dropPool.pop()
    if (!drop) {
      drop = this.scene.add.rectangle(0, 0, 2, 7, 0xaad8ff, 0.85)
        .setDepth(14)
        .setBlendMode(Phaser.BlendModes.ADD)
    }
    drop.setPosition(x, y)
    drop.setVisible(true)
    drop.setAlpha(0.75 + Math.random() * 0.2)
    this.activeDrops.push({ sprite: drop, life: RAIN_DROP_MAX_LIFE, windVx: (Math.random() - 0.5) * 18 })
  }

  _retireDrop(i) {
    const d = this.activeDrops[i]
    d.sprite.setVisible(false)
    this.dropPool.push(d.sprite)
    const last = this.activeDrops.pop()
    if (i < this.activeDrops.length) this.activeDrops[i] = last
  }

  _spawnSplash(x, y) {
    // Tiny upward puff so landing drops are visible even in busy scenes
    const splash = this.scene.add.circle(x, y, 1.6, 0xcce8ff, 0.9)
      .setDepth(15)
      .setBlendMode(Phaser.BlendModes.ADD)
    this.scene.tweens.add({
      targets: splash,
      y: y - 4,
      alpha: 0,
      duration: 240,
      onComplete: () => splash.destroy(),
    })
  }

  shutdown() {
    for (const c of this.clouds) c.sprite?.destroy()
    for (const d of this.activeDrops) d.sprite?.destroy()
    for (const d of this.dropPool) d?.destroy()
    this.clouds.length = 0
    this.activeDrops.length = 0
    this.dropPool.length = 0
  }
}
