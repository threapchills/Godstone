import { TILE_SIZE } from '../core/Constants.js'
import { findGroundTileY } from '../utils/Grounding.js'

// The portal henge: a Stonehenge-like structure, one per world.
// The sole gateway to the omniverse. Phase 1 just renders it;
// actual portal mechanics come in Phase 4.
export default class PortalHenge {
  constructor(scene, tileX, tileY, params) {
    this.scene = scene
    this.tileX = tileX
    this.tileY = tileY

    const px = tileX * TILE_SIZE + TILE_SIZE * 3
    const py = tileY * TILE_SIZE

    this.createSprite(scene, px, py, params)
    this.createLabel(scene, px, py)
    this.createGlow(scene, px, py, params)
  }

  // Re-snap the portal sprite to the current ground beneath it. The
  // label and the glow ride on the sprite's y so they all move
  // together. Bounded so a portal next to a chasm doesn't fall in.
  updateGrounding() {
    const grid = this.scene.worldGrid?.grid
    if (!grid || !this.sprite) return
    const tileX = Math.floor(this.sprite.x / TILE_SIZE)
    const startTileY = Math.max(0, Math.floor(this.sprite.y / TILE_SIZE) - 2)
    const groundTileY = findGroundTileY(grid, tileX, startTileY, this.tileY)
    const targetY = groundTileY * TILE_SIZE
    if (Math.abs(this.sprite.y - targetY) > 0.5) {
      const dy = targetY - this.sprite.y
      this.sprite.y = targetY
      if (this.label) this.label.y += dy
      if (this.glow) this.glow.y += dy
    }
  }

  createSprite(scene, px, py, params) {
    const width = TILE_SIZE * 7
    const height = TILE_SIZE * 6
    const key = 'portal-henge'

    if (!scene.textures.exists(key)) {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')

      const stoneColour = '#7a7a6a'
      const darkStone = '#4a4a3a'
      const portalGlow = '#4488cc'

      // Left pillar
      ctx.fillStyle = stoneColour
      ctx.fillRect(4, 8, 8, height - 8)
      ctx.fillStyle = darkStone
      ctx.fillRect(4, 8, 2, height - 8)

      // Right pillar
      ctx.fillStyle = stoneColour
      ctx.fillRect(width - 12, 8, 8, height - 8)
      ctx.fillStyle = darkStone
      ctx.fillRect(width - 12, 8, 2, height - 8)

      // Lintel across the top
      ctx.fillStyle = stoneColour
      ctx.fillRect(2, 4, width - 4, 8)
      ctx.fillStyle = darkStone
      ctx.fillRect(2, 4, width - 4, 2)

      // Inner pillars (shorter)
      ctx.fillStyle = darkStone
      ctx.fillRect(16, 16, 5, height - 16)
      ctx.fillRect(width - 21, 16, 5, height - 16)

      // Portal glow inside the archway
      ctx.fillStyle = portalGlow
      ctx.globalAlpha = 0.15
      ctx.fillRect(12, 12, width - 24, height - 12)
      ctx.globalAlpha = 0.3
      ctx.fillRect(20, 16, width - 40, height - 20)
      ctx.globalAlpha = 1

      // Rune marks on pillars
      ctx.fillStyle = '#88aacc'
      ctx.globalAlpha = 0.6
      // Left pillar runes
      ctx.fillRect(6, 14, 2, 2)
      ctx.fillRect(7, 22, 2, 2)
      ctx.fillRect(6, 30, 2, 2)
      // Right pillar runes
      ctx.fillRect(width - 8, 14, 2, 2)
      ctx.fillRect(width - 9, 22, 2, 2)
      ctx.fillRect(width - 8, 30, 2, 2)
      ctx.globalAlpha = 1

      // Capstone decoration
      ctx.fillStyle = '#aaaaaa'
      ctx.fillRect(width / 2 - 3, 2, 6, 3)

      scene.textures.addCanvas(key, canvas)
    }

    this.sprite = scene.add.sprite(px, py, key)
    this.sprite.setOrigin(0.5, 1)
    this.sprite.setDepth(5)
  }

  createLabel(scene, px, py) {
    this.label = scene.add.text(px, py - TILE_SIZE * 7, 'Portal henge', {
      fontFamily: 'Georgia, serif',
      fontSize: '10px',
      color: '#88aacc',
      stroke: '#000000',
      strokeThickness: 2,
    })
    this.label.setOrigin(0.5, 1)
    this.label.setDepth(9)
  }

  createGlow(scene, px, py, params) {
    // Pulsing ambient glow
    this.glow = scene.add.ellipse(px, py - TILE_SIZE * 2.5, TILE_SIZE * 4, TILE_SIZE * 5, 0x4488cc, 0.08)
    this.glow.setDepth(4)

    scene.tweens.add({
      targets: this.glow,
      alpha: { from: 0.08, to: 0.02 },
      scaleX: { from: 1, to: 1.2 },
      scaleY: { from: 1, to: 1.1 },
      duration: 3000,
      yoyo: true,
      repeat: -1,
    })
  }

  get worldX() { return this.tileX * TILE_SIZE + TILE_SIZE * 3 }
  get worldY() { return this.tileY * TILE_SIZE }
}
