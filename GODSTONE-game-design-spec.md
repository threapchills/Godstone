# GODSTONE: Game design specification

**Version**: 0.1 (Living document)
**Status**: Vision and systems outline. All details are provisional; nothing is set in stone until it feels fun to play.
**Author**: Mike Whyle, with design assist from Claude

---

## 1. Vision statement

A pixel-art god game where you shape a procedurally generated world, enter it as a demi-human deity, and guide primitive humanoid civilisations from cave-dwelling to greatness; all while defending against (and raiding) the worlds of other gods through an interconnected omniverse.

Terraria's exploration and crafted pixel worlds. Noita's living particle simulation. Black & White's divine influence and moral tension. Populous 3's godly combat and spell-casting. Sons of Valhalla's proximity-based command system. Magic: The Gathering's colour-wheel balance philosophy. A kaleidoscope of simple modular parts yielding infinite emergent possibility.

### Core experience pillars

- **Contemplative solo play**: long stretches of atmospheric exploration, discovery, and world-tending
- **Sharp multiplayer raids**: short, intense PvP skirmishes measured in minutes, not hours
- **Meaningful emergence**: simple rules producing complex, surprising, personal outcomes
- **Generative everything**: world, god, species, flora, fauna, and sound, all derived from a handful of player-set parameters

---

## 2. World generation

### 2.1 The creation screen

The player configures their world through a compact set of sliders on a single screen. These parameters determine everything: the world's terrain, biomes, flora, fauna, humanoid species, the god's appearance and abilities, the spell loadout, and the ambient soundscape.

**Elemental selection (primary input)**

Choose exactly **two of four elements**: fire, water, air, earth. This yields six possible pairings:

| Pair | Shorthand |
|---|---|
| Fire + Water | Steam / Volcanic Archipelago |
| Fire + Earth | Magma / Forge |
| Fire + Air | Inferno / Scorched Peaks |
| Water + Earth | Deep Sea / Subterranean Rivers |
| Water + Air | Storm / Floating Reef |
| Earth + Air | Mountain / Plateau |

**Elemental ratio slider**: 10 points distributed freely between the two chosen elements. A 5/5 split produces a balanced hybrid; a 9/1 produces a dominant element with a trace of the secondary.

**Three terrain sliders (independent of element choice)**:

| Slider | Low end | High end | Strategic implication |
|---|---|---|---|
| Sky - Cave | Most terrain underground | Most terrain in atmosphere / floating | Determines vertical distribution of world mass; affects where tablets hide and how traversal works |
| Barren - Fertile | Sparse resources, fewer critters, slower population growth | Rich ecosystems, abundant fauna (including predators), faster population growth | Trade-off between development speed and environmental danger |
| Sparse - Dense | Open terrain, high visibility, easy traversal for both player and invaders | Labyrinthine terrain, slow exploration, but equally difficult for raiders to navigate | Simultaneous PvE/PvP difficulty dial |

**Element terrain signatures**:

- Fire: lava, volcanic rock, scorched surfaces, magma chambers at depth
- Water: oceans, rivers, flooded caves, coral, underwater passages
- Air: plains, mountaintops, exposed ridgelines, open sky
- Earth: dense soil, stone, deep caverns, mineral deposits, root networks

The interaction between elemental pair and terrain sliders produces edge cases that are features, not bugs. A fire-air world set to cave-heavy becomes a thin layer of scorched plains above vast volcanic cavern networks. A water-earth world set to sky-heavy is a paradox that the procedural generator must resolve creatively; perhaps suspended lake-islands over deep canyons.

### 2.2 World structure

- **Wrapped horizontally**: exiting the left edge returns you from the right, creating a sense of spherical surface in pixel-art flatland
- **Layered vertically**: from atmosphere at the top to planetary core at the bottom, with distinct biome layers determined by the elemental and terrain parameters
- **Scale**: Terraria-small for initial build. A god traversing at comfortable pace should wrap around the world in a few minutes ignoring obstacles. Larger world sizes are a future expansion, not a launch concern
- **One portal henge per world**: a Stonehenge-like structure; the sole entry and exit point for omniverse travel

### 2.3 Procedural content

Every world generates unique:

- **Biomes**: distribution and character derived from element pair, ratio, and terrain sliders
- **Flora**: plant life appropriate to biomes; functional (food, materials, obstacles) not just decorative
- **Fauna**: critters ranging from ambient wildlife to genuine threats; can kill travellers moving between villages
- **Humanoid species**: one dominant species per world, appearance and traits derived from element pair (merfolk for water-heavy, birdfolk for air-heavy, lizardfolk for fire-heavy, etc.)
- **Soundscape**: generative ambient audio built from modular components; each world should sound as unique as it looks (see section 8)

**Balance constraint**: no world should ever feel like the player was cheated. Every world is equally beautiful and equally dangerous, expressed differently. This is a hard design requirement that the procedural generation must satisfy.

---

## 3. The god

### 3.1 Generation

The god's appearance, species, and abilities are derived from the same world-creation parameters. A water-air world produces a merfolk or bird-hybrid god. A fire-earth world produces a magma-scaled or stone-armoured god. The god is procedurally generated to match the world it inhabits.

### 3.2 Abilities

All gods can perform all physical actions (digging, building, flying, swimming, combat) but with varying proficiency based on their elemental alignment:

- A sky/air god excels at flight
- An earth god excels at digging
- A water god excels at swimming
- A fire god excels at... (open question: combat damage? terrain destruction? speed on hot surfaces?)

Gods can traverse any world with equal finesse regardless of element mismatch. The debuffs for elemental mismatch apply to the humanoid units, not the god.

### 3.3 Mortality and resurrection

- Gods can be killed in combat (PvE or PvP)
- As long as the god has living believers anywhere on their world, the god resurrects after a cooldown period, with a mana penalty
- Resurrection is itself a spectacle that generates belief in any nearby villagers
- Strategic dying near a wavering village is a theoretically valid tactic, but the mechanics should generally disincentivise death
- If a god has zero believers (all villages captured or destroyed), death is permanent for that world. The player keeps the god template and can generate a new world with identical element settings but a fresh seed, or start entirely from scratch

### 3.4 Spells

Each god has access to **three spells**, unlocked progressively:

- **Spell 1**: available from the start
- **Spell 2**: unlocked by claiming the god's first golden statue (first PvP victory)
- **Spell 3**: unlocked by claiming the god's second golden statue
- **Subsequent statues**: boost all three spells on a pre-set power scale

Spell assignment is determined by the elemental ratio:

- **Dominant element (higher ratio)**: contributes 2 spells
- **Secondary element (lower ratio)**: contributes 1 spell
- **Equal split (5/5)**: 1 spell from each element + 1 hybrid spell unique to that element pair

**Open design questions**:

- How large should the spell pool per element be? (Suggested starting point: 3-4 per element, 2-3 hybrids per pair, yielding ~25-35 total spells)
- Does the specific ratio value affect which spells from the pool the player receives, or just how many per element?
- Should players have any agency in spell selection, or is it purely derived from parameters?
- Specific spell effects: entirely to be designed. Should feel mythological, elemental, and visually spectacular in pixel art
- Balance across all element pair and ratio combinations: critical, requires extensive playtesting

---

## 4. Civilisation

### 4.1 Villages

- Multiple villages per world, placed procedurally
- Each village is an autonomous entity with its own population, belief level, and civilisational stage
- Villages develop independently unless the god intervenes

### 4.2 Population and units

Four unit types per village:

| Unit | Role | Evolution |
|---|---|---|
| Male hunter-gatherer | Resource gathering, becomes farmer at later stages | Stat buffs per civilisational stage |
| Female hunter-gatherer | Resource gathering, becomes farmer at later stages | Stat buffs per civilisational stage |
| Male warrior | Combat, defence, raiding | Stronger weapons and armour per stage |
| Female warrior | Combat, defence, raiding | Stronger weapons and armour per stage |

- Male and female units have identical stats
- Both genders required for population reproduction; losing too many of either cripples growth
- Population cap increases with each civilisational stage
- Population growth rate accelerates with each stage
- Population dynamics are a crucial strategic resource for PvP; a god who develops all villages has more warriors to draw on, but this takes longer than rushing a single village

**Open design questions**:

- Exact population caps and growth rates per stage
- Food/resource requirements for population growth
- What determines the ratio of hunter-gatherers to warriors in a village? Player choice? Automatic? Configurable?

### 4.3 The seven civilisational stages

Progression from primitive to advanced, unlocked by ancient tablets found during vertical exploration of the world:

| Stage | Suggested theme | Visual signature |
|---|---|---|
| 1. Cave dwellers | Shelter, survival | Natural caves, campfires |
| 2. Fire-makers | Cooking, warmth, tool-hardening | Primitive huts, fire pits |
| 3. Farmers | Agriculture, animal domestication | Tilled fields, granaries |
| 4. Small village | Pottery, weaving, early trade | Clustered dwellings, workshops |
| 5. Large village | Stonework, fortification | Walls, watchtowers, paved paths |
| 6. Town | Writing, record-keeping, governance | Multi-storey buildings, archives, temples |
| 7. Civilisation | Monumental architecture, organised military | Grand structures, the aesthetic remains ancient/fantasy-coded, never sci-fi |

- Visual appearance of structures is further modified by the world's elemental parameters (even if only at the pixel hue level for personalisation)
- Each stage produces stronger warriors with better weaponry
- The progression should feel mythologically grounded: gods teaching humanity the arts of civilisation, drawn from ancient myths across cultures (Prometheus bringing fire, Enki teaching writing, Osiris teaching agriculture, etc.)

**Open design questions**:

- Exact stat buffs per stage
- What each tablet specifically teaches (mapped to which stage)
- Are there prerequisites beyond the tablet? (e.g., does a village need a certain population before it can advance?)
- Can a village regress if damaged by raiders?

### 4.4 Knowledge transfer

- When a god finds a tablet, they must **physically travel** to each village to deliver the knowledge. No menu clicks; the god walks (or flies, swims, digs) there.
- At each village, the god issues the upgrade command vocally (Sons of Valhalla style: "God has spoken!")
- If the god carries multiple undelivered tablets, all accumulated knowledge transfers on arrival at each new village
- Villages will eventually send travellers to spread knowledge between themselves organically, but this is slow and travellers can be killed by critters en route
- A hostile biome between two villages can naturally isolate one from knowledge transfer, creating emergent strategic terrain

**The strategic tension**: thoroughness vs speed. Upgrading every village gives you maximum military resources but takes time. Rushing the village nearest the portal gets you battle-ready faster but with a smaller force. The wrapped world and procedural terrain create natural shortcuts and obstacles that reward spatial awareness.

---

## 5. Belief system

### 5.1 Generating belief

- **Passive**: a god's physical presence near a village generates belief over time
- **Active**: performing helpful acts (clearing land for expansion, killing threatening critters, casting beneficial spells) generates belief faster
- **Spectacular**: resurrection near a village generates a belief burst
- Belief is per-village, not global

### 5.2 Losing belief

- **Absence**: belief decays if the god is away for extended periods
- **Failure**: failing to protect a village from threats (critter attacks, raider incursions)
- **Terror**: an invading god can attempt to sway belief through fear (spells, destruction, displays of power)

### 5.3 Consequences

- A village with high belief produces loyal warriors, follows commands readily, and resists enemy god influence
- A village with low belief is vulnerable to capture by any god (including invaders)
- A village with zero belief effectively becomes neutral or hostile territory
- If all villages reach zero belief in the home god, the god has no believers and permanent death becomes possible

**Open design questions**:

- Exact belief generation and decay rates
- Can belief be restored to a captured village, or is capture permanent?
- Should there be a visual indicator of belief level (e.g., village decorations, offerings at a shrine)?
- The fear vs love axis: is this a binary spectrum (Black & White style) or something more nuanced?

---

## 6. The omniverse and PvP

### 6.1 Portal mechanics (Option C architecture)

Each world has one portal henge. The portal system works as follows:

1. **The attacking god dials a world seed** on their portal using arcane runes, creating an outbound connection
2. **The defender's portal temporarily recalibrates** to point back to the attacker's world for the duration of the incursion
3. This creates a **two-way link for the duration of the skirmish only**
4. When the incursion ends (attacker returns home, or a timeout), the link dissolves
5. **Critical risk for the attacker**: while raiding, your own portal points back at you. The defender (or their warriors) can counter-invade your undefended home world

This architecture naturally limits PvP to short, intense exchanges. It creates genuine cost to aggression (your own world becomes vulnerable while you're away). It rewards defenders with a retaliation window. And it dissolves cleanly, preventing permanent unwanted links.

### 6.2 Multiplayer vs single player portals

- **Single player**: the portal generates a procedurally created AI-governed world with an AI-controlled god. Identical mechanics; the only difference is what's on the other side
- **Multiplayer**: the portal connects to another player's living world. Matchmaking pairs gods whose civilisations and populations are at similar levels
- **Sealed Universe mode**: new players are warned to set their first world to Sealed Universe (no PvP invasions) to learn the systems safely

### 6.3 PvP combat flow

1. Attacker dials seed, enters portal with any warriors they've mustered
2. Attacker arrives in defender's world, near the defender's portal henge
3. Skirmish plays out: god-on-god combat, spell-casting, warrior clashes
4. Defender's portal simultaneously opens to attacker's home world
5. Resolution in minutes, not hours
6. Victor either retreats with spoils or presses advantage

### 6.4 Victory conditions and spoils

- **Killing the defending god**: buys time to sway villages while the defender is in resurrection cooldown
- **Capturing villages**: possible if village belief in their god is already low; achieved through divine presence, spells, or violence
- **Total conquest**: if all villages are captured and the defending god dies with zero believers, they are ejected from that world permanently
- **Golden statues**: successfully defeating another god earns a golden statue to carry home. This buffs the victorious god's spell power. Statues are one-off; they cannot be re-stolen (prevents infinite accumulation cascades)

### 6.5 God commands to villages

Gods issue commands by physically travelling to a village and speaking (proximity-based, Sons of Valhalla style). Available commands:

- **Expand**: village focuses on growth and construction
- **Guard**: warriors defend the village and surrounding area
- **Raid**: warriors independently travel through the portal to raid other worlds

Warriors operate autonomously. If the god is in proximity, simple vocal orders can be given (guard, attack). No click-to-select, no RTS-style unit management.

**Open design questions**:

- Matchmaking algorithm specifics
- AI god behaviour in single player (difficulty scaling, personality types?)
- Timeout duration for portal links
- Can warriors raid independently through the portal without the god? (The "Raid" command suggests yes; implications for balance?)
- What happens to warriors who are in another world when the portal link dissolves?
- How does the portal seed system work in multiplayer? Random connection to any online player of similar level, or does the player dial specific seeds they've discovered?

---

## 7. Combat

### 7.1 Style

Hybrid action-RTS. The god is physically present on the battlefield, fighting and casting spells in real-time pixel-art combat, while simultaneously issuing proximity-based commands to autonomous warrior units. Closer to Populous 3 and Sons of Valhalla than to Black & White or Command & Conquer.

### 7.2 God combat

- Gods fight using physical attacks and their elemental spells
- God abilities (melee strength, movement speed, spell power) are determined by elemental alignment and statue count
- Gods can be killed but resurrect if believers remain

### 7.3 Unit combat

- Warriors fight autonomously with basic AI
- Proximity vocal commands: guard, attack
- Unit strength determined by civilisational stage (higher stage = better weapons and armour)
- Elemental affinities affect unit performance:
  - Water and earth units get a boost at night
  - Fire and air units get a boost during day
  - Merfolk fight better in watery zones
  - Units get debuffs in worlds dominated by their opposing element, proportional to how dominant that element is

### 7.4 Day/night cycle

The day/night cycle is not just aesthetic; it's a strategic resource:

- Fire/air-aligned worlds and units are stronger during daytime
- Water/earth-aligned worlds and units are stronger at night
- Timing a raid to coincide with your elemental advantage (attacking an earth world during the day, when their units are weaker) is a valid strategic consideration

**Open design questions**:

- Specific combat mechanics (damage, health, armour, attack speed)
- How spells interact with terrain and units
- Friendly fire considerations
- Retreat mechanics: can a god flee back through the portal mid-fight?
- How do large battles perform? (Pixel-art particle simulation with dozens of units + spell effects = potential performance concern on web)

---

## 8. Sound design

Sound is a first-class system, not an afterthought. Each world should sound as unique as it looks.

### 8.1 Generative ambient engine

A modular sound system that constructs unique ambient soundscapes from simple component parts, determined by the world's parameters:

- **Elemental base layer**: fire worlds crackle and hiss; water worlds gurgle and surge; air worlds whistle and hum; earth worlds rumble and grind
- **Terrain modulation**: cave-heavy worlds are reverberant and enclosed; sky-heavy worlds are open and airy
- **Biome variation**: dense/fertile areas have richer fauna sounds; barren/sparse areas are more minimal
- **Day/night shift**: the soundscape evolves with the cycle
- **Dynamic response**: combat, spells, civilisation activity, and environmental events layer onto the ambient bed

### 8.2 Principles

- Kaleidoscope hypothesis: a small set of well-crafted sound components combined procedurally to create infinite variation
- Sound should reinforce the elemental identity of each world without becoming monotonous
- The god's actions should feel sonically weighty and mythological
- Civilisational progression should be audible: a cave-dweller village sounds different from a town
- PvP incursions should produce an immediate, unmistakable sonic shift (tension, urgency)

Mike has 10+ years of FL Studio experience and will provide source samples and design principles. The engine needs to be lightweight and browser-compatible.

**Open design questions**:

- Specific audio middleware/library for web (Tone.js? Web Audio API directly? Howler.js?)
- How many base sound components are needed per element?
- Musical elements: is there procedural music, or strictly ambient/environmental sound?
- God vocal commands: synthesised, sampled, or text-based?

---

## 9. Technical approach

### 9.1 Platform

**Browser-based game hosted on GitHub Pages (client) with a separate lightweight multiplayer backend.**

GitHub Pages is static hosting; it serves files but cannot run server-side code. The game architecture therefore splits into two parts:

- **Game client**: HTML/CSS/JavaScript/WebGL, hosted on GitHub Pages. This is the game itself: rendering, input, game logic, single-player AI
- **Multiplayer backend**: a lightweight server handling matchmaking, world seed registry, portal connections, and real-time PvP state synchronisation. Hosted separately (see options below)

**The single-player experience runs entirely in the browser with zero server dependency.** Multiplayer is an additive layer.

### 9.2 Technology options (non-prescriptive)

**Game framework options**:

| Option | Strengths | Weaknesses | Notes |
|---|---|---|---|
| **Phaser** (phaser.io) | Mature 2D web game framework; massive community; excellent documentation; AI agents know it well | Higher-level abstraction may limit control over custom particle systems | Strongest candidate for rapid prototyping. Plugin ecosystem covers many needs |
| **PixiJS** (pixijs.com) | Lower-level 2D WebGL renderer; more control for custom systems | More to build from scratch; less "game engine," more "rendering library" | Better if Noita-like particle sim needs deep custom work |
| **Custom WebGL** | Maximum control | Maximum effort | Only if Phaser/PixiJS can't handle the particle simulation |

**Noita-like particle simulation**:

The falling-sand / cellular-automata simulation is the most technically demanding component. Options include adapting existing open-source WebGL falling-sand implementations, or building a custom system. Performance is the key concern: simulating thousands of particles in real-time in a browser while also running game logic, AI, and rendering.

**Multiplayer backend options**:

| Option | Strengths | Weaknesses |
|---|---|---|
| **Supabase** | Real-time subscriptions, auth, database; generous free tier | May not handle high-frequency game state sync well |
| **Firebase** | Real-time database, mature; free tier available | Google dependency; can get expensive at scale |
| **Colyseus** | Purpose-built multiplayer game server (Node.js); rooms, state sync, matchmaking built in | Requires hosting (Fly.io, Railway); more setup |
| **WebSocket on Fly.io/Railway** | Full control; cheap/free tiers available | Build everything from scratch |

**Recommended phasing** (suggestion, not mandate):

1. **Phase 1**: Single-player prototype. World gen, god movement, basic terrain, one village, one tablet. Phaser or PixiJS. GitHub Pages only. No server.
2. **Phase 2**: Particle simulation. Integrate falling-sand physics. Performance testing and optimisation.
3. **Phase 3**: Full single-player loop. All seven stages, multiple villages, belief system, AI critters, knowledge transfer, spells.
4. **Phase 4**: Multiplayer. Add backend server, portal mechanics, matchmaking, PvP combat.
5. **Phase 5**: Polish. Sound engine, visual refinement, balance tuning, edge case handling.

### 9.3 Performance considerations

- Particle simulation + many autonomous units + spell effects = heavy rendering load
- WebGL is essential; Canvas 2D will not suffice for the particle sim
- Web Workers may be needed to offload simulation from the render thread
- World size should remain small (Terraria-small) until performance is proven
- Mobile browser support is a stretch goal, not a launch requirement

**Open design questions**:

- Target frame rate (30fps? 60fps?)
- Minimum browser/hardware requirements
- Save system: local storage? Cloud saves via the multiplayer backend?
- Mod support: is this on the radar at all?

---

## 10. Art style

### 10.1 Visual direction

- **Pixel art**: the primary medium. Every element of the game rendered in pixel art
- **Noita-like particle fidelity**: individual sand, liquid, and gas particles rendered as pixels, creating a world that feels physically alive
- **Elemental colour palettes**: each element pair produces a distinct palette. Fire-water worlds glow amber and deep blue. Earth-air worlds are ochre and pale sky. The ratio slider shifts the palette's centre of gravity
- **Civilisational visual progression**: villages visibly evolve from crude shelters to monumental (but always ancient/fantasy-coded) architecture
- **God design**: procedurally generated demi-human deities that reflect their elemental alignment. Anthropomorphic but clearly not fully human. Mythological in bearing

### 10.2 Aesthetic constraints

- Never sci-fi or cyberpunk. Even the most advanced civilisation stage should feel ancient, mythological, fantastical
- The world should feel alive at all times: particles drifting, creatures moving, plants swaying, water flowing
- Visual clarity in combat: the player must always be able to distinguish their god, their units, enemy units, and spell effects, even in chaotic pixel-art battles

---

## 11. Open questions register

A running list of design decisions that require further brainstorming, prototyping, or playtesting before being resolved:

### Systems
- [ ] Exact spell list and effects per element and hybrid
- [ ] Spell balance across all element pair and ratio combinations
- [ ] Population caps and growth rates per civilisational stage
- [ ] Belief generation and decay rate curves
- [ ] Day/night cycle duration
- [ ] Combat damage, health, armour, and attack speed values
- [ ] Resource/food economy (does one exist beyond population?)
- [ ] What does fire god "excel at" physically? (Equivalent to air=flight, water=swim, earth=dig)
- [ ] Can villages regress if damaged by raiders?
- [ ] Can belief be restored to a captured village?
- [ ] Hunter-gatherer to warrior ratio: player-controlled or automatic?

### Multiplayer
- [ ] Matchmaking algorithm specifics
- [ ] Portal link timeout duration
- [ ] What happens to warriors stranded in another world when the portal dissolves?
- [ ] Can warriors raid independently without the god present?
- [ ] Multiplayer seed system: random matchmaking or discoverable seeds?
- [ ] Anti-grief protections beyond Sealed Universe mode
- [ ] Server infrastructure and hosting costs at scale

### AI and single player
- [ ] AI god behaviour and difficulty scaling
- [ ] AI god personality types (aggressive raider, defensive builder, etc.)
- [ ] How the AI god manages its own villages and knowledge transfer

### Technical
- [ ] Framework selection (Phaser vs PixiJS vs custom)
- [ ] Particle simulation approach and performance budget
- [ ] Multiplayer backend selection
- [ ] Save system architecture
- [ ] Target frame rate and minimum hardware
- [ ] Mobile support timeline
- [ ] Mod support feasibility and priority

### Audio
- [ ] Audio library selection (Tone.js, Web Audio API, Howler.js)
- [ ] Number of base sound components per element
- [ ] Procedural music vs ambient-only
- [ ] God vocal command system

### Game feel
- [ ] Progression curve: how long from world creation to first tablet? To full civilisation?
- [ ] Pacing: how does the game prevent the mid-game from feeling like a grind?
- [ ] Onboarding: how does a new player learn the systems without a tutorial?
- [ ] The "one more turn" hook: what keeps a player coming back session after session?
- [ ] Victory conditions: is there a "win state" beyond ongoing expansion, or is it purely sandbox?

---

## 12. Working title

**GODSTONE**

(Provisional. Evokes the ancient tablets, the Stonehenge portal, and the monumental aspirations of the civilisation system. Subject to change when something better surfaces.)

---

*This document is a compass, not a map. It captures the vision as understood through detailed conversation, flags every open question honestly, and recommends approaches without enforcing them. The game will be built iteratively, with each decision validated by whether it feels fun to play.*
