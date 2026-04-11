// Composites three god-part textures (head, body, legs) into a single
// canvas texture for use as the god sprite. Supports optional hue
// shifting for enemy gods so each rival reads as elementally distinct.

import Phaser from 'phaser'

export const COMPOSITE_W = 128
export const COMPOSITE_H = 192
export const GOD_DISPLAY_SCALE = 0.085

// Each part occupies a vertical zone of this height inside the composite
const ZONE_H = 64

// Overlap: parts bleed into adjacent zones by this many pixels so the
// seam between head/body/legs is hidden behind natural layering.
const OVERLAP = 8

/**
 * Composite a god from three part texture keys.
 * @param {Phaser.Scene} scene
 * @param {string} headKey  - Phaser texture key for the head asset
 * @param {string} bodyKey  - Phaser texture key for the body asset
 * @param {string} legsKey  - Phaser texture key for the legs asset
 * @param {string} uniqueId - Unique suffix for the composite texture key
 * @param {object} [opts]   - Optional post-processing
 * @param {number} [opts.hueShift] - Degrees to rotate hue (0-360)
 * @returns {{ key: string }}
 */
export function compositeGod(scene, headKey, bodyKey, legsKey, uniqueId, opts) {
  const key = `god-composite-${uniqueId}`
  if (scene.textures.exists(key)) return { key }

  const canvas = document.createElement('canvas')
  canvas.width = COMPOSITE_W
  canvas.height = COMPOSITE_H
  const ctx = canvas.getContext('2d')

  // Draw order: legs first (bottom), body over legs, head over body.
  // Each part is scaled to fit its zone and bottom-aligned within it
  // so the natural overlap hides the seam.
  _drawPart(ctx, scene, legsKey, 0, ZONE_H * 2 - OVERLAP, COMPOSITE_W, ZONE_H + OVERLAP)
  _drawPart(ctx, scene, bodyKey, 0, ZONE_H - OVERLAP, COMPOSITE_W, ZONE_H + OVERLAP * 2)
  _drawPart(ctx, scene, headKey, 0, 0, COMPOSITE_W, ZONE_H + OVERLAP)

  // Optional hue shift for enemy gods
  if (opts?.hueShift) {
    _applyHueShift(ctx, COMPOSITE_W, COMPOSITE_H, opts.hueShift)
  }

  scene.textures.addCanvas(key, canvas)

  // Override the global pixelArt nearest-neighbour for this texture so
  // the detailed illustrations downscale smoothly at game scale.
  // Phaser creates the GL texture lazily on first render, so we set
  // the filter mode via Phaser's own API instead of raw GL calls.
  try {
    const phaserTex = scene.textures.get(key)
    if (phaserTex) {
      phaserTex.setFilter(Phaser.Textures.FilterMode.LINEAR)
    }
  } catch (_) { /* canvas-only fallback; GL not available */ }

  return { key }
}

function _drawPart(ctx, scene, textureKey, zoneX, zoneY, zoneW, zoneH) {
  const tex = scene.textures.get(textureKey)
  if (!tex || !tex.source || !tex.source[0]) return
  const img = tex.source[0].image
  if (!img) return

  const srcW = img.width
  const srcH = img.height
  if (srcW === 0 || srcH === 0) return

  // Scale uniformly to fit within the zone, preserving aspect ratio
  const scale = Math.min(zoneW / srcW, zoneH / srcH)
  const drawW = srcW * scale
  const drawH = srcH * scale

  // Centre horizontally, bottom-align vertically
  const drawX = zoneX + (zoneW - drawW) / 2
  const drawY = zoneY + (zoneH - drawH)

  ctx.drawImage(img, drawX, drawY, drawW, drawH)
}

// Pixel-level hue rotation. Runs once per composite, not per frame.
function _applyHueShift(ctx, w, h, degrees) {
  if (Math.abs(degrees) < 1) return
  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data
  const shift = degrees / 360

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue // skip fully transparent
    const r = data[i] / 255
    const g = data[i + 1] / 255
    const b = data[i + 2] / 255

    // RGB to HSL
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    let h2 = 0, s = 0

    if (max !== min) {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      if (max === r) h2 = ((g - b) / d + (g < b ? 6 : 0)) / 6
      else if (max === g) h2 = ((b - r) / d + 2) / 6
      else h2 = ((r - g) / d + 4) / 6
    }

    // Rotate hue
    h2 = (h2 + shift) % 1
    if (h2 < 0) h2 += 1

    // HSL to RGB
    let r2, g2, b2
    if (s === 0) {
      r2 = g2 = b2 = l
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s
      const p = 2 * l - q
      r2 = _hue2rgb(p, q, h2 + 1 / 3)
      g2 = _hue2rgb(p, q, h2)
      b2 = _hue2rgb(p, q, h2 - 1 / 3)
    }

    data[i] = Math.round(r2 * 255)
    data[i + 1] = Math.round(g2 * 255)
    data[i + 2] = Math.round(b2 * 255)
  }

  ctx.putImageData(imageData, 0, 0)
}

function _hue2rgb(p, q, t) {
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}
