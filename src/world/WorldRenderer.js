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

// Generate the tileset texture at runtime. Emits one cell per render ID
// (base types + their variants + vegetation + markers). Each cell:
//  1) draws a base sprite slice from the skybaby source assets, mirrored
//     and/or offset depending on which variant it represents;
//  2) multiplies the per-variant palette colour on top;
//  3) overlays a deterministic noise speckle so neighbouring tiles of the
//     same variant still look subtly different up close.
export function createTilesetTexture(scene, params) {
  const palette = buildPalette(params)

  // Canvas width = (max render ID + 1) cells. Empty/unused slots between
  // base IDs and variant IDs are cheap; it keeps ID→X lookup trivial.
  const cellCount = MAX_RENDER_ID + 1
  const texWidth = cellCount * TILE_SIZE
  const texHeight = TILE_SIZE

  const canvas = document.createElement('canvas')
  canvas.width = texWidth
  canvas.height = texHeight
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true // smooth down-scale of massive skybaby sources

  const texTileset = scene.textures.get('sb_tileset')?.getSourceImage()
  const texTree = scene.textures.get('sb_tree')?.getSourceImage()
  const texGrass = scene.textures.get('sb_grass')?.getSourceImage()

  // Helper: does this render ID belong to a vegetation/marker class?
  const isVegetation = (baseId) =>
    baseId === TILES.TREE_LEAVES || baseId === TILES.TREE_TRUNK ||
    baseId === TILES.MUSHROOM
  const isGrassy = (baseId) =>
    baseId === TILES.TALL_GRASS || baseId === TILES.BUSH

  // Within a variant group, which slice of the source tileset do we pick?
  // Combining three source slices with mirror/flip/rotate gives plenty of
  // orientation diversity so neighbouring tiles don't share an identical
  // pattern even when they land on the same colour.
  const sliceLayout = [
    { slice: 1, mirrorX: false, mirrorY: false, rotate: 0 },   // v0 mid upright
    { slice: 0, mirrorX: false, mirrorY: true,  rotate: 0 },   // v1 left, flipped vertically
    { slice: 2, mirrorX: true,  mirrorY: false, rotate: 0 },   // v2 right, mirrored
    { slice: 1, mirrorX: false, mirrorY: false, rotate: 90 },  // v3 mid, rotated 90°
    { slice: 0, mirrorX: true,  mirrorY: true,  rotate: 0 },   // v4 left, flipped both
    { slice: 2, mirrorX: false, mirrorY: false, rotate: 180 }, // v5 right, rotated 180°
  ]

  for (const id of ALL_RENDER_IDS) {
    const colour = palette[id]
    if (colour == null) continue // AIR is transparent; skip

    const baseId = VARIANT_TO_BASE[id] ?? id
    const variantIndex = TILE_VARIANTS[baseId] ? TILE_VARIANTS[baseId].indexOf(id) : 0
    const px = id * TILE_SIZE

    const layout = sliceLayout[variantIndex % sliceLayout.length]

    // Pick the source sprite based on the base tile type.
    // Desaturate the source first (grayscale) so the palette colour
    // isn't swamped by the source's inherent hue. A modest brightness
    // bump keeps the tile from going too dark after multiply, but
    // aggressive bumps make the source's highlight pattern too stark.
    ctx.save()
    ctx.globalCompositeOperation = 'source-over'
    ctx.filter = 'grayscale(100%) brightness(1.15) contrast(0.95)'

    if (isVegetation(baseId)) {
      if (texTree) ctx.drawImage(texTree, px, 0, TILE_SIZE, TILE_SIZE)
      else ctx.fillRect(px, 0, TILE_SIZE, TILE_SIZE)
    } else if (isGrassy(baseId)) {
      if (texGrass) ctx.drawImage(texGrass, px, 0, TILE_SIZE, TILE_SIZE)
      else ctx.fillRect(px, 0, TILE_SIZE, TILE_SIZE)
    } else if (texTileset) {
      const sliceW = Math.floor(texTileset.width / 3)
      const sx = layout.slice * sliceW
      // Set up transform for the orientation combo. We translate to the
      // cell centre, apply rotation + mirrors, then draw the source image
      // centred at origin.
      const cx = px + TILE_SIZE / 2
      const cy = TILE_SIZE / 2
      ctx.translate(cx, cy)
      if (layout.rotate) ctx.rotate((layout.rotate * Math.PI) / 180)
      ctx.scale(layout.mirrorX ? -1 : 1, layout.mirrorY ? -1 : 1)
      ctx.drawImage(
        texTileset,
        sx, 0, sliceW, texTileset.height,
        -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE
      )
    } else {
      ctx.fillRect(px, 0, TILE_SIZE, TILE_SIZE)
    }

    ctx.restore()
    ctx.save()

    // Multiply-blend the variant-specific colour on top of the now-grey sprite.
    ctx.globalCompositeOperation = 'multiply'
    const r = (colour >> 16) & 0xff
    const g = (colour >> 8) & 0xff
    const b = colour & 0xff
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillRect(px, 0, TILE_SIZE, TILE_SIZE)

    ctx.restore()

    // Deterministic noise speckle so the tile has visible grit even up close.
    // Skip for markers and vegetation where the silhouette matters more than texture.
    if (!isVegetation(baseId) && !isGrassy(baseId) &&
        baseId !== TILES.VILLAGE_MARKER && baseId !== TILES.TABLET_MARKER) {
      drawNoiseCell(ctx, px, 0, TILE_SIZE, id, (params?.seed | 0) ^ 0x7f4a7c15)
    }
  }

  // Re-register with Phaser. If the texture already exists, destroy it
  // fully so the new canvas replaces it (a plain remove leaves the GPU
  // upload bound to the old pixels). After adding, force a refresh so
  // Phaser re-uploads the new canvas to the GPU on this frame.
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
      if (tile === TILES.AIR || tile === TILES.TREE_LEAVES || tile === TILES.TREE_TRUNK) {
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
