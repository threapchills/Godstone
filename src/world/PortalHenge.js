import { TILE_SIZE } from '../core/Constants.js'
import { findGroundTileY } from '../utils/Grounding.js'

// The portal henge: a Stonehenge-like structure, one per world. The
// sole gateway to the omniverse. Phase 7 wires actual portal mechanics
// onto this scaffold:
//
//   - DORMANT: untouched. Pulses gently.
//   - CHOOSING: god is within range, the prompt is up. Player picks
//     'I' for inbound (an enemy god arrives with an army) or 'O' for
//     outbound (the god is hurled into a raid world).
//   - ACTIVE_INBOUND: an invasion is in progress. Re-touching the
//     portal doesn't reopen the prompt until the invasion resolves.
//   - ACTIVE_OUTBOUND: the god has travelled. Same lock.
//   - COOLDOWN: brief settling period after a sortie ends.
//
// On a raid world (params.isRaid === true) the portal is the return
// stone instead. Touching it sends the god home. Each outbound trip
// allows exactly one round trip; the next portal interaction back home
// rolls a fresh inbound/outbound choice with a new random raid seed.
export default class PortalHenge {
  constructor(scene, tileX, tileY, params) {
    this.scene = scene
    this.tileX = tileX
    this.tileY = tileY
    this.params = params
    this.state = 'DORMANT'
    this._cooldownUntil = 0
    this._promptCooldown = 0

    const px = tileX * TILE_SIZE + TILE_SIZE * 3
    const py = tileY * TILE_SIZE

    this.createSprite(scene, px, py, params)
    this.createLabel(scene, px, py)
    this.createGlow(scene, px, py, params)
  }

  // Distance from the god (in pixels) at which the portal opens its
  // prompt. Generous so the player doesn't have to thread a needle.
  get interactionRadius() { return TILE_SIZE * 6 }

  // Update from WorldScene.update each frame. Drives the prompt UI,
  // dispatches the player's choice when a key is pressed, and ticks
  // any active cooldown.
  updateInteraction(time, godSprite) {
    if (this._cooldownUntil > time) return
    if (!godSprite) return
    const dx = godSprite.x - this.worldX
    const dy = godSprite.y - this.worldY
    const distSq = dx * dx + dy * dy
    const r = this.interactionRadius
    const inRange = distSq < r * r

    // Block portal if an invasion is active (enemy god alive)
    if (inRange && this.state === 'DORMANT' && this.scene.enemyGod?.alive) {
      // Only show the warning once per approach (throttle)
      if (!this._invasionWarnTime || time - this._invasionWarnTime > 3000) {
        this._invasionWarnTime = time
        this.scene.showMessage?.('Defeat the invading god before using the portal!', 2000)
      }
      return
    }

    // Show the prompt when the god enters range and the portal is idle
    if (inRange && this.state === 'DORMANT') {
      this.state = 'CHOOSING'
      this.scene._showPortalPrompt?.(this)
    } else if (!inRange && this.state === 'CHOOSING') {
      // Player walked away without choosing
      this.state = 'DORMANT'
      this.scene._hidePortalPrompt?.()
    }
  }

  // Called by the scene after a sortie ends so the portal returns to
  // dormant after a brief cooldown. Lock window keeps the prompt from
  // re-firing the instant the player steps off.
  endSortie() {
    this.state = 'DORMANT'
    this._cooldownUntil = this.scene.time.now + 4000
    this.scene._hidePortalPrompt?.()
  }

  // Re-snap the portal sprite to the current ground beneath it. The
  // label and the glow ride on the sprite's y so they all move
  // together. Bounded so a portal next to a chasm doesn't fall in.
  updateGrounding() {
    const grid = this.scene.worldGrid?.grid
    if (!grid || !this.sprite) return
    const tileX = Math.floor(this.sprite.x / TILE_SIZE)
    const startTileY = Math.max(0, Math.floor(this.sprite.y / TILE_SIZE) - 2)
    const groundTileY = findGroundTileY(grid, tileX, startTileY, this.tileY)
    const targetY = groundTileY * TILE_SIZE
    if (Math.abs(this.sprite.y - targetY) > 0.5) {
      const dy = targetY - this.sprite.y
      this.sprite.y = targetY
      if (this.label) this.label.y += dy
      if (this.glow) this.glow.y += dy
    }
  }

  createSprite(scene, px, py, params) {
    const width = TILE_SIZE * 7
    const height = TILE_SIZE * 6
    const key = 'portal-henge'

    if (!scene.textures.exists(key)) {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')

      const stoneColour = '#7a7a6a'
      const darkStone = '#4a4a3a'
      const portalGlow = '#4488cc'

      // Left pillar
      ctx.fillStyle = stoneColour
      ctx.fillRect(4, 8, 8, height - 8)
      ctx.fillStyle = darkStone
      ctx.fillRect(4, 8, 2, height - 8)

      // Right pillar
      ctx.fillStyle = stoneColour
      ctx.fillRect(width - 12, 8, 8, height - 8)
      ctx.fillStyle = darkStone
      ctx.fillRect(width - 12, 8, 2, height - 8)

      // Lintel across the top
      ctx.fillStyle = stoneColour
      ctx.fillRect(2, 4, width - 4, 8)
      ctx.fillStyle = darkStone
      ctx.fillRect(2, 4, width - 4, 2)

      // Inner pillars (shorter)
      ctx.fillStyle = darkStone
      ctx.fillRect(16, 16, 5, height - 16)
      ctx.fillRect(width - 21, 16, 5, height - 16)

      // Portal glow inside the archway
      ctx.fillStyle = portalGlow
      ctx.globalAlpha = 0.15
      ctx.fillRect(12, 12, width - 24, height - 12)
      ctx.globalAlpha = 0.3
      ctx.fillRect(20, 16, width - 40, height - 20)
      ctx.globalAlpha = 1

      // Rune marks on pillars
      ctx.fillStyle = '#88aacc'
      ctx.globalAlpha = 0.6
      // Left pillar runes
      ctx.fillRect(6, 14, 2, 2)
      ctx.fillRect(7, 22, 2, 2)
      ctx.fillRect(6, 30, 2, 2)
      // Right pillar runes
      ctx.fillRect(width - 8, 14, 2, 2)
      ctx.fillRect(width - 9, 22, 2, 2)
      ctx.fillRect(width - 8, 30, 2, 2)
      ctx.globalAlpha = 1

      // Capstone decoration
      ctx.fillStyle = '#aaaaaa'
      ctx.fillRect(width / 2 - 3, 2, 6, 3)

      scene.textures.addCanvas(key, canvas)
    }

    this.sprite = scene.add.sprite(px, py, key)
    this.sprite.setOrigin(0.5, 1)
    this.sprite.setDepth(5)
  }

  createLabel(scene, px, py) {
    this.label = scene.add.text(px, py - TILE_SIZE * 7, 'Portal henge', {
      fontFamily: 'Georgia, serif',
      fontSize: '10px',
      color: '#88aacc',
      stroke: '#000000',
      strokeThickness: 2,
    })
    this.label.setOrigin(0.5, 1)
    this.label.setDepth(9)
  }

  createGlow(scene, px, py, params) {
    // Pulsing ambient glow
    this.glow = scene.add.ellipse(px, py - TILE_SIZE * 2.5, TILE_SIZE * 4, TILE_SIZE * 5, 0x4488cc, 0.08)
    this.glow.setDepth(4)

    scene.tweens.add({
      targets: this.glow,
      alpha: { from: 0.08, to: 0.02 },
      scaleX: { from: 1, to: 1.2 },
      scaleY: { from: 1, to: 1.1 },
      duration: 3000,
      yoyo: true,
      repeat: -1,
    })
  }

  get worldX() { return this.tileX * TILE_SIZE + TILE_SIZE * 3 }
  get worldY() { return this.tileY * TILE_SIZE }
}
