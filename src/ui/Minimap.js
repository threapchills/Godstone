import { WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE, GAME_WIDTH, GAME_HEIGHT } from '../core/Constants.js'
import { TILES, buildPalette } from '../world/TileTypes.js'

const MAP_WIDTH = 160
const MAP_HEIGHT = 80
const MARGIN = 10

// A tiny overview of the entire world, rendered to a texture once,
// with the god's position drawn each frame.
export default class Minimap {
  constructor(scene, worldGrid, params) {
    this.scene = scene
    this.worldGrid = worldGrid

    // Render the minimap texture once
    const palette = buildPalette(params.element1, params.element2, params.elementRatio)
    this.mapTexture = this.renderMapTexture(worldGrid, palette)

    // Position in bottom-right corner
    const x = GAME_WIDTH - MAP_WIDTH - MARGIN
    const y = GAME_HEIGHT - MAP_HEIGHT - MARGIN

    // Background border
    this.border = scene.add.rectangle(
      x + MAP_WIDTH / 2, y + MAP_HEIGHT / 2,
      MAP_WIDTH + 4, MAP_HEIGHT + 4,
      0x000000, 0.7
    ).setScrollFactor(0).setDepth(45)

    // Map image
    this.mapImage = scene.add.image(x, y, 'minimap')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(46)

    // God position marker (bright dot)
    this.godDot = scene.add.circle(x, y, 2, 0xffd700, 1)
      .setScrollFactor(0)
      .setDepth(47)

    // Village markers
    this.villageDots = []

    // Store base position for updates
    this.baseX = x
    this.baseY = y
  }

  renderMapTexture(worldGrid, palette) {
    const canvas = document.createElement('canvas')
    canvas.width = MAP_WIDTH
    canvas.height = MAP_HEIGHT
    const ctx = canvas.getContext('2d')

    // Scale: how many world tiles per minimap pixel
    const scaleX = WORLD_WIDTH / MAP_WIDTH
    const scaleY = WORLD_HEIGHT / MAP_HEIGHT

    for (let mx = 0; mx < MAP_WIDTH; mx++) {
      for (let my = 0; my < MAP_HEIGHT; my++) {
        // Sample the dominant tile in this region
        const wx = Math.floor(mx * scaleX)
        const wy = Math.floor(my * scaleY)
        const tile = worldGrid.grid[wy * WORLD_WIDTH + wx]

        const colour = palette[tile]
        if (colour == null) {
          // Air: use sky colour with slight depth gradient
          const depth = my / MAP_HEIGHT
          const skyR = ((palette.skyColour >> 16) & 0xff) + depth * 20
          const skyG = ((palette.skyColour >> 8) & 0xff) + depth * 10
          const skyB = (palette.skyColour & 0xff) + depth * 20
          ctx.fillStyle = `rgb(${Math.floor(skyR)},${Math.floor(skyG)},${Math.floor(skyB)})`
        } else {
          const r = (colour >> 16) & 0xff
          const g = (colour >> 8) & 0xff
          const b = colour & 0xff
          ctx.fillStyle = `rgb(${r},${g},${b})`
        }
        ctx.fillRect(mx, my, 1, 1)
      }
    }

    if (this.scene.textures.exists('minimap')) {
      this.scene.textures.remove('minimap')
    }
    this.scene.textures.addCanvas('minimap', canvas)
    return canvas
  }

  addVillageMarker(village) {
    const mx = this.baseX + (village.tileX / WORLD_WIDTH) * MAP_WIDTH
    const my = this.baseY + (village.tileY / WORLD_HEIGHT) * MAP_HEIGHT
    const dot = this.scene.add.circle(mx, my, 2, 0xdaa520, 1)
      .setScrollFactor(0)
      .setDepth(47)
    this.villageDots.push(dot)
  }

  addTabletMarker(tablet) {
    if (tablet.collected) return null
    const mx = this.baseX + (tablet.tileX / WORLD_WIDTH) * MAP_WIDTH
    const my = this.baseY + (tablet.tileY / WORLD_HEIGHT) * MAP_HEIGHT
    const dot = this.scene.add.circle(mx, my, 1.5, 0x00ffaa, 0.8)
      .setScrollFactor(0)
      .setDepth(47)
    return dot
  }

  update(godSprite) {
    // Update god position on minimap
    const godTileX = godSprite.x / TILE_SIZE
    const godTileY = godSprite.y / TILE_SIZE
    this.godDot.x = this.baseX + (godTileX / WORLD_WIDTH) * MAP_WIDTH
    this.godDot.y = this.baseY + (godTileY / WORLD_HEIGHT) * MAP_HEIGHT
  }
}
