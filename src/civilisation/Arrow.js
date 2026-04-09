import Phaser from 'phaser'
import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT, GRAVITY } from '../core/Constants.js'
import { SOLID_TILES } from '../world/TileTypes.js'

// Arrow projectile. Fired by combat warriors, flies in a straight line
// with a fast velocity and leaves a short additive trail so the eye can
// track volleys during big battles. Hits the first enemy it touches; a
// few tiles of terrain penetration before burying harmlessly in a wall.
//
// Direct port of Sky Baby's Projectile class in SOAR/js/entities.js,
// adapted to Phaser arcade physics and Godstone's tile grid. The key
// differences: Phaser owns the body, world wrap uses the scene's
// WORLD_WIDTH, and terrain hits sample the worldGrid instead of a
// rectangle wall list.

const ARROW_SPEED = 520
const ARROW_LIFE_MS = 2800
const TRAIL_INTERVAL_MS = 35
const MAX_TRAILS = 6

export default class Arrow {
  constructor(scene, x, y, angle, team, damage) {
    this.scene = scene
    this.team = team
    this.damage = damage
    this.dead = false
    this._trailTimer = 0
    this._life = ARROW_LIFE_MS

    const key = 'combat-arrow'
    if (!scene.textures.exists(key)) {
      const c = document.createElement('canvas')
      c.width = 12
      c.height = 3
      const ctx = c.getContext('2d')
      // Pale wooden shaft with a darker iron head
      ctx.fillStyle = '#d9c89a'
      ctx.fillRect(0, 1, 9, 1)
      ctx.fillStyle = '#9a7a44'
      ctx.fillRect(0, 0, 3, 1)
      ctx.fillRect(0, 2, 3, 1)
      ctx.fillStyle = '#555555'
      ctx.fillRect(9, 0, 3, 3)
      scene.textures.addCanvas(key, c)
    }

    this.sprite = scene.add.image(x, y, key)
    this.sprite.setOrigin(0.5, 0.5)
    this.sprite.setDepth(14)
    this.sprite.setRotation(angle)

    this.vx = Math.cos(angle) * ARROW_SPEED
    this.vy = Math.sin(angle) * ARROW_SPEED

    // Arrow release sound: short procedural whoosh via Web Audio
    this._playShootSound()
  }

  _playShootSound() {
    try {
      const ambience = this.scene.ambience
      if (!ambience?.ctx) return
      const ctx = ambience.ctx
      // Short noise burst shaped as a whoosh
      const duration = 0.06
      const buf = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < data.length; i++) {
        const t = i / data.length
        data[i] = (Math.random() * 2 - 1) * (1 - t) * 0.15
      }
      const src = ctx.createBufferSource()
      src.buffer = buf
      const gain = ctx.createGain()
      gain.gain.value = 0.08
      src.connect(gain).connect(ctx.destination)
      src.start()
    } catch (e) { /* audio not ready */ }
  }

  update(delta) {
    if (this.dead) return
    const dt = delta / 1000
    this._life -= delta
    if (this._life <= 0) { this._retire(); return }

    this.sprite.x += this.vx * dt
    this.sprite.y += this.vy * dt

    // Horizontal wrap: arrows that cross the world seam continue on
    // the other side so long-range volleys still reach around the planet.
    const worldPx = WORLD_WIDTH * TILE_SIZE
    if (this.sprite.x < 0) this.sprite.x += worldPx
    else if (this.sprite.x >= worldPx) this.sprite.x -= worldPx

    if (this.sprite.y < 0 || this.sprite.y > WORLD_HEIGHT * TILE_SIZE) {
      this._retire()
      return
    }

    // Terrain hit: sample the world grid. Bolts bury in the first solid
    // tile they touch. Liquids are passed through (arrows skip water).
    const grid = this.scene.worldGrid?.grid
    if (grid) {
      const tx = ((Math.floor(this.sprite.x / TILE_SIZE) % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH
      const ty = Math.floor(this.sprite.y / TILE_SIZE)
      if (ty >= 0 && ty < WORLD_HEIGHT) {
        const tile = grid[ty * WORLD_WIDTH + tx]
        if (SOLID_TILES.has(tile)) { this._retire(); return }
      }
    }

    // Trail particle
    this._trailTimer -= delta
    if (this._trailTimer <= 0) {
      this._trailTimer = TRAIL_INTERVAL_MS
      this._spawnTrail()
    }
  }

  _spawnTrail() {
    const colour = this.team === 'enemy' ? 0xff9966 : 0xaaf0ee
    const trail = this.scene.add.circle(this.sprite.x, this.sprite.y, 1.4, colour, 0.65)
      .setDepth(13)
      .setBlendMode(Phaser.BlendModes.ADD)
    this.scene.tweens.add({
      targets: trail,
      alpha: 0,
      scale: 0.2,
      duration: 240,
      onComplete: () => trail.destroy(),
    })
  }

  _retire() {
    this.dead = true
    if (this.sprite) { this.sprite.destroy(); this.sprite = null }
  }

  // Rectangle-rectangle hit check. Sky Baby used a simple AABB; we
  // pad the arrow's sprite to a minimum radius so the test is forgiving.
  hits(target) {
    if (this.dead || !target?.sprite || !this.sprite) return false
    const dx = target.sprite.x - this.sprite.x
    const dy = target.sprite.y - this.sprite.y
    const r = (target.sprite.width || 16) * 0.5 + 6
    return (dx * dx + dy * dy) <= r * r
  }
}
