import { WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE, GAME_WIDTH } from '../core/Constants.js'
import {
  TILES,
  TILE_VARIANTS,
  VARIANT_TO_BASE,
  ALL_RENDER_IDS,
  MAX_RENDER_ID,
  SOLID_TILES,
  buildPalette,
  renderIdFor,
} from './TileTypes.js'

// Padding columns on each side for seamless horizontal wrapping
export const WRAP_PAD = Math.ceil(GAME_WIDTH / TILE_SIZE / 2) + 50

// Non-cryptographic hash for per-cell noise seeding. Deterministic so the
// tileset canvas is identical between reloads for the same world seed.
function cellSeed(id, salt) {
  let h = (id | 0) * 0x27d4eb2f + (salt | 0) * 0x165667b1
  h = (h ^ (h >>> 15)) * 0x85ebca6b
  return (h ^ (h >>> 13)) >>> 0
}

// Stamp dithered noise onto a cell so flat colours get grit and texture.
// Uses a small xorshift fed by (id, salt) so each variant gets a unique but
// reproducible speckle pattern. Alpha is low so the underlying base still reads.
function drawNoiseCell(ctx, px, py, size, id, salt) {
  let s = cellSeed(id, salt) || 1
  const rand = () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) / 0xffffffff)
  }
  // About one speck per 6 pixels; enough to break uniformity without looking noisy
  const specks = Math.floor((size * size) / 6)
  for (let i = 0; i < specks; i++) {
    const x = px + Math.floor(rand() * size)
    const y = py + Math.floor(rand() * size)
    const dark = rand() > 0.5
    ctx.fillStyle = dark ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.16)'
    ctx.fillRect(x, y, 1, 1)
  }
}

// Map each base tile type to its storybook source sprite key.
// The tileset canvas stamps one cell per render ID; this lookup picks
// which hand-painted tile image provides the texture for that cell.
// Variants of the same base share the source but get different crop
// regions and orientation flips so neighbouring tiles never repeat.
const TILE_SOURCE_MAP = {
  [TILES.SURFACE]:       'sb_grass_block',
  [TILES.SOIL]:          'sb_dirt_block',
  [TILES.STONE]:         'sb_cave_block',
  [TILES.BEDROCK]:       'sb_cave_block',
  [TILES.SAND]:          'sb_desert_block',
  [TILES.ICE]:           'sb_snow_block',
  [TILES.CLAY]:          'sb_dirt_block',
  [TILES.VOLCANIC_ROCK]: 'sb_lava_block',
  [TILES.CORAL]:         'sb_cave_block',
  [TILES.CRYSTAL]:       'sb_cave_block',
  [TILES.WATER]:         'sb_water_surface',
  [TILES.DEEP_WATER]:    'sb_deep_water',
  [TILES.LAVA]:          'sb_lava_block',
  [TILES.MAGMA_ROCK]:    'sb_lava_block',
  [TILES.CLOUD]:         'sb_snow_block',
  [TILES.TREE_TRUNK]:    'sb_dirt_block',
  [TILES.TREE_LEAVES]:   'sb_grass_block',
  [TILES.BUSH]:          'sb_grass_block',
  [TILES.TALL_GRASS]:    'sb_grass_block',
  [TILES.MUSHROOM]:      'sb_dirt_block',
}

// Generate the tileset texture using storybook illustration sprites as
// source material. Each cell in the tileset canvas is one render ID's
// visual. The process: sample a region of the matching storybook tile
// sprite, desaturate it to a luminance base, then multiply-blend the
// palette colour on top. This preserves the hand-painted texture and
// lighting detail of the storybook art while honouring the per-world
// elemental colour scheme. A light noise speckle adds final grit.
export function createTilesetTexture(scene, params) {
  const palette = buildPalette(params)

  const cellCount = MAX_RENDER_ID + 1
  const texWidth = cellCount * TILE_SIZE
  const texHeight = TILE_SIZE

  const canvas = document.createElement('canvas')
  canvas.width = texWidth
  canvas.height = texHeight
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true

  // Pre-fetch all source images once so the inner loop is cheap
  const sourceCache = {}
  for (const key of Object.values(TILE_SOURCE_MAP)) {
    if (!sourceCache[key]) {
      sourceCache[key] = scene.textures.get(key)?.getSourceImage() || null
    }
  }
  // Fallbacks for legacy assets
  const texTileset = scene.textures.get('sb_tileset')?.getSourceImage()
  const texTree = scene.textures.get('sb_tree')?.getSourceImage()
  const texGrass = scene.textures.get('sb_grass')?.getSourceImage()

  // Orientation combos for variant diversity. Each variant samples a
  // different crop region of the source and applies mirror/rotation so
  // the tilemap never looks like a single stamped pattern.
  const sliceLayout = [
    { cropFracX: 0.00, cropFracY: 0.00, mirrorX: false, mirrorY: false, rotate: 0 },
    { cropFracX: 0.25, cropFracY: 0.15, mirrorX: true,  mirrorY: false, rotate: 0 },
    { cropFracX: 0.50, cropFracY: 0.30, mirrorX: false, mirrorY: true,  rotate: 0 },
    { cropFracX: 0.10, cropFracY: 0.50, mirrorX: true,  mirrorY: true,  rotate: 0 },
    { cropFracX: 0.35, cropFracY: 0.60, mirrorX: false, mirrorY: false, rotate: 90 },
    { cropFracX: 0.65, cropFracY: 0.20, mirrorX: true,  mirrorY: false, rotate: 180 },
  ]

  const isVegetation = (baseId) =>
    baseId === TILES.TREE_LEAVES || baseId === TILES.TREE_TRUNK ||
    baseId === TILES.MUSHROOM
  const isGrassy = (baseId) =>
    baseId === TILES.TALL_GRASS || baseId === TILES.BUSH

  for (const id of ALL_RENDER_IDS) {
    const colour = palette[id]
    if (colour == null) continue

    const baseId = VARIANT_TO_BASE[id] ?? id
    const variantIndex = TILE_VARIANTS[baseId] ? TILE_VARIANTS[baseId].indexOf(id) : 0
    const px = id * TILE_SIZE
    const layout = sliceLayout[variantIndex % sliceLayout.length]

    // Resolve the source sprite for this tile type
    const sourceKey = TILE_SOURCE_MAP[baseId]
    const sourceImg = sourceKey ? sourceCache[sourceKey] : null

    ctx.save()
    ctx.globalCompositeOperation = 'source-over'
    // Desaturate and brighten so the palette multiply reads cleanly
    ctx.filter = 'grayscale(100%) brightness(1.2) contrast(0.92)'

    if (sourceImg) {
      // Sample a TILE_SIZE region from the source image at the crop offset
      // determined by the variant. The source sprites are much larger than
      // 8px, so we're sampling a small region and scaling it down, which
      // gives each cell unique texture detail.
      const cropX = Math.floor(layout.cropFracX * Math.max(0, sourceImg.width - TILE_SIZE))
      const cropY = Math.floor(layout.cropFracY * Math.max(0, sourceImg.height - TILE_SIZE))
      const sampleW = Math.min(sourceImg.width, Math.max(TILE_SIZE, Math.floor(sourceImg.width * 0.35)))
      const sampleH = Math.min(sourceImg.height, Math.max(TILE_SIZE, Math.floor(sourceImg.height * 0.35)))

      const cx = px + TILE_SIZE / 2
      const cy = TILE_SIZE / 2
      ctx.translate(cx, cy)
      if (layout.rotate) ctx.rotate((layout.rotate * Math.PI) / 180)
      ctx.scale(layout.mirrorX ? -1 : 1, layout.mirrorY ? -1 : 1)
      ctx.drawImage(
        sourceImg,
        cropX, cropY, sampleW, sampleH,
        -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE,
      )
    } else if (isVegetation(baseId) && texTree) {
      ctx.drawImage(texTree, px, 0, TILE_SIZE, TILE_SIZE)
    } else if (isGrassy(baseId) && texGrass) {
      ctx.drawImage(texGrass, px, 0, TILE_SIZE, TILE_SIZE)
    } else if (texTileset) {
      // Legacy fallback: use old 3-slice system
      const sliceW = Math.floor(texTileset.width / 3)
      const sx = (variantIndex % 3) * sliceW
      ctx.drawImage(texTileset, sx, 0, sliceW, texTileset.height, px, 0, TILE_SIZE, TILE_SIZE)
    } else {
      ctx.fillRect(px, 0, TILE_SIZE, TILE_SIZE)
    }

    ctx.restore()
    ctx.save()

    // Multiply-blend the palette colour onto the desaturated source.
    // This is the key operation: the storybook art provides texture,
    // highlights, and depth; the palette provides the elemental hue.
    ctx.globalCompositeOperation = 'multiply'
    const r = (colour >> 16) & 0xff
    const g = (colour >> 8) & 0xff
    const b = colour & 0xff
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillRect(px, 0, TILE_SIZE, TILE_SIZE)

    ctx.restore()

    // Light noise speckle for organic grain. Lighter than before because
    // the storybook sources already carry rich texture detail.
    if (!isVegetation(baseId) && !isGrassy(baseId) &&
        baseId !== TILES.VILLAGE_MARKER && baseId !== TILES.TABLET_MARKER) {
      drawNoiseCell(ctx, px, 0, TILE_SIZE, id, (params?.seed | 0) ^ 0x7f4a7c15)
    }
  }

  if (scene.textures.exists('worldTiles')) {
    const existing = scene.textures.get('worldTiles')
    if (existing) existing.destroy()
  }
  const canvasTex = scene.textures.addCanvas('worldTiles', canvas)
  if (canvasTex && typeof canvasTex.refresh === 'function') {
    canvasTex.refresh()
  }

  return palette
}

// Build a Phaser tilemap from the world grid data.
// Adds WRAP_PAD columns on each side so the camera sees mirrored terrain
// at the horizontal edges, making the world loop seamlessly. Crucially,
// this is where base tile IDs are converted into variant render IDs so
// the visible world has within-world variance.
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
      if (tile === TILES.AIR || tile === TILES.TREE_LEAVES || tile === TILES.TREE_TRUNK ||
          tile === TILES.BUSH || tile === TILES.TALL_GRASS || tile === TILES.MUSHROOM) {
        row.push(-1)
      } else {
        // Pick a variant deterministically per logical position. Using wx (not x)
        // keeps mirrored padding columns in phase with the real world column.
        row.push(renderIdFor(tile, wx, y))
      }
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

// Set collision on all render IDs that represent solid base types.
// SOLID_TILES already contains variants (injected in TileTypes.js), so
// we can reuse it directly.
export function setupCollision(layer) {
  const solidIds = [...SOLID_TILES]
  layer.setCollision(solidIds)
}
