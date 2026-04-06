import { TILE_SIZE, GRAVITY, WORLD_WIDTH, WORLD_HEIGHT } from '../core/Constants.js'
import { SOLID_TILES, LIQUID_TILES } from '../world/TileTypes.js'
import { ensureWarriorTexture } from './Warrior.js'
import { COMBAT, bodyguardHp, bodyguardMeleeDamage } from '../combat/Combat.js'

// An escort unit dispatched by a village. Walks on terrain, jumps over
// short obstacles, and lifts off briefly to follow the god when he flies
// or when blocked. Steering is a simple seek-toward-formation-slot;
// pathfinding is brief flight rather than tile-graph search.

const FOLLOW_SPEED = 140
const JUMP_VELOCITY = -260
const FLY_VELOCITY = -180
const FLY_HORIZ_SPEED = 130
const STUCK_THRESHOLD = 350 // ms with no progress before flying
const MAX_DESPAWN_DISTANCE = TILE_SIZE * 80

export default class Bodyguard {
  constructor(scene, x, y, stage, clothingColour, godRef, slotIndex, originVillage) {
    this.scene = scene
    this.stage = stage
    this.god = godRef
    this.slotIndex = slotIndex
    this.originVillage = originVillage
    this._lastProgressTime = 0
    this._lastDistance = Infinity
    this._isFlying = false

    // Combat
    this.maxHp = bodyguardHp(stage)
    this.hp = this.maxHp
    this.meleeDamage = bodyguardMeleeDamage(stage)
    this._lastMeleeTime = 0
    this.alive = true

    const key = ensureWarriorTexture(scene, stage, clothingColour)
    this.sprite = scene.add.sprite(x, y, key)
    this.sprite.setOrigin(0.5, 1)
    this.sprite.setDepth(7) // above villagers, below god

    scene.physics.add.existing(this.sprite)
    this.sprite.body.setGravityY(GRAVITY)
    this.sprite.body.setCollideWorldBounds(false)
    this.sprite.body.setSize(this.sprite.width - 1, this.sprite.height - 1)
  }

  // Formation slot offsets relative to the god. Slot 0 = right shoulder,
  // 1 = left shoulder, 2 = trailing centre. The god is the only thing
  // worth defending.
  _slotOffset() {
    const slots = [
      { dx: TILE_SIZE * 2.5, dy: 0 },
      { dx: -TILE_SIZE * 2.5, dy: 0 },
      { dx: 0, dy: TILE_SIZE * 1.5 },
    ]
    return slots[this.slotIndex % slots.length]
  }

  update(delta, worldGrid) {
    if (!this.alive || !this.god?.sprite || !this.sprite.body) return

    // If a rival god is in melee range, prefer attacking it over slot keeping
    const enemy = this.scene.enemyGod
    let combatTarget = null
    if (enemy?.alive && enemy.sprite) {
      const edx = enemy.sprite.x - this.sprite.x
      const edy = enemy.sprite.y - this.sprite.y
      const ed = Math.sqrt(edx * edx + edy * edy)
      if (ed < TILE_SIZE * 12) combatTarget = enemy
    }

    const offset = this._slotOffset()
    const baseX = combatTarget ? combatTarget.sprite.x : this.god.sprite.x + offset.dx
    const baseY = combatTarget ? combatTarget.sprite.y - 6 : this.god.sprite.y + offset.dy
    const targetX = baseX
    const targetY = baseY
    const dx = targetX - this.sprite.x
    const dy = targetY - this.sprite.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    // Melee strike if in range and off cooldown
    if (combatTarget && dist < COMBAT.bodyguard.meleeRange) {
      const now = this.scene.time.now
      if (now - this._lastMeleeTime > COMBAT.bodyguard.meleeCooldown) {
        this._lastMeleeTime = now
        combatTarget.takeDamage(this.meleeDamage)
        // Tiny lunge feedback
        if (this.sprite) {
          this.scene.tweens.add({
            targets: this.sprite,
            scaleX: 1.15,
            scaleY: 1.15,
            yoyo: true,
            duration: 90,
          })
        }
      }
    }

    // If we're insanely far away (god teleported / wrapped), snap-warp
    // so the bodyguard doesn't trail forever.
    if (dist > MAX_DESPAWN_DISTANCE) {
      this.sprite.x = targetX
      this.sprite.y = targetY - 4
      this.sprite.body.setVelocity(0, 0)
      this._isFlying = false
      return
    }

    const body = this.sprite.body
    const onGround = body.blocked.down

    // Decide whether to fly: god flying high, or we're stuck and below the slot
    const godFlying = !this.god.sprite.body?.blocked?.down && this.god.sprite.body?.velocity?.y < -50
    const verticalGap = this.god.sprite.y - this.sprite.y // positive: god is above
    const wantToFly = godFlying || verticalGap > TILE_SIZE * 4 || this._isStuck(dist)

    if (wantToFly && !this._isFlying) {
      this._isFlying = true
      body.setGravityY(GRAVITY * 0.2)
    } else if (!wantToFly && this._isFlying && onGround) {
      this._isFlying = false
      body.setGravityY(GRAVITY)
    }

    // Horizontal seek
    const horizSpeed = this._isFlying ? FLY_HORIZ_SPEED : FOLLOW_SPEED
    if (Math.abs(dx) > 4) {
      body.setVelocityX(Math.sign(dx) * horizSpeed)
      this.sprite.setFlipX(dx < 0)
    } else {
      body.setVelocityX(0)
    }

    // Vertical seek
    if (this._isFlying) {
      // Hover toward target y
      if (dy < -8) body.setVelocityY(FLY_VELOCITY)
      else if (dy > 8) body.setVelocityY(40)
      else body.setVelocityY(0)
    } else if (onGround) {
      // Walk: jump if blocked horizontally, or if target is significantly above
      if (body.blocked.left || body.blocked.right) {
        body.setVelocityY(JUMP_VELOCITY)
      } else if (dy < -TILE_SIZE * 1.5) {
        body.setVelocityY(JUMP_VELOCITY)
      }
    }

    // Track progress for stuck-detection
    if (Math.abs(dist - this._lastDistance) > 1) {
      this._lastProgressTime = this.scene.time.now
      this._lastDistance = dist
    }

    // Wrap horizontally to mirror the god across the seam
    const worldPx = WORLD_WIDTH * TILE_SIZE
    if (this.sprite.x < -TILE_SIZE) this.sprite.x += worldPx
    else if (this.sprite.x > worldPx + TILE_SIZE) this.sprite.x -= worldPx
  }

  _isStuck(dist) {
    if (dist < TILE_SIZE * 2) return false
    return (this.scene.time.now - this._lastProgressTime) > STUCK_THRESHOLD
  }

  destroy() {
    if (this.sprite) {
      this.sprite.destroy()
      this.sprite = null
    }
  }
}
