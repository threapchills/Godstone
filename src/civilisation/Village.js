import { TILE_SIZE } from '../core/Constants.js'
import { buildPalette, TILES } from '../world/TileTypes.js'

const POP_CAPS = [0, 10, 20, 35, 50, 70, 90, 120]
const BASE_GROWTH_RATE = 0.3
const GROWTH_THRESHOLD = 20
const DECLINE_THRESHOLD = 10
const MAX_VISIBLE_VILLAGERS = 20
const BUILDING_COUNTS = [0, 1, 3, 5, 8, 12, 16, 22]
const STAGE_SPREAD = [0, 3, 5, 8, 11, 15, 20, 26]
const STAGE_NAMES = ['', 'Cave dwellers', 'Fire-makers', 'Farmers', 'Small village', 'Large village', 'Town', 'Civilisation']

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hexRgb(hex) {
  return `rgb(${(hex >> 16) & 0xff},${(hex >> 8) & 0xff},${hex & 0xff})`
}

function blendHex(a, b, t) {
  const rA = (a >> 16) & 0xff, gA = (a >> 8) & 0xff, bA = a & 0xff
  const rB = (b >> 16) & 0xff, gB = (b >> 8) & 0xff, bB = b & 0xff
  const r = Math.round(rA + (rB - rA) * t)
  const g = Math.round(gA + (gB - gA) * t)
  const b2 = Math.round(bA + (bB - bA) * t)
  return (r << 16) | (g << 8) | b2
}

// ── Building drawing functions ──────────────────────────────

function drawLeanTo(ctx, w, h, wall, roof, dark) {
  ctx.fillStyle = hexRgb(wall)
  ctx.beginPath()
  ctx.moveTo(1, h)
  ctx.lineTo(Math.floor(w * 0.5), 2)
  ctx.lineTo(w - 1, h)
  ctx.fill()
  ctx.strokeStyle = hexRgb(dark)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(3, h - 2); ctx.lineTo(Math.floor(w * 0.5), 3)
  ctx.moveTo(w - 3, h - 2); ctx.lineTo(Math.floor(w * 0.5), 3)
  ctx.stroke()
}

function drawHut(ctx, w, h, wall, roof, dark) {
  const roofY = Math.floor(h * 0.45)
  ctx.fillStyle = hexRgb(wall)
  ctx.fillRect(2, roofY, w - 4, h - roofY)
  ctx.fillStyle = hexRgb(roof)
  ctx.beginPath()
  ctx.moveTo(0, roofY)
  ctx.lineTo(Math.floor(w / 2), 0)
  ctx.lineTo(w, roofY)
  ctx.fill()
  ctx.fillStyle = hexRgb(dark)
  ctx.fillRect(Math.floor(w / 2) - 2, h - 5, 4, 5)
}

function drawHouse(ctx, w, h, wall, roof, dark) {
  const roofY = Math.floor(h * 0.4)
  ctx.fillStyle = hexRgb(wall)
  ctx.fillRect(2, roofY, w - 4, h - roofY)
  ctx.fillStyle = hexRgb(roof)
  ctx.beginPath()
  ctx.moveTo(0, roofY)
  ctx.lineTo(Math.floor(w / 2), 2)
  ctx.lineTo(w, roofY)
  ctx.fill()
  ctx.fillStyle = hexRgb(dark)
  ctx.fillRect(Math.floor(w / 2) - 2, h - 6, 5, 6)
  ctx.fillStyle = hexRgb(blendHex(wall, 0xffcc66, 0.5))
  ctx.fillRect(4, Math.floor(h * 0.5), 3, 3)
}

function drawLonghouse(ctx, w, h, wall, roof, dark) {
  const roofY = Math.floor(h * 0.4)
  ctx.fillStyle = hexRgb(wall)
  ctx.fillRect(2, roofY, w - 4, h - roofY)
  ctx.fillStyle = hexRgb(roof)
  ctx.beginPath()
  ctx.moveTo(0, roofY)
  ctx.lineTo(Math.floor(w * 0.3), 2)
  ctx.lineTo(Math.floor(w * 0.7), 2)
  ctx.lineTo(w, roofY)
  ctx.fill()
  ctx.fillStyle = hexRgb(dark)
  ctx.fillRect(Math.floor(w / 2) - 3, h - 7, 6, 7)
  const winCol = hexRgb(blendHex(wall, 0xffcc66, 0.5))
  ctx.fillStyle = winCol
  ctx.fillRect(5, Math.floor(h * 0.5), 3, 3)
  ctx.fillRect(w - 8, Math.floor(h * 0.5), 3, 3)
}

function drawTower(ctx, w, h, wall, roof, dark) {
  const capY = Math.floor(h * 0.2)
  ctx.fillStyle = hexRgb(wall)
  ctx.fillRect(1, capY + 2, w - 2, h - capY - 2)
  ctx.fillStyle = hexRgb(roof)
  ctx.fillRect(0, capY, w, 3)
  for (let i = 0; i < w; i += 3) {
    ctx.fillRect(i, capY - 3, 2, 3)
  }
  ctx.fillStyle = hexRgb(dark)
  ctx.fillRect(Math.floor(w / 2), Math.floor(h * 0.4), 1, 4)
  ctx.fillRect(Math.floor(w / 2) - 1, h - 4, 3, 4)
}

function drawTemple(ctx, w, h, wall, roof, dark) {
  const baseY = Math.floor(h * 0.5)
  ctx.fillStyle = hexRgb(wall)
  ctx.fillRect(2, baseY, w - 4, h - baseY)
  ctx.fillStyle = hexRgb(roof)
  const tierH = Math.floor(h * 0.13)
  for (let i = 0; i < 3; i++) {
    const inset = i * Math.floor(w * 0.1)
    ctx.fillRect(inset, baseY - (i + 1) * tierH, w - inset * 2, tierH + 1)
  }
  const peakBase = baseY - 3 * tierH
  ctx.beginPath()
  ctx.moveTo(Math.floor(w * 0.3), peakBase)
  ctx.lineTo(Math.floor(w / 2), 0)
  ctx.lineTo(Math.floor(w * 0.7), peakBase)
  ctx.fill()
  ctx.fillStyle = hexRgb(dark)
  ctx.fillRect(Math.floor(w / 2) - 3, h - 8, 6, 8)
  ctx.fillStyle = hexRgb(blendHex(wall, 0xffffff, 0.3))
  ctx.fillRect(6, baseY, 2, h - baseY)
  ctx.fillRect(w - 8, baseY, 2, h - baseY)
}

function drawWall(ctx, w, h, wall, roof, dark) {
  ctx.fillStyle = hexRgb(blendHex(wall, 0x888888, 0.3))
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = hexRgb(dark)
  ctx.fillRect(3, 1, 1, 1)
  ctx.fillRect(8, 2, 1, 1)
  ctx.fillRect(14, 1, 1, 1)
}

function drawFirepit(ctx, w, h) {
  ctx.fillStyle = '#555555'
  ctx.fillRect(0, h - 2, w, 2)
  ctx.fillStyle = '#ff4400'
  ctx.fillRect(2, h - 4, 2, 2)
  ctx.fillStyle = '#ffaa00'
  ctx.fillRect(3, h - 5, 1, 1)
  ctx.fillStyle = '#ffdd44'
  ctx.fillRect(2, h - 6, 1, 1)
}

const BUILDING_SPECS = {
  'lean-to':   { w: 16, h: 12, draw: drawLeanTo },
  'hut':       { w: 20, h: 16, draw: drawHut },
  'house':     { w: 28, h: 20, draw: drawHouse },
  'longhouse': { w: 36, h: 20, draw: drawLonghouse },
  'tower':     { w: 12, h: 32, draw: drawTower },
  'temple':    { w: 40, h: 28, draw: drawTemple },
  'wall':      { w: 20, h: 8, draw: drawWall },
  'firepit':   { w: 8, h: 6, draw: drawFirepit },
}

// ── Village class ───────────────────────────────────────────

export default class Village {
  constructor(scene, tileX, tileY, params) {
    this.scene = scene
    this.tileX = tileX
    this.tileY = tileY
    this.stage = 1
    this.belief = 50
    this.population = 5
    this.fertility = params.barrenFertile ?? 0.5
    this.name = generateVillageName(params)
    this.tabletsReceived = new Set()
    this.isReceiving = false
    this.params = params

    // Element-tinted building colours (base browns shifted toward element hue)
    const palette = buildPalette(params.element1, params.element2, params.elementRatio)
    const accent = palette[TILES.SURFACE] || 0x7a6a4a
    this.wallColour = blendHex(0x9a8a6a, accent, 0.25)
    this.roofColour = blendHex(0x5a4a2a, accent, 0.3)
    this.darkColour = blendHex(0x2a1a0a, accent, 0.2)
    this.clothingColour = accent

    this.buildings = []
    this.villagerSprites = []

    this._buildSettlement()

    const px = tileX * TILE_SIZE + TILE_SIZE / 2
    const py = tileY * TILE_SIZE
    this.createLabel(scene, px, py)

    this.beliefBar = scene.add.graphics()
    this.beliefBar.setDepth(8)
    this.updateBeliefBar()
  }

  // ── Settlement construction ─────────────────────────

  _buildSettlement() {
    this.buildings.forEach(b => b.destroy())
    this.buildings = []

    // Re-seed per stage so layout is deterministic but evolves
    const rng = mulberry32(this.tileX * 7919 + this.tileY * 6271 + this.stage * 31)
    const count = BUILDING_COUNTS[this.stage] || 1
    const spread = STAGE_SPREAD[this.stage] || 3
    const cx = this.tileX * TILE_SIZE + TILE_SIZE / 2
    const py = this.tileY * TILE_SIZE

    for (let i = 0; i < count; i++) {
      const type = this._pickBuildingType(rng)
      const dx = i === 0 ? 0 : (rng() - 0.5) * 2 * spread * TILE_SIZE
      const key = this._ensureBuildingTexture(type, rng)
      const sprite = this.scene.add.sprite(cx + dx, py, key)
      sprite.setOrigin(0.5, 1)
      sprite.setDepth(4) // Behind god and critters

      // Massive scale up for the teepees
      if (key.includes('teepee')) {
        sprite.setScale(3.5)
        // Tint them slightly to fit the village palette
        sprite.setTint(this.wallColour)
      } else {
        sprite.setDepth(5)
      }
      
      this.buildings.push(sprite)
    }

    // First building doubles as this.sprite for backward compat
    this.sprite = this.buildings[0] || null
  }

  _pickBuildingType(rng) {
    const s = this.stage
    if (s <= 1) return 'lean-to'
    if (s === 2) return rng() < 0.3 ? 'firepit' : 'hut'
    if (s === 3) return rng() < 0.15 ? 'firepit' : rng() < 0.6 ? 'hut' : 'house'
    if (s === 4) return rng() < 0.1 ? 'firepit' : rng() < 0.5 ? 'hut' : 'house'
    if (s === 5) return rng() < 0.08 ? 'wall' : rng() < 0.3 ? 'hut' : rng() < 0.65 ? 'house' : 'longhouse'
    if (s === 6) {
      const r = rng()
      if (r < 0.08) return 'tower'
      if (r < 0.16) return 'wall'
      if (r < 0.5) return 'house'
      return 'longhouse'
    }
    const r = rng()
    if (r < 0.04) return 'temple'
    if (r < 0.12) return 'tower'
    if (r < 0.2) return 'wall'
    if (r < 0.55) return 'house'
    return 'longhouse'
  }

  _ensureBuildingTexture(type, rng) {
    if (type === 'firepit') {
      const key = `bld-firepit-${this.params.element1}`
      if (!this.scene.textures.exists(key)) {
        const canvas = document.createElement('canvas')
        canvas.width = 8; canvas.height = 6
        const ctx = canvas.getContext('2d')
        drawFirepit(ctx, 8, 6)
        this.scene.textures.addCanvas(key, canvas)
      }
      return key
    }
    // Return massive pre-rendered teepee textures
    return rng() > 0.5 ? 'sb_teepee_blue' : 'sb_teepee_green'
  }

  // ── Villager management ─────────────────────────────

  _ensureVillagerTexture() {
    const key = `vlgr-${this.params.element1}-${this.params.element2}`
    if (this.scene.textures.exists(key)) return key

    const canvas = document.createElement('canvas')
    canvas.width = 4
    canvas.height = 7
    const ctx = canvas.getContext('2d')

    // Head (warm skin tone)
    ctx.fillStyle = '#c8a882'
    ctx.fillRect(1, 0, 2, 2)
    // Body (element-coloured clothing)
    ctx.fillStyle = hexRgb(this.clothingColour)
    ctx.fillRect(0, 2, 4, 3)
    // Legs (darker)
    ctx.fillStyle = hexRgb(blendHex(this.clothingColour, 0x1a1a1a, 0.5))
    ctx.fillRect(0, 5, 1, 2)
    ctx.fillRect(3, 5, 1, 2)

    this.scene.textures.addCanvas(key, canvas)
    return key
  }

  updateVillagers(delta) {
    // Sync visible count with population
    const target = Math.min(MAX_VISIBLE_VILLAGERS, Math.floor(this.population))
    while (this.villagerSprites.length < target) this._spawnVillager()
    while (this.villagerSprites.length > target) {
      this.villagerSprites.pop().sprite.destroy()
    }

    const spread = Math.max(STAGE_SPREAD[this.stage], 3) * TILE_SIZE
    const cx = this.tileX * TILE_SIZE + TILE_SIZE / 2

    for (const v of this.villagerSprites) {
      if (v.isPaused) {
        v.pauseTimer -= delta
        if (v.pauseTimer <= 0) {
          v.isPaused = false
          if (Math.random() > 0.5) v.direction *= -1
        }
        continue
      }

      v.sprite.x += v.direction * v.speed * delta / 1000
      v.sprite.setFlipX(v.direction < 0)

      // Bounce at village edges
      if (Math.abs(v.sprite.x - cx) > spread) {
        v.direction *= -1
        v.sprite.x = cx + Math.sign(v.sprite.x - cx) * spread
      }

      // Random pause (standing, socialising, working)
      if (Math.random() < 0.004) {
        v.isPaused = true
        v.pauseTimer = 600 + Math.random() * 2000
      }
    }
  }

  _spawnVillager() {
    const spread = Math.max(STAGE_SPREAD[this.stage], 3) * TILE_SIZE
    const cx = this.tileX * TILE_SIZE + TILE_SIZE / 2
    const py = this.tileY * TILE_SIZE
    const key = this._ensureVillagerTexture()
    const x = cx + (Math.random() - 0.5) * 2 * spread
    const sprite = this.scene.add.sprite(x, py, key)
    sprite.setOrigin(0.5, 1)
    sprite.setDepth(6)

    this.villagerSprites.push({
      sprite,
      direction: Math.random() > 0.5 ? 1 : -1,
      speed: 6 + Math.random() * 10,
      pauseTimer: 0,
      isPaused: false,
    })
  }

  // ── Label and belief bar ────────────────────────────

  createLabel(scene, px, py) {
    this.label = scene.add.text(px, py - TILE_SIZE * 10, `${this.name} · ${this.population}`, {
      fontFamily: 'Georgia, serif',
      fontSize: '10px',
      color: '#daa520',
      stroke: '#000000',
      strokeThickness: 2,
    })
    this.label.setOrigin(0.5, 1)
    this.label.setDepth(9)
  }

  updateBeliefBar() {
    const px = this.tileX * TILE_SIZE + TILE_SIZE / 2
    const py = this.tileY * TILE_SIZE - TILE_SIZE * 10 - 6
    const barWidth = 24
    const barHeight = 3

    this.beliefBar.clear()
    this.beliefBar.fillStyle(0x333333, 0.8)
    this.beliefBar.fillRect(px - barWidth / 2, py, barWidth, barHeight)
    const fillWidth = (this.belief / 100) * barWidth
    const colour = this.belief > 60 ? 0x44aa44 : this.belief > 30 ? 0xaaaa44 : 0xaa4444
    this.beliefBar.fillStyle(colour, 1)
    this.beliefBar.fillRect(px - barWidth / 2, py, fillWidth, barHeight)
  }

  // ── Tablet reception ────────────────────────────────

  getNewTablets(godTablets) {
    return godTablets.filter(t => !this.tabletsReceived.has(t.stage))
  }

  receiveTablet(tablet) {
    if (this.tabletsReceived.has(tablet.stage)) return false
    this.tabletsReceived.add(tablet.stage)
    this.stage = Math.min(this.stage + 1, 7)
    this.belief = Math.min(100, this.belief + 25)
    this.population += 3
    this.updateBeliefBar()

    // Flash stage name; normal label refreshes in updatePopulation
    this.label.setText(`${this.name} — ${STAGE_NAMES[this.stage]}`)

    // Rebuild the entire settlement for the new stage
    this._buildSettlement()

    // Flash all buildings to celebrate
    for (const bld of this.buildings) {
      this.scene.tweens.add({
        targets: bld,
        alpha: { from: 1, to: 0.3 },
        yoyo: true,
        duration: 150,
        repeat: 3,
      })
    }

    return true
  }

  // ── Population dynamics ─────────────────────────────

  updatePopulation(delta) {
    const cap = POP_CAPS[this.stage] || POP_CAPS[7]
    const dt = delta / 1000
    const prevPop = Math.floor(this.population)

    if (this.belief < DECLINE_THRESHOLD) {
      this.population = Math.max(1, this.population - 0.2 * dt)
    } else if (this.belief > GROWTH_THRESHOLD && this.population < cap) {
      const beliefFactor = (this.belief - GROWTH_THRESHOLD) / (100 - GROWTH_THRESHOLD)
      const stageMul = 0.5 + this.stage * 0.2
      const fertilityMul = 0.5 + this.fertility
      this.population = Math.min(cap, this.population + BASE_GROWTH_RATE * beliefFactor * stageMul * fertilityMul * dt)
    }

    if (Math.floor(this.population) !== prevPop) this._refreshLabel()
  }

  _refreshLabel() {
    this.label.setText(`${this.name} · ${Math.floor(this.population)}`)
  }

  // ── Belief ──────────────────────────────────────────

  updateBelief(godDistance, delta) {
    const proximityRange = TILE_SIZE * 30
    if (godDistance < proximityRange) {
      const rate = 5 * (1 - godDistance / proximityRange)
      this.belief = Math.min(100, this.belief + rate * delta / 1000)
    } else {
      this.belief = Math.max(0, this.belief - 0.5 * delta / 1000)
    }
    this.updateBeliefBar()
  }

  get worldX() { return this.tileX * TILE_SIZE + TILE_SIZE / 2 }
  get worldY() { return this.tileY * TILE_SIZE }
}

function generateVillageName(params) {
  const prefixes = {
    fire: ['Ash', 'Ember', 'Scorch', 'Blaze', 'Cinder'],
    water: ['Tide', 'Reef', 'Mist', 'Brook', 'Coral'],
    air: ['Sky', 'Drift', 'Gale', 'Zephyr', 'Cloud'],
    earth: ['Stone', 'Root', 'Clay', 'Moss', 'Iron'],
  }
  const suffixes = ['haven', 'hold', 'dell', 'moor', 'fall', 'wick', 'stead', 'mere']

  const pool = [...(prefixes[params.element1] || prefixes.earth), ...(prefixes[params.element2] || prefixes.earth)]
  const prefix = pool[Math.floor(Math.random() * pool.length)]
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)]
  return prefix + suffix
}
