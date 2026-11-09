// Canonical monochrome squared-stroke SVG icon registry (R-217, D-381).
//
// Presentational and domain-free, like everything in `@tt/ui`, and styled inline
// so no CSS pipeline is needed (R-111). Every glyph uses `currentColor` and
// squared geometry — no multi-colour fills, no emojis — so it automatically
// inherits the idle, hover or active highlight colour of the slot it sits in.
//
// One concept uses one canonical glyph across both screens: `walk` serves both
// map ground paths and world foot travel; `measure` serves both the Measure tool
// and the Ruler mode inside it.

import type { CSSProperties, ReactNode } from 'react';

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

export interface GameIconProps {
  readonly name: GameIconName;
  readonly size?: number;
}

const SVG_STYLE: CSSProperties = {
  display: 'block',
  flexShrink: 0,
};

function glyph(name: GameIconName): ReactNode {
  switch (name) {
    case 'play':
      return (
        <polygon
          points="6,4 20,12 6,20"
          fill="currentColor"
          fillOpacity={0.18}
        />
      );
    case 'walk':
      return (
        <path d="M4 19h16v2H4zM6 15l4-5 3 2 5-3v10H6z" />
      );
    case 'jump':
      return (
        <>
          <path d="M4 17c4-9 12-9 16 0" />
          <path d="M17 12l3 5-5 1" />
          <rect x={3} y={19} width={4} height={2} />
          <rect x={17} y={19} width={4} height={2} />
        </>
      );
    case 'measure':
      return (
        <>
          <rect x={3} y={8} width={18} height={8} />
          <path d="M7 8v4M11 8v3M15 8v4M19 8v3" />
        </>
      );
    case 'sphere':
      return (
        <>
          <circle cx={12} cy={12} r={8} />
          <rect x={11} y={11} width={2} height={2} fill="currentColor" />
        </>
      );
    case 'cone':
      return <polygon points="4,12 19,4 19,20" />;
    case 'line':
      return <rect x={3} y={9} width={18} height={6} />;
    case 'cube':
      return <rect x={5} y={5} width={14} height={14} />;
    case 'build':
      return (
        <>
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
          <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
        </>
      );
    case 'paint':
      return (
        <>
          <rect x={4} y={4} width={16} height={6} />
          <path d="M20 7h2v5h-10v4" />
          <rect x={10} y={16} width={4} height={5} />
        </>
      );
    case 'spawn':
      return (
        <>
          <circle cx={12} cy={7} r={3} />
          <path d="M7 20h10l-1.5-7h-7L7 20z" />
          <path d="M5 20h14" />
        </>
      );
    case 'prefab':
      return (
        <>
          <rect x={4} y={12} width={7} height={7} />
          <rect x={13} y={12} width={7} height={7} />
          <rect x={8.5} y={4} width={7} height={7} />
        </>
      );
    case 'props':
      return (
        <>
          <rect x={6} y={3} width={12} height={18} />
          <rect x={14} y={11} width={2} height={2} fill="currentColor" />
        </>
      );
    case 'select':
      return <path d="M5 4l14 7-6 2-2 6L5 4z" />;
    case 'places':
      return (
        <>
          <path d="M6 3v18" />
          <polygon points="6,4 19,8 6,13" />
        </>
      );
    case 'height':
      return (
        <>
          <rect x={3} y={14} width={5} height={6} />
          <rect x={9.5} y={9} width={5} height={11} />
          <rect x={16} y={4} width={5} height={16} />
        </>
      );
    case 'ground':
      return (
        <>
          <rect x={4} y={4} width={7} height={7} />
          <rect x={13} y={4} width={7} height={7} />
          <rect x={4} y={13} width={7} height={7} />
          <rect x={13} y={13} width={7} height={7} />
        </>
      );
    case 'cover':
      return (
        <>
          <polygon points="12,3 5,13 19,13" />
          <polygon points="12,9 4,18 20,18" />
          <path d="M12 18v3" />
        </>
      );
    case 'boat':
      return (
        <>
          <path d="M12 4v11M12 4l6 8h-6" />
          <path d="M4 16h16l-2 4H6l-2-4z" />
        </>
      );
    case 'air':
      return (
        <>
          <path d="M3 15l9-9 9 9" />
          <path d="M7 18l5-5 5 5" />
        </>
      );
    case 'turn-ccw':
      return (
        <>
          <path d="M9 14L4 9l5-5" />
          <path d="M4 9h11a5 5 0 0 1 5 5v5" />
        </>
      );
    case 'turn-cw':
      return (
        <>
          <path d="M15 14l5-5-5-5" />
          <path d="M20 9H9a5 5 0 0 0-5 5v5" />
        </>
      );
    case 'tilt-down':
      return <path d="M6 9l6 6 6-6" />;
    case 'tilt-up':
      return <path d="M18 15l-6-6-6 6" />;
    case 'eye-open':
      return (
        <>
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
          <rect x={10} y={10} width={4} height={4} fill="currentColor" />
        </>
      );
    case 'eye-hidden':
      return (
        <>
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
          <path d="M4 4l16 16" />
        </>
      );
    case 'light':
      return (
        <>
          <path d="M12 3c2 3 4 5 4 8a4 4 0 0 1-8 0c0-3 2-5 4-8z" />
          <rect x={10} y={15} width={4} height={6} />
        </>
      );
  }
}

export function GameIcon({ name, size = 20 }: GameIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      style={SVG_STYLE}
      aria-hidden
    >
      {glyph(name)}
    </svg>
  );
}
