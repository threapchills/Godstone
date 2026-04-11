import { TILE_SIZE } from '../core/Constants.js'
import { findGroundTileY } from '../utils/Grounding.js'

// Storybook illustration warrior/villager sprites. Each stage maps
// to a sprite key; lower stages use villager variants, higher stages
// use the warrior base. All sprites are tinted with the village's
// element colour to maintain visual consistency.

const STAGE_NAMES = {
  1: 'villager', 2: 'clubber', 3: 'spearman', 4: 'archer', 5: 'swordsman', 6: 'rider', 7: 'arcanist',
}

// Storybook sprite key and rendered height per warrior stage.
// Low stages use the civilian villager sprites (1-4, picked by hash);
// mid stages use warrior_base; high stages use NPC sprites for variety.
const STAGE_SPRITES = {
  1: { keys: ['sb_villager_1', 'sb_villager_2', 'sb_villager_3', 'sb_villager_4'], height: 14 },
  2: { keys: ['sb_villager_1', 'sb_villager_2', 'sb_villager_3', 'sb_villager_4'], height: 14 },
  3: { keys: ['sb_warrior_base'], height: 16 },
  4: { keys: ['sb_warrior_base'], height: 16 },
  5: { keys: ['sb_warrior_base'], height: 16 },
  6: { keys: ['sb_warrior_base'], height: 18 },
  7: { keys: ['sb_warrior_base', 'sb_hooded_mystic'], height: 18 },
}

// Returns the storybook sprite key for a warrior at a given stage.
// Uses a hash of x position to pick among variants so each warrior
// in a village looks different.
export function ensureWarriorTexture(scene, stage, clothingColour, hashSeed) {
  const spec = STAGE_SPRITES[stage] || STAGE_SPRITES[1]
  const idx = Math.abs(hashSeed || Math.floor(Math.random() * 99999)) % spec.keys.length
  const key = spec.keys[idx]
  if (scene.textures.exists(key)) return key
  // Fallback: try any available villager sprite
  for (const k of spec.keys) {
    if (scene.textures.exists(k)) return k
  }
  // Last resort: return the first villager
  return 'sb_villager_1'
}

// Lightweight wandering AI using storybook illustration sprites.
export class WanderingWarrior {
  constructor(scene, x, y, stage, clothingColour, anchorX, spreadPx) {
    this.scene = scene
    this.stage = stage
    this.anchorX = anchorX
    this.spreadPx = spreadPx
    this.role = STAGE_NAMES[stage] || 'villager'

    const hashSeed = Math.floor(x * 73856 + y * 19349)
    const key = ensureWarriorTexture(scene, stage, clothingColour, hashSeed)
    this.sprite = scene.add.sprite(x, y, key)
    this.sprite.setOrigin(0.5, 1)
    this.sprite.setDepth(6)

    // Scale storybook sprite to appropriate world height
    const spec = STAGE_SPRITES[stage] || STAGE_SPRITES[1]
    const srcH = this.sprite.height || 100
    const targetH = spec.height || 14
    this.sprite.setScale(targetH / srcH)

    // Tint with the village's element colour
    if (clothingColour) this.sprite.setTint(clothingColour)

    const baseSpeed = stage >= 6 ? 14 : 6
    this.direction = Math.random() > 0.5 ? 1 : -1
    this.speed = baseSpeed + Math.random() * 8
    this.pauseTimer = 0
    this.isPaused = false
  }

  update(delta) {
    if (!this.isPaused) {
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
    } else {
      this.pauseTimer -= delta
      if (this.pauseTimer <= 0) {
        this.isPaused = false
        if (Math.random() > 0.5) this.direction *= -1
      }
    }

    // Snap to local ground each frame so warriors hug the terrain when
    // walking and fall to a new floor when the god terraforms beneath
    // them. Bounded so a warrior next to a chasm doesn't fall through;
    // fallback is the warrior's existing y so they hold position.
    const grid = this.scene.worldGrid?.grid
    if (grid) {
      const tileX = Math.floor(this.sprite.x / TILE_SIZE)
      const startTileY = Math.max(0, Math.floor(this.sprite.y / TILE_SIZE) - 3)
      const fallbackTileY = Math.floor(this.sprite.y / TILE_SIZE)
      const groundTileY = findGroundTileY(grid, tileX, startTileY, fallbackTileY)
      this.sprite.y = groundTileY * TILE_SIZE
    }
  }

  destroy() {
    this.sprite.destroy()
  }
}
