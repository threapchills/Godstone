import { WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE, GAME_WIDTH, GAME_HEIGHT } from '../core/Constants.js'
import { TILES, buildPalette } from '../world/TileTypes.js'

// Circular minimap: the world is projected onto a disc to read as a
// cross-section through a round planet. World x wraps around the disc
// (since the world wraps horizontally), world y maps from the outer
// edge (sky) inward to a small bedrock core. Live-refreshes from the
// grid so digging, lava flow, and water erosion all show through.
//
// The disc is player-centric: the god's column is always at the top
// (north). As the god walks sideways the disc rotates beneath the
// permanently-north-pointing god dot. As the god descends the dot
// slides inward toward the core.

const MAP_DIAMETER = 168
const MARGIN = 12
const REFRESH_INTERVAL = 150 // ms between texture refreshes
// Inset the disc inside its canvas so the rim has anti-aliased breathing room.
const OUTER_R = MAP_DIAMETER / 2 - 4
const INNER_R = OUTER_R * 0.16 // small molten core
const TWO_PI = Math.PI * 2

export default class Minimap {
  constructor(scene, worldGrid, params) {
    this.scene = scene
    this.worldGrid = worldGrid

    const palette = buildPalette(params)
    this.palette = palette
    this.paletteRGB = this.precomputePaletteRGB(palette)

    // Per-column surface heights from world gen; used at refresh time to
    // distinguish above-surface air (sky) from below-surface air (void).
    // Player-dug tunnels land in the void category and get a distinct
    // bright tint so they stand out against the surrounding stone.
    this.surfaceHeights = worldGrid.surfaceHeights || null

    // Position bottom-right
    const x = GAME_WIDTH - MAP_DIAMETER - MARGIN
    const y = GAME_HEIGHT - MAP_DIAMETER - MARGIN
    this.baseX = x
    this.baseY = y
    this.centerX = x + MAP_DIAMETER / 2
    this.centerY = y + MAP_DIAMETER / 2

    // Faint frame: glassy ring + core nub. Both are decorative and stay
    // screen-fixed (outside the rotating container) so the rim doesn't spin.
    this.ring = scene.add.circle(this.centerX, this.centerY, OUTER_R + 3, 0x000000, 0.55)
      .setStrokeStyle(1.5, 0xc8a36b, 0.6)
      .setScrollFactor(0)
      .setDepth(45)
    this.core = scene.add.circle(this.centerX, this.centerY, INNER_R, 0x2a0a00, 1)
      .setScrollFactor(0)
      .setDepth(47)

    // Build the canvas + texture
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

    // Rotating container holds the disc image and every marker that sits
    // on the world (villages, tablets). Setting container.rotation spins
    // the entire player-relative view. The god dot stays outside so it's
    // always visually at the top of the disc.
    this.container = scene.add.container(this.centerX, this.centerY)
      .setScrollFactor(0)
      .setDepth(46)

    this.mapImage = scene.add.image(0, 0, 'minimap').setOrigin(0.5, 0.5)
    this.container.add(this.mapImage)

    // God dot: outside the container, pinned above the disc centre. Its
    // y-offset varies with the god's depth in the world so shallow = near
    // the rim, deep = near the core. Cyan so it's distinct from gold villages.
    this.godDot = scene.add.circle(this.centerX, this.centerY - OUTER_R * 0.5, 3.2, 0x00ffcc, 1)
      .setScrollFactor(0)
      .setDepth(49)

    // A tiny tick on the ring showing where the god points; pure chrome.
    this.godTick = scene.add.triangle(
      this.centerX, this.centerY - OUTER_R - 2,
      0, 3, -3, -3, 3, -3,
      0x00ffcc, 1
    ).setScrollFactor(0).setDepth(49)

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
    // Void colour for below-surface air tiles. Built as a cool lift of the
    // sky tone so player-dug tunnels read as luminous threads against the
    // surrounding stone rather than blending into it. A touch of the
    // signature accent colour makes the tunnels feel "of this world".
    const accent = palette.accentColour || 0x406080
    const aR = (accent >> 16) & 0xff
    const aG = (accent >> 8) & 0xff
    const aB = accent & 0xff
    rgb.void = [
      Math.min(255, Math.round(skyR * 0.6 + aR * 0.35 + 24)),
      Math.min(255, Math.round(skyG * 0.6 + aG * 0.35 + 30)),
      Math.min(255, Math.round(skyB * 0.6 + aB * 0.35 + 44)),
    ]
    return rgb
  }

  // Repaint the disc from the current grid state. Called on a timer from
  // update(); cheap because of the pre-baked lookup. Air tiles are
  // classified into "sky" (above the column's surface height) or "void"
  // (below, i.e. natural caves or player-dug tunnels) so the latter stand
  // out as bright threads rather than blending into the sky band.
  refreshTexture() {
    const grid = this.worldGrid.grid
    const data = this.imageData.data
    const lookup = this.lookup
    const rgb = this.paletteRGB
    const sky = rgb.sky
    const voidCol = rgb.void
    const surfaceHeights = this.surfaceHeights

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
        // Air tile. Decide if it's sky or a below-surface void.
        const wx = gridIdx % WORLD_WIDTH
        const wy = (gridIdx - wx) / WORLD_WIDTH
        const surfaceY = surfaceHeights ? surfaceHeights[wx] : WORLD_HEIGHT * 0.35
        if (wy > surfaceY + 2) {
          data[di] = voidCol[0]
          data[di + 1] = voidCol[1]
          data[di + 2] = voidCol[2]
          data[di + 3] = 255
        } else {
          data[di] = sky[0]
          data[di + 1] = sky[1]
          data[di + 2] = sky[2]
          data[di + 3] = 255
        }
      } else {
        data[di] = colour[0]
        data[di + 1] = colour[1]
        data[di + 2] = colour[2]
        data[di + 3] = 255
      }
    }
    this.ctx.putImageData(this.imageData, 0, 0)
    if (this.texture && this.texture.refresh) this.texture.refresh()
  }

  // Project world tile coordinates to container-LOCAL coordinates on the
  // disc. The container sits at (centerX, centerY) and rotates as the
  // player moves, so markers added via this projection ride with the
  // rotating world.
  projectLocal(tileX, tileY) {
    const angle = (tileX / WORLD_WIDTH) * TWO_PI - Math.PI / 2
    const norm = Math.min(1, Math.max(0, tileY / WORLD_HEIGHT))
    const r = OUTER_R - norm * (OUTER_R - INNER_R)
    return { x: Math.cos(angle) * r, y: Math.sin(angle) * r }
  }

  // Radius on the disc for a given tile y. Used to place the god dot
  // along the top of the disc at the correct depth.
  radiusFor(tileY) {
    const norm = Math.min(1, Math.max(0, tileY / WORLD_HEIGHT))
    return OUTER_R - norm * (OUTER_R - INNER_R)
  }

  addVillageMarker(village) {
    const dot = this.scene.add.circle(0, 0, 2.5, 0xdaa520, 1)
    const p = this.projectLocal(village.tileX, village.tileY)
    dot.x = p.x
    dot.y = p.y
    this.container.add(dot)
    this.villageDots.push(dot)
    return dot
  }

  addTabletMarker(tablet) {
    if (tablet.collected) return null
    // Tablets shown as an X cross so they read as treasure, not villages
    const p = this.projectLocal(tablet.tileX, tablet.tileY)
    const gfx = this.scene.add.graphics().setDepth(0)
    const s = 3 // half-arm length
    gfx.lineStyle(1.4, 0x9affe6, 1)
    gfx.beginPath()
    gfx.moveTo(p.x - s, p.y - s)
    gfx.lineTo(p.x + s, p.y + s)
    gfx.moveTo(p.x + s, p.y - s)
    gfx.lineTo(p.x - s, p.y + s)
    gfx.strokePath()
    // Small glow dot behind the X for visibility
    const glow = this.scene.add.circle(p.x, p.y, 2.5, 0x9affe6, 0.25)
    this.container.add(glow)
    this.container.add(gfx)
    // Return a container-like reference so visibility toggle works
    const wrapper = { setVisible(v) { gfx.setVisible(v); glow.setVisible(v) } }
    return wrapper
  }

  addPortalMarker(portal) {
    if (!portal) return null
    const p = this.projectLocal(portal.tileX, portal.tileY)
    // Portal: bright pulsing diamond so it's unmissable
    const diamond = this.scene.add.polygon(0, 0, [0, -5, 4, 0, 0, 5, -4, 0], 0x4488ff, 0.95)
    diamond.x = p.x
    diamond.y = p.y
    diamond.setStrokeStyle(1, 0x88ccff, 1)
    this.container.add(diamond)
    // Pulse the portal marker
    this.scene.tweens.add({
      targets: diamond,
      scale: { from: 1, to: 1.5 },
      alpha: { from: 0.95, to: 0.4 },
      yoyo: true,
      repeat: -1,
      duration: 1200,
    })
    return diamond
  }

  update(godSprite, delta = 16) {
    // Wrap the god's column into the world range so it's continuous
    // across the seamless horizontal wrap.
    const godTileXRaw = godSprite.x / TILE_SIZE
    const godTileX = ((godTileXRaw % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH
    const godTileY = godSprite.y / TILE_SIZE

    // Rotate the container so the god's column always ends up at the
    // top (north). projectLocal puts tileX 0 at angle -π/2 and advances
    // clockwise, so rotating by -(godTileX / W) * 2π drags the god's
    // column into the north slot.
    const rot = -(godTileX / WORLD_WIDTH) * TWO_PI
    this.container.rotation = rot

    // Pin the god dot to the top of the disc at a radius matching depth.
    const r = this.radiusFor(godTileY)
    this.godDot.x = this.centerX
    this.godDot.y = this.centerY - r

    // Throttled texture refresh so dug terrain, water flow, and lava
    // erosion all propagate without burning a refresh every frame.
    this._refreshTimer += delta
    if (this._refreshTimer >= REFRESH_INTERVAL) {
      this._refreshTimer = 0
      this.refreshTexture()
    }
  }
}
