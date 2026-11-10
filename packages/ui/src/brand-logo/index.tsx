// BrandLogo: canonical product emblem and typography lockup for Table Top
// Scenarios (D-382). Built in the Squared Voxel HUD visual language using
// master CSS tokens (`--ui-highlight`, `--ui-ink`, `--dim`, `--ui-slot-border`)
// so global theme swaps re-colour the emblem and wordmark automatically (R-111).
// Every colour below is one of them or mixed from them, read through THEME.

import type { CSSProperties } from 'react';
import { THEME } from '../theme/index.js';

const HIGHLIGHT = THEME.highlight;
const MAIN = THEME.main;
const INK = THEME.ink;
/** The highlight at `percent` strength over whatever is behind it: glows and tints. */
const glow = (percent: number) => `color-mix(in srgb, ${HIGHLIGHT} ${percent}%, transparent)`;
/** The emblem's faces, from darkest to lightest, and the line round them. */
const UNDERSIDE = `color-mix(in srgb, ${MAIN} 75%, black)`;
const FACE = `color-mix(in srgb, ${MAIN} 96%, ${INK})`;
const PLATEAU = `color-mix(in srgb, ${MAIN} 92%, ${INK})`;
const OUTLINE = `color-mix(in srgb, ${MAIN} 55%, black)`;

export interface BrandLogoProps {
  /** Role badge rendered above the wordmark (e.g. 'GM Console', 'Table Display'). */
  subtitle?: string | undefined;
  /** Optional status or diorama step label shown to the right of the subtitle. */
  statusLabel?: string | undefined;
  /** Emblem square size in pixels (default 48). */
  size?: number | undefined;
  /** Compact horizontal layout for tighter headers. */
  compact?: boolean | undefined;
}

const ROOT: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  userSelect: 'none',
};

const EMBLEM_FRAME: CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  background: THEME.slotBg,
  border: `1px solid ${THEME.slotBorder}`,
  borderRadius: THEME.radius,
  boxShadow: `inset 0 0 0 1px ${glow(16)}, 0 4px 14px rgba(0, 0, 0, 0.45)`,
};

const TEXT_COL: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
  flex: 1,
};

const EYEBROW_ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
};

const SUBTITLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: THEME.dim,
};

const DOT: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: 1,
  background: HIGHLIGHT,
  boxShadow: `0 0 6px ${glow(65)}`,
  flexShrink: 0,
};

const STATUS_PILL: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.04em',
  color: HIGHLIGHT,
  background: glow(10),
  border: `1px solid ${glow(35)}`,
  borderRadius: THEME.radius,
  padding: '1px 6px',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
};

const TITLE_H1: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  margin: 0,
  padding: 0,
  border: 'none',
};

const TITLE_PRIMARY: CSSProperties = {
  display: 'block',
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: '0.1em',
  lineHeight: 1.05,
  textTransform: 'uppercase',
  color: INK,
};

const TITLE_ACCENT: CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.26em',
  lineHeight: 1.15,
  textTransform: 'uppercase',
  color: HIGHLIGHT,
};

export function BrandLogo({
  subtitle,
  statusLabel,
  size = 48,
  compact = false,
}: BrandLogoProps) {
  const boxSize = compact ? 38 : size;
  return (
    <div style={ROOT} className="brand-logo" aria-label="Table Top Scenarios">
      <div style={{ ...EMBLEM_FRAME, width: boxSize, height: boxSize }}>
        <svg
          width={boxSize - 6}
          height={boxSize - 6}
          viewBox="0 0 40 40"
          fill="none"
          aria-hidden="true"
          style={{ display: 'block' }}
        >
          {/* Corner HUD ticks */}
          <path
            d="M2 6V2H6M34 2H38V6M38 34V38H34M6 38H2V34"
            stroke={THEME.slotBorder}
            strokeWidth="1.2"
          />

          {/* Floating Island Underside (Left & Right Rock Facets) */}
          <polygon
            points="4,22 20,30 20,36 6,28"
            fill={FACE}
            stroke={THEME.slotBorder}
            strokeWidth="1.1"
            strokeLinejoin="bevel"
          />
          <polygon
            points="36,22 20,30 20,36 34,28"
            fill={UNDERSIDE}
            stroke={THEME.slotBorder}
            strokeWidth="1.1"
            strokeLinejoin="bevel"
          />

          {/* Isometric Floating Terrain Plateau */}
          <polygon
            points="20,14 36,22 20,30 4,22"
            fill={PLATEAU}
            stroke={THEME.dim}
            strokeWidth="1.2"
            strokeLinejoin="bevel"
          />

          {/* Voxel Watchtower Keep on the Northern Crest */}
          {/* Tower Top Face */}
          <polygon
            points="20,5 28,9 20,13 12,9"
            fill={INK}
            stroke={OUTLINE}
            strokeWidth="1"
          />
          {/* Tower Left Lit Wall */}
          <polygon
            points="12,9 20,13 20,22 12,18"
            fill={THEME.dim}
            stroke={OUTLINE}
            strokeWidth="1"
          />
          {/* Tower Right Shadow Wall */}
          <polygon
            points="28,9 20,13 20,22 28,18"
            fill={THEME.slotBorder}
            stroke={OUTLINE}
            strokeWidth="1"
          />

          {/* Glowing Amber Gate & Beacon in the Watchtower */}
          <polygon
            points="16,15 19,16.5 19,21.5 16,20"
            fill={HIGHLIGHT}
          />
          <rect
            x="18.5"
            y="7.5"
            width="3"
            height="3"
            transform="rotate(26 20 9)"
            fill={HIGHLIGHT}
          />

          {/* The Winding Golden Isometric Road leading from the foreground edge to the gate */}
          <polygon
            points="12,26 16,28 23,24.5 19,22.5"
            fill={glow(30)}
            stroke={HIGHLIGHT}
            strokeWidth="1.35"
          />
          <polygon
            points="16,20 19,21.5 23,24.5 19,22.5"
            fill={HIGHLIGHT}
          />
        </svg>
      </div>

      <div style={TEXT_COL}>
        {(subtitle || statusLabel) && (
          <div style={EYEBROW_ROW}>
            {subtitle && (
              <span style={SUBTITLE}>
                <span style={DOT} />
                {subtitle}
              </span>
            )}
            {statusLabel && (
              <span style={STATUS_PILL} className="brand-status-pill">
                {statusLabel}
              </span>
            )}
          </div>
        )}
        <h1 style={TITLE_H1}>
          <span
            style={{
              ...TITLE_PRIMARY,
              fontSize: compact ? 15 : 18,
            }}
          >
            Table Top
          </span>
          <span
            style={{
              ...TITLE_ACCENT,
              fontSize: compact ? 10 : 12,
            }}
          >
            Scenarios
          </span>
        </h1>
      </div>
    </div>
  );
}
