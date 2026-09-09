// The terrain palette (R-77). Each entry carries its own default difficulty, so
// painting geography paints travel cost in the same stroke.

import type { TerrainId } from '../ids/index.js';
import { registryId } from '../ids/index.js';

/** A difficulty of `impassable` routes around rather than costing a lot. */
export type Difficulty = number | 'impassable';

export interface Terrain {
  readonly id: TerrainId;
  readonly name: string;
  readonly colour: string;
  readonly defaultDifficulty: Difficulty;
}

const t = (value: string, name: string, colour: string, defaultDifficulty: Difficulty): Terrain => ({
  id: registryId<'TerrainId'>('terrain', value),
  name,
  colour,
  defaultDifficulty,
});

/**
 * The starting palette. Append-only (R-11): entries may be added, never
 * reordered or renamed, because saved worlds reference these ids.
 *
 * Difficulties are derived from the D&D 3.5 "Terrain and Overland Movement"
 * table, whose *trackless* column is the honest one for open country. Those are
 * speed multipliers, so ours are their reciprocals, then normalised so that
 * grassland — 5e's reference terrain at 24 miles a day — sits at exactly 1.
 *
 * Two deliberate deviations, both to avoid double counting:
 *
 * - 3.5 puts hills, mountains, forest, swamp and desert all at the same
 *   trackless x1/2. We keep rock and hills at 1.5 and let **slope** supply the
 *   rest (R-52a), because charging for altitude twice makes mountains absurd.
 * - Swamp is pushed to 2 and jungle to 3. 3.5 rates swamp the same as forest,
 *   which does not match how anyone describes crossing a swamp, and it already
 *   rates jungle four times worse than open ground.
 *
 * `defaultDifficulty` is a *tuning value*, not an id, so it may be revised
 * (R-11 protects ids). Cells that override it are unaffected.
 */
export const DEFAULT_TERRAIN: readonly Terrain[] = [
  t('water', 'Water', '#2d6ea8', 'impassable'),   // crossable only by boat (R-83a)
  t('shallows', 'Shallows', '#4f9ec4', 3),        // wadeable, and where boats land
  t('sand', 'Sand', '#d8c489', 1.5),
  t('grass', 'Grassland', '#6f9e57', 1),          // the reference terrain
  t('forest', 'Forest', '#3f6b40', 1.5),
  t('hills', 'Hills', '#8a8556', 1.5),
  t('rock', 'Rock', '#8d8d92', 1.5),
  t('snow', 'Snow', '#e6ecf2', 1.5),
  t('swamp', 'Swamp', '#5b6b45', 2),
  t('road', 'Road', '#b3a284', 0.75),
  t('moor', 'Moor', '#7b8460', 1),
  t('jungle', 'Jungle', '#2f5c34', 3),            // the worst passable land
];

/** The terrain a freshly created chunk is filled with (R-78). */
export const WATER: TerrainId = registryId<'TerrainId'>('terrain', 'water');

export function terrainById(palette: readonly Terrain[], id: TerrainId): Terrain | null {
  return palette.find((entry) => entry.id === id) ?? null;
}

/** Never index a palette directly (D-060); absence is a value, not a crash. */
export function requireTerrain(palette: readonly Terrain[], id: TerrainId): Terrain {
  const found = terrainById(palette, id);
  if (!found) throw new Error(`unknown terrain: ${id}`);
  return found;
}
