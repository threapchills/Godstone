import { GAME_WIDTH, GAME_HEIGHT } from '../core/Constants.js'
import { buildPalette } from '../world/TileTypes.js'

// Parallax background layers for atmospheric depth.
// Multiple gradient strips scroll at different rates.
export default class ParallaxSky {
  constructor(scene, params) {
    this.scene = scene
    const palette = buildPalette(params.element1, params.element2, params.elementRatio)

    // Extract sky base colour
    const skyR = (palette.skyColour >> 16) & 0xff
    const skyG = (palette.skyColour >> 8) & 0xff
    const skyB = palette.skyColour & 0xff

    this.layers = []

    // Far background: subtle gradient strip (slowest parallax)
    this.layers.push(this.createLayer(scene, {
      y: 0,
      height: GAME_HEIGHT * 0.4,
      colour: { r: skyR + 15, g: skyG + 10, b: skyB + 20 },
      alpha: 0.3,
      scrollFactor: 0.02,
      depth: -10,
    }))

    // Mid layer: slightly brighter horizon band
    this.layers.push(this.createLayer(scene, {
      y: GAME_HEIGHT * 0.25,
      height: GAME_HEIGHT * 0.3,
      colour: { r: skyR + 25, g: skyG + 15, b: skyB + 30 },
      alpha: 0.2,
      scrollFactor: 0.05,
      depth: -9,
    }))

    // Near layer: atmospheric haze
    this.layers.push(this.createLayer(scene, {
      y: GAME_HEIGHT * 0.5,
      height: GAME_HEIGHT * 0.5,
      colour: { r: skyR + 8, g: skyG + 5, b: skyB + 10 },
      alpha: 0.15,
      scrollFactor: 0.08,
      depth: -8,
    }))
  }

  createLayer(scene, config) {
    const { y, height, colour, alpha, scrollFactor, depth } = config
    const r = Math.min(255, Math.max(0, colour.r))
    const g = Math.min(255, Math.max(0, colour.g))
    const b = Math.min(255, Math.max(0, colour.b))
    const hex = (r << 16) | (g << 8) | b

    const rect = scene.add.rectangle(GAME_WIDTH / 2, y + height / 2, GAME_WIDTH * 3, height, hex, alpha)
    rect.setScrollFactor(scrollFactor)
    rect.setDepth(depth)
    return rect
  }
}
