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

### Status: phases 1-8 shipped + session 9 fixes

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

### Session 9 details (2026-04-11)

**Loading screen:**
- New `BootScene` with atmospheric dark UI: GODSTONE title, progress bar, cycling gameplay tips, floating motes, drifting cloud/mountain backdrop. Fades into CreationScene.
- WorldScene loading screen upgraded: animated spinning dots, element pair display, dark overlay; fades out when world generation completes.
- CreationScene no longer re-loads assets already cached by BootScene.

**Tablet delivery fix:**
- Root cause: `maxStage = highestTablet + 1` was advancing villages one stage beyond the god's tablet count. Now correctly `maxStage = highestTablet`.
- Added 2s cooldown after delivery completes so the overlap zone doesn't fire a rejection message while the god is still standing in the trigger area.

**Trigger area repositioning:**
- Village interaction zones now sync to average building y-position each frame, so they fall with buildings after particle physics erosion.
- Village labels and belief bars reposition to match building locations.
- PortalHenge `worldX`/`worldY` getters now return sprite position instead of stale tile coordinates, so interaction radius tracks the actual portal after grounding.

**Outbound raid world overhaul:**
- Tablet delivery to enemy villages blocked (team check).
- Village assault mechanic: home-team combatants near an enemy village drain its population (~4 pop per raider per tick; god presence counts as 5 raiders). Belief also erodes under assault.
- Enemy villages now spawn defenders periodically (1-3 per village per tick, stage-weighted).
- Raid cycle activates immediately on entering raid world.

**Population and growth:**
- MAX_VISIBLE_VILLAGERS: 50 → 80 (bustling late-game settlements).
- BASE_GROWTH_RATE: 0.9 → 1.6 (visible population swell within a minute of proximity).

**Flora generation overhaul:**
- Fertility multiplier tripled for trees (0.06 → 0.18 per fertility unit), doubled for bushes (0.08 → 0.16), boosted for grass (0.15 → 0.25).
- `sparseDense` slider now contributes secondary density bonus to vegetation.
- BiomeFlora hard cap scales with fertility: 300 (barren) to 700 (fertile).
- Per-biome density now multiplied by `fertilityMul = 0.5 + fertility * 1.0`.
- Mushroom underground rates boosted (0.005 + f*0.01 → 0.008 + f*0.025).

**Updated assets:**
- Procedural god body parts: fire_bodies 1-9 (optimised), water_legs 1-9 (optimised).

### Known follow-ups for the next session

- **FULL GRAPHICS OVERHAUL (priority).** Replace all procedural pixel-art with storybook illustration assets. The goal: eliminate the blocky Minecraft aesthetic entirely. Every visual element should use a dedicated sprite from `public/assets/storybook_overhaul/`. Key principles:
  - **Use ALL assets** in the storybook_overhaul folder; nothing should go unused
  - **Procedural hue shifts** depending on world element settings (fire=warm, water=cool, etc.) so the same sprite reads differently per biome
  - **Modular architecture** so new sprites can be dropped in and picked up automatically; more assets are coming
  - **Asset mapping** (what replaces what):
    - Terrain tiles: grass_block, dirt_block, cave_block, lava_block, desert_block, snow_block, deep_water, water_surface, grass_ledge_left/right → replace canvas-drawn tileset
    - Trees/flora: tree_ancient, pine_tree, dead_tree, bushes, giant_mushrooms, stalactite, mossy_boulder, rocks, giant_crystals → replace procedural FoliageRenderer and BiomeFlora sprites
    - Structures: teepee, fireplace, chest, loot_crate, totem, signpost, stone_altar, wooden_bridge, dungeon_door, canoe, wooden_barrel, anvil → replace canvas-drawn Village buildings
    - Villagers: villager_1-4 → replace WanderingWarrior procedural sprites
    - Warriors: warrior_base → replace CombatUnit procedural sprites
    - Critters: stag_deer, bear, eagle, aquatic_fish, pig, pet_cloud → replace canvas-drawn Critter sprites
    - NPCs: traveling_merchant, royal_character, hooded_mystic, elemental_spirit, undead_warrior → new NPC types for villages/encounters
    - Spells: fireball_spell, lightning_bolt, icicle_projectile, heal_aura, shield_bubble, magic_runes, star_particles, boulder_projectile, sword_slash, dark_smoke → replace procedural spell visuals
    - Projectiles: arrow_projectile → replace canvas-drawn Arrow sprite
    - Background: distant_mountains, fluffy_clouds (already used in Boot/Creation scenes)
    - God parts: procedural_gods/ heads/bodies/legs (already integrated via GodCompositor)
  - **God creation system already done** (GodCompositor + GodCreationScene). Pattern to follow for other systems.
  - Combat system overhaul also shipped this session (stage-calibrated arrows, touch-kills, gnarly blood, resurrection gating).
- **HUD scaling under camera zoom.** A dedicated Phaser UI camera would fix this properly.
- **Tablet inventory widget** still shows 7 slots. Should expand dynamically.
- **Rain rate** tuned for visual presence; Mike may want to adjust.

## Where we are (pre-mission state)

- **Phase 1 (world, god, villages, tablets):** complete. Live at https://threapchills.github.io/Godstone/.
- **Phase 2 (interactive particle simulation):** core falling-sand loop is in place. `world/GridSimulator.js` runs water / sand / lava on a moved-flag generation tracker with alternating scan; lava + water reactions emit hiss/steam events that the sound engine plays back. Still on the main thread; the planned Web Worker move is unfinished.
- **Phase 3 (full single-player loop):** core systems shipped. Persistent level-agnostic tablets, sequenced multi-stage village upgrade, stage-equipped warriors, dispatched bodyguards, three-spell loadout with mouse + mana, rival god with tiny AI tree, melee + bolt combat, mana-gated casts with movement regen.
- **Phase 4 (multiplayer, portal omniverse):** single-player portal mechanics shipped. True multiplayer still deferred.
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
    CombatUnit.js       Arrow.js
    WarDirector.js
  combat/
    Combat.js           EnemyGod.js
  spells/
    Spell.js            SpellBook.js
  scenes/
    BootScene.js        CreationScene.js    WorldScene.js
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

- **Circular minimap with live grid updates.** `src/ui/Minimap.js` projects the world onto a disc.
- **Tablet glow effect.** `src/civilisation/Tablet.js` rebuilt with five additive aura layers.
- **Coherent village upgrade gate.** `God.tablets` is a count map; `Village.nextRequiredTablet` gates acceptance.
- **Camera shake + time dilation juice pass.** `addJuice(severity)` helper with light/medium/heavy/severe presets.
- **Visible warrior upgrades + bodyguards.** Per-stage procedural sprites, physics-driven escorts.
- **Spell system + mouse controls.** Bolt, Place, Geas. SpellBook gates by total tablets.
- **Rival god + combat values.** WANDER → SEEK → ENGAGE → FLEE state machine.
- **Enemy god mana pool + universal grounding + wider tunnels + more flora/fauna.**

## Backlog (deferred, may fold into mission phases)

- **Web Worker for the falling-sand sim.** Currently runs on the main thread. Phase 2 was supposed to push it into a worker.
- **Sky Baby sample integration for sound.** Procedural sound bus works; what's missing is layering real samples over the procedural foundation.
- **Delete `src/world/ParallaxForeground.js`** or repurpose; unused dead code.
- **Biome bands within a world.** Horizontal partition into 3-5 biomes with their own tinting, vegetation density, cave frequency.

## Architectural notes

- **Module communication** runs through `core/EventBus.js` or shared scene state. Direct cross-module imports are a smell.
- **Combat tuning** lives in `src/combat/Combat.js`. Single source of truth: HP, damage, cooldowns, ranges, flee thresholds.
- **Particle sim** lives in `src/world/GridSimulator.js`. Bottom-to-top update with alternating x-direction.
- **Minimap** is a circular projection rebuilt from a pre-baked inverse lookup. Re-renders from the live grid every 250 ms.
- **Tablet system** is persistent and level-agnostic. `god.highestTablet` is a single integer that only ever increments.
- **Spell system** lives in `src/spells/`. Spells have `cast(scene, x, y)` method; SpellBook owns selection and cooldowns.
- **Bodyguards** dispatched via `WorldScene._updateBodyguards` on a 1s timer; max three escorts.
- **Sky** is anchored to viewport (`scrollFactor 0`) with manual `tilePositionX/Y` driven by camera scroll.
- **Grounding** is centralised in `src/utils/Grounding.js` (`findGroundTileY`).
- **Mana** is per-frame regen tied to god displacement. `god.maxMana = 3`, regen 3/120 per second when moving, drained 1 per spell cast.
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
- **British English** in code, comments, and UI. No em dashes. Sentence case for headings.

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
