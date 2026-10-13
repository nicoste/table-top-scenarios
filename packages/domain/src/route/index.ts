// How the party gets from here to there, and what it costs them (R-52, R-133).
//
// Every number this reads has been written and tested for rounds and consumed
// by nothing: material difficulty (R-192), a cut's own override, a cover's
// multiplier (R-193), the mode's family overrides, the 0.83 slope factor
// (R-52a). Until there is a route, a GM can paint a jungle on a mountain and
// the map says the same thing it said about a meadow.
//
// **A route is a preview, not a rule.** R-133 is explicit that the destination
// is never adjacency-checked: a GM may move the party anywhere they like, and
// this exists to say *what that journey is like*, not to forbid it. So it
// returns `null` rather than refusing anything, and a `null` means "I cannot
// show you a way", never "you may not go".
//
// **Known ground only.** Routing through unexplored country would quietly
// undo R-131 — the party would learn the shape of land they have never seen
// from the shape of the line drawn across it.

import type { ChunkCoord, GlobalCell, World } from '../world/index.js';
import { chunkAt, columnAt, fromGlobal } from '../world/index.js';
import type { Discovery } from '../discovery/index.js';
import { isChunkKnown } from '../discovery/index.js';
import type { TravelMode } from '../travel/index.js';
import { cellCost, isPassable, climbFactor } from '../travel/index.js';
import { DEFAULT_MATERIALS, difficultyOf } from '../materials/index.js';

/**
 * A journey, in the order it is walked.
 *
 * `cost` is in **cells of reference ground** — grassland at ×1, which is what
 * every difficulty in the registry is normalised against (R-192). It is not
 * kilometres and not days until something divides it by a pace, which is what
 * `daysAcross` is for.
 */
export interface Route {
  /** From the party's cell to the destination, both included. */
  readonly cells: readonly GlobalCell[];
  readonly cost: number;
}

/**
 * How many cells a search may settle before it gives up.
 *
 * A world is up to 900×900 cells and this runs on **pointer move** during the
 * aim step (R-132), so it needs a ceiling more than it needs to be thorough.
 * Twelve thousand is roughly a thirteen-chunk radius of open country — far
 * past any journey a GM plans in one hop — and it costs under a millisecond.
 * Past it the answer is "no route shown", which reads the same as "no route",
 * and R-133 means the move is still allowed either way.
 */
export const ROUTE_BUDGET = 12_000;

/**
 * The cheapest a single orthogonal step can be, for the A* estimate.
 *
 * Derived from the registry rather than typed, so retuning a material cannot
 * silently make the estimate optimistic. Covers only ever multiply upward
 * (R-195), so they cannot lower it.
 *
 * **A per-cell override may go below this** (R-77), and then the route found
 * is a very good one rather than a provably cheapest one. That is an honest
 * trade for a preview: a GM who writes 0.1 on a cell is drawing a road, and
 * the line will still follow it.
 */
const CHEAPEST_STEP = DEFAULT_MATERIALS.reduce((low, material) => (
  material.cuts.reduce((cut, { id }) => {
    const difficulty = difficultyOf(material, id);
    return difficulty === 'impassable' ? cut : Math.min(cut, difficulty);
  }, low)
), Number.POSITIVE_INFINITY);

/** Eight ways out of a cell, with the diagonal costing what a diagonal is. */
const STEPS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

const keyOf = (gx: number, gz: number): number => (gx + 0x8000) * 0x10000 + (gz + 0x8000);

/** Octile distance: the cheapest number of steps, diagonals counted properly. */
function octile(ax: number, az: number, bx: number, bz: number): number {
  const dx = Math.abs(ax - bx);
  const dz = Math.abs(az - bz);
  return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
}

/**
 * A binary heap, because the open set is read far more than it is written and
 * a sorted array turns the search quadratic exactly when the world gets big
 * enough to need a budget.
 */
class Frontier {
  private readonly keys: number[] = [];
  private readonly scores: number[] = [];

  get size(): number { return this.keys.length; }

  push(key: number, score: number): void {
    this.keys.push(key);
    this.scores.push(score);
    let at = this.keys.length - 1;
    while (at > 0) {
      const up = (at - 1) >> 1;
      if (this.scores[up]! <= this.scores[at]!) break;
      this.swap(at, up);
      at = up;
    }
  }

  pop(): number | null {
    if (this.keys.length === 0) return null;
    const top = this.keys[0]!;
    const key = this.keys.pop()!;
    const score = this.scores.pop()!;
    if (this.keys.length > 0) {
      this.keys[0] = key;
      this.scores[0] = score;
      let at = 0;
      for (;;) {
        const left = at * 2 + 1;
        const right = left + 1;
        let small = at;
        if (left < this.keys.length && this.scores[left]! < this.scores[small]!) small = left;
        if (right < this.keys.length && this.scores[right]! < this.scores[small]!) small = right;
        if (small === at) break;
        this.swap(at, small);
        at = small;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!];
    [this.scores[a], this.scores[b]] = [this.scores[b]!, this.scores[a]!];
  }
}

/** What one cell costs to stand in, or null when it cannot be entered at all. */
function enterCost(
  world: World,
  discovery: Discovery,
  travelMode: TravelMode,
  gx: number,
  gz: number,
): { cost: number; height: number } | null {
  const { coord, x, z } = fromGlobal({ gx, gz });
  // Unauthored is not the same as unknown, and neither may be crossed: one is
  // ground that does not exist and the other is ground the party has not seen
  // (R-133, D-131).
  if (!isChunkKnown(discovery, coord as ChunkCoord)) return null;
  const chunk = chunkAt(world, coord);
  if (!chunk) return null;
  const column = columnAt(chunk, x, z);
  if (!column) return null;
  const cost = cellCost(travelMode, column);
  if (!isPassable(cost)) return null;
  return { cost, height: column.height };
}

/**
 * The cheapest way from one cell to another, or `null` when there is none to
 * show.
 *
 * `null` covers four honest cases and they are deliberately not told apart:
 * the destination is unknown ground, it is impassable to this mode, nothing
 * connects the two, or the search ran out of budget. The aim step says the
 * same thing for all four — no line — and R-133 lets the GM move there
 * regardless.
 *
 * The step cost is R-52a's, exactly:
 * `baseDistance × difficulty(target) + slopeFactor × |Δheight|`.
 */
export function routeAcross(
  world: World,
  discovery: Discovery,
  travelMode: TravelMode,
  from: GlobalCell,
  to: GlobalCell,
  budget: number = ROUTE_BUDGET,
): Route | null {
  // The campaign's own scales, not the defaults: R-52a moves when they move.
  const metresPerCell = world.metresPerCell;
  const metresPerLevel = world.metresPerLevel;
  const start = enterCost(world, discovery, travelMode, from.gx, from.gz);
  const goal = enterCost(world, discovery, travelMode, to.gx, to.gz);
  if (!start || !goal) return null;
  if (from.gx === to.gx && from.gz === to.gz) return { cells: [from], cost: 0 };

  const startKey = keyOf(from.gx, from.gz);
  const goalKey = keyOf(to.gx, to.gz);
  const best = new Map<number, number>([[startKey, 0]]);
  const cameFrom = new Map<number, number>();
  const heights = new Map<number, number>([[startKey, start.height]]);
  const at = new Map<number, GlobalCell>([[startKey, from]]);
  const settled = new Set<number>();
  const frontier = new Frontier();
  frontier.push(startKey, octile(from.gx, from.gz, to.gx, to.gz) * CHEAPEST_STEP);

  while (frontier.size > 0 && settled.size < budget) {
    const key = frontier.pop()!;
    if (settled.has(key)) continue;
    settled.add(key);
    if (key === goalKey) {
      const cells: GlobalCell[] = [];
      for (let walk: number | undefined = key; walk !== undefined; walk = cameFrom.get(walk)) {
        cells.push(at.get(walk)!);
      }
      cells.reverse();
      return { cells, cost: best.get(goalKey)! };
    }
    const here = at.get(key)!;
    const height = heights.get(key)!;
    const soFar = best.get(key)!;
    for (const [dx, dz, span] of STEPS) {
      const gx = here.gx + dx;
      const gz = here.gz + dz;
      const next = keyOf(gx, gz);
      if (settled.has(next)) continue;
      const step = enterCost(world, discovery, travelMode, gx, gz);
      if (!step) continue;
      /*
       * The gradient of this step, and it is the *step's* gradient: a
       * diagonal covers √2 cells of ground for the same rise, so it is less
       * steep than an orthogonal one and costs accordingly (R-52a).
       */
      const grade = ((step.height - height) * metresPerLevel) / (span * metresPerCell);
      // Multiplied, not added: climbing through a swamp is worse than either
      // on its own, and a factor is what a speed model gives you (D-296).
      const cost = soFar + span * step.cost * climbFactor(travelMode.slope, grade);
      const known = best.get(next);
      if (known !== undefined && known <= cost) continue;
      best.set(next, cost);
      cameFrom.set(next, key);
      heights.set(next, step.height);
      at.set(next, { gx, gz });
      frontier.push(next, cost + octile(gx, gz, to.gx, to.gz) * CHEAPEST_STEP);
    }
  }
  return null;
}

/**
 * How long a route takes, in days.
 *
 * The cost is in cells of reference ground and a cell is `metresPerCell`
 * across, so this is the one place the two scales meet. It takes the world's
 * own figure rather than the default, because a campaign may set its own
 * (R-80's neighbourhood).
 */
export function daysAcross(route: Route, travelMode: TravelMode, metresPerCell: number): number {
  const km = (route.cost * metresPerCell) / 1000;
  return km / travelMode.kmPerDay;
}
