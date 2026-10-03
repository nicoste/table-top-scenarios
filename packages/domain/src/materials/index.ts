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
  /**
   * How scattered the light off it is, 0 polished to 1 chalky (R-173).
   *
   * At a table's distance this reads almost entirely as *how differently the
   * top face catches the sun from the sides* — thatch and dirt stay flat from
   * every angle, ice and water pick up a hard bright edge on the one facing
   * the light.
   */
  readonly roughness: number;
  /**
   * How much it appears lit from inside, 0 for everything that is not lava.
   *
   * **It looks lit; it does not light.** A glowing block casts nothing on its
   * neighbours — that needs an actual light in the scene, which is a separate
   * decision with a cost attached (D-238). It glows in its own colour, which
   * is right for every case we have; a material wanting to glow a *different*
   * colour than it is would need a second field, and none does yet.
   */
  readonly glow: number;
}

/**
 * Enough to break up a wall and not enough to look like a mistake.
 *
 * Settled by eye at the table, on a real map, after two passes: the first
 * read as noise rather than as surface. The test is whether you notice the
 * *variation* — if you do, it is too strong; it should only register as the
 * wall not being flat.
 */
const ROUGH = 0.018;
const USUAL = 0.012;
const SMOOTH = 0.006;

/** Most things in a dungeon are closer to chalk than to glass. */
const MATT = 0.95;
const DULL = 0.8;
const SHEEN = 0.35;
const POLISHED = 0.12;

const m = (
  value: string,
  name: string,
  colour: string,
  blocksSight = true,
  grain = USUAL,
  roughness = DULL,
  glow = 0,
): Material => ({
  id: registryId<'MaterialId'>('material', value),
  name,
  colour,
  blocksSight,
  grain,
  roughness,
  glow,
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
  m('stone', 'Stone', '#8d93a1', true, USUAL, DULL),
  m('brick', 'Brick', '#9c5f4e', true, USUAL, MATT),
  m('wood', 'Wood', '#9c7a4a', true, USUAL, DULL),
  m('plank', 'Plank', '#b49364', true, USUAL, 0.7),
  m('thatch', 'Thatch', '#c2a35c', true, ROUGH, MATT),
  m('dirt', 'Dirt', '#7a6248', true, ROUGH, 1),
  m('grass', 'Grass', '#6f8f52', true, ROUGH, MATT),
  m('sand', 'Sand', '#cbb887', true, ROUGH, MATT),
  m('snow', 'Snow', '#e4e9ef', true, SMOOTH, 0.7),
  m('metal', 'Metal', '#7e8794', true, SMOOTH, SHEEN),
  m('lava', 'Lava', '#c2542a', true, USUAL, DULL, 0.75),
  // Transparent: present as geometry, invisible to sight (R-75).
  m('water', 'Water', '#4a7fb5', false, SMOOTH, 0.22),
  m('glass', 'Glass', '#a8c7dd', false, 0, POLISHED),
  m('ice', 'Ice', '#b9d6e4', false, SMOOTH, POLISHED),
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
