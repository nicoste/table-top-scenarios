// The block palette for encounter maps (R-75). A registry, so it is **code, not
// campaign data** (D-107): a stored palette freezes every old map at whatever the
// registry looked like on the day it was saved.
//
// Organised by **how a thing is built, not what it is** (R-178). A family owns a
// structure — courses, grain, granular, mottled — and its *cuts* are the
// substances that share it: clay, dressed stone and limestone are all brick,
// because brick is a way of laying units and not a colour. The registry before
// this had thirteen materials whose only identity *was* a colour, and four pairs
// of them were within a hair of each other: thatch and sand differed by 8 in RGB
// while being a roof and a beach (D-245).
//
// `blocksSight` is specified and **not yet used** — vision sits out of this round
// (D-183). It ships because R-75 already defined the field, and adding it later
// would mean editing every entry instead of one file.

import type { MaterialId, SwatchId } from '../ids/index.js';
import { registryId } from '../ids/index.js';

/**
 * One substance within a family: the same structure, a different colour.
 *
 * **Colour and nothing else** (R-178). Roughness, transparency and glow are
 * uniforms on a material, so one mesh can draw a thousand colours of a family
 * and cannot draw gold beside granite if the two scatter light differently
 * (R-173). Anything that differs in how light behaves is its own family — which
 * is why lava is not a cut of water, and why metal folded into mineral rather
 * than keeping a sheen nothing could see (D-245).
 *
 * The name is the point. "Limestone" and "oak" are words said out loud at a
 * table; "pale brick" and "dark wood" are not.
 */
/**
 * How hard a substance is to cross, as the reciprocal of a speed multiplier
 * (R-192). `1` is open grassland, `3` is a third of that pace.
 *
 * Declared here rather than with travel because it is a fact about the stuff:
 * water is impassable wherever it is, and the world is painted in these.
 */
export type Difficulty = number | 'impassable';

export interface Cut {
  readonly id: string;
  readonly name: string;
  readonly colour: string;
  /**
   * How hard *this* cut is to cross, when it differs from its family (R-192).
   *
   * Water is impassable and its shore is wadeable; both are Liquids. That is
   * the evidence that navigation varies by cut where appearance does not, and
   * the reason R-182 says "colour **and** difficulty" rather than "colour".
   *
   * Absent means the family's, which is the ordinary case.
   */
  readonly difficulty?: Difficulty;
}

export interface Material {
  readonly id: MaterialId;
  /** The family — how it is built, not what it is. */
  readonly name: string;
  /**
   * Whether a block of this material stops sight (R-75).
   *
   * A property of the *material*, never of being a block — so glass and water
   * are blocks you see through, and adding another transparent one is a registry
   * entry rather than a code change.
   */
  readonly blocksSight: boolean;
  /**
   * How much each cube's shade wanders from its cut's own (R-172).
   *
   * A fraction of lightness, so `0.018` means give or take under two percent.
   * What makes a voxel wall read as moulded plastic is forty identical swatches
   * in a row; a few percent of drift breaks that without the GM noticing a
   * pattern.
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
   * top face catches the sun from the sides* — soil and grass stay flat from
   * every angle, ice and glass pick up a hard bright edge on the one facing
   * the light.
   */
  readonly roughness: number;
  /**
   * How much it appears lit from inside, 0 for everything that does not glow.
   *
   * **It looks lit; it does not light.** A glowing block casts nothing on its
   * neighbours — that needs an actual light in the scene, which is a separate
   * decision with a cost attached (D-238). It glows in its cut's own colour,
   * which is what makes lava, acid and mana one family.
   */
  readonly glow: number;
  /**
   * How much of it a light gets through, 1 solid and 0 invisible (R-174).
   *
   * **The look, not the rule.** `blocksSight` above is what the material does
   * to a line of sight and this is what it does to a photograph of itself;
   * they agree on glass and water today and the one-way mirror is exactly the
   * case where they will not (D-237).
   *
   * A stack reads as solid long before a single cube does — six feet of water
   * at 0.75 each lets through almost nothing — which is both physically right
   * and the reason a sea does not turn into a hole in the map.
   */
  readonly opacity: number;
  /**
   * The figure in the surface (R-177), and **what makes this family itself**.
   *
   * Names what the stuff *looks like*, never how to draw it: wood runs in
   * stripes along the grain, brick is laid in courses, soil is granular. What
   * that means in a shader is the renderer's business, the same way
   * `roughness` names a property and not a lighting model (R-173).
   */
  readonly pattern: 'none' | 'stripes' | 'speckle' | 'courses' | 'plates' | 'grit' | 'leaves';
  /**
   * How hard this family is to cross (R-192), before any cut overrides it.
   *
   * Only the world asks — a map's blocks are stood on, not walked over — but
   * it belongs to the substance rather than to the world, which is the whole
   * reason the world can stop keeping a registry of its own (D-280).
   */
  readonly difficulty: Difficulty;
  /**
   * The substances in this family, **the first of them being the default**.
   *
   * Never empty. The default is what a bare `material:brick` means and what a
   * GM gets for tapping the row, which is why it writes bare on disk (D-245).
   */
  readonly cuts: readonly Cut[];
}

/**
 * Enough to break up a wall and not enough to look like a mistake.
 *
 * Settled by eye at the table, on a real map, after two passes: the first read
 * as noise rather than as surface. The test is whether you notice the
 * *variation* — if you do, it is too strong; it should only register as the
 * wall not being flat.
 */
const ROUGH = 0.018;
const USUAL = 0.012;
const SMOOTH = 0.006;

/** Most things in a dungeon are closer to chalk than to glass. */
const MATT = 0.95;
const DULL = 0.8;
const POLISHED = 0.12;

/** Settled by eye on a sea and a window, which are the only two cases. */
const SOLID = 1;
const WATERY = 0.75;
const CLEAR = 0.4;

const c = (id: string, name: string, colour: string): Cut => ({ id, name, colour });

const family = (
  value: string,
  name: string,
  cuts: readonly Cut[],
  opts: {
    pattern?: Material['pattern'];
    blocksSight?: boolean;
    grain?: number;
    roughness?: number;
    glow?: number;
    opacity?: number;
    difficulty?: Difficulty;
  } = {},
): Material => ({
  id: registryId<'MaterialId'>('material', value),
  name,
  blocksSight: opts.blocksSight ?? true,
  grain: opts.grain ?? USUAL,
  roughness: opts.roughness ?? DULL,
  glow: opts.glow ?? 0,
  opacity: opts.opacity ?? SOLID,
  pattern: opts.pattern ?? 'none',
  // Open country, which is what the travel table is normalised against.
  difficulty: opts.difficulty ?? 1,
  cuts,
});

/**
 * The palette. Append-only (R-11): entries may be added, never reordered or
 * renamed, because saved maps reference these ids.
 *
 * Names are said out loud at a table, so they are plain — "the limestone wall",
 * not "material 4". Colours are muted on purpose: a map is stared at for hours
 * on a shared screen, and saturated blocks fight whatever stands on them.
 */
export const DEFAULT_MATERIALS: readonly Material[] = [
  family('brick', 'Brick', [
    c('clay', 'Clay', '#9c5f4e'),
    c('dressed', 'Dressed stone', '#8d93a1'),
    c('limestone', 'Limestone', '#c3b79c'),
    // Paving: the one ground that is easier than open country.
  ], { pattern: 'courses', roughness: MATT, difficulty: 0.75 }),

  // Not brick: a cave wall has no courses and no bond, and a dungeon is mostly
  // cave wall. Gold and copper live here because metal is not a *structure* —
  // it was the one family named for what it is rather than how it is built,
  // which is exactly why it read as redundant (D-245).
  family('mineral', 'Mineral', [
    c('grey-rock', 'Grey rock', '#8d93a1'),
    c('dark-rock', 'Dark rock', '#5f6672'),
    c('gold', 'Gold', '#b89a4e'),
    c('copper', 'Copper', '#a8714c'),
    // The bars, gates and lanterns of a dungeon, now that a prop is painted
    // with what a block is made of (D-352). Darker and bluer than dark rock.
    c('iron', 'Iron', '#4b5058'),
  ], { pattern: 'plates', difficulty: 1.5 }),

  family('wood', 'Wood', [
    c('oak', 'Oak', '#9c7a4a'),
    c('birch', 'Birch', '#c2a87e'),
    c('dark-oak', 'Dark oak', '#6b5231'),
  ], { pattern: 'stripes' }),

  family('soil', 'Soil', [
    c('dirt', 'Dirt', '#7a6248'),
    // Loose underfoot, both of them, where packed dirt is not.
    { ...c('sand', 'Sand', '#cbb887'), difficulty: 1.5 },
    { ...c('snow', 'Snow', '#e4e9ef'), difficulty: 1.5 },
  ], { pattern: 'grit', grain: ROUGH, roughness: 1 }),

  // `dried` is the old thatch. A roof of it reads as a lawn rather than as laid
  // bundles, which is the thing traded away for not carrying a whole family in
  // order to say "straw" (D-245).
  family('grass', 'Grass', [
    c('grass', 'Grass', '#6f8f52'),
    c('dark', 'Dark grass', '#577142'),
    c('dried', 'Dried grass', '#b09a5e'),
  ], { pattern: 'speckle', grain: ROUGH, roughness: MATT }),

  // Undergrowth as *ground*: a forest is grass with trees standing on it
  // (D-280), and this is what you wade through where there are no trees.
  family('vegetation', 'Vegetation', [
    c('leaves', 'Leaves', '#4f7a3f'),
    c('light', 'Light leaves', '#6b9a52'),
    { ...c('dark', 'Dark leaves', '#3a5c30'), difficulty: 2.5 },
  ], { pattern: 'leaves', grain: ROUGH, roughness: MATT, difficulty: 1.5 }),

  // Transparent: present as geometry, invisible to sight (R-75), and
  // see-through to look at as well (R-174).
  family('liquid', 'Liquids', [
    c('water', 'Water', '#4a7fb5'),
    c('green', 'Green water', '#4a8f7a'),
    // Wadeable, where open water is not. The pair that proves a cut carries
    // its own difficulty (R-192).
    { ...c('shore', 'Shore', '#8fb8d4'), difficulty: 3 },
  ], {
    blocksSight: false, grain: SMOOTH, roughness: 0.22, opacity: WATERY,
    difficulty: 'impassable',
  }),

  family('glowing', 'Glowing', [
    c('lava', 'Lava', '#c2542a'),
    c('acid', 'Acid', '#7ab52a'),
  ], { glow: 0.75, difficulty: 'impassable' }),

  // Ice sits here rather than with the liquids: what it has in common with
  // glass is that you look *through* it at something hard, and the family is
  // the look, not the chemistry. The name is the family's display name, which
  // R-11 leaves free — the id stays `material:glass` forever (D-246).
  family('glass', 'Glassy', [
    c('glass', 'Glass', '#a8c7dd'),
    c('ice', 'Ice', '#b9d6e4'),
  ], {
    blocksSight: false, grain: 0, roughness: POLISHED, opacity: CLEAR,
    difficulty: 1.5,
  }),
];

export function materialById(
  materials: readonly Material[],
  id: MaterialId,
): Material | null {
  return materials.find((material) => material.id === id) ?? null;
}

// -- swatches (R-176) --------------------------------------------------------

/**
 * Separates a family from its cut inside a swatch.
 *
 * Not a character a registry id may contain (R-11's grammar is lowercase,
 * digits and hyphens), so a swatch can always be split back apart and no
 * material id can ever be mistaken for one.
 */
const CUT_MARK = '/';

/**
 * A cube's value: the family, and which cut of it the block is made of.
 *
 * **The default cut writes bare.** `material:brick` rather than
 * `material:brick/clay`, so the commonest block in a map costs the shortest
 * string and a body of them packs to what it always did — the same reasoning
 * as the three absences in `MapJSONIn` (D-187, D-245).
 */
export function swatchOf(material: MaterialId, cut?: string | null): SwatchId {
  return (cut ? `${material}${CUT_MARK}${cut}` : material) as unknown as SwatchId;
}

/** The swatch for one cut of a family, writing the default one bare. */
export function swatchFor(material: Material, cutId: string): SwatchId {
  return swatchOf(material.id, cutId === material.cuts[0]!.id ? null : cutId);
}

export function materialIn(swatch: SwatchId): MaterialId {
  const mark = swatch.indexOf(CUT_MARK);
  return (mark < 0 ? swatch : swatch.slice(0, mark)) as unknown as MaterialId;
}

/**
 * The cut's id, or `null` for the default.
 *
 * Null rather than the default's own id, because only the family knows which
 * cut that is — and a swatch has to be readable without one in hand.
 */
export function cutIdIn(swatch: SwatchId): string | null {
  const mark = swatch.indexOf(CUT_MARK);
  return mark < 0 ? null : swatch.slice(mark + 1);
}

/** This family's cut by that id, or its default. Never null: a family always has one. */
export function cutOf(material: Material, id: string | null): Cut {
  if (id === null) return material.cuts[0]!;
  return material.cuts.find((cut) => cut.id === id) ?? material.cuts[0]!;
}

/** What colour a swatch is drawn in — its cut's own, which is the whole axis. */
export function colourOf(material: Material, id: string | null): string {
  return cutOf(material, id).colour;
}

/**
 * The family is known, the cut is one it has, and **the default is spelled
 * bare**.
 *
 * Per family, so `material:glass/gold` is refused where `material:mineral/gold`
 * is fine — which is the point of hanging the cuts off the family (D-245).
 *
 * The default spelled out is refused too, even though it is obvious what it
 * means, because a swatch is compared as a string: two spellings of one cut
 * would make a fill stop in the middle of a flat wall, and put two palette
 * entries where there is one colour. One value, one spelling.
 */
export function isKnownSwatch(swatch: SwatchId): boolean {
  const material = materialById(DEFAULT_MATERIALS, materialIn(swatch));
  if (!material) return false;
  const id = cutIdIn(swatch);
  if (id === null) return true;
  return id !== material.cuts[0]!.id && material.cuts.some((cut) => cut.id === id);
}

/** What a new map's floor is made of (R-149). */
export const DEFAULT_FLOOR: SwatchId = swatchOf(
  registryId<'MaterialId'>('material', 'soil'),
);

/** How hard one swatch is to cross: the cut's own, or its family's (R-192). */
export function difficultyOf(material: Material, cutId: string | null): Difficulty {
  return cutOf(material, cutId).difficulty ?? material.difficulty;
}

/**
 * The family a swatch names, or null when the registry has never heard of it.
 *
 * The one lookup everything that holds a swatch rather than a material has to
 * do first — a world column, a travel cost, the world mesh — so it is written
 * once instead of three times.
 */
export function familyOf(swatch: SwatchId): Material | null {
  return materialById(DEFAULT_MATERIALS, materialIn(swatch));
}

/** A swatch's colour, or null when the registry has never heard of it. */
export function swatchColour(swatch: SwatchId): string | null {
  const family = familyOf(swatch);
  return family ? colourOf(family, cutIdIn(swatch)) : null;
}

/** A swatch's name as it is said at the table — its cut's — or null when unknown. */
export function swatchName(swatch: SwatchId): string | null {
  const family = familyOf(swatch);
  return family ? cutOf(family, cutIdIn(swatch)).name : null;
}
