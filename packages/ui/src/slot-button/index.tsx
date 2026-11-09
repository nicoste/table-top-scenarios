// Squared chiseled voxel action slot (R-217, D-381).
//
// Pairs a canonical `GameIcon` with a 1-word label (and an optional hotkey
// badge on the console) inside a chiseled slot frame, wrapped in a bottom
// `Tooltip` when an explanation is needed.
//
// Styled inline so `@tt/ui` needs no CSS pipeline (R-111), while every colour
// and bevel reads from the host page's global `--ui-*` CSS custom properties
// (with safe inline fallbacks) so switching `--ui-main` or `--ui-highlight`
// re-themes every slot at once.

import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { GameIcon } from '../game-icon/index.js';
import type { GameIconName } from '../game-icon/index.js';
import { Tooltip } from '../tooltip/index.js';
import type { Placement } from '../tooltip/index.js';

export interface SlotButtonProps {
  readonly icon: GameIconName;
  readonly label: string;
  readonly active?: boolean;
  readonly hotkey?: string;
  readonly tooltip?: ReactNode;
  readonly tooltipPlacement?: Placement;
  readonly stretch?: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}

const BASE_SLOT: CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  width: '100%',
  minHeight: 54,
  padding: '6px 4px',
  borderRadius: 'var(--ui-radius, 2px)',
  background: 'var(--ui-slot-bg, #202530)',
  border: '2px solid var(--ui-slot-border, #464e62)',
  boxShadow: 'var(--ui-slot-shadow, inset 2px 2px 0 rgba(255,255,255,0.11), inset -2px -2px 0 rgba(0,0,0,0.75))',
  color: 'var(--ui-ink, #e6e9ef)',
  font: '600 11.5px/1.1 var(--ui-font, ui-monospace, Menlo, monospace)',
  cursor: 'pointer',
  userSelect: 'none',
  transition: 'border-color 0.1s ease, background 0.1s ease, color 0.1s ease',
};

const HOVER_SLOT: CSSProperties = {
  background: 'var(--ui-slot-hover-bg, #282f3d)',
  borderColor: 'var(--ui-slot-hover-border, #8792a8)',
};

const ACTIVE_SLOT: CSSProperties = {
  background: 'var(--ui-slot-active-bg, #3b2c14)',
  borderColor: 'var(--ui-slot-active-border, var(--ui-highlight, #f5a524))',
  boxShadow: 'var(--ui-slot-active-shadow, inset 2px 2px 0 rgba(255,220,130,0.25), inset -2px -2px 0 rgba(0,0,0,0.85), 0 0 0 1px #f5a524)',
  color: 'var(--ui-slot-active-ink, #ffd479)',
};

const HOTKEY_STYLE: CSSProperties = {
  position: 'absolute',
  top: 3,
  left: 5,
  fontSize: 10.5,
  lineHeight: 1,
  fontWeight: 700,
  color: 'var(--dim, #8d97a6)',
};

const HOTKEY_ACTIVE_STYLE: CSSProperties = {
  ...HOTKEY_STYLE,
  color: 'var(--ui-highlight, #f5a524)',
};

const LABEL_STYLE: CSSProperties = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '100%',
};

export function SlotButton({
  icon,
  label,
  active = false,
  hotkey,
  tooltip,
  tooltipPlacement = 'bottom',
  stretch = true,
  disabled = false,
  onClick,
}: SlotButtonProps) {
  const [hovered, setHovered] = useState(false);

  const style: CSSProperties = {
    ...BASE_SLOT,
    ...(hovered && !active && !disabled ? HOVER_SLOT : {}),
    ...(active ? ACTIVE_SLOT : {}),
    ...(disabled ? { opacity: 0.45, cursor: 'default' } : {}),
  };

  const button = (
    <button
      type="button"
      className={active ? 'on' : ''}
      style={style}
      aria-pressed={active}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {hotkey && <span style={active ? HOTKEY_ACTIVE_STYLE : HOTKEY_STYLE}>{hotkey}</span>}
      <GameIcon name={icon} size={20} />
      <span style={LABEL_STYLE}>{label}</span>
    </button>
  );

  if (!tooltip) return button;
  return (
    <Tooltip label={tooltip} placement={tooltipPlacement} stretch={stretch}>
      {button}
    </Tooltip>
  );
}
