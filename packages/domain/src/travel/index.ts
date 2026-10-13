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
/** Afloat: the water is flat, so the question never arises. */
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

export interface TravelMode {
  readonly id: TravelModeId;
  readonly name: string;
  /** Distance covered in a day of travel on reference terrain. */
  readonly kmPerDay: number;
  /** How to treat ground with no explicit entry below. */
  readonly fallback: 'ground-default' | 'impassable';
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
  value: string, name: string, kmPerDay: number,
  slope: Slope = WALKING,
  fallback: TravelMode['fallback'] = 'ground-default',
  overrides: Record<string, Difficulty> = {},
): TravelMode => ({
  id: registryId<'__travelMode'>('travel', value) as unknown as TravelModeId,
  name, kmPerDay, fallback, overrides, slope,
});

/**
 * Grounded in D&D 5e travel pace and vehicle speeds, converted to kilometres:
 * slow 18 mi/day, normal 24, fast 30; light horse 48; sailing ship 48;
 * galley 96.
 */
export const DEFAULT_TRAVEL_MODES: readonly TravelMode[] = [
  mode('cautious', 'On foot — cautious', 29),
  mode('foot', 'On foot', 39),
  mode('forced', 'On foot — forced march', 48),
  mode('horse', 'Mounted', 77, RIDING),
  // A ship may only be where there is water, which is the whole point.
  mode('ship', 'By ship', 77, AFLOAT, 'impassable', { [LIQUIDS]: 1, [SHORE]: 1.5 }),
  mode('galley', 'By galley', 154, AFLOAT, 'impassable', { [LIQUIDS]: 1, [SHORE]: 1.5 }),
];

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
