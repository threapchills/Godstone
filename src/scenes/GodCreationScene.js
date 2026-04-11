import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../core/Constants.js'
import { GOD_PARTS } from '../god/GodPartManifest.js'
import { compositeGod, COMPOSITE_W, COMPOSITE_H } from '../god/GodCompositor.js'

// The god dominates the screen. Two small arrows flank each body
// region (head, body, legs) to cycle through options. A dice button
// randomises all three. A Done CTA launches the world.

const PREVIEW_HEIGHT = 340
const PREVIEW_SCALE = PREVIEW_HEIGHT / COMPOSITE_H

// Arrow chevron geometry
const ARROW_W = 28
const ARROW_H = 32

export default class GodCreationScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GodCreation' })
  }

  init(data) {
    this.params = data.params
  }

  create() {
    const cx = GAME_WIDTH / 2
    const params = this.params

    // Dark atmospheric background
    this.cameras.main.setBackgroundColor('#0a0b12')

    if (this.textures.exists('dist_mountains')) {
      this.add.image(cx, GAME_HEIGHT - 20, 'dist_mountains')
        .setOrigin(0.5, 1).setScale(1.4).setAlpha(0.15).setTint(0x2a3a5a)
    }
    if (this.textures.exists('fluffy_clouds')) {
      const cloud = this.add.image(cx + 80, GAME_HEIGHT / 3, 'fluffy_clouds')
        .setOrigin(0.5).setScale(1.3).setAlpha(0.08).setTint(0x4a5a8a)
      this.tweens.add({
        targets: cloud, x: cx - 80, duration: 20000,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      })
    }

    // Title
    this.add.text(cx, 30, 'Shape your god', {
      fontFamily: 'Georgia, serif',
      fontSize: '28px',
      color: '#e4b660',
      stroke: '#3a2a10',
      strokeThickness: 4,
    }).setOrigin(0.5).setShadow(2, 3, '#000000', 5, true, true)

    // Subtle element pair reminder
    this.add.text(cx, 62, `${params.element1} + ${params.element2}`, {
      fontFamily: 'Georgia, serif',
      fontSize: '13px',
      color: '#6a7a5a',
      fontStyle: 'italic',
    }).setOrigin(0.5)

    // Build part pools (flat arrays for cycling)
    this.headPool = GOD_PARTS.heads
    this.bodyPool = GOD_PARTS.bodies
    this.legsPool = GOD_PARTS.legs

    // Default selection: first part matching primary element, or index 0
    this.headIndex = this._findElementIndex(this.headPool, params.element1)
    this.bodyIndex = this._findElementIndex(this.bodyPool, params.element1)
    this.legsIndex = this._findElementIndex(this.legsPool, params.element1)

    // Preview image placeholder
    this.previewY = 90
    this.previewImage = null
    this._rebuildPreview()

    // Arrow pickers for each zone (positioned beside the preview)
    const previewLeft = cx - (COMPOSITE_W * PREVIEW_SCALE) / 2 - 50
    const previewRight = cx + (COMPOSITE_W * PREVIEW_SCALE) / 2 + 50

    // Head arrows (top third of preview)
    const headY = this.previewY + PREVIEW_HEIGHT * 0.17
    this._createArrowPair(previewLeft, previewRight, headY, 'head')

    // Body arrows (middle third)
    const bodyY = this.previewY + PREVIEW_HEIGHT * 0.50
    this._createArrowPair(previewLeft, previewRight, bodyY, 'body')

    // Legs arrows (bottom third)
    const legsY = this.previewY + PREVIEW_HEIGHT * 0.83
    this._createArrowPair(previewLeft, previewRight, legsY, 'legs')

    // Part labels (subtle, beside the arrows)
    const labelX = previewLeft - 8
    const labelStyle = {
      fontFamily: 'Georgia, serif', fontSize: '10px',
      color: '#555555', fontStyle: 'italic',
    }
    this.add.text(labelX, headY, 'head', labelStyle).setOrigin(1, 0.5)
    this.add.text(labelX, bodyY, 'body', labelStyle).setOrigin(1, 0.5)
    this.add.text(labelX, legsY, 'legs', labelStyle).setOrigin(1, 0.5)

    // Randomise dice button
    const diceY = this.previewY + PREVIEW_HEIGHT + 28
    const diceBtn = this.add.container(cx, diceY)
    const diceBg = this.add.graphics()
    diceBg.fillStyle(0x2a2a3a, 0.8)
    diceBg.fillRoundedRect(-22, -18, 44, 36, 10)
    diceBg.lineStyle(1, 0x5a5a6a, 0.6)
    diceBg.strokeRoundedRect(-22, -18, 44, 36, 10)
    diceBtn.add(diceBg)

    const diceText = this.add.text(0, 0, '\u2684', {
      fontFamily: 'Georgia, serif', fontSize: '24px', color: '#aaaaaa',
    }).setOrigin(0.5)
    diceBtn.add(diceText)

    const diceHit = new Phaser.Geom.Rectangle(-22, -18, 44, 36)
    diceBtn.setInteractive(diceHit, Phaser.Geom.Rectangle.Contains)
    diceBtn.input.cursor = 'pointer'
    diceBtn.on('pointerdown', () => this._randomiseAll())
    diceBtn.on('pointerover', () => {
      diceText.setColor('#e4b660')
      this.tweens.add({ targets: diceBtn, scale: 1.1, duration: 80 })
    })
    diceBtn.on('pointerout', () => {
      diceText.setColor('#aaaaaa')
      this.tweens.add({ targets: diceBtn, scale: 1, duration: 80 })
    })

    // Done CTA
    const doneY = diceY + 52
    const doneBtnContainer = this.add.container(cx, doneY)
    const doneBg = this.add.graphics()
    doneBg.fillStyle(0xdba12a, 0.85)
    doneBg.fillRoundedRect(-80, -22, 160, 44, 22)
    doneBg.lineStyle(2, 0xffd280, 1)
    doneBg.strokeRoundedRect(-80, -22, 160, 44, 22)
    doneBtnContainer.add(doneBg)

    const doneText = this.add.text(0, 0, 'Done', {
      fontFamily: 'Georgia, serif', fontSize: '20px',
      color: '#ffffff', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setShadow(1, 2, '#000000', 3, true, true)
    doneBtnContainer.add(doneText)

    const doneHit = new Phaser.Geom.Rectangle(-80, -22, 160, 44)
    doneBtnContainer.setInteractive(doneHit, Phaser.Geom.Rectangle.Contains)
    doneBtnContainer.input.cursor = 'pointer'
    doneBtnContainer.on('pointerdown', () => this._launchWorld())
    doneBtnContainer.on('pointerover', () => {
      this.tweens.add({ targets: doneBtnContainer, scale: 1.06, duration: 100 })
    })
    doneBtnContainer.on('pointerout', () => {
      this.tweens.add({ targets: doneBtnContainer, scale: 1, duration: 100 })
    })

    // Gentle pulse on the done button
    this.tweens.add({
      targets: doneBtnContainer, scale: 1.02, duration: 900,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })

    // Element indicator dot showing which element the current part belongs to
    this.headDot = this._createElementDot(previewRight + 30, headY)
    this.bodyDot = this._createElementDot(previewRight + 30, bodyY)
    this.legsDot = this._createElementDot(previewRight + 30, legsY)
    this._updateElementDots()
  }

  _findElementIndex(pool, element) {
    const idx = pool.findIndex(p => p.element === element)
    return idx >= 0 ? idx : 0
  }

  _createArrowPair(leftX, rightX, y, slot) {
    // Left arrow (previous)
    const leftArrow = this._createArrow(leftX, y, true)
    leftArrow.on('pointerdown', () => this._cyclePart(slot, -1))

    // Right arrow (next)
    const rightArrow = this._createArrow(rightX, y, false)
    rightArrow.on('pointerdown', () => this._cyclePart(slot, 1))
  }

  _createArrow(x, y, facingLeft) {
    const container = this.add.container(x, y)

    const gfx = this.add.graphics()
    gfx.fillStyle(0x1a1c2a, 0.7)
    gfx.fillRoundedRect(-ARROW_W / 2, -ARROW_H / 2, ARROW_W, ARROW_H, 8)
    container.add(gfx)

    // Chevron character
    const chevron = facingLeft ? '\u2039' : '\u203a'
    const text = this.add.text(0, 0, chevron, {
      fontFamily: 'Georgia, serif', fontSize: '22px', color: '#888888',
    }).setOrigin(0.5)
    container.add(text)

    const hit = new Phaser.Geom.Rectangle(-ARROW_W / 2, -ARROW_H / 2, ARROW_W, ARROW_H)
    container.setInteractive(hit, Phaser.Geom.Rectangle.Contains)
    container.input.cursor = 'pointer'

    container.on('pointerover', () => {
      text.setColor('#e4b660')
      this.tweens.add({ targets: container, scale: 1.15, duration: 80 })
    })
    container.on('pointerout', () => {
      text.setColor('#888888')
      this.tweens.add({ targets: container, scale: 1, duration: 80 })
    })

    return container
  }

  _createElementDot(x, y) {
    const dot = this.add.circle(x, y, 5, 0x888888, 0.7)
    return dot
  }

  _updateElementDots() {
    const elementColours = {
      fire: 0xe85a20, water: 0x2888aa, air: 0xb0c0d0, earth: 0x6a8a3a,
    }
    if (this.headDot) {
      const el = this.headPool[this.headIndex]?.element || 'fire'
      this.headDot.setFillStyle(elementColours[el] || 0x888888, 0.8)
    }
    if (this.bodyDot) {
      const el = this.bodyPool[this.bodyIndex]?.element || 'fire'
      this.bodyDot.setFillStyle(elementColours[el] || 0x888888, 0.8)
    }
    if (this.legsDot) {
      const el = this.legsPool[this.legsIndex]?.element || 'fire'
      this.legsDot.setFillStyle(elementColours[el] || 0x888888, 0.8)
    }
  }

  _cyclePart(slot, direction) {
    if (slot === 'head') {
      this.headIndex = (this.headIndex + direction + this.headPool.length) % this.headPool.length
    } else if (slot === 'body') {
      this.bodyIndex = (this.bodyIndex + direction + this.bodyPool.length) % this.bodyPool.length
    } else {
      this.legsIndex = (this.legsIndex + direction + this.legsPool.length) % this.legsPool.length
    }
    this._rebuildPreview()
    this._updateElementDots()
  }

  _randomiseAll() {
    this.headIndex = Math.floor(Math.random() * this.headPool.length)
    this.bodyIndex = Math.floor(Math.random() * this.bodyPool.length)
    this.legsIndex = Math.floor(Math.random() * this.legsPool.length)
    this._rebuildPreview()
    this._updateElementDots()
  }

  _rebuildPreview() {
    const headKey = this.headPool[this.headIndex].key
    const bodyKey = this.bodyPool[this.bodyIndex].key
    const legsKey = this.legsPool[this.legsIndex].key
    const uniqueId = `preview-${headKey}-${bodyKey}-${legsKey}`

    // Remove old composite texture to avoid stale cache during cycling
    const fullKey = `god-composite-${uniqueId}`
    if (this.textures.exists(fullKey)) {
      this.textures.remove(fullKey)
    }

    const { key } = compositeGod(this, headKey, bodyKey, legsKey, uniqueId)

    if (this.previewImage) {
      this.previewImage.setTexture(key)
    } else {
      this.previewImage = this.add.image(
        GAME_WIDTH / 2, this.previewY, key
      ).setOrigin(0.5, 0).setScale(PREVIEW_SCALE)
    }

    // Subtle entrance tween when a part changes
    this.previewImage.setAlpha(0.7)
    this.tweens.add({
      targets: this.previewImage, alpha: 1, duration: 200,
    })
  }

  _launchWorld() {
    const godHead = this.headPool[this.headIndex].key
    const godBody = this.bodyPool[this.bodyIndex].key
    const godLegs = this.legsPool[this.legsIndex].key

    this.scene.start('World', {
      params: {
        ...this.params,
        godHead,
        godBody,
        godLegs,
      },
    })
  }
}
