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
   * `{0, 0}` for a new map, and it goes **negative** when the GM expands north
   * or west. This exists so that growing in those directions does not have to
   * renumber every block that is already placed — a renumber is how saved
   * references rot, and it would silently move a wall relative to anything that
   * remembered where it was.
   */
  readonly origin: { readonly x: number; readonly z: number };
  /** Cells in X and Z. Grows with the expand rose (R-150); never shrinks. */
  readonly size: { readonly x: number; readonly z: number };
  /** Filled cells only, keyed by `blockKey`. Absent means air. */
  readonly blocks: ReadonlyMap<string, MaterialId>;
}

/** Where the GM can extend a map. The world's compass, not the screen's. */
export type Expand = 'north' | 'south' | 'east' | 'west';

/**
 * Which way each direction lies in cell space: north is **-Z**, east is **+X**.
 *
 * The same convention the compass draws (R-155) and the only one consistent with
 * a right-handed Y-up scene where the camera's default azimuth is 45 degrees.
 */
const STEPS: Record<Expand, { readonly x: number; readonly z: number }> = {
  north: { x: 0, z: -1 },
  south: { x: 0, z: 1 },
  east: { x: 1, z: 0 },
  west: { x: -1, z: 0 },
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
  return { origin: { x: 0, z: 0 }, size: { x: MAP_PATCH, z: MAP_PATCH }, blocks };
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
 * North and west move the **origin** instead of renumbering the body. Every
 * block keeps the coordinate it already had, whichever way the map grows — the
 * alternative is shifting thousands of keys and hoping nothing remembered one.
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
  return { origin, size, blocks };
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

/** The highest filled Y, or -1 for a map with nothing in it. */
export function topOfMap(map: EncounterMap): number {
  let top = -1;
  for (const key of map.blocks.keys()) {
    const at = parseBlockKey(key);
    if (at && at.y > top) top = at.y;
  }
  return top;
}

export interface MapJSON {
  /** Absent in files written before a map could grow north or west. */
  origin?: { x: number; z: number };
  size: { x: number; z: number };
  /** `"x,y,z": materialId`. Sorted on the way out so an autosave does not churn. */
  blocks: Record<string, string>;
}

export function mapToJSON(map: EncounterMap): MapJSON {
  const blocks: Record<string, string> = {};
  for (const key of [...map.blocks.keys()].sort()) {
    blocks[key] = map.blocks.get(key)!;
  }
  return {
    origin: { x: map.origin.x, z: map.origin.z },
    size: { x: map.size.x, z: map.size.z },
    blocks,
  };
}

export function mapFromJSON(json: MapJSON | undefined | null): EncounterMap | null {
  if (!json) return null;
  return {
    // No schema bump for this either (D-187's reasoning): a file without an
    // origin can only be one that grew in the two directions that never needed
    // one, so `{0, 0}` is not a guess — it is what that map already meant.
    origin: { x: json.origin?.x ?? 0, z: json.origin?.z ?? 0 },
    size: { x: json.size.x, z: json.size.z },
    blocks: new Map(Object.entries(json.blocks) as [string, MaterialId][]),
  };
}
