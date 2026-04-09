import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT, ELEMENTS } from '../core/Constants.js'
import { buildPalette } from '../world/TileTypes.js'
import { SKY_VARIANTS } from '../world/AssetVariants.js'

// Element pair descriptions from the spec
const PAIR_NAMES = {
  'fire+water': { name: 'Steam / Volcanic Archipelago', desc: 'Boiling seas and volcanic islands' },
  'fire+earth': { name: 'Magma / Forge', desc: 'Molten depths beneath scorched stone' },
  'fire+air': { name: 'Inferno / Scorched Peaks', desc: 'Blazing heights and ember winds' },
  'water+earth': { name: 'Deep Sea / Subterranean Rivers', desc: 'Flooded caverns and dark shores' },
  'water+air': { name: 'Storm / Floating Reef', desc: 'Tempest skies and coral spires' },
  'earth+air': { name: 'Mountain / Plateau', desc: 'Soaring cliffs and windswept plains' },
}

function getPairKey(e1, e2) {
  const sorted = [e1, e2].sort()
  return sorted.join('+')
}

export default class CreationScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Creation' })
  }

  preload() {
    this.load.image('sb_tileset', 'assets/environment/island_tileset.png')
    this.load.image('sb_tree', 'assets/backgrounds/tree-variant1.png')
    this.load.image('sb_grass', 'assets/environment/grass.png')
    this.load.image('sb_sky1', 'assets/backgrounds/sky_layer_1.jpeg')
    this.load.image('sb_sky2', 'assets/backgrounds/sky_layer_2.png')
    this.load.image('sb_clouds', 'assets/backgrounds/clouds_fg.png')
    this.load.image('sb_teepee_blue', 'assets/environment/teepee_blue.png')
    this.load.image('sb_teepee_green', 'assets/environment/teepee_green.png')
    this.load.image('leaf', 'assets/environment/leaf.png')

    // Sky variant paintings: each world picks from these per seed
    for (const key of SKY_VARIANTS) {
      this.load.image(`skyvar_${key}`, `assets/backgrounds/sky-variants/${key}.png`)
    }
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
    this.add.text(cx, 36, 'GODSTONE', {
      fontFamily: 'Georgia, serif',
      fontSize: '48px',
      color: '#c07a28',
      stroke: '#1a0a04',
      strokeThickness: 4,
    }).setOrigin(0.5)

    this.add.text(cx, 74, 'Shape your world', {
      fontFamily: 'Georgia, serif',
      fontSize: '16px',
      color: '#4a7a6a',
      fontStyle: 'italic',
    }).setOrigin(0.5)

    // Element selection
    this.add.text(cx, 108, 'Choose two elements', {
      fontFamily: 'Georgia, serif',
      fontSize: '13px',
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
      const btn = this.createElementButton(el.x, 145, el.label, el.colour, el.key)
      this.elementButtons[el.key] = btn
    })

    // Pair name display (appears after two elements selected)
    this.pairNameText = this.add.text(cx, 177, '', {
      fontFamily: 'Georgia, serif',
      fontSize: '14px',
      color: '#c07a28',
    }).setOrigin(0.5).setVisible(false)

    this.pairDescText = this.add.text(cx, 194, '', {
      fontFamily: 'Georgia, serif',
      fontSize: '11px',
      color: '#666666',
      fontStyle: 'italic',
    }).setOrigin(0.5).setVisible(false)

    // Ratio slider
    this.ratioLabel = this.add.text(cx, 218, '', {
      fontFamily: 'Georgia, serif',
      fontSize: '12px',
      color: '#888888',
    }).setOrigin(0.5).setVisible(false)

    this.ratioSlider = this.createSlider(cx, 240, 200, (value) => {
      this.elementRatio = Math.round(value * 10)
      this.updateRatioLabel()
      this.updatePreview()
    })
    this.ratioSlider.container.setVisible(false)

    // Colour preview strip (shows palette sample)
    this.previewGraphics = this.add.graphics().setDepth(5)
    this.previewY = 260

    // Terrain sliders
    this.add.text(cx, 288, 'Terrain', {
      fontFamily: 'Georgia, serif',
      fontSize: '13px',
      color: '#888888',
    }).setOrigin(0.5)

    this.createTerrainSlider(cx, 318, 'Sky', 'Cave', 'skyCave')
    this.createTerrainSlider(cx, 348, 'Barren', 'Fertile', 'barrenFertile')
    this.createTerrainSlider(cx, 378, 'Sparse', 'Dense', 'sparseDense')

    // Seed display
    this.seedText = this.add.text(cx - 60, 410, `Seed: ${this.worldSeed}`, {
      fontFamily: 'Georgia, serif',
      fontSize: '12px',
      color: '#555555',
    }).setOrigin(0, 0.5)

    // Randomise seed button
    const rerollBtn = this.add.text(cx + 60, 410, '[reroll]', {
      fontFamily: 'Georgia, serif',
      fontSize: '12px',
      color: '#777777',
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true })

    rerollBtn.on('pointerdown', () => {
      this.worldSeed = Math.floor(Math.random() * 999999)
      this.seedText.setText(`Seed: ${this.worldSeed}`)
    })
    rerollBtn.on('pointerover', () => rerollBtn.setColor('#aaaaaa'))
    rerollBtn.on('pointerout', () => rerollBtn.setColor('#777777'))

    // Create button
    this.createButton = this.add.text(cx, 460, '[ Create world ]', {
      fontFamily: 'Georgia, serif',
      fontSize: '22px',
      color: '#333333',
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(0.5)

    this.updateCreateButton()

    // Instructions
    this.add.text(cx, 520, 'WASD or arrows to move  |  Up to jump  |  Space to fly  |  Down to dig', {
      fontFamily: 'Georgia, serif',
      fontSize: '11px',
      color: '#444444',
    }).setOrigin(0.5)

    this.add.text(cx, 540, 'Explore caves to find ancient tablets. Deliver them to villages.', {
      fontFamily: 'Georgia, serif',
      fontSize: '11px',
      color: '#444444',
    }).setOrigin(0.5)
  }

  createElementButton(x, y, label, colour, key) {
    const colourInt = Phaser.Display.Color.HexStringToColor(colour).color
    const bg = this.add.rectangle(x, y, 80, 34, colourInt, 0.12)
    bg.setStrokeStyle(2, colourInt, 0.3)
    bg.setInteractive({ useHandCursor: true })

    const text = this.add.text(x, y, label, {
      fontFamily: 'Georgia, serif',
      fontSize: '14px',
      color: colour,
    }).setOrigin(0.5)

    const btnState = { selected: false, bg, text, colour, colourInt, key }

    bg.on('pointerdown', () => {
      if (btnState.selected) {
        btnState.selected = false
        this.selectedElements = this.selectedElements.filter(e => e !== key)
        bg.setFillStyle(colourInt, 0.12)
        bg.setStrokeStyle(2, colourInt, 0.3)
      } else if (this.selectedElements.length < 2) {
        btnState.selected = true
        this.selectedElements.push(key)
        bg.setFillStyle(colourInt, 0.5)
        bg.setStrokeStyle(2, colourInt, 1)
      }
      this.onElementSelectionChanged()
    })

    bg.on('pointerover', () => {
      if (!btnState.selected) bg.setFillStyle(colourInt, 0.25)
    })
    bg.on('pointerout', () => {
      if (!btnState.selected) bg.setFillStyle(colourInt, 0.12)
    })

    return btnState
  }

  onElementSelectionChanged() {
    const ready = this.selectedElements.length === 2
    this.ratioLabel.setVisible(ready)
    this.ratioSlider.container.setVisible(ready)
    this.pairNameText.setVisible(ready)
    this.pairDescText.setVisible(ready)

    if (ready) {
      this.updateRatioLabel()
      const pairKey = getPairKey(this.selectedElements[0], this.selectedElements[1])
      const pair = PAIR_NAMES[pairKey] || { name: 'Unknown', desc: '' }
      this.pairNameText.setText(pair.name)
      this.pairDescText.setText(pair.desc)
      this.updatePreview()
    } else {
      this.previewGraphics.clear()
    }

    this.updateCreateButton()
  }

  updateRatioLabel() {
    const r2 = 10 - this.elementRatio
    const e1 = this.selectedElements[0] || '?'
    const e2 = this.selectedElements[1] || '?'
    this.ratioLabel.setText(`${e1}: ${this.elementRatio}  /  ${e2}: ${r2}`)
  }

  updatePreview() {
    if (this.selectedElements.length < 2) return
    const palette = buildPalette(this.selectedElements[0], this.selectedElements[1], this.elementRatio)

    this.previewGraphics.clear()
    const cx = GAME_WIDTH / 2
    const stripWidth = 240
    const stripHeight = 12
    const startX = cx - stripWidth / 2
    const y = this.previewY

    // Draw a gradient strip showing the palette colours
    const tileIds = [1, 2, 3, 5, 7, 9, 10, 12] // surface, soil, stone, water, sand, clay, volcanic, crystal
    const segmentWidth = stripWidth / tileIds.length

    for (let i = 0; i < tileIds.length; i++) {
      const colour = palette[tileIds[i]]
      if (colour == null) continue
      this.previewGraphics.fillStyle(colour, 1)
      this.previewGraphics.fillRect(startX + i * segmentWidth, y, segmentWidth, stripHeight)
    }

    // Border
    this.previewGraphics.lineStyle(1, 0x333333, 0.5)
    this.previewGraphics.strokeRect(startX, y, stripWidth, stripHeight)
  }

  updateCreateButton() {
    const ready = this.selectedElements.length === 2
    this.createButton.setColor(ready ? '#daa520' : '#333333')
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
    const track = this.add.rectangle(width / 2, 0, width, 4, 0x333333)
    container.add(track)

    const thumb = this.add.circle(width / 2, 0, 8, 0xc07a28)
    thumb.setInteractive({ useHandCursor: true, draggable: true })
    container.add(thumb)

    thumb.on('drag', (pointer, dragX) => {
      const clamped = Phaser.Math.Clamp(dragX, 0, width)
      thumb.x = clamped
      if (onChange) onChange(clamped / width)
    })

    track.setInteractive({ useHandCursor: true })
    track.on('pointerdown', (pointer) => {
      const localX = pointer.x - container.x
      const clamped = Phaser.Math.Clamp(localX, 0, width)
      thumb.x = clamped
      if (onChange) onChange(clamped / width)
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
    this.scene.start('World', {
      params: {
        element1: this.selectedElements[0],
        element2: this.selectedElements[1],
        elementRatio: this.elementRatio,
        skyCave: this.sliders.skyCave,
        barrenFertile: this.sliders.barrenFertile,
        sparseDense: this.sliders.sparseDense,
        seed: this.worldSeed,
      }
    })
  }
}
