import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT, ELEMENTS } from '../core/Constants.js'

// The world creation screen.
// Player selects two elements, adjusts ratio and terrain sliders, then creates.
export default class CreationScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Creation' })
  }

  create() {
    const cx = GAME_WIDTH / 2
    this.cameras.main.setBackgroundColor('#0d0d1a')

    // State
    this.selectedElements = []
    this.elementRatio = 5
    this.sliders = { skyCave: 0.5, barrenFertile: 0.5, sparseDense: 0.5 }
    this.worldSeed = Math.floor(Math.random() * 999999)

    // Title
    this.add.text(cx, 40, 'GODSTONE', {
      fontFamily: 'Georgia, serif',
      fontSize: '48px',
      color: '#c07a28',
      stroke: '#1a0a04',
      strokeThickness: 4,
    }).setOrigin(0.5)

    this.add.text(cx, 80, 'Shape your world', {
      fontFamily: 'Georgia, serif',
      fontSize: '16px',
      color: '#4a7a6a',
      fontStyle: 'italic',
    }).setOrigin(0.5)

    // Element selection
    this.add.text(cx, 120, 'Choose two elements', {
      fontFamily: 'Georgia, serif',
      fontSize: '14px',
      color: '#888888',
    }).setOrigin(0.5)

    this.elementButtons = {}
    const elements = [
      { key: ELEMENTS.FIRE, label: 'Fire', colour: '#e85a20', x: cx - 150 },
      { key: ELEMENTS.WATER, label: 'Water', colour: '#2888aa', x: cx - 50 },
      { key: ELEMENTS.AIR, label: 'Air', colour: '#b0c0d0', x: cx + 50 },
      { key: ELEMENTS.EARTH, label: 'Earth', colour: '#6a8a3a', x: cx + 150 },
    ]

    elements.forEach(el => {
      const btn = this.createElementButton(el.x, 160, el.label, el.colour, el.key)
      this.elementButtons[el.key] = btn
    })

    // Ratio slider (hidden until two elements chosen)
    this.ratioGroup = this.add.group()
    this.ratioLabel = this.add.text(cx, 210, 'Elemental balance: 5 / 5', {
      fontFamily: 'Georgia, serif',
      fontSize: '12px',
      color: '#888888',
    }).setOrigin(0.5).setVisible(false)

    this.ratioSlider = this.createSlider(cx, 235, 200, (value) => {
      this.elementRatio = Math.round(value * 10)
      const r2 = 10 - this.elementRatio
      const e1 = this.selectedElements[0] || '?'
      const e2 = this.selectedElements[1] || '?'
      this.ratioLabel.setText(`${e1}: ${this.elementRatio}  /  ${e2}: ${r2}`)
    })
    this.ratioSlider.container.setVisible(false)

    // Terrain sliders
    this.add.text(cx, 275, 'Terrain', {
      fontFamily: 'Georgia, serif',
      fontSize: '14px',
      color: '#888888',
    }).setOrigin(0.5)

    this.createTerrainSlider(cx, 310, 'Sky', 'Cave', 'skyCave')
    this.createTerrainSlider(cx, 350, 'Barren', 'Fertile', 'barrenFertile')
    this.createTerrainSlider(cx, 390, 'Sparse', 'Dense', 'sparseDense')

    // Seed input
    this.add.text(cx, 430, `Seed: ${this.worldSeed}`, {
      fontFamily: 'Georgia, serif',
      fontSize: '12px',
      color: '#666666',
    }).setOrigin(0.5)

    // Create button
    this.createButton = this.add.text(cx, 490, '[ Create world ]', {
      fontFamily: 'Georgia, serif',
      fontSize: '20px',
      color: '#333333',
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(0.5)

    this.updateCreateButton()

    // Instructions
    this.add.text(cx, 560, 'WASD or arrows to move  /  Space to jump  /  Down to dig', {
      fontFamily: 'Georgia, serif',
      fontSize: '11px',
      color: '#444444',
    }).setOrigin(0.5)
  }

  createElementButton(x, y, label, colour, key) {
    const bg = this.add.rectangle(x, y, 80, 36, Phaser.Display.Color.HexStringToColor(colour).color, 0.15)
    bg.setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(colour).color, 0.4)
    bg.setInteractive({ useHandCursor: true })

    const text = this.add.text(x, y, label, {
      fontFamily: 'Georgia, serif',
      fontSize: '14px',
      color: colour,
    }).setOrigin(0.5)

    const btnState = { selected: false, bg, text, colour, key }

    bg.on('pointerdown', () => {
      if (btnState.selected) {
        // Deselect
        btnState.selected = false
        this.selectedElements = this.selectedElements.filter(e => e !== key)
        bg.setFillStyle(Phaser.Display.Color.HexStringToColor(colour).color, 0.15)
        bg.setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(colour).color, 0.4)
      } else if (this.selectedElements.length < 2) {
        // Select
        btnState.selected = true
        this.selectedElements.push(key)
        bg.setFillStyle(Phaser.Display.Color.HexStringToColor(colour).color, 0.5)
        bg.setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(colour).color, 1)
      }
      this.onElementSelectionChanged()
    })

    bg.on('pointerover', () => {
      if (!btnState.selected) {
        bg.setFillStyle(Phaser.Display.Color.HexStringToColor(colour).color, 0.3)
      }
    })

    bg.on('pointerout', () => {
      if (!btnState.selected) {
        bg.setFillStyle(Phaser.Display.Color.HexStringToColor(colour).color, 0.15)
      }
    })

    return btnState
  }

  onElementSelectionChanged() {
    const ready = this.selectedElements.length === 2
    this.ratioLabel.setVisible(ready)
    this.ratioSlider.container.setVisible(ready)

    if (ready) {
      const r2 = 10 - this.elementRatio
      this.ratioLabel.setText(`${this.selectedElements[0]}: ${this.elementRatio}  /  ${this.selectedElements[1]}: ${r2}`)
    }

    this.updateCreateButton()
  }

  updateCreateButton() {
    const ready = this.selectedElements.length === 2
    this.createButton.setColor(ready ? '#daa520' : '#333333')

    // Remove old listener
    this.createButton.removeInteractive()

    if (ready) {
      this.createButton.setInteractive({ useHandCursor: true })
      this.createButton.off('pointerdown')
      this.createButton.on('pointerdown', () => this.launchWorld())
      this.createButton.on('pointerover', () => this.createButton.setColor('#ffcc44'))
      this.createButton.on('pointerout', () => this.createButton.setColor('#daa520'))
    }
  }

  createSlider(x, y, width, onChange) {
    const container = this.add.container(x - width / 2, y)

    // Track
    const track = this.add.rectangle(width / 2, 0, width, 4, 0x333333)
    container.add(track)

    // Thumb
    const thumb = this.add.circle(width / 2, 0, 8, 0xc07a28)
    thumb.setInteractive({ useHandCursor: true, draggable: true })
    container.add(thumb)

    // Drag handling
    thumb.on('drag', (pointer, dragX) => {
      const clamped = Phaser.Math.Clamp(dragX, 0, width)
      thumb.x = clamped
      const value = clamped / width
      if (onChange) onChange(value)
    })

    // Click on track to jump
    track.setInteractive({ useHandCursor: true })
    track.on('pointerdown', (pointer) => {
      const localX = pointer.x - container.x
      const clamped = Phaser.Math.Clamp(localX, 0, width)
      thumb.x = clamped
      const value = clamped / width
      if (onChange) onChange(value)
    })

    return { container, thumb, width }
  }

  createTerrainSlider(x, y, leftLabel, rightLabel, key) {
    this.add.text(x - 130, y, leftLabel, {
      fontFamily: 'Georgia, serif',
      fontSize: '11px',
      color: '#666666',
    }).setOrigin(1, 0.5)

    this.add.text(x + 130, y, rightLabel, {
      fontFamily: 'Georgia, serif',
      fontSize: '11px',
      color: '#666666',
    }).setOrigin(0, 0.5)

    this.createSlider(x, y, 200, (value) => {
      this.sliders[key] = value
    })
  }

  launchWorld() {
    const params = {
      element1: this.selectedElements[0],
      element2: this.selectedElements[1],
      elementRatio: this.elementRatio,
      skyCave: this.sliders.skyCave,
      barrenFertile: this.sliders.barrenFertile,
      sparseDense: this.sliders.sparseDense,
      seed: this.worldSeed,
    }

    this.scene.start('World', { params })
  }
}
