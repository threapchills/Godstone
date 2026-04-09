import { TILE_SIZE } from '../core/Constants.js'
import { buildPalette, TILES } from '../world/TileTypes.js'
import { WanderingWarrior } from './Warrior.js'
import { findGroundTileY } from '../utils/Grounding.js'

// Stages 0-20. Stage 0 is the caveman fallback; stages 1-7 come from
// home-world tablets; stages 8+ come from god statues (raid victories)
// and defeating invading gods. At stage 20 villages are sprawling
// megalopolii of the ancient world.
const POP_CAPS = [
  4, 25, 50, 80, 115, 150, 185, 220, 260, 300, 340,
  /*11*/ 400, 480, 560, 650, 750, 860, 980, 1100, 1250, 1400,
]

// Growth rate is multiplied by belief, stage, and fertility factors in
// updatePopulation. Bumped up so populations actually reach their caps
// within a reasonable play session; the base used to be 0.3 which made
// stage 7 villages crawl.
const BASE_GROWTH_RATE = 0.9
const GROWTH_THRESHOLD = 20
const DECLINE_THRESHOLD = 10

// Visible villager budget per village. The hybrid pattern from Sky Baby:
// all population is tracked as a number, but only a capped subset spawns
// as simulated sprites. At ~50 visible per village * 16 villages = 800
// simulated units at peak, comfortably under the 500-at-once ceiling
// Sky Baby proved viable on commodity hardware.
const MAX_VISIBLE_VILLAGERS = 50

// Building counts and spread scale all the way through stage 10. Raid
// tier villages sprawl into sprawling towns with temples, towers, and
// walls across a ~60 tile radius.
const BUILDING_COUNTS = [
  0, 1, 3, 5, 9, 14, 20, 28, 38, 50, 65,
  /*11*/ 80, 95, 110, 125, 140, 155, 170, 185, 200, 220,
]
const STAGE_SPREAD = [
  0, 4, 7, 11, 16, 22, 30, 40, 50, 60, 72,
  /*11*/ 85, 98, 112, 126, 140, 155, 170, 185, 200, 220,
]
const STAGE_NAMES = [
  'Caveman huddle', 'Cave dwellers', 'Fire-makers', 'Farmers',
  'Small village', 'Large village', 'Town', 'Civilisation',
  'Grand city', 'Imperium', 'Ascendant dominion',
  /*11*/ 'Ancient metropolis', 'Citadel state', 'Sprawling kingdom',
  'World wonder', 'Eternal empire', 'Ziggurat dominion',
  'Mythic polis', 'Titan stronghold', 'God-throne', 'Megalopolis ascendant',
]

// Population floor below which a village regresses to stage 0 if its
// belief is also low. A village with a trickle of population is still
// a village, but an abandoned one devolves into cavemen around a fire.
const REGRESSION_POP_FLOOR = 3
const REGRESSION_BELIEF_FLOOR = 8

// Scale multiplier on procedural building textures.
// Must be larger than the human-sized god (~20px tall) but smaller
// than the canopy of a tree (~50px tall). 2.5x puts huts at ~40px,
// houses at ~50px, temples at ~70px tall.
const BUILDING_SCALE = 2.5

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
    // Initial population big enough that a stage 1 village reads as
    // "inhabited", not "one old man on a stool". POP_CAPS[1] is 25;
    // starting at 10 gives the village plenty of room to visibly grow.
    this.population = 10
    this.fertility = params.barrenFertile ?? 0.5
    this.name = generateVillageName(params)
    // Team affiliation for combat. Every village on a home world
    // starts 'home'; Phase 7 raid worlds mark them 'enemy'.
    this.team = 'home'
    this.isReceiving = false
    this.params = params

    // Element-tinted building colours (base browns shifted toward element hue)
    const palette = buildPalette(params)
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

    const grid = this.scene.worldGrid?.grid

    for (let i = 0; i < count; i++) {
      const type = this._pickBuildingType(rng)
      const dx = i === 0 ? 0 : (rng() - 0.5) * 2 * spread * TILE_SIZE
      const buildingX = cx + dx
      // Snap each building to its own column's ground so they hug hills
      // and valleys. Search starts a few tiles above the village anchor
      // with a generous walk distance so buildings always reach solid
      // ground even across deep caves or eroded terrain.
      const py = grid
        ? findGroundTileY(grid, Math.floor(buildingX / TILE_SIZE), Math.max(0, this.tileY - 6), this.tileY, 200) * TILE_SIZE
        : this.tileY * TILE_SIZE
      const key = this._ensureBuildingTexture(type)
      const sprite = this.scene.add.sprite(buildingX, py, key)
      sprite.setOrigin(0.5, 1)
      sprite.setScale(BUILDING_SCALE)
      sprite.setDepth(5)
      this.buildings.push(sprite)
    }

    // First building doubles as this.sprite for backward compat
    this.sprite = this.buildings[0] || null
  }

  // Continuous re-grounding: called each frame so buildings settle
  // after terraforming. Only moves when the building is genuinely
  // floating (gap > 1 tile); small shifts from particle jitter are
  // ignored to prevent visual bobbing on moving sand/water.
  updateGrounding() {
    const grid = this.scene.worldGrid?.grid
    if (!grid) return

    for (const bld of this.buildings) {
      const tileX = Math.floor(bld.x / TILE_SIZE)
      const startTileY = Math.max(0, Math.floor(bld.y / TILE_SIZE) - 2)
      const groundTileY = findGroundTileY(grid, tileX, startTileY, this.tileY, 200)
      const targetY = groundTileY * TILE_SIZE
      const dy = targetY - bld.y

      if (dy > TILE_SIZE) {
        // Floating above ground: fall smoothly toward it
        bld.y += Math.min(dy, Math.max(2, dy * 0.12))
      } else if (dy < -TILE_SIZE) {
        // Ground rose well above the building (rare): snap up
        bld.y = targetY
      }
      // ±1 tile jitter from particles is ignored entirely
    }
  }

  _pickBuildingType(rng) {
    const s = this.stage
    if (s <= 0) return 'firepit'   // caveman huddle: just a fire and bodies
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
    if (s === 7) {
      const r = rng()
      if (r < 0.04) return 'temple'
      if (r < 0.12) return 'tower'
      if (r < 0.2) return 'wall'
      if (r < 0.55) return 'house'
      return 'longhouse'
    }
    // Stages 8-10 unlock via god statues from raided worlds. Temples
    // and towers become common; the silhouette reads as a proper city.
    const r = rng()
    if (s === 8) {
      if (r < 0.10) return 'temple'
      if (r < 0.22) return 'tower'
      if (r < 0.30) return 'wall'
      if (r < 0.55) return 'longhouse'
      return 'house'
    }
    if (s === 9) {
      if (r < 0.15) return 'temple'
      if (r < 0.30) return 'tower'
      if (r < 0.40) return 'wall'
      if (r < 0.62) return 'longhouse'
      return 'house'
    }
    // Stage 10: ascendant dominion; temples dominate the skyline
    if (r < 0.22) return 'temple'
    if (r < 0.40) return 'tower'
    if (r < 0.50) return 'wall'
    if (r < 0.72) return 'longhouse'
    return 'house'
  }

  _ensureBuildingTexture(type) {
    const e1 = this.params.element1
    const e2 = this.params.element2
    const key = `bld-${type}-${e1}-${e2}`
    if (this.scene.textures.exists(key)) return key

    const dims = {
      'lean-to': [16, 12], hut: [20, 16], house: [28, 20],
      longhouse: [36, 20], tower: [12, 32], temple: [40, 28],
      wall: [20, 8], firepit: [8, 6],
    }
    const [w, h] = dims[type] || [20, 16]
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')

    const wall = this.wallColour
    const roof = this.roofColour
    const dark = this.darkColour
    const drawFn = {
      'lean-to': drawLeanTo, hut: drawHut, house: drawHouse,
      longhouse: drawLonghouse, tower: drawTower, temple: drawTemple,
      wall: drawWall, firepit: drawFirepit,
    }
    if (drawFn[type]) drawFn[type](ctx, w, h, wall, roof, dark)

    this.scene.textures.addCanvas(key, canvas)
    return key
  }

  // ── Villager / warrior management ───────────────────

  // Replace generic villagers with stage-appropriate warrior sprites.
  // Each stage upgrade visibly equips the population: clubs, spears,
  // bows, swords, mounted units, arcanists. Existing units are wiped
  // on stage change so the look refreshes.
  updateVillagers(delta) {
    const target = Math.min(MAX_VISIBLE_VILLAGERS, Math.floor(this.population))

    // If the population stage drifted, wipe and respawn so equipment matches
    if (this.villagerSprites.length > 0 && this.villagerSprites[0].stage !== this.stage) {
      for (const w of this.villagerSprites) w.destroy()
      this.villagerSprites = []
    }

    while (this.villagerSprites.length < target) this._spawnVillager()
    while (this.villagerSprites.length > target) {
      this.villagerSprites.pop().destroy()
    }

    for (const w of this.villagerSprites) w.update(delta)
  }

  _spawnVillager() {
    const spread = Math.max(STAGE_SPREAD[this.stage], 3) * TILE_SIZE
    const cx = this.tileX * TILE_SIZE + TILE_SIZE / 2
    const x = cx + (Math.random() - 0.5) * 2 * spread

    // Snap each new villager to the ground beneath their spawn column
    const grid = this.scene.worldGrid?.grid
    const py = grid
      ? findGroundTileY(grid, Math.floor(x / TILE_SIZE), Math.max(0, this.tileY - 6), this.tileY) * TILE_SIZE
      : this.tileY * TILE_SIZE

    const w = new WanderingWarrior(this.scene, x, py, this.stage, this.clothingColour, cx, spread)
    this.villagerSprites.push(w)
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

  // The tablet level this village needs to advance from its current
  // stage. Stages 1-7 are gated by home-world tablets; stages 8-10 are
  // gated by god statues carried home from raided worlds. Stage 0 is
  // the caveman fallback and needs a level 1 tablet like stage 1.
  // Returns null once the village is fully ascendant.
  // How many tablets does the god need to have collected before this
  // village can advance? Simply stage + 1: a stage 0 village needs at
  // least 1 tablet, a stage 4 village needs at least 5, etc. Tablets
  // are not pre-ordered; they are counted in pickup order.
  get nextRequiredTablet() {
    if (this.stage >= 20) return null
    return this.stage + 1
  }

  canAccept(highestTablet) {
    const need = this.nextRequiredTablet
    if (need == null) return false
    return highestTablet >= need
  }

  // Belief gate for sending escorts. Stage 3+ villages have warriors
  // worth dispatching; high belief is required because low belief
  // means the population doesn't trust the god enough to part with
  // their defenders.
  canDispatchBodyguards() {
    return this.stage >= 3 && this.belief >= 60
  }

  // Advance one stage. Caller is responsible for checking canAccept
  // first; this method just performs the upgrade and feedback.
  // Returns the new stage, or null if already maxed.
  receiveTablet() {
    if (this.stage >= 20) return null
    this.stage += 1
    this.belief = Math.min(100, this.belief + 25)
    this.population += 5
    this.updateBeliefBar()

    // Flash stage name; normal label refreshes in updatePopulation
    this.label.setText(`${this.name}: ${STAGE_NAMES[this.stage]}`)

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

    return this.stage
  }

  // ── Population dynamics ─────────────────────────────

  updatePopulation(delta) {
    const cap = POP_CAPS[this.stage] ?? POP_CAPS[POP_CAPS.length - 1]
    const dt = delta / 1000
    const prevPop = Math.floor(this.population)

    if (this.belief < DECLINE_THRESHOLD) {
      // Faster decline at higher stages; bigger cities have more mouths
      // to feed and starve faster when belief collapses.
      const declineRate = 0.3 + this.stage * 0.1
      this.population = Math.max(0, this.population - declineRate * dt)
    } else if (this.belief > GROWTH_THRESHOLD && this.population < cap) {
      const beliefFactor = (this.belief - GROWTH_THRESHOLD) / (100 - GROWTH_THRESHOLD)
      const stageMul = 0.5 + this.stage * 0.22
      const fertilityMul = 0.5 + this.fertility
      this.population = Math.min(cap, this.population + BASE_GROWTH_RATE * beliefFactor * stageMul * fertilityMul * dt)
    }

    // Caveman regression: an abandoned village whose faith has fully
    // collapsed and whose numbers have dwindled reverts to a stage 0
    // huddle. The buildings get rebuilt as a single fire pit and the
    // pop floor resets; the land remembers the village name but the
    // people have forgotten whatever gift the god once brought.
    if (this.stage > 0 && this.belief <= REGRESSION_BELIEF_FLOOR &&
        this.population < REGRESSION_POP_FLOOR) {
      this.stage = 0
      this.population = Math.max(this.population, 1)
      this._buildSettlement()
      this.label.setText(`${this.name}: ${STAGE_NAMES[0]}`)
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
