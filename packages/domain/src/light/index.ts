// How a scene is lit (R-181): a sun on an arc, and the sky it hangs in.
//
// Here rather than in `render` because it is a **description, not a rig**: an
// hour of the day and two colours, which the renderer turns into whatever
// lights it happens to use. The same division as `roughness`, which names a
// property and not a lighting model (R-173). It is also what lets the figures
// be settled in a test rather than by squinting at a screen (R-23b).

export interface Lighting {
  /**
   * Where the sun is on its arc, in degrees: 10 at one horizon, 90 overhead,
   * 170 at the other.
   *
   * **One angle, because it is an hour and not a bearing.** A sun needs an
   * elevation *and* a compass direction, and the second of those is a fact
   * about the world rather than a thing a GM wants to adjust — so the arc is
   * fixed and the slider is the time of day.
   */
  readonly angle: number;
  readonly sun: string;
  readonly sunLevel: number;
  /** The sky's own light: what reaches a surface the sun cannot see. */
  readonly fill: string;
  readonly fillLevel: number;
}

/**
 * Never flat along the ground.
 *
 * At the horizon a shadow is infinitely long and every surface is grazed, which
 * is where shadow acne lives and where a shadow stops fitting in any frustum
 * you can afford. Ten degrees is still a long evening shadow — five and a half
 * times its caster — and it is finite.
 */
export const MIN_ANGLE = 10;
export const MAX_ANGLE = 170;

export const MIN_SUN = 0;
export const MAX_SUN = 3;
export const MIN_FILL = 0;
export const MAX_FILL = 1.5;

/**
 * The hour the sun rises and sets in, as a compass bearing on the cell grid.
 *
 * Fixed, and chosen so shadows fall across the two faces the default camera
 * can see rather than behind their casters (R-31, D-248). A GM who one day
 * wants the sun to come from somewhere else wants a second angle, not a
 * different default.
 */
const BEARING = { x: 90, z: -60 };
const SPAN = Math.hypot(BEARING.x, BEARING.z);
/*
 * Normalised here rather than written out, because a rounded pair is not a
 * unit vector: 0.832 and 0.555 are a hundredth of a percent long, which is
 * enough to fail the test that says the renderer may treat this as a
 * direction. Derive it, do not transcribe it.
 */
const EAST = { x: BEARING.x / SPAN, z: BEARING.z / SPAN };

/** Settled at the table: an afternoon, where a building looks like a building. */
export const DAYLIGHT: Lighting = {
  angle: 35,
  sun: '#fff6e8',
  sunLevel: 1.9,
  fill: '#cfe4ff',
  fillLevel: 0.4,
};

const clamp = (value: number, low: number, high: number): number =>
  (Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : low);

const COLOUR = /^#[0-9a-f]{6}$/i;

/** Anything out of range is pulled back in; anything unreadable falls back. */
export function clampLighting(lighting: Lighting): Lighting {
  return {
    angle: Math.round(clamp(lighting.angle, MIN_ANGLE, MAX_ANGLE)),
    sun: COLOUR.test(lighting.sun) ? lighting.sun.toLowerCase() : DAYLIGHT.sun,
    sunLevel: clamp(lighting.sunLevel, MIN_SUN, MAX_SUN),
    fill: COLOUR.test(lighting.fill) ? lighting.fill.toLowerCase() : DAYLIGHT.fill,
    fillLevel: clamp(lighting.fillLevel, MIN_FILL, MAX_FILL),
  };
}

/**
 * Which way the light travels, as a unit vector pointing *from* the sun.
 *
 * Elevation is the angle itself, so 90 is straight overhead and both ends of
 * the range are low. The horizontal part swings through the fixed arc, which
 * is why one number is enough.
 */
export function sunDirection(angle: number): { x: number; y: number; z: number } {
  const a = (clamp(angle, MIN_ANGLE, MAX_ANGLE) * Math.PI) / 180;
  const flat = Math.cos(a);
  return { x: flat * EAST.x, y: Math.sin(a), z: flat * EAST.z };
}

/**
 * How long a shadow is, as a multiple of its caster's height.
 *
 * The renderer needs it to size a shadow camera that still contains the
 * shadows at a low sun, and it is the reason `MIN_ANGLE` is not zero.
 */
export function shadowReach(angle: number): number {
  const { y } = sunDirection(angle);
  const flat = Math.abs(Math.cos((clamp(angle, MIN_ANGLE, MAX_ANGLE) * Math.PI) / 180));
  return flat / Math.max(y, 0.0001);
}

/**
 * The hour, in the words a GM would use.
 *
 * Beside the slider and not instead of it: the number is what you nudge, and
 * the word is what you say out loud — the same arrangement the level ladder
 * settled on for heights (R-161).
 */
export function hourLabel(angle: number): string {
  const a = clamp(angle, MIN_ANGLE, MAX_ANGLE);
  if (a < 22) return 'dawn';
  if (a < 55) return 'morning';
  if (a < 125) return 'midday';
  if (a < 158) return 'afternoon';
  return 'dusk';
}

/**
 * The ground half of the sky's light: the fill colour, darkened.
 *
 * A plain multiply, deliberately — unlike a cube's shade, where scaling the
 * channels together would have dragged the material's hue about (D-237). This
 * is light bouncing off ground that is already dim, and the only thing it has
 * to be is darker than the sky.
 */
export function bounceOf(fill: string): string {
  if (!COLOUR.test(fill)) return bounceOf(DAYLIGHT.fill);
  const n = Number.parseInt(fill.slice(1), 16);
  const dim = (shift: number) => Math.round(((n >> shift) & 255) * 0.3)
    .toString(16).padStart(2, '0');
  return `#${dim(16)}${dim(8)}${dim(0)}`;
}
