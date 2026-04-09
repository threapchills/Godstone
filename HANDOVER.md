# Godstone — handover

Living document. Each session: move shipped work into "last session", drop new requirements into the backlog, keep priority order honest. Mike directs, AI builds. Read `GODSTONE-game-design-spec.md` before touching any system.

## Active mission (April 2026)

Mike has authorised **autonomous batch mode** for a seven-phase expansion that takes Godstone from a contemplative world-shaper to a full-bodied god-game with epic village battles, omniverse portals, and a 10-stage progression split across home and raid worlds.

The rule this session is different from the usual "one step at a time": Mike said "work independently and push on as much as you can." Commit and push to `origin main` after each major batch. Signal handover at compact time.

### Seven-phase plan (Mike has agreed the order)

1. **Foundations** — 8x world, undiggable bedrock and magma, tablet depth redistribution
2. **Water cycle** — evaporation + clouds + rain so liquids don't pool at the bottom forever
3. **Camera AAA feel** — trauma shake, look-ahead, dynamic zoom, time dilation on action beats (pattern from Sky Baby's Camera class)
4. **Population sprawl** — 1000+ villagers per world, village spreading, caveman fallback for unsupported villages
5. **Combat import from Sky Baby** — bodyguard/homebody/raider roles, autonomous AI, arrow projectiles, War Director for village battles
6. **Spell system import from Sky Baby** — full catalogue (fireball, earthquake, tide of life, bolt), wired to Godstone's existing mana economy (small 3-mana pool that regens during movement)
7. **Portal omniverse** — inbound/outbound choice, AI god invasion, outbound raid with army, god statues, 10 stages split 7 home + 3 raid, sub-4s plane-walking transition

### Key design decisions (so future-me doesn't re-litigate)

- **World size**: 8x area → 1600 wide × 900 tall tiles (was 600×300). Roughly 2.67x wide, 3x tall. Traversal ~72s to wrap, ~10 screens deep.
- **Villager fidelity**: hybrid — all tracked as data, only on-screen ones rendered. Sky Baby handles 500 simulated units; Godstone will aim for 1000+ tracked with visible sample spawning per village.
- **Return trip rules**: one round trip per outbound journey. Next portal interaction resets inbound/outbound choice with a fresh random seed. No way to return to the same exact raid world twice.
- **Sky Baby source** is accessible at `SOAR/` inside this repo. Read its code directly rather than rebuilding from description. Key files: `SOAR/js/world.js` (Camera), `SOAR/js/entities.js` (Warrior roles, Projectile, Fireball, RainCloud), `SOAR/js/main.js` (game loop, War Director, spell casting, time dilation triggers).
- **Tablets vs god statues**: tablets drop on home world (stages 1-7). God statues drop from destroyed/conquered villages on raid worlds (stages 8-10). Functionally identical to tablets in the village progression pipeline, but only earned through raids.
- **Undiggable tiles**: bedrock (already), magma rock, core lava. Deepest tablets sit just above this uncarvable floor so the exploration has proper vertical drama.

### Status: phases 1-8 shipped + session 8b fixes

| Phase | Status | Highlights |
|---|---|---|
| 1. Foundations | Done | 1600x900 world, undiggable bedrock + magma, 7 tablets across depth bands |
| 2. Water cycle | Done | Drifting clouds, rain drops, evaporation, humidity feedback loop |
| 3. Camera AAA | Done | Trauma shake, lerped zoom + dilation, look-ahead, impact frames |
| 4. Population sprawl | Done | 20 stages, 22 villages, caveman fallback, 1400 pop cap at stage 20 |
| 5. Combat import | Done | CombatUnit role AI, Arrow projectiles, WarDirector raid cycle |
| 6. Spell system | Done | Element-aware burst spell, bolt = 100 dmg, four-slot bar |
| 7. Portal omniverse | Done | Inbound + outbound via scene restart, god statues, plane walk |
| 8. Polish | Done | Sky variants, visceral combat, scroll zoom, 20-stage progression |

### Session 8 details (2026-04-09)

**8a: Core features**
- Sky/asset randomisation: 8 sky paintings per world seed via `AssetVariants.js`; blend values lowered so paintings dominate. Tree variants reverted (PNG transparency issues).
- Speed/zoom: god speed 200→160, base zoom 1.0→1.15, `Scale.FIT` for PC.
- Minimap: portal = pulsing blue diamond, god = cyan dot, tablets = glowing X.
- Visceral combat: blood splatter on all damage, arrow whoosh sounds, camera shake on player hits.
- Inbound portal: enemy god only on activation, randomly generated each time, portal blocks during invasion, resets when invader dies.
- Outbound portal: full world generation via `scene.restart()`. Home world snapshot in module-level variable survives restarts.

**8b: Fixes and expansion (same session)**
- Portal freeze fix: replaced `requestAnimationFrame` in `create()` with `time.delayedCall(1)` so scene restarts work cleanly.
- Tablets are count-based, not level-based. Messages say "needs 3 tablets" not "level 3 tablet".
- Automatic raid waves disabled until first portal inbound. No more "war drums" during peaceful exploration.
- Warrior pathfinding: surface-seeking AI escapes caves by flying upward; stuck detection after 1s triggers fly-escape.
- Invasion scale: portal spawns 80 warriors (was 18); natural raids 30+12/stage.
- Bolt spell = 100 damage. One-shots gods.
- Defeating invading enemy god rewards a knowledge tablet.
- Village stages expanded to 20. Pop caps 4→1400, building counts 0→220, stage names through "Megalopolis ascendant".
- Scroll wheel zoom: 0.35x to 2.5x. Spells via 1/2/3 keys only. Minimap counter-scaled to stay fixed size.

### Known follow-ups for the next session

- **HUD scaling under camera zoom.** HUD text elements still scale with zoom. A dedicated Phaser UI camera would fix this properly; the minimap is already counter-scaled but text labels are not.
- **Tablet inventory widget** still shows 7 slots. Should expand dynamically to match total tablets collected, especially with 20 stages now reachable.
- **Village destruction in raid worlds** relies on belief decay (slow). Direct spell/combat damage could reduce village population faster for more visceral raids.
- **Enemy god on raid worlds** uses simple wander AI; could defend its villages more actively.
- **Rain rate** tuned for visual presence; Mike may want to adjust.
- **Combat still needs Sky Baby-level polish.** Mike's feedback: "play a long round of Sky Baby and see how robust the war and combat system feels there." The SOAR reference source is in the repo; key patterns to port: more aggressive raider AI, larger detection ranges, smarter village targeting, formation behaviour.
- **Tree variant PNGs need proper transparency** before re-enabling. Current files have alpha ~208 at corners (opaque background visible).

## Where we are (pre-mission state)

- **Phase 1 (world, god, villages, tablets):** complete. Live at https://threapchills.github.io/Godstone/.
- **Phase 2 (interactive particle simulation):** core falling-sand loop is in place. `world/GridSimulator.js` runs water / sand / lava on a moved-flag generation tracker with alternating scan; lava + water reactions emit hiss/steam events that the sound engine plays back. Still on the main thread; the planned Web Worker move is unfinished.
- **Phase 3 (full single-player loop):** core systems shipped. Persistent level-agnostic tablets, sequenced multi-stage village upgrade, stage-equipped warriors, dispatched bodyguards, three-spell loadout with mouse + mana, rival god with tiny AI tree, melee + bolt combat, mana-gated casts with movement regen. Enemy warriors and populated battles are now covered by the active mission above.
- **Phase 4 (multiplayer, portal omniverse):** single-player portal mechanics are now in the active mission above (phase 7). True multiplayer still deferred.
- **Phase 5 (polish):** sound engine has eight spatial systems shipped; Sky Baby sample integration is still procedural-only.

### File structure (current)

```
src/
  main.js
  core/Constants.js, EventBus.js
  world/
    WorldGenerator.js   WorldRenderer.js   TileTypes.js
    GridSimulator.js    PortalHenge.js     Critters.js
    FoliageRenderer.js  ParticleEngine.js  MossLayer.js
    BiomeFlora.js       AssetVariants.js   WeatherSystem.js
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
    Grounding.js
public/sounds/          (28 OGG; sky/fire/earth/sea x7 each)
SOAR/                   (Sky Baby reference source — read, don't modify)
```

## Last session: what shipped before the mission started

Eight backlog items committed and pushed in priority order; live deploy is current.

- **Circular minimap with live grid updates.** `src/ui/Minimap.js` projects the world onto a disc. Pre-baked inverse projection lookup makes each refresh a single ImageData write. Refreshes from the live grid every 250 ms so dug terrain, lava flow, and water erosion all show through. Markers projected via shared forward helper.
- **Tablet glow effect.** `src/civilisation/Tablet.js` rebuilt with five additive aura layers per tablet: outer halo, inner halo, vertical godray shaft, five orbiting motes on a squashed orbit, hovering glyph pip. Proximity reactivity swells the inner halo and pip when the god is within ~2.5 tiles.
- **Coherent village upgrade gate.** `God.tablets` is a count map; `Village.nextRequiredTablet` gates acceptance. New `src/ui/TabletInventory.js` widget renders one slot per stage with a gold ring on the slot the nearest village wants next.
- **Camera shake + time dilation juice pass.** `addJuice(severity)` helper with light/medium/heavy/severe presets. This is the scaffold the AAA camera upgrade in phase 3 builds on.
- **Visible warrior upgrades + bodyguards.** `src/civilisation/Warrior.js` defines per-stage procedural sprites. `src/civilisation/Bodyguard.js` is a physics-driven escort, max three, dispatched from villages with belief ≥ 60.
- **Spell system + mouse controls.** `src/spells/Spell.js` defines Bolt, Place, Geas. `SpellBook` gates by total tablets ever collected. Phase 6 extends this.
- **Rival god + combat values.** `src/combat/Combat.js` is the single tunable table. `EnemyGod.js` is a WANDER → SEEK → ENGAGE → FLEE state machine. Phase 7 adds AI invasion orchestration around this.
- **Enemy god mana pool + universal grounding + wider tunnels + more flora/fauna.** All shipped as subsequent commits. See `git log`.

## Backlog (deferred, may fold into mission phases)

- **Web Worker for the falling-sand sim.** Currently runs on the main thread. Phase 2 was supposed to push it into a worker. Becomes visible at higher particle counts.
- **Sky Baby sample integration for sound.** Procedural sound bus works; what's missing is layering real samples over the procedural foundation with element-driven filter envelopes.
- **Delete `src/world/ParallaxForeground.js`** or repurpose as a back-of-camera foliage band; right now it's unused dead code.
- **Population dynamics balance pass.** Belief growth and decline curves are placeholder.
- **Biome bands within a world.** Horizontal partition into 3-5 biomes with their own tile tinting, vegetation density, cave frequency, particle emphasis.

## Architectural notes

- **Module communication** runs through `core/EventBus.js` or shared scene state. Direct cross-module imports are a smell. Combat is the main exception: `EnemyGod.takeDamage` is called directly from `Spell.cast` and `Bodyguard.update`. Fine for v1.
- **Combat tuning** lives in `src/combat/Combat.js`. Single source of truth: HP, damage, cooldowns, ranges, flee thresholds. Tweak there, not at call sites.
- **Particle sim** lives in `src/world/GridSimulator.js`. Update is bottom-to-top with alternating x-direction per generation. The moved-flag `Uint8Array` is the ground truth. Don't add new tile interactions without reading the existing `updateWater` / `updateSand` / `updateLava`; the connected-body check is what stops the wobble bug from coming back.
- **Minimap** is a circular projection rebuilt from a pre-baked inverse lookup. Re-renders from the live grid every 250 ms. At 8x world size, may need throttling or coarser resolution.
- **Tablet system** is persistent and level-agnostic. `god.highestTablet` is a single integer that only ever increments. A village at stage N needs the level N tablet. A single walk-in chains every upgrade the player's collection allows.
- **Spell system** lives in `src/spells/`. Spells are dumb objects with one `cast(scene, x, y)` method; the `SpellBook` owns the active selection and cooldowns. Adding a new spell: define a class in `Spell.js`, register it in `SpellBook.allSpells`, append to `UNLOCK_ORDER`.
- **Bodyguards** dispatched via `WorldScene._updateBodyguards` on a 1s timer; max three escorts. Phase 5 introduces the broader warrior AI roles that will likely sit alongside Bodyguard rather than replacing it.
- **Sky** is anchored to the viewport (`scrollFactor 0`) with manual `tilePositionX/Y` driven by camera scroll. Do not put sky tileSprites in world space.
- **Grounding** is centralised in `src/utils/Grounding.js` (`findGroundTileY`). At 8x world size, bump `maxWalk` if needed.
- **Mana** is a per-frame regen tied to actual god displacement. `god.maxMana = 3`, regen 3/120 per second when moving, drained 1 per spell cast. Sky Baby spells need their costs scaled down from Sky Baby's 40-80 per cast to Godstone's 1-3 economy.
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

For every phase:

1. `npm run build` must stay clean.
2. Reload the preview at `localhost:3000`. Drive the game through `window.__godstone` if you need to skip menus.
3. Capture a screenshot via the preview tools and check the visible result against the acceptance criteria.
4. Only mark complete when the screenshot proves it.
5. Commit with a clear message ending in the Co-Authored-By line, then push to `origin main`.

## Working principles (non-negotiable)

- **Sound design is sacred.** Emergent randomisation within parameters. Static loops are unacceptable.
- **Digging in all directions** is critical QoL. Any world gen change must preserve escape routes.
- **Tablets are persistent** and never consumed.
- **Read `GODSTONE-game-design-spec.md`** before working on any new system.
- **Check memory files** in `.claude/projects/.../memory/` for accumulated feedback.
- **Push to GitHub** after each major batch so work is backed up.
- `slumbr/` is gitignored reference material (Mike's ambient sound engine). Don't delete it.
- `SOAR/` is Sky Baby reference source — read it as often as needed, do not modify it.
