import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT } from '../core/Constants.js'
import { COMBAT } from '../combat/Combat.js'
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

// Organic war rhythm. A fresh world opens with an extended PEACE
// phase (~90 s) so the player has space to explore before the first
// drums sound; after that the cycle alternates between raids and
// contemplative lulls. BUILDUP is the "tense interlude" that telegraphs
// an incoming wave so the player can scramble defences.
const WAR_CYCLE = {
  PEACE:    { nextIn: 55000, next: 'BUILDUP' },
  BUILDUP:  { nextIn: 14000, next: 'RAID' },
  RAID:     { nextIn: 40000, next: 'PEACE' },
}

// Grace period before the first war drum beats. Long enough that the
// player can sightsee a few villages and maybe find a tablet before
// raiders show up; short enough that the world doesn't feel lifeless.
const FIRST_RAID_GRACE_MS = 90000

// Cap total concurrent combat units so a runaway battle never tanks
// frame rate. Sky Baby proved 500-ish units is viable; we cap at 450
// here to leave headroom for villagers, critters, and particles while
// still allowing Viking-scale raids.
const COMBAT_UNIT_CAP = 450

// Number of distinct target villages a raid wave splits across. Raids
// used to funnel every unit toward the nearest home village, which
// produced visible clumping; splitting across N targets makes the
// band behave like Viking raiders hitting multiple hamlets at once.
const RAID_TARGET_SPLIT = 4

export default class WarDirector {
  constructor(scene) {
    this.scene = scene
    this.state = 'PEACE'
    // First state tick is the grace period, not the default PEACE
    // length, so even players who never open a portal eventually see
    // war descend on the world.
    this.stateTimer = FIRST_RAID_GRACE_MS
    this.units = []      // combat-capable CombatUnits (home and enemy)
    this.projectiles = [] // arrows, spells, etc.
    this._nextPatrolCheck = 0
    this._msgShown = false
    // Raids run on an organic cycle from the moment the world is born.
    // The first portal inbound used to be the gate; now the grace
    // period handles pacing and the world always rumbles to life.
    this._raidCycleEnabled = !(scene.params?.isRaid) // raid worlds run their own assault loop below
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
      // During an active enemy-god invasion the patrol rate doubles and
      // the dispatch point biases toward the rival god so defenders
      // converge on the threat instead of wandering generically.
      const invasionActive = !!this.scene.enemyGod?.alive
      const patrolInterval = invasionActive ? 2500 : 6000
      if (this._nextPatrolCheck <= 0 && (this.state === 'RAID' || invasionActive)) {
        this._nextPatrolCheck = patrolInterval
        this._dispatchHomePatrols(invasionActive ? this.scene.enemyGod : null)
      }
    }

    // On raid worlds, auto-dispatch enemy defenders and drain enemy
    // village populations when home raiders are nearby (the assault loop)
    if (this.scene.params?.isRaid) {
      this._nextRaidAssaultCheck = (this._nextRaidAssaultCheck || 0) - delta
      if (this._nextRaidAssaultCheck <= 0) {
        this._nextRaidAssaultCheck = 2000
        this._tickRaidAssaults()
        this._dispatchEnemyDefenders()
      }
    }

    // Reactive home defence: independently of the raid cycle, any home
    // village that sees enemies within a short radius spontaneously
    // trains up a defender or two from its population. This is Mike's
    // "villagers go off and train to be warriors when population dynamics
    // demand it" rule — a village under threat stops farming and fights.
    this._nextHomeDefenceCheck = (this._nextHomeDefenceCheck || 0) - delta
    if (this._nextHomeDefenceCheck <= 0) {
      this._nextHomeDefenceCheck = 1500
      this._trainReactiveDefenders()
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

      // Also test hits against the god and the rival god.
      // Unit arrows deal a fixed low amount to gods (5 HP each, so
      // it takes ~20 arrows to kill a god). This prevents mob-rushing
      // from being the optimal strategy while still rewarding archers.
      if (p.dead) continue
      const arrowGodDmg = COMBAT.god.arrowDamageToGod || 5
      const enemyGod = this.scene.enemyGod
      if (p.team === 'home' && enemyGod?.alive && enemyGod.sprite) {
        const dx = enemyGod.sprite.x - p.sprite.x
        const dy = (enemyGod.sprite.y - 12) - p.sprite.y
        if (dx * dx + dy * dy < 220) {
          this.scene.damageEnemyGod(arrowGodDmg)
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
          this.scene.god.takeDamage(arrowGodDmg)
          p._retire()
          this.projectiles.splice(i, 1)
          continue
        }
      }
    }
  }

  // Flavour text banks. Picking randomly per state transition so the
  // world feels less mechanical across multiple raid cycles. Sentence
  // case. No em dashes.
  static BUILDUP_LINES = [
    'War drums sound in the distance',
    'Smoke rises beyond the horizon',
    'Scouts report a war band approaching',
    'The wind carries the sound of marching feet',
    'Ravens circle the edge of the world',
    'Fires bloom on the far ridge',
  ]
  static RAID_LINES = [
    'Raiders descend on the world',
    'A war band crashes into your lands',
    'Steel flashes on the horizon',
    'The raiders have arrived',
    'Enemies at the gates',
  ]
  static PEACE_LINES = [
    'The raiders are routed',
    'Silence falls on the battlefield',
    'The war band retreats',
    'Your villages breathe again',
    'Blood soaks the earth; the fight is done',
  ]

  _onEnterState() {
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
    if (this.state === 'BUILDUP') {
      if (this.scene.showMessage) this.scene.showMessage(pick(WarDirector.BUILDUP_LINES), 2000)
      if (this.scene.addJuice) this.scene.addJuice('light')
      if (this.scene.ambience?.playBurn) this.scene.ambience.playBurn()
    } else if (this.state === 'RAID') {
      if (this.scene.showMessage) this.scene.showMessage(pick(WarDirector.RAID_LINES), 2400)
      if (this.scene.addJuice) this.scene.addJuice('heavy')
      if (this.scene.ambience?.playGong) this.scene.ambience.playGong()
      this._spawnRaidWave(this._scaledRaidSize())
    } else if (this.state === 'PEACE') {
      if (this.scene.showMessage) this.scene.showMessage(pick(WarDirector.PEACE_LINES), 1800)
    }
  }

  _scaledRaidSize() {
    // Scale with the highest home village stage so raids track the
    // player's progression. Early game gets respectable war bands;
    // late game fields proper Viking incursions that swarm multiple
    // villages at once. Previous scaling capped at ~114 (top stage 7);
    // boosted so stage 7+ yields ~180 and stage 15+ approaches 300.
    const vs = this.scene.villages || []
    let topStage = 0
    for (const v of vs) if (v.stage > topStage) topStage = v.stage
    return 50 + topStage * 20
  }

  _spawnRaidWave(size, sourceVillage = null) {
    if (this.units.length >= COMBAT_UNIT_CAP) return

    const worldPx = WORLD_WIDTH * TILE_SIZE
    const vs = this.scene.villages || []
    const homeVillages = vs.filter(v => (v.team || 'home') === 'home' && !v._destroyed)
    if (homeVillages.length === 0) return

    // Pick up to RAID_TARGET_SPLIT distinct home villages as targets.
    // Sort by stage descending so the richest targets get priority;
    // early-game raids still just hit the one village, late-game raids
    // hit several hamlets simultaneously like a proper Viking war band.
    const ranked = [...homeVillages].sort((a, b) => (b.stage - a.stage) || (b.population - a.population))
    const targets = ranked.slice(0, Math.min(RAID_TARGET_SPLIT, ranked.length))

    // Choose a base entry edge (raiders "arrive") but ALSO pepper a few
    // flank entry points across the map so targets on opposite sides of
    // the world don't get attacked from a single predictable direction.
    const baseEdgeX = Math.random() < 0.5 ? 60 * TILE_SIZE : worldPx - 60 * TILE_SIZE

    const enemyClothingColour = 0xff5533
    const perTarget = Math.ceil(size / targets.length)

    for (let t = 0; t < targets.length; t++) {
      const target = targets[t]
      // Flanking entry: each target gets its own entry column offset
      // from the base edge. Early targets spawn near the edge, later
      // targets spawn closer to the target itself so a multi-front
      // raid actually happens rather than everyone queueing at one side.
      const entryBias = t / Math.max(1, targets.length - 1)
      const entryX = baseEdgeX + (target.worldX - baseEdgeX) * entryBias
      const entrySurfaceY = this.scene.worldGrid?.surfaceHeights
        ? this.scene.worldGrid.surfaceHeights[
            ((Math.floor(entryX / TILE_SIZE)) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH
          ]
        : WORLD_HEIGHT * 0.2

      const raidStage = Math.max(2, Math.min(7, (target.stage || 3)))

      for (let i = 0; i < perTarget; i++) {
        if (this.units.length >= COMBAT_UNIT_CAP) break
        // Wide spawn spread so the band doesn't land on the same 3 tiles.
        const ox = entryX + (Math.random() - 0.5) * 220
        const oy = entrySurfaceY * TILE_SIZE - 20 - Math.random() * 30
        const unit = new CombatUnit(this.scene, ox, oy, raidStage, 'enemy', target, enemyClothingColour)
        unit.role = 'raider'
        // Per-unit target jitter so raiders don't all converge on the
        // same one tile inside the village — each aims for a slightly
        // different spot within the settlement footprint.
        const jitter = TILE_SIZE * 8
        unit._patrolTargetX = target.worldX + (Math.random() - 0.5) * jitter
        unit._patrolTargetY = target.worldY
        this.units.push(unit)
      }
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

  // focusTarget: optional entity (e.g. the rival god) to converge patrols on.
  // When present, freshly dispatched raiders lock their patrol point on the
  // threat so they march toward the battle instead of aimlessly.
  _dispatchHomePatrols(focusTarget = null) {
    const vs = this.scene.villages || []
    let homeCombatCount = 0
    for (const u of this.units) if (u.team === 'home') homeCombatCount++
    const cap = Math.min(80, this.units.length + 12)
    if (homeCombatCount >= cap) return

    // An invasion doubles unit count per village so battles feel like
    // battles instead of singular duels. Capped at 3 per village per tick.
    const unitsPerVillage = focusTarget ? 3 : 1

    for (const v of vs) {
      if ((v.team || 'home') !== 'home') continue
      if (v.stage < 3) continue
      if (v.population < 12) continue
      if (this.units.length >= COMBAT_UNIT_CAP) break

      const clothing = v.clothingColour || 0x7ad0c0
      for (let k = 0; k < unitsPerVillage; k++) {
        if (this.units.length >= COMBAT_UNIT_CAP) break
        const ox = v.worldX + (Math.random() - 0.5) * TILE_SIZE * 6
        const oy = v.worldY - 30
        const unit = new CombatUnit(this.scene, ox, oy, v.stage, 'home', v, clothing)
        // Pull them out of bodyguard mode and point them at the threat.
        if (focusTarget?.sprite) {
          unit.role = 'raider'
          unit._patrolTargetX = focusTarget.sprite.x
          unit._patrolTargetY = focusTarget.sprite.y
        }
        this.units.push(unit)
        if (this.scene.worldLayer && !unit._hasCollider) {
          unit._hasCollider = true
          this.scene.physics.add.collider(unit.sprite, this.scene.worldLayer)
        }
      }
    }
  }

  // Spontaneous warrior training. Any home village with enemies
  // within its perimeter and enough people to spare promotes 1-2
  // villagers into combat units. Population is debited for each
  // spawn so it feels like the village is genuinely paying the cost
  // of its defence. Caps keep the battlefield from ballooning.
  _trainReactiveDefenders() {
    const vs = this.scene.villages || []
    if (vs.length === 0) return
    const threatRadius = TILE_SIZE * 12
    const threatRadiusSq = threatRadius * threatRadius

    let homeCombatCount = 0
    for (const u of this.units) if (u.team === 'home' && u.alive) homeCombatCount++
    if (homeCombatCount >= 120) return

    for (const v of vs) {
      if ((v.team || 'home') !== 'home') continue
      if (v.population < 15) continue
      if (this.units.length >= COMBAT_UNIT_CAP) break

      // Scan for a nearby enemy unit. Break at first hit; we don't need
      // to know the count, just whether anyone is threatening.
      let threatened = false
      for (const u of this.units) {
        if (!u.alive || u.team !== 'enemy') continue
        const dx = u.sprite.x - v.worldX
        const dy = u.sprite.y - v.worldY
        if (dx * dx + dy * dy < threatRadiusSq) { threatened = true; break }
      }
      // Also consider the enemy god a direct threat
      const enemyGod = this.scene.enemyGod
      if (!threatened && enemyGod?.alive && enemyGod.sprite) {
        const dx = enemyGod.sprite.x - v.worldX
        const dy = enemyGod.sprite.y - v.worldY
        if (dx * dx + dy * dy < threatRadiusSq) threatened = true
      }
      if (!threatened) continue

      // Train a defender. Use the village's stage so equipment matches.
      const clothing = v.clothingColour || 0x7ad0c0
      const stage = Math.max(1, v.stage)
      const count = Math.min(2, Math.floor(v.population / 20))
      for (let i = 0; i < count; i++) {
        if (this.units.length >= COMBAT_UNIT_CAP) break
        const ox = v.worldX + (Math.random() - 0.5) * TILE_SIZE * 5
        const oy = v.worldY - 30
        const unit = new CombatUnit(this.scene, ox, oy, stage, 'home', v, clothing)
        unit.role = 'bodyguard'
        this.units.push(unit)
        v.population = Math.max(0, v.population - 1)
        if (this.scene.worldLayer && !unit._hasCollider) {
          unit._hasCollider = true
          this.scene.physics.add.collider(unit.sprite, this.scene.worldLayer)
        }
      }
    }
  }

  // ── Raid world: village assault mechanic ──────────────
  // Home-team raiders near an enemy village chip away at its population.
  // This is what makes "battling" a village tangible: stand your ground
  // near it and your warriors wear it down. The god's spells also
  // contribute via a separate AOE-kills-pop path in WorldScene.
  _tickRaidAssaults() {
    const vs = this.scene.villages || []
    const assaultRange = TILE_SIZE * 18

    for (const v of vs) {
      if (v.team !== 'enemy' || v._destroyed) continue
      // Count home combatants near this village
      let raidersNearby = 0
      for (const u of this.units) {
        if (!u.alive || u.team !== 'home') continue
        const dx = u.sprite.x - v.worldX
        const dy = u.sprite.y - v.worldY
        if (dx * dx + dy * dy < assaultRange * assaultRange) raidersNearby++
      }
      // Also count the god's presence as an assault contribution
      if (this.scene.god?.sprite) {
        const gx = this.scene.god.sprite.x - v.worldX
        const gy = this.scene.god.sprite.y - v.worldY
        if (gx * gx + gy * gy < assaultRange * assaultRange) raidersNearby += 5
      }

      if (raidersNearby > 0) {
        // Population drain: proportional to raider count, faster for more
        const drain = raidersNearby * 4.0  // ~4 pop per raider per 2s tick
        v.population = Math.max(0, v.population - drain)
        // Belief also erodes under assault
        v.belief = Math.max(0, v.belief - raidersNearby * 1.5)
      }
    }
  }

  // Enemy villages spawn their own defenders during raid worlds. This
  // is the other side of the battle: the enemy fights back. Defenders
  // spawn periodically from high-pop villages.
  _dispatchEnemyDefenders() {
    const vs = this.scene.villages || []
    let enemyCombatCount = 0
    for (const u of this.units) if (u.team === 'enemy' && u.alive) enemyCombatCount++
    // Cap enemy combat units at a reasonable number
    if (enemyCombatCount >= 120) return
    if (this.units.length >= COMBAT_UNIT_CAP) return

    for (const v of vs) {
      if (v.team !== 'enemy' || v._destroyed) continue
      if (v.population < 20 || v.stage < 2) continue
      if (this.units.length >= COMBAT_UNIT_CAP) break

      // Each village dispatches 1-3 defenders per tick, weighted by stage
      const count = Math.min(3, Math.max(1, Math.floor(v.stage / 2)))
      for (let i = 0; i < count; i++) {
        if (this.units.length >= COMBAT_UNIT_CAP) break
        const ox = v.worldX + (Math.random() - 0.5) * TILE_SIZE * 8
        const oy = v.worldY - 20
        const clothing = 0xff5533
        const unit = new CombatUnit(this.scene, ox, oy, v.stage, 'enemy', v, clothing)
        // Defenders are a mix: some guard the village, some raid
        unit.role = Math.random() < 0.5 ? 'bodyguard' : 'raider'
        this.units.push(unit)
        if (this.scene.worldLayer && !unit._hasCollider) {
          unit._hasCollider = true
          this.scene.physics.add.collider(unit.sprite, this.scene.worldLayer)
        }
        // Spend population to spawn a defender (they came from somewhere)
        v.population = Math.max(0, v.population - 1)
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
