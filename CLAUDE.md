# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**GODSTONE** — a browser-based pixel-art god game with procedurally generated worlds, Noita-like particle simulation, civilisation-building, and omniverse PvP via portal mechanics. Full game design specification: `GODSTONE-game-design-spec.md`. That document is authoritative; read it before working on any system.

Human creative director: Mike Whyle. AI builds. Mike directs. One step at a time; propose before implementing.

## Commands

> **Note:** Project scaffold not yet initialised. Commands below reflect the intended stack; run these once after `npm install` is available.

```bash
npm run dev       # Vite dev server with HMR
npm run build     # Production build to dist/
npm run preview   # Serve the production build locally
```

Deployment is via GitHub Pages from the `dist/` output of `npm run build`. No server-side code; the single-player game is entirely client-side.

## Architecture

**Stack:** Phaser 3 (game framework) + Vite (build tooling). Multiplayer backend (Colyseus on Fly.io) is Phase 4 and does not exist yet.

**Phase sequence:**
1. World gen + god movement + basic terrain (current)
2. Particle simulation (WebGL falling-sand via Web Worker)
3. Full single-player loop: villages, tablets, belief, critters, spells
4. Multiplayer: portal mechanics, matchmaking, PvP
5. Sound engine, polish, balance

**Module structure (once scaffolded):**

```
src/
  core/          # Scene management, game config, event bus
  world/         # Procedural generation — elemental pairs, terrain sliders, biomes
  god/           # God entity: movement, abilities, spell casting, resurrection
  civilisation/  # Villages, unit AI, the seven stages, tablet delivery
  belief/        # Per-village belief: generation, decay, capture logic
  combat/        # God combat, unit combat, day/night elemental modifiers
  portal/        # Portal henge, omniverse links, seed system
  sound/         # Generative ambient engine (Tone.js or Web Audio API — TBD)
  ui/            # Creation screen, HUD, vocal command display
```

Each module is loosely coupled. Modules communicate via `core/` (event bus or shared state); direct cross-module imports are a smell. The particle simulation (Phase 2) will run in a Web Worker and composite onto the Phaser canvas — it is not a Phaser system.

**World generation:** driven by two inputs — an elemental pair (fire/water/air/earth, choose two) and three independent terrain sliders (sky-cave, barren-fertile, sparse-dense). Everything else — biomes, flora, fauna, humanoid species, god appearance, spell loadout, soundscape — derives from these parameters plus a random seed.

**Belief system:** per-village, not global. Drives village loyalty, warrior effectiveness, and vulnerability to enemy god capture. Zero believers across all villages = permanent god death.

**Portal/omniverse:** one portal henge per world. Attacker dials a seed; defender's portal recalibrates to point home for the duration, creating a two-way link and a counter-invasion window. Single-player uses an AI-governed world on the other side.

## Naming and conventions

- British English throughout: `colour`, `defence`, `organise`, `favour`
- Domain terminology in code: `god`, `village`, `tablet`, `portal`, `belief` — not `entity`, `node`, `handler`
- Comments explain *why*, not *what*
- Sentence case for all UI text
- No em dashes anywhere — use semicolons, colons, en dashes with spaces, or hyphens

## Open design questions

Many systems in the spec have deliberately unresolved details (spell effects, population caps, belief rate curves, combat values). When you encounter one, **flag it and ask** rather than silently deciding. The open questions register is in section 11 of `GODSTONE-game-design-spec.md`.
