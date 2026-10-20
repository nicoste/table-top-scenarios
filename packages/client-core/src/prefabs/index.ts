// The Prefabs tool on the console (D-321): capture a box of the map by two
// corner blocks and save it, or pick a saved one and stamp it — turned with
// Z / X, mirrored, and optionally carving its box first. The GM's alone:
// building is (R-136).
//
// Local until the click (R-64): the ghost follows the pointer and nothing
// reaches the host until a prefab is saved or put down.

import type { Intent } from '@tt/protocol';
import type { BlockCoord, Box, EncounterMap, Facing, Prefab, SwatchId } from '@tt/domain';
import {
  boxBetween, inMap, placedBlocks, placedBox, sizeOfBox, turned, MAP_MAX_HEIGHT, MAP_MIN_DEPTH, MAX_PREFAB_SIDE,
  placedProps, propCubes, paintOf, swatchColour,
} from '@tt/domain';
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
  const cubes: GhostCube[] = placedBlocks(prefab, at, placing).map((cube) => ({
    at: cube.at, swatch: cube.swatch, outside: !inMap(map, cube.at),
  }));
  // And its props, in their finishes, turned and mirrored with it (D-322).
  for (const prop of placedProps(prefab, at, placing)) {
    const colour = swatchColour(paintOf(prop)) ?? '#9aa3ad';
    for (const cube of propCubes(prop)) {
      cubes.push({ at: cube, swatch: '' as SwatchId, outside: !inMap(map, cube), colour });
    }
  }
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

/**
 * A box being captured, in **three clicks** (D-325): a corner, the far corner
 * of the area on that corner's level, then the height — because nothing worth
 * saving is a cube. A tree's box is its canopy's footprint by its height, and
 * neither corner of it is anything the pointer could land on.
 *
 * - `start` — nothing yet. The cube a click would take is outlined.
 * - `area` — the first corner is down, and the box follows the pointer across
 *   that corner's level: one cube tall.
 * - `height` — the area is down, and **the block under the pointer sets the
 *   box's top** — or its bottom, when it is below the area (D-326). Point at
 *   the top of the tree, and that is the height.
 * - `done` — the third click ended it. Named and saved from here.
 */
export type Capture =
  | { readonly step: 'start' }
  | { readonly step: 'area'; readonly first: BlockCoord }
  | {
    readonly step: 'height';
    readonly first: BlockCoord;
    /** The area's far corner, on the first corner's level. */
    readonly second: BlockCoord;
    /** Levels above the area — or below it, when negative. */
    readonly levels: number;
  }
  | { readonly step: 'done'; readonly box: Box };

export const NO_CAPTURE: Capture = { step: 'start' };

/** The box the height step describes: the area, raised or sunk by `levels`. */
function raised(capture: Extract<Capture, { step: 'height' }>): Box {
  const { first, second, levels } = capture;
  return {
    min: { x: Math.min(first.x, second.x), y: Math.min(first.y, first.y + levels), z: Math.min(first.z, second.z) },
    max: { x: Math.max(first.x, second.x), y: Math.max(first.y, first.y + levels), z: Math.max(first.z, second.z) },
  };
}

/**
 * A click while capturing (D-325): the first corner; then the area's far
 * corner, on the first corner's level whatever the pointer is over; then the
 * height, from the block the click lands on (D-326) — or, off the map, the
 * height the box already had. A click on a finished box starts a new one
 * from there, so a wrong box is undone by clicking again.
 *
 * In the height step `at` is **the block pointed at**, not the cube in front
 * of it: the top of the tree is the tree's top block, and that is what the
 * GM is clicking.
 */
export function captureClick(capture: Capture, at: BlockCoord | null): Capture {
  switch (capture.step) {
    case 'start':
      return at ? { step: 'area', first: at } : capture;
    case 'area':
      if (!at) return capture;
      return { step: 'height', first: capture.first, second: { x: at.x, y: capture.first.y, z: at.z }, levels: 0 };
    case 'height': {
      const set = at ? captureHeight(capture, at) : capture;
      return { step: 'done', box: raised(set as Extract<Capture, { step: 'height' }>) };
    }
    default:
      return at ? { step: 'area', first: at } : NO_CAPTURE;
  }
}

/**
 * The height step following what the pointer is over (D-326): **the block
 * under it is the box's top**, or its bottom when it is below the area — so
 * the GM points at the top of what they are saving rather than counting
 * levels. Within the map's levels and a prefab's longest side; nothing under
 * the pointer leaves the height as it was. Identity-preserving, so the same
 * level again redraws nothing.
 */
export function captureHeight(capture: Capture, at: BlockCoord | null): Capture {
  if (capture.step !== 'height' || !at) return capture;
  const up = Math.min(MAP_MAX_HEIGHT - 1 - capture.first.y, MAX_PREFAB_SIDE - 1);
  const down = -Math.min(capture.first.y - MAP_MIN_DEPTH, MAX_PREFAB_SIDE - 1);
  const levels = Math.max(down, Math.min(up, at.y - capture.first.y));
  return levels === capture.levels ? capture : { ...capture, levels };
}

/** Escape steps back one click: the height to the area, the area to nothing. */
export function captureBack(capture: Capture): Capture {
  if (capture.step === 'height') return { step: 'area', first: capture.first };
  return NO_CAPTURE;
}

/**
 * The box to outline. Before any corner, the cube a click would take, so
 * the tool never looks dead (D-324); while setting the area, the first
 * corner to the pointer, one level tall; then the height as it is raised.
 */
export function captureBox(capture: Capture, hover: BlockCoord | null): Box | null {
  switch (capture.step) {
    case 'start':
      return hover ? boxBetween(hover, hover) : null;
    case 'area':
      return boxBetween(capture.first, hover ? { x: hover.x, y: capture.first.y, z: hover.z } : capture.first);
    case 'height':
      return raised(capture);
    default:
      return capture.box;
  }
}

/** What the readout says while capturing. */
export function capturePrompt(capture: Capture, hover: BlockCoord | null): string {
  const size = () => {
    const box = captureBox(capture, hover);
    return box ? describeBox(box) : '';
  };
  switch (capture.step) {
    case 'start':
      return 'Click the first corner: the outlined cube is in (⇧ shift: the block itself). Cut the levels to reach inside.';
    case 'area':
      return `Now the opposite corner of the area — ${size()}. Click to set it.`;
    case 'height':
      return `Point at the top — or the bottom — of what to save: ${size()}. Click to finish.`;
    default:
      return `${size()}. Name it and save it, or click again to start over.`;
  }
}

/** "5 × 3 × 4": wide, tall, deep, in cubes — a bare number each (D-316). */
export function describeBox(box: Box): string {
  const size = sizeOfBox(box);
  return `${size.x} × ${size.y} × ${size.z}`;
}

/** The save a button sends, or nothing until the box is finished. */
export function saveIntent(
  capture: Capture,
  fields: { readonly name: string; readonly tags: readonly string[] },
  placeId: string,
  poiId: string,
): Intent | null {
  if (capture.step !== 'done') return null;
  return {
    kind: 'savePrefab', placeId, poiId, from: capture.box.min, to: capture.box.max,
    name: fields.name, tags: [...fields.tags],
  };
}
