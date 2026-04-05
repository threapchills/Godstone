# Godstone

## Project context

A browser-based pixel-art god game with procedurally generated worlds, Noita-like particle simulation, civilisation-building, and omniverse PvP multiplayer. Built by AI agents, directed by a human creative director (Mike Whyle). See `GODSTONE-game-design-spec.md` for the full vision document.

## Technical stack

To be determined. Leading candidates: Phaser or PixiJS for the game client, hosted on GitHub Pages. Multiplayer backend TBD (Colyseus, Supabase, or custom WebSocket server). The spec document contains a comparison table with trade-offs.

## How to work on this project

- **Read the spec first.** Before writing any code, read `GODSTONE-game-design-spec.md` thoroughly. It contains the full game design, including explicit open questions that have not been decided yet.
- **One step at a time.** Propose a single step, wait for approval, then proceed. Do not implement multiple systems at once.
- **Ask before assuming.** Many design details are deliberately left open. When you encounter an open question from the spec, flag it and ask rather than making a silent decision.
- **Keep it simple.** Start with the simplest possible implementation that proves the concept. Do not overengineer. Complexity is a last resort.
- **Prototype over perfection.** The goal in early phases is to find the fun, not to ship production code. Ugly but playable beats polished but unfinished.

## Architecture principles

- Single-player must work entirely in the browser with zero server dependency
- Multiplayer is an additive layer, not a prerequisite
- Performance is paramount: particle simulation + AI + rendering must maintain playable frame rates in a web browser
- Modular systems: world gen, god, civilisation, combat, sound, and multiplayer should be loosely coupled so they can be built and tested independently

## Phase sequence (suggested)

1. World gen + god movement + basic terrain (single-player, GitHub Pages only)
2. Particle simulation integration and performance testing
3. Full single-player loop (villages, tablets, belief, critters, spells)
4. Multiplayer backend + portal mechanics + PvP
5. Sound engine + polish + balance

## Art and aesthetic

- Pixel art exclusively. Never 3D, never vector
- Ancient/mythological/fantasy-coded at all times. Never sci-fi, never cyberpunk
- Elemental colour palettes derived from the world parameters
- Visual clarity in combat is non-negotiable

## Writing and naming conventions

- British English spelling throughout (colour, favour, defence)
- Never use em dashes; use semicolons, colons, en dashes with spaces, or hyphens
- Sentence case for all UI text and headings
- Code comments explain the "why," not the "what"
- Variable and function names should be descriptive and domain-appropriate (use game terminology: god, village, tablet, portal, belief; not generic terms like entity, node, handler)
