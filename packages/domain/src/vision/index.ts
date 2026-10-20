// What the party sees in a map (R-15, R-40 to R-46), and what that shows
// (D-271).
//
// **Sight is of space, not of surfaces.** The question asked of every empty
// cube near a member is *could you see someone standing here?* — straight
// lines from the eye to a handful of points inside it, and any one that gets
// through is enough (R-41). The blocks around the space seen are the ones
// shown: the floor under it, the walls beside it, the ceiling over it, and
// any block sitting in a cube that was seen (R-42). The same answer will say
// whether a silver token standing there is seen, when there are silver tokens
// (D-255).
//
// What falls out is R-43's rule of thumb: the eye, 1.2 cubes up, sees into the
// space beyond a one-cube wall and so the floor there; two cubes block; and
// standing one cube higher buys one more cube of wall.
//
// Only blocks occlude, and only those whose material says so (R-74, R-75) —
// and props that say so as they stand now: a closed door, a bookcase (D-322).
// Tokens never do.

import { lineIsClear, cubeGrid, cubeIndex, cubeAt } from '@tt/geometry';
import type { Blocks, CubeGrid, Point } from '@tt/geometry';
import type { BlockCoord, EncounterMap, Prop } from '../map/index.js';
import { MAP_MAX_HEIGHT, MAP_MIN_DEPTH, parseBlockKey } from '../map/index.js';
import { DEFAULT_MATERIALS, materialById, materialIn } from '../materials/index.js';
import type { PartyMember } from '../party/index.js';
import type { Tokens } from '../tokens/index.js';
import type { Opened } from '../props/index.js';
import { NONE_OPEN, propCubes, propRules } from '../props/index.js';

/**
 * Eye height, as a ratio of the cube, above the floor of the token's cube
 * (R-43). Strictly between 1 and 2 (R-43a): at 1 or below a one-cube wall
 * blocks, and at 2 or above a two-cube wall stops blocking.
 */
export const EYE_HEIGHT = 1.2;

/**
 * Where the eye sits when the cube above the token stops sight: just under
 * that ceiling, inside the token's own cube (D-272). A token may stand in a
 * passage one cube high (R-184), and an eye inside the block over its head
 * would see nothing at all.
 */
export const EYE_UNDER_CEILING = 0.9;

/**
 * Cubes, by the same `x,y,z` key a map's blocks use: the space the party has
 * seen, or sees now.
 */
export type Cells = ReadonlySet<string>;

export const NO_CELLS: Cells = new Set();

/** What a cube of the map is, to sight. */
const EMPTY = 0;
/** A block sight passes through: glass, water (R-75). */
const CLEAR = 1;
/** A block that stops sight. */
const SOLID = 2;

/**
 * The points tested inside a cube (R-41): its middle, then the four top
 * corners, then the four bottom ones — the top first because over a wall is
 * where a line most often gets through. Inset from the faces, so no line runs
 * along a grid plane by construction.
 */
const INSET = 0.08;
const FAR = 1 - INSET;
const SAMPLES: readonly (readonly [number, number, number])[] = [
  [0.5, 0.5, 0.5],
  [INSET, FAR, INSET], [FAR, FAR, INSET], [INSET, FAR, FAR], [FAR, FAR, FAR],
  [INSET, INSET, INSET], [FAR, INSET, INSET], [INSET, INSET, FAR], [FAR, INSET, FAR],
];

/** The six neighbours across a face, and the cube itself. */
const AROUND: readonly (readonly [number, number, number])[] = [
  [0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

/**
 * The map as sight sees it: one number a cube, over the map's whole box.
 *
 * Once per body, because the domain is immutable and an edit makes a new one
 * (R-165) — the same reasoning, and the same `WeakMap`, as D-219's wire cache.
 * An unknown material stops sight, the way the stage draws one solid.
 */
const grids = new WeakMap<EncounterMap, WeakMap<ReadonlySet<string>, CubeGrid>>();
const NO_STOPS: ReadonlySet<string> = new Set();

/**
 * The map as sight sees it, with these cubes stopping sight as well — the
 * props that do, as they stand now (D-322). Per body and per set, both
 * replaced on change (R-165).
 */
function sightGrid(map: EncounterMap, walls: ReadonlySet<string> = NO_STOPS): CubeGrid {
  let byWalls = grids.get(map);
  if (!byWalls) { byWalls = new WeakMap(); grids.set(map, byWalls); }
  const cached = byWalls.get(walls);
  if (cached) return cached;
  const grid = cubeGrid(
    { x: map.origin.x, y: MAP_MIN_DEPTH, z: map.origin.z },
    { x: map.size.x, y: MAP_MAX_HEIGHT - MAP_MIN_DEPTH, z: map.size.z },
  );
  const stops = new Map<string, boolean>();
  for (const [key, swatch] of map.blocks) {
    const at = parseBlockKey(key);
    if (!at) continue;
    const index = cubeIndex(grid, at.x, at.y, at.z);
    if (index < 0) continue;
    let blocks = stops.get(swatch);
    if (blocks === undefined) {
      blocks = materialById(DEFAULT_MATERIALS, materialIn(swatch))?.blocksSight ?? true;
      stops.set(swatch, blocks);
    }
    grid.cells[index] = blocks ? SOLID : CLEAR;
  }
  for (const key of walls) {
    const at = parseBlockKey(key);
    if (!at) continue;
    const index = cubeIndex(grid, at.x, at.y, at.z);
    if (index >= 0 && grid.cells[index] === EMPTY) grid.cells[index] = SOLID;
  }
  byWalls.set(walls, grid);
  return grid;
}

/** The props that stop sight in this map, open ones aside. */
const stopsIn = (map: EncounterMap, opened: Opened) =>
  (map.props.length === 0 ? NO_STOPS : propRules(map.props, opened).sight);

/**
 * Where a member standing in this cube looks from (R-43): the middle of the
 * cube, 1.2 up from its floor — or just under the ceiling, when the cube above
 * stops sight (D-272).
 */
export function eyeOf(map: EncounterMap, at: BlockCoord, opened: Opened = NONE_OPEN): Point {
  const ceiling = cubeAt(sightGrid(map, stopsIn(map, opened)), at.x, at.y + 1, at.z) === SOLID;
  return { x: at.x + 0.5, y: at.y + (ceiling ? EYE_UNDER_CEILING : EYE_HEIGHT), z: at.z + 0.5 };
}

/** The squared distance from a point to the nearest part of a cube. */
function nearest(eye: Point, x: number, y: number, z: number): number {
  const dx = eye.x < x ? x - eye.x : eye.x > x + 1 ? eye.x - x - 1 : 0;
  const dy = eye.y < y ? y - eye.y : eye.y > y + 1 ? eye.y - y - 1 : 0;
  const dz = eye.z < z ? z - eye.z : eye.z > z + 1 ? eye.z - z - 1 : 0;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * The space one member sees from a cube, out to a range in cubes (R-46).
 *
 * Only space that could show something is asked about: an empty cube touching
 * a block, or a block sight passes through. Open air with nothing around it
 * has nothing to show and nobody can stand in it, and leaving it out is most
 * of what makes this cheap.
 *
 * The range is measured from the eye, as the crow flies, to the point that is
 * seen.
 */
export function memberSight(map: EncounterMap, at: BlockCoord, range: number, opened: Opened = NONE_OPEN): Cells {
  const seen = new Set<string>();
  if (!(range > 0)) return seen;
  const grid = sightGrid(map, stopsIn(map, opened));
  const eye = eyeOf(map, at, opened);
  const blocks: Blocks = (x, y, z) => cubeAt(grid, x, y, z) === SOLID;
  const reach = range * range;

  const from = (centre: number, min: number) => Math.max(min, Math.floor(centre - range));
  const to = (centre: number, min: number, size: number) => Math.min(min + size - 1, Math.floor(centre + range));
  const { min, size } = grid;

  for (let y = from(eye.y, min.y); y <= to(eye.y, min.y, size.y); y++) {
    for (let z = from(eye.z, min.z); z <= to(eye.z, min.z, size.z); z++) {
      for (let x = from(eye.x, min.x); x <= to(eye.x, min.x, size.x); x++) {
        const here = cubeAt(grid, x, y, z);
        if (here === SOLID) continue;
        if (here === EMPTY && !touchesBlock(grid, x, y, z)) continue;
        if (nearest(eye, x, y, z) > reach) continue;
        if (seesInto(blocks, eye, x, y, z, reach)) seen.add(`${x},${y},${z}`);
      }
    }
  }
  return seen;
}

function touchesBlock(grid: CubeGrid, x: number, y: number, z: number): boolean {
  return cubeAt(grid, x + 1, y, z) !== EMPTY || cubeAt(grid, x - 1, y, z) !== EMPTY
    || cubeAt(grid, x, y + 1, z) !== EMPTY || cubeAt(grid, x, y - 1, z) !== EMPTY
    || cubeAt(grid, x, y, z + 1) !== EMPTY || cubeAt(grid, x, y, z - 1) !== EMPTY;
}

/** Whether any line from the eye reaches a point inside this cube (R-41). */
function seesInto(blocks: Blocks, eye: Point, x: number, y: number, z: number, reach: number): boolean {
  for (const [fx, fy, fz] of SAMPLES) {
    const point = { x: x + fx, y: y + fy, z: z + fz };
    const dx = point.x - eye.x;
    const dy = point.y - eye.y;
    const dz = point.z - eye.z;
    if (dx * dx + dy * dy + dz * dz > reach) continue;
    if (lineIsClear(blocks, eye, point)) return true;
  }
  return false;
}

/**
 * The space the whole party sees: what any one member sees (R-15). Each
 * member's own range (R-46); a member who is not standing in this map sees
 * nothing in it.
 *
 * Kept per body, tokens and roster, so the host working it out after an
 * intent and the filter sending it to each screen pay for it once — all three
 * are immutable and replaced on change (R-165).
 */
const sights = new WeakMap<EncounterMap, WeakMap<Tokens, WeakMap<readonly PartyMember[], WeakMap<Opened, Cells>>>>();

/**
 * `opened` is which props stand open in this map (D-322): a closed door stops
 * sight and an open one does not, so the save's answer goes in.
 */
export function partySight(
  map: EncounterMap,
  tokens: Tokens,
  party: readonly PartyMember[],
  opened: Opened = NONE_OPEN,
): Cells {
  let byTokens = sights.get(map);
  if (!byTokens) { byTokens = new WeakMap(); sights.set(map, byTokens); }
  let byParty = byTokens.get(tokens);
  if (!byParty) { byParty = new WeakMap(); byTokens.set(tokens, byParty); }
  let byOpened = byParty.get(party);
  if (!byOpened) { byOpened = new WeakMap(); byParty.set(party, byOpened); }
  const cached = byOpened.get(opened);
  if (cached) return cached;

  const seen = new Set<string>();
  for (const member of party) {
    const at = tokens.get(member.id);
    if (!at) continue;
    for (const key of memberSight(map, at, member.visionRange, opened)) seen.add(key);
  }
  byOpened.set(opened, seen);
  return seen;
}

/**
 * What the party has seen, grown by what it sees now. Cumulative (R-45): once
 * seen, a cube stays known, which is what stops fog strobing as tokens move.
 * Identity-preserving (R-165): nothing new hands back the same set.
 */
export function explore(explored: Cells, seen: Cells): Cells {
  let grown: Set<string> | null = null;
  for (const key of seen) {
    if (explored.has(key)) continue;
    grown ??= new Set(explored);
    grown.add(key);
  }
  return grown ?? explored;
}

/**
 * The blocks this space shows (D-271): every block in a cube of it, or across
 * a face from one. The floor under a cube seen, the wall beside it, the
 * ceiling over it — and, for explored space, whatever stands there *now*.
 * Explored is what the party knows of the map as it is, not a memory of how it
 * looked.
 *
 * Kept per body and per set of cubes, because the filter asks on every message
 * and the answer only changes when one of the two does.
 */
const shows = new WeakMap<EncounterMap, WeakMap<Cells, ReadonlySet<string>>>();

export function shownBy(map: EncounterMap, cells: Cells): ReadonlySet<string> {
  let byCells = shows.get(map);
  if (!byCells) { byCells = new WeakMap(); shows.set(map, byCells); }
  const cached = byCells.get(cells);
  if (cached) return cached;

  const grid = sightGrid(map);
  const shown = new Set<string>();
  for (const key of cells) {
    const at = parseBlockKey(key);
    if (!at) continue;
    for (const [dx, dy, dz] of AROUND) {
      const x = at.x + dx;
      const y = at.y + dy;
      const z = at.z + dz;
      if (cubeAt(grid, x, y, z) !== EMPTY) shown.add(`${x},${y},${z}`);
    }
  }
  byCells.set(cells, shown);
  return shown;
}

/**
 * Everything sight shows now (D-332): the blocks it shows (`shownBy`), and the
 * cubes of every prop it shows (`propsSeen`) — the fog's *in sight*, for props
 * as for blocks. Props are no blocks, so a fog worked out from blocks alone
 * left every prop drawn as if in sight however far the party had walked away.
 *
 * Kept per body and per set of cubes, for `shownBy`'s reason.
 */
const showsNow = new WeakMap<EncounterMap, WeakMap<Cells, ReadonlySet<string>>>();

export function sightShows(map: EncounterMap, sight: Cells): ReadonlySet<string> {
  const blocks = shownBy(map, sight);
  if (map.props.length === 0) return blocks;
  let bySight = showsNow.get(map);
  if (!bySight) { bySight = new WeakMap(); showsNow.set(map, bySight); }
  const cached = bySight.get(sight);
  if (cached) return cached;
  const seen = propsSeen(map.props, sight);
  if (seen.length === 0) { bySight.set(sight, blocks); return blocks; }
  const all = new Set(blocks);
  for (const prop of seen) for (const cube of propCubes(prop)) all.add(`${cube.x},${cube.y},${cube.z}`);
  bySight.set(sight, all);
  return all;
}

/**
 * The props the party has seen (D-322): a prop is shown as a block is, once a
 * cube of it, or one across a face from it, has been seen — so a shut door is
 * seen from the room it closes, not from beyond it.
 *
 * **One rule, two readers** (D-311's lesson, D-331): the host cuts the
 * table's payload with it, and the console's Party's view draws with it. The
 * preview drew every prop for a round, so a fresh start that made the party
 * forget a room left its furniture standing in the GM's picture of the table.
 * Identity-preserving: all of them seen hands back the same list.
 */
export function propsSeen<P extends Prop>(props: readonly P[], explored: Cells): readonly P[] {
  if (props.length === 0) return props;
  const seen = props.filter((prop) => propCubes(prop).some((cube) => AROUND.some(([dx, dy, dz]) =>
    explored.has(`${cube.x + dx},${cube.y + dy},${cube.z + dz}`))));
  return seen.length === props.length ? props : seen;
}

/**
 * A map holding only the blocks the party has been shown (R-85): what the
 * table is sent. Kept per body and per set, so an unchanged answer is the same
 * object and the wire's own cache recognises it (D-219).
 */
const seenMaps = new WeakMap<EncounterMap, WeakMap<Cells, EncounterMap>>();

export function seenPart(map: EncounterMap, explored: Cells): EncounterMap {
  let byCells = seenMaps.get(map);
  if (!byCells) { byCells = new WeakMap(); seenMaps.set(map, byCells); }
  const cached = byCells.get(explored);
  if (cached) return cached;
  const shown = shownBy(map, explored);
  const blocks = new Map([...map.blocks].filter(([key]) => shown.has(key)));
  // The GM's notes on props stay the GM's (D-357): the party sees the chest, not what is written on it.
  const seen = propsSeen(map.props, explored);
  const props = seen.some((prop) => prop.note !== undefined)
    ? seen.map((prop) => { const { note: _, ...rest } = prop; return rest; })
    : seen;
  const part: EncounterMap = { ...map, blocks, props };
  byCells.set(explored, part);
  return part;
}

// -- storage (R-59) ----------------------------------------------------------

/**
 * A set of cubes, packed: the box they fit in, and runs over it ordered y,
 * then z, then x — `[unseen, seen, unseen, seen, …]`, starting with the
 * unseen. One value a cube is packed (R-59), and seen space comes in long
 * runs: a floor seen is a row of cubes side by side.
 *
 * The box is the set's own, and it is written with it, so a map growing in
 * any direction afterwards cannot shift what was seen (R-61a's lesson).
 */
export interface CellsJSON {
  origin: { x: number; y: number; z: number };
  size: { x: number; y: number; z: number };
  runs: number[];
}

export function cellsToJSON(cells: Cells): CellsJSON {
  const at: BlockCoord[] = [];
  const low = { x: Infinity, y: Infinity, z: Infinity };
  const high = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const key of cells) {
    const cube = parseBlockKey(key);
    if (!cube) continue;
    at.push(cube);
    low.x = Math.min(low.x, cube.x); low.y = Math.min(low.y, cube.y); low.z = Math.min(low.z, cube.z);
    high.x = Math.max(high.x, cube.x); high.y = Math.max(high.y, cube.y); high.z = Math.max(high.z, cube.z);
  }
  if (at.length === 0) return { origin: { x: 0, y: 0, z: 0 }, size: { x: 0, y: 0, z: 0 }, runs: [] };

  const size = { x: high.x - low.x + 1, y: high.y - low.y + 1, z: high.z - low.z + 1 };
  const indices = at
    .map((c) => ((c.y - low.y) * size.z + (c.z - low.z)) * size.x + (c.x - low.x))
    .sort((a, b) => a - b);
  const runs: number[] = [];
  let cursor = 0;
  let i = 0;
  while (i < indices.length) {
    const start = indices[i]!;
    let end = start + 1;
    i += 1;
    // Consecutive cubes extend the run; a repeat, which a set cannot hold but
    // a key written two ways could, is skipped rather than counted twice.
    while (i < indices.length && indices[i]! <= end) {
      if (indices[i] === end) end += 1;
      i += 1;
    }
    runs.push(start - cursor, end - start);
    cursor = end;
  }
  const total = size.x * size.y * size.z;
  if (total > cursor) runs.push(total - cursor);
  return { origin: { ...low }, size, runs };
}

/**
 * Unpacks a set, or reads it as nothing seen when the runs do not add up.
 *
 * Not refused, unlike a body (R-59's two answers): a map with a stream that
 * does not add up is a map drawn askew, but sight forgotten is only sight to
 * be seen again, and it is, the moment anybody looks.
 */
export function cellsFromJSON(json: Readonly<CellsJSON> | null | undefined): Cells {
  if (!json || json.runs.length === 0) return NO_CELLS;
  const { origin, size, runs } = json;
  const total = size.x * size.y * size.z;
  const perLevel = size.x * size.z;
  const cells = new Set<string>();
  let cursor = 0;
  for (let i = 0; i < runs.length; i += 1) {
    const count = runs[i]!;
    if (!Number.isInteger(count) || count < 0 || cursor + count > total) return NO_CELLS;
    if (i % 2 === 1) {
      for (let k = 0; k < count; k += 1) {
        const at = cursor + k;
        const level = Math.floor(at / perLevel);
        const rest = at - level * perLevel;
        cells.add(`${origin.x + (rest % size.x)},${origin.y + level},${origin.z + Math.floor(rest / size.x)}`);
      }
    }
    cursor += count;
  }
  return cursor === total ? cells : NO_CELLS;
}
