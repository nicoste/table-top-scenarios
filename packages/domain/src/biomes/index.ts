// Biome presets: one click that sets both axes (D-280).
//
// **A preset is a shortcut, not an entity.** A cell stores a ground and a
// cover, never "Forest" — so this list may be renamed, reordered, retuned or
// deleted freely and R-11 never touches it. That is the load-bearing
// difference from the terrain palette this replaces, where every one of twelve
// names was permanent the moment a world referenced it.
//
// It exists because two axes cost the GM a click they did not use to pay, and
// the answer to that is a shortcut rather than giving the axes up.

import type { CoverId, SwatchId } from '../ids/index.js';

export interface Biome {
  /** What a GM calls it out loud. Free to change; nothing stores it. */
  readonly name: string;
  readonly ground: SwatchId;
  /** Null for bare ground, which most of them are. */
  readonly cover: CoverId | null;
}

const b = (name: string, ground: string, cover: string | null): Biome => ({
  name,
  ground: ground as SwatchId,
  cover: cover as CoverId | null,
});

/**
 * The twelve the old terrain palette had, and a few it could not express.
 *
 * Taiga is the argument for the whole design: snow plus pines, out of two
 * entries that already existed for other reasons, without anybody inventing a
 * taiga. So are badlands, so is marsh.
 */
export const DEFAULT_BIOMES: readonly Biome[] = [
  b('Grassland', 'material:grass', null),
  b('Forest', 'material:grass', 'cover:trees'),
  b('Pine forest', 'material:grass/dark', 'cover:pines'),
  b('Jungle', 'material:vegetation/dark', 'cover:trees'),
  b('Moor', 'material:grass/dried', 'cover:scrub'),
  b('Marsh', 'material:vegetation', 'cover:scrub'),
  b('Desert', 'material:soil/sand', null),
  b('Dunes', 'material:soil/sand', 'cover:boulders'),
  b('Tundra', 'material:soil/snow', null),
  b('Taiga', 'material:soil/snow', 'cover:pines'),
  b('Badlands', 'material:mineral', 'cover:boulders'),
  b('Mountain', 'material:mineral', null),
  b('Shore', 'material:liquid/shore', null),
  b('Ocean', 'material:liquid', null),
];
