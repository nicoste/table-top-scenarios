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
import { THEME } from '../theme/index.js';

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
  minHeight: THEME.slotH,
  padding: '6px 4px',
  borderRadius: THEME.radius,
  background: THEME.slotBg,
  border: `2px solid ${THEME.slotBorder}`,
  boxShadow: THEME.slotShadow,
  color: THEME.ink,
  font: `600 11.5px/1.1 ${THEME.font}`,
  cursor: 'pointer',
  userSelect: 'none',
  transition: 'border-color 0.1s ease, background 0.1s ease, color 0.1s ease',
};

const HOVER_SLOT: CSSProperties = {
  background: THEME.slotHoverBg,
  borderColor: THEME.slotHoverBorder,
};

const ACTIVE_SLOT: CSSProperties = {
  background: THEME.slotActiveBg,
  borderColor: THEME.slotActiveBorder,
  boxShadow: THEME.slotActiveShadow,
  color: THEME.slotActiveInk,
};

const HOTKEY_STYLE: CSSProperties = {
  position: 'absolute',
  top: 3,
  left: 5,
  fontSize: 10.5,
  lineHeight: 1,
  fontWeight: 700,
  color: THEME.dim,
};

const HOTKEY_ACTIVE_STYLE: CSSProperties = {
  ...HOTKEY_STYLE,
  color: THEME.highlight,
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
      // The key is said as a key, not as part of the name: "Build", not "1Build".
      aria-keyshortcuts={hotkey}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {hotkey && <span aria-hidden="true" style={active ? HOTKEY_ACTIVE_STYLE : HOTKEY_STYLE}>{hotkey}</span>}
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
