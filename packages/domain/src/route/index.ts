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
import { LEVEL_HEIGHT, chunkAt, columnAt, fromGlobal } from '../world/index.js';
import type { Discovery } from '../discovery/index.js';
import { isChunkKnown } from '../discovery/index.js';
import type { TravelMode, TravelModeId, Travelling } from '../travel/index.js';
import {
  DEFAULT_TRAVEL_MODES, cellCost, isPassable, climbFactor, waysOf,
} from '../travel/index.js';
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
  /**
   * How long it takes, in **days** — not an abstract cost (R-200).
   *
   * The search minimises this directly, which it has to once a journey may
   * mix conveyances: a walker at 39 km a day and a ship at 77 do not turn one
   * unit of difficulty into the same duration, so a router minimising
   * difficulty would pick cheap routes that take longer (D-299). With one
   * conveyance the two are the same question, divided by a constant.
   */
  readonly days: number;
  /**
   * How the days were spent, by conveyance, in the order each was first used.
   *
   * What makes a mixed journey readable: *"4.2 days — 3.1 on foot, 1.1 by
   * ship"* says where the time went, which one number cannot.
   */
  readonly legs: readonly { readonly mode: TravelModeId; readonly days: number }[];
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
 *
 * Exported for the other search, inside a map (`../walk`), and not from the
 * package: it is a tool of the two searches, not a thing in the domain.
 */
export class Frontier {
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

/** What a cell offers each conveyance, or null when none of them may enter. */
interface Entry {
  /** Difficulty under each way that can cross it, keyed by mode id. */
  readonly ways: readonly { readonly mode: TravelMode; readonly difficulty: number }[];
  readonly height: number;
}

function enterCost(
  world: World,
  discovery: Discovery,
  ways: readonly TravelMode[],
  gx: number,
  gz: number,
): Entry | null {
  const { coord, x, z } = fromGlobal({ gx, gz });
  // Unauthored is not the same as unknown, and neither may be crossed: one is
  // ground that does not exist and the other is ground the party has not seen
  // (R-133, D-131).
  if (!isChunkKnown(discovery, coord as ChunkCoord)) return null;
  const chunk = chunkAt(world, coord);
  if (!chunk) return null;
  const column = columnAt(chunk, x, z);
  if (!column) return null;
  /*
   * Every conveyance the party has, and what this cell costs each. A boat on
   * grass and a walker in the sea both come back impassable from the machinery
   * that already existed (R-52b) — so "which way can cross this" needs no new
   * rule, only the question asked once per way (D-299).
   */
  const open = ways
    .map((mode) => ({ mode, difficulty: cellCost(mode, column) }))
    .filter((way): way is { mode: TravelMode; difficulty: number } => isPassable(way.difficulty));
  if (open.length === 0) return null;
  return { ways: open, height: column.height };
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
  travelling: Travelling,
  from: GlobalCell,
  to: GlobalCell,
  budget: number = ROUTE_BUDGET,
): Route | null {
  const ways = waysOf(DEFAULT_TRAVEL_MODES, travelling);
  if (ways.length === 0) return null;
  // The campaign's own cell, not the default: it says how long, never which
  // way, since the slopes are the drawing's own (D-373).
  const kmPerCell = world.metresPerCell / 1000;
  /** The fastest anything the party has could cross one flat cell, in days. */
  const quickest = ways.reduce(
    (best, way) => Math.min(best, (kmPerCell / way.kmPerDay) * CHEAPEST_STEP),
    Number.POSITIVE_INFINITY,
  );
  const start = enterCost(world, discovery, ways, from.gx, from.gz);
  const goal = enterCost(world, discovery, ways, to.gx, to.gz);
  if (!start || !goal) return null;
  if (from.gx === to.gx && from.gz === to.gz) return { cells: [from], days: 0, legs: [] };

  const startKey = keyOf(from.gx, from.gz);
  const goalKey = keyOf(to.gx, to.gz);
  const best = new Map<number, number>([[startKey, 0]]);
  const cameFrom = new Map<number, number>();
  /** Which way entered each cell, and what it cost in days to do so. */
  const arrived = new Map<number, { mode: TravelModeId; days: number }>();
  const heights = new Map<number, number>([[startKey, start.height]]);
  const at = new Map<number, GlobalCell>([[startKey, from]]);
  const settled = new Set<number>();
  const frontier = new Frontier();
  frontier.push(startKey, octile(from.gx, from.gz, to.gx, to.gz) * quickest);

  while (frontier.size > 0 && settled.size < budget) {
    const key = frontier.pop()!;
    if (settled.has(key)) continue;
    settled.add(key);
    if (key === goalKey) {
      const cells: GlobalCell[] = [];
      const spent: { mode: TravelModeId; days: number }[] = [];
      for (let walk: number | undefined = key; walk !== undefined; walk = cameFrom.get(walk)) {
        cells.push(at.get(walk)!);
        const leg = arrived.get(walk);
        if (leg) spent.push(leg);
      }
      cells.reverse();
      spent.reverse();
      // Gathered by conveyance, in the order each was first used, so a mixed
      // journey can say where its time went.
      const legs: { mode: TravelModeId; days: number }[] = [];
      for (const { mode, days } of spent) {
        const already = legs.find((leg) => leg.mode === mode);
        if (already) legs[legs.indexOf(already)] = { mode, days: already.days + days };
        else legs.push({ mode, days });
      }
      return { cells, days: best.get(goalKey)!, legs };
    }
    const here = at.get(key)!;
    const height = heights.get(key)!;
    const soFar = best.get(key)!;
    for (const [dx, dz, span] of STEPS) {
      const gx = here.gx + dx;
      const gz = here.gz + dz;
      const next = keyOf(gx, gz);
      if (settled.has(next)) continue;
      const step = enterCost(world, discovery, ways, gx, gz);
      if (!step) continue;
      /*
       * The gradient of this step, and it is the *step's* gradient: a
       * diagonal covers √2 cells of ground for the same rise, so it is less
       * steep than an orthogonal one and costs accordingly (R-52a).
       */
      const grade = ((step.height - height) * LEVEL_HEIGHT) / span;
      /*
       * The quickest way across *this* cell, which is how a journey comes to
       * be mixed: a boat is impassable on grass and a walker in the sea, so
       * the party simply uses whichever of its conveyances can cross, and the
       * change of medium happens at the cell boundary (D-299).
       *
       * In **days**, not difficulty, because the ways do not share a pace.
       */
      let fastest: { mode: TravelModeId; days: number } | null = null;
      for (const way of step.ways) {
        // Multiplied, not added: climbing through a swamp is worse than
        // either on its own, and a factor is what a speed model gives you.
        const cells = span * way.difficulty * climbFactor(way.mode.slope, grade);
        const days = (cells * kmPerCell) / way.mode.kmPerDay;
        if (!fastest || days < fastest.days) fastest = { mode: way.mode.id, days };
      }
      if (!fastest) continue;
      const cost = soFar + fastest.days;
      const known = best.get(next);
      if (known !== undefined && known <= cost) continue;
      best.set(next, cost);
      cameFrom.set(next, key);
      arrived.set(next, fastest);
      heights.set(next, step.height);
      at.set(next, { gx, gz });
      frontier.push(next, cost + octile(gx, gz, to.gx, to.gz) * quickest);
    }
  }
  return null;
}

/**
 * How long a route takes, in days.
 *
 * Kept as a function although it now reads one field: the route carries days
 * because the search had to minimise them (R-200), and callers asking "how
 * long" should not have to know that changed.
 */
export function daysAcross(route: Route): number {
  return route.days;
}
