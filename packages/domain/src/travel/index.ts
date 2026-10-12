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
 * Extra cost, in cells, per level of climb (R-52a).
 *
 * Derived, not chosen. Naismith's rule charges an hour per 600 m of ascent and
 * an hour per 5 km of flat ground, so one 150 m level is worth 1.25 km of
 * walking against a 1.5 km cell: 1.25 / 1.5 = 0.83.
 *
 * If the height level changes, this changes with it.
 */
export const DEFAULT_SLOPE_FACTOR = 0.83;

export interface TravelMode {
  readonly id: TravelModeId;
  readonly name: string;
  /** Distance covered in a day of travel on reference terrain. */
  readonly kmPerDay: number;
  /** How to treat ground with no explicit entry below. */
  readonly fallback: 'ground-default' | 'impassable';
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
  fallback: TravelMode['fallback'] = 'ground-default',
  overrides: Record<string, Difficulty> = {},
): TravelMode => ({
  id: registryId<'__travelMode'>('travel', value) as unknown as TravelModeId,
  name, kmPerDay, fallback, overrides,
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
  mode('horse', 'Mounted', 77),
  // A ship may only be where there is water, which is the whole point.
  mode('ship', 'By ship', 77, 'impassable', { [LIQUIDS]: 1, [SHORE]: 1.5 }),
  mode('galley', 'By galley', 154, 'impassable', { [LIQUIDS]: 1, [SHORE]: 1.5 }),
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
