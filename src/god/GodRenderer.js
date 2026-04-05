// Procedural modular god sprite generation
// Head: determined by element1 (2 variants per element, 8 total)
// Body: humanoid base with element-specific texture
// Accessories: determined by element2 (wings, wisps, fins, vines)
// Colour: blended palette from both elements, hue-shifted by seed

export const GOD_W = 24
export const GOD_H = 32

// --- Seeded PRNG (mulberry32) ---
function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function clamp(v) { return Math.max(0, Math.min(255, Math.floor(v))) }

// --- Drawing primitives with per-pixel noise for hand-pixeled feel ---

function dot(ctx, x, y, rgb, rng, noise = 10) {
  if (x < 0 || x >= GOD_W || y < 0 || y >= GOD_H) return
  const n = (rng() - 0.5) * noise
  ctx.fillStyle = `rgb(${clamp(rgb.r + n)},${clamp(rgb.g + n)},${clamp(rgb.b + n)})`
  ctx.fillRect(x, y, 1, 1)
}

function fill(ctx, x, y, w, h, rgb, rng, noise = 10) {
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      dot(ctx, x + px, y + py, rgb, rng, noise)
    }
  }
}

function dotAlpha(ctx, x, y, rgb, a, rng, noise = 6) {
  if (x < 0 || x >= GOD_W || y < 0 || y >= GOD_H) return
  const n = (rng() - 0.5) * noise
  ctx.fillStyle = `rgba(${clamp(rgb.r + n)},${clamp(rgb.g + n)},${clamp(rgb.b + n)},${a})`
  ctx.fillRect(x, y, 1, 1)
}

// --- Colour utilities ---

function lerp(a, b, t) {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t }
}

function hueShift(rgb, angle) {
  const c = Math.cos(angle), s = Math.sin(angle)
  return {
    r: clamp(rgb.r * (0.667 + c * 0.333) + rgb.g * (0.333 - c * 0.333 + s * 0.577) + rgb.b * (0.333 - c * 0.333 - s * 0.577)),
    g: clamp(rgb.r * (0.333 - c * 0.333 - s * 0.577) + rgb.g * (0.667 + c * 0.333) + rgb.b * (0.333 - c * 0.333 + s * 0.577)),
    b: clamp(rgb.r * (0.333 - c * 0.333 + s * 0.577) + rgb.g * (0.333 - c * 0.333 - s * 0.577) + rgb.b * (0.667 + c * 0.333)),
  }
}

// --- Element palettes (richer and more saturated than terrain colours) ---

const ELEM = {
  fire: {
    primary: { r: 200, g: 60, b: 20 }, mid: { r: 165, g: 45, b: 15 }, dark: { r: 95, g: 25, b: 10 },
    light: { r: 255, g: 140, b: 40 }, accent: { r: 255, g: 200, b: 50 }, eye: { r: 255, g: 220, b: 80 },
    skin: { r: 180, g: 90, b: 40 },
  },
  water: {
    primary: { r: 30, g: 100, b: 170 }, mid: { r: 22, g: 78, b: 135 }, dark: { r: 12, g: 48, b: 85 },
    light: { r: 80, g: 180, b: 220 }, accent: { r: 120, g: 220, b: 255 }, eye: { r: 150, g: 240, b: 255 },
    skin: { r: 70, g: 130, b: 150 },
  },
  air: {
    primary: { r: 165, g: 185, b: 210 }, mid: { r: 135, g: 150, b: 175 }, dark: { r: 85, g: 95, b: 115 },
    light: { r: 215, g: 230, b: 248 }, accent: { r: 240, g: 248, b: 255 }, eye: { r: 200, g: 225, b: 255 },
    skin: { r: 180, g: 190, b: 200 },
  },
  earth: {
    primary: { r: 85, g: 115, b: 45 }, mid: { r: 68, g: 92, b: 36 }, dark: { r: 42, g: 58, b: 22 },
    light: { r: 135, g: 165, b: 75 }, accent: { r: 175, g: 195, b: 95 }, eye: { r: 200, g: 180, b: 70 },
    skin: { r: 110, g: 100, b: 60 },
  },
}

function buildPalette(el1, el2, ratio, rng) {
  const p1 = ELEM[el1] || ELEM.fire
  const p2 = ELEM[el2] || ELEM.water
  const pal = {}
  for (const k of Object.keys(p1)) pal[k] = lerp(p2[k], p1[k], ratio)
  const shift = (rng() - 0.5) * 0.35
  for (const k of Object.keys(pal)) pal[k] = hueShift(pal[k], shift)
  // Keep secondary palette accessible for accessories
  pal.el2 = {}
  for (const k of Object.keys(p2)) pal.el2[k] = hueShift(p2[k], shift)
  return pal
}


// ============================================================
//  HEADS — 2 per element, 8 total
//  Canvas region: ~x:4-19, y:0-11
// ============================================================

function drawSerpentHead(ctx, p, rng) {
  // Crest spines
  dot(ctx, 10, 0, p.accent, rng); dot(ctx, 12, 0, p.accent, rng); dot(ctx, 14, 0, p.accent, rng)
  dot(ctx, 9, 1, p.light, rng);  dot(ctx, 11, 1, p.light, rng);  dot(ctx, 13, 1, p.light, rng)

  // Angular skull
  fill(ctx, 8, 2, 8, 2, p.primary, rng)
  fill(ctx, 7, 4, 10, 2, p.primary, rng)
  fill(ctx, 6, 6, 11, 2, p.mid, rng)
  fill(ctx, 8, 8, 7, 2, p.mid, rng)

  // Slit eyes
  dot(ctx, 9, 4, p.eye, rng, 4); dot(ctx, 9, 5, p.dark, rng, 4)
  dot(ctx, 14, 4, p.eye, rng, 4); dot(ctx, 14, 5, p.dark, rng, 4)

  // Nostril
  dot(ctx, 7, 7, p.dark, rng)

  // Forked tongue
  dot(ctx, 11, 10, { r: 200, g: 50, b: 50 }, rng)
  dot(ctx, 10, 11, { r: 180, g: 40, b: 40 }, rng)
  dot(ctx, 12, 11, { r: 180, g: 40, b: 40 }, rng)

  // Scale accents
  dot(ctx, 6, 7, p.dark, rng); dot(ctx, 16, 7, p.dark, rng)
  dot(ctx, 7, 5, p.dark, rng); dot(ctx, 15, 5, p.dark, rng)
}

function drawRamHead(ctx, p, rng) {
  // Curved horns
  fill(ctx, 3, 2, 2, 2, p.accent, rng, 6); fill(ctx, 2, 4, 2, 2, p.accent, rng, 6)
  dot(ctx, 3, 6, p.light, rng, 6); dot(ctx, 2, 2, p.light, rng, 4)
  fill(ctx, 18, 2, 2, 2, p.accent, rng, 6); fill(ctx, 19, 4, 2, 2, p.accent, rng, 6)
  dot(ctx, 20, 6, p.light, rng, 6); dot(ctx, 20, 2, p.light, rng, 4)

  // Broad skull
  fill(ctx, 7, 1, 10, 2, p.primary, rng)
  fill(ctx, 6, 3, 12, 3, p.primary, rng)
  fill(ctx, 7, 6, 10, 3, p.mid, rng)
  fill(ctx, 8, 9, 8, 2, p.mid, rng)

  // Heavy brow
  fill(ctx, 6, 3, 12, 1, p.dark, rng)

  // Ember eyes
  fill(ctx, 9, 4, 2, 2, p.eye, rng, 4)
  fill(ctx, 14, 4, 2, 2, p.eye, rng, 4)

  // Nostrils
  dot(ctx, 10, 7, p.dark, rng); dot(ctx, 13, 7, p.dark, rng)
}

function drawFishHead(ctx, p, rng) {
  // Dorsal fin crest
  dot(ctx, 12, 0, p.accent, rng)
  fill(ctx, 11, 1, 3, 1, p.accent, rng)
  fill(ctx, 10, 2, 5, 1, p.light, rng)

  // Streamlined skull
  fill(ctx, 7, 3, 10, 3, p.primary, rng)
  fill(ctx, 6, 6, 12, 2, p.primary, rng)
  fill(ctx, 7, 8, 10, 2, p.mid, rng)
  fill(ctx, 8, 10, 8, 1, p.mid, rng)

  // Large round eyes
  fill(ctx, 8, 4, 2, 2, p.eye, rng, 4); dot(ctx, 9, 5, p.dark, rng, 2)
  fill(ctx, 14, 4, 2, 2, p.eye, rng, 4); dot(ctx, 14, 5, p.dark, rng, 2)

  // Gill slits
  for (let i = 0; i < 3; i++) { dot(ctx, 6, 6 + i, p.dark, rng); dot(ctx, 17, 6 + i, p.dark, rng) }

  // Scale sheen
  dot(ctx, 9, 3, p.light, rng); dot(ctx, 13, 3, p.light, rng)
}

function drawJellyfishHead(ctx, p, rng) {
  // Wide bell dome
  fill(ctx, 8, 0, 8, 1, p.light, rng)
  fill(ctx, 6, 1, 12, 2, p.primary, rng)
  fill(ctx, 5, 3, 14, 3, p.primary, rng)
  fill(ctx, 6, 6, 12, 2, p.mid, rng)

  // Bioluminescent spots
  dot(ctx, 8, 2, p.accent, rng, 4); dot(ctx, 12, 3, p.accent, rng, 4)
  dot(ctx, 10, 4, p.accent, rng, 4); dot(ctx, 15, 2, p.accent, rng, 4)

  // Glowing eyes
  fill(ctx, 9, 6, 2, 1, p.eye, rng, 3)
  fill(ctx, 14, 6, 2, 1, p.eye, rng, 3)

  // Trailing tendrils
  for (let i = 0; i < 5; i++) {
    const tx = 7 + i * 2
    dot(ctx, tx, 8, p.light, rng)
    dot(ctx, tx, 9, p.mid, rng)
    dot(ctx, tx, 10 + (rng() > 0.5 ? 1 : 0), p.light, rng)
  }
}

function drawEagleHead(ctx, p, rng) {
  // Crown feathers
  dot(ctx, 9, 0, p.light, rng); dot(ctx, 11, 0, p.light, rng); dot(ctx, 13, 0, p.accent, rng)

  // Angular skull
  fill(ctx, 8, 1, 7, 2, p.primary, rng)
  fill(ctx, 7, 3, 9, 2, p.primary, rng)
  fill(ctx, 8, 5, 8, 2, p.mid, rng)

  // Heavy brow
  fill(ctx, 7, 3, 9, 1, p.dark, rng)

  // Fierce eye
  dot(ctx, 9, 4, p.eye, rng, 3)
  dot(ctx, 10, 4, { r: 20, g: 20, b: 20 }, rng, 2)

  // Hooked beak
  fill(ctx, 14, 5, 3, 1, p.accent, rng, 5)
  fill(ctx, 15, 6, 3, 1, p.accent, rng, 5)
  dot(ctx, 17, 7, p.light, rng); dot(ctx, 16, 7, p.accent, rng)

  // Throat feathers
  fill(ctx, 8, 7, 6, 2, p.mid, rng)
  fill(ctx, 9, 9, 5, 2, p.primary, rng)
}

function drawMothHead(ctx, p, rng) {
  // Feathered antennae
  dot(ctx, 7, 0, p.light, rng); dot(ctx, 8, 0, p.accent, rng)
  dot(ctx, 6, 1, p.accent, rng); dot(ctx, 8, 1, p.light, rng); dot(ctx, 7, 2, p.mid, rng)
  dot(ctx, 16, 0, p.light, rng); dot(ctx, 15, 0, p.accent, rng)
  dot(ctx, 17, 1, p.accent, rng); dot(ctx, 15, 1, p.light, rng); dot(ctx, 16, 2, p.mid, rng)

  // Fuzzy head (extra noise)
  fill(ctx, 8, 3, 8, 2, p.primary, rng, 16)
  fill(ctx, 7, 5, 10, 2, p.mid, rng, 16)

  // Large compound eyes
  fill(ctx, 7, 4, 3, 3, p.eye, rng, 6)
  fill(ctx, 14, 4, 3, 3, p.eye, rng, 6)
  dot(ctx, 8, 4, p.accent, rng, 3); dot(ctx, 7, 5, p.accent, rng, 3)
  dot(ctx, 15, 4, p.accent, rng, 3); dot(ctx, 16, 5, p.accent, rng, 3)

  // Mandibles
  dot(ctx, 10, 7, p.dark, rng); dot(ctx, 13, 7, p.dark, rng)

  // Fuzzy neck
  fill(ctx, 8, 8, 8, 3, p.primary, rng, 18)
}

function drawDeerHead(ctx, p, rng) {
  // Branching antlers
  dot(ctx, 6, 0, p.accent, rng, 5); dot(ctx, 4, 0, p.accent, rng, 5)
  dot(ctx, 5, 1, p.accent, rng, 5); dot(ctx, 7, 1, p.light, rng, 5)
  dot(ctx, 6, 2, p.light, rng, 5); dot(ctx, 7, 3, p.accent, rng, 5)
  dot(ctx, 17, 0, p.accent, rng, 5); dot(ctx, 19, 0, p.accent, rng, 5)
  dot(ctx, 18, 1, p.accent, rng, 5); dot(ctx, 16, 1, p.light, rng, 5)
  dot(ctx, 17, 2, p.light, rng, 5); dot(ctx, 16, 3, p.accent, rng, 5)

  // Elongated gentle face
  fill(ctx, 8, 3, 8, 2, p.primary, rng)
  fill(ctx, 7, 5, 10, 2, p.primary, rng)
  fill(ctx, 8, 7, 8, 2, p.mid, rng)
  fill(ctx, 9, 9, 6, 2, p.mid, rng)

  // Large gentle eyes
  fill(ctx, 8, 5, 2, 2, p.eye, rng, 4); dot(ctx, 9, 6, p.dark, rng, 2)
  fill(ctx, 14, 5, 2, 2, p.eye, rng, 4); dot(ctx, 14, 6, p.dark, rng, 2)

  // Nose
  dot(ctx, 11, 10, p.dark, rng); dot(ctx, 12, 10, p.dark, rng)
}

function drawRabbitHead(ctx, p, rng) {
  // Tall pointed ears
  dot(ctx, 7, 0, p.light, rng)
  fill(ctx, 7, 1, 2, 3, p.primary, rng); fill(ctx, 7, 4, 2, 1, p.mid, rng)
  dot(ctx, 8, 2, p.skin, rng); dot(ctx, 8, 3, p.skin, rng)
  dot(ctx, 16, 0, p.light, rng)
  fill(ctx, 15, 1, 2, 3, p.primary, rng); fill(ctx, 15, 4, 2, 1, p.mid, rng)
  dot(ctx, 15, 2, p.skin, rng); dot(ctx, 15, 3, p.skin, rng)

  // Compact round head
  fill(ctx, 8, 5, 8, 2, p.primary, rng)
  fill(ctx, 7, 7, 10, 2, p.primary, rng)
  fill(ctx, 8, 9, 8, 2, p.mid, rng)

  // Alert eyes
  fill(ctx, 8, 6, 2, 2, p.eye, rng, 4); dot(ctx, 9, 7, p.dark, rng, 2)
  fill(ctx, 14, 6, 2, 2, p.eye, rng, 4); dot(ctx, 14, 7, p.dark, rng, 2)

  // Nose
  dot(ctx, 11, 9, p.skin, rng, 4); dot(ctx, 12, 9, p.skin, rng, 4)

  // Whiskers
  dot(ctx, 5, 9, p.light, rng, 4); dot(ctx, 6, 8, p.light, rng, 4)
  dot(ctx, 18, 9, p.light, rng, 4); dot(ctx, 17, 8, p.light, rng, 4)
}


// ============================================================
//  BODY — shared humanoid base with element-specific texture
//  y:12-31
// ============================================================

function drawBody(ctx, p, element, rng) {
  // Shoulders
  fill(ctx, 6, 12, 12, 2, p.primary, rng)

  // Torso
  fill(ctx, 7, 14, 10, 4, p.mid, rng)
  fill(ctx, 8, 18, 8, 3, p.mid, rng)

  // Chest plate / element glyph
  fill(ctx, 9, 14, 6, 3, p.primary, rng)
  dot(ctx, 11, 15, p.accent, rng, 4); dot(ctx, 12, 15, p.accent, rng, 4)
  dot(ctx, 11, 16, p.accent, rng, 4); dot(ctx, 12, 16, p.accent, rng, 4)

  // Belt
  fill(ctx, 7, 20, 10, 1, p.dark, rng, 6)
  dot(ctx, 12, 20, p.accent, rng, 4)

  // Arms
  fill(ctx, 4, 13, 3, 6, p.mid, rng)
  fill(ctx, 17, 13, 3, 6, p.mid, rng)
  // Hands
  fill(ctx, 4, 19, 2, 2, p.skin, rng)
  fill(ctx, 18, 19, 2, 2, p.skin, rng)

  // Legs
  fill(ctx, 8, 21, 3, 7, p.dark, rng)
  fill(ctx, 13, 21, 3, 7, p.dark, rng)

  // Feet
  fill(ctx, 7, 28, 4, 2, p.dark, rng, 6)
  fill(ctx, 13, 28, 4, 2, p.dark, rng, 6)
  fill(ctx, 7, 30, 5, 2, p.mid, rng, 6)
  fill(ctx, 13, 30, 5, 2, p.mid, rng, 6)

  // Element-specific texture overlay
  const texturers = {
    fire() {
      // Scale-like texture
      for (let i = 0; i < 6; i++) {
        dot(ctx, 8 + Math.floor(rng() * 8), 14 + Math.floor(rng() * 6), p.light, rng, 4)
      }
    },
    water() {
      // Wet sheen highlights
      for (let i = 0; i < 5; i++) {
        dot(ctx, 8 + Math.floor(rng() * 8), 13 + Math.floor(rng() * 7), p.light, rng, 4)
      }
    },
    air() {
      // Feather-like markings
      for (let i = 0; i < 4; i++) {
        const sx = 8 + Math.floor(rng() * 7), sy = 14 + Math.floor(rng() * 5)
        dot(ctx, sx, sy, p.light, rng, 6); dot(ctx, sx + 1, sy, p.accent, rng, 6)
      }
    },
    earth() {
      // Bark / moss texture (heavier noise)
      for (let i = 0; i < 6; i++) {
        dot(ctx, 7 + Math.floor(rng() * 9), 13 + Math.floor(rng() * 8), p.dark, rng, 14)
      }
    },
  }
  texturers[element]?.()
}


// ============================================================
//  ACCESSORIES — determined by element2
// ============================================================

function drawFireAccessories(ctx, p, rng) {
  const f = p.el2
  // Flame wisps around shoulders and head
  for (let i = 0; i < 8; i++) {
    const fx = 2 + Math.floor(rng() * 20), fy = 2 + Math.floor(rng() * 14)
    dotAlpha(ctx, fx, fy, rng() > 0.5 ? f.light : f.accent, 0.6, rng, 4)
  }
  // Trailing embers below feet
  for (let i = 0; i < 3; i++) {
    dot(ctx, 8 + Math.floor(rng() * 8), 28 + Math.floor(rng() * 4), f.accent, rng, 4)
  }
}

function drawWaterAccessories(ctx, p, rng) {
  const w = p.el2
  // Back fin ridge
  for (let i = 0; i < 4; i++) {
    dot(ctx, 5, 13 + i * 2, w.light, rng); dot(ctx, 4, 14 + i * 2, w.accent, rng)
  }
  // Side fins
  fill(ctx, 2, 14, 2, 3, w.primary, rng); dot(ctx, 1, 15, w.accent, rng)
  fill(ctx, 20, 14, 2, 3, w.primary, rng); dot(ctx, 22, 15, w.accent, rng)
  // Drip particles
  for (let i = 0; i < 3; i++) {
    dot(ctx, 9 + Math.floor(rng() * 6), 30 + (rng() > 0.5 ? 1 : 0), w.light, rng)
  }
}

function drawAirAccessories(ctx, p, rng) {
  const a = p.el2
  const feathered = rng() > 0.5

  if (feathered) {
    // Feathered wings
    fill(ctx, 1, 12, 3, 2, a.primary, rng); fill(ctx, 0, 14, 4, 3, a.mid, rng)
    fill(ctx, 0, 17, 3, 2, a.light, rng)
    dot(ctx, 0, 13, a.light, rng); dot(ctx, 0, 16, a.accent, rng)
    fill(ctx, 20, 12, 3, 2, a.primary, rng); fill(ctx, 20, 14, 4, 3, a.mid, rng)
    fill(ctx, 21, 17, 3, 2, a.light, rng)
    dot(ctx, 23, 13, a.light, rng); dot(ctx, 23, 16, a.accent, rng)
  } else {
    // Gossamer wings (translucent, shimmering)
    for (let y = 12; y < 20; y++) {
      for (let x = 0; x < 4; x++) {
        if (rng() > 0.35) dotAlpha(ctx, x, y, rng() > 0.5 ? a.accent : a.light, 0.45, rng)
      }
      for (let x = 20; x < 24; x++) {
        if (rng() > 0.35) dotAlpha(ctx, x, y, rng() > 0.5 ? a.accent : a.light, 0.45, rng)
      }
    }
  }
}

function drawEarthAccessories(ctx, p, rng) {
  const e = p.el2
  // Vine tendrils from shoulders
  let vx = 5, vy = 12
  for (let i = 0; i < 6; i++) {
    dot(ctx, vx, vy, e.primary, rng)
    vx += rng() > 0.6 ? -1 : 0; vy += 1
    if (rng() > 0.6) dot(ctx, vx - 1, vy, e.accent, rng)
  }
  vx = 18; vy = 12
  for (let i = 0; i < 6; i++) {
    dot(ctx, vx, vy, e.primary, rng)
    vx += rng() > 0.6 ? 1 : 0; vy += 1
    if (rng() > 0.6) dot(ctx, vx + 1, vy, e.accent, rng)
  }
  // Moss patches on shoulders
  dot(ctx, 6, 12, e.accent, rng); dot(ctx, 7, 12, e.light, rng)
  dot(ctx, 16, 12, e.accent, rng); dot(ctx, 17, 12, e.light, rng)
}

const ACC_DRAWERS = { fire: drawFireAccessories, water: drawWaterAccessories, air: drawAirAccessories, earth: drawEarthAccessories }

const HEAD_DRAWERS = {
  fire: [drawSerpentHead, drawRamHead],
  water: [drawFishHead, drawJellyfishHead],
  air: [drawEagleHead, drawMothHead],
  earth: [drawDeerHead, drawRabbitHead],
}


// ============================================================
//  PUBLIC API
// ============================================================

export function createGodTexture(scene, params) {
  const rng = mulberry32((params.seed || 12345) + 77777)
  const ratio = ((params.elementRatio ?? 5) / 10)
  const palette = buildPalette(params.element1, params.element2, ratio, rng)

  const key = `god-${params.seed}-${params.element1}-${params.element2}`
  if (scene.textures.exists(key)) scene.textures.remove(key)

  const canvas = document.createElement('canvas')
  canvas.width = GOD_W
  canvas.height = GOD_H
  const ctx = canvas.getContext('2d')

  // Seeded variant pick: which of the two head types for element1
  const headVariant = rng() > 0.5 ? 1 : 0

  // Layer order: body (behind) -> head -> accessories (on top)
  drawBody(ctx, palette, params.element1, rng)
  const drawHead = HEAD_DRAWERS[params.element1]?.[headVariant] || HEAD_DRAWERS.fire[0]
  drawHead(ctx, palette, rng)
  const drawAcc = ACC_DRAWERS[params.element2] || drawFireAccessories
  drawAcc(ctx, palette, rng)

  scene.textures.addCanvas(key, canvas)
  return { key, headVariant }
}
