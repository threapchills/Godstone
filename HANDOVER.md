# Godstone handover: session 2 to session 3

## Where we are

Phase 1 is complete and deployed. The game is live at https://threapchills.github.io/Godstone/ and deploys via GitHub Actions on push to main.

### What was built in sessions 1-2

**Session 1** laid the foundation: world gen, god movement, villages, tablets, minimap, day/night, critters, parallax sky, vegetation.

**Session 2** delivered eight prioritised fixes plus sound:

1. **Controls overhaul** — Up/W = jump (with coyote time), Space = fly/flap (jetpack feel with cooldown + sustained lift). Previously Space was jump.
2. **Directional digging** — dig in all four directions. Down + horizontal = diagonal dig. Up digs ceiling. Auto-dig walls when walking into them, ceilings when flying upward. Rescue mechanic clears surrounding tiles if fully boxed in. This was a critical QoL fix; Mike was constantly getting stuck underground.
3. **Seamless world wrap** — tilemap extended with `WRAP_PAD` mirrored columns on each side. Dig operations sync both the main tile and its mirrored padding copy. Physics bounds extended to cover padding. No visible seam.
4. **Modular procedural god sprites** — `src/god/GodRenderer.js` (~350 lines). 8 head variants (serpent, ram, fish, jellyfish, eagle, moth, deer, rabbit), element-driven palettes, texture overlays (scales, wet sheen, feathers, bark), accessories (flame wisps, fins, wings, vine tendrils). All drawn pixel-by-pixel on a 24x32 canvas with per-pixel noise for a hand-pixeled feel.
5. **Ambient sound engine** — `src/sound/AmbienceEngine.js` (~300 lines), derived from Slumbr (slumbr.mikewhyle.com). Four elemental channels (air=sky*.ogg, fire=fire*.ogg, earth=earth*.ogg, water=sea*.ogg), each with A/B pair crossfading, stereo panner with slow LFO, RMS pregain normalisation. Master chain: gain > 3-band EQ > compressor/limiter. Game state drives modulation: `setTimeOfDay(t)` swells fire/air during day and water/earth at night; `setDepth(d)` darkens EQ underground. Sound files (28 OGG) live in `public/sounds/`, copied from the Slumbr source in `slumbr/` (gitignored).
6. **GitHub Pages deployment** — workflow at `.github/workflows/deploy.yml`. Repo Settings > Pages > Source must be set to "GitHub Actions" (not "Deploy from a branch").

### Current file structure

```
src/
  main.js                    # Phaser config, scene registration
  core/Constants.js          # WORLD_WIDTH=600, WORLD_HEIGHT=300, TILE_SIZE=8, GAME_WIDTH=960, GAME_HEIGHT=640
  core/EventBus.js           # Cross-module event emitter (unused so far)
  world/
    WorldGenerator.js        # Terrain from element pair + sliders + seed
    WorldRenderer.js         # Tileset texture gen, tilemap with WRAP_PAD
    TileTypes.js             # 28 tile IDs, solid/liquid sets, buildPalette()
    PortalHenge.js           # Visual stonehenge (Phase 4 logic)
    Critters.js              # Ambient wildlife manager (~15-25 sprites)
  god/
    God.js                   # Movement, digging, swimming, tablet collection
    GodRenderer.js           # Procedural god sprite generation
  civilisation/
    Village.js               # Belief, stages, tablet reception
    Tablet.js                # Underground collectible with glow
  scenes/
    CreationScene.js         # Element/slider selection
    WorldScene.js            # Main gameplay; wires everything together
  ui/
    Minimap.js               # Corner minimap
    ParallaxSky.js           # Layered sky background
  sound/
    AmbienceEngine.js        # Slumbr-derived ambient engine
public/
  sounds/                    # 28 OGG files (sky1-7, fire1-7, earth1-7, sea1-7)
slumbr/                      # Slumbr source (gitignored, reference only)
```

### Key architecture patterns

- **Seeded PRNG everywhere:** `mulberry32(seed + offset)` for reproducible placement/selection.
- **Element-driven palettes:** `buildPalette(el1, el2, ratio)` in TileTypes.js returns `{ [tileId]: hexColour, skyColour }`. Everything visual derives from the element pair.
- **Lightweight entities:** Critters and existing particles use plain objects + `scene.add.circle()`/`scene.add.sprite()` + tweens. No Phaser physics bodies for cosmetic elements.
- **Depth layering:** tiles=0, critters=4, particles/effects=5-11, god=10, HUD=40-60.
- **World wrapping:** tilemap has `WRAP_PAD` mirror columns. Digging syncs mirrors. God position wraps in WorldScene.update(). Use `((tileX % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH` for any tile lookup.
- **Sound engine expansion:** AmbienceEngine is designed for additional layers (biome, critter, village, battle, movement sounds) all sharing the same AudioContext and master chain. The "emergent randomisation within parameters" philosophy is non-negotiable; see memory file `feedback_sound_design.md`.

### Existing particle code (in God.js)

Two small implementations already work and establish the pattern:

- **`spawnFlapEffect()`** (God.js ~line 182): 4 grey circles below god, tween fade+shrink over 300-500ms.
- **`spawnDebris()`** (God.js ~line 241): 4 tan circles at dig site, tween scatter+fade over 300-450ms.

Both use `scene.add.circle()` + `scene.tweens.add()` with `onComplete: () => particle.destroy()`. This works but creates/destroys objects every frame; the new particle engine should use an object pool instead.

---

## What to build next

### Step 1: Cosmetic particle layer

**File:** `src/world/ParticleEngine.js` (new)
**Wired into:** `WorldScene.buildWorld()` (create) and `WorldScene.update()` (tick)

#### Design

A single `ParticleEngine` class managing a pool of ~80-120 lightweight particles. No physics bodies. Each particle is a `scene.add.circle()` or `scene.add.rectangle()` with manual position/alpha updates each frame.

**Particle object shape:**
```javascript
{
  sprite: Phaser.GameObjects.Arc,  // or Rectangle
  x, y: number,                    // world position
  vx, vy: number,                  // velocity (pixels/sec)
  life: number,                    // remaining life (ms)
  maxLife: number,                 // for alpha calculation
  colour: number,                  // hex colour
  size: number,                    // radius or side length
  type: string,                    // 'ember', 'leaf', 'mist', etc.
}
```

**Pool mechanics:**
- Pre-allocate all particle sprites on creation, set visible=false.
- `spawn()` grabs a dead particle, resets its properties, sets visible=true.
- `update(delta)` iterates the pool; moves, fades, and kills expired particles.
- No `destroy()`/`new` during gameplay; zero GC pressure.

**Particle types by element:**

| Element | Surface types | Underground types |
|---------|--------------|-------------------|
| Fire | embers (rise, flicker orange-red), smoke wisps (drift, grey), heat shimmer (subtle wave) | magma sparks near lava tiles |
| Water | spray mist (near water surfaces, blue-white), rain (if dominant), foam dots | drip particles near ceiling water |
| Air | wind-blown leaves/seeds (lateral drift), cloud wisps, dandelion fluff | dust motes (slow float) |
| Earth | pollen/spores (drift upward, yellow-green), kicked-up dust near surface | fungal spores (near mushroom tiles), fireflies at night |

**Context sensitivity:**
- **Element pair** determines which types spawn and in what ratio (dominant element gets ~60% of spawns).
- **Surface vs underground:** check god's tileY vs surface height. Underground = motes/sparks/drips; surface = wind/leaves/embers.
- **Time of day:** fireflies only at night (dayTime > 0.5). Heat shimmer only during day.
- **Local tiles:** scan a small area around viewport edges for water/lava tiles; spawn spray/sparks near them.
- **Wind:** gentle horizontal drift matching the dominant element's bias. Fire = upward thermals. Water = lateral gusts. Air = strong lateral. Earth = gentle upward.

**Spawn logic:**
- Each frame, roll a spawn chance (~2-4 particles per second).
- Pick a random position along the viewport edges (so particles drift through view).
- For local tile-reactive particles, scan a column of tiles at viewport edge and spawn near matching tiles.

**Integration:**
```javascript
// In WorldScene.buildWorld(), after critters:
this.particles = new ParticleEngine(this, params, this.worldGrid, worldData.surfaceHeights)

// In WorldScene.update():
if (this.particles) {
  this.particles.update(delta, this.god.sprite, this.dayTime)
}

// In WorldScene.shutdown():
if (this.particles) { this.particles.destroy(); this.particles = null }
```

**Depth:** particles at depth 5-6 (behind god, in front of critters). Some types (fireflies, embers) at depth 11 (in front of god) for atmosphere.

#### Colours

Pull from the existing palette via `buildPalette()`. Ember colours from the fire palette's lava/accent tones. Leaf colours from earth palette's vegetation tones. Mist from water palette's liquid tones. This keeps everything visually coherent with the world.

---

### Step 2: Biome system

After particles are working. Distinct zones within each world (e.g., volcanic region near fire-heavy areas, lush forest in earth zones, frozen tundra, coral coast). This means:

- Modify `WorldGenerator.js` to partition the world horizontally into 3-5 biome bands.
- Each biome has its own tile colour tinting, vegetation density, cave frequency, and particle emphasis.
- Add more vertical shafts and cave-to-surface connections (addresses the "getting stuck" feedback).
- Potentially increase world size (currently 600x300; could go 800x400 or larger).

### Step 3: Full falling-sand simulation (Phase 2)

The big technical lift. WebGL compute or canvas-based cellular automata in a Web Worker. Water flows downhill, lava burns vegetation, sand cascades. This is the Noita-like core. The cosmetic particle layer built in Step 1 becomes the visual complement to the simulation particles.

---

## Important context for the next session

- **Mike is creative director, not a developer.** Propose one step, wait for approval, then build. Don't bundle multiple actions.
- **British English** throughout code and UI. Colour, defence, favour.
- **No em dashes** anywhere. Use semicolons, colons, en dashes with spaces, or hyphens.
- **Sound design is sacred.** The "emergent randomisation within parameters" philosophy applies to everything. Static loops are unacceptable.
- **Digging in all directions** is critical QoL. Any world gen changes must preserve escape routes.
- **Read GODSTONE-game-design-spec.md** before working on any new system. It's the authoritative GDD.
- **Read CLAUDE.md** for architecture overview and conventions.
- **Check memory files** in `.claude/projects/.../memory/` for accumulated feedback and project context.
- **Push to GitHub** periodically for backup. The deploy workflow handles GitHub Pages automatically.
- The `slumbr/` directory is gitignored reference material (Mike's ambient sound engine). Don't delete it.
- Existing particles in God.js (flap effect, dig debris) can stay as-is for now; they're small and localised. The new ParticleEngine handles the ambient world particles.
