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
  /** Cells in X and Z. Grows with `+` (R-150); never shrinks below what exists. */
  readonly size: { readonly x: number; readonly z: number };
  /** Filled cells only, keyed by `blockKey`. Absent means air. */
  readonly blocks: ReadonlyMap<string, MaterialId>;
}

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
    && at.x >= 0 && at.x < map.size.x
    && at.z >= 0 && at.z < map.size.z
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
  return { size: { x: MAP_PATCH, z: MAP_PATCH }, blocks };
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
 * Extends the map by one patch along an axis (R-150).
 *
 * Only outward from the origin, which keeps the coordinate of every existing
 * block unchanged. Growing "west" would mean renumbering the whole body, and a
 * renumber is how saved references rot.
 */
export function growMap(map: EncounterMap, axis: 'x' | 'z'): EncounterMap {
  const size = axis === 'x'
    ? { x: map.size.x + MAP_PATCH, z: map.size.z }
    : { x: map.size.x, z: map.size.z + MAP_PATCH };
  // The new ground is floored, for the same reason the first patch is (R-149).
  const blocks = new Map(map.blocks);
  const floor = map.blocks.get(blockKey({ x: 0, y: 0, z: 0 })) ?? DEFAULT_FLOOR;
  for (let x = 0; x < size.x; x += 1) {
    for (let z = 0; z < size.z; z += 1) {
      if (x < map.size.x && z < map.size.z) continue;
      blocks.set(blockKey({ x, y: 0, z }), floor);
    }
  }
  return { size, blocks };
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
  size: { x: number; z: number };
  /** `"x,y,z": materialId`. Sorted on the way out so an autosave does not churn. */
  blocks: Record<string, string>;
}

export function mapToJSON(map: EncounterMap): MapJSON {
  const blocks: Record<string, string> = {};
  for (const key of [...map.blocks.keys()].sort()) {
    blocks[key] = map.blocks.get(key)!;
  }
  return { size: { x: map.size.x, z: map.size.z }, blocks };
}

export function mapFromJSON(json: MapJSON | undefined | null): EncounterMap | null {
  if (!json) return null;
  return {
    size: { x: json.size.x, z: json.size.z },
    blocks: new Map(Object.entries(json.blocks) as [string, MaterialId][]),
  };
}
