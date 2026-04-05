import { TILE_SIZE } from '../core/Constants.js'

// An ancient tablet: the key to advancing a village's civilisational stage.
// Found deep underground; must be physically carried to a village.
export default class Tablet {
  constructor(scene, tileX, tileY, stage) {
    this.scene = scene
    this.tileX = tileX
    this.tileY = tileY
    this.stage = stage // which civilisational stage this unlocks
    this.collected = false

    const px = tileX * TILE_SIZE + TILE_SIZE / 2
    const py = tileY * TILE_SIZE + TILE_SIZE / 2

    this.createSprite(scene, px, py)
    this.createGlow(scene, px, py)
  }

  createSprite(scene, px, py) {
    const size = TILE_SIZE
    const key = 'tablet-sprite'

    if (!scene.textures.exists(key)) {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')

      // Tablet: a small stone slab with glowing runes
      ctx.fillStyle = '#8a8a7a'
      ctx.fillRect(1, 1, size - 2, size - 2)
      // Rune marks
      ctx.fillStyle = '#00ffaa'
      ctx.fillRect(2, 2, 1, 1)
      ctx.fillRect(4, 3, 1, 1)
      ctx.fillRect(3, 5, 2, 1)
      ctx.fillRect(5, 2, 1, 2)
      // Border
      ctx.strokeStyle = '#6a6a5a'
      ctx.strokeRect(0.5, 0.5, size - 1, size - 1)

      scene.textures.addCanvas(key, canvas)
    }

    this.sprite = scene.add.sprite(px, py, key)
    this.sprite.setDepth(6)
  }

  createGlow(scene, px, py) {
    // Pulsing glow effect to make the tablet visible in dark caves
    this.glow = scene.add.circle(px, py, TILE_SIZE, 0x00ffaa, 0.15)
    this.glow.setDepth(5)

    scene.tweens.add({
      targets: this.glow,
      scaleX: { from: 1, to: 2 },
      scaleY: { from: 1, to: 2 },
      alpha: { from: 0.15, to: 0 },
      duration: 1500,
      repeat: -1,
    })
  }

  collect() {
    if (this.collected) return false
    this.collected = true
    this.sprite.setVisible(false)
    this.glow.setVisible(false)
    return true
  }

  get worldX() { return this.tileX * TILE_SIZE + TILE_SIZE / 2 }
  get worldY() { return this.tileY * TILE_SIZE + TILE_SIZE / 2 }
}
