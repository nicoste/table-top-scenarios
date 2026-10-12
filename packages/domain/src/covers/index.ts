// What stands on the ground: the world's second axis (D-280).
//
// A cell holds a **ground** and, usually not, a **cover**. Grass is grass;
// grass with trees on it is a forest, and nothing anywhere is called "forest".
// That is the whole reason there are two axes: enumerating Forest, Jungle,
// Taiga, Oasis and Scrub would repeat the mistake D-245 undid, where thirteen
// materials whose identity was a colour held four near-duplicate pairs. Four
// covers across nine grounds is sixty-odd combinations from thirteen permanent
// ids.
//
// **A cover is made of swatches, not colours.** A tree is a Wood·oak trunk
// under a Vegetation·leaves canopy; retune the Vegetation family and every
// forest on every world follows, the same way retuning it moves every leaf in
// every building. No substance is described twice anywhere (R-194).
//
// **It is a representation.** A world cell is 1.5 km across, so one tree is a
// map symbol and not a tree — the same idiom as the place markers, which have
// been drawing a whole village as two houses since R-82.

import type { CoverId, SwatchId } from '../ids/index.js';
import { registryId } from '../ids/index.js';
// The shape vocabulary markers already settled (R-82). One list of primitives
// for the whole project: a second one would drift, and `render` would need two
// functions that mean the same thing.
import type { PartShape } from '../markers/index.js';

export interface CoverPart {
  readonly shape: PartShape;
  /** Offset from the cover's base centre, in cell widths. y is up. */
  readonly at: readonly [number, number, number];
  /** box: full extents. cone/cylinder: [radius, height, radius]. */
  readonly size: readonly [number, number, number];
  /** What it is made of (R-194) — never a colour. */
  readonly swatch: SwatchId;
}

export interface Cover {
  readonly id: CoverId;
  readonly name: string;
  /**
   * How much harder it makes the ground it stands on (R-193).
   *
   * A **multiplier**, not a cost: grass 1 × trees 1.5 = 1.5, and sand 1.5 ×
   * trees 1.5 = 2.25, so sixty-five combinations fall out of thirteen numbers
   * and nobody hand-authors a table.
   *
   * Never `impassable`. What a party cannot cross at all is a property of the
   * ground — an ocean, a lava field — and a cover standing on passable ground
   * has never been the thing that stops them.
   */
  readonly difficulty: number;
  readonly parts: readonly CoverPart[];
}

const s = (value: string) => value as SwatchId;

const OAK = s('material:wood');
const DARK_OAK = s('material:wood/dark-oak');
const LEAVES = s('material:vegetation');
const DARK_LEAVES = s('material:vegetation/dark');
const LIGHT_LEAVES = s('material:vegetation/light');
// Bare, because grey rock is Mineral's default cut and R-176 refuses the
// default spelled out — `material:mineral` already means it.
const ROCK = s('material:mineral');
const DARK_ROCK = s('material:mineral/dark-rock');

const box = (at: CoverPart['at'], size: CoverPart['size'], swatch: SwatchId): CoverPart =>
  ({ shape: 'box', at, size, swatch });
const cone = (at: CoverPart['at'], size: CoverPart['size'], swatch: SwatchId): CoverPart =>
  ({ shape: 'cone', at, size, swatch });
const cyl = (at: CoverPart['at'], size: CoverPart['size'], swatch: SwatchId): CoverPart =>
  ({ shape: 'cylinder', at, size, swatch });

const cover = (
  value: string, name: string, difficulty: number, parts: readonly CoverPart[],
): Cover => ({
  id: registryId<'CoverId'>('cover', value),
  name,
  difficulty,
  parts,
});

/**
 * The starting set. Append-only (R-11): entries may be added, never renamed or
 * reordered, because world cells reference these ids.
 *
 * Difficulties come from the same 3.5 overland table the grounds do, read as
 * the step from open country to the same country with something growing on it:
 * forest and hills are ×1.5 against grassland, and scrub is the half-step
 * nothing in that table has a row for.
 *
 * Sizes are in cell widths and are **symbols**, deliberately small: a cover
 * marks a cell, where a place marker marks a landmark and is allowed to be
 * bigger than one (R-82).
 */
export const DEFAULT_COVERS: readonly Cover[] = [
  cover('trees', 'Trees', 1.5, [
    cyl([0, 0.1, 0], [0.045, 0.2, 0.045], OAK),
    cone([0, 0.37, 0], [0.2, 0.42, 0.2], LEAVES),
  ]),
  // Taller, narrower, darker: the same two shapes saying "conifer" rather than
  // needing a conifer of their own.
  cover('pines', 'Pines', 1.5, [
    cyl([0, 0.08, 0], [0.035, 0.16, 0.035], DARK_OAK),
    cone([0, 0.42, 0], [0.15, 0.56, 0.15], DARK_LEAVES),
  ]),
  // No trunk, because the thing about scrub is that there is nothing to walk
  // under. Two clumps so a cell does not read as one lost shrub.
  cover('scrub', 'Scrub', 1.25, [
    cone([-0.1, 0.07, 0.05], [0.13, 0.15, 0.13], LIGHT_LEAVES),
    cone([0.11, 0.055, -0.07], [0.1, 0.12, 0.1], LEAVES),
  ]),
  // Boxes, not spheres: everything else here is a cube and a smooth boulder
  // would read as a bubble sitting on a voxel world.
  cover('boulders', 'Boulders', 1.5, [
    box([-0.06, 0.09, 0.03], [0.22, 0.18, 0.2], ROCK),
    box([0.12, 0.06, -0.09], [0.15, 0.12, 0.14], DARK_ROCK),
  ]),
];

export function coverById(covers: readonly Cover[], id: CoverId): Cover | null {
  return covers.find((entry) => entry.id === id) ?? null;
}

export function isKnownCover(id: CoverId): boolean {
  return DEFAULT_COVERS.some((entry) => entry.id === id);
}

/**
 * The ground's difficulty with whatever stands on it (R-193).
 *
 * **Impassable stays impassable.** An ocean does not become more crossable
 * because something is growing in it, and `'impassable' × 1.5` is not a
 * number. It is what makes an island need a boat however it is planted.
 */
export function overCover(
  ground: number | 'impassable',
  cover: Cover | null,
): number | 'impassable' {
  if (ground === 'impassable') return 'impassable';
  return cover ? ground * cover.difficulty : ground;
}
