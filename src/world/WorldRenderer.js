import { WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE, GAME_WIDTH } from '../core/Constants.js'
import { TILES, buildPalette } from './TileTypes.js'

// Padding columns on each side for seamless horizontal wrapping
export const WRAP_PAD = Math.ceil(GAME_WIDTH / TILE_SIZE / 2) + 8

// Generate a tileset texture at runtime from the element palette and skybaby assets.
export function createTilesetTexture(scene, params) {
  const palette = buildPalette(params.element1, params.element2, params.elementRatio)
  const tileCount = 52 // enough IDs to cover all tile types including markers

  const texWidth = tileCount * TILE_SIZE
  const texHeight = TILE_SIZE

  const canvas = document.createElement('canvas')
  canvas.width = texWidth
  canvas.height = texHeight
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true // Allow smooth downscaling of massive skybaby assets

  const texTileset = scene.textures.get('sb_tileset')?.getSourceImage()
  const texTree = scene.textures.get('sb_tree')?.getSourceImage()
  const texGrass = scene.textures.get('sb_grass')?.getSourceImage()

  for (let tileId = 0; tileId < tileCount; tileId++) {
    const colour = palette[tileId]
    if (colour == null) continue // air is transparent
    
    const px = tileId * TILE_SIZE
    ctx.save()

    // Pick sprite based on tile type
    if (tileId === TILES.TREE_LEAVES || tileId === TILES.TREE_TRUNK || tileId === TILES.MUSHROOM) {
      if (texTree) ctx.drawImage(texTree, px, 0, TILE_SIZE, TILE_SIZE)
      else ctx.fillRect(px, 0, TILE_SIZE, TILE_SIZE)
    } else if (tileId === TILES.TALL_GRASS || tileId === TILES.BUSH) {
      if (texGrass) ctx.drawImage(texGrass, px, 0, TILE_SIZE, TILE_SIZE)
      else ctx.fillRect(px, 0, TILE_SIZE, TILE_SIZE)
    } else {
      // Ground, liquids, solids -> use parts of the tileset
      if (texTileset) {
        let sliceW = Math.floor(texTileset.width / 3)
        // Pick left, mid, or right randomly to vary blocks
        const sx = Math.floor(Math.random() * 3) * sliceW
        ctx.drawImage(texTileset, sx, 0, sliceW, texTileset.height, px, 0, TILE_SIZE, TILE_SIZE)
      } else {
        ctx.fillRect(px, 0, TILE_SIZE, TILE_SIZE)
      }
    }

    // Apply procedural hue shift by drawing a colored rectangle over it with 'multiply' blend mode
    ctx.globalCompositeOperation = 'multiply'
    const baseR = (colour >> 16) & 0xff
    const baseG = (colour >> 8) & 0xff
    const baseB = colour & 0xff
    ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`
    ctx.fillRect(px, 0, TILE_SIZE, TILE_SIZE)

    ctx.restore()
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
