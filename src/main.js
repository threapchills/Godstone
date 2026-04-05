import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from './core/Constants.js'
import CreationScene from './scenes/CreationScene.js'
import WorldScene from './scenes/WorldScene.js'

const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0d0d1a',
  parent: document.body,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 }, // gravity handled per-body
      debug: false,
    },
  },
  scene: [CreationScene, WorldScene],
  pixelArt: true,
  roundPixels: true,
}

// Expose for dev/debug access
window.__godstone = new Phaser.Game(config)
