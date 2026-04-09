import { GAME_WIDTH, GAME_HEIGHT } from '../core/Constants.js'
import { TILES } from '../world/TileTypes.js'
import { pickVariants } from '../world/AssetVariants.js'

// Multi-layer parallax sky using SkyBaby's painted layers, plus
// additional procedural depth bands. All layers are anchored to the
// viewport (scrollFactor 0) with manual tile offsets driven by camera
// position; this guarantees full screen coverage at every position.
//
// The sky is tinted to match the world's elemental palette and shifts
// hue across the day/night cycle for cinematic atmosphere.

export default class ParallaxSky {
  constructor(scene, params, palette) {
    this.scene = scene
    this.layers = []

    // Capture base sky colour from the palette so day/night cycle can
    // tween away from it and back
    this.basePalette = palette
    this.baseSky = palette?.skyColour || 0x1a2a3a

    // Build a sky base rectangle behind the parallax bitmaps so the
    // entire viewport is always covered even when textures are translucent
    this.baseRect = scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT,
      this.baseSky
    ).setScrollFactor(0).setDepth(-12)

    // Pick variant sky textures per world seed so each world has a
    // dramatically different sky. Falls back to the originals if a
    // variant texture didn't load (missing file, etc.).
    const variants = pickVariants(params?.seed || 0)
    const skyTex1 = scene.textures.exists(variants.skyLayer1) ? variants.skyLayer1 : 'sb_sky1'
    const skyTex2 = scene.textures.exists(variants.skyLayer2) ? variants.skyLayer2 : 'sb_sky2'
    const cloudTex = scene.textures.exists(variants.skyClouds) ? variants.skyClouds : 'sb_clouds'

    // Layer definitions (depth-sorted, far-to-near)
    // px/py: parallax rates (0 = no movement, 1 = locked to camera)
    // tint: target hue blend with element palette
    // wind: horizontal auto-scroll speed
    const skyHue = palette?.[TILES.WATER] || 0x4a6a8a
    const accentHue = palette?.[TILES.SURFACE] || 0x8a8a8a

    const defs = [
      // Distant sky wash (very slow parallax, blurry feel via low alpha)
      { key: skyTex1, px: 0.03, py: 0.06, alpha: 0.70, depth: -11, wind: 0.5, tint: skyHue, blend: 0.20 },
      // Mid-distance cloud band
      { key: skyTex2, px: 0.10, py: 0.10, alpha: 0.60, depth: -10, wind: 2,   tint: skyHue, blend: 0.18 },
      // Painted clouds (the most distinct layer); low blend so the
      // painting's own hues dominate rather than being washed out
      { key: cloudTex, px: 0.20, py: 0.15, alpha: 0.60, depth: -9,  wind: 5,   tint: 0xffffff, blend: 0 },
      // Near cloud streaks (faster, more saturated tint for atmosphere)
      { key: cloudTex, px: 0.35, py: 0.20, alpha: 0.30, depth: -8,  wind: 12,  tint: accentHue, blend: 0.25 },
      // Foreground mist veil (fastest, most blurred)
      { key: skyTex2,   px: 0.55, py: 0.30, alpha: 0.18, depth: -7,  wind: 22,  tint: skyHue, blend: 0.30 },
    ]

    for (const def of defs) {
      const ts = scene.add.tileSprite(
        GAME_WIDTH / 2, GAME_HEIGHT / 2,
        GAME_WIDTH, GAME_HEIGHT,
        def.key
      )
      ts.setScrollFactor(0)
      ts.setAlpha(def.alpha)
      ts.setDepth(def.depth)

      // Scale tile texture to fill the viewport height
      if (ts.texture?.source?.[0]) {
        const srcH = ts.texture.source[0].height
        ts.tileScaleY = GAME_HEIGHT / srcH
        ts.tileScaleX = ts.tileScaleY
      }

      // Compute the tinted base colour by blending the source white-tint
      // with the world hue. We store the base; day/night animation will
      // multiply against this each frame.
      const baseTint = this._blend(def.tint, this.baseSky, def.blend)
      ts.setTint(baseTint)

      this.layers.push({
        sprite: ts,
        parallaxX: def.px,
        parallaxY: def.py,
        windSpeed: def.wind,
        baseTint,
        baseAlpha: def.alpha,
      })
    }

    this._windAccum = 0

    // Star field: tiny additive dots seeded across the viewport.
    // They're invisible by day and fade in at night via update().
    // Wrapped in a container that counter-scales against camera zoom
    // so the stars always fill the viewport at any zoom level.
    this.stars = []
    this.starContainer = scene.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2)
      .setScrollFactor(0)
      .setDepth(-6)
    const STAR_COUNT = 60
    for (let i = 0; i < STAR_COUNT; i++) {
      // Positions relative to container centre (viewport midpoint)
      const x = ((i * 137 + 13) % GAME_WIDTH) - GAME_WIDTH / 2
      const y = ((i * 83 + 7) % Math.floor(GAME_HEIGHT * 0.7)) - GAME_HEIGHT / 2
      const star = scene.add.circle(x, y, 0.7 + Math.random() * 0.8, 0xffffff, 1)
        .setBlendMode(1) // ADD blend constant
        .setAlpha(0)
      this.starContainer.add(star)
      this.stars.push({
        sprite: star,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleRate: 0.8 + Math.random() * 1.6,
      })
    }
  }

  // Blend two hex colours linearly (t=0 → a, t=1 → b)
  _blend(a, b, t) {
    const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff
    const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff
    const r = Math.round(ar + (br - ar) * t)
    const g = Math.round(ag + (bg - ag) * t)
    const b2 = Math.round(ab + (bb - ab) * t)
    return (r << 16) | (g << 8) | b2
  }

  update(dilatedDelta, dayTime = 0) {
    const cam = this.scene.cameras.main
    const dtSec = dilatedDelta / 1000
    this._windAccum += dtSec

    // Day/night curve: 0 = midnight, 0.25 = sunrise, 0.5 = noon,
    // 0.75 = sunset, 1.0 = midnight again
    // Compute a "sun height" (-1 to 1) for tinting
    const sunHeight = Math.sin(dayTime * Math.PI * 2 - Math.PI / 2)
    // Daylight 0..1 (0 at night, 1 at noon)
    const day = Math.max(0, sunHeight)
    // Sunset/sunrise factor: peaks at horizon transitions
    const horizonGlow = Math.max(0, 1 - Math.abs(sunHeight) * 2.5)

    // Day vs night tint shifts
    // Night: deep navy blue. Day: lifted toward warm white. Horizon: amber.
    const nightTint = 0x18243a
    const dayBoost = 0xddeeff
    const horizonAmber = 0xff9966

    // Altitude brightening: when the camera rises above the average
    // surface row, blend toward the day boost regardless of time of
    // day. This gives a "higher = thinner air, brighter light" feel
    // that pairs with the depth darkening below ground.
    // ascend 0 at/below surface, ~1 one full viewport above.
    let ascend = 0
    if (this.scene?.surfaceRowY != null) {
      const surfacePx = this.scene.surfaceRowY * 8 // TILE_SIZE
      const camMid = cam.scrollY + cam.height / 2
      ascend = Math.max(0, Math.min(1, (surfacePx - camMid) / (cam.height * 0.8)))
    }

    // Counter-scale sky against camera zoom so it always fills the
    // viewport. scrollFactor(0) objects are scaled by the camera zoom
    // around the viewport centre; inverse-scaling cancels that out.
    const invZoom = 1 / (cam.zoom || 1)
    this.baseRect.setScale(invZoom)

    // Animate base rectangle colour through the cycle
    let skyColour = this._blend(nightTint, this.baseSky, 0.4 + day * 0.6)
    skyColour = this._blend(skyColour, dayBoost, day * 0.25 + ascend * 0.30)
    skyColour = this._blend(skyColour, horizonAmber, horizonGlow * 0.35)
    this.baseRect.fillColor = skyColour

    for (const layer of this.layers) {
      layer.sprite.setScale(invZoom)

      // Parallax offset
      layer.sprite.tilePositionX = cam.scrollX * layer.parallaxX + this._windAccum * layer.windSpeed
      layer.sprite.tilePositionY = cam.scrollY * layer.parallaxY

      // Cycle the tint through day/night so distant layers feel atmospheric
      let tint = this._blend(nightTint, layer.baseTint, 0.3 + day * 0.7)
      tint = this._blend(tint, dayBoost, day * 0.15 + ascend * 0.20)
      tint = this._blend(tint, horizonAmber, horizonGlow * 0.25)
      layer.sprite.setTint(tint)
    }

    // Star container: counter-scale so stars fill the viewport at any zoom.
    if (this.starContainer) {
      this.starContainer.setScale(invZoom)
    }

    // Star field: only visible at night (day = 0). Each star twinkles
    // on its own phase for that "alive sky" feeling.
    if (this.stars && this.stars.length) {
      const nightAlpha = Math.max(0, 1 - day * 1.6) // fade in below noon
      for (const s of this.stars) {
        s.twinklePhase += dtSec * s.twinkleRate
        const twinkle = 0.5 + 0.5 * Math.sin(s.twinklePhase)
        s.sprite.alpha = nightAlpha * twinkle * 0.85
      }
    }
  }

  // Camera scroll has shifted by worldDeltaX (world wrap teleport).
  // Tile positions are derived from cam.scrollX each frame, so the
  // next update() call will recompute them correctly. No work needed.
  shiftWrap(worldDeltaX) {
    // intentional no-op
  }

  destroy() {
    this.baseRect.destroy()
    this.layers.forEach(l => l.sprite.destroy())
    this.layers = []
    if (this.stars) {
      this.stars.forEach(s => s.sprite.destroy())
      this.stars = []
    }
  }
}
