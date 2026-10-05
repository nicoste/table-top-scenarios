// Cutting planes and the level range (R-146).
//
// The GM's own design, and the reason it is a *range* rather than a clamp: one
// upper bound can cut a roof away but cannot hide a cellar while the party
// stands on the grass above it. Both handles are needed, and the lower one is
// the half a clamp misses.
//
// Two halves that live in different places (R-8):
//   - The **planes** are authored. They belong to the map, they have names the
//     GM chose, and they are the snap steps the range moves between.
//   - The **range** is play state. It is where the party's attention is right
//     now, which is a fact about this session and not about the building.
//
// Nothing here knows about vision. The range decides which *levels* the table
// is shown at all; what the party can see *within* those levels is a later
// layer (R-40 to R-45), and it narrows rather than widens — a token can never
// see a level the GM has cut away.

import type { PlaneId } from '../ids/index.js';
import { freshId } from '../ids/index.js';

/**
 * A named horizontal cut. **Y and nothing else** — no X, no Z (R-146).
 *
 * The GM's words: *"Every plane has just a Y component (X and Z are not needed
 * at all)."* A plane is a floor level, and a floor is the whole footprint.
 */
export interface CuttingPlane {
  readonly id: PlaneId;
  readonly name: string;
  /** Strictly inside the body: a cut at the floor or the ceiling cuts nothing. */
  readonly y: number;
}

/**
 * Which levels are drawn, as a **half-open** band: `lower <= y < upper`.
 *
 * Half-open because a plane is the boundary *between* two levels, not a level
 * of its own. With planes at 4, 8 and 12 the GM's worked example reads exactly
 * as they wrote it: `[4, cap]` is the building without its cellar, `[4, 8]` the
 * ground floor, `[4, 12]` ground plus upstairs, and `[0, 4]` the cellar alone.
 */
export interface LevelRange {
  readonly lower: number;
  readonly upper: number;
}

export const MAX_PLANE_NAME = 40;

function cleanName(name: string, fallback: string): string {
  return name.trim().slice(0, MAX_PLANE_NAME) || fallback;
}

/** By Y, so the list reads bottom-to-top and the steps need no second sort. */
function ordered(planes: readonly CuttingPlane[]): readonly CuttingPlane[] {
  return [...planes].sort((a, b) => a.y - b.y);
}

/**
 * Is this a Y a plane could sit at, given the body's height?
 *
 * Strictly between floor and ceiling. Both ends are already steps (R-146), so a
 * plane there would add nothing and would give the GM a named cut that does not
 * cut.
 */
export function validPlaneY(y: number, cap: number, floor: number): boolean {
  // Not at either bound: both are already steps, so a plane there would be a
  // named cut that cuts nothing. Zero is *not* excluded — water level is an
  // ordinary plane that new maps simply start with (R-161).
  return Number.isInteger(y) && y > floor && y < cap;
}

export function planeAt(planes: readonly CuttingPlane[], y: number): CuttingPlane | null {
  return planes.find((plane) => plane.y === y) ?? null;
}

export function planeById(planes: readonly CuttingPlane[], id: PlaneId): CuttingPlane | null {
  return planes.find((plane) => plane.id === id) ?? null;
}

/**
 * Adds a plane. Refuses a second one at the same Y.
 *
 * Two planes on one level would collapse into a single step, leaving the GM a
 * name in the list that no range can ever select — and the list and the steps
 * are meant to be the same thing read two ways.
 */
export function addPlane(
  planes: readonly CuttingPlane[],
  name: string,
  y: number,
  cap: number,
  floor: number,
): readonly CuttingPlane[] {
  if (!validPlaneY(y, cap, floor) || planeAt(planes, y)) return planes;
  return ordered([
    ...planes,
    { id: freshId<'PlaneId'>('plane'), name: cleanName(name, `Level ${y}`), y },
  ]);
}

export function renamePlane(
  planes: readonly CuttingPlane[],
  id: PlaneId,
  name: string,
): readonly CuttingPlane[] {
  const clean = cleanName(name, '');
  if (!clean) return planes;
  let touched = false;
  const next = planes.map((plane) => {
    if (plane.id !== id || plane.name === clean) return plane;
    touched = true;
    return { ...plane, name: clean };
  });
  return touched ? next : planes;
}

/** Moves a plane to another level, unless one is already there. */
export function movePlane(
  planes: readonly CuttingPlane[],
  id: PlaneId,
  y: number,
  cap: number,
  floor: number,
): readonly CuttingPlane[] {
  if (!validPlaneY(y, cap, floor)) return planes;
  // Occupied by another plane, or this one is already there: either way there is
  // nothing to do, and returning the same array keeps identity (R-165).
  if (planeAt(planes, y)) return planes;
  let touched = false;
  const next = planes.map((plane) => {
    if (plane.id !== id) return plane;
    touched = true;
    return { ...plane, y };
  });
  return touched ? ordered(next) : planes;
}

export function removePlane(
  planes: readonly CuttingPlane[],
  id: PlaneId,
): readonly CuttingPlane[] {
  const next = planes.filter((plane) => plane.id !== id);
  return next.length === planes.length ? planes : next;
}

/**
 * The values a range's handles may take: every plane, plus the floor and the
 * ceiling, which are **always** available as the outermost two (R-146).
 *
 * A map with no planes therefore has exactly one range — all of it — which is
 * the right answer for a body nobody has divided yet, and it is derived rather
 * than special-cased.
 */
/**
 * The values a range's handles may take (R-161).
 *
 * **Two fixed bounds** — Sky at the ceiling, Bedrock at the digging limit —
 * and the GM's planes between them.
 *
 * Fixed bounds are the point. The bottom step used to be *the deepest block*,
 * so the lowest label slid downward as the GM dug. Anchoring the two ends gives
 * references that hold still and keeps a saved band valid when blocks are
 * erased. **Zero is not one of them**: a new map starts with a plane there
 * called water level, and the GM may rename, move or delete it like any other.
 */
export function planeSteps(
  // Heights, not identities: the console reads these straight off the wire,
  // where an id is a plain string.
  planes: readonly { readonly y: number }[],
  cap: number,
  floor: number,
): readonly number[] {
  const steps = new Set<number>([floor, cap]);
  for (const plane of planes) if (validPlaneY(plane.y, cap, floor)) steps.add(plane.y);
  return [...steps].sort((a, b) => a - b);
}

export function fullRange(cap: number, floor: number): LevelRange {
  return { lower: floor, upper: cap };
}

/**
 * Makes a range legal without moving a handle the GM did not touch (R-161).
 *
 * Clamps to the bounds, orders the two, and opens a band that would select
 * nothing. It does **not** pull a handle onto the nearest step, and that was a
 * real bug when it did: the ladder sends both bounds on every change, so moving
 * the top handle re-snapped the bottom one — a GM whose band started at a level
 * left off-step by a deleted plane lost it to a click somewhere else entirely.
 *
 * Snapping was designed for a drag, where a handle lands between steps. The
 * ladder can only produce a step, so the pull had nothing left to do but harm.
 * A stored band is the GM's, and nothing moves it behind their back.
 */
export function clampRange(
  planes: readonly CuttingPlane[],
  range: LevelRange,
  cap: number,
  floor: number,
): LevelRange {
  const within = (value: number) => Math.min(cap, Math.max(floor, Math.round(value)));
  let lower = within(range.lower);
  let upper = within(range.upper);
  if (lower > upper) [lower, upper] = [upper, lower];

  if (lower === upper) {
    /*
     * Both handles on one height, which would select nothing and hide the map
     * with no hint of why.
     *
     * Open **upward** to the next step: a band is named by the level it sits
     * on, so pinching at water level should give the storey above rather than
     * the cellar below. Downward only at the ceiling, where there is no up.
     */
    const steps = planeSteps(planes, cap, floor);
    const above = steps.find((step) => step > lower);
    const below = [...steps].reverse().find((step) => step < lower);
    if (above !== undefined) upper = above;
    else if (below !== undefined) lower = below;
  }
  return { lower, upper };
}

/**
 * Moves a band onto the nearest stops (R-161).
 *
 * Used **only when the stops themselves change** — a plane added, moved or
 * removed — and never on an ordinary band change. Deleting the level a band
 * rests on has to move it somewhere, and doing that visibly, at the moment of
 * the delete, beats leaving the band at a height that is no longer a level and
 * making every reader cope.
 *
 * The alternative was what this replaces: a band allowed to rest between
 * levels, and a ladder that grew a ghost row to show it. Rows that appear and
 * vanish as the band moves make the list feel like it is guessing.
 */
export function settleRange(
  planes: readonly CuttingPlane[],
  range: LevelRange,
  cap: number,
  floor: number,
): LevelRange {
  const steps = planeSteps(planes, cap, floor);
  const nearest = (value: number) => steps.reduce(
    (best, step) => (Math.abs(step - value) < Math.abs(best - value) ? step : best),
    steps[0] ?? floor,
  );
  return clampRange(planes, { lower: nearest(range.lower), upper: nearest(range.upper) }, cap, floor);
}

/** Is this level inside the band? Half-open, so a plane belongs to what is above it. */
export function inRange(range: LevelRange, y: number): boolean {
  return y >= range.lower && y < range.upper;
}

export function sameRange(a: LevelRange, b: LevelRange): boolean {
  return a.lower === b.lower && a.upper === b.upper;
}

/** Whether a range selects the whole body, for a UI that wants to say so. */
export function isFullRange(range: LevelRange, cap: number, floor: number): boolean {
  return range.lower <= floor && range.upper >= cap;
}

/**
 * What a map's starting plane is called (R-161).
 *
 * Here rather than in the console because it is vocabulary rather than a label
 * (D-176's lesson): a GM saying "cut it at water level" should be saying the
 * word the code says. It is only a *default* — the plane is theirs to rename.
 */
export const WATER_LEVEL = 'Water level';

/**
 * What the two fixed bounds are called (R-161), or `null` for a height that is
 * the GM's to name.
 */
/**
 * The two ends of the ladder, named.
 *
 * The top is **the Sun**, not the sky (R-183). The rename is the feature: a
 * band that reaches it is a place with daylight in it, and a band that stops
 * short is somewhere indoors — so the name says what leaving it out costs, and
 * the GM sets the lighting by dragging the thing they were already dragging
 * (D-253).
 */
export function stepLabel(y: number, cap: number, floor: number): string | null {
  if (y >= cap) return 'Sun';
  if (y <= floor) return 'Bedrock';
  return null;
}

/**
 * Whether the sun reaches what this band is showing (R-183).
 *
 * A cut is the GM looking *into* a building, and the slice they get has no
 * roof on it — so a directional light pours straight in and the walls throw
 * shadows across a room that should be indoors. Nothing in the geometry can
 * say which of those a missing cube means, because they are the same geometry.
 *
 * This is the GM saying it, with the control they already use: if the top of
 * the ladder is not in the band, there is no sun in the scene.
 */
export function sunReaches(range: LevelRange, cap: number): boolean {
  return range.upper >= cap;
}

export interface PlaneJSON {
  id: string;
  name: string;
  y: number;
}

export function planesToJSON(planes: readonly CuttingPlane[]): PlaneJSON[] {
  return ordered(planes).map((plane) => ({ id: plane.id as string, name: plane.name, y: plane.y }));
}

export function planesFromJSON(json: readonly PlaneJSON[] | undefined | null): readonly CuttingPlane[] {
  if (!json) return [];
  return ordered(json.map((plane) => ({
    id: plane.id as PlaneId,
    name: plane.name,
    y: plane.y,
  })));
}
