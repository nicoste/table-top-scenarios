// Prefabs (D-321): a box of a map saved by name, and stamped into any map of
// any campaign, turned and mirrored as the GM likes — a watchtower, a tree, a
// stretch of dungeon corridor built once.
//
// **Shared across campaigns**, as the Tokens Library is (D-307): it lives
// beside the campaigns, and campaign undo cannot reach it. Placing one is a
// map edit like any other, and undo takes it back in one step.
//
// **A stamp, not a link.** What a prefab puts down is plain blocks; editing
// or deleting the prefab afterwards changes nothing already placed. Linked
// copies sound handy until one edit rewrites ten finished maps.

import type { PrefabId, SwatchId } from '../ids/index.js';
import { freshId } from '../ids/index.js';
import type { BlockCoord, EncounterMap } from '../map/index.js';
import { blockAt, blockKey, inMap, parseBlockKey } from '../map/index.js';
import type { Facing } from '../place/index.js';
import { asFacing } from '../place/index.js';
import { cleanTags } from '../library/index.js';

export interface PrefabSize {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** One saved piece: *a watchtower*. */
export interface Prefab {
  readonly id: PrefabId;
  readonly name: string;
  /** Free words for finding it again, kept as the library keeps them (D-307). */
  readonly tags: readonly string[];
  /** The box it was captured from, in cubes — air at its edges included. */
  readonly size: PrefabSize;
  /**
   * The filled cubes only, by `blockKey` of their place **in the box**, from
   * `0,0,0` to `size - 1`. Air is absence, as in a map.
   */
  readonly blocks: ReadonlyMap<string, SwatchId>;
}

/** In the order they were saved; screens sort for themselves. */
export type Prefabs = readonly Prefab[];

export const NO_PREFABS: Prefabs = [];

export const MAX_PREFAB_NAME = 40;
/**
 * The longest side a box may have, in cubes, air included — so at most
 * 64 × 64 × 64. Placing one with *clear the box* empties every cube of it,
 * so the box is the cost, not only what is built inside it.
 */
export const MAX_PREFAB_SIDE = 64;

/** A box of cubes, both corners included. */
export interface Box {
  readonly min: BlockCoord;
  readonly max: BlockCoord;
}

/** The box two corners span, whichever way round they were clicked. */
export function boxBetween(a: BlockCoord, b: BlockCoord): Box {
  return {
    min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) },
    max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) },
  };
}

export function sizeOfBox(box: Box): PrefabSize {
  return { x: box.max.x - box.min.x + 1, y: box.max.y - box.min.y + 1, z: box.max.z - box.min.z + 1 };
}

const volumeOf = (size: PrefabSize) => size.x * size.y * size.z;

function cleanName(name: string | undefined, fallback: string): string {
  const trimmed = (name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_PREFAB_NAME);
  return trimmed || fallback;
}

/** Why a box cannot be saved, in the words the console says it. */
export type CaptureRefusal = 'nothing is built in that box' | 'that box is too big to save';

/**
 * What a box of a map holds, as a prefab — or why not.
 *
 * Kept **as selected**, air at the edges included: the GM drew that box, and
 * where its bottom is decides where the prefab sits when it is placed.
 */
export function capturePrefab(
  map: EncounterMap,
  a: BlockCoord,
  b: BlockCoord,
  fields: { readonly name?: string; readonly tags?: readonly string[] } = {},
): Prefab | CaptureRefusal {
  const box = boxBetween(a, b);
  const size = sizeOfBox(box);
  if (size.x > MAX_PREFAB_SIDE || size.y > MAX_PREFAB_SIDE || size.z > MAX_PREFAB_SIDE) {
    return 'that box is too big to save';
  }
  const blocks = new Map<string, SwatchId>();
  // From the map's sparse keys, not by walking the box: a box is mostly air.
  for (const [key, swatch] of map.blocks) {
    const at = parseBlockKey(key);
    if (!at) continue;
    if (at.x < box.min.x || at.y < box.min.y || at.z < box.min.z) continue;
    if (at.x > box.max.x || at.y > box.max.y || at.z > box.max.z) continue;
    blocks.set(blockKey({ x: at.x - box.min.x, y: at.y - box.min.y, z: at.z - box.min.z }), swatch);
  }
  if (blocks.size === 0) return 'nothing is built in that box';
  return {
    id: freshId<'PrefabId'>('prefab'),
    name: cleanName(fields.name, 'New prefab'),
    tags: cleanTags(fields.tags ?? []),
    size,
    blocks,
  };
}

/** How a prefab is put down: turned, mirrored, and whether it carves its box first. */
export interface PrefabTurn {
  /** Quarter turns clockwise, seen from above (R-203's convention). */
  readonly facing: Facing;
  /** Flipped left to right before it is turned. */
  readonly mirrored: boolean;
}

/** The box's footprint once turned: an odd number of quarter turns swaps its sides. */
export function turnedSize(size: PrefabSize, facing: Facing): PrefabSize {
  return facing % 2 === 0 ? size : { x: size.z, y: size.y, z: size.x };
}

/** Where a cube of the box lands, in the box, once mirrored and turned. */
function placeInBox(at: BlockCoord, size: PrefabSize, how: PrefabTurn): BlockCoord {
  const x = how.mirrored ? size.x - 1 - at.x : at.x;
  const z = at.z;
  switch (asFacing(how.facing)) {
    case 1: return { x: size.z - 1 - z, y: at.y, z: x };
    case 2: return { x: size.x - 1 - x, y: at.y, z: size.z - 1 - z };
    case 3: return { x: z, y: at.y, z: size.x - 1 - x };
    default: return { x, y: at.y, z };
  }
}

/**
 * The box a prefab fills when placed at a cube: its footprint **centred on
 * that cube**, and its bottom level at that cube's height — so it sits on
 * whatever face was pointed at, as a block placed there would, and turning it
 * turns it about where the pointer is.
 */
export function placedBox(prefab: { readonly size: PrefabSize }, at: BlockCoord, how: PrefabTurn): Box {
  const size = turnedSize(prefab.size, asFacing(how.facing));
  const min = { x: at.x - Math.floor(size.x / 2), y: at.y, z: at.z - Math.floor(size.z / 2) };
  return { min, max: { x: min.x + size.x - 1, y: min.y + size.y - 1, z: min.z + size.z - 1 } };
}

/** Every cube a prefab fills when placed, with what it is made of. */
export function placedBlocks(
  prefab: Prefab,
  at: BlockCoord,
  how: PrefabTurn,
): readonly { readonly at: BlockCoord; readonly swatch: SwatchId }[] {
  const { min } = placedBox(prefab, at, how);
  const out: { at: BlockCoord; swatch: SwatchId }[] = [];
  for (const [key, swatch] of prefab.blocks) {
    const local = parseBlockKey(key);
    if (!local) continue;
    const moved = placeInBox(local, prefab.size, how);
    out.push({ at: { x: min.x + moved.x, y: min.y + moved.y, z: min.z + moved.z }, swatch });
  }
  return out;
}

/**
 * Puts a prefab down in a map (D-321).
 *
 * **Its blocks win and its air leaves the map alone**: a house placed on
 * grass gets its own floor, and the tree beside it survives. With `clear`,
 * every cube of its box is emptied first — for a room sunk into rock.
 *
 * Cubes outside the map are left out, and so are the cubes in `keep` —
 * somebody standing there, whom a block must never land on (R-186). Clearing
 * a cube somebody stands in is nothing to refuse: it is air already.
 * Identity-preserving when nothing changes (R-165).
 */
export function stampPrefab(
  map: EncounterMap,
  prefab: Prefab,
  at: BlockCoord,
  how: PrefabTurn & { readonly clear: boolean },
  keep: ReadonlySet<string> = new Set(),
): EncounterMap {
  const blocks = new Map(map.blocks);
  let touched = false;
  if (how.clear) {
    const { min, max } = placedBox(prefab, at, how);
    for (let y = min.y; y <= max.y; y += 1) {
      for (let z = min.z; z <= max.z; z += 1) {
        for (let x = min.x; x <= max.x; x += 1) {
          if (blocks.delete(blockKey({ x, y, z }))) touched = true;
        }
      }
    }
  }
  for (const cube of placedBlocks(prefab, at, how)) {
    if (!inMap(map, cube.at)) continue;
    const key = blockKey(cube.at);
    if (keep.has(key)) continue;
    if (blocks.get(key) === cube.swatch) continue;
    blocks.set(key, cube.swatch);
    touched = true;
  }
  if (!touched) return map;
  // Only the cubes that differ from the map as it was count as a change: a
  // clear that emptied a cube the prefab then filled with what was there is
  // no change at all.
  if (blocks.size === map.blocks.size && [...blocks].every(([key, swatch]) => blockAt(map, parseBlockKey(key)!) === swatch)) {
    return map;
  }
  return { ...map, blocks };
}

export function prefabById(prefabs: Prefabs, id: PrefabId | string): Prefab | null {
  return prefabs.find((prefab) => prefab.id === id) ?? null;
}

export function addPrefab(prefabs: Prefabs, prefab: Prefab): Prefabs {
  return [...prefabs.filter((one) => one.id !== prefab.id), prefab];
}

/** Renames or retags one. Identity-preserving when nothing changes (R-165). */
export function editPrefab(
  prefabs: Prefabs,
  id: PrefabId | string,
  patch: { readonly name?: string; readonly tags?: readonly string[] },
): Prefabs {
  let touched = false;
  const next = prefabs.map((prefab) => {
    if (prefab.id !== id) return prefab;
    const name = patch.name === undefined ? prefab.name : cleanName(patch.name, prefab.name);
    const tags = patch.tags === undefined ? prefab.tags : cleanTags(patch.tags);
    const same = name === prefab.name
      && tags.length === prefab.tags.length && tags.every((tag, i) => tag === prefab.tags[i]);
    if (same) return prefab;
    touched = true;
    return { ...prefab, name, tags };
  });
  return touched ? next : prefabs;
}

/** Takes one out of the library. What was placed from it stays: a stamp, not a link. */
export function removePrefab(prefabs: Prefabs, id: PrefabId | string): Prefabs {
  const next = prefabs.filter((prefab) => prefab.id !== id);
  return next.length === prefabs.length ? prefabs : next;
}

// -- on disk and on the wire ---------------------------------------------------

/**
 * A prefab as written: its box packed the way a map is (D-217) — a palette
 * indexed from 1, and runs of `[count, index]` over every cube of the box,
 * ordered y, then z, then x. Mostly air, so mostly one number.
 */
export interface PrefabJSON {
  id: string;
  name: string;
  tags: string[];
  size: { x: number; y: number; z: number };
  palette: string[];
  runs: number[];
}

export function prefabToJSON(prefab: Prefab): PrefabJSON {
  const { x: sx, z: sz } = prefab.size;
  const palette = [...new Set(prefab.blocks.values())].sort();
  const indexOf = new Map(palette.map((id, i) => [id, i + 1]));
  const cells = [...prefab.blocks]
    .map(([key, swatch]) => {
      const at = parseBlockKey(key)!;
      return { at: (at.y * sz + at.z) * sx + at.x, value: indexOf.get(swatch)! };
    })
    .sort((a, b) => a.at - b.at);
  const runs: number[] = [];
  const push = (count: number, value: number) => {
    if (count <= 0) return;
    const n = runs.length;
    if (n >= 2 && runs[n - 1] === value) runs[n - 2] = runs[n - 2]! + count;
    else runs.push(count, value);
  };
  let cursor = 0;
  for (const cell of cells) {
    push(cell.at - cursor, 0);
    push(1, cell.value);
    cursor = cell.at + 1;
  }
  push(volumeOf(prefab.size) - cursor, 0);
  return {
    id: prefab.id,
    name: prefab.name,
    tags: [...prefab.tags],
    size: { x: prefab.size.x, y: prefab.size.y, z: prefab.size.z },
    palette,
    runs,
  };
}

const isSide = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_PREFAB_SIDE;

/**
 * Read leniently where it can be (R-137a) and strictly where it cannot: a name
 * or tags are repaired, but a prefab without an id, without a sensible box,
 * or whose runs do not add up to its box is refused (`null`) — a body read
 * askew would put every cube after the slip in the wrong place, and only a
 * refusal says so (R-18).
 */
export function prefabFromJSON(json: unknown): Prefab | null {
  if (!json || typeof json !== 'object') return null;
  const raw = json as Record<string, unknown>;
  if (typeof raw.id !== 'string' || !/^prefab_[a-z0-9]+$/.test(raw.id)) return null;
  const size = raw.size as Record<string, unknown> | undefined;
  if (!size || !isSide(size.x) || !isSide(size.y) || !isSide(size.z)) return null;
  const box: PrefabSize = { x: size.x, y: size.y, z: size.z };
  if (!Array.isArray(raw.palette) || !Array.isArray(raw.runs) || raw.runs.length % 2 !== 0) return null;
  const palette = raw.palette as unknown[];
  const runs = raw.runs as unknown[];
  const blocks = new Map<string, SwatchId>();
  let cursor = 0;
  for (let i = 0; i < runs.length; i += 2) {
    const count = runs[i];
    const value = runs[i + 1];
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) return null;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null;
    if (value !== 0) {
      const swatch = palette[value - 1];
      if (typeof swatch !== 'string') return null;
      for (let k = 0; k < count; k += 1) {
        const at = cursor + k;
        const level = Math.floor(at / (box.x * box.z));
        const rest = at - level * box.x * box.z;
        blocks.set(blockKey({ x: rest % box.x, y: level, z: Math.floor(rest / box.x) }), swatch as SwatchId);
      }
    }
    cursor += count;
  }
  if (cursor !== volumeOf(box) || blocks.size === 0) return null;
  return {
    id: raw.id as PrefabId,
    name: cleanName(typeof raw.name === 'string' ? raw.name : undefined, 'New prefab'),
    tags: cleanTags(Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : []),
    size: box,
    blocks,
  };
}
