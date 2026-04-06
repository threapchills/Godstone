import { GAME_WIDTH, GAME_HEIGHT, WORLD_WIDTH, TILE_SIZE } from '../core/Constants.js'

// Parallax background layers for atmospheric depth using SkyBaby assets.
export default class ParallaxSky {
  constructor(scene, params) {
    this.scene = scene
    this.layers = []
    
    // In order for tilesprites to fill the screen and repeat properly across the entire world,
    // we make them very wide (covering the world length) or use Phaser's TileSprite functionality.
    const worldPixelWidth = WORLD_WIDTH * TILE_SIZE
    
    // Far background: sky_layer_1
    const sky1 = scene.add.tileSprite(worldPixelWidth/2, GAME_HEIGHT * 0.4, worldPixelWidth, GAME_HEIGHT, 'sb_sky1')
    sky1.setScrollFactor(0.08, 0.2) // Parallax
    sky1.setAlpha(0.8)
    sky1.setDepth(-10)
    
    // Check if the texture exists before adding scale (it might fail if not loaded etc)
    if (sky1.texture && sky1.texture.source[0]) {
      // Scale vertically to mostly fill the top screen area but keep aspect ratio if needed, or just let it repeat.
      sky1.tileScaleY = GAME_HEIGHT / sky1.texture.source[0].height
      sky1.tileScaleX = sky1.tileScaleY
    }
    this.layers.push(sky1)

    // Mid layer: sky_layer_2
    const sky2 = scene.add.tileSprite(worldPixelWidth/2, GAME_HEIGHT * 0.5, worldPixelWidth, GAME_HEIGHT, 'sb_sky2')
    sky2.setScrollFactor(0.35, 0.4)
    sky2.setAlpha(0.55)
    sky2.setDepth(-9)
    if (sky2.texture && sky2.texture.source[0]) {
      sky2.tileScaleY = GAME_HEIGHT / sky2.texture.source[0].height
      sky2.tileScaleX = sky2.tileScaleY
    }
    this.layers.push(sky2)

    // Near layer: clouds_fg
    const clouds = scene.add.tileSprite(worldPixelWidth/2, GAME_HEIGHT * 0.6, worldPixelWidth, GAME_HEIGHT, 'sb_clouds')
    clouds.setScrollFactor(0.65, 0.6)
    clouds.setAlpha(0.4)
    clouds.setDepth(-8)
    if (clouds.texture && clouds.texture.source[0]) {
        clouds.tileScaleY = GAME_HEIGHT / clouds.texture.source[0].height
        clouds.tileScaleX = clouds.tileScaleY
    }
    this.layers.push(clouds)
    
    // Update loop function to move the clouds slightly over time
    // Called manually from WorldScene update to respect time dilation
  }

  update(dilatedDelta) {
    // Auto-scroll the clouds based on time (like wind)
    const dtSeconds = dilatedDelta / 1000
    if (this.layers[0]) this.layers[0].tilePositionX += 1 * dtSeconds
    if (this.layers[1]) this.layers[1].tilePositionX += 4 * dtSeconds
    if (this.layers[2]) this.layers[2].tilePositionX += 10 * dtSeconds
  }

  destroy() {
    this.layers.forEach(layer => layer.destroy())
    this.layers = []
  }
}
