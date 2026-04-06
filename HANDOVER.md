# Godstone — handover

Living document. Each session: move shipped work into "last session", drop new requirements into the backlog, keep priority order honest. Mike directs, AI builds, one step at a time. Read `GODSTONE-game-design-spec.md` before touching any system.

## Where we are

- **Phase 1 (world, god, villages, tablets):** complete. Live at https://threapchills.github.io/Godstone/.
- **Phase 2 (interactive particle simulation):** core falling-sand loop is in place. `world/GridSimulator.js` runs water / sand / lava on a moved-flag generation tracker with alternating scan; lava + water reactions emit hiss/steam events that the sound engine plays back. Still on the main thread; the planned Web Worker move is unfinished.
- **Phase 3 (full single-player loop — spells, combat, populations):** partial. Villages stage 1 to 7 exist with sprawl, but the upgrade gate is broken (out-of-order tablets work). Tablets exist but are nearly invisible. No spells, no NPC gods, no NPC warriors yet.
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
    FoliageRenderer.js  ParallaxForeground.js   (inert; deletion candidate)
  god/
    God.js              GodRenderer.js
  civilisation/
    Village.js          Tablet.js
  scenes/
    CreationScene.js    WorldScene.js
  ui/
    Minimap.js          ParallaxSky.js
  sound/
    AmbienceEngine.js
  utils/
public/sounds/          (28 OGG; sky/fire/earth/sea x7 each)
```

## Last session — what shipped (currently uncommitted)

Working tree has seven modified files plus inert `ParallaxForeground.js`. Commit before starting new work.

- **GridSimulator wobble fix.** Single water/lava tiles on flat ground used to oscillate forever because of a random tiebreaker. Lateral spread now only fires when the cell is `inBody` (above/left/right neighbour is the same liquid), and the tiebreaker is deterministic via `((x + y) & 1)`. Steady-state equilibrium reachable.
- **Ghost trees removed.** `ParallaxForeground` (the translucent silhouette layer in front of the world) looked like floating phantoms. WorldScene no longer instantiates it; the file is still on disk awaiting deletion.
- **Surface snapping.** `WorldScene.snapToGround(grid, x, startY)` plus an equivalent walk-down loop in `FoliageRenderer.spawnTree`. Trees and huts now sit flush on eroded terrain instead of floating where the cached surface y said they should be.
- **Building scale.** `Village.js` scales building sprites by `BUILDING_SCALE = 2.5` and uses a wider `STAGE_SPREAD` (`[0, 5, 8, 12, 16, 22, 28, 34]`). Buildings are now bigger than the god, smaller than trees, and stage-7 settlements actually sprawl.
- **Sky ceiling.** WorldScene clamps the god's y at `SKY_CEILING = -30 * TILE_SIZE`. Plenty of headroom; no more flying off the top of the minimap into the void.
- **ParallaxSky overhaul.** Five layers (was three): distant sky wash, mid band, painted clouds, near streaks, foreground mist. Each layer is element-tinted via the world palette, with a base rectangle at depth -12 guaranteeing coverage at every camera position. Day/night cycle uses a sun-height curve (`Math.sin(dayTime * Math.PI * 2 - Math.PI / 2)`) to blend night navy → base sky → daylight white → horizon amber across all layers and the base rect.
- **Critter variety per world.** `Critters.js` defines three subtypes per element (salamander/phoenix/ember-mite for fire; crab/frog/newt for water; moth/wisp/sky-mite for air; beetle/lizard/cricket for earth). `pickCritter(element, seed)` deterministically chooses one per world. Same element pair produces different fauna depending on the seed.

Build verified clean (`npm run build`, 1.58 MB minified, 372 KB gzipped). The test world loads with five sky layers, 50 trees, 4 villages, 3 tablets. Critter count came back as 0 in the live verification step, which is flagged in the backlog.

### Suggested commit message for the uncommitted work

```
fix: surface snapping, sky overhaul, critter variety, particle equilibrium

- Trees and villages snap to actual topmost solid ground
- ParallaxSky: 5 layers, element tinting, day/night sun-height cycle
- Critters: per-element subtypes chosen deterministically by seed
- GridSimulator: connected-body check + parity tiebreaker stops
  single liquid tiles wobbling forever
- WorldScene: upper sky ceiling clamp, ghost-tree foreground removed
- Village buildings scaled 2.5x, wider stage sprawl
```

## Backlog — Mike's latest brief (priority order)

The next session should treat this as the working list. Each item has acceptance criteria. Don't mark anything done until it visibly works in preview.

### A. Tablet glow effect

- **Symptom:** tablets are nearly invisible in dark caves; the existing 0.15-alpha pulsing circle in `Tablet.createGlow` is too subtle.
- **Acceptance:** a tablet is unmistakably visible from at least eight tiles away in pitch black. Use one or more of: brighter pulsing aura, vertical light shaft / godrays, particle motes orbiting the tablet, additive blend mode, a glyph pip above. When the god is within ~2 tiles, swell the glow and play a rising procedural shimmer via the sound engine.
- **Files:** `src/civilisation/Tablet.js` (mostly `createGlow`), `src/sound/AmbienceEngine.js` for the proximity shimmer.

### B. Coherent village upgrade gate

- **Symptom:** villages can be upgraded out of order. A player carrying tablet 4 can hand it to a stage-2 village and skip stages.
- **Required behaviour:**
  1. **Per-village stage tracking.** Each village exposes `nextRequiredTablet = stage + 1`. A village at stage 2 only accepts tablet 3.
  2. **Player tablet inventory.** The god gets a `tablets` map (`{ 1: count, 2: count, ... }`). Picking up a tablet adds to inventory; it does not auto-deliver to the next village walked into.
  3. **Delivery rule.** Walking into a village checks `god.tablets[village.nextRequiredTablet]`. If present, decrement, advance stage, run the upgrade animation. Otherwise show a transient hint ("Cael's Crossing isn't ready for tablet 4 yet — they need tablet 3 first").
  4. **Tablet inventory UI.** Corner HUD with rows of tablet glyphs and counts. Highlight the one the nearest village wants.
- **Files:** `src/civilisation/Tablet.js`, `src/civilisation/Village.js`, `src/god/God.js`, `src/scenes/WorldScene.js`, new `src/ui/TabletInventory.js`.

### C. Visible warrior upgrades and bodyguards

- **Symptom:** the spec promises that each tablet stage produces visibly upgraded warriors; we currently only have generic walking villagers.
- **Required behaviour:**
  1. **Warrior class per stage.** Stage 2 club, 3 spear, 4 bow, 5 sword + shield, 6 mounted, 7 arcane / champion. Each gets a distinct procedural sprite (existing canvas-pixel approach is fine).
  2. **Bodyguard escort.** Some upgraded warriors leave the village and follow the god as a small escort. Slot-based formation (e.g. three slots around the god). Bodyguards must:
     - walk on terrain
     - jump (same parabolic arc as the god)
     - fly when the god flies, or hover up to follow
     - pathfind around obstacles. A flow-field toward the god, falling back to brief flight when blocked, will do; full A* is overkill.
  3. **Loyalty per village** drives whether bodyguards are sent at all. Low-belief villages refuse.
- **Files:** new `src/civilisation/Warrior.js`, new `src/civilisation/Bodyguard.js`, new `src/utils/Pathfinding.js`, updates to `Village.js` and `WorldScene.js`.

### D. Camera shake and time dilation

- **Already wired:** `GridSimulator` emits events for big interactions; `WorldScene` consumes them only for sound right now.
- **Required behaviour:**
  1. **Camera shake** on tablet pickup (gentle), spell cast (medium), explosion / lava-water reaction (heavy), god death (severe). Use `cam.shake(duration, intensity)`.
  2. **Time dilation** for spell casts and dramatic moments. Slow simulation `dt` to 0.3× for ~150 ms, ease back to 1×. The grid simulator already accepts a dilated delta — wire WorldScene to multiply.
- **Files:** `src/scenes/WorldScene.js`, possibly a tiny new `src/utils/Juice.js`.

### E. Spell system + mouse controls

- **Required behaviour:**
  1. **Mouse wheel** cycles selected spell.
  2. **Left click** casts at the cursor. Right click as charged-cast modifier (confirm with Mike before adding).
  3. **Spell loadout gates by tablets carried:** 0 tablets = no spells, 1 = 1 spell, 2 = 2 spells, 3+ = full loadout of three. The unlocks should track total tablets ever picked up, not current inventory.
  4. **First spell candidates** (Mike to confirm flavour):
     - **Bolt** — direct damage line, no cost, fast cooldown
     - **Place** — drop a tile of the god's primary element (water/fire/earth/air) under the cursor; feeds straight into the simulation
     - **Geas** — temporary belief boost on the village under the cursor
  5. **Spell HUD** in the corner: three icon slots, active one highlighted, mana / cooldown bar.
- **Files:** new `src/spells/Spell.js`, `src/spells/SpellBook.js`, `src/ui/SpellBar.js`, `src/scenes/WorldScene.js`.

### F. NPC enemy gods + NPC warriors

- **Why:** spells and bodyguards need targets. Without enemies the new toys have nothing to do.
- **Required behaviour:**
  1. **Enemy god** as a roaming AI entity with the same movement repertoire as the player (walk, jump, fly, dig).
  2. **Enemy warriors** spawned from rival villages, or from a portal incursion later.
  3. **Combat values** — propose damage / HP numbers for Mike to sign off; never pick silently.
  4. **AI behaviour tree** kept tiny: idle → seek → engage → flee, transitioning on HP and target distance.
- **Recycle from SkyBaby / Soar:** Mike's earlier Phaser project has a robust enemy spawn + AI population system. Pull it across rather than reinvent. Files to mine (Mike to confirm path):
  - `EnemySpawner` / `Population` / `BehaviorTree` modules
  - steering behaviours (seek, flee, separation)
  - HP / damage helpers
- **Files:** new `src/combat/Enemy.js`, `EnemyGod.js`, `AiBrain.js`, `PopulationManager.js`.

### G. Critter spawn regression (newly observed)

- During verification of the critter-variety change the live world reported `critters: 0` despite `barrenFertile = 0.7`. Possibly the spawn loop now bails out because the surface check is rejecting candidates after recent terrain changes, or `pickCritter` returned `undefined` for an edge case.
- **Acceptance:** worlds with `barrenFertile > 0.3` reliably spawn at least 10 critters at start.
- **Files:** `src/world/Critters.js`, possibly `src/world/WorldGenerator.js`.

## Backlog — older items still outstanding

- **Web Worker for the falling-sand sim.** Currently runs on the main thread inside `GridSimulator.update`. Phase 2 was supposed to push it into a worker so the Phaser render loop never starves. Becomes visible at higher particle counts.
- **SkyBaby sample integration.** Procedural sound bus works; what's missing is layering real samples (gong / magic / ambient bird) over the procedural foundation with element-driven filter envelopes. Reference architecture is Slumbr.
- **Delete `src/world/ParallaxForeground.js`** or repurpose as a back-of-camera foliage band; right now it's unused dead code.
- **Population dynamics balance pass.** Belief growth and decline curves were placeholder; they need playtesting once warriors and combat exist.
- **Open spec questions in section 11 of `GODSTONE-game-design-spec.md`** — many systems still have deliberately unresolved details (spell costs, belief curves, combat values). Don't decide silently; flag and ask.
- **Cosmetic particle pool.** Earlier handover proposed an `src/world/ParticleEngine.js` with a pre-allocated pool of ambient cosmetic particles (embers, leaves, mist, motes) keyed to element + biome + day/night. Still worth doing; it complements the simulation particles without competing with them.
- **Biome bands within a world.** Horizontal partition into 3-5 biomes with their own tile tinting, vegetation density, cave frequency, particle emphasis. Was queued behind Phase 2.

## Architectural notes for the next session

- **Module communication** runs through `core/EventBus.js` or shared scene state. Direct cross-module imports are a smell.
- **Particle sim** lives in `src/world/GridSimulator.js`. Update is bottom-to-top with alternating x-direction per generation. The moved-flag `Uint8Array` is the ground truth for "did this cell already act this tick." Don't add new tile interactions without reading the existing `updateWater` / `updateSand` / `updateLava` for the conventions; in particular, the connected-body check is what stops the wobble bug from coming back.
- **Sky** is anchored to the viewport (`scrollFactor 0`) with manual `tilePositionX/Y` driven by camera scroll. Do not put sky tileSprites in world space; the seam returns instantly.
- **Surface snapping helper:** `WorldScene.snapToGround(grid, x, startY)` is the right pattern for any new entity that needs to sit on the ground. Use it for warriors, spawned NPCs, dropped items, everything.
- **Skipping the creation UI in dev:**
  ```js
  window.__godstone.scene.getScene('Creation').scene.start('World', {
    params: { element1: 'water', element2: 'earth', elementRatio: 5,
              skyCave: 0.5, barrenFertile: 0.7, sparseDense: 0.6, seed: 575308 }
  })
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
