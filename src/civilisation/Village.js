import { TILE_SIZE } from '../core/Constants.js'

// Population caps per civilisation stage (index = stage number).
// Open question: exact values TBD via playtesting.
const POP_CAPS = [0, 10, 20, 35, 50, 70, 90, 120]
const BASE_GROWTH_RATE = 0.3  // people/second at maximum conditions
const GROWTH_THRESHOLD = 20   // belief must exceed this for population to grow
const DECLINE_THRESHOLD = 10  // belief below this causes people to flee

// A primitive village: cave dwellers at stage 1.
// Phase 1: visual marker + belief tracking + tablet reception.
export default class Village {
  constructor(scene, tileX, tileY, params) {
    this.scene = scene
    this.tileX = tileX
    this.tileY = tileY
    this.stage = 1
    this.belief = 50 // 0-100
    this.population = 5
    this.fertility = params.barrenFertile ?? 0.5
    this.name = generateVillageName(params)
    this.tabletsReceived = new Set() // tracks tablet stages already taught
    this.isReceiving = false         // locks out re-triggers during staggered delivery

    // Pixel position (bottom of the structure sits on the surface)
    const px = tileX * TILE_SIZE + TILE_SIZE / 2
    const py = tileY * TILE_SIZE

    this.createSprite(scene, px, py)
    this.createLabel(scene, px, py)

    // Belief indicator (small bar above village)
    this.beliefBar = scene.add.graphics()
    this.beliefBar.setDepth(8)
    this.updateBeliefBar()
  }

  createSprite(scene, px, py) {
    const width = TILE_SIZE * 6
    const height = TILE_SIZE * 5
    const key = 'village-stage1'

    if (!scene.textures.exists(key)) {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')

      // Stage 1: cave dwellers; a crude hut with campfire and smoke

      // Main hut (triangular)
      ctx.fillStyle = '#7a6a4a'
      ctx.beginPath()
      ctx.moveTo(4, height)
      ctx.lineTo(width * 0.4, 6)
      ctx.lineTo(width * 0.75, height)
      ctx.fill()

      // Thatch texture lines
      ctx.strokeStyle = '#5a4a2a'
      ctx.lineWidth = 1
      for (let i = 0; i < 5; i++) {
        const y = 10 + i * 6
        ctx.beginPath()
        ctx.moveTo(8 + i * 2, y)
        ctx.lineTo(width * 0.7 - i * 2, y)
        ctx.stroke()
      }

      // Door
      ctx.fillStyle = '#1a0a00'
      ctx.fillRect(width * 0.35, height - 12, 8, 12)

      // Small second hut
      ctx.fillStyle = '#6a5a3a'
      ctx.beginPath()
      ctx.moveTo(width * 0.65, height)
      ctx.lineTo(width * 0.8, height - 16)
      ctx.lineTo(width - 2, height)
      ctx.fill()

      // Campfire
      ctx.fillStyle = '#ff4400'
      ctx.fillRect(width - 14, height - 5, 4, 4)
      ctx.fillStyle = '#ffaa00'
      ctx.fillRect(width - 13, height - 8, 2, 3)
      ctx.fillStyle = '#ffdd44'
      ctx.fillRect(width - 12, height - 10, 1, 2)

      // Smoke wisps
      ctx.fillStyle = 'rgba(150,150,150,0.4)'
      ctx.fillRect(width - 12, height - 14, 1, 2)
      ctx.fillRect(width - 11, height - 18, 1, 2)

      scene.textures.addCanvas(key, canvas)
    }

    this.sprite = scene.add.sprite(px, py, key)
    this.sprite.setOrigin(0.5, 1)
    this.sprite.setScale(1.5)
    this.sprite.setDepth(5)
  }

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
    // Background
    this.beliefBar.fillStyle(0x333333, 0.8)
    this.beliefBar.fillRect(px - barWidth / 2, py, barWidth, barHeight)
    // Fill based on belief
    const fillWidth = (this.belief / 100) * barWidth
    const colour = this.belief > 60 ? 0x44aa44 : this.belief > 30 ? 0xaaaa44 : 0xaa4444
    this.beliefBar.fillStyle(colour, 1)
    this.beliefBar.fillRect(px - barWidth / 2, py, fillWidth, barHeight)
  }

  // Returns tablets from the god's inventory that this village hasn't learned yet
  getNewTablets(godTablets) {
    return godTablets.filter(t => !this.tabletsReceived.has(t.stage))
  }

  // Called once per tablet during staggered delivery
  receiveTablet(tablet) {
    if (this.tabletsReceived.has(tablet.stage)) return false
    this.tabletsReceived.add(tablet.stage)
    this.stage = Math.min(this.stage + 1, 7)
    this.belief = Math.min(100, this.belief + 25)
    this.population += 3
    this.updateBeliefBar()

    // Flash the stage name; normal label refreshes in updatePopulation
    const stageNames = ['', 'Cave dwellers', 'Fire-makers', 'Farmers', 'Small village', 'Large village', 'Town', 'Civilisation']
    this.label.setText(`${this.name} — ${stageNames[this.stage]}`)

    // Upgrade visual
    this.upgradeVisual()

    // Flash effect
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: { from: 1, to: 0.3 },
      yoyo: true,
      duration: 150,
      repeat: 3,
    })

    return true
  }

  upgradeVisual() {
    // Add a secondary structure to show growth
    const px = this.tileX * TILE_SIZE + TILE_SIZE / 2
    const py = this.tileY * TILE_SIZE

    // Stage 2+: add a fire pit or second hut
    if (this.stage >= 2) {
      const firepit = this.scene.add.circle(px + TILE_SIZE * 5, py - 2, 3, 0xff6600, 0.8)
      firepit.setDepth(5)

      // Fire flicker
      this.scene.tweens.add({
        targets: firepit,
        alpha: { from: 0.8, to: 0.4 },
        scaleX: { from: 1, to: 1.3 },
        duration: 500,
        yoyo: true,
        repeat: -1,
      })

      // Small smoke column
      const smoke = this.scene.add.circle(px + TILE_SIZE * 5, py - 8, 2, 0x888888, 0.3)
      smoke.setDepth(5)
      this.scene.tweens.add({
        targets: smoke,
        y: py - 20,
        alpha: 0,
        duration: 2000,
        repeat: -1,
      })
    }
  }

  // Passive population growth or decline each tick.
  // Growth requires belief > 20; scales with stage, fertility, and belief.
  // Decline when belief collapses below 10 (people flee).
  updatePopulation(delta) {
    const cap = POP_CAPS[this.stage] || POP_CAPS[7]
    const dt = delta / 1000
    const prevPop = Math.floor(this.population)

    if (this.belief < DECLINE_THRESHOLD) {
      // Faith collapse: people flee, minimum 1 survivor
      this.population = Math.max(1, this.population - 0.2 * dt)
    } else if (this.belief > GROWTH_THRESHOLD && this.population < cap) {
      const beliefFactor = (this.belief - GROWTH_THRESHOLD) / (100 - GROWTH_THRESHOLD)
      const stageMul = 0.5 + this.stage * 0.2
      const fertilityMul = 0.5 + this.fertility
      this.population = Math.min(cap, this.population + BASE_GROWTH_RATE * beliefFactor * stageMul * fertilityMul * dt)
    }

    // Only touch the DOM when the displayed number actually changes
    if (Math.floor(this.population) !== prevPop) this._refreshLabel()
  }

  _refreshLabel() {
    this.label.setText(`${this.name} · ${Math.floor(this.population)}`)
  }

  // Passive belief generation when god is nearby
  updateBelief(godDistance, delta) {
    const proximityRange = TILE_SIZE * 30
    if (godDistance < proximityRange) {
      // Generate belief from proximity
      const rate = 5 * (1 - godDistance / proximityRange) // up to 5 per second
      this.belief = Math.min(100, this.belief + rate * delta / 1000)
    } else {
      // Slow decay when god is far away
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
