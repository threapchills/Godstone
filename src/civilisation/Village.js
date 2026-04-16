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
// updatePopulation. Bumped to 1.6 so populations visibly swell during
// play sessions; the old 0.9 meant stage 5+ villages crawled toward
// their caps. At 1.6 a well-believed stage 7 village with fertile
// terrain reaches 200+ within about a minute of proximity.
const BASE_GROWTH_RATE = 1.6
const GROWTH_THRESHOLD = 20
const DECLINE_THRESHOLD = 10

// Visible villager budget per village. Bumped from 50 to 80 so late-game
// villages feel properly bustling; at 22 villages worst case is ~1760
// sprites, but most villages won't hit the cap simultaneously and the
// rendering is cheap (non-physics, simple texture, no AI beyond wander).
const MAX_VISIBLE_VILLAGERS = 80

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

// Breeding tick interval. Every this-many ms the village rolls for a
// breeding event; success emits a visible courtship beat (heart motes
// above a pair of villagers) and adds +1 to the population counter.
const BREEDING_CHECK_INTERVAL = 4500
// Base breeding chance per check. Modulated by belief and how much
// headroom the village has under its pop cap; a full village doesn't
// breed, a ghost town with low belief barely breeds.
const BREEDING_BASE_CHANCE = 0.55

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

// ── Building type → storybook sprite mapping ────────────────
// Each building type maps to a storybook illustration sprite key and
// a target rendered height. The sprite is scaled to fit the world's
// 8px-tile grid while preserving the hand-painted look. Higher-stage
// buildings use larger, more impressive sprites.

const BUILDING_SPRITES = {
  'firepit':   { sprite: 'sb_fireplace',     height: 18 },
  'lean-to':   { sprite: 'sb_teepee',        height: 28 },
  'hut':       { sprite: 'sb_teepee',        height: 34 },
  'house':     { sprite: 'sb_chest',         height: 28 },
  'longhouse': { sprite: 'sb_wooden_barrel', height: 30 },
  'tower':     { sprite: 'sb_totem',         height: 50 },
  'temple':    { sprite: 'sb_stone_altar',   height: 42 },
  'wall':      { sprite: 'sb_anvil',         height: 16 },
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

    // Breeding timer: counts down each tick; on zero, roll for a
    // courtship event (see updateBreeding). Randomised initial offset
    // so each village in the world doesn't breed in lockstep.
    this._breedingTimer = BREEDING_CHECK_INTERVAL * Math.random()

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
      const py = grid
        ? findGroundTileY(grid, Math.floor(buildingX / TILE_SIZE), Math.max(0, this.tileY - 6), this.tileY, 200) * TILE_SIZE
        : this.tileY * TILE_SIZE
      const spriteKey = this._getBuildingSpriteKey(type)
      const spec = BUILDING_SPRITES[type] || BUILDING_SPRITES['hut']
      const sprite = this.scene.add.sprite(buildingX, py, spriteKey)
      sprite.setOrigin(0.5, 1)

      // Scale to target height; storybook sprites are much larger than
      // the old procedural canvases but we want them to sit naturally
      // in the 8px-tile world.
      const srcH = sprite.height || 100
      const targetH = spec.height || 28
      const scale = targetH / srcH
      sprite.setScale(scale)

      // Element tint so buildings match the world's colour scheme
      sprite.setTint(this.wallColour)
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

  // Returns the storybook sprite key for a building type. No canvas
  // generation needed; the sprites are loaded as full images in BootScene.
  _getBuildingSpriteKey(type) {
    const spec = BUILDING_SPRITES[type]
    if (!spec) return 'sb_teepee'
    return this.scene.textures.exists(spec.sprite) ? spec.sprite : 'sb_teepee'
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

  // The tablet count this village needs to advance one stage. Tablets
  // are generic "permission tokens": each additional tablet the god
  // carries unlocks one more stage of advancement for every village
  // they visit. A stage-1 village needs one tablet to become stage 2;
  // a stage-7 village needs seven tablets to become stage 8; and so on.
  // Tablets are persistent, so a late-visited village can skip stages
  // in sequence. Returns null once the village is fully ascendant.
  get nextRequiredTablet() {
    if (this.stage >= 20) return null
    return this.stage
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

  // Periodic breeding tick. Called each frame; the BREEDING_CHECK
  // timer throttles to ~every 4.5 s. On a successful roll we emit a
  // short courtship animation (heart motes rising between a pair of
  // villagers) and bump population by one.
  updateBreeding(delta) {
    this._breedingTimer -= delta
    if (this._breedingTimer > 0) return
    this._breedingTimer = BREEDING_CHECK_INTERVAL

    // No people, no breeding.
    if (this.population < 2) return
    // Destroyed raid villages don't breed.
    if (this._destroyed) return

    const cap = POP_CAPS[this.stage] ?? POP_CAPS[POP_CAPS.length - 1]
    const headroom = Math.max(0, 1 - this.population / cap)
    // Belief correlates with community wellbeing; low-belief villages
    // breed less, joyful villages breed more. Multiplied by headroom
    // so a maxed-out village stops reproducing.
    const beliefFactor = Math.max(0, (this.belief - 20) / 100)
    const chance = BREEDING_BASE_CHANCE * beliefFactor * headroom
    if (Math.random() > chance) return

    // Pick a villager sprite as the anchor point for the heart motes.
    // If no sprites are visible (population below the MAX visible cap),
    // we just bump pop silently.
    this.population = Math.min(cap, this.population + 1)
    this._refreshLabel()

    if (this.villagerSprites.length > 0) {
      const v = this.villagerSprites[Math.floor(Math.random() * this.villagerSprites.length)]
      this._spawnHeartBurst(v.sprite.x, v.sprite.y - 10)
    }
    // Tiny audio glint, but only if the player is close enough to see
    // the courtship animation — otherwise breeding chimes would spam
    // the soundscape as every distant village pairs up off-screen.
    const godSprite = this.scene.god?.sprite
    if (godSprite && this.scene.ambience?.playTabletShimmer) {
      const dx = godSprite.x - this.worldX
      const dy = godSprite.y - this.worldY
      if (dx * dx + dy * dy < (TILE_SIZE * 30) * (TILE_SIZE * 30)) {
        this.scene.ambience.playTabletShimmer()
      }
    }
  }

  // Tiny courtship VFX: three pink hearts drift up and fade. Cheap,
  // single-use per breeding event, auto-destroys.
  _spawnHeartBurst(cx, cy) {
    for (let i = 0; i < 3; i++) {
      const h = this.scene.add.text(
        cx + (i - 1) * 3,
        cy - i * 2,
        '♥',
        { fontFamily: 'Georgia, serif', fontSize: '9px', color: '#ff88aa' },
      ).setOrigin(0.5).setDepth(12).setAlpha(0.9)
      this.scene.tweens.add({
        targets: h,
        y: h.y - 18 - i * 3,
        alpha: 0,
        scale: 0.5,
        duration: 1300 + i * 180,
        ease: 'Quad.easeOut',
        onComplete: () => h.destroy(),
      })
    }
  }

  // ── Belief ──────────────────────────────────────────

  updateBelief(godDistance, delta) {
    const proximityRange = TILE_SIZE * 30
    // Ghost-mode bite: while the god is wandering as a spirit the
    // villagers sense their absence. Belief drains four times as fast
    // and proximity no longer restores anything — a disembodied god
    // cannot comfort their people. Creates genuine tension during the
    // 60 s ghost wander, especially for low-belief villages.
    const godIsGhost = !!this.scene?.god?.isGhost
    if (godIsGhost) {
      this.belief = Math.max(0, this.belief - 2.0 * delta / 1000)
    } else if (godDistance < proximityRange) {
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
