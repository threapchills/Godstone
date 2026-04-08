import { WORLD_WIDTH, WORLD_HEIGHT } from '../core/Constants.js'

// Tile ids that count as non-solid for grounding purposes: air plus
// surface vegetation. An entity sitting on a vegetation tile would
// look like it was perched on top of grass blades, which is wrong.
const NON_SOLID = new Set([0, 16, 17, 18, 19, 20])

// Walk down from a starting tile until we find a tile whose neighbour
// below is solid. Returns the tile y where an entity with origin
// (0.5, 1) should sit so its feet rest on the surface.
//
// The search is bounded by maxWalk tiles so an entity next to a deep
// chasm doesn't tumble to the bottom of the world; if no ground is
// found within the window we return fallbackTileY instead.
//
// Centralised so Village, Warrior, FoliageRenderer, Critters and the
// portal can all share the same grounding behaviour without any of
// them subtly disagreeing about what counts as solid.
//
// maxWalk is generous enough to handle the taller 900-tile world:
// terraformed buildings and critters on the deepest chamber floors
// still find a surface within a reasonable vertical window.
export function findGroundTileY(grid, tileX, startTileY, fallbackTileY, maxWalk = 32) {
  const wrappedX = ((tileX % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH
  const limit = Math.min(WORLD_HEIGHT - 1, startTileY + maxWalk)
  let y = Math.max(0, startTileY)
  while (y < limit) {
    const tile = grid[(y + 1) * WORLD_WIDTH + wrappedX]
    if (!NON_SOLID.has(tile)) return y + 1
    y++
  }
  return fallbackTileY
}
