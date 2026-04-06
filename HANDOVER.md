# Godstone — handover

Living document. Each session: move shipped work into "last session", drop new requirements into the backlog, keep priority order honest. Mike directs, AI builds, one step at a time. Read `GODSTONE-game-design-spec.md` before touching any system.

## Where we are

- **Phase 1 (world, god, villages, tablets):** complete. Live at https://threapchills.github.io/Godstone/.
- **Phase 2 (interactive particle simulation):** core falling-sand loop is in place. `world/GridSimulator.js` runs water / sand / lava on a moved-flag generation tracker with alternating scan; lava + water reactions emit hiss/steam events that the sound engine plays back. Still on the main thread; the planned Web Worker move is unfinished.
- **Phase 3 (full single-player loop):** core systems shipped. Coherent village upgrade gate, tablet inventory + HUD, stage-equipped warriors, dispatched bodyguards, three-spell loadout with mouse controls, rival god with tiny AI tree, melee + bolt combat. Still missing: enemy warriors, populated battles, balance pass.
- **Phase 4 (multiplayer, portal omniverse):** not started.
- **Phase 5 (polish):** sound engine has eight spatial systems shipped; SkyBaby sample integration is still procedural-only.

### File structure (current)

```
src/
  main.js
  core/Constants.js, EventBus.js
  world/
    WorldGenerator.js   WorldRenderer.js   TileTypes.js
    GridSimulator.js    PortalHenge.js     Critters.js
    FoliageRenderer.js  ParticleEngine.js
    ParallaxForeground.js   (inert; deletion candidate)
  god/
    God.js              GodRenderer.js
  civilisation/
    Village.js          Tablet.js
    Warrior.js          Bodyguard.js
  combat/
    Combat.js           EnemyGod.js
  spells/
    Spell.js            SpellBook.js
  scenes/
    CreationScene.js    WorldScene.js
  ui/
    Minimap.js          ParallaxSky.js
    TabletInventory.js  SpellBar.js
  sound/
    AmbienceEngine.js
  utils/
public/sounds/          (28 OGG; sky/fire/earth/sea x7 each)
```

## Last session: what shipped

All changes committed and pushed; live deploy is current. The session ran through eight backlog items in priority order.

- **Circular minimap with live grid updates.** `src/ui/Minimap.js` projects the world onto a disc instead of a flat rectangle (sky at the rim, bedrock-tinted core at the centre, world wraps around). Pre-baked inverse projection lookup makes each refresh a single ImageData write. Refreshes from the live grid every 250 ms so dug terrain, lava flow, and water erosion all show through. Markers projected via shared forward helper.
- **Tablet glow effect.** `src/civilisation/Tablet.js` rebuilt with five additive aura layers per tablet: outer halo, inner halo, vertical godray shaft, five orbiting motes on a squashed orbit, hovering glyph pip. Proximity reactivity swells the inner halo and pip when the god is within ~2.5 tiles, with hysteresis preventing re-trigger. New `AmbienceEngine.playTabletShimmer` is a pure-synth pentatonic chord with octave shimmer + high noise sparkle.
- **Coherent village upgrade gate.** `God.tablets` is now a count map keyed by stage with `totalEverCollected` tracked separately. `Village.nextRequiredTablet` exposes the single stage a village will accept; out-of-order tablets show a throttled rejection hint and stay in inventory. New `src/ui/TabletInventory.js` widget renders one slot per stage in this world, with a gold ring on the slot the nearest village wants next.
- **Camera shake + time dilation juice pass.** New `addJuice(severity)` helper with light/medium/heavy/severe presets. Tablet pickup tones down to 'light'. `processGridEvents` accumulates lava-water reactions and fires medium on a small flood, heavy on a large one. `respawnGod` fires severe on death.
- **Visible warrior upgrades + bodyguards.** New `src/civilisation/Warrior.js` defines per-stage procedural sprites (villager, clubber, spearman, archer, swordsman, mounted rider, arcanist) drawn from the village's element-tinted clothing colour. Village now spawns `WanderingWarrior` instances and wipes/respawns on stage advance so equipment refreshes. New `src/civilisation/Bodyguard.js` is a physics-driven escort that seeks a formation slot around the god, walks, jumps, and lifts off when stuck or when the god flies. `Village.canDispatchBodyguards()` requires stage 3+ and belief 60+. WorldScene runs a periodic dispatch loop, capping at three escorts and culling those whose origin loses the faith.
- **Spell system + mouse controls.** New `src/spells/Spell.js` defines Bolt (line damage that carves soft terrain), Place (drops the god's primary element into the falling-sand sim), and Geas (belief surge on the nearest village). `SpellBook` gates the visible loadout by total tablets ever collected. `src/ui/SpellBar.js` shows three slots in the bottom-centre with gold ring on active and a cooldown sweep mask. Mouse wheel cycles, left click casts at the cursor's world position, 1/2/3 select directly.
- **Rival god + combat values.** New `src/combat/Combat.js` is the single tunable table for HP, damage, cooldowns, and ranges. New `src/combat/EnemyGod.js` is a horned silhouette deity with HP bar and a tiny WANDER → SEEK → ENGAGE → FLEE state machine; lifts off when stuck or when the player is far above, fires shadow bolts on cooldown, retreats and regen-heals when low. `God.takeDamage` has 500 ms invuln and routes to `respawnGod` on death. Bolt spell hits the rival god via point-to-segment distance check. Bodyguards engage the rival in melee when within 12 tiles. WorldScene spawns one rival on the opposite hemisphere and shows a player HP gauge in the top-left HUD.
- **Critter spawn regression non-bug.** Investigated and could not reproduce on a clean world load (37 critters spawned with `barrenFertile = 0.7`). Closed.

Build clean throughout (`npm run build`, ~1.61 MB minified, ~381 KB gzipped). Each item committed and pushed individually so `git log` is the timeline.

## Backlog: next priorities

Combat exists but is shallow. Next session should put pressure on the new systems and balance them.

### A. Enemy warriors + populated battles

- **Why:** the rival god is currently a solo encounter. Bodyguards have a melee target but no peers. The world feels empty of conflict.
- **Required behaviour:**
  1. Rival villages spawn enemy warriors (use the existing `Warrior` module with a different clothing colour seed so they read as a different faction).
  2. The rival god commands a small retinue that spawns near it on a slow timer (1 every ~8s up to a cap of 3).
  3. Enemy warriors engage bodyguards in melee + use the existing combat values from `src/combat/Combat.js`.
  4. Faction colour: pick a deliberately contrasting tint for the rival faction so they don't blend in with the player's villages.
- **Files:** new `src/combat/EnemyWarrior.js` (or extend `Bodyguard.js` with a generic Combatant), updates to `Village.js` for hostile flag, `EnemyGod.js` for retinue spawn, `WorldScene.js` for collision/AI wiring.

### B. Combat balance pass

- **Why:** combat values are first-pass. Bolt damage 18 vs 120 enemy HP means ~7 hits to kill (~3.5 seconds at 500ms cooldown) which is reasonable but untested. Bodyguard melee per stage is guesswork.
- **Tasks:**
  1. Playtest a full kill of the rival god with bodyguards engaged. Tune `COMBAT.spells.boltDamage`, `COMBAT.enemyGod.maxHp`, melee damage by stage.
  2. Test what happens when god dies: respawn HP reset works, but visual feedback could be louder.
  3. Decide whether enemy bolts should also have a per-target invuln window or if 500ms is too lenient.
- **Files:** `src/combat/Combat.js` only, ideally.

### C. Spell polish

- **Right click as charged cast** (originally deferred). Decide flavour: held charge boosts bolt damage / radius, place spell drops a bigger cluster, geas boosts belief by more. Mike to sign off direction.
- **Mana / cooldown HUD** is currently a sweep mask; should also show a numeric cooldown pip when partially down for spells with long cooldowns (geas at 4s).
- **Spell visuals:** the bolt is a flat additive line. Could use a glowing sphere head + trailing particles. Place could telegraph a target reticle on hover.

### D. Tablet count vs village stage cap

- Spec promises stages 2 to 7 (six tablets) but world only generates `TABLET_COUNT = 3` (stages 2 to 4). Decide whether to bump tablet count to 6 or keep it short for early playtests.
- **Files:** `src/scenes/WorldScene.js` (TABLET_COUNT constant).

### E. Bodyguard pathfinding upgrade

- Current bodyguard AI is steering + brief flight when stuck. Works for open terrain but fails in tight caves. Brief consideration: add a tile-graph BFS toward the god updated every ~500 ms, fall back to flight for unreachable targets.
- **Files:** new `src/utils/Pathfinding.js`, `src/civilisation/Bodyguard.js`.

## Backlog: older items still outstanding

- **Web Worker for the falling-sand sim.** Currently runs on the main thread inside `GridSimulator.update`. Phase 2 was supposed to push it into a worker so the Phaser render loop never starves. Becomes visible at higher particle counts.
- **SkyBaby sample integration.** Procedural sound bus works; what's missing is layering real samples (gong / magic / ambient bird) over the procedural foundation with element-driven filter envelopes. Reference architecture is Slumbr.
- **Delete `src/world/ParallaxForeground.js`** or repurpose as a back-of-camera foliage band; right now it's unused dead code.
- **Population dynamics balance pass.** Belief growth and decline curves are placeholder; they need playtesting alongside the new combat loop.
- **Open spec questions in section 11 of `GODSTONE-game-design-spec.md`.** Spell flavour, belief curves, combat values: don't decide silently, flag and ask.
- **Biome bands within a world.** Horizontal partition into 3-5 biomes with their own tile tinting, vegetation density, cave frequency, particle emphasis. Was queued behind Phase 2.

## Architectural notes for the next session

- **Module communication** runs through `core/EventBus.js` or shared scene state. Direct cross-module imports are a smell. Combat is the main exception: `EnemyGod.takeDamage` is called directly from `Spell.cast` and `Bodyguard.update`. That's fine for v1; if it grows, route through an event bus.
- **Combat tuning** lives in `src/combat/Combat.js`. Single source of truth: HP, damage, cooldowns, ranges, flee thresholds. Tweak there, not at call sites.
- **Particle sim** lives in `src/world/GridSimulator.js`. Update is bottom-to-top with alternating x-direction per generation. The moved-flag `Uint8Array` is the ground truth for "did this cell already act this tick." Don't add new tile interactions without reading the existing `updateWater` / `updateSand` / `updateLava` for the conventions; in particular, the connected-body check is what stops the wobble bug from coming back.
- **Minimap** is now a circular projection rebuilt from a pre-baked inverse lookup. The texture re-renders from the live grid every 250 ms via `Minimap.refreshTexture` so digs and lava flow show through. The forward projection helper `projectToScreen(tileX, tileY)` is shared with marker placement.
- **Tablet inventory** is a count map (`god.tablets[stage] = count`) plus `god.totalEverCollected`. Use the latter for spell unlocks (only goes up). `god.consumeTablet(stage)` is the only way to spend.
- **Spell system** lives in `src/spells/`. Spells are dumb objects with one `cast(scene, x, y)` method; the `SpellBook` owns the active selection and cooldowns. Adding a new spell is: define a class in `Spell.js`, register it in `SpellBook.allSpells`, append to `UNLOCK_ORDER`.
- **Bodyguards** are dispatched via `WorldScene._updateBodyguards` on a 1s timer; only the closest qualifying village dispatches at a time, max three escorts. Each bodyguard owns its own physics body and follow AI; melee combat preempts formation seek when an enemy god is within 12 tiles.
- **Sky** is anchored to the viewport (`scrollFactor 0`) with manual `tilePositionX/Y` driven by camera scroll. Do not put sky tileSprites in world space; the seam returns instantly.
- **Surface snapping helper:** `WorldScene.snapToGround(grid, x, startY)` is the right pattern for any new entity that needs to sit on the ground. Use it for warriors, spawned NPCs, dropped items, everything.
- **Skipping the creation UI in dev:**
  ```js
  const game = window.__godstone
  const cs = game.scene.getScene('Creation')
  cs.selectedElements = ['water', 'earth']
  cs.elementRatio = 5
  cs.sliders = { skyCave: 0.5, barrenFertile: 0.7, sparseDense: 0.6 }
  cs.worldSeed = 575308
  cs.launchWorld()
  ```
- **British English** in code, comments, and UI. No em dashes. Sentence case for headings. No "this is not X, it is Y" reformulation patterns.

## Testing protocol

For every backlog item:

1. `npm run build` must stay clean.
2. Reload the preview at `localhost:3000`. Drive the game through `window.__godstone` if you need to skip menus.
3. Capture a screenshot via the preview tools and check the visible result against the acceptance criteria.
4. Only mark complete when the screenshot proves it.

## Working principles (non-negotiable)

- **Mike directs, AI builds.** Propose one step, wait for confirmation, then build. No bundling.
- **Sound design is sacred.** Emergent randomisation within parameters. Static loops are unacceptable. See `feedback_sound_design.md`.
- **Digging in all directions** is critical QoL. Any world gen change must preserve escape routes.
- **Read `GODSTONE-game-design-spec.md`** before working on any new system. It's the authoritative GDD.
- **Read `CLAUDE.md`** for architecture overview and conventions.
- **Check memory files** in `.claude/projects/.../memory/` for accumulated feedback.
- **Push to GitHub** periodically for backup. The deploy workflow handles GitHub Pages automatically.
- The `slumbr/` directory is gitignored reference material (Mike's ambient sound engine). Don't delete it.
