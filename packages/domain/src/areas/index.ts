// Areas on a map (D-321, D-322, D-341): a sphere, a cone, a line or a cube,
// drawn where a spell lands or a trap waits — *the fireball*, *the dragon's
// breath*. A shape, a size, a colour and a name.
//
// **Drawn, never resolved** (R-1). Nothing here says who is caught: the cubes
// an area covers are tinted and the table decides what that means. The same
// as the walk (R-209) and the light (R-213): a picture of the rules, never
// the rules.
//
// **Play state, in the save** (R-140), per map, like the silver tokens: a
// fireball is the session's, not the building's, and undo leaves it alone.
// One may **follow** somebody — a member or a silver token — and is then
// wherever they stand: an aura.
//
// Sizes are whole cubes, said as bare numbers (D-316).

import type { AreaId } from '../ids/index.js';
import { freshId } from '../ids/index.js';
import type { BlockCoord, EncounterMap } from '../map/index.js';
import { blockKey, inMap } from '../map/index.js';

export type AreaShape = 'sphere' | 'cone' | 'line' | 'cube';

export const AREA_SHAPES: readonly { readonly id: AreaShape; readonly name: string }[] = [
  { id: 'sphere', name: 'Sphere' },
  { id: 'cone', name: 'Cone' },
  { id: 'line', name: 'Line' },
  { id: 'cube', name: 'Cube' },
];

/** An area's colour: one of a few, so that two areas are told apart at a glance. */
export interface AreaColour {
  readonly id: string;
  readonly name: string;
  readonly colour: string;
}

export const AREA_COLOURS: readonly AreaColour[] = [
  { id: 'red', name: 'Red', colour: '#ff5a5a' },
  { id: 'orange', name: 'Orange', colour: '#ff9a3c' },
  { id: 'yellow', name: 'Yellow', colour: '#ffd84a' },
  { id: 'green', name: 'Green', colour: '#5fd17a' },
  { id: 'blue', name: 'Blue', colour: '#4da3ff' },
  { id: 'violet', name: 'Violet', colour: '#b07cff' },
];

export function areaColour(id: string): string {
  return (AREA_COLOURS.find((one) => one.id === id) ?? AREA_COLOURS[0]!).colour;
}

/** How big an area may be, in whole cubes: a radius, a length or a side. */
export const MIN_AREA_SIZE = 1;
export const MAX_AREA_SIZE = 40;
export const MAX_AREA_NAME = 40;

/** A way an area points: an offset in cubes, only its direction meaning anything. */
export interface Aim {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Area {
  readonly id: AreaId;
  readonly shape: AreaShape;
  /**
   * The cube it starts from: a sphere's middle, a cone's or a line's point,
   * a cube's corner. Where it was put; one that follows somebody is where
   * they stand instead (`areaAt`).
   */
  readonly at: BlockCoord;
  /** Which way a cone or a line points, and which way a cube grows from its corner. A sphere's is nothing. */
  readonly aim: Aim;
  /** A sphere's radius, a cone's or a line's length, a cube's side: whole cubes. */
  readonly size: number;
  /** One of `AREA_COLOURS`, by id. */
  readonly colour: string;
  readonly name: string;
  /** Kept off the table: the GM's own, until shown (as a silver token's eye, R-206). */
  readonly hidden: boolean;
  /** The token it goes with, a member's id or a silver token's: an aura. */
  readonly follows?: string;
}

export type Areas = readonly Area[];

export const NO_AREAS: Areas = [];

const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0);
const clampSize = (size: number) => Math.min(MAX_AREA_SIZE, Math.max(MIN_AREA_SIZE, Math.round(size)));

/** A size as kept: whole cubes, in bounds. */
export function cleanSize(size: number): number {
  return Number.isFinite(size) ? clampSize(size) : MIN_AREA_SIZE;
}

/** Aimed nowhere — a cone or a line with no way to point — points along +x. */
const ALONG_X: Aim = { x: 1, y: 0, z: 0 };

/** An aim as kept: whole cubes, and never nothing for a shape that points. */
function cleanAim(shape: AreaShape, aim: Aim): Aim {
  if (shape === 'sphere') return { x: 0, y: 0, z: 0 };
  if (shape === 'cube') return { x: sign(aim.x) || 1, y: 0, z: sign(aim.z) || 1 };
  const x = Math.round(aim.x);
  const y = Math.round(aim.y);
  const z = Math.round(aim.z);
  return x === 0 && y === 0 && z === 0 ? ALONG_X : { x, y, z };
}

/**
 * The area a drag from one cube to another draws (D-341): a sphere as far
 * round as the drag is long; a cone or a line pointing the way it went, as
 * long; a cube from its corner to the far one, square on the floor and as
 * tall as it is wide.
 */
export function areaFromDrag(
  shape: AreaShape,
  from: BlockCoord,
  to: BlockCoord,
): { readonly at: BlockCoord; readonly aim: Aim; readonly size: number } {
  const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const far = Math.hypot(d.x, d.y, d.z);
  if (shape === 'cube') {
    return { at: from, aim: cleanAim(shape, d), size: clampSize(Math.max(Math.abs(d.x), Math.abs(d.z)) + 1) };
  }
  return { at: from, aim: cleanAim(shape, d), size: clampSize(far) };
}

/** Where an area is now: with the one it follows, when they are here; where it was put, otherwise. */
export function areaAt(area: Area, standing: (id: string) => BlockCoord | null): BlockCoord {
  return (area.follows ? standing(area.follows) : null) ?? area.at;
}

/** A unit vector along an aim. */
function along(aim: Aim): Aim {
  const length = Math.hypot(aim.x, aim.y, aim.z) || 1;
  return { x: aim.x / length, y: aim.y / length, z: aim.z / length };
}

/**
 * Whether a cube is in an area set down at `at`: its middle inside the
 * shape, measured from the middle of `at`.
 *
 * - **Sphere**: no further than its radius.
 * - **Cone**: ahead of its point, no further than its length, and as wide at
 *   any distance as that distance — the table's usual cone. Not its own point.
 * - **Line**: ahead, no further than its length, and a cube wide.
 * - **Cube**: from its corner, `size` cubes along x and z the ways it was
 *   drawn, and `size` up.
 */
export function inArea(
  area: { readonly shape: AreaShape; readonly aim: Aim; readonly size: number },
  at: BlockCoord,
  cube: BlockCoord,
): boolean {
  const v = { x: cube.x - at.x, y: cube.y - at.y, z: cube.z - at.z };
  switch (area.shape) {
    case 'sphere':
      return Math.hypot(v.x, v.y, v.z) <= area.size + 1e-9;
    case 'cube': {
      const sx = sign(area.aim.x) || 1;
      const sz = sign(area.aim.z) || 1;
      return v.x * sx >= 0 && v.x * sx < area.size && v.z * sz >= 0 && v.z * sz < area.size
        && v.y >= 0 && v.y < area.size;
    }
    default: {
      const a = along(area.aim);
      const t = v.x * a.x + v.y * a.y + v.z * a.z;
      if (t <= 1e-9 || t > area.size + 1e-9) return false;
      const off = Math.hypot(v.x - t * a.x, v.y - t * a.y, v.z - t * a.z);
      return off <= (area.shape === 'cone' ? t / 2 : 0.5) + 1e-9;
    }
  }
}

/** The box of cubes an area could reach, set down at `at`. */
function reachOf(area: { readonly shape: AreaShape; readonly aim: Aim; readonly size: number }, at: BlockCoord) {
  const s = area.size;
  if (area.shape === 'sphere') {
    return { min: { x: at.x - s, y: at.y - s, z: at.z - s }, max: { x: at.x + s, y: at.y + s, z: at.z + s } };
  }
  if (area.shape === 'cube') {
    const sx = sign(area.aim.x) || 1;
    const sz = sign(area.aim.z) || 1;
    const far = { x: at.x + sx * (s - 1), z: at.z + sz * (s - 1) };
    return {
      min: { x: Math.min(at.x, far.x), y: at.y, z: Math.min(at.z, far.z) },
      max: { x: Math.max(at.x, far.x), y: at.y + s - 1, z: Math.max(at.z, far.z) },
    };
  }
  const a = along(area.aim);
  const end = { x: at.x + a.x * s, y: at.y + a.y * s, z: at.z + a.z * s };
  const wide = area.shape === 'cone' ? Math.ceil(s / 2) + 1 : 1;
  return {
    min: { x: Math.floor(Math.min(at.x, end.x)) - wide, y: Math.floor(Math.min(at.y, end.y)) - wide, z: Math.floor(Math.min(at.z, end.z)) - wide },
    max: { x: Math.ceil(Math.max(at.x, end.x)) + wide, y: Math.ceil(Math.max(at.y, end.y)) + wide, z: Math.ceil(Math.max(at.z, end.z)) + wide },
  };
}

/**
 * The floors an area covers, set down at `at` in this map (D-341): every cube
 * in it that somebody could stand in — air, with a block under it. What is
 * tinted. A cube in the air, or inside a wall, is in the shape and on nobody's
 * floor, so it is not drawn.
 */
export function areaFloors(
  map: EncounterMap,
  area: { readonly shape: AreaShape; readonly aim: Aim; readonly size: number },
  at: BlockCoord,
): readonly BlockCoord[] {
  const box = reachOf(area, at);
  const out: BlockCoord[] = [];
  for (let x = box.min.x; x <= box.max.x; x += 1) {
    for (let z = box.min.z; z <= box.max.z; z += 1) {
      for (let y = box.min.y; y <= box.max.y; y += 1) {
        const cube = { x, y, z };
        if (!inMap(map, cube) || map.blocks.has(blockKey(cube))) continue;
        if (!map.blocks.has(blockKey({ x, y: y - 1, z }))) continue;
        if (inArea(area, at, cube)) out.push(cube);
      }
    }
  }
  return out;
}

// -- in a map ------------------------------------------------------------------

/** "Sphere 3": the shape's name and the first number no area of that shape in the map has. */
export function nameForArea(shape: AreaShape, areas: Areas): string {
  const base = AREA_SHAPES.find((one) => one.id === shape)!.name;
  const taken = new Set(areas.map((area) => area.name.toLowerCase()));
  for (let n = 1; ; n += 1) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

/** Draws a new area in a map: named for its shape, shown to the table. */
export function drawArea(
  areas: Areas,
  fields: { readonly shape: AreaShape; readonly at: BlockCoord; readonly aim: Aim; readonly size: number; readonly colour: string },
): Areas {
  const area: Area = {
    id: freshId<'AreaId'>('area'),
    shape: fields.shape,
    at: { x: fields.at.x, y: fields.at.y, z: fields.at.z },
    aim: cleanAim(fields.shape, fields.aim),
    size: cleanSize(fields.size),
    colour: AREA_COLOURS.some((one) => one.id === fields.colour) ? fields.colour : AREA_COLOURS[0]!.id,
    name: nameForArea(fields.shape, areas),
    hidden: false,
  };
  return [...areas, area];
}

export interface AreaPatch {
  readonly at?: BlockCoord;
  readonly aim?: Aim;
  readonly size?: number;
  readonly colour?: string;
  readonly name?: string;
  readonly hidden?: boolean;
  /** Who it goes with, or `null` for nobody. */
  readonly follows?: string | null;
}

/** Changes one area. Moving one that follows somebody lets go of them. Identity-preserving (R-165). */
export function editArea(areas: Areas, id: AreaId | string, patch: AreaPatch): Areas {
  const area = areas.find((one) => one.id === id);
  if (!area) return areas;
  const name = patch.name === undefined ? area.name : patch.name.trim().slice(0, MAX_AREA_NAME) || area.name;
  const colour = patch.colour !== undefined && AREA_COLOURS.some((one) => one.id === patch.colour) ? patch.colour : area.colour;
  const follows = patch.follows !== undefined ? patch.follows : patch.at !== undefined ? null : area.follows ?? null;
  const next: Area = {
    id: area.id,
    shape: area.shape,
    at: patch.at ? { x: patch.at.x, y: patch.at.y, z: patch.at.z } : area.at,
    aim: patch.aim ? cleanAim(area.shape, patch.aim) : area.aim,
    size: patch.size !== undefined ? cleanSize(patch.size) : area.size,
    colour,
    name,
    hidden: patch.hidden ?? area.hidden,
    ...(follows ? { follows } : {}),
  };
  const same = next.at === area.at && next.aim === area.aim && next.size === area.size && next.colour === area.colour
    && next.name === area.name && next.hidden === area.hidden && next.follows === area.follows;
  return same ? areas : areas.map((one) => (one.id === id ? next : one));
}

export function removeArea(areas: Areas, id: AreaId | string): Areas {
  const next = areas.filter((one) => one.id !== id);
  return next.length === areas.length ? areas : next;
}

/** The area whose starting cube is this one, if any — what a press there picks up to move. */
export function areaStartingAt(areas: Areas, at: BlockCoord, standing: (id: string) => BlockCoord | null): Area | null {
  for (let i = areas.length - 1; i >= 0; i -= 1) {
    const where = areaAt(areas[i]!, standing);
    if (where.x === at.x && where.y === at.y && where.z === at.z) return areas[i]!;
  }
  return null;
}

// -- written ---------------------------------------------------------------------

export interface AreaJSON {
  id: string;
  shape: string;
  at: { x: number; y: number; z: number };
  aim: { x: number; y: number; z: number };
  size: number;
  colour: string;
  name: string;
  hidden?: boolean;
  follows?: string;
}

export function areasToJSON(areas: Areas): AreaJSON[] {
  return areas.map((area) => ({
    id: area.id,
    shape: area.shape,
    at: { x: area.at.x, y: area.at.y, z: area.at.z },
    aim: { x: area.aim.x, y: area.aim.y, z: area.aim.z },
    size: area.size,
    colour: area.colour,
    name: area.name,
    ...(area.hidden ? { hidden: true } : {}),
    ...(area.follows ? { follows: area.follows } : {}),
  }));
}

const isWhole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
const cube = (raw: unknown): BlockCoord | null => {
  const at = raw as Record<string, unknown> | null;
  return at && isWhole(at.x) && isWhole(at.y) && isWhole(at.z) ? { x: at.x, y: at.y, z: at.z } : null;
};

/** Read leniently (R-137a): one without an id, a shape it knows or a cube is dropped; the rest brought into bounds. */
export function areasFromJSON(json: unknown): Areas {
  if (!Array.isArray(json) || json.length === 0) return NO_AREAS;
  const out: Area[] = [];
  for (const raw of json as unknown[]) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const shape = AREA_SHAPES.find((one) => one.id === entry.shape)?.id;
    const at = cube(entry.at);
    if (typeof entry.id !== 'string' || !entry.id || !shape || !at) continue;
    if (out.some((area) => area.id === entry.id)) continue;
    const aim = cube(entry.aim) ?? ALONG_X;
    out.push({
      id: entry.id as AreaId,
      shape,
      at,
      aim: cleanAim(shape, aim),
      size: cleanSize(typeof entry.size === 'number' ? entry.size : MIN_AREA_SIZE),
      colour: typeof entry.colour === 'string' && AREA_COLOURS.some((one) => one.id === entry.colour) ? entry.colour : AREA_COLOURS[0]!.id,
      name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim().slice(0, MAX_AREA_NAME) : AREA_SHAPES.find((one) => one.id === shape)!.name,
      hidden: entry.hidden === true,
      ...(typeof entry.follows === 'string' && entry.follows ? { follows: entry.follows } : {}),
    });
  }
  return out.length === 0 ? NO_AREAS : out;
}
