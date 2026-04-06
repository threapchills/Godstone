import { createNoise2D } from 'simplex-noise'
import { WORLD_WIDTH, WORLD_HEIGHT, TERRAIN } from '../core/Constants.js'
import { TILES } from './TileTypes.js'

// ── Biome vocabularies per element pair ──────────────────────
// Ordered surface-first to underground-last; depth bias shifts selection.

const BIOME_VOCABS = {
  'air+fire':   ['cinder_plains', 'ember_peaks', 'ash_drifts', 'thermal_canyons'],
  'earth+fire': ['scorched_flats', 'obsidian_wastes', 'magma_forge', 'crystal_caverns'],
  'fire+water': ['volcanic_shore', 'coral_shelf', 'steam_vents', 'deep_trench'],
  'earth+water':['mudflats', 'marshland', 'fungal_grove', 'flooded_caverns'],
  'air+water':  ['storm_coast', 'ice_ridge', 'mist_valley', 'floating_reef'],
  'air+earth':  ['windswept_plateau', 'mountain_meadow', 'cliff_face', 'deep_root'],
}

// Properties per biome: vegetation multiplier, tile swaps, special features
const BIOME_PROPS = {
  // Fire + Water
  volcanic_shore:   { vegMul: 0.3, swaps: [[TILES.STONE, TILES.VOLCANIC_ROCK]] },
  coral_shelf:      { vegMul: 0.8, swaps: [[TILES.STONE, TILES.CORAL]] },
  steam_vents:      { vegMul: 0.2, swaps: [[TILES.STONE, TILES.VOLCANIC_ROCK]] },
  deep_trench:      { vegMul: 0.1, swaps: [] },
  // Fire + Earth
  scorched_flats:   { vegMul: 0.2, swaps: [[TILES.SURFACE, TILES.SAND]] },
  obsidian_wastes:  { vegMul: 0.1, swaps: [[TILES.STONE, TILES.VOLCANIC_ROCK]] },
  magma_forge:      { vegMul: 0.1, swaps: [[TILES.STONE, TILES.VOLCANIC_ROCK], [TILES.SOIL, TILES.MAGMA_ROCK]] },
  crystal_caverns:  { vegMul: 0.4, swaps: [[TILES.STONE, TILES.CRYSTAL]] },
  // Fire + Air
  cinder_plains:    { vegMul: 0.3, swaps: [[TILES.SURFACE, TILES.SAND]] },
  ember_peaks:      { vegMul: 0.3, swaps: [[TILES.STONE, TILES.VOLCANIC_ROCK]] },
  ash_drifts:       { vegMul: 0.1, swaps: [[TILES.SURFACE, TILES.SAND], [TILES.SOIL, TILES.SAND]] },
  thermal_canyons:  { vegMul: 0.2, swaps: [[TILES.STONE, TILES.VOLCANIC_ROCK]] },
  // Water + Earth
  mudflats:         { vegMul: 0.6, swaps: [[TILES.SURFACE, TILES.CLAY], [TILES.SOIL, TILES.CLAY]] },
  marshland:        { vegMul: 1.2, swaps: [[TILES.SOIL, TILES.CLAY]] },
  fungal_grove:     { vegMul: 1.5, swaps: [[TILES.SOIL, TILES.CLAY]], mushrooms: true },
  flooded_caverns:  { vegMul: 0.5, swaps: [], mushrooms: true },
  // Water + Air
  storm_coast:      { vegMul: 0.5, swaps: [] },
  ice_ridge:        { vegMul: 0.2, swaps: [[TILES.SURFACE, TILES.ICE], [TILES.SOIL, TILES.ICE], [TILES.STONE, TILES.ICE]] },
  mist_valley:      { vegMul: 0.8, swaps: [] },
  floating_reef:    { vegMul: 0.6, swaps: [[TILES.STONE, TILES.CORAL]] },
  // Earth + Air
  windswept_plateau:{ vegMul: 0.6, swaps: [[TILES.SURFACE, TILES.SAND]] },
  mountain_meadow:  { vegMul: 1.3, swaps: [] },
  cliff_face:       { vegMul: 0.3, swaps: [] },
  deep_root:        { vegMul: 1.0, swaps: [[TILES.SOIL, TILES.CLAY]], mushrooms: true },
}

// Seeded PRNG (mulberry32) so worlds are reproducible from a seed.
function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Generate a complete world grid from creation parameters.
export function generateWorld(params) {
  const {
    element1, element2, elementRatio,
    skyCave, barrenFertile, sparseDense, seed,
  } = params

  const rng = mulberry32(seed)
  const noise2D = createNoise2D(rng)
  const rng2 = mulberry32(seed + 12345)
  const noise2D_b = createNoise2D(rng2)
  const rng3 = mulberry32(seed + 67890)
  const noise2D_c = createNoise2D(rng3)
  const rng4 = mulberry32(seed + 54321)

  const grid = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT)
  const idx = (x, y) => y * WORLD_WIDTH + x

  // ── Pass 1: 2D density field ──────────────────────────────
  // density > threshold = solid, else air.
  // The depth gradient plus multi-octave noise produces mountains,
  // valleys, overhangs, cliffs, and caves in one pass.

  const surfaceBaseline = WORLD_HEIGHT * (0.15 + skyCave * 0.4)
  const gradientScale = WORLD_HEIGHT * 0.35
  const threshold = -0.05 + sparseDense * 0.1

  for (let x = 0; x < WORLD_WIDTH; x++) {
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      // Linear depth gradient: deeper = denser
      let density = (y - surfaceBaseline) / gradientScale

      // Large terrain: mountains and broad valleys
      density += noise2D(x * 0.004, y * 0.006) * 0.8
      // Ridge detail: cliffs, overhangs, shelves
      density += noise2D_b(x * 0.01, y * 0.008) * 0.3
      // Cave networks
      density += noise2D_c(x * 0.02, y * 0.015) * 0.25
      // Surface roughness
      density += noise2D(x * 0.05 + 1000, y * 0.05 + 1000) * 0.08

      if (y >= WORLD_HEIGHT - TERRAIN.BEDROCK_DEPTH) {
        grid[idx(x, y)] = TILES.BEDROCK
      } else if (y < 3) {
        grid[idx(x, y)] = TILES.AIR
      } else if (density > threshold) {
        grid[idx(x, y)] = TILES.STONE
      } else {
        grid[idx(x, y)] = TILES.AIR
      }
    }
  }

  // ── Compute primary surface heights (topmost solid per column) ──

  const surfaceHeights = new Float32Array(WORLD_WIDTH)
  function recomputeSurface() {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      surfaceHeights[x] = WORLD_HEIGHT - 1
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        if (grid[idx(x, y)] !== TILES.AIR) {
          surfaceHeights[x] = y
          break
        }
      }
    }
  }
  recomputeSurface()

  // ── Pass 2: large chambers for underground biomes ─────────

  const chamberCount = 3 + Math.floor(rng4() * 5)
  for (let i = 0; i < chamberCount; i++) {
    const cx = Math.floor(rng4() * WORLD_WIDTH)
    const cy = Math.floor(surfaceBaseline + 30 + rng4() * (WORLD_HEIGHT * 0.4))
    const w = 25 + Math.floor(rng4() * 45)
    const h = 15 + Math.floor(rng4() * 25)

    for (let dx = -Math.floor(w / 2); dx <= Math.floor(w / 2); dx++) {
      for (let dy = -Math.floor(h / 2); dy <= Math.floor(h / 2); dy++) {
        const nx = dx / (w / 2)
        const ny = dy / (h / 2)
        if (nx * nx + ny * ny > 1) continue

        const gx = ((cx + dx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH
        const gy = cy + dy
        if (gy <= 3 || gy >= WORLD_HEIGHT - TERRAIN.BEDROCK_DEPTH) continue
        grid[idx(gx, gy)] = TILES.AIR
      }
    }
  }

  // ── Pass 3: vertical shafts connecting layers ─────────────
  // Natural chimneys so the god can navigate between altitudes

  const shaftCount = 6 + Math.floor(rng4() * 6)
  for (let i = 0; i < shaftCount; i++) {
    const sx = Math.floor(rng4() * WORLD_WIDTH)
    const topY = Math.floor(surfaceHeights[sx])
    const depth = 40 + Math.floor(rng4() * 100)
    const bottomY = Math.min(topY + depth, WORLD_HEIGHT - TERRAIN.BEDROCK_DEPTH - 5)
    const w = 2 + Math.floor(rng4() * 3)

    for (let y = topY; y < bottomY; y++) {
      for (let dx = 0; dx < w; dx++) {
        const gx = ((sx + dx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH
        grid[idx(gx, y)] = TILES.AIR
      }
    }
  }

  // ── Pass 4: refine tile types ─────────────────────────────
  // Mark every air-solid boundary as SURFACE; add soil beneath each one.
  // This gives us walkable surfaces at every altitude: cliff ledges,
  // cave floors, mountain peaks, plateau edges.

  for (let x = 0; x < WORLD_WIDTH; x++) {
    for (let y = 1; y < WORLD_HEIGHT; y++) {
      if (grid[idx(x, y)] !== TILES.STONE) continue
      if (grid[idx(x, y - 1)] !== TILES.AIR) continue

      // This stone tile has air above: it's a surface
      grid[idx(x, y)] = TILES.SURFACE
      for (let dy = 1; dy < TERRAIN.SOIL_DEPTH && y + dy < WORLD_HEIGHT; dy++) {
        if (grid[idx(x, y + dy)] === TILES.STONE) {
          grid[idx(x, y + dy)] = TILES.SOIL
        } else break
      }
    }
  }

  recomputeSurface()

  // ── Pass 4b: 2D biome assignment ──────────────────────────
  // A separate low-frequency noise field partitions the world into
  // biome regions. Depth has influence but not control: underground
  // biomes are more likely deep, but a cave at y=50 can still be
  // a fungal grove if the noise puts it there.

  const biomeRng = mulberry32(seed + 11111)
  const biomeNoise = createNoise2D(biomeRng)
  const pairKey = [element1, element2].sort().join('+')
  const vocab = BIOME_VOCABS[pairKey]
  const biomeMap = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT)

  if (vocab) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const n = biomeNoise(x * 0.007, y * 0.007)
        const depthBias = (y / WORLD_HEIGHT - 0.4) * 0.3
        const combined = (n + depthBias + 1.3) / 2.6
        biomeMap[idx(x, y)] = Math.min(3, Math.max(0, Math.floor(combined * 4)))
      }
    }

    // Apply biome tile swaps with noise-driven probability
    // so biome edges blend rather than hard-cutting
    for (let x = 0; x < WORLD_WIDTH; x++) {
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const props = BIOME_PROPS[vocab[biomeMap[idx(x, y)]]]
        if (!props || props.swaps.length === 0) continue
        const tile = grid[idx(x, y)]
        const swapChance = noise2D_c(x * 0.04 + 2000, y * 0.04 + 2000)
        if (swapChance < -0.2) continue // ~60% of tiles swap; the rest stay original

        for (const [from, to] of props.swaps) {
          if (tile === from) { grid[idx(x, y)] = to; break }
        }
      }
    }
  }

  // ── Pass 5: element-specific features ─────────────────────

  const ratio1 = elementRatio / 10
  const ratio2 = 1 - ratio1
  const hasElement = (el) => el === element1 || el === element2
  const elementWeight = (el) => {
    if (el === element1) return ratio1
    if (el === element2) return ratio2
    return 0
  }

  // Water: fills open-air valleys below a calculated water level
  if (hasElement('water')) {
    const waterWeight = elementWeight('water')
    const sorted = [...surfaceHeights].sort((a, b) => a - b)
    // Higher waterWeight = more flooding (lower dry fraction)
    const dryFraction = 0.9 - waterWeight * 0.5
    const waterLevel = Math.floor(sorted[Math.floor(dryFraction * WORLD_WIDTH)])

    // Surface water: fill air exposed to the sky below waterLevel
    for (let x = 0; x < WORLD_WIDTH; x++) {
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        if (grid[idx(x, y)] !== TILES.AIR) break // hit solid; stop scanning
        if (y >= waterLevel) {
          grid[idx(x, y)] = y > waterLevel + 5 ? TILES.DEEP_WATER : TILES.WATER
        }
      }
    }
    fillCavePools(grid, surfaceHeights, waterWeight)
  }

  // Lava: pools near the bottom of the world
  if (hasElement('fire')) {
    const fireWeight = elementWeight('fire')
    for (let x = 0; x < WORLD_WIDTH; x++) {
      for (let y = WORLD_HEIGHT - TERRAIN.BEDROCK_DEPTH - 25; y < WORLD_HEIGHT - TERRAIN.BEDROCK_DEPTH; y++) {
        if (grid[idx(x, y)] === TILES.AIR) {
          const n = noise2D_c(x * 0.05, y * 0.05)
          if (n < -0.2 + fireWeight * 0.3) {
            grid[idx(x, y)] = TILES.LAVA
          }
        }
      }
    }
    // Volcanic rock in deep stone
    if (fireWeight > 0.3) {
      for (let x = 0; x < WORLD_WIDTH; x++) {
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          if (grid[idx(x, y)] === TILES.STONE) {
            const n = noise2D_c(x * 0.03, y * 0.03)
            if (n > 0.5 - fireWeight * 0.2) {
              grid[idx(x, y)] = TILES.VOLCANIC_ROCK
            }
          }
        }
      }
    }
  }

  // Earth features: clay veins, crystal deposits
  if (hasElement('earth')) {
    const earthWeight = elementWeight('earth')
    for (let x = 0; x < WORLD_WIDTH; x++) {
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        if (grid[idx(x, y)] === TILES.SOIL) {
          const n = noise2D_c(x * 0.06, y * 0.06)
          if (n > 0.6 - earthWeight * 0.2) grid[idx(x, y)] = TILES.CLAY
        }
        if (grid[idx(x, y)] === TILES.STONE) {
          const n = noise2D_c(x * 0.08 + 500, y * 0.08 + 500)
          if (n > 0.7 - earthWeight * 0.15) grid[idx(x, y)] = TILES.CRYSTAL
        }
      }
    }
  }

  // Air features: floating islands above the primary surface
  if (hasElement('air')) {
    const airWeight = elementWeight('air')
    if (airWeight > 0.3) {
      addFloatingIslands(grid, noise2D_c, surfaceHeights, airWeight, rng4)
    }
  }

  // ── Pass 6: sand on arid surfaces ─────────────────────────

  if (barrenFertile < 0.5 || hasElement('fire') || hasElement('air')) {
    const sandChance = (1 - barrenFertile) * 0.6
    for (let x = 0; x < WORLD_WIDTH; x++) {
      for (let y = 1; y < WORLD_HEIGHT; y++) {
        if (grid[idx(x, y)] !== TILES.SURFACE) continue
        const n = noise2D_c(x * 0.02, y * 0.01)
        if (n > 1 - sandChance * 2) {
          grid[idx(x, y)] = TILES.SAND
          for (let dy = 1; dy < 4 && y + dy < WORLD_HEIGHT; dy++) {
            if (grid[idx(x, y + dy)] === TILES.SOIL) grid[idx(x, y + dy)] = TILES.SAND
            else break
          }
        }
      }
    }
  }

  // ── Pass 7: vegetation on all surfaces ────────────────────

  addVegetation(grid, surfaceHeights, barrenFertile, noise2D_c, rng4, vocab ? { biomeMap, vocab } : null)

  recomputeSurface()
  return { grid, surfaceHeights, biomeMap, biomeVocab: vocab }
}

// ── Helpers ──────────────────────────────────────────────────

function fillCavePools(grid, surfaceHeights, waterWeight) {
  const idx = (x, y) => y * WORLD_WIDTH + x
  const poolChance = 0.002 * waterWeight

  for (let x = 2; x < WORLD_WIDTH - 2; x++) {
    const surfaceY = Math.floor(surfaceHeights[x])
    for (let y = surfaceY + 15; y < WORLD_HEIGHT - 10; y++) {
      if (grid[idx(x, y)] !== TILES.AIR) continue
      if (Math.random() > poolChance) continue

      if (y + 1 < WORLD_HEIGHT && grid[idx(x, y + 1)] !== TILES.AIR) {
        const queue = [[x, y]]
        const visited = new Set()
        let filled = 0
        while (queue.length > 0 && filled < 80) {
          const [cx, cy] = queue.pop()
          const key = `${cx},${cy}`
          if (visited.has(key)) continue
          visited.add(key)
          if (cx < 0 || cx >= WORLD_WIDTH || cy < 0 || cy >= WORLD_HEIGHT) continue
          if (grid[idx(cx, cy)] !== TILES.AIR) continue
          grid[idx(cx, cy)] = TILES.WATER
          filled++
          queue.push([cx - 1, cy], [cx + 1, cy], [cx, cy + 1])
        }
      }
    }
  }
}

function addFloatingIslands(grid, noise2D, surfaceHeights, airWeight, rng) {
  const idx = (x, y) => y * WORLD_WIDTH + x
  const islandCount = Math.floor(3 + airWeight * 8)

  for (let i = 0; i < islandCount; i++) {
    const cx = Math.floor(rng() * WORLD_WIDTH)
    const minSurface = Math.min(...Array.from({ length: 40 }, (_, j) => {
      const sx = (cx - 20 + j + WORLD_WIDTH) % WORLD_WIDTH
      return surfaceHeights[sx]
    }))
    const cy = Math.floor(minSurface - 15 - rng() * 40)
    if (cy < 5) continue

    const width = Math.floor(8 + rng() * 20)
    const height = Math.floor(3 + rng() * 6)

    for (let dx = -width / 2; dx < width / 2; dx++) {
      const wx = ((cx + Math.floor(dx)) + WORLD_WIDTH) % WORLD_WIDTH
      const normalX = dx / (width / 2)
      const maxH = height * (1 - normalX * normalX)
      for (let dy = 0; dy < maxH; dy++) {
        const wy = cy + dy
        if (wy >= 0 && wy < WORLD_HEIGHT && grid[idx(wx, wy)] === TILES.AIR) {
          grid[idx(wx, wy)] = dy === 0 ? TILES.SURFACE : TILES.SOIL
        }
      }
    }
  }
}

// Vegetation on ALL surfaces (cliff ledges, cave floors, mountain peaks)
function addVegetation(grid, surfaceHeights, fertility, noise2D, rng, biomeData) {
  const idx = (x, y) => y * WORLD_WIDTH + x
  const baseTreeChance = 0.02 + fertility * 0.06
  const baseBushChance = 0.03 + fertility * 0.08
  const baseGrassChance = 0.05 + fertility * 0.15

  for (let x = 0; x < WORLD_WIDTH; x++) {
    for (let y = 1; y < WORLD_HEIGHT - 1; y++) {
      const tile = grid[idx(x, y)]
      if (tile !== TILES.SURFACE && tile !== TILES.SAND) continue
      if (grid[idx(x, y - 1)] !== TILES.AIR) continue

      // Biome vegetation multiplier
      let vegMul = 1
      if (biomeData) {
        const bi = biomeData.biomeMap[idx(x, y)]
        const props = BIOME_PROPS[biomeData.vocab[bi]]
        if (props) vegMul = props.vegMul
      }
      const treeChance = baseTreeChance * vegMul
      const bushChance = baseBushChance * vegMul
      const grassChance = baseGrassChance * vegMul

      const n = noise2D(x * 0.05, y * 0.05)
      const r = rng()

      if (r < treeChance && n > -0.2) {
        const treeHeight = 4 + Math.floor(rng() * 4) // 4-7 tiles tall
        let canPlace = true
        for (let dy = 1; dy <= treeHeight + 3; dy++) {
          if (y - dy < 0 || grid[idx(x, y - dy)] !== TILES.AIR) {
            canPlace = false; break
          }
        }
        if (canPlace) {
          for (let dy = 1; dy <= treeHeight; dy++) grid[idx(x, y - dy)] = TILES.TREE_TRUNK
          const topY = y - treeHeight
          // 5-wide, 3-tall rounded canopy
          for (let ly = -2; ly <= 0; ly++) {
            for (let lx = -2; lx <= 2; lx++) {
              if (Math.abs(lx) === 2 && ly === -2) continue // round corners
              const gx = x + lx
              const gy = topY + ly
              if (gx >= 0 && gx < WORLD_WIDTH && gy >= 0 && grid[idx(gx, gy)] === TILES.AIR) {
                grid[idx(gx, gy)] = TILES.TREE_LEAVES
              }
            }
          }
        }
      } else if (r < treeChance + bushChance && n > -0.3) {
        grid[idx(x, y - 1)] = TILES.BUSH
      } else if (r < treeChance + bushChance + grassChance) {
        grid[idx(x, y - 1)] = TILES.TALL_GRASS
      }
    }
  }

  // Mushrooms on cave floors (underground only); boosted in fungal biomes
  const baseMushroomChance = 0.005 + fertility * 0.01
  for (let x = 0; x < WORLD_WIDTH; x++) {
    const primarySurface = Math.floor(surfaceHeights[x])
    for (let y = primarySurface + 10; y < WORLD_HEIGHT - 10; y++) {
      if (grid[idx(x, y)] !== TILES.AIR) continue
      if (y + 1 >= WORLD_HEIGHT) continue
      const below = grid[idx(x, y + 1)]
      if (below === TILES.STONE || below === TILES.SOIL || below === TILES.CLAY) {
        let chance = baseMushroomChance
        if (biomeData) {
          const props = BIOME_PROPS[biomeData.vocab[biomeData.biomeMap[idx(x, y)]]]
          if (props?.mushrooms) chance *= 4
        }
        if (rng() < chance) grid[idx(x, y)] = TILES.MUSHROOM
      }
    }
  }
}

// Find a flat underground surface: a horizontal run of SURFACE/SAND tiles
// with enough air clearance above for a village sprite, below the primary surface.
// Returns { x, y } (tile coords of the leftmost tile in the chosen run) or null.
export function findCaveSurface(grid, surfaceHeights, minWidth, rng, excludeZones = []) {
  const idx = (x, y) => y * WORLD_WIDTH + x
  // How far below the primary surface counts as "underground"
  const MIN_DEPTH = 20
  // Tiles of air needed above the floor for the village sprite + label
  const CLEARANCE = 8

  const candidates = []

  for (let y = CLEARANCE + 1; y < WORLD_HEIGHT - TERRAIN.BEDROCK_DEPTH - 2; y++) {
    let runStart = -1
    let runLen = 0

    const endRun = () => {
      if (runLen >= minWidth) {
        const cx = runStart + Math.floor((runLen - minWidth) / 2)
        let blocked = false
        for (const zone of excludeZones) {
          const d = Math.min(Math.abs(cx - zone.x), WORLD_WIDTH - Math.abs(cx - zone.x))
          if (d < zone.radius) { blocked = true; break }
        }
        if (!blocked) candidates.push({ x: cx, y })
      }
      runStart = -1
      runLen = 0
    }

    for (let x = 0; x < WORLD_WIDTH; x++) {
      const tile = grid[idx(x, y)]
      const isUnderground = y > surfaceHeights[x] + MIN_DEPTH

      if ((tile === TILES.SURFACE || tile === TILES.SAND) && isUnderground) {
        // Verify air clearance; decorative tiles (grass, mushrooms) are fine
        let clear = true
        for (let dy = 1; dy <= CLEARANCE; dy++) {
          const above = grid[idx(x, y - dy)]
          if (above !== TILES.AIR && above !== TILES.TALL_GRASS && above !== TILES.MUSHROOM) {
            clear = false; break
          }
        }
        if (clear) {
          if (runStart === -1) runStart = x
          runLen++
          continue
        }
      }
      endRun()
    }
    endRun()
  }

  if (candidates.length === 0) return null
  return candidates[Math.floor(rng() * candidates.length)]
}

// Find a flat surface spot; scans primary surface heights.
export function findFlatSurface(surfaceHeights, minWidth, rng, excludeZones = []) {
  let bestX = -1
  let bestFlatness = Infinity

  for (let attempt = 0; attempt < 200; attempt++) {
    const x = Math.floor(rng() * (WORLD_WIDTH - minWidth))

    let tooClose = false
    for (const zone of excludeZones) {
      const dist = Math.abs(x - zone.x)
      const wrappedDist = Math.min(dist, WORLD_WIDTH - dist)
      if (wrappedDist < zone.radius) { tooClose = true; break }
    }
    if (tooClose) continue

    let maxVariation = 0
    const baseY = surfaceHeights[x]
    for (let dx = 0; dx < minWidth; dx++) {
      const diff = Math.abs(surfaceHeights[x + dx] - baseY)
      if (diff > maxVariation) maxVariation = diff
    }
    if (maxVariation < bestFlatness) {
      bestFlatness = maxVariation
      bestX = x
    }
    if (bestFlatness <= 2) break
  }

  return bestX
}

// Find a suitable underground location for a tablet.
export function findTabletLocation(grid, surfaceHeights, rng) {
  const idx = (x, y) => y * WORLD_WIDTH + x

  for (let attempt = 0; attempt < 200; attempt++) {
    const x = Math.floor(rng() * WORLD_WIDTH)
    const surfaceY = Math.floor(surfaceHeights[x])
    const minY = surfaceY + 30
    const maxY = WORLD_HEIGHT - 20
    if (minY >= maxY) continue

    const y = Math.floor(minY + rng() * (maxY - minY))
    if (grid[idx(x, y)] === TILES.AIR && y + 1 < WORLD_HEIGHT && grid[idx(x, y + 1)] !== TILES.AIR) {
      return { x, y }
    }
  }

  const x = Math.floor(rng() * WORLD_WIDTH)
  return { x, y: Math.floor(surfaceHeights[x]) - 1 }
}
