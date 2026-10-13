// Travel modes. A mode is how the party is moving — on foot, mounted, by ship —
// and it decides *both* how fast they go and what they may cross.
//
// This is why water is not simply expensive. A single large multiplier would let
// the party wade the ocean; making water impassable on foot and ordinary by boat
// is what turns an island into something you need a ship for.

import { registryId } from '../ids/index.js';
import type { SwatchId } from '../ids/index.js';
import type { Difficulty } from '../materials/index.js';
import { materialIn, cutIdIn, difficultyOf, familyOf } from '../materials/index.js';
import type { Column } from '../world/index.js';
import { DEFAULT_COVERS, coverById, overCover } from '../covers/index.js';

export type TravelModeId = string & { readonly __travelMode: true };

/**
 * How a traveller answers a gradient (R-52a).
 *
 * **Tobler's hiking function**, which is the standard estimate for exactly
 * this: walking speed falls off exponentially with the steepness of the
 * ground, `exp(-bite · |grade + easiest|)`. Derived, not chosen — the same
 * claim the Naismith constant it replaces was making, and a better-founded
 * one, because Naismith is linear in *total ascent* and so cannot tell a
 * cliff from a ramp of the same height (D-296).
 *
 * **It belongs to the mode, not to the world.** A horse refuses ground a
 * walker will scramble, and a flyer does not care at all — `bite: 0` ignores
 * gradient entirely, which is the whole of what a flying mode needs.
 */
export interface Slope {
  /**
   * How hard steepness bites. Tobler's own figure is 3.5 for a walker.
   * **Zero ignores gradient**, which is how anything airborne or afloat is
   * described.
   */
  readonly bite: number;
  /**
   * The gradient that is *fastest*, as rise over run.
   *
   * Positive, and subtracted in effect: 0.05 means a gentle **descent** is the
   * quickest ground there is, which is both true of walking and what makes
   * going down cheaper than going up without a second rule for it.
   */
  readonly easiest: number;
}

/** Anything on legs. Tobler's constants, unmodified. */
const WALKING: Slope = { bite: 3.5, easiest: 0.05 };
/**
 * A horse. The same curve, bitten harder: a mount is surer than a walker on
 * the flat and worse than one on anything steep, and it is never *forbidden*
 * a slope — the cost says no long before a rule would (D-296).
 */
const RIDING: Slope = { bite: 5, easiest: 0.05 };
/** A wagon on a slope is the worst of all of them, and knows it. */
const HAULING: Slope = { bite: 7, easiest: 0.05 };
/**
 * Afloat, or airborne: the water is flat and the ground is not in the way, so
 * for either of them the question never arises.
 */
const AFLOAT: Slope = { bite: 0, easiest: 0 };

/**
 * How much longer one step takes at this gradient, against flat ground.
 *
 * `grade` is rise over run, signed: positive climbing, negative descending.
 * One is flat ground and nothing is ever cheaper than the easiest gradient,
 * so this never goes below one — a route cannot *gain* by going downhill,
 * only lose less.
 */
export function climbFactor(slope: Slope, grade: number): number {
  if (slope.bite === 0) return 1;
  const flat = Math.exp(slope.bite * Math.abs(slope.easiest));
  return Math.exp(slope.bite * Math.abs(grade + slope.easiest)) / flat;
}

/**
 * Where a conveyance works (R-200).
 *
 * Not a *rule* about where it may go — the overrides below already say that,
 * and say it in the one place the cost is read. This is how a GM is asked the
 * question: what have you got on land, on the water, in the air. Three
 * answers, and the party travels by whichever of them suits the cell they are
 * entering.
 */
export type Medium = 'land' | 'water' | 'air';

export interface TravelMode {
  readonly id: TravelModeId;
  readonly name: string;
  /** Which of the GM's three answers this one is for (R-200). */
  readonly medium: Medium;
  /** Distance covered in a day of travel on reference terrain. */
  readonly kmPerDay: number;
  /**
   * How to treat ground with no explicit entry below.
   *
   * `free` is how anything airborne is described: the ground is under it, not
   * in its way, so a jungle costs a balloon what a meadow does.
   */
  readonly fallback: 'ground-default' | 'impassable' | 'free';
  /** How this traveller answers a slope (R-52a). */
  readonly slope: Slope;
  /**
   * Costs that override the ground's own, keyed by **family or swatch**
   * (R-192, D-281).
   *
   * A family key is the usual one: a boat does not care whether it is on water
   * or green water, only that the family is Liquids. A swatch key is there for
   * when one cut of that family really is different — a boat in the shallows
   * is slower than a boat at sea — and it is checked first, exactly as a cut's
   * own difficulty beats its family's.
   */
  readonly overrides: Readonly<Record<string, Difficulty>>;
}

const LIQUIDS = 'material:liquid';
const SHORE = 'material:liquid/shore';

const mode = (
  value: string, name: string, medium: Medium, kmPerDay: number,
  slope: Slope = WALKING,
  fallback: TravelMode['fallback'] = 'ground-default',
  overrides: Record<string, Difficulty> = {},
): TravelMode => ({
  id: registryId<'__travelMode'>('travel', value) as unknown as TravelModeId,
  name, medium, kmPerDay, fallback, overrides, slope,
});

/** What every boat and swimmer says: the water is the way, the land is not. */
const ON_WATER: Record<string, Difficulty> = { [LIQUIDS]: 1, [SHORE]: 1.5 };

/**
 * Grounded in D&D 5e travel pace and vehicle speeds, converted to kilometres:
 * slow 18 mi/day, normal 24, fast 30; light horse 48; sailing ship 48;
 * galley 96.
 */
export const DEFAULT_TRAVEL_MODES: readonly TravelMode[] = [
  mode('cautious', 'On foot — cautious', 'land', 29),
  mode('foot', 'On foot', 'land', 39),
  mode('forced', 'On foot — forced march', 'land', 48),
  mode('horse', 'Mounted', 'land', 77, RIDING),
  // A ship may only be where there is water, which is the whole point.
  mode('ship', 'By ship', 'water', 77, AFLOAT, 'impassable', ON_WATER),
  mode('galley', 'By galley', 'water', 154, AFLOAT, 'impassable', ON_WATER),

  /*
   * Appended, never slotted in among the six above: saved worlds reference
   * these ids and R-11 does not bend for tidiness.
   */
  // A cart keeps to easy ground and hates a hill more than anything else does.
  mode('wagon', 'By wagon', 'land', 26, HAULING),
  mode('gallop', 'Mounted — hard ride', 'land', 96, RIDING),
  // The party's own arms. Slow, and the reason a river is a wall without it.
  mode('swim', 'Swimming', 'water', 13, AFLOAT, 'impassable', ON_WATER),
  mode('canoe', 'By canoe', 'water', 42, AFLOAT, 'impassable', ON_WATER),
  /*
   * Airborne: `free`, so the ground below is scenery. A party with either of
   * these crosses anything in a straight line, which is correct and is a
   * large thing to hand a GM (D-299).
   */
  mode('balloon', 'By balloon', 'air', 60, AFLOAT, 'free'),
  mode('wings', 'Flying mount', 'air', 120, AFLOAT, 'free'),
];

/**
 * What the party can travel by, one answer per medium (R-200).
 *
 * `null` is the honest answer and the interesting one: no water conveyance is
 * what makes a river a wall, and no air conveyance is the ordinary case.
 */
export interface Travelling {
  readonly land: TravelModeId | null;
  readonly water: TravelModeId | null;
  readonly air: TravelModeId | null;
}

/** On foot and nothing else, which is how a party starts out. */
export const ON_FOOT: Travelling = {
  land: registryId<'__travelMode'>('travel', 'foot') as unknown as TravelModeId,
  water: null,
  air: null,
};

/** The conveyances a party actually has, in the order they are offered. */
export function waysOf(
  modes: readonly TravelMode[], travelling: Travelling,
): readonly TravelMode[] {
  return [travelling.land, travelling.water, travelling.air]
    .map((id) => (id ? travelModeById(modes, id) : null))
    .filter((found): found is TravelMode => found !== null);
}

export function travelModeById(modes: readonly TravelMode[], id: TravelModeId): TravelMode | null {
  return modes.find((m) => m.id === id) ?? null;
}

/**
 * What one cell of this ground costs a party travelling this way.
 *
 * `override` is the column's own difficulty and wins outright when present — a
 * bridge or a ford is a property of the place, not of the mode. After that the
 * mode's own table is read most-specific-first, and only then does the ground
 * get to say what it costs.
 */
export function groundCost(
  travelMode: TravelMode,
  ground: SwatchId,
  override?: Difficulty,
): Difficulty {
  if (override !== undefined) return override;
  const family = materialIn(ground);
  const explicit = travelMode.overrides[ground as string]
    ?? travelMode.overrides[family as string];
  if (explicit !== undefined) return explicit;
  if (travelMode.fallback === 'impassable') return 'impassable';
  // Airborne: the ground is under it, not in its way.
  if (travelMode.fallback === 'free') return 1;
  const material = familyOf(ground);
  return material ? difficultyOf(material, cutIdIn(ground)) : 'impassable';
}

export function isPassable(cost: Difficulty): cost is number {
  return cost !== 'impassable' && Number.isFinite(cost) && cost > 0;
}

/**
 * What one cell costs a party travelling this way: **both axes** (R-193).
 *
 * The ground says what it is made of and the cover says what is standing on
 * it, and the second multiplies the first — grass 1 × trees 1.5 is a forest at
 * 1.5, and sand 1.5 × trees 1.5 is 2.25, without a table of biomes anywhere.
 *
 * The cell's own `difficulty` still wins outright and is **not** multiplied:
 * a GM who writes a number on a cell has said what crossing it costs, full
 * stop. A road through a wood is the case, and multiplying their 0.75 by the
 * trees they explicitly routed around would be arguing with them.
 */
export function cellCost(travelMode: TravelMode, column: Column): Difficulty {
  if (column.difficulty !== undefined) return column.difficulty;
  const ground = groundCost(travelMode, column.ground);
  return overCover(ground, column.cover ? coverById(DEFAULT_COVERS, column.cover) : null);
}
