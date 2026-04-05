import { createNoise2D } from 'simplex-noise'
import { WORLD_WIDTH, WORLD_HEIGHT, TERRAIN } from '../core/Constants.js'
import { TILES } from './TileTypes.js'

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
// Returns a flat Uint8Array of WORLD_WIDTH * WORLD_HEIGHT tile IDs (row-major).
export function generateWorld(params) {
  const {
    element1,
    element2,
    elementRatio, // 0-10, points to element1
    skyCave,      // 0-1, low = underground-heavy, high = sky-heavy
    barrenFertile, // 0-1
    sparseDense,  // 0-1
    seed,
  } = params

  const rng = mulberry32(seed)
  const noise2D = createNoise2D(rng)

  // Second and third noise layers with different seeds
  const rng2 = mulberry32(seed + 12345)
  const noise2D_b = createNoise2D(rng2)
  const rng3 = mulberry32(seed + 67890)
  const noise2D_c = createNoise2D(rng3)

  const grid = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT)
  const idx = (x, y) => y * WORLD_WIDTH + x

  // Sky-cave slider determines where the ground sits.
  // skyCave 0 = ground near top (mostly underground), 1 = ground near bottom (mostly sky)
  const baseGroundY = Math.floor(WORLD_HEIGHT * (0.25 + skyCave * 0.35))

  // -- Pass 1: base terrain shape --
  // 1D noise along x to create the surface contour
  const surfaceHeights = new Float32Array(WORLD_WIDTH)
  for (let x = 0; x < WORLD_WIDTH; x++) {
    // Multi-octave surface noise
    let h = 0
    h += noise2D(x * TERRAIN.SURFACE_NOISE_SCALE, 0) * TERRAIN.SURFACE_AMPLITUDE
    h += noise2D(x * TERRAIN.SURFACE_NOISE_SCALE * 2, 100) * (TERRAIN.SURFACE_AMPLITUDE * 0.5)
    h += noise2D(x * TERRAIN.SURFACE_NOISE_SCALE * 4, 200) * (TERRAIN.SURFACE_AMPLITUDE * 0.25)
    surfaceHeights[x] = baseGroundY + h
  }

  // Fill terrain based on surface height
  for (let x = 0; x < WORLD_WIDTH; x++) {
    const surfaceY = Math.floor(surfaceHeights[x])
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      if (y < surfaceY) {
        grid[idx(x, y)] = TILES.AIR
      } else if (y === surfaceY) {
        grid[idx(x, y)] = TILES.SURFACE
      } else if (y < surfaceY + TERRAIN.SOIL_DEPTH) {
        grid[idx(x, y)] = TILES.SOIL
      } else if (y < WORLD_HEIGHT - TERRAIN.BEDROCK_DEPTH) {
        grid[idx(x, y)] = TILES.STONE
      } else {
        grid[idx(x, y)] = TILES.BEDROCK
      }
    }
  }

  // -- Pass 2: cave carving --
  // sparseDense controls cave density: sparse (0) = more open, dense (1) = more solid
  const caveThreshold = TERRAIN.CAVE_THRESHOLD + sparseDense * 0.25
  const caveScale = TERRAIN.CAVE_NOISE_SCALE

  for (let x = 0; x < WORLD_WIDTH; x++) {
    const surfaceY = Math.floor(surfaceHeights[x])
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      if (grid[idx(x, y)] === TILES.AIR || grid[idx(x, y)] === TILES.BEDROCK) continue
      // Only carve below the surface
      if (y <= surfaceY + 2) continue

      const n = noise2D_b(x * caveScale, y * caveScale)
      // Larger caves deeper underground
      const depthFactor = Math.min(1, (y - surfaceY) / 60)
      if (n > caveThreshold - depthFactor * 0.15) continue
      grid[idx(x, y)] = TILES.AIR
    }
  }

  // -- Pass 3: element-specific features --
  const ratio1 = elementRatio / 10 // weight of element1
  const ratio2 = 1 - ratio1
  const hasElement = (el) => el === element1 || el === element2
  const elementWeight = (el) => {
    if (el === element1) return ratio1
    if (el === element2) return ratio2
    return 0
  }

  // Water bodies (for worlds with water element)
  if (hasElement('water')) {
    const waterWeight = elementWeight('water')
    const waterLevel = Math.floor(surfaceHeights[0] + 10 + waterWeight * 15)
    for (let x = 0; x < WORLD_WIDTH; x++) {
      for (let y = Math.floor(surfaceHeights[x]); y < Math.min(waterLevel, WORLD_HEIGHT - TERRAIN.BEDROCK_DEPTH); y++) {
        if (grid[idx(x, y)] === TILES.AIR) {
          grid[idx(x, y)] = y > waterLevel - 5 ? TILES.WATER : TILES.DEEP_WATER
        }
      }
    }
    // Fill cave water pools
    fillCavePools(grid, surfaceHeights, waterWeight)
  }

  // Lava (for worlds with fire element)
  if (hasElement('fire')) {
    const fireWeight = elementWeight('fire')
    // Lava pools deep underground
    for (let x = 0; x < WORLD_WIDTH; x++) {
      for (let y = WORLD_HEIGHT - TERRAIN.BEDROCK_DEPTH - 20; y < WORLD_HEIGHT - TERRAIN.BEDROCK_DEPTH; y++) {
        if (grid[idx(x, y)] === TILES.AIR) {
          const n = noise2D_c(x * 0.05, y * 0.05)
          if (n < -0.2 + fireWeight * 0.3) {
            grid[idx(x, y)] = TILES.LAVA
          }
        }
      }
    }
    // Replace some stone with volcanic rock
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
          if (n > 0.6 - earthWeight * 0.2) {
            grid[idx(x, y)] = TILES.CLAY
          }
        }
        if (grid[idx(x, y)] === TILES.STONE) {
          const n = noise2D_c(x * 0.08 + 500, y * 0.08 + 500)
          if (n > 0.7 - earthWeight * 0.15) {
            grid[idx(x, y)] = TILES.CRYSTAL
          }
        }
      }
    }
  }

  // Air features: floating islands, clouds in the sky
  if (hasElement('air')) {
    const airWeight = elementWeight('air')
    // Floating islands above the main terrain
    if (airWeight > 0.3) {
      addFloatingIslands(grid, noise2D_c, surfaceHeights, airWeight, rng)
    }
  }

  // -- Pass 4: sand on exposed surfaces near water or in arid zones --
  if (barrenFertile < 0.5 || hasElement('fire') || hasElement('air')) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      if (grid[idx(x, Math.floor(surfaceHeights[x]))] === TILES.SURFACE) {
        const n = noise2D_c(x * 0.02, 0)
        const sandChance = (1 - barrenFertile) * 0.6
        if (n > 1 - sandChance * 2) {
          grid[idx(x, Math.floor(surfaceHeights[x]))] = TILES.SAND
          // Sand a few tiles deep
          for (let dy = 1; dy < 4; dy++) {
            const ty = Math.floor(surfaceHeights[x]) + dy
            if (ty < WORLD_HEIGHT && grid[idx(x, ty)] === TILES.SOIL) {
              grid[idx(x, ty)] = TILES.SAND
            }
          }
        }
      }
    }
  }

  // -- Pass 5: surface vegetation --
  // barrenFertile controls density: fertile = more plants
  addVegetation(grid, surfaceHeights, barrenFertile, noise2D_c, rng)

  return { grid, surfaceHeights }
}

// Simple flood-fill to create water pools in caves
function fillCavePools(grid, surfaceHeights, waterWeight) {
  const idx = (x, y) => y * WORLD_WIDTH + x
  const poolChance = 0.002 * waterWeight

  for (let x = 2; x < WORLD_WIDTH - 2; x++) {
    const surfaceY = Math.floor(surfaceHeights[x])
    for (let y = surfaceY + 15; y < WORLD_HEIGHT - 10; y++) {
      if (grid[idx(x, y)] !== TILES.AIR) continue
      if (Math.random() > poolChance) continue

      // Check if this air pocket has a floor (solid below)
      if (y + 1 < WORLD_HEIGHT && grid[idx(x, y + 1)] !== TILES.AIR) {
        // Fill this pocket and adjacent air tiles with water
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
          // Spread horizontally and down, not up (gravity)
          queue.push([cx - 1, cy], [cx + 1, cy], [cx, cy + 1])
        }
      }
    }
  }
}

// Place floating islands for air-heavy worlds
function addFloatingIslands(grid, noise2D, surfaceHeights, airWeight, rng) {
  const idx = (x, y) => y * WORLD_WIDTH + x
  const islandCount = Math.floor(3 + airWeight * 8)

  for (let i = 0; i < islandCount; i++) {
    const cx = Math.floor(rng() * WORLD_WIDTH)
    // Place islands above the surface
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
      // Elliptical shape
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

// Place trees, bushes, grass on the surface based on fertility
function addVegetation(grid, surfaceHeights, fertility, noise2D, rng) {
  const idx = (x, y) => y * WORLD_WIDTH + x
  // Higher fertility = denser vegetation
  const treeChance = 0.02 + fertility * 0.06
  const bushChance = 0.03 + fertility * 0.08
  const grassChance = 0.05 + fertility * 0.15

  for (let x = 0; x < WORLD_WIDTH; x++) {
    const surfaceY = Math.floor(surfaceHeights[x])
    if (surfaceY <= 1 || surfaceY >= WORLD_HEIGHT - 1) continue
    // Only place on solid surface tiles
    const tile = grid[idx(x, surfaceY)]
    if (tile !== TILES.SURFACE && tile !== TILES.SAND) continue
    // Skip if there's no air above
    if (surfaceY - 1 < 0 || grid[idx(x, surfaceY - 1)] !== TILES.AIR) continue

    const n = noise2D(x * 0.05, surfaceY * 0.05)
    const r = rng()

    if (r < treeChance && n > -0.2) {
      // Tree: 2-4 tiles tall trunk + leaves on top
      const treeHeight = 2 + Math.floor(rng() * 3)
      let canPlace = true
      for (let dy = 1; dy <= treeHeight + 2; dy++) {
        if (surfaceY - dy < 0 || grid[idx(x, surfaceY - dy)] !== TILES.AIR) {
          canPlace = false
          break
        }
      }
      if (canPlace) {
        // Trunk
        for (let dy = 1; dy <= treeHeight; dy++) {
          grid[idx(x, surfaceY - dy)] = TILES.TREE_TRUNK
        }
        // Leaf canopy
        const topY = surfaceY - treeHeight
        grid[idx(x, topY - 1)] = TILES.TREE_LEAVES
        grid[idx(x, topY)] = TILES.TREE_LEAVES
        if (x > 0 && grid[idx(x - 1, topY)] === TILES.AIR) grid[idx(x - 1, topY)] = TILES.TREE_LEAVES
        if (x < WORLD_WIDTH - 1 && grid[idx(x + 1, topY)] === TILES.AIR) grid[idx(x + 1, topY)] = TILES.TREE_LEAVES
        if (x > 0 && grid[idx(x - 1, topY - 1)] === TILES.AIR) grid[idx(x - 1, topY - 1)] = TILES.TREE_LEAVES
        if (x < WORLD_WIDTH - 1 && grid[idx(x + 1, topY - 1)] === TILES.AIR) grid[idx(x + 1, topY - 1)] = TILES.TREE_LEAVES
      }
    } else if (r < treeChance + bushChance && n > -0.3) {
      grid[idx(x, surfaceY - 1)] = TILES.BUSH
    } else if (r < treeChance + bushChance + grassChance) {
      grid[idx(x, surfaceY - 1)] = TILES.TALL_GRASS
    }
  }

  // Mushrooms in caves (near cave floors in dark areas)
  const mushroomChance = 0.005 + fertility * 0.01
  for (let x = 0; x < WORLD_WIDTH; x++) {
    const surfaceY = Math.floor(surfaceHeights[x])
    for (let y = surfaceY + 10; y < WORLD_HEIGHT - 10; y++) {
      if (grid[idx(x, y)] !== TILES.AIR) continue
      if (y + 1 >= WORLD_HEIGHT) continue
      const below = grid[idx(x, y + 1)]
      if (below === TILES.STONE || below === TILES.SOIL || below === TILES.CLAY) {
        if (rng() < mushroomChance) {
          grid[idx(x, y)] = TILES.MUSHROOM
        }
      }
    }
  }
}

// Find a flat surface spot suitable for placing a structure (village, etc.)
// excludeZones: array of { x, radius } to keep distance from existing placements
export function findFlatSurface(surfaceHeights, minWidth, rng, excludeZones = []) {
  let bestX = -1
  let bestFlatness = Infinity

  for (let attempt = 0; attempt < 200; attempt++) {
    const x = Math.floor(rng() * (WORLD_WIDTH - minWidth))

    // Check distance from excluded zones
    let tooClose = false
    for (const zone of excludeZones) {
      const dist = Math.abs(x - zone.x)
      const wrappedDist = Math.min(dist, WORLD_WIDTH - dist)
      if (wrappedDist < zone.radius) {
        tooClose = true
        break
      }
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

// Find a suitable underground location for a tablet
export function findTabletLocation(grid, surfaceHeights, rng) {
  const idx = (x, y) => y * WORLD_WIDTH + x

  for (let attempt = 0; attempt < 200; attempt++) {
    const x = Math.floor(rng() * WORLD_WIDTH)
    const surfaceY = Math.floor(surfaceHeights[x])
    // Place tablets in caves, at least 30 tiles below surface
    const minY = surfaceY + 30
    const maxY = WORLD_HEIGHT - 20
    if (minY >= maxY) continue

    const y = Math.floor(minY + rng() * (maxY - minY))
    // Must be in an air pocket (cave) with solid floor
    if (grid[idx(x, y)] === TILES.AIR && y + 1 < WORLD_HEIGHT && grid[idx(x, y + 1)] !== TILES.AIR) {
      return { x, y }
    }
  }

  // Fallback: place on surface if no cave found
  const x = Math.floor(rng() * WORLD_WIDTH)
  return { x, y: Math.floor(surfaceHeights[x]) - 1 }
}
