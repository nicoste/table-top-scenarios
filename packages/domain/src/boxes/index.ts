// Boxes of whole cubes, and how one is set down turned and mirrored: what a
// prefab is (D-321) and what a prop fills (D-322). Shared, so the two agree on
// what "a quarter turn clockwise" does to a box, and neither has to import the
// other to know it.

import type { BlockCoord } from '../map/index.js';
import type { Facing } from '../place/index.js';
import { asFacing } from '../place/index.js';

/** A box's sides, in cubes: wide (x), tall (y) and deep (z). */
export interface Size {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A box of cubes, both corners included. */
export interface Box {
  readonly min: BlockCoord;
  readonly max: BlockCoord;
}

/** How a box is set down: turned, and mirrored before it is turned. */
export interface Turn {
  /** Quarter turns clockwise, seen from above (R-203's convention). */
  readonly facing: Facing;
  /** Flipped left to right before it is turned. */
  readonly mirrored: boolean;
}

/** The box two corners span, whichever way round they were clicked. */
export function boxBetween(a: BlockCoord, b: BlockCoord): Box {
  return {
    min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) },
    max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) },
  };
}

export function sizeOfBox(box: Box): Size {
  return { x: box.max.x - box.min.x + 1, y: box.max.y - box.min.y + 1, z: box.max.z - box.min.z + 1 };
}

/** Every cube of a box. */
export function boxCubes(box: Box): readonly BlockCoord[] {
  const out: BlockCoord[] = [];
  for (let y = box.min.y; y <= box.max.y; y += 1) {
    for (let z = box.min.z; z <= box.max.z; z += 1) {
      for (let x = box.min.x; x <= box.max.x; x += 1) out.push({ x, y, z });
    }
  }
  return out;
}

/** The footprint once turned: an odd number of quarter turns swaps its sides. */
export function turnedSize(size: Size, facing: Facing): Size {
  return facing % 2 === 0 ? size : { x: size.z, y: size.y, z: size.x };
}

/** Where a cube of a box lands, in the box, once mirrored and turned. */
export function placeInBox(at: BlockCoord, size: Size, how: Turn): BlockCoord {
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
 * The box a thing of this size fills when set down at a cube: its footprint
 * **centred on that cube**, and its bottom level at that cube's height — so it
 * sits on whatever face was pointed at, as a block placed there would, and
 * turning it turns it about where the pointer is.
 */
export function placedBox(
  thing: { readonly size: Size },
  at: BlockCoord,
  how: { readonly facing: Facing; readonly mirrored?: boolean },
): Box {
  const size = turnedSize(thing.size, asFacing(how.facing));
  const min = { x: at.x - Math.floor(size.x / 2), y: at.y, z: at.z - Math.floor(size.z / 2) };
  return { min, max: { x: min.x + size.x - 1, y: min.y + size.y - 1, z: min.z + size.z - 1 } };
}

/**
 * The cube a thing is set down at, given the box it fills: the inverse of
 * `placedBox`. What a prop inside a prefab is re-anchored by once the prefab
 * has turned it (D-321).
 */
export function anchorOf(box: Box, size: Size, facing: Facing): BlockCoord {
  const turned = turnedSize(size, asFacing(facing));
  return { x: box.min.x + Math.floor(turned.x / 2), y: box.min.y, z: box.min.z + Math.floor(turned.z / 2) };
}
