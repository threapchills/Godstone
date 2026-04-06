import { WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE, GAME_WIDTH, GAME_HEIGHT } from '../core/Constants.js'
import { TILES, buildPalette } from '../world/TileTypes.js'

// Circular minimap: the world is projected onto a disc to read as a
// cross-section through a round planet. World x wraps around the disc
// (since the world wraps horizontally), world y maps from the outer
// edge (sky) inward to a small bedrock core. Live-refreshes from the
// grid so digging, lava flow, and water erosion all show through.

const MAP_DIAMETER = 168
const MARGIN = 12
const REFRESH_INTERVAL = 250 // ms between texture refreshes
// Inset the disc inside its canvas so the rim has anti-aliased breathing room.
const OUTER_R = MAP_DIAMETER / 2 - 4
const INNER_R = OUTER_R * 0.16 // small molten core

export default class Minimap {
  constructor(scene, worldGrid, params) {
    this.scene = scene
    this.worldGrid = worldGrid

    const palette = buildPalette(params.element1, params.element2, params.elementRatio)
    this.palette = palette
    this.paletteRGB = this.precomputePaletteRGB(palette)

    // Position bottom-right
    const x = GAME_WIDTH - MAP_DIAMETER - MARGIN
    const y = GAME_HEIGHT - MAP_DIAMETER - MARGIN
    this.baseX = x
    this.baseY = y
    this.centerX = x + MAP_DIAMETER / 2
    this.centerY = y + MAP_DIAMETER / 2

    // Faint frame: glassy ring + core nub. Both are pure decoration so
    // the disc reads as a celestial object rather than a square crop.
    this.ring = scene.add.circle(this.centerX, this.centerY, OUTER_R + 3, 0x000000, 0.55)
      .setStrokeStyle(1.5, 0xc8a36b, 0.6)
      .setScrollFactor(0)
      .setDepth(45)
    this.core = scene.add.circle(this.centerX, this.centerY, INNER_R, 0x2a0a00, 1)
      .setScrollFactor(0)
      .setDepth(46)

    // Build the canvas + texture lazily
    this.canvas = document.createElement('canvas')
    this.canvas.width = MAP_DIAMETER
    this.canvas.height = MAP_DIAMETER
    this.ctx = this.canvas.getContext('2d')
    this.imageData = this.ctx.createImageData(MAP_DIAMETER, MAP_DIAMETER)

    // Pre-bake the per-pixel inverse projection. The disc shape doesn't
    // change frame to frame, so the (px,py) → (wx,wy) lookup is computed
    // once and reused on every refresh. Big speed win.
    this.lookup = this.buildLookup()

    if (this.scene.textures.exists('minimap')) {
      this.scene.textures.remove('minimap')
    }
    this.texture = scene.textures.addCanvas('minimap', this.canvas)
    this.refreshTexture()

    this.mapImage = scene.add.image(this.centerX, this.centerY, 'minimap')
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(46)

    // Marker dots (god, villages, tablets) live above the disc
    this.godDot = scene.add.circle(this.centerX, this.centerY, 2.5, 0xffd700, 1)
      .setScrollFactor(0)
      .setDepth(48)
    this.villageDots = []

    this._refreshTimer = 0
  }

  // Pre-compute the inverse projection: for every canvas pixel inside the
  // disc, store which world tile it samples. The disc is static so this is
  // built once. Returns a Uint32Array indexed by py*MAP_DIAMETER+px holding
  // (wy * WORLD_WIDTH + wx + 1), with 0 meaning "outside the disc".
  buildLookup() {
    const lookup = new Uint32Array(MAP_DIAMETER * MAP_DIAMETER)
    const cx = MAP_DIAMETER / 2
    const cy = MAP_DIAMETER / 2
    const TWO_PI = Math.PI * 2

    for (let py = 0; py < MAP_DIAMETER; py++) {
      for (let px = 0; px < MAP_DIAMETER; px++) {
        const dx = px - cx
        const dy = py - cy
        const r = Math.sqrt(dx * dx + dy * dy)
        if (r > OUTER_R || r < INNER_R) continue

        // 0 rad = north (top of disc); angle increases clockwise so the
        // world reads left-to-right as the eye sweeps around. atan2 gives
        // mathematical convention (east=0, CCW); shift by +π/2 to put
        // north at zero, then normalise into [0, 2π).
        let angle = Math.atan2(dy, dx) + Math.PI / 2
        if (angle < 0) angle += TWO_PI
        if (angle >= TWO_PI) angle -= TWO_PI

        const wx = Math.min(WORLD_WIDTH - 1, Math.floor((angle / TWO_PI) * WORLD_WIDTH))
        const norm = (OUTER_R - r) / (OUTER_R - INNER_R) // 0 outer (sky) → 1 inner (bedrock)
        const wy = Math.min(WORLD_HEIGHT - 1, Math.floor(norm * WORLD_HEIGHT))

        lookup[py * MAP_DIAMETER + px] = wy * WORLD_WIDTH + wx + 1
      }
    }
    return lookup
  }

  // Pre-extract palette RGB triples so the inner refresh loop avoids
  // repeated bit-shifting and object lookups.
  precomputePaletteRGB(palette) {
    const rgb = {}
    const skyR = (palette.skyColour >> 16) & 0xff
    const skyG = (palette.skyColour >> 8) & 0xff
    const skyB = palette.skyColour & 0xff
    rgb.sky = [skyR, skyG, skyB]
    for (const key of Object.keys(palette)) {
      const c = palette[key]
      if (c == null || typeof c !== 'number') continue
      rgb[key] = [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff]
    }
    return rgb
  }

  // Repaint the disc from the current grid state. Called on a 4Hz timer
  // from update(); cheap because of the pre-baked lookup.
  refreshTexture() {
    const grid = this.worldGrid.grid
    const data = this.imageData.data
    const lookup = this.lookup
    const rgb = this.paletteRGB
    const sky = rgb.sky
    const skyDark = [Math.max(0, sky[0] - 20), Math.max(0, sky[1] - 30), Math.max(0, sky[2] - 40)]

    for (let i = 0; i < lookup.length; i++) {
      const packed = lookup[i]
      const di = i * 4
      if (packed === 0) {
        data[di + 3] = 0 // transparent outside disc
        continue
      }
      const gridIdx = packed - 1
      const tile = grid[gridIdx]
      const colour = rgb[tile]
      if (!colour) {
        // Air: shade by depth so the sky band reads as atmosphere.
        // (i / lookup.length) ≈ depth from outer edge for visual effect
        data[di] = sky[0]
        data[di + 1] = sky[1]
        data[di + 2] = sky[2]
        data[di + 3] = 255
      } else {
        data[di] = colour[0]
        data[di + 1] = colour[1]
        data[di + 2] = colour[2]
        data[di + 3] = 255
      }
    }
    void skyDark // reserved for future depth gradient
    this.ctx.putImageData(this.imageData, 0, 0)
    if (this.texture && this.texture.refresh) this.texture.refresh()
  }

  // Forward projection: world tile coordinates to canvas screen coordinates.
  // Used for placing god/village/tablet dots on top of the disc.
  projectToScreen(tileX, tileY) {
    const TWO_PI = Math.PI * 2
    const angle = (tileX / WORLD_WIDTH) * TWO_PI - Math.PI / 2
    const norm = Math.min(1, Math.max(0, tileY / WORLD_HEIGHT))
    const r = OUTER_R - norm * (OUTER_R - INNER_R)
    return {
      x: this.centerX + Math.cos(angle) * r,
      y: this.centerY + Math.sin(angle) * r,
    }
  }

  addVillageMarker(village) {
    const dot = this.scene.add.circle(0, 0, 2.5, 0xdaa520, 1)
      .setScrollFactor(0)
      .setDepth(48)
    const p = this.projectToScreen(village.tileX, village.tileY)
    dot.x = p.x
    dot.y = p.y
    this.villageDots.push(dot)
  }

  addTabletMarker(tablet) {
    if (tablet.collected) return null
    const dot = this.scene.add.circle(0, 0, 2, 0x00ffaa, 0.95)
      .setScrollFactor(0)
      .setDepth(48)
    const p = this.projectToScreen(tablet.tileX, tablet.tileY)
    dot.x = p.x
    dot.y = p.y
    return dot
  }

  update(godSprite, delta = 16) {
    // Track the god dot every frame
    const tx = godSprite.x / TILE_SIZE
    const ty = godSprite.y / TILE_SIZE
    const wrappedTx = ((tx % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH
    const p = this.projectToScreen(wrappedTx, ty)
    this.godDot.x = p.x
    this.godDot.y = p.y

    // Throttled texture refresh so dug terrain, water flow, and lava
    // erosion all propagate without burning a refresh every frame.
    this._refreshTimer += delta
    if (this._refreshTimer >= REFRESH_INTERVAL) {
      this._refreshTimer = 0
      this.refreshTexture()
    }
  }
}
