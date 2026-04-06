import { WORLD_WIDTH, TILE_SIZE, GAME_WIDTH, GAME_HEIGHT } from '../core/Constants.js'

export default class ParallaxForeground {
  constructor(scene, palette) {
    this.scene = scene
    this.items = []
    
    const worldPixelWidth = WORLD_WIDTH * TILE_SIZE
    
    // Create large foreground objects (ala Silksong)
    // We space them out sparsely, but spread across the whole world
    const numObjects = 15
    for (let i = 0; i < numObjects; i++) {
      const x = Math.random() * worldPixelWidth
      // Y anchors heavily to the bottom third to look like canopy
      const y = GAME_HEIGHT * 0.5 + Math.random() * GAME_HEIGHT * 0.6
      
      const sprite = scene.add.sprite(x, y, 'sb_tree')
      sprite.setOrigin(0.5, 1)
      
      // Extremely huge size
      sprite.setScale(6 + Math.random() * 4)
      
      // Foreground scroll factor
      const scrollFactor = 1.3 + Math.random() * 0.1
      sprite.setScrollFactor(scrollFactor, 1.0)
      
      // Pure silhouette tint derived from ground colour but darker
      const groundCol = palette[1] || 0x222222
      const r = Math.max(0, ((groundCol >> 16) & 0xff) - 40)
      const g = Math.max(0, ((groundCol >> 8) & 0xff) - 40)
      const b = Math.max(0, (groundCol & 0xff) - 40)
      sprite.setTint((r << 16) | (g << 8) | b)
      
      // Keep alpha subtle so it doesn't entirely blind the player
      sprite.setAlpha(0.85)

      // Extreme foreground depth
      sprite.setDepth(20)

      // Blur out of focus feeling using simple CSS or Phaser pipeline? 
      // Phaser default pipeline doesn't have blur, but we can make it darker.
      
      this.items.push({
        sprite,
        baseX: x,
        scrollFactor
      })
    }
  }

  // Called when the world seamlessly teleports the player
  shiftWrap(worldDeltaX) {
    // If the god jumps right by W (meaning he went negative and wrapped around)
    // The camera also instantly jumps by W. 
    // To prevent the scrollFactor from ruining the sync, we must teleport 
    // the foreground sprite by W * scrollFactor!
    for (const item of this.items) {
      item.sprite.x += worldDeltaX * item.scrollFactor
    }
  }

  update(camScrollX) {
    // If foreground objects drift too far from the camera due to parallax, 
    // wrap them back around so they continually cycle infinitely.
    const worldPixelWidth = WORLD_WIDTH * TILE_SIZE
    for (const item of this.items) {
      // The visual position relative to camera is `sprite.x - camScrollX * scrollFactor`
      let screenX = item.sprite.x - camScrollX * item.scrollFactor
      
      if (screenX < -2000) {
        // Way off left edge, wrap to right
        item.sprite.x += worldPixelWidth * item.scrollFactor
      } else if (screenX > GAME_WIDTH + 2000) {
        // Way off right edge, wrap to left
        item.sprite.x -= worldPixelWidth * item.scrollFactor
      }
    }
  }

  destroy() {
    this.items.forEach(i => i.sprite.destroy())
    this.items = []
  }
}
