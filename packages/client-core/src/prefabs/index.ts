// The Prefabs tool on the console (D-321): capture a box of the map by two
// corner blocks and save it, or pick a saved one and stamp it — turned with
// Z / X, mirrored, and optionally carving its box first. The GM's alone:
// building is (R-136).
//
// Local until the click (R-64): the ghost follows the pointer and nothing
// reaches the host until a prefab is saved or put down.

import type { Intent } from '@tt/protocol';
import type { BlockCoord, Box, EncounterMap, Facing, Prefab } from '@tt/domain';
import { boxBetween, inMap, placedBlocks, placedBox, sizeOfBox, turned } from '@tt/domain';
import type { FacePick, GhostCube } from '@tt/render';

/** How the chosen prefab will be put down. */
export interface PrefabPlacing {
  /** The prefab in hand, or `null` until one is picked from the list. */
  readonly id: string | null;
  readonly facing: Facing;
  readonly mirrored: boolean;
  /** Empty its whole box first, rather than only adding its blocks. */
  readonly clear: boolean;
}

export const NOT_PLACING: PrefabPlacing = { id: null, facing: 0, mirrored: false, clear: false };

/** Z / X: a quarter turn anticlockwise or clockwise, seen from above — as a place turns (R-203). */
export function turnPlacing(placing: PrefabPlacing, step: number): PrefabPlacing {
  return { ...placing, facing: turned(placing.facing, step) };
}

/** Flipped left to right, before it is turned. */
export function mirrorPlacing(placing: PrefabPlacing): PrefabPlacing {
  return { ...placing, mirrored: !placing.mirrored };
}

/**
 * Where a prefab would sit, given the face under the pointer: in the cube
 * against that face — where Build would put a block — so a prefab pointed at
 * a floor stands on it.
 */
export function prefabAim(face: FacePick | null): BlockCoord | null {
  return face ? face.adjacent : null;
}

/** The cubes the ghost draws, and the box it frames — what a click would do, here. */
export interface PrefabPreview {
  readonly cubes: readonly GhostCube[];
  readonly box: Box;
  /** How many of its cubes fall outside the map, and will be left out. */
  readonly outside: number;
}

export function prefabPreview(
  prefab: Prefab,
  at: BlockCoord,
  placing: PrefabPlacing,
  map: EncounterMap,
): PrefabPreview {
  const cubes = placedBlocks(prefab, at, placing).map((cube) => ({
    at: cube.at, swatch: cube.swatch, outside: !inMap(map, cube.at),
  }));
  return {
    cubes,
    box: placedBox(prefab, at, placing),
    outside: cubes.filter((cube) => cube.outside).length,
  };
}

/** The placement a click sends, or nothing with no prefab in hand. */
export function placeIntent(
  placing: PrefabPlacing,
  at: BlockCoord,
  placeId: string,
  poiId: string,
): Intent | null {
  if (!placing.id) return null;
  return {
    kind: 'placePrefab', placeId, poiId, id: placing.id, at,
    facing: placing.facing, mirrored: placing.mirrored, clear: placing.clear,
  };
}

/** What the readout says while placing. */
export function placePrompt(name: string | null, at: BlockCoord | null, outside: number): string {
  if (!name) return 'Pick a prefab from the list, or capture a new one.';
  if (!at) return `Placing ${name} — point at where it should stand.`;
  const left = outside > 0 ? ` ${outside} of its blocks fall outside the map and will be left out.` : '';
  return `Click to place ${name} here. Z / X turn it, M mirrors it.${left}`;
}

// -- capturing ------------------------------------------------------------------

/**
 * The cube a capture corner takes, given the face under the pointer: **the
 * cube in front of it** — the one Build would fill — or, with ⇧ shift, the
 * block itself (D-323).
 *
 * The cube in front, because the corners of what a GM wants to save are
 * nearly always air: the box around a tree has leaves at its edges and
 * nothing at its corners, so a corner that had to be a block could never
 * frame it. Air at a box's edges costs nothing — a prefab's air leaves the
 * map alone — and pointing at the floor's top face leaves the floor out,
 * which is what a house dropped onto grass wants. Shift is for the other
 * case: the floor taken too.
 */
export function captureCorner(face: FacePick | null, block: boolean): BlockCoord | null {
  if (!face) return null;
  return block ? face.block : face.adjacent;
}

/** The two corners of the box being captured, as they are clicked. */
export interface Capture {
  readonly first: BlockCoord | null;
  readonly second: BlockCoord | null;
}

export const NO_CAPTURE: Capture = { first: null, second: null };

/**
 * A click on a block while capturing: the first corner, then the second — and
 * a click after both starts a new box from there, so a wrong corner is undone
 * by clicking again rather than by finding a button.
 */
export function captureClick(capture: Capture, at: BlockCoord): Capture {
  if (!capture.first || capture.second) return { first: at, second: null };
  return { first: capture.first, second: at };
}

/** The box to outline: both corners, or the first and the block under the pointer. */
export function captureBox(capture: Capture, hover: BlockCoord | null): Box | null {
  if (!capture.first) return null;
  const other = capture.second ?? hover;
  return other ? boxBetween(capture.first, other) : null;
}

/** What the readout says while capturing. */
export function capturePrompt(capture: Capture, hover: BlockCoord | null): string {
  if (!capture.first) {
    return 'Point at a face: one corner is the cube in front of it (⇧ shift: the block itself). Cut the levels to reach inside.';
  }
  if (!capture.second) {
    const box = captureBox(capture, hover);
    const size = box ? ` — ${describeBox(box)}` : '';
    return `Now the opposite corner${size}.`;
  }
  return `${describeBox(captureBox(capture, null)!)}. Name it and save it, or click again to start over.`;
}

/** "5 × 3 × 4": wide, tall, deep, in cubes — a bare number each (D-316). */
export function describeBox(box: Box): string {
  const size = sizeOfBox(box);
  return `${size.x} × ${size.y} × ${size.z}`;
}

/** The save a button sends, or nothing until both corners are down. */
export function saveIntent(
  capture: Capture,
  fields: { readonly name: string; readonly tags: readonly string[] },
  placeId: string,
  poiId: string,
): Intent | null {
  if (!capture.first || !capture.second) return null;
  return {
    kind: 'savePrefab', placeId, poiId, from: capture.first, to: capture.second,
    name: fields.name, tags: [...fields.tags],
  };
}
