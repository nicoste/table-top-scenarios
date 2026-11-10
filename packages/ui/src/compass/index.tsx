// Which way is north (R-155), and mouse camera controls for turn and tilt (D-381).
//
// Presentational and domain-free, like everything here: it is handed a bearing
// in degrees and draws a dial, and when `onTurn` or `onTilt` are provided it
// flanks the dial with turn and tilt buttons — `turn-ccw`, `turn-cw`,
// `tilt-down`, `tilt-up` — so a mouse alone can orbit and tilt the camera on
// both surfaces.
//
// Styled inline so `@tt/ui` needs no CSS pipeline (R-111), referencing global
// `--ui-*` CSS custom properties with safe fallbacks so changing `--ui-main` or
// `--ui-highlight` re-themes the compass automatically.

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { GameIcon } from '../game-icon/index.js';
import type { GameIconName } from '../game-icon/index.js';
import { Tooltip } from '../tooltip/index.js';
import { THEME } from '../theme/index.js';

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
  borderRadius: THEME.radius,
  background: THEME.panelBg,
  border: `2px solid ${THEME.panelBorder}`,
  boxShadow: THEME.panelShadow,
  zIndex: 4,
  userSelect: 'none',
};

const DIAL_SHELL: CSSProperties = {
  width: SIZE,
  height: SIZE,
  boxSizing: 'content-box',
  display: 'grid',
  placeItems: 'center',
  borderRadius: THEME.radius,
  background: THEME.bg,
  border: `2px solid ${THEME.slotBorder}`,
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
  background: THEME.panelBg,
  border: `1px solid ${THEME.panelBorder}`,
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
  borderRadius: THEME.radius,
  background: THEME.slotBg,
  border: `2px solid ${THEME.slotBorder}`,
  boxShadow: THEME.slotShadow,
  color: THEME.ink,
  cursor: 'pointer',
};

const CAM_BTN_HOVER: CSSProperties = {
  background: THEME.slotHoverBg,
  borderColor: THEME.highlight,
  color: THEME.slotActiveInk,
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
            stroke={THEME.slotBorder}
            strokeWidth={1.5}
            transform={`rotate(${deg} ${C} ${C})`}
          />
        ))}
        <path
          d={`M${C} 19 L${C + 4.5} ${C + 1} L${C} ${C - 1} L${C - 4.5} ${C + 1} Z`}
          fill={THEME.highlight}
        />
        <path
          d={`M${C} ${SIZE - 19} L${C + 4.5} ${C - 1} L${C} ${C + 1} L${C - 4.5} ${C - 1} Z`}
          fill={THEME.slotBorder}
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
            fill={letter === 'N' ? THEME.highlight : THEME.dim}
            fontFamily={THEME.font}
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
