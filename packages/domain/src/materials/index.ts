// The block palette for encounter maps (R-75). A registry, so it is **code, not
// campaign data** (D-107): a stored palette freezes every old map at whatever the
// registry looked like on the day it was saved.
//
// `blocksSight` is specified and **not yet used** — vision sits out of this round
// (D-183). It ships now because R-75 already defined the field, and adding it
// later would mean editing every material instead of one file.

import type { MaterialId } from '../ids/index.js';
import { registryId } from '../ids/index.js';

export interface Material {
  readonly id: MaterialId;
  readonly name: string;
  readonly colour: string;
  /**
   * Whether a block of this material stops sight (R-75).
   *
   * A property of the *material*, never of being a block — so glass and water
   * are blocks you see through, and adding another transparent one is a registry
   * entry rather than a code change.
   */
  readonly blocksSight: boolean;
  /**
   * How much each cube's shade wanders from the material's own (R-172).
   *
   * A fraction of lightness, so `0.04` means give or take four percent. What
   * makes a voxel wall read as moulded plastic is forty identical swatches in
   * a row; a few percent of drift breaks that without the GM noticing a
   * pattern.
   *
   * Per material because it is a fact about the stuff: thatch and dirt are
   * uneven, polished glass and metal are not. Zero turns it off.
   *
   * **Appearance, unlike `blocksSight` above.** The two sit side by side here
   * and must never be derived from one another — a one-way mirror is a thing a
   * GM will want one day (D-237).
   */
  readonly grain: number;
}

/**
 * Enough to break up a wall and not enough to look like a mistake.
 *
 * Settled by eye at the table, on a real map, after two passes: the first
 * read as noise rather than as surface. The test is whether you notice the
 * *variation* — if you do, it is too strong; it should only register as the
 * wall not being flat.
 */
const ROUGH = 0.03;
const USUAL = 0.02;
const SMOOTH = 0.01;

const m = (
  value: string,
  name: string,
  colour: string,
  blocksSight = true,
  grain = USUAL,
): Material => ({
  id: registryId<'MaterialId'>('material', value),
  name,
  colour,
  blocksSight,
  grain,
});

/**
 * The starting palette. Append-only (R-11): entries may be added, never
 * reordered or renamed, because saved maps reference these ids.
 *
 * Names are said out loud at a table, so they are plain — "the stone wall", not
 * "material 4". Colours are muted on purpose: a map is stared at for hours on a
 * shared screen, and saturated blocks fight whatever stands on them.
 */
export const DEFAULT_MATERIALS: readonly Material[] = [
  m('stone', 'Stone', '#8d93a1'),
  m('brick', 'Brick', '#9c5f4e'),
  m('wood', 'Wood', '#9c7a4a'),
  m('plank', 'Plank', '#b49364'),
  m('thatch', 'Thatch', '#c2a35c', true, ROUGH),
  m('dirt', 'Dirt', '#7a6248', true, ROUGH),
  m('grass', 'Grass', '#6f8f52', true, ROUGH),
  m('sand', 'Sand', '#cbb887', true, ROUGH),
  m('snow', 'Snow', '#e4e9ef', true, SMOOTH),
  m('metal', 'Metal', '#7e8794', true, SMOOTH),
  m('lava', 'Lava', '#c2542a'),
  // Transparent: present as geometry, invisible to sight (R-75).
  m('water', 'Water', '#4a7fb5', false, SMOOTH),
  m('glass', 'Glass', '#a8c7dd', false, 0),
  m('ice', 'Ice', '#b9d6e4', false, SMOOTH),
];

/** What a new map's floor is made of (R-149). */
export const DEFAULT_FLOOR: MaterialId = registryId<'MaterialId'>('material', 'dirt');

export function materialById(
  materials: readonly Material[],
  id: MaterialId,
): Material | null {
  return materials.find((material) => material.id === id) ?? null;
}

export function isKnownMaterial(id: MaterialId): boolean {
  return DEFAULT_MATERIALS.some((material) => material.id === id);
}

export function requireMaterial(id: MaterialId): Material {
  const found = materialById(DEFAULT_MATERIALS, id);
  if (!found) throw new Error(`unknown material: ${id}`);
  return found;
}
