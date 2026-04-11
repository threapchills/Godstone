import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from './core/Constants.js'
import BootScene from './scenes/BootScene.js'
import CreationScene from './scenes/CreationScene.js'
import WorldScene from './scenes/WorldScene.js'

const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0a0b12',
  parent: document.body,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 }, // gravity handled per-body
      debug: false,
    },
  },
  scene: [BootScene, CreationScene, WorldScene],
  pixelArt: true,
  roundPixels: true,
}

// Expose for dev/debug access
window.__godstone = new Phaser.Game(config)
