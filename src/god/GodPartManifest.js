// Single source of truth for all modular god part assets.
// Used by BootScene for loading and GodCreationScene for the picker UI.
// Naming pattern: {element}_{slot}_{n}.png where n is 1-9.

const BASE_PATH = 'assets/storybook_overhaul/procedural_gods'

function buildEntries(element, slot, count) {
  const entries = []
  for (let i = 1; i <= count; i++) {
    const name = `${element}_${slot}_${i}`
    entries.push({
      key: name,
      path: `${BASE_PATH}/${name}.png`,
      element,
    })
  }
  return entries
}

export const GOD_PARTS = {
  heads: [
    ...buildEntries('fire', 'heads', 9),
    ...buildEntries('water', 'heads', 9),
    ...buildEntries('air', 'heads', 9),
  ],
  bodies: [
    ...buildEntries('fire', 'bodies', 9),
    ...buildEntries('water', 'bodies', 9),
    ...buildEntries('air', 'bodies', 9),
  ],
  legs: [
    ...buildEntries('fire', 'legs', 9),
    ...buildEntries('water', 'legs', 9),
  ],
}

// All parts in a flat array for bulk loading
export const ALL_GOD_PARTS = [
  ...GOD_PARTS.heads,
  ...GOD_PARTS.bodies,
  ...GOD_PARTS.legs,
]
