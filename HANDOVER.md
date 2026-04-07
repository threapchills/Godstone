# Godstone — handover

Living document. Each session: move shipped work into "last session", drop new requirements into the backlog, keep priority order honest. Mike directs, AI builds, one step at a time. Read `GODSTONE-game-design-spec.md` before touching any system.

## Where we are

- **Phase 1 (world, god, villages, tablets):** complete. Live at https://threapchills.github.io/Godstone/.
- **Phase 2 (interactive particle simulation):** core falling-sand loop is in place. `world/GridSimulator.js` runs water / sand / lava on a moved-flag generation tracker with alternating scan; lava + water reactions emit hiss/steam events that the sound engine plays back. Still on the main thread; the planned Web Worker move is unfinished.
- **Phase 3 (full single-player loop):** core systems shipped. Persistent level-agnostic tablets, sequenced multi-stage village upgrade, stage-equipped warriors, dispatched bodyguards, three-spell loadout with mouse + mana, rival god with tiny AI tree, melee + bolt combat, mana-gated casts with movement regen. Still missing: enemy warriors, populated battles, balance pass.
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

## Backlog: Mike's current brief

Six items in priority order. Surgical, additive edits only; no breaking what is already built and carefully calibrated.

### 1. Project context refresh
HANDOVER and memory updated to reflect the persistent-tablet world and Mike's new priorities. (Done as a preamble each session.)

### 2. Enemy god mana constraints
The rival god currently fires shadow bolts on a cooldown but has no mana pool. Add a mana pool that mirrors the player's so the rival also has to manage casts. Same regen rule: regen on movement. **Files:** `src/combat/Combat.js`, `src/combat/EnemyGod.js`.

### 3. Universal grounding
The Village.updateGrounding pattern needs to extend to everything that should sit on the ground after terraforming: portal henge, trees, bushes, mushrooms, grass, critters. Buildings, villagers, warriors, and bodyguards already snap. **Files:** `src/world/PortalHenge.js`, `src/world/FoliageRenderer.js`, `src/world/Critters.js`.

### 4. Wider tunnels + more labyrinthine caverns
Cave tunnels are too narrow on average. The player should be able to traverse most of a world's underground without digging. Tune the labyrinth carving threshold and possibly add a second pass that widens existing corridors. **Files:** `src/world/WorldGenerator.js`.

### 5. More flora and fauna per world and biome
Trees, bushes, mushrooms, and critters need more variety with biome-aware selection. Same per-element seeded variant pattern critters already use, extended to plants and made biome-aware (forest grove, fungal cave, scorched flats, etc.). **Files:** `src/world/WorldGenerator.js` (vegetation), `src/world/Critters.js`, possibly a new `src/world/FloraVocab.js`.

### 6. Freeform polish
Open-ended additive improvements to gameplay, graphics, effects. Surgical additions, no refactors of working systems.

## Backlog: deferred from last session

These were Mike's prior priorities; now superseded by the six items above but worth keeping visible.

- **Enemy warriors + populated battles.** Rival villages spawn hostile warriors; the rival god gets a small retinue.
- **Combat balance pass.** Playtest the kill loop, tune Combat.js values.
- **Spell polish.** Right click charged cast (Mike to sign off direction), better spell visuals, numeric cooldown pip.
- **Tablet count vs stage cap.** TABLET_COUNT is 3 but stages run to 7. Decide whether to bump.
- **Bodyguard pathfinding upgrade.** Replace steering with a tile-graph BFS for tight caves.

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
- **Tablet system** is persistent and level-agnostic. `god.highestTablet` is a single integer that only ever increments; `collectTablet()` advances it. Tablets are never consumed. A village at stage N needs the level N tablet, computed as `village.nextRequiredTablet === village.stage`. A single walk-in chains every upgrade the player's collection allows with a 1s stagger between rebuilds. Spell unlocks key off `god.highestTablet` (1 = bolt, 2 = +place, 3 = +geas).
- **Spell system** lives in `src/spells/`. Spells are dumb objects with one `cast(scene, x, y)` method; the `SpellBook` owns the active selection and cooldowns. Adding a new spell is: define a class in `Spell.js`, register it in `SpellBook.allSpells`, append to `UNLOCK_ORDER`.
- **Bodyguards** are dispatched via `WorldScene._updateBodyguards` on a 1s timer; only the closest qualifying village dispatches at a time, max three escorts. Each bodyguard owns its own physics body and follow AI; melee combat preempts formation seek when an enemy god is within 12 tiles.
- **Sky** is anchored to the viewport (`scrollFactor 0`) with manual `tilePositionX/Y` driven by camera scroll. Do not put sky tileSprites in world space; the seam returns instantly.
- **Surface snapping helper:** `WorldScene.snapToGround(grid, x, startY)` is the right pattern for any new entity that needs to sit on the ground. There is also a bounded `findGroundTileY(grid, tileX, startTileY, fallbackTileY, maxWalk = 18)` duplicated in `Village.js` and `Warrior.js` that caps the search and falls back gracefully; promote to a shared `utils/Grounding.js` if a third caller needs it.
- **Mana** is a per-frame regen tied to actual god displacement. `god.maxMana = 3`, regen 3/120 per second when moving, drained 1 per spell cast. `SpellBook.cast` checks the pool before delegating to the spell and surfaces a hint when empty.
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
