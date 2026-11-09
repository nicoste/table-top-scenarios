// Which way is north (R-155), and mouse camera controls for turn and tilt (D-381).
//
// Presentational and domain-free, like everything here: it is handed a bearing
// in degrees and draws a dial, and when `onTurn` or `onTilt` are provided it
// flanks the dial with clickable turn (`↺`/`↻`) and tilt (`▼`/`▲`) buttons so a
// mouse alone can orbit and tilt the camera on both surfaces.
//
// Styled inline so `@tt/ui` needs no CSS pipeline (R-111), referencing global
// `--ui-*` CSS custom properties with safe fallbacks so changing `--ui-main` or
// `--ui-highlight` re-themes the compass automatically.

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { GameIcon } from '../game-icon/index.js';
import type { GameIconName } from '../game-icon/index.js';
import { Tooltip } from '../tooltip/index.js';

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
  /** Step the camera's yaw (-1 counter-clockwise, +1 clockwise). */
  onTurn?: (steps: number) => void;
  /** Step the camera's pitch (-1 lower, +1 steeper top-down). */
  onTilt?: (steps: number) => void;
}

const SIZE = 64;
const C = SIZE / 2;

const POD_SHELL: CSSProperties = {
  position: 'fixed',
  bottom: 48,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: 5,
  borderRadius: 'var(--ui-radius, 2px)',
  background: 'var(--ui-panel-bg, #151a22e6)',
  border: '2px solid var(--ui-panel-border, #3a404f)',
  boxShadow: 'var(--ui-panel-shadow, inset 2px 2px 0 rgba(255,255,255,0.07), inset -2px -2px 0 rgba(0,0,0,0.7), 0 6px 0 rgba(0,0,0,0.45))',
  zIndex: 4,
  userSelect: 'none',
};

const DIAL_SHELL: CSSProperties = {
  width: SIZE,
  height: SIZE,
  boxSizing: 'content-box',
  display: 'grid',
  placeItems: 'center',
  borderRadius: 'var(--ui-radius, 2px)',
  background: 'var(--bg, #0f1216)',
  border: '2px solid var(--ui-slot-border, #464e62)',
  boxShadow: 'inset 2px 2px 0 rgba(0,0,0,0.65), inset -2px -2px 0 rgba(255,255,255,0.05)',
  pointerEvents: 'none',
  flexShrink: 0,
};

const PASSIVE_SHELL: CSSProperties = {
  position: 'fixed',
  bottom: 48,
  left: '50%',
  transform: 'translateX(-50%)',
  width: SIZE,
  height: SIZE,
  boxSizing: 'content-box',
  display: 'grid',
  placeItems: 'center',
  borderRadius: '50%',
  background: 'var(--ui-panel-bg, #151a22d9)',
  border: '1px solid var(--ui-panel-border, #333b48)',
  boxShadow: '0 2px 10px #0006',
  pointerEvents: 'none',
  zIndex: 4,
  userSelect: 'none',
};

const COL_STACK: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const CAM_BTN: CSSProperties = {
  width: 31,
  height: 31,
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 'var(--ui-radius, 2px)',
  background: 'var(--ui-slot-bg, #202530)',
  border: '2px solid var(--ui-slot-border, #464e62)',
  boxShadow: 'var(--ui-slot-shadow, inset 2px 2px 0 rgba(255,255,255,0.11), inset -2px -2px 0 rgba(0,0,0,0.75))',
  color: 'var(--ui-ink, #e6e9ef)',
  cursor: 'pointer',
};

const CAM_BTN_HOVER: CSSProperties = {
  background: 'var(--ui-slot-hover-bg, #282f3d)',
  borderColor: 'var(--ui-highlight, #f5a524)',
  color: 'var(--ui-slot-active-ink, #ffd479)',
};

/** The four cardinals, symmetrically placed 8.5px inside the 64×64 frame. */
const EDGE_INSET = 8.5;
const RING = [
  { letter: 'N', x: C, y: EDGE_INSET },
  { letter: 'E', x: SIZE - EDGE_INSET, y: C },
  { letter: 'S', x: C, y: SIZE - EDGE_INSET },
  { letter: 'W', x: EDGE_INSET, y: C },
];

function CamButton({
  icon,
  label,
  onClick,
}: {
  readonly icon: GameIconName;
  readonly label: string;
  readonly onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Tooltip label={label} placement="top">
      <button
        type="button"
        aria-label={label}
        style={hovered ? { ...CAM_BTN, ...CAM_BTN_HOVER } : CAM_BTN}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        // A click does not take the focus: kept, the next Space or Enter would
        // turn the camera again instead of reaching what the GM meant it for.
        // Tab still reaches it, for a keyboard alone.
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
      >
        <GameIcon name={icon} size={16} />
      </button>
    </Tooltip>
  );
}

function DialSvg({ bearing }: { readonly bearing: number }) {
  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      style={{ display: 'block' }}
    >
      <title>Compass</title>
      <g transform={`rotate(${bearing} ${C} ${C})`}>
        {[45, 135, 225, 315].map((deg) => (
          <line
            key={deg}
            x1={C} y1={6} x2={C} y2={10}
            stroke="var(--ui-slot-border, #4a5364)"
            strokeWidth={1.5}
            transform={`rotate(${deg} ${C} ${C})`}
          />
        ))}
        <path
          d={`M${C} 19 L${C + 4.5} ${C + 1} L${C} ${C - 1} L${C - 4.5} ${C + 1} Z`}
          fill="var(--ui-highlight, #f5a524)"
        />
        <path
          d={`M${C} ${SIZE - 19} L${C + 4.5} ${C - 1} L${C} ${C + 1} L${C - 4.5} ${C - 1} Z`}
          fill="var(--ui-slot-border, #3a4251)"
        />
        {RING.map(({ letter, x, y }) => (
          <text
            key={letter}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={letter === 'N' ? 9.5 : 8}
            fontWeight={letter === 'N' ? 700 : 400}
            fill={letter === 'N' ? 'var(--ui-highlight, #f5a524)' : 'var(--dim, #8b93a1)'}
            fontFamily="var(--ui-font, ui-monospace, Menlo, monospace)"
          >
            {letter}
          </text>
        ))}
      </g>
    </svg>
  );
}

export function Compass({ bearing, hidden = false, onTurn, onTilt }: CompassProps) {
  if (hidden) return null;

  if (!onTurn && !onTilt) {
    return (
      <div style={PASSIVE_SHELL} aria-hidden>
        <DialSvg bearing={bearing} />
      </div>
    );
  }

  return (
    <div style={POD_SHELL} role="group" aria-label="Camera controls">
      <div style={COL_STACK}>
        {onTurn && (
          <CamButton
            icon="turn-ccw"
            label="Turn camera 90° left"
            onClick={() => onTurn(-1)}
          />
        )}
        {onTilt && (
          <CamButton
            icon="tilt-down"
            label="Tilt camera lower"
            onClick={() => onTilt(-1)}
          />
        )}
      </div>

      <div style={DIAL_SHELL} aria-hidden>
        <DialSvg bearing={bearing} />
      </div>

      <div style={COL_STACK}>
        {onTurn && (
          <CamButton
            icon="turn-cw"
            label="Turn camera 90° right"
            onClick={() => onTurn(1)}
          />
        )}
        {onTilt && (
          <CamButton
            icon="tilt-up"
            label="Tilt camera top-down"
            onClick={() => onTilt(1)}
          />
        )}
      </div>
    </div>
  );
}
