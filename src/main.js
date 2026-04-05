import Phaser from 'phaser'

// Boot scene: proof that the Phaser pipeline is operational.
// No game logic lives here; this gets replaced in Phase 1.
class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' })
  }

  create() {
    const { width, height } = this.scale

    this.add.text(width / 2, height / 2 - 24, 'GODSTONE', {
      fontFamily: 'Georgia, serif',
      fontSize: '64px',
      color: '#c07a28',
      stroke: '#1a0a04',
      strokeThickness: 6,
    }).setOrigin(0.5)

    this.add.text(width / 2, height / 2 + 44, 'pipeline operational', {
      fontFamily: 'Georgia, serif',
      fontSize: '16px',
      color: '#4a7a6a',
      fontStyle: 'italic',
    }).setOrigin(0.5)
  }
}

const config = {
  type: Phaser.AUTO,
  width: 960,
  height: 640,
  backgroundColor: '#0d0d1a',
  parent: document.body,
  scene: BootScene,
}

new Phaser.Game(config)
