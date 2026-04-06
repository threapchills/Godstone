import { WORLD_WIDTH, TILE_SIZE, GAME_WIDTH, GAME_HEIGHT } from '../core/Constants.js'

// Large foreground silhouettes (Silksong-style depth). These sit
// between the player and the camera at scrollFactor > 1.0, creating
// the impression of a canopy or cliff face in the extreme foreground.

export default class ParallaxForeground {
  constructor(scene, palette) {
    this.scene = scene
    this.items = []
    this.time = 0

    const worldPixelWidth = WORLD_WIDTH * TILE_SIZE
    const numObjects = 15

    for (let i = 0; i < numObjects; i++) {
      const x = Math.random() * worldPixelWidth
      // Anchor to the bottom third: canopy / cliff silhouettes
      const y = GAME_HEIGHT * 0.5 + Math.random() * GAME_HEIGHT * 0.6

      const sprite = scene.add.sprite(x, y, 'sb_tree')
      sprite.setOrigin(0.5, 1)

      // SkyBaby tree is 942px wide; we want ~200-400px screen silhouettes
      const scale = 0.2 + Math.random() * 0.2
      sprite.setScale(scale)

      const scrollFactor = 1.3 + Math.random() * 0.1
      sprite.setScrollFactor(scrollFactor, 1.0)

      // Silhouette tint: derived from ground colour, pushed much darker
      const groundCol = palette[1] || 0x222222
      const r = Math.max(0, ((groundCol >> 16) & 0xff) - 40)
      const g = Math.max(0, ((groundCol >> 8) & 0xff) - 40)
      const b = Math.max(0, (groundCol & 0xff) - 40)
      sprite.setTint((r << 16) | (g << 8) | b)

      // Subtle atmospheric silhouette; never occluding
      sprite.setAlpha(0.25)
      sprite.setDepth(20)

      this.items.push({
        sprite,
        baseX: x,
        baseScale: scale,
        scrollFactor,
        // Wind sway phase offset
        swayPhase: Math.random() * Math.PI * 2,
      })
    }
  }

  // Instant teleport compensation when the world wraps the god
  shiftWrap(worldDeltaX) {
    for (const item of this.items) {
      item.sprite.x += worldDeltaX * item.scrollFactor
    }
  }

  update(camScrollX) {
    this.time += 0.016 // ~60fps assumed; close enough for sway

    const worldPixelWidth = WORLD_WIDTH * TILE_SIZE

    for (const item of this.items) {
      // Gentle wind sway rotation
      const sway = Math.sin(this.time * 0.6 + item.swayPhase) * 0.03
      item.sprite.rotation = sway

      // Wrap silhouettes that drift too far off screen due to parallax
      let screenX = item.sprite.x - camScrollX * item.scrollFactor
      if (screenX < -2000) {
        item.sprite.x += worldPixelWidth * item.scrollFactor
      } else if (screenX > GAME_WIDTH + 2000) {
        item.sprite.x -= worldPixelWidth * item.scrollFactor
      }
    }
  }

  destroy() {
    this.items.forEach(i => i.sprite.destroy())
    this.items = []
  }
}
