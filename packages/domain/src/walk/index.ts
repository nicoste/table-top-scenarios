// How far a token would walk inside a map, and over which floors (R-209).
//
// The world's route one surface down (R-197), and on the same first principle:
// **a path is a preview, not a rule** (R-133). Nothing here refuses a move —
// how far somebody may go turns on a thousand things the tool does not know,
// and the GM's word on all of them. It returns `null` for "no path to show",
// never for "you may not go".
//
// **Real distance, not any game's rules** (D-316). A step straight across is
// 1 and a diagonal √2. Nobody moves straight up or straight down — they would
// end up in the air or inside a block — so a change of level is always taken
// *with* a step across: up a stair is √2, and up a stair diagonally √3. What
// the number is in, the table decides; the tool says the number.
//
// **Walking, and climbing what is there to climb.** One block up or down per
// step, so a taller ledge is walked round, and a wall with no way round has no
// path — unless something on it is climbed (D-358): a ladder, a rope, holds,
// vines. Through those, and only those, a step may go straight up or straight
// down, and it counts 1, as a step across does. How hard the climb is, is the
// GM's (R-1); the tool says how far.

import type { BlockCoord, EncounterMap } from '../map/index.js';
import { blockAt, blockKey, inMap, MAP_MIN_DEPTH } from '../map/index.js';
import { Frontier } from '../route/index.js';
import type { Opened } from '../props/index.js';
import { NONE_OPEN, propRules } from '../props/index.js';

/** A walk, in the order it is taken. */
export interface Walk {
  /** From the token's cube to the target, both included. */
  readonly cubes: readonly BlockCoord[];
  /** How far: 1 for each step across, √2 for a diagonal or a stair, √3 for both. */
  readonly length: number;
}

/**
 * How many cubes a search may settle before it gives up.
 *
 * It runs whenever the aim moves to another cube (R-138), so it needs a
 * ceiling more than it needs to be thorough — the world's reason for its own
 * (`ROUTE_BUDGET`). Twenty thousand is every floor of a large building several
 * times over; past it the answer is "no path", and the move is allowed anyway.
 */
export const WALK_BUDGET = 20_000;

/** Twenty-four ways out of a cube: the eight across, on the level, a block up and a block down. */
const STEPS: readonly (readonly [number, number, number, number])[] = [-1, 0, 1].flatMap((dy) =>
  [-1, 0, 1].flatMap((dx) => [-1, 0, 1]
    .filter((dz) => dx !== 0 || dz !== 0)
    .map((dz) => [dx, dy, dz, Math.hypot(dx, dy, dz)] as const)));

/** Straight up and straight down: only on something climbed (D-358). */
const CLIMBS: readonly (readonly [number, number, number, number])[] = [[0, 1, 0, 1], [0, -1, 0, 1]];

/** Every way out of a cube a walk may try. */
const WAYS = [...STEPS, ...CLIMBS];

/**
 * The shortest a walk between two cubes could possibly be: the length with
 * nothing in the way and any step allowed, diagonals of every kind included.
 * Never more than the real answer, so the search stays exact (A*).
 */
function estimate(a: BlockCoord, b: BlockCoord): number {
  const [far, mid, near] = [Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z)]
    .sort((p, q) => q - p) as [number, number, number];
  return Math.sqrt(3) * near + Math.SQRT2 * (mid - near) + (far - mid);
}

/**
 * Whether the air a step passes through is clear: nobody walks through a
 * block, or squeezes between two that meet only at their corners.
 *
 * - **Up**: room above the cube they leave, to climb into.
 * - **Down**: room over the edge, in the column they step into, at the level
 *   they leave — they walk out, then step down.
 * - **Diagonally**: both cubes beside the corner, at the higher of the two
 *   levels.
 *
 * The same answer either way along a step, so a walk back is as long as the
 * walk there.
 */
function clear(
  solid: (at: BlockCoord) => boolean,
  a: BlockCoord,
  dx: number,
  dy: number,
  dz: number,
): boolean {
  const top = a.y + Math.max(0, dy);
  if (dy > 0 && solid({ x: a.x, y: top, z: a.z })) return false;
  if (dy < 0 && solid({ x: a.x + dx, y: top, z: a.z + dz })) return false;
  if (dx !== 0 && dz !== 0) {
    if (solid({ x: a.x + dx, y: top, z: a.z })) return false;
    if (solid({ x: a.x, y: top, z: a.z + dz })) return false;
  }
  return true;
}

/**
 * The shortest walk from a token's cube to another, or `null` when there is
 * none to show: nothing connects them, the target is no floor, or the search
 * ran out of budget. Not told apart, for the world route's reason — the readout
 * says *no path* for all of them, and the move is allowed regardless.
 *
 * Every cube on the way is one somebody could stand in: empty, with a block
 * under it, no prop in it that stops walking as it stands now (`opened` says
 * which doors are open, D-322), and allowed by `may` — the screen's own limits, which are the
 * levels it is showing and, on the table, only floors the party has seen, so
 * a path never draws the shape of a room nobody has looked into. Other tokens
 * are walked through, not round: a path may pass anybody, and only the cube a
 * move ends in has to be free, which the move itself already checks.
 */
export function walkAcross(
  map: EncounterMap,
  from: BlockCoord,
  to: BlockCoord,
  may: (at: BlockCoord) => boolean = () => true,
  budget: number = WALK_BUDGET,
  opened: Opened = NONE_OPEN,
): Walk | null {
  // A prop that stops walking is as solid as a block to a walk: nobody stands
  // in it, and nobody squeezes past its corner (D-322).
  const rules = map.props.length > 0 ? propRules(map.props, opened) : null;
  const solid = (at: BlockCoord) => !!blockAt(map, at) || (!!rules && rules.walking.has(blockKey(at)));
  // On a block, or on stairs (D-350).
  const floored = (below: BlockCoord) => !!blockAt(map, below) || (!!rules && rules.floors.has(blockKey(below)));
  // On something climbed — a ladder's rung, a rope, holds, vines (D-357, D-358).
  const climbed = (at: BlockCoord) => !!rules && rules.rungs.has(blockKey(at));
  const stands = (at: BlockCoord) => inMap(map, at)
    && !solid(at)
    && (floored({ x: at.x, y: at.y - 1, z: at.z }) || climbed(at))
    && may(at);
  // The start is wherever the token is, floor or not: a trapdoor opened under
  // somebody leaves them hanging (R-186), and they can still be measured from.
  if (!inMap(map, from) || !stands(to)) return null;
  if (from.x === to.x && from.y === to.y && from.z === to.z) {
    return { cubes: [{ x: from.x, y: from.y, z: from.z }], length: 0 };
  }

  const { origin, size } = map;
  const keyOf = (at: BlockCoord) =>
    ((at.y - MAP_MIN_DEPTH) * size.z + (at.z - origin.z)) * size.x + (at.x - origin.x);
  const startKey = keyOf(from);
  const goalKey = keyOf(to);
  const best = new Map<number, number>([[startKey, 0]]);
  const cameFrom = new Map<number, number>();
  const at = new Map<number, BlockCoord>([[startKey, from]]);
  const settled = new Set<number>();
  const frontier = new Frontier();
  frontier.push(startKey, estimate(from, to));

  while (frontier.size > 0 && settled.size < budget) {
    const key = frontier.pop()!;
    if (settled.has(key)) continue;
    settled.add(key);
    if (key === goalKey) {
      const cubes: BlockCoord[] = [];
      for (let walk: number | undefined = key; walk !== undefined; walk = cameFrom.get(walk)) {
        const cube = at.get(walk)!;
        cubes.push({ x: cube.x, y: cube.y, z: cube.z });
      }
      return { cubes: cubes.reverse(), length: best.get(goalKey)! };
    }
    const here = at.get(key)!;
    const soFar = best.get(key)!;
    for (const [dx, dy, dz, span] of WAYS) {
      const next = { x: here.x + dx, y: here.y + dy, z: here.z + dz };
      // Straight up or down only off something climbed, or onto it (D-358).
      if (dx === 0 && dz === 0 && !climbed(here) && !climbed(next)) continue;
      if (!stands(next)) continue;
      const nextKey = keyOf(next);
      if (settled.has(nextKey)) continue;
      if (!clear(solid, here, dx, dy, dz)) continue;
      const cost = soFar + span;
      const known = best.get(nextKey);
      if (known !== undefined && known <= cost) continue;
      best.set(nextKey, cost);
      cameFrom.set(nextKey, key);
      at.set(nextKey, next);
      frontier.push(nextKey, cost + estimate(next, to));
    }
  }
  return null;
}
