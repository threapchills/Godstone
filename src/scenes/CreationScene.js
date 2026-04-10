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
    this.load.image('dist_mountains', 'assets/storybook_overhaul/distant_mountains.png')
    this.load.image('fluffy_clouds', 'assets/storybook_overhaul/fluffy_clouds.png')
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
    this.cameras.main.setBackgroundColor('#eef2f5')

    // Animated watercolor background
    const bgMountains = this.add.image(cx, GAME_HEIGHT - 60, 'dist_mountains').setOrigin(0.5, 1).setScale(1.3).setAlpha(0.6)
    
    // Drifting clouds for atmosphere
    this.cloudLayer1 = this.add.image(cx, GAME_HEIGHT / 3, 'fluffy_clouds').setOrigin(0.5).setScale(1.5).setAlpha(0.7)
    this.tweens.add({
      targets: this.cloudLayer1,
      x: cx - 120,
      y: (GAME_HEIGHT / 3) + 20,
      duration: 25000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    })

    // UI Translucent Overlay
    this.add.graphics()
      .fillStyle(0x1a1c23, 0.75)
      .fillRoundedRect(cx - 260, 20, 520, GAME_HEIGHT - 60, 16)
      .lineStyle(2, 0xd4c7b0, 0.2)
      .strokeRoundedRect(cx - 260, 20, 520, GAME_HEIGHT - 60, 16)

    // State
    this.selectedElements = []
    this.elementRatio = 5
    this.sliders = { skyCave: 0.5, barrenFertile: 0.5, sparseDense: 0.5 }
    this.worldSeed = Math.floor(Math.random() * 999999)

    // Title
    const titleText = this.add.text(cx, 48, 'GODSTONE', {
      fontFamily: 'Georgia, serif',
      fontSize: '54px',
      color: '#e4b660',
      stroke: '#5a3a18',
      strokeThickness: 5,
    }).setOrigin(0.5)
    titleText.setShadow(2, 4, '#111111', 6, true, true)

    this.add.text(cx, 88, 'Shape your world', {
      fontFamily: 'Georgia, serif',
      fontSize: '18px',
      color: '#8abfa0',
      fontStyle: 'italic',
    }).setOrigin(0.5).setShadow(1, 2, '#000000', 3, true, true)

    // Element selection
    this.add.text(cx, 120, 'Choose two elements', {
      fontFamily: 'Georgia, serif',
      fontSize: '14px',
      color: '#aaaaaa',
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
    this.pairNameText = this.add.text(cx, 190, '', {
      fontFamily: 'Georgia, serif',
      fontSize: '16px',
      color: '#e4b660',
    }).setOrigin(0.5).setVisible(false).setShadow(1, 2, '#000000', 3, true, true)

    this.pairDescText = this.add.text(cx, 208, '', {
      fontFamily: 'Georgia, serif',
      fontSize: '12px',
      color: '#aaaaaa',
      fontStyle: 'italic',
    }).setOrigin(0.5).setVisible(false)

    // Ratio slider
    this.ratioLabel = this.add.text(cx, 235, '', {
      fontFamily: 'Georgia, serif',
      fontSize: '13px',
      color: '#aaaaaa',
    }).setOrigin(0.5).setVisible(false)

    this.ratioSlider = this.createSlider(cx, 255, 200, (value) => {
      this.elementRatio = Math.round(value * 10)
      this.updateRatioLabel()
      this.updatePreview()
    })
    this.ratioSlider.container.setVisible(false)

    // Colour preview strip (shows palette sample)
    this.previewGraphics = this.add.graphics().setDepth(5)
    this.previewY = 275

    // Terrain sliders
    this.add.text(cx, 305, 'Terrain', {
      fontFamily: 'Georgia, serif',
      fontSize: '14px',
      color: '#aaaaaa',
    }).setOrigin(0.5)

    this.createTerrainSlider(cx, 335, 'Sky', 'Cave', 'skyCave')
    this.createTerrainSlider(cx, 365, 'Barren', 'Fertile', 'barrenFertile')
    this.createTerrainSlider(cx, 395, 'Sparse', 'Dense', 'sparseDense')

    // Seed display
    this.seedText = this.add.text(cx - 65, 430, `Seed: ${this.worldSeed}`, {
      fontFamily: 'Georgia, serif',
      fontSize: '13px',
      color: '#888888',
    }).setOrigin(0, 0.5)

    // Randomise seed button
    const rerollBtn = this.add.text(cx + 65, 430, '[reroll]', {
      fontFamily: 'Georgia, serif',
      fontSize: '13px',
      color: '#bbbbbb',
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true })

    rerollBtn.on('pointerdown', () => {
      this.worldSeed = Math.floor(Math.random() * 999999)
      this.seedText.setText(`Seed: ${this.worldSeed}`)
    })
    rerollBtn.on('pointerover', () => rerollBtn.setColor('#ffffff'))
    rerollBtn.on('pointerout', () => rerollBtn.setColor('#bbbbbb'))

    // Create button setup
    this.createBtnContainer = this.add.container(cx, 485)
    
    this.createBtnBg = this.add.graphics()
    this.createBtnContainer.add(this.createBtnBg)
    
    this.createButton = this.add.text(0, 0, 'Create World', {
      fontFamily: 'Georgia, serif',
      fontSize: '22px',
      color: '#888888',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setShadow(1, 2, '#000000', 3, true, true)
    
    this.createBtnContainer.add(this.createButton)
    
    const cwHit = new Phaser.Geom.Rectangle(-100, -25, 200, 50)
    this.createBtnContainer.setInteractive(cwHit, Phaser.Geom.Rectangle.Contains)
    this.createBtnContainer.input.cursor = 'default'

    this.updateCreateButton()

    // Instructions
    this.add.text(cx, 550, 'WASD or arrows to move  |  Up to jump  |  Space to fly  |  Down to dig', {
      fontFamily: 'Georgia, serif',
      fontSize: '12px',
      color: '#777777',
    }).setOrigin(0.5)

    this.add.text(cx, 570, 'Explore caves to find ancient tablets. Deliver them to villages.', {
      fontFamily: 'Georgia, serif',
      fontSize: '12px',
      color: '#777777',
    }).setOrigin(0.5)
  }

  createElementButton(x, y, label, colour, key) {
    const colourInt = Phaser.Display.Color.HexStringToColor(colour).color
    const container = this.add.container(x, y + 10)
    
    const bgGfx = this.add.graphics()
    container.add(bgGfx)
    
    // Draw rounded shape
    const drawBg = (boxAlpha, strokeAlpha) => {
        bgGfx.clear()
        bgGfx.fillStyle(colourInt, boxAlpha)
        bgGfx.fillRoundedRect(-45, -20, 90, 40, 12)
        bgGfx.lineStyle(2, colourInt, strokeAlpha)
        bgGfx.strokeRoundedRect(-45, -20, 90, 40, 12)
    }
    drawBg(0.15, 0.4)

    const hitArea = new Phaser.Geom.Rectangle(-45, -20, 90, 40)
    container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains)
    container.input.cursor = 'pointer'

    const text = this.add.text(0, 0, label, {
      fontFamily: 'Georgia, serif',
      fontSize: '15px',
      color: colour,
    }).setOrigin(0.5)
    container.add(text)

    const btnState = { selected: false, bg: container, text, colour, colourInt, key }

    container.on('pointerdown', () => {
      if (btnState.selected) {
        btnState.selected = false
        this.selectedElements = this.selectedElements.filter(e => e !== key)
        drawBg(0.15, 0.4)
        this.tweens.add({ targets: container, scale: 1, duration: 100 })
      } else if (this.selectedElements.length < 2) {
        btnState.selected = true
        this.selectedElements.push(key)
        drawBg(0.4, 0.9)
        this.tweens.add({ targets: container, scale: 1.1, duration: 100 })
      }
      this.onElementSelectionChanged()
    })

    container.on('pointerover', () => {
      if (!btnState.selected) drawBg(0.25, 0.6)
      this.tweens.add({ targets: container, scale: btnState.selected ? 1.15 : 1.05, duration: 100 })
    })
    
    container.on('pointerout', () => {
      if (!btnState.selected) drawBg(0.15, 0.4)
      this.tweens.add({ targets: container, scale: btnState.selected ? 1.1 : 1, duration: 100 })
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
    
    this.createBtnBg.clear()
    if (ready) {
      this.createBtnBg.fillStyle(0xdba12a, 0.8)
      this.createBtnBg.fillRoundedRect(-100, -25, 200, 50, 25)
      this.createBtnBg.lineStyle(2, 0xffd280, 1)
      this.createBtnBg.strokeRoundedRect(-100, -25, 200, 50, 25)
      this.createButton.setColor('#ffffff')
    } else {
      this.createBtnBg.fillStyle(0x333333, 0.4)
      this.createBtnBg.fillRoundedRect(-100, -25, 200, 50, 25)
      this.createBtnBg.lineStyle(2, 0x555555, 1)
      this.createBtnBg.strokeRoundedRect(-100, -25, 200, 50, 25)
      this.createButton.setColor('#888888')
    }

    this.createBtnContainer.removeInteractive()
    if (this.readyPulseTween) this.readyPulseTween.stop()

    if (ready) {
      const cwHit = new Phaser.Geom.Rectangle(-100, -25, 200, 50)
      this.createBtnContainer.setInteractive(cwHit, Phaser.Geom.Rectangle.Contains)
      this.createBtnContainer.input.cursor = 'pointer'
      this.createBtnContainer.off('pointerdown')
      this.createBtnContainer.on('pointerdown', () => this.launchWorld())
      
      this.createBtnContainer.on('pointerover', () => {
        this.tweens.add({ targets: this.createBtnContainer, scale: 1.1, duration: 150 })
      })
      this.createBtnContainer.on('pointerout', () => {
        this.tweens.add({ targets: this.createBtnContainer, scale: 1, duration: 150 })
      })
      
      this.readyPulseTween = this.tweens.add({
        targets: this.createBtnContainer,
        scale: 1.03,
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      })
    } else {
        this.createBtnContainer.setScale(1)
        this.createBtnContainer.off('pointerover')
        this.createBtnContainer.off('pointerout')
    }
  }

  createSlider(x, y, width, onChange) {
    const container = this.add.container(x - width / 2, y)
    
    // Sleek rounded track
    const trackGfx = this.add.graphics()
    trackGfx.fillStyle(0x0f1115, 0.8)
    trackGfx.fillRoundedRect(0, -3, width, 6, 3)
    trackGfx.lineStyle(1, 0x4a5a5a, 0.5)
    trackGfx.strokeRoundedRect(0, -3, width, 6, 3)
    container.add(trackGfx)

    // Interactive hit zone for the track
    const track = this.add.rectangle(width / 2, 0, width, 20, 0x000000, 0)
    container.add(track)

    // Shadow blob
    const shadow = this.add.circle(0, 3, 10, 0x000000, 0.4) // initial pos will update
    container.add(shadow)

    // Thumb node
    const thumb = this.add.circle(0, 0, 10, 0xe4b660)
    thumb.setStrokeStyle(2, 0xffe280, 0.8)
    thumb.setInteractive({ useHandCursor: true, draggable: true })
    container.add(thumb)

    const initialX = width / 2
    thumb.x = initialX
    shadow.x = initialX

    thumb.on('drag', (pointer, dragX) => {
      const clamped = Phaser.Math.Clamp(dragX, 0, width)
      thumb.x = clamped
      shadow.x = clamped
      if (onChange) onChange(clamped / width)
    })
    
    thumb.on('pointerover', () => this.tweens.add({ targets: thumb, scale: 1.2, duration: 100 }))
    thumb.on('pointerout', () => this.tweens.add({ targets: thumb, scale: 1, duration: 100 }))

    track.setInteractive({ useHandCursor: true })
    track.on('pointerdown', (pointer) => {
      const localX = pointer.x - container.x
      const clamped = Phaser.Math.Clamp(localX, 0, width)
      thumb.x = clamped
      shadow.x = clamped
      if (onChange) onChange(clamped / width)
    })

    return { container, thumb, width }
  }

  createTerrainSlider(x, y, leftLabel, rightLabel, key) {
    this.add.text(x - 130, y, leftLabel, {
      fontFamily: 'Georgia, serif',
      fontSize: '12px',
      color: '#aaaaaa',
    }).setOrigin(1, 0.5)

    this.add.text(x + 130, y, rightLabel, {
      fontFamily: 'Georgia, serif',
      fontSize: '12px',
      color: '#aaaaaa',
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
