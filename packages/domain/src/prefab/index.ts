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
import type { BlockCoord, EncounterMap, StairFacing } from '../map/index.js';
import { blockAt, blockKey, inMap, parseBlockKey, propsOfJSON } from '../map/index.js';
import { cleanTags } from '../library/index.js';
import type { Size, Turn } from '../boxes/index.js';
import { anchorOf, boxBetween, placeInBox, placedBox, sizeOfBox } from '../boxes/index.js';
import type { Facing } from '../place/index.js';
import { asFacing, turned } from '../place/index.js';
import { propCubes, propType, putProp } from '../props/index.js';

export type { Box } from '../boxes/index.js';
export { boxBetween, sizeOfBox, turnedSize, placedBox } from '../boxes/index.js';

/** A prefab's box, in cubes: wide, tall, deep. */
export type PrefabSize = Size;
/** How a prefab is put down: turned, and mirrored before it is turned. */
export type PrefabTurn = Turn;

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
  /**
   * The props it holds (D-322): each wholly inside the box when it was
   * captured, at its place **in the box**, with its facing and finish. Placed
   * with the blocks, turned and mirrored with them, as new props.
   */
  readonly props: readonly PrefabProp[];
  /** Which of its blocks are stairs, by their place in the box, and which way they climb (D-349). */
  readonly stairs?: ReadonlyMap<string, StairFacing>;
}

/** A prop inside a prefab: its type, the cube it stands at in the box, its facing and finish. */
export interface PrefabProp {
  readonly type: string;
  readonly at: BlockCoord;
  readonly facing: Facing;
  readonly finish: string;
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
  // The props wholly inside the box come with it; one the box cuts through
  // does not — half a door is no door (D-322).
  const inside = (cube: BlockCoord) => cube.x >= box.min.x && cube.y >= box.min.y && cube.z >= box.min.z
    && cube.x <= box.max.x && cube.y <= box.max.y && cube.z <= box.max.z;
  // Its stairs, with the blocks they are (D-349).
  const stairs = new Map<string, StairFacing>();
  for (const [key, facing] of map.stairs ?? []) {
    const at = parseBlockKey(key);
    if (!at || !inside(at) || !map.blocks.has(key)) continue;
    stairs.set(blockKey({ x: at.x - box.min.x, y: at.y - box.min.y, z: at.z - box.min.z }), facing);
  }
  const props = map.props
    .filter((prop) => propCubes(prop).every(inside))
    .map((prop) => ({
      type: prop.type,
      at: { x: prop.at.x - box.min.x, y: prop.at.y - box.min.y, z: prop.at.z - box.min.z },
      facing: prop.facing,
      finish: prop.finish,
    }));
  if (blocks.size === 0 && props.length === 0) return 'nothing is built in that box';
  return {
    id: freshId<'PrefabId'>('prefab'),
    name: cleanName(fields.name, 'New prefab'),
    tags: cleanTags(fields.tags ?? []),
    size,
    blocks,
    props,
    ...(stairs.size > 0 ? { stairs } : {}),
  };
}

/** A facing carried through a placement: mirrored first, then turned (D-322's rule, for stairs too). */
const facingPlaced = (facing: Facing, how: PrefabTurn): Facing =>
  turned(how.mirrored ? asFacing(4 - facing) : facing, how.facing);

/**
 * The props a prefab puts down when placed, turned and mirrored with its
 * blocks (D-322): each prop's cubes are carried where the blocks' would be,
 * its facing turns with them — mirrored first, which swaps a quarter turn
 * one way for one the other — and it is set down at the cube its new box is
 * centred on.
 */
export function placedProps(prefab: Prefab, at: BlockCoord, how: PrefabTurn): readonly PrefabProp[] {
  const { min } = placedBox(prefab, at, how);
  return prefab.props.map((prop) => {
    const cubes = propCubes(prop).map((local) => {
      const moved = placeInBox(local, prefab.size, how);
      return { x: min.x + moved.x, y: min.y + moved.y, z: min.z + moved.z };
    });
    const box = cubes.reduce((acc, cube) => ({
      min: { x: Math.min(acc.min.x, cube.x), y: Math.min(acc.min.y, cube.y), z: Math.min(acc.min.z, cube.z) },
      max: { x: Math.max(acc.max.x, cube.x), y: Math.max(acc.max.y, cube.y), z: Math.max(acc.max.z, cube.z) },
    }), { min: cubes[0]!, max: cubes[0]! });
    const mirrored = how.mirrored ? asFacing(4 - prop.facing) : prop.facing;
    const facing = turned(mirrored, how.facing);
    const size = propType(prop.type)?.size ?? { x: 1, y: 1, z: 1 };
    return { type: prop.type, at: anchorOf(box, size, facing), facing, finish: prop.finish };
  });
}

/** Every cube a prefab fills when placed, with what it is made of — and, for a stair, which way it climbs now. */
export function placedBlocks(
  prefab: Prefab,
  at: BlockCoord,
  how: PrefabTurn,
): readonly { readonly at: BlockCoord; readonly swatch: SwatchId; readonly stairs: StairFacing | null }[] {
  const { min } = placedBox(prefab, at, how);
  const out: { at: BlockCoord; swatch: SwatchId; stairs: StairFacing | null }[] = [];
  for (const [key, swatch] of prefab.blocks) {
    const local = parseBlockKey(key);
    if (!local) continue;
    const moved = placeInBox(local, prefab.size, how);
    const stair = prefab.stairs?.get(key);
    out.push({
      at: { x: min.x + moved.x, y: min.y + moved.y, z: min.z + moved.z },
      swatch,
      stairs: stair === undefined ? null : facingPlaced(stair, how) as StairFacing,
    });
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
  const stairs = new Map(map.stairs ?? []);
  let touched = false;
  if (how.clear) {
    const { min, max } = placedBox(prefab, at, how);
    for (let y = min.y; y <= max.y; y += 1) {
      for (let z = min.z; z <= max.z; z += 1) {
        for (let x = min.x; x <= max.x; x += 1) {
          const key = blockKey({ x, y, z });
          if (blocks.delete(key)) touched = true;
          stairs.delete(key);
        }
      }
    }
  }
  for (const cube of placedBlocks(prefab, at, how)) {
    if (!inMap(map, cube.at)) continue;
    const key = blockKey(cube.at);
    if (keep.has(key)) continue;
    // The prefab's block wins, and so does what shape it is (D-349).
    if (cube.stairs === null) stairs.delete(key);
    else stairs.set(key, cube.stairs);
    if (blocks.get(key) === cube.swatch) continue;
    blocks.set(key, cube.swatch);
    touched = true;
  }
  const sameStairs = stairs.size === (map.stairs?.size ?? 0) && [...stairs].every(([key, facing]) => map.stairs?.get(key) === facing);
  // Only the cubes that differ from the map as it was count as a change: a
  // clear that emptied a cube the prefab then filled with what was there is
  // no change at all.
  const same = sameStairs && (!touched
    || (blocks.size === map.blocks.size && [...blocks].every(([key, swatch]) => blockAt(map, parseBlockKey(key)!) === swatch)));
  let stamped: EncounterMap = same ? map : { ...map, blocks, ...(stairs.size > 0 ? { stairs } : {}) };
  if (!same && stairs.size === 0 && stamped.stairs) {
    const { stairs: _, ...rest } = stamped;
    stamped = rest;
  }
  // Then its props, each where it fits among what is now there, and never on
  // anybody (R-186). One that does not fit is left out, as a block outside
  // the map is.
  for (const prop of placedProps(prefab, at, how)) {
    stamped = putProp(stamped, prop, keep);
  }
  return stamped;
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
  /** Its props (D-322), at their places in the box. Absent before there were props: none. */
  props?: { type: string; at: { x: number; y: number; z: number }; facing: number; finish: string }[];
  /** Its stairs (D-349), at their places in the box. Absent before there were stairs: none. */
  stairs?: { x: number; y: number; z: number; facing: number }[];
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
    ...(prefab.props.length > 0 ? {
      props: prefab.props.map((prop) => ({
        type: prop.type, at: { x: prop.at.x, y: prop.at.y, z: prop.at.z }, facing: prop.facing, finish: prop.finish,
      })),
    } : {}),
    ...(prefab.stairs && prefab.stairs.size > 0 ? {
      stairs: [...prefab.stairs].map(([key, facing]) => ({ ...parseBlockKey(key)!, facing })),
    } : {}),
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
  // Its props, read as a map's are: an odd entry drops itself (R-137a). One
  // standing outside the box could not have been captured, so it goes too.
  const props = propsOfJSON((raw.props as unknown[] | undefined)?.map((prop, i) => ({ ...(prop as object), id: `p${i}` })))
    .filter((prop) => prop.at.x >= 0 && prop.at.y >= 0 && prop.at.z >= 0 && prop.at.x < box.x && prop.at.y < box.y && prop.at.z < box.z)
    .map((prop) => ({ type: prop.type, at: prop.at, facing: prop.facing, finish: prop.finish }));
  if (cursor !== volumeOf(box) || (blocks.size === 0 && props.length === 0)) return null;
  // Its stairs, each on one of its blocks (D-349).
  const stairs = new Map<string, StairFacing>();
  for (const item of Array.isArray(raw.stairs) ? raw.stairs as unknown[] : []) {
    const entry = item as Record<string, unknown> | null;
    if (!entry || typeof entry.x !== 'number' || typeof entry.y !== 'number' || typeof entry.z !== 'number') continue;
    const key = blockKey({ x: entry.x, y: entry.y, z: entry.z });
    if (!blocks.has(key)) continue;
    const facing = typeof entry.facing === 'number' && Number.isInteger(entry.facing) ? asFacing(entry.facing) : 0;
    stairs.set(key, facing as StairFacing);
  }
  return {
    id: raw.id as PrefabId,
    name: cleanName(typeof raw.name === 'string' ? raw.name : undefined, 'New prefab'),
    tags: cleanTags(Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : []),
    size: box,
    blocks,
    props,
    ...(stairs.size > 0 ? { stairs } : {}),
  };
}
