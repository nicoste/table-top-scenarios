// The block palette for encounter maps (R-75). A registry, so it is **code, not
// campaign data** (D-107): a stored palette freezes every old map at whatever the
// registry looked like on the day it was saved.
//
// `blocksSight` is specified and **not yet used** — vision sits out of this round
// (D-183). It ships now because R-75 already defined the field, and adding it
// later would mean editing every material instead of one file.

import type { MaterialId, SwatchId } from '../ids/index.js';
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
  /**
   * How much of it a light gets through, 1 solid and 0 invisible (R-174).
   *
   * **The look, not the rule.** `blocksSight` above is what the material does
   * to a line of sight and this is what it does to a photograph of itself;
   * they agree on water and glass today and the one-way mirror is exactly the
   * case where they will not (D-237).
   *
   * A stack reads as solid long before a single cube does — six feet of water
   * at 0.6 each lets through less than a percent — which is both physically
   * right and the reason a sea does not turn into a hole in the map.
   */
  readonly opacity: number;
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

/** Settled by eye on a sea and a window, which are the only two cases. */
const SOLID = 1;
const FROSTED = 0.72;
const WATERY = 0.75;
const CLEAR = 0.4;

const m = (
  value: string,
  name: string,
  colour: string,
  blocksSight = true,
  grain = USUAL,
  roughness = DULL,
  glow = 0,
  opacity = SOLID,
): Material => ({
  id: registryId<'MaterialId'>('material', value),
  name,
  colour,
  blocksSight,
  grain,
  roughness,
  glow,
  opacity,
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
  // Transparent: present as geometry, invisible to sight (R-75), and now
  // see-through to look at as well (R-174).
  m('water', 'Water', '#4a7fb5', false, SMOOTH, 0.22, 0, WATERY),
  m('glass', 'Glass', '#a8c7dd', false, 0, POLISHED, 0, CLEAR),
  m('ice', 'Ice', '#b9d6e4', false, SMOOTH, POLISHED, 0, FROSTED),
];

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

// -- shades (R-176) ----------------------------------------------------------

/**
 * One material, cut lighter or darker. Three stones, three woods.
 *
 * **Not three materials.** Material ids are permanent and referenced by every
 * saved map (R-11), so "dark stone" as its own entry would mean a registry
 * that grows by the product of every substance and every tint, forever, and
 * a GM scrolling past forty-two entries to find a wall. A shade is the other
 * axis, and it multiplies instead of adding (D-241).
 *
 * `lift` is added to the material's lightness in HSL, the same arithmetic
 * grain uses (R-172) and for the same reason: scaling RGB drags a colour
 * toward black or past white and changes how saturated it looks, where a
 * nudge in HSL keeps the hue the GM picked.
 */
export interface Shade {
  readonly id: string;
  readonly name: string;
  readonly lift: number;
}

/**
 * Append-only, like the materials above and for the same reason: a saved map
 * holds these ids.
 *
 * `plain` is the material exactly as the registry has it, and it is what every
 * map held before shades existed.
 */
export const SHADES: readonly Shade[] = [
  { id: 'dark', name: 'Dark', lift: -0.1 },
  { id: 'plain', name: 'Plain', lift: 0 },
  { id: 'pale', name: 'Pale', lift: 0.1 },
];

export const PLAIN = 'plain';

/** The shade with this id, or plain. Falls back for the reason `brushById` does. */
export function shadeById(id: string): Shade {
  return SHADES.find((shade) => shade.id === id) ?? SHADES.find((s) => s.id === PLAIN)!;
}

/**
 * Separates a material from its shade inside a swatch.
 *
 * Not a character a registry id may contain (R-11's grammar is lowercase,
 * digits and hyphens), so a swatch can always be split back apart and no
 * material can ever be mistaken for one.
 */
const SHADE_MARK = '/';

/**
 * A cube's value: the material, and the shade it was cut in.
 *
 * **Plain writes bare.** `material:stone` rather than `material:stone/plain`,
 * so a map saved before shades existed reads back as plain stone with no
 * migration and no schema bump, and a map full of plain blocks costs the same
 * bytes it always did — the same reasoning as the three absences in
 * `MapJSONIn` (D-187, D-241).
 */
export function swatchOf(material: MaterialId, shade: string = PLAIN): SwatchId {
  return (shade === PLAIN ? material : `${material}${SHADE_MARK}${shade}`) as SwatchId;
}

export function materialIn(swatch: SwatchId): MaterialId {
  const cut = swatch.indexOf(SHADE_MARK);
  return (cut < 0 ? swatch : swatch.slice(0, cut)) as unknown as MaterialId;
}

export function shadeIn(swatch: SwatchId): Shade {
  const cut = swatch.indexOf(SHADE_MARK);
  return shadeById(cut < 0 ? PLAIN : swatch.slice(cut + 1));
}

/**
 * Both halves have to be ones we know, and **plain has to be spelled bare**.
 *
 * `material:stone/plain` is refused even though it is obvious what it means,
 * because a swatch is compared by string: two spellings of one cut would make
 * a fill stop in the middle of a flat wall, and put two palette entries where
 * there is one colour. One value, one spelling.
 */
export function isKnownSwatch(swatch: SwatchId): boolean {
  const cut = swatch.indexOf(SHADE_MARK);
  if (cut < 0) return isKnownMaterial(swatch as unknown as MaterialId);
  const shade = swatch.slice(cut + 1);
  return shade !== PLAIN
    && SHADES.some((s) => s.id === shade)
    && isKnownMaterial(swatch.slice(0, cut) as unknown as MaterialId);
}

/**
 * What colour a material is in a given shade, as `#rrggbb`.
 *
 * Here rather than in the renderer because **two things ask it and they must
 * agree**: the cubes on the table and the swatch under the GM's pointer. A
 * panel that paints its chip one way while the map draws another is a panel
 * that lies about what the next click will do.
 */
export function shadeColour(colour: string, lift: number): string {
  if (lift === 0) return colour;
  const { h, s, l } = toHSL(colour);
  return fromHSL(h, s, Math.min(1, Math.max(0, l + lift)));
}

/** `#rrggbb` to hue, saturation and lightness, all 0..1. */
function toHSL(hex: string): { h: number; s: number; l: number } {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const high = Math.max(r, g, b);
  const low = Math.min(r, g, b);
  const l = (high + low) / 2;
  const span = high - low;
  if (span === 0) return { h: 0, s: 0, l };
  const s = span / (l > 0.5 ? 2 - high - low : high + low);
  const h = high === r ? ((g - b) / span + (g < b ? 6 : 0))
    : high === g ? (b - r) / span + 2
      : (r - g) / span + 4;
  return { h: h / 6, s, l };
}

function fromHSL(h: number, s: number, l: number): string {
  if (s === 0) return channels(l, l, l);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return channels(hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3));
}

function hue(p: number, q: number, at: number): number {
  const t = at < 0 ? at + 1 : at > 1 ? at - 1 : at;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function channels(r: number, g: number, b: number): string {
  const byte = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

/**
 * What a new map's floor is made of (R-149).
 *
 * A **swatch**, not a material, because that is what a cube holds — and down
 * here rather than beside the registry because `swatchOf` needs `PLAIN`, and
 * a constant cannot read one declared below it.
 */
export const DEFAULT_FLOOR: SwatchId = swatchOf(registryId<'MaterialId'>('material', 'dirt'));
