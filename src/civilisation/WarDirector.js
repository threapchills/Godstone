import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT } from '../core/Constants.js'
import CombatUnit from './CombatUnit.js'

// WarDirector: the orchestrator for living battles on the home world.
// Pattern lifted from Sky Baby's War Director (SOAR/js/main.js
// _updateWarDirector): a state machine that cycles through BUILD,
// GATHER, ATTACK, and cooldowns, punctuating peaceful stretches with
// eruptions of proper war. In Godstone those eruptions have two flavours:
//
//   1. Organic raid waves. Periodically a band of enemy combat units
//      spawns at a random edge of the world and marches on the nearest
//      home village. Raid strength scales with how developed the home
//      civilisation is so battles stay proportional.
//
//   2. Home patrol dispatches. Home villages at stage 3+ send out their
//      own combat-capable warriors who roam and engage any enemies they
//      find. This is what makes the world "feel like it's at war" during
//      active warState, matching Mike's "epic war around the player,
//      whether they get involved or not" brief.
//
// The director owns the combat-unit list. Projectiles (arrows and
// spells) are a separate list on the scene so non-director damage
// sources can add to it.

const WAR_CYCLE = {
  PEACE:    { nextIn: 40000, next: 'BUILDUP' },
  BUILDUP:  { nextIn: 12000, next: 'RAID' },
  RAID:     { nextIn: 30000, next: 'PEACE' },
}

// Cap total concurrent combat units so a runaway battle never tanks
// frame rate. Sky Baby proved 500-ish units is viable; we cap at 300
// here to leave headroom for villagers, critters, and particles.
const COMBAT_UNIT_CAP = 300

export default class WarDirector {
  constructor(scene) {
    this.scene = scene
    this.state = 'PEACE'
    this.stateTimer = WAR_CYCLE.PEACE.nextIn
    this.units = []      // combat-capable CombatUnits (home and enemy)
    this.projectiles = [] // arrows, spells, etc.
    this._nextPatrolCheck = 0
    this._msgShown = false
    // Automatic raid waves are disabled until the player triggers
    // their first inbound invasion via the portal. Before that the
    // world is peaceful exploration only.
    this._raidCycleEnabled = false
  }

  // Manual trigger: called from portal mechanics (Phase 7) to start a
  // specific invasion with a specific size. Bypasses the natural cycle.
  launchInvasion(size = 12, sourceVillage = null) {
    this._spawnRaidWave(size, sourceVillage)
    this.state = 'RAID'
    this.stateTimer = WAR_CYCLE.RAID.nextIn
  }

  // Enable the automatic raid cycle. Called when the player first
  // triggers an inbound invasion; after that, periodic raids continue.
  enableRaidCycle() {
    this._raidCycleEnabled = true
  }

  update(delta) {
    if (!this.scene.worldReady) return

    // Automatic raid cycle only runs after the player has triggered
    // their first portal invasion. Until then the world is peaceful.
    if (this._raidCycleEnabled) {
      this.stateTimer -= delta
      if (this.stateTimer <= 0) {
        const transition = WAR_CYCLE[this.state]
        if (transition) {
          this.state = transition.next
          this.stateTimer = WAR_CYCLE[this.state].nextIn
          this._onEnterState()
        }
      }

      this._nextPatrolCheck -= delta
      if (this._nextPatrolCheck <= 0 && this.state === 'RAID') {
        this._nextPatrolCheck = 6000
        this._dispatchHomePatrols()
      }
    }

    // Update combat units
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i]
      if (u.alive) {
        u.update(delta, this.units, this.projectiles, this.scene.worldGrid)
      }
    }

    // Cull dead and compact the array so the next tick sees a clean list
    this.units = this.units.filter(u => u.alive || (u.sprite && u.sprite.alpha > 0))

    // Arrow updates + hit resolution
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]
      p.update(delta)
      if (p.dead) { this.projectiles.splice(i, 1); continue }

      // Test hits against units of the opposite team
      for (let j = 0; j < this.units.length; j++) {
        const u = this.units[j]
        if (!u.alive || u.team === p.team) continue
        if (p.hits(u)) {
          u.takeDamage(p.damage, p)
          p._retire()
          this.projectiles.splice(i, 1)
          break
        }
      }

      // Also test hits against the god and the rival god
      if (p.dead) continue
      const enemyGod = this.scene.enemyGod
      if (p.team === 'home' && enemyGod?.alive && enemyGod.sprite) {
        const dx = enemyGod.sprite.x - p.sprite.x
        const dy = (enemyGod.sprite.y - 12) - p.sprite.y
        if (dx * dx + dy * dy < 220) {
          this.scene.damageEnemyGod(p.damage)
          p._retire()
          this.projectiles.splice(i, 1)
          continue
        }
      }
      if (p.team === 'enemy' && this.scene.god?.sprite) {
        const godBody = this.scene.god.sprite
        const dx = godBody.x - p.sprite.x
        const dy = (godBody.y - 12) - p.sprite.y
        if (dx * dx + dy * dy < 220) {
          this.scene.god.takeDamage(p.damage)
          p._retire()
          this.projectiles.splice(i, 1)
          continue
        }
      }
    }
  }

  _onEnterState() {
    if (this.state === 'BUILDUP') {
      if (this.scene.showMessage) this.scene.showMessage('War drums sound in the distance', 2000)
      if (this.scene.addJuice) this.scene.addJuice('light')
    } else if (this.state === 'RAID') {
      if (this.scene.showMessage) this.scene.showMessage('Raiders descend on the world', 2400)
      if (this.scene.addJuice) this.scene.addJuice('heavy')
      this._spawnRaidWave(this._scaledRaidSize())
    } else if (this.state === 'PEACE') {
      if (this.scene.showMessage) this.scene.showMessage('The raiders are routed', 1800)
    }
  }

  _scaledRaidSize() {
    // Scale with the highest home village stage so raids track the
    // player's progression. Early game gets moderate war bands; late
    // game gets proper incursions with hundreds of warriors.
    const vs = this.scene.villages || []
    let topStage = 0
    for (const v of vs) if (v.stage > topStage) topStage = v.stage
    return 30 + topStage * 12
  }

  _spawnRaidWave(size, sourceVillage = null) {
    if (this.units.length >= COMBAT_UNIT_CAP) return
    // Spawn from a random edge of the world so the raiders "arrive"
    // rather than teleport in. In Phase 7 this will be replaced for
    // portal-driven invasions which enter at the portal henge.
    const worldPx = WORLD_WIDTH * TILE_SIZE
    const edgeX = Math.random() < 0.5 ? 60 * TILE_SIZE : worldPx - 60 * TILE_SIZE
    const surfaceY = this.scene.worldGrid?.surfaceHeights
      ? this.scene.worldGrid.surfaceHeights[Math.floor(edgeX / TILE_SIZE)]
      : WORLD_HEIGHT * 0.2

    // Raiders scale their stage to the home tier so they're a credible
    // threat. Stage is capped at 7 for natural waves; Phase 7 raid
    // worlds will override with higher stages.
    const vs = this.scene.villages || []
    let targetVillage = null
    let bestDist = Infinity
    for (const v of vs) {
      const dx = v.worldX - edgeX
      const dist = Math.abs(dx)
      if (dist < bestDist) { bestDist = dist; targetVillage = v }
    }
    const raidStage = Math.max(2, Math.min(7, (targetVillage?.stage || 3)))
    const enemyClothingColour = 0xff5533

    for (let i = 0; i < size; i++) {
      if (this.units.length >= COMBAT_UNIT_CAP) break
      const ox = edgeX + (Math.random() - 0.5) * 80
      const oy = surfaceY * TILE_SIZE - 20
      const unit = new CombatUnit(this.scene, ox, oy, raidStage, 'enemy', targetVillage, enemyClothingColour)
      // Raiders start in raider role so they march on the target
      unit.role = 'raider'
      unit._patrolTargetX = targetVillage?.worldX || ox
      unit._patrolTargetY = targetVillage?.worldY || oy
      this.units.push(unit)
    }

    // Physics colliders so raiders walk on the tilemap
    if (this.scene.worldLayer) {
      const layer = this.scene.worldLayer
      for (const u of this.units) {
        if (!u._hasCollider) {
          u._hasCollider = true
          this.scene.physics.add.collider(u.sprite, layer)
        }
      }
    }
  }

  _dispatchHomePatrols() {
    // Each home village dispatches up to one combat-capable warrior
    // per tick while below a cap. These are the defenders / pursuers.
    const vs = this.scene.villages || []
    let homeCombatCount = 0
    for (const u of this.units) if (u.team === 'home') homeCombatCount++
    const cap = Math.min(80, this.units.length + 12)
    if (homeCombatCount >= cap) return

    for (const v of vs) {
      if ((v.team || 'home') !== 'home') continue
      if (v.stage < 3) continue
      if (v.population < 12) continue
      if (this.units.length >= COMBAT_UNIT_CAP) break

      const clothing = v.clothingColour || 0x7ad0c0
      const ox = v.worldX + (Math.random() - 0.5) * TILE_SIZE * 6
      const oy = v.worldY - 30
      const unit = new CombatUnit(this.scene, ox, oy, v.stage, 'home', v, clothing)
      this.units.push(unit)
      if (this.scene.worldLayer && !unit._hasCollider) {
        unit._hasCollider = true
        this.scene.physics.add.collider(unit.sprite, this.scene.worldLayer)
      }
    }
  }

  shutdown() {
    for (const u of this.units) u.destroy?.()
    for (const p of this.projectiles) p._retire?.()
    this.units.length = 0
    this.projectiles.length = 0
  }
}
