import { WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE, GAME_WIDTH } from '../core/Constants.js'
import { TILES, buildPalette } from './TileTypes.js'

// Padding columns on each side for seamless horizontal wrapping
export const WRAP_PAD = Math.ceil(GAME_WIDTH / TILE_SIZE / 2) + 8

// Generate a tileset texture at runtime from the element palette.
// Each tile type gets one TILE_SIZE x TILE_SIZE coloured square with subtle variation.
export function createTilesetTexture(scene, params) {
  const palette = buildPalette(params.element1, params.element2, params.elementRatio)
  const tileCount = 52 // enough IDs to cover all tile types including markers

  const texWidth = tileCount * TILE_SIZE
  const texHeight = TILE_SIZE

  const canvas = document.createElement('canvas')
  canvas.width = texWidth
  canvas.height = texHeight
  const ctx = canvas.getContext('2d')

  // Draw each tile type as a coloured block with slight pixel noise
  for (let tileId = 0; tileId < tileCount; tileId++) {
    const colour = palette[tileId]
    if (colour == null) continue // air is transparent

    const baseR = (colour >> 16) & 0xff
    const baseG = (colour >> 8) & 0xff
    const baseB = colour & 0xff

    for (let py = 0; py < TILE_SIZE; py++) {
      for (let px = 0; px < TILE_SIZE; px++) {
        // Subtle per-pixel variation for texture
        const variation = (Math.random() - 0.5) * 16
        const r = Math.max(0, Math.min(255, baseR + variation))
        const g = Math.max(0, Math.min(255, baseG + variation))
        const b = Math.max(0, Math.min(255, baseB + variation))
        ctx.fillStyle = `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)})`
        ctx.fillRect(tileId * TILE_SIZE + px, py, 1, 1)
      }
    }
  }

  // Add the texture to Phaser
  if (scene.textures.exists('worldTiles')) {
    scene.textures.remove('worldTiles')
  }
  scene.textures.addCanvas('worldTiles', canvas)

  return palette
}

// Build a Phaser tilemap from the world grid data.
// Adds WRAP_PAD columns on each side so the camera sees mirrored
// terrain at the horizontal edges, making the world loop seamlessly.
export function createTilemap(scene, worldData) {
  const { grid } = worldData
  const totalWidth = WORLD_WIDTH + 2 * WRAP_PAD

  const data = []
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    const row = []
    for (let x = 0; x < totalWidth; x++) {
      // Map padded column back to the logical world column
      let wx = x - WRAP_PAD
      wx = ((wx % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH
      const tile = grid[y * WORLD_WIDTH + wx]
      row.push(tile === TILES.AIR ? -1 : tile)
    }
    data.push(row)
  }

  const map = scene.make.tilemap({
    data,
    tileWidth: TILE_SIZE,
    tileHeight: TILE_SIZE,
  })

  const tileset = map.addTilesetImage('worldTiles', 'worldTiles', TILE_SIZE, TILE_SIZE, 0, 0)
  // Offset the layer so padded column WRAP_PAD aligns with world x=0
  const layer = map.createLayer(0, tileset, -WRAP_PAD * TILE_SIZE, 0)

  return { map, layer }
}

// Set collision on solid tiles in the tilemap layer
export function setupCollision(layer) {
  // All non-air, non-liquid tiles are solid
  const solidIds = [
    TILES.SURFACE, TILES.SOIL, TILES.STONE, TILES.BEDROCK,
    TILES.SAND, TILES.ICE, TILES.CLAY, TILES.VOLCANIC_ROCK,
    TILES.CORAL, TILES.CRYSTAL, TILES.MAGMA_ROCK, TILES.CLOUD,
  ]
  layer.setCollision(solidIds)
}
