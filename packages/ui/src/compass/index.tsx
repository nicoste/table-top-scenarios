// Which way is north (R-155).
//
// Presentational and domain-free, like everything here: it is handed a bearing
// in degrees and draws a dial. It does not know about cameras, maps or surfaces,
// which is why the same one serves the world and a point of interest's map on
// both screens.
//
// Styled inline so `@tt/ui` needs no CSS pipeline (R-111), and positioned by
// this component rather than each caller: bottom centre is the same answer in
// all four views, and four copies of the same `position: fixed` would drift.

import type { CSSProperties } from 'react';

export interface CompassProps {
  /**
   * Where north is on screen, in degrees clockwise from straight up.
   *
   * The caller converts; for the stepped god camera it is exactly the yaw
   * (R-31), because under this projection a ground direction's screen bearing
   * equals the camera's azimuth.
   */
  bearing: number;
  /** Hidden while a launcher or a modal owns the screen. */
  hidden?: boolean;
}

const SIZE = 64;
const C = SIZE / 2;

const SHELL: CSSProperties = {
  position: 'fixed',
  // Clear of the bottom hint bar, which both apps pin at `bottom: 12` and which
  // is wide enough on a narrow window to reach the middle. Still reads as
  // bottom centre; overlapping the keys legend does not.
  bottom: 48,
  left: '50%',
  // Centring and nothing else — the dial rotates inside the SVG, so this
  // transform never carries the bearing.
  transform: 'translateX(-50%)',
  width: SIZE,
  height: SIZE,
  borderRadius: '50%',
  background: '#151a22d9',
  border: '1px solid #333b48',
  boxShadow: '0 2px 10px #0006',
  // It reports, it does not accept: a click here must reach the canvas behind.
  pointerEvents: 'none',
  zIndex: 4,
  userSelect: 'none',
};

/** The four cardinals, at their bearing and their place on the ring. */
const RING = [
  { letter: 'N', x: C, y: 11 },
  { letter: 'E', x: SIZE - 9, y: C + 3.5 },
  { letter: 'S', x: C, y: SIZE - 6 },
  { letter: 'W', x: 9, y: C + 3.5 },
];

export function Compass({ bearing, hidden = false }: CompassProps) {
  if (hidden) return null;
  return (
    <div style={SHELL} aria-hidden>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <title>Compass</title>
        {/*
          One rotating group holding needle and letters together. Turning the
          needle while the letters stay upright would be two instruments
          disagreeing about the same fact.
        */}
        <g transform={`rotate(${bearing} ${C} ${C})`}>
          {/*
            Ticks on the intercardinals. They are where the grid's axes run, so
            they are the only directions a map can actually be extended toward
            (D-198) — worth marking, not worth four more letters at this size.
          */}
          {[45, 135, 225, 315].map((deg) => (
            <line
              key={deg}
              x1={C} y1={6} x2={C} y2={10}
              stroke="#4a5364"
              strokeWidth={1.5}
              transform={`rotate(${deg} ${C} ${C})`}
            />
          ))}
          {/* North: warm and solid. South: the same shape, dark, so the two
              halves read as one needle rather than two arrows. */}
          <path d={`M${C} 19 L${C + 4.5} ${C + 1} L${C} ${C - 1} L${C - 4.5} ${C + 1} Z`} fill="#ff8f6b" />
          <path d={`M${C} ${SIZE - 19} L${C + 4.5} ${C - 1} L${C} ${C + 1} L${C - 4.5} ${C - 1} Z`} fill="#3a4251" />
          {RING.map(({ letter, x, y }) => (
            <text
              key={letter}
              x={x}
              y={y}
              textAnchor="middle"
              fontSize={letter === 'N' ? 9.5 : 8}
              fontWeight={letter === 'N' ? 700 : 400}
              fill={letter === 'N' ? '#ff8f6b' : '#8b93a1'}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              {letter}
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
}
