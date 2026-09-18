// An encounter map: one voxel body belonging to one point of interest (R-145).
//
// Minecraft-shaped, not columnar. The world map stores a *height* per cell
// because geography is a surface; a map stores *blocks* because a tavern has a
// floor above your head and air under its stairs. Nothing here knows about
// vision, fog or tokens — those sit out this round entirely (D-183).
//
// Blocks are held sparsely, keyed by string. A `Map<BlockCoord, …>` would dedupe
// by reference and silently hold duplicates of the same cell, which is the trap
// R-123 already names for chunk coordinates.

import type { MaterialId } from '../ids/index.js';
import { DEFAULT_FLOOR } from '../materials/index.js';
import type { CuttingPlane, LevelRange, PlaneJSON } from '../planes/index.js';
import { inRange, planesToJSON, planesFromJSON } from '../planes/index.js';

/** Cells along one side of a freshly created map, and the step `+` grows by. */
export const MAP_PATCH = 16;

/**
 * Highest a map may build, in blocks.
 *
 * Bounded because the camera has to know how much to draw, and because the
 * cutting range (R-146) needs a ceiling to be a range *of* something. 32 at the
 * 1.5 m encounter cell is 48 m — a cathedral, a four-storey building with room
 * over the roof, or a dungeon four levels deep.
 */
export const MAP_MAX_HEIGHT = 32;

export interface BlockCoord {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface EncounterMap {
  /**
   * The lowest cell the map owns in X and Z (R-150).
   *
   * `{0, 0}` for a new map, and it goes **negative** when the GM expands
   * north-east or north-west. This exists so that growing in those directions
   * does not have to renumber every block that is already placed — a renumber is
   * how saved references rot, and it would silently move a wall relative to
   * anything that remembered where it was.
   */
  readonly origin: { readonly x: number; readonly z: number };
  /** Cells in X and Z. Grows with the expand rose (R-150); never shrinks. */
  readonly size: { readonly x: number; readonly z: number };
  /** Filled cells only, keyed by `blockKey`. Absent means air. */
  readonly blocks: ReadonlyMap<string, MaterialId>;
  /**
   * The GM's named horizontal cuts (R-146). Authored, ordered by height.
   *
   * On the map rather than in the save because they are part of the building:
   * a tavern has a cellar floor whether or not anyone is playing in it. Where
   * the party's attention sits *between* them is play state.
   */
  readonly planes: readonly CuttingPlane[];
}

/**
 * Where the GM can extend a map — the **intercardinals**, and that is not a
 * quirk of naming (D-198).
 *
 * North is the `(-1, -1)` diagonal of the cell grid, chosen so that it points
 * straight up in the view a campaign opens on. The camera is deliberately
 * diagonal to the grid (R-31) so the ground reads as a diamond, which means the
 * grid's *axes* are what run diagonally on screen. Naming them north-east and
 * so on is the arrangement that puts every label where the growth appears.
 */
export type Expand = 'northeast' | 'southeast' | 'southwest' | 'northwest';

/**
 * Which way each direction lies in cell space.
 *
 * Read it off the screen at the default view: `-Z` climbs to the upper right,
 * `+X` falls to the lower right, and the other two mirror them.
 */
const STEPS: Record<Expand, { readonly x: number; readonly z: number }> = {
  northeast: { x: 0, z: -1 },
  southeast: { x: 1, z: 0 },
  southwest: { x: 0, z: 1 },
  northwest: { x: -1, z: 0 },
};

export function blockKey(at: BlockCoord): string {
  return `${at.x},${at.y},${at.z}`;
}

export function parseBlockKey(key: string): BlockCoord | null {
  const parts = key.split(',');
  if (parts.length !== 3) return null;
  const [x, y, z] = parts.map(Number);
  if (x === undefined || y === undefined || z === undefined) return null;
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) return null;
  return { x, y, z };
}

export function inMap(map: EncounterMap, at: BlockCoord): boolean {
  return Number.isInteger(at.x) && Number.isInteger(at.y) && Number.isInteger(at.z)
    && at.x >= map.origin.x && at.x < map.origin.x + map.size.x
    && at.z >= map.origin.z && at.z < map.origin.z + map.size.z
    && at.y >= 0 && at.y < MAP_MAX_HEIGHT;
}

export function blockAt(map: EncounterMap, at: BlockCoord): MaterialId | null {
  return map.blocks.get(blockKey(at)) ?? null;
}

/**
 * A new map: a flat floor at Y0 across the whole patch (R-149).
 *
 * An empty grid would give the GM nothing to click, and face-adjacency placement
 * (R-147) needs a face to begin from — the same reason a new chunk is created
 * flat and entirely water rather than as nothing (R-78).
 */
export function createMap(material: MaterialId = DEFAULT_FLOOR): EncounterMap {
  const blocks = new Map<string, MaterialId>();
  for (let x = 0; x < MAP_PATCH; x += 1) {
    for (let z = 0; z < MAP_PATCH; z += 1) {
      blocks.set(blockKey({ x, y: 0, z }), material);
    }
  }
  return { origin: { x: 0, z: 0 }, size: { x: MAP_PATCH, z: MAP_PATCH }, blocks, planes: [] };
}

/** Identity-preserving: placing what is already there returns the same map (R-12). */
export function setBlock(
  map: EncounterMap,
  at: BlockCoord,
  material: MaterialId,
): EncounterMap {
  if (!inMap(map, at)) return map;
  const key = blockKey(at);
  if (map.blocks.get(key) === material) return map;
  const blocks = new Map(map.blocks);
  blocks.set(key, material);
  return { ...map, blocks };
}

export function clearBlock(map: EncounterMap, at: BlockCoord): EncounterMap {
  const key = blockKey(at);
  if (!map.blocks.has(key)) return map;
  const blocks = new Map(map.blocks);
  blocks.delete(key);
  return { ...map, blocks };
}

/**
 * Extends the map by one patch in a compass direction (R-150).
 *
 * The two directions that run toward lower coordinates move the **origin**
 * instead of renumbering the body. Every block keeps the coordinate it already
 * had, whichever way the map grows — the alternative is shifting thousands of
 * keys and hoping nothing remembered one.
 */
export function growMap(map: EncounterMap, towards: Expand): EncounterMap {
  const step = STEPS[towards];
  // A negative step pushes the origin out; a positive one only adds width.
  const origin = {
    x: map.origin.x + (step.x < 0 ? -MAP_PATCH : 0),
    z: map.origin.z + (step.z < 0 ? -MAP_PATCH : 0),
  };
  const size = {
    x: map.size.x + (step.x !== 0 ? MAP_PATCH : 0),
    z: map.size.z + (step.z !== 0 ? MAP_PATCH : 0),
  };

  // The new ground is floored, for the same reason the first patch is (R-149).
  const blocks = new Map(map.blocks);
  const floor = map.blocks.get(blockKey({ x: map.origin.x, y: 0, z: map.origin.z }))
    ?? DEFAULT_FLOOR;
  const was = (x: number, z: number) =>
    x >= map.origin.x && x < map.origin.x + map.size.x
    && z >= map.origin.z && z < map.origin.z + map.size.z;
  for (let x = origin.x; x < origin.x + size.x; x += 1) {
    for (let z = origin.z; z < origin.z + size.z; z += 1) {
      if (was(x, z)) continue;
      blocks.set(blockKey({ x, y: 0, z }), floor);
    }
  }
  // Spread, so the planes the GM named come along. A cut at "cellar ceiling" is
  // still at that height after the footprint grows sideways.
  return { ...map, origin, size, blocks };
}

/** The middle of the footprint, for framing a camera on it (R-152). */
export function mapCentre(map: EncounterMap): { readonly x: number; readonly z: number } {
  return { x: map.origin.x + map.size.x / 2, z: map.origin.z + map.size.z / 2 };
}

/**
 * The six cells sharing a face with this one.
 *
 * Faces, not edges or corners — the same adjacency a block is *placed* by
 * (R-147), and the 3D reading of a 2D paint bucket's four neighbours. Two cubes
 * touching only along an edge are a diagonal seam, which R-44 treats as sealed;
 * a fill that leaked through one would cross a wall the GM built as solid.
 */
const FACE_NEIGHBOURS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

/**
 * Every block reachable from `at` through blocks of the same material (R-154).
 *
 * The region a bucket fill would repaint. Returned rather than applied so the
 * console can say how many blocks are about to change *before* the GM commits
 * to it — a fill is one click that can rewrite a wing of a building.
 *
 * Empty when the cell is air or outside the map: there is no material to match,
 * and a fill that started from nothing would have to guess what the GM meant.
 *
 * Breadth-first with an explicit queue, not recursion. A region can be the
 * whole body — tens of thousands of cells at the largest footprint — and the
 * recursive version of this function is a stack overflow waiting for a big
 * enough tavern.
 */
export function fillRegion(map: EncounterMap, at: BlockCoord): readonly BlockCoord[] {
  const seed = blockAt(map, at);
  if (!seed) return [];

  const region: BlockCoord[] = [];
  const seen = new Set<string>([blockKey(at)]);
  const queue: BlockCoord[] = [at];

  while (queue.length > 0) {
    const cell = queue.pop()!;
    region.push(cell);
    for (const [dx, dy, dz] of FACE_NEIGHBOURS) {
      const next = { x: cell.x + dx, y: cell.y + dy, z: cell.z + dz };
      const key = blockKey(next);
      if (seen.has(key)) continue;
      // `inMap` is checked before the material so a fill cannot walk out of the
      // footprint into coordinates the map does not own.
      if (!inMap(map, next) || map.blocks.get(key) !== seed) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return region;
}

/**
 * Repaints the connected region at `at` (R-154). Identity-preserving (R-12).
 *
 * Only the *material* changes: a fill never adds or removes a block, so the
 * shape of the building is the same after it as before. That is what makes it
 * safe to hand a one-click tool this much reach.
 */
export function fillMaterial(
  map: EncounterMap,
  at: BlockCoord,
  material: MaterialId,
): EncounterMap {
  if (blockAt(map, at) === material) return map;
  const region = fillRegion(map, at);
  if (region.length === 0) return map;
  const blocks = new Map(map.blocks);
  for (const cell of region) blocks.set(blockKey(cell), material);
  return { ...map, blocks };
}

/**
 * The map as the table may see it: only the blocks inside the range (R-146).
 *
 * A *filter*, not a flag. R-85's standard is that a secret is never sent, so a
 * cellar the GM has cut away is absent from the payload rather than present and
 * undrawn — the table cannot leak what it was never given.
 *
 * The footprint and the planes travel whole. The footprint because the table
 * still has to know how big the floor is, and the planes because their names
 * are not secrets — the party can be told there is a level called "cellar"
 * without being shown what is in it.
 */
export function sliceOf(map: EncounterMap, range: LevelRange): EncounterMap {
  const blocks = new Map<string, MaterialId>();
  for (const [key, material] of map.blocks) {
    const at = parseBlockKey(key);
    if (at && inRange(range, at.y)) blocks.set(key, material);
  }
  return { ...map, blocks };
}

/** The highest filled Y, or -1 for a map with nothing in it. */
export function topOfMap(map: EncounterMap): number {
  let top = -1;
  for (const key of map.blocks.keys()) {
    const at = parseBlockKey(key);
    if (at && at.y > top) top = at.y;
  }
  return top;
}

/** What is always written (R-137: stamp the current shape on the way out). */
export interface MapJSON {
  origin: { x: number; z: number };
  size: { x: number; z: number };
  /** `"x,y,z": materialId`. Sorted on the way out so an autosave does not churn. */
  blocks: Record<string, string>;
  planes: PlaneJSON[];
}

/**
 * What may arrive on the way *in* — the tolerance, and only in this direction
 * (R-137a).
 *
 * An older file has no origin, because a map could only grow away from it, and
 * no planes, because nobody could cut one. Both absences say what they mean, so
 * neither needed a schema bump (D-187's reasoning, twice over).
 */
export type MapJSONIn =
  Omit<MapJSON, 'origin' | 'planes'>
  & { origin?: { x: number; z: number } | undefined; planes?: PlaneJSON[] | undefined };

export function mapToJSON(map: EncounterMap): MapJSON {
  const blocks: Record<string, string> = {};
  for (const key of [...map.blocks.keys()].sort()) {
    blocks[key] = map.blocks.get(key)!;
  }
  return {
    origin: { x: map.origin.x, z: map.origin.z },
    size: { x: map.size.x, z: map.size.z },
    blocks,
    planes: planesToJSON(map.planes),
  };
}

/**
 * The footprint a map should have: one that contains every block it holds, is
 * never smaller than the one it declared, and moves as little as possible
 * (R-157).
 *
 * A map should never hold a block outside its own bounds, and one was found that
 * did: 64 by 64 of floor running from -16 to 47 on a map whose stored origin
 * said zero (D-199). `inMap` rejects those cells, so the GM could see that floor
 * and not erase it, paint it or fill through it.
 *
 * Two repairs, and which one applies is decided by the blocks:
 *
 * - **Slide**, when the blocks fit inside the declared size. That was the case
 *   found: the size was right and only the origin had gone missing, so the
 *   footprint moves to sit over the work and keeps its width. Widening instead
 *   would invent empty footprint on the far side — in-bounds cells with no
 *   floor under them, which R-149 says a map does not have.
 * - **Widen**, when the blocks genuinely span more than the declared size.
 *   Exactly to the blocks, since that is the smallest honest answer.
 *
 * It never *shrinks*. A map dug hollow still owns the ground it was given:
 * growing is the GM's decision, and erasing a corner is not a request to give
 * it back. Between the blocks and the bookkeeping, the blocks are the work.
 */
export function enclosing(
  origin: { readonly x: number; readonly z: number },
  size: { readonly x: number; readonly z: number },
  blocks: ReadonlyMap<string, MaterialId>,
): { origin: { x: number; z: number }; size: { x: number; z: number } } {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const key of blocks.keys()) {
    const at = parseBlockKey(key);
    if (!at) continue;
    if (at.x < minX) minX = at.x;
    if (at.z < minZ) minZ = at.z;
    if (at.x > maxX) maxX = at.x;
    if (at.z > maxZ) maxZ = at.z;
  }
  // Nothing in it to be outside of.
  if (minX === Infinity) return { origin: { x: origin.x, z: origin.z }, size: { x: size.x, z: size.z } };

  const axis = (from: number, width: number, low: number, high: number) => {
    const span = high - low + 1;
    if (span > width) return { from: low, width: span };
    if (low < from) return { from: low, width };
    if (high >= from + width) return { from: high - width + 1, width };
    return { from, width };
  };

  const x = axis(origin.x, size.x, minX, maxX);
  const z = axis(origin.z, size.z, minZ, maxZ);
  return { origin: { x: x.from, z: z.from }, size: { x: x.width, z: z.width } };
}

export function mapFromJSON(json: MapJSONIn | undefined | null): EncounterMap | null {
  if (!json) return null;
  const blocks = new Map(Object.entries(json.blocks) as [string, MaterialId][]);
  // No schema bump for the origin (D-187's reasoning): a file without one can
  // only be a map that grew in the two directions that never needed it, so
  // `{0, 0}` is not a guess — it is what that map already meant. And whatever
  // the file claims, the footprint is widened to hold what is actually in it.
  const declared = {
    origin: { x: json.origin?.x ?? 0, z: json.origin?.z ?? 0 },
    size: { x: json.size.x, z: json.size.z },
  };
  return {
    ...enclosing(declared.origin, declared.size, blocks),
    blocks,
    // No planes is the honest reading of a file that has none: a map nobody has
    // divided has exactly one range, all of it (R-146).
    planes: planesFromJSON(json.planes),
  };
}
