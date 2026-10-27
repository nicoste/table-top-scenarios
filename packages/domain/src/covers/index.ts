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
// under a Vegetation·leaves crown; retune the Vegetation family and every
// forest on every world follows, the same way retuning it moves every leaf in
// every building. No substance is described twice anywhere (R-194).
//
// **A cover is several of a thing, not one of it.** Two trees, two pines, two
// clumps of scrub, two boulders — because one object alone in a cell reads as
// a specimen and two read as cover. Each is a **clump**, and a clump is what
// wanders and resizes on its own: the parts of one tree hold together while
// the two trees do not (D-285).
//
// **It is a representation.** A world cell is 600 m across, so a pair of
// trees is a map symbol and not a wood — the same idiom as the place markers,
// which have been drawing a whole village as two houses since R-82.

import type { CoverId, SwatchId } from '../ids/index.js';
import { registryId } from '../ids/index.js';
// The shape vocabulary markers already settled (R-82). One list of primitives
// for the whole project: a second one would drift, and `render` would need two
// functions that mean the same thing.
import type { PartShape } from '../markers/index.js';

export interface CoverPart {
  readonly shape: PartShape;
  /**
   * How far this part is turned about its own axis, in radians.
   *
   * Added on top of the clump's own turn, and it does **not** move the part —
   * it spins where it stands. A palm's fronds are three planks at sixty
   * degrees to each other, which is one number each and no new shape.
   */
  readonly turn?: number;
  /**
   * Which object of the cover this belongs to, counted from zero.
   *
   * Parts of one clump wander, turn and resize together, so a trunk keeps its
   * crown. Two clumps do all three independently, which is what stops a cell
   * of forest from reading as a stamp (R-194).
   */
  readonly clump: number;
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
   * **Always above one** (R-195). A cover that costs nothing is scenery, and
   * scenery does not earn a permanent id — what a cell looks like is already
   * the ground's job, and the grain and the figures vary that for free.
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
const BIRCH = s('material:wood/birch');
const DARK_OAK = s('material:wood/dark-oak');
const LEAVES = s('material:vegetation');
const DARK_LEAVES = s('material:vegetation/dark');
const LIGHT_LEAVES = s('material:vegetation/light');
// Bare, because grey rock is Mineral's default cut and R-176 refuses the
// default spelled out — `material:mineral` already means it.
const ROCK = s('material:mineral');
const DARK_ROCK = s('material:mineral/dark-rock');

type Spot = readonly [number, number];

const box = (
  clump: number, at: CoverPart['at'], size: CoverPart['size'], swatch: SwatchId,
  turn = 0,
): CoverPart => ({ shape: 'box', clump, at, size, swatch, turn });
const cone = (
  clump: number, at: CoverPart['at'], size: CoverPart['size'], swatch: SwatchId,
): CoverPart => ({ shape: 'cone', clump, at, size, swatch });
const cyl = (
  clump: number, at: CoverPart['at'], size: CoverPart['size'], swatch: SwatchId,
): CoverPart => ({ shape: 'cylinder', clump, at, size, swatch });

/**
 * A broadleaf: a trunk under **two stacked boxes**, narrowing upward.
 *
 * Boxes rather than a cone, and that is the whole point of it — a cone is a
 * conifer, and a cone of one green beside a cone of another green is two
 * conifers (D-285). A stepped crown reads as a different kind of tree at a
 * glance, and it is the shape the rest of this world is already made of.
 */
const broadleaf = (clump: number, [x, z]: Spot, trunk: SwatchId, crown: SwatchId) => [
  cyl(clump, [x, 0.08, z], [0.032, 0.16, 0.032], trunk),
  box(clump, [x, 0.21, z], [0.21, 0.13, 0.21], crown),
  box(clump, [x, 0.32, z], [0.14, 0.1, 0.14], crown),
];

/**
 * A palm: a bare trunk with **three planks in a helix** at the top.
 *
 * Each frond is one plank, sixty degrees and a hair higher than the last, so
 * the thing reads as a propeller from the god camera that is the only view
 * this world is seen from. No new shape and no droop — a drooping frond needs
 * a second angle on every part to buy one tree.
 */
const palm = (clump: number, [x, z]: Spot, trunk: SwatchId, frond: SwatchId) => [
  cyl(clump, [x, 0.15, z], [0.026, 0.3, 0.026], trunk),
  box(clump, [x, 0.3, z], [0.26, 0.02, 0.07], frond, 0),
  box(clump, [x, 0.325, z], [0.26, 0.02, 0.07], frond, Math.PI / 3),
  box(clump, [x, 0.35, z], [0.26, 0.02, 0.07], frond, (Math.PI * 2) / 3),
];

/**
 * A dead tree: a trunk and two bare limbs, and **no crown at all**.
 *
 * The absence is the whole silhouette. Every other wooded cover is a trunk
 * under something; this one is the trunk on its own, which reads as blight
 * from any distance at which it reads as anything.
 */
const deadwood = (clump: number, [x, z]: Spot, trunk: SwatchId) => [
  cyl(clump, [x, 0.17, z], [0.028, 0.34, 0.028], trunk),
  box(clump, [x, 0.25, z], [0.17, 0.024, 0.024], trunk, 0.4),
  box(clump, [x, 0.31, z], [0.13, 0.02, 0.02], trunk, 2.2),
];

/** A conifer: taller, narrower, and a single cone, which is what says so. */
const conifer = (clump: number, [x, z]: Spot, trunk: SwatchId, crown: SwatchId) => [
  cyl(clump, [x, 0.06, z], [0.026, 0.12, 0.026], trunk),
  cone(clump, [x, 0.3, z], [0.115, 0.42, 0.115], crown),
];

/*
 * Where the two clumps of a cover stand before anything wanders them.
 *
 * Off-centre and not symmetric: a mirrored pair reads as a pair, and the one
 * thing a cell of forest must not look like is a stamp. Far enough apart that
 * two crowns do not merge, near enough that with the wander on top neither
 * reaches the cell edge — a cover that crosses into its neighbour makes the
 * one thing it has to say, *which cell this is*, a lie.
 */
const LEFT: Spot = [-0.15, 0.09];
const RIGHT: Spot = [0.16, -0.12];

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
    ...broadleaf(0, LEFT, OAK, LEAVES),
    ...broadleaf(1, RIGHT, OAK, LEAVES),
  ]),
  cover('pines', 'Pines', 1.5, [
    ...conifer(0, LEFT, DARK_OAK, DARK_LEAVES),
    ...conifer(1, RIGHT, DARK_OAK, DARK_LEAVES),
  ]),
  // No trunk, because the thing about scrub is that there is nothing to walk
  // under. Squat and wide where a tree is narrow and tall.
  cover('scrub', 'Scrub', 1.25, [
    cone(0, [LEFT[0], 0.07, LEFT[1]], [0.14, 0.15, 0.14], LIGHT_LEAVES),
    cone(1, [RIGHT[0], 0.055, RIGHT[1]], [0.11, 0.12, 0.11], LEAVES),
  ]),
  // Boxes, not spheres: everything else here is a cube and a smooth boulder
  // would read as a bubble sitting on a voxel world.
  cover('boulders', 'Boulders', 1.5, [
    box(0, [LEFT[0], 0.09, LEFT[1]], [0.22, 0.18, 0.2], ROCK),
    box(1, [RIGHT[0], 0.06, RIGHT[1]], [0.15, 0.12, 0.14], DARK_ROCK),
  ]),

  /*
   * Appended, not slotted in beside the other trees, because this list is
   * append-only and the panel reads it in order (R-11). Order here is only
   * presentational — nothing stores an index — but a registry that is
   * append-only except when the order looks untidy is not append-only.
   */

  // Jungle and oasis out of one entry, which is why a palm earns its place
  // where a jungle of its own would not: what makes a jungle slow is the
  // trees, and a palm is a tree. The ground under it says which one it is.
  cover('palms', 'Palms', 1.5, [
    ...palm(0, LEFT, BIRCH, LIGHT_LEAVES),
    ...palm(1, RIGHT, BIRCH, LIGHT_LEAVES),
  ]),
  cover('deadwood', 'Dead trees', 1.5, [
    ...deadwood(0, LEFT, DARK_OAK),
    ...deadwood(1, RIGHT, DARK_OAK),
  ]),
];

/** How many separate objects a cover is made of (R-194). */
export function clumpsIn(cover: Cover): number {
  return cover.parts.reduce((most, part) => Math.max(most, part.clump + 1), 0);
}

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
