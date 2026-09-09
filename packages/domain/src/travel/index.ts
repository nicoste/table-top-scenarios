// Travel modes. A mode is how the party is moving — on foot, mounted, by ship —
// and it decides *both* how fast they go and what they may cross.
//
// This is why water is not simply expensive. A single large multiplier would let
// the party wade the ocean; making water impassable on foot and ordinary by boat
// is what turns an island into something you need a ship for.

import type { TerrainId } from '../ids/index.js';
import { registryId } from '../ids/index.js';
import type { Difficulty, Terrain } from '../terrain/index.js';
import { terrainById } from '../terrain/index.js';

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
  /** How to treat terrain with no explicit entry below. */
  readonly fallback: 'terrain-default' | 'impassable';
  /** Per-terrain costs that override the terrain's own default. */
  readonly overrides: Readonly<Record<string, Difficulty>>;
}

const WATER = 'terrain:water';
const SHALLOWS = 'terrain:shallows';

const mode = (
  value: string, name: string, kmPerDay: number,
  fallback: TravelMode['fallback'] = 'terrain-default',
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
  mode('ship', 'By ship', 77, 'impassable', { [WATER]: 1, [SHALLOWS]: 1.5 }),
  mode('galley', 'By galley', 154, 'impassable', { [WATER]: 1, [SHALLOWS]: 1.5 }),
];

export function travelModeById(modes: readonly TravelMode[], id: TravelModeId): TravelMode | null {
  return modes.find((m) => m.id === id) ?? null;
}

/**
 * What one cell of this terrain costs a party travelling this way.
 * `override` is the column's own difficulty and wins outright when present — a
 * bridge or a ford is a property of the place, not of the mode.
 */
export function terrainCost(
  travelMode: TravelMode,
  palette: readonly Terrain[],
  terrainId: TerrainId,
  override?: Difficulty,
): Difficulty {
  if (override !== undefined) return override;
  const explicit = travelMode.overrides[terrainId as string];
  if (explicit !== undefined) return explicit;
  if (travelMode.fallback === 'impassable') return 'impassable';
  return terrainById(palette, terrainId)?.defaultDifficulty ?? 'impassable';
}

export function isPassable(cost: Difficulty): cost is number {
  return cost !== 'impassable' && Number.isFinite(cost) && cost > 0;
}
