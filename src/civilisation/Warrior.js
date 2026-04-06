import { TILE_SIZE } from '../core/Constants.js'

// A villager / soldier figure rendered with stage-specific equipment.
// The same procedural texture builder is used for both the wandering
// units inside a village and for bodyguards dispatched to escort the
// god, so they read as the same culture upgrading together.

// Texture canvas size by stage. Mounted figures need a wider canvas.
const STAGE_DIMS = {
  1: [4, 7], 2: [4, 8], 3: [4, 9], 4: [5, 8], 5: [5, 8], 6: [8, 10], 7: [6, 9],
}

const STAGE_NAMES = {
  1: 'villager', 2: 'clubber', 3: 'spearman', 4: 'archer', 5: 'swordsman', 6: 'rider', 7: 'arcanist',
}

function hex(c) {
  return `rgb(${(c >> 16) & 0xff},${(c >> 8) & 0xff},${c & 0xff})`
}

function blend(a, b, t) {
  const r = Math.round(((a >> 16) & 0xff) + (((b >> 16) & 0xff) - ((a >> 16) & 0xff)) * t)
  const g = Math.round(((a >> 8) & 0xff) + (((b >> 8) & 0xff) - ((a >> 8) & 0xff)) * t)
  const b2 = Math.round((a & 0xff) + ((b & 0xff) - (a & 0xff)) * t)
  return (r << 16) | (g << 8) | b2
}

// Draw a base humanoid (head, body, legs) at the given canvas. Per-stage
// draws layer extra equipment on top (or replace entirely for mounted).
function drawBase(ctx, w, h, clothingHex) {
  ctx.fillStyle = '#c8a882'
  ctx.fillRect(1, 0, 2, 2) // head
  ctx.fillStyle = clothingHex
  ctx.fillRect(0, 2, 4, 3) // torso
  ctx.fillStyle = hex(blend(0x1a1a1a, 0x444444, 0.4))
  ctx.fillRect(0, 5, 1, 2) // left leg
  ctx.fillRect(3, 5, 1, 2) // right leg
}

function drawClubber(ctx, w, h, clothingHex) {
  drawBase(ctx, w, h, clothingHex)
  // Club: short brown vertical stick to the right
  ctx.fillStyle = '#5a3a1a'
  ctx.fillRect(3, 1, 1, 4)
  ctx.fillStyle = '#7a5a2a'
  ctx.fillRect(3, 5, 1, 2)
}

function drawSpearman(ctx, w, h, clothingHex) {
  drawBase(ctx, w, h, clothingHex)
  // Tall spear shaft
  ctx.fillStyle = '#7a5a2a'
  ctx.fillRect(3, 0, 1, 8)
  // Iron tip
  ctx.fillStyle = '#aaaaaa'
  ctx.fillRect(3, 0, 1, 1)
}

function drawArcher(ctx, w, h, clothingHex) {
  drawBase(ctx, w, h, clothingHex)
  // Bow as a vertical curved C-shape on the left
  ctx.fillStyle = '#7a5a2a'
  ctx.fillRect(0, 1, 1, 1)
  ctx.fillRect(0, 6, 1, 1)
  ctx.fillRect(1, 0, 1, 1)
  ctx.fillRect(1, 7, 1, 1)
  // Bowstring
  ctx.fillStyle = '#dddddd'
  ctx.fillRect(0, 2, 1, 4)
}

function drawSwordsman(ctx, w, h, clothingHex) {
  drawBase(ctx, w, h, clothingHex)
  // Sword: vertical bright blade right of body
  ctx.fillStyle = '#dddddd'
  ctx.fillRect(4, 1, 1, 4)
  // Crossguard
  ctx.fillStyle = '#aa8a44'
  ctx.fillRect(3, 4, 2, 1)
  // Shield: small circle on left arm
  ctx.fillStyle = '#5a3a1a'
  ctx.fillRect(0, 3, 1, 2)
  ctx.fillStyle = '#aa8a44'
  ctx.fillRect(0, 3, 1, 1)
}

function drawRider(ctx, w, h, clothingHex) {
  // Horse body (dark brown), 6 wide x 4 tall
  ctx.fillStyle = '#4a2a0a'
  ctx.fillRect(0, 5, 6, 3)
  // Horse head poking forward
  ctx.fillRect(6, 4, 2, 2)
  // Mane
  ctx.fillStyle = '#2a1a00'
  ctx.fillRect(5, 4, 1, 2)
  // Legs
  ctx.fillRect(0, 8, 1, 2)
  ctx.fillRect(2, 8, 1, 2)
  ctx.fillRect(4, 8, 1, 2)
  ctx.fillRect(5, 8, 1, 2)
  // Rider torso (clothing colour) sitting on horse
  ctx.fillStyle = clothingHex
  ctx.fillRect(2, 2, 2, 3)
  // Rider head
  ctx.fillStyle = '#c8a882'
  ctx.fillRect(2, 0, 2, 2)
  // Lance (long spear forward)
  ctx.fillStyle = '#7a5a2a'
  ctx.fillRect(4, 1, 4, 1)
  ctx.fillStyle = '#aaaaaa'
  ctx.fillRect(7, 1, 1, 1)
}

function drawArcanist(ctx, w, h, clothingHex) {
  // Robed figure with glowing staff
  // Head
  ctx.fillStyle = '#c8a882'
  ctx.fillRect(2, 0, 2, 2)
  // Hood / robe (clothing colour darker)
  ctx.fillStyle = hex(blend(clothingHex.startsWith ? 0x4a2a6a : 0x4a2a6a, 0x2a1a4a, 0.3))
  // Robe widens at the bottom (trapezoid)
  ctx.fillRect(1, 2, 4, 3)
  ctx.fillRect(0, 5, 6, 3)
  // Staff
  ctx.fillStyle = '#7a5a2a'
  ctx.fillRect(5, 0, 1, 7)
  // Glowing orb at the top
  ctx.fillStyle = '#9affe6'
  ctx.fillRect(5, 0, 1, 1)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(5, 0, 1, 1)
}

const STAGE_DRAW = {
  1: drawBase,
  2: drawClubber,
  3: drawSpearman,
  4: drawArcher,
  5: drawSwordsman,
  6: drawRider,
  7: drawArcanist,
}

// Build (and cache) a procedural texture for one warrior class.
// clothingHex is the village's element-tinted accent so each settlement
// fields visually consistent troops.
export function ensureWarriorTexture(scene, stage, clothingColour) {
  const key = `wrr-${stage}-${clothingColour.toString(16)}`
  if (scene.textures.exists(key)) return key

  const [w, h] = STAGE_DIMS[stage] || STAGE_DIMS[1]
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')

  const drawFn = STAGE_DRAW[stage] || drawBase
  drawFn(ctx, w, h, hex(clothingColour))

  scene.textures.addCanvas(key, c)
  return key
}

// Lightweight wandering AI used by villages: walks around the village
// centre, bounces at the edge of the spread radius, pauses occasionally.
export class WanderingWarrior {
  constructor(scene, x, y, stage, clothingColour, anchorX, spreadPx) {
    this.scene = scene
    this.stage = stage
    this.anchorX = anchorX
    this.spreadPx = spreadPx
    this.role = STAGE_NAMES[stage] || 'villager'

    const key = ensureWarriorTexture(scene, stage, clothingColour)
    this.sprite = scene.add.sprite(x, y, key)
    this.sprite.setOrigin(0.5, 1)
    this.sprite.setDepth(6)

    // Mounted units move faster, walk further.
    const baseSpeed = stage >= 6 ? 14 : 6
    this.direction = Math.random() > 0.5 ? 1 : -1
    this.speed = baseSpeed + Math.random() * 8
    this.pauseTimer = 0
    this.isPaused = false
  }

  update(delta) {
    if (this.isPaused) {
      this.pauseTimer -= delta
      if (this.pauseTimer <= 0) {
        this.isPaused = false
        if (Math.random() > 0.5) this.direction *= -1
      }
      return
    }

    this.sprite.x += this.direction * this.speed * delta / 1000
    this.sprite.setFlipX(this.direction < 0)

    if (Math.abs(this.sprite.x - this.anchorX) > this.spreadPx) {
      this.direction *= -1
      this.sprite.x = this.anchorX + Math.sign(this.sprite.x - this.anchorX) * this.spreadPx
    }

    if (Math.random() < 0.004) {
      this.isPaused = true
      this.pauseTimer = 600 + Math.random() * 2000
    }
  }

  destroy() {
    this.sprite.destroy()
  }
}
