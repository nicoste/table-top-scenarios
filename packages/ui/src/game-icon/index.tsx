// Canonical monochrome squared-stroke SVG icon registry (R-217a, D-381).
//
// Presentational and domain-free, like everything in `@tt/ui`, and styled inline
// so no CSS pipeline is needed (R-111). Every glyph uses `currentColor` and
// squared geometry — no multi-colour fills, no emojis — so it automatically
// inherits the idle, hover or active highlight colour of the slot it sits in.
//
// One concept uses one canonical glyph across both screens: `walk` serves both
// map ground paths and world foot travel; `measure` serves both the Measure tool
// and the Ruler mode inside it; `light` is any light, carried or placed.

import { createElement } from 'react';
import type { CSSProperties } from 'react';

export type GameIconName =
  | 'play'
  | 'walk'
  | 'jump'
  | 'measure'
  | 'sphere'
  | 'cone'
  | 'line'
  | 'cube'
  | 'build'
  | 'paint'
  | 'spawn'
  | 'prefab'
  | 'props'
  | 'select'
  | 'places'
  | 'height'
  | 'ground'
  | 'cover'
  | 'boat'
  | 'air'
  | 'turn-ccw'
  | 'turn-cw'
  | 'tilt-down'
  | 'tilt-up'
  | 'eye-open'
  | 'eye-hidden'
  | 'light';

/** One shape of a glyph: its SVG element, and that element's attributes as SVG spells them. */
export interface GlyphShape {
  readonly el: 'path' | 'rect' | 'circle' | 'polygon';
  readonly attrs: Readonly<Record<string, string | number>>;
}

/**
 * Every glyph as plain data, so the design gallery draws these very shapes: it
 * keeps a copy, and a test holds the copy to this (R-217a, D-387).
 */
export const GLYPHS: Readonly<Record<GameIconName, readonly GlyphShape[]>> = {
  play: [
    { el: 'polygon', attrs: { points: '6,4 20,12 6,20', fill: 'currentColor', 'fill-opacity': 0.18 } },
  ],
  walk: [{ el: 'path', attrs: { d: 'M4 19h16v2H4zM6 15l4-5 3 2 5-3v10H6z' } }],
  jump: [
    { el: 'path', attrs: { d: 'M4 17c4-9 12-9 16 0' } },
    { el: 'path', attrs: { d: 'M17 12l3 5-5 1' } },
    { el: 'rect', attrs: { x: 3, y: 19, width: 4, height: 2 } },
    { el: 'rect', attrs: { x: 17, y: 19, width: 4, height: 2 } },
  ],
  measure: [
    { el: 'rect', attrs: { x: 3, y: 8, width: 18, height: 8 } },
    { el: 'path', attrs: { d: 'M7 8v4M11 8v3M15 8v4M19 8v3' } },
  ],
  sphere: [
    { el: 'circle', attrs: { cx: 12, cy: 12, r: 8 } },
    { el: 'rect', attrs: { x: 11, y: 11, width: 2, height: 2, fill: 'currentColor' } },
  ],
  cone: [{ el: 'polygon', attrs: { points: '4,12 19,4 19,20' } }],
  line: [{ el: 'rect', attrs: { x: 3, y: 9, width: 18, height: 6 } }],
  cube: [{ el: 'rect', attrs: { x: 5, y: 5, width: 14, height: 14 } }],
  build: [
    { el: 'path', attrs: { d: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z' } },
    { el: 'path', attrs: { d: 'M12 12l8-4.5M12 12v9M12 12L4 7.5' } },
  ],
  paint: [
    { el: 'rect', attrs: { x: 4, y: 4, width: 16, height: 6 } },
    { el: 'path', attrs: { d: 'M20 7h2v5h-10v4' } },
    { el: 'rect', attrs: { x: 10, y: 16, width: 4, height: 5 } },
  ],
  spawn: [
    { el: 'circle', attrs: { cx: 12, cy: 7, r: 3 } },
    { el: 'path', attrs: { d: 'M7 20h10l-1.5-7h-7L7 20z' } },
    { el: 'path', attrs: { d: 'M5 20h14' } },
  ],
  prefab: [
    { el: 'rect', attrs: { x: 4, y: 12, width: 7, height: 7 } },
    { el: 'rect', attrs: { x: 13, y: 12, width: 7, height: 7 } },
    { el: 'rect', attrs: { x: 8.5, y: 4, width: 7, height: 7 } },
  ],
  props: [
    { el: 'rect', attrs: { x: 6, y: 3, width: 12, height: 18 } },
    { el: 'rect', attrs: { x: 14, y: 11, width: 2, height: 2, fill: 'currentColor' } },
  ],
  select: [{ el: 'path', attrs: { d: 'M5 4l14 7-6 2-2 6L5 4z' } }],
  places: [
    { el: 'path', attrs: { d: 'M6 3v18' } },
    { el: 'polygon', attrs: { points: '6,4 19,8 6,13' } },
  ],
  height: [
    { el: 'rect', attrs: { x: 3, y: 14, width: 5, height: 6 } },
    { el: 'rect', attrs: { x: 9.5, y: 9, width: 5, height: 11 } },
    { el: 'rect', attrs: { x: 16, y: 4, width: 5, height: 16 } },
  ],
  ground: [
    { el: 'rect', attrs: { x: 4, y: 4, width: 7, height: 7 } },
    { el: 'rect', attrs: { x: 13, y: 4, width: 7, height: 7 } },
    { el: 'rect', attrs: { x: 4, y: 13, width: 7, height: 7 } },
    { el: 'rect', attrs: { x: 13, y: 13, width: 7, height: 7 } },
  ],
  cover: [
    { el: 'polygon', attrs: { points: '12,3 5,13 19,13' } },
    { el: 'polygon', attrs: { points: '12,9 4,18 20,18' } },
    { el: 'path', attrs: { d: 'M12 18v3' } },
  ],
  boat: [
    { el: 'path', attrs: { d: 'M12 4v11M12 4l6 8h-6' } },
    { el: 'path', attrs: { d: 'M4 16h16l-2 4H6l-2-4z' } },
  ],
  air: [
    { el: 'path', attrs: { d: 'M3 15l9-9 9 9' } },
    { el: 'path', attrs: { d: 'M7 18l5-5 5 5' } },
  ],
  'turn-ccw': [
    { el: 'path', attrs: { d: 'M9 14L4 9l5-5' } },
    { el: 'path', attrs: { d: 'M4 9h11a5 5 0 0 1 5 5v5' } },
  ],
  'turn-cw': [
    { el: 'path', attrs: { d: 'M15 14l5-5-5-5' } },
    { el: 'path', attrs: { d: 'M20 9H9a5 5 0 0 0-5 5v5' } },
  ],
  'tilt-down': [{ el: 'path', attrs: { d: 'M6 9l6 6 6-6' } }],
  'tilt-up': [{ el: 'path', attrs: { d: 'M18 15l-6-6-6 6' } }],
  'eye-open': [
    { el: 'path', attrs: { d: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z' } },
    { el: 'rect', attrs: { x: 10, y: 10, width: 4, height: 4, fill: 'currentColor' } },
  ],
  'eye-hidden': [
    { el: 'path', attrs: { d: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z' } },
    { el: 'path', attrs: { d: 'M4 4l16 16' } },
  ],
  light: [
    { el: 'path', attrs: { d: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z' } },
  ],
};

export interface GameIconProps {
  readonly name: GameIconName;
  readonly size?: number;
  /** Filled in the current colour as well as outlined: a light that is lit. */
  readonly filled?: boolean;
}

const SVG_STYLE: CSSProperties = {
  display: 'block',
  flexShrink: 0,
};

/** `fill-opacity` the way React spells it, `fillOpacity`. */
const reactProps = (attrs: GlyphShape['attrs']) =>
  Object.fromEntries(Object.entries(attrs).map(([name, value]) =>
    [name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()), value]));

export function GameIcon({ name, size = 20, filled = false }: GameIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      style={SVG_STYLE}
      aria-hidden
    >
      {GLYPHS[name].map((shape, i) => createElement(shape.el, { key: i, ...reactProps(shape.attrs) }))}
    </svg>
  );
}
