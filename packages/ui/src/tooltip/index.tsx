// A tooltip primitive. Presentational only: it knows nothing about the domain,
// and it is styled inline so `@tt/ui` needs no CSS pipeline and no second entry
// in its `exports` map (R-111).

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, ReactNode } from 'react';

export type Placement = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  /** The text shown. Nothing renders when this is empty. */
  label: ReactNode;
  /** Preferred side. Flips to the opposite side if there is no room (R-115). */
  placement?: Placement;
  /**
   * Let the wrapper fill its parent instead of hugging the child.
   *
   * The wrapper becomes the flex or block item in the caller's layout, so a
   * child with `width: 100%` or `flex: 1` would otherwise resolve against the
   * wrapper and collapse to its content. Set this wherever the wrapped control
   * is meant to fill its row.
   */
  stretch?: boolean;
  children: ReactNode;
}

const GAP = 8;
const EDGE = 6;

const BUBBLE: CSSProperties = {
  position: 'fixed',
  zIndex: 2147483000,
  margin: 0,
  padding: '5px 9px',
  borderRadius: 6,
  background: '#0b0e13f2',
  border: '1px solid #333b48',
  color: '#e6e9ef',
  font: '11.5px/1.45 ui-sans-serif, system-ui, sans-serif',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  boxShadow: '0 4px 14px #0008',
};

interface Box { left: number; top: number; right: number; bottom: number; width: number; height: number }

/** Where the bubble goes, given the anchor and the bubble's measured size. */
function position(anchor: Box, bubble: Box, preferred: Placement): { left: number; top: number } {
  const room = {
    top: anchor.top,
    bottom: innerHeight - anchor.bottom,
    left: anchor.left,
    right: innerWidth - anchor.right,
  };
  const needed = {
    top: bubble.height + GAP,
    bottom: bubble.height + GAP,
    left: bubble.width + GAP,
    right: bubble.width + GAP,
  };
  const opposite: Record<Placement, Placement> = {
    top: 'bottom', bottom: 'top', left: 'right', right: 'left',
  };

  // Flip rather than overflow, but only if the far side is actually roomier.
  let side = preferred;
  if (room[side] < needed[side] && room[opposite[side]] > room[side]) side = opposite[side];

  const centreX = anchor.left + anchor.width / 2 - bubble.width / 2;
  const centreY = anchor.top + anchor.height / 2 - bubble.height / 2;

  const raw = {
    top: { left: centreX, top: anchor.top - bubble.height - GAP },
    bottom: { left: centreX, top: anchor.bottom + GAP },
    left: { left: anchor.left - bubble.width - GAP, top: centreY },
    right: { left: anchor.right + GAP, top: centreY },
  }[side];

  // Then keep it on screen regardless.
  return {
    left: Math.min(Math.max(raw.left, EDGE), Math.max(EDGE, innerWidth - bubble.width - EDGE)),
    top: Math.min(Math.max(raw.top, EDGE), Math.max(EDGE, innerHeight - bubble.height - EDGE)),
  };
}

/**
 * Shows on hover **and** on keyboard focus, and closes on Escape (R-112).
 *
 * The bubble is rendered through a **portal into `document.body`** and positioned
 * with viewport coordinates. An absolutely positioned child cannot escape an
 * ancestor that scrolls or clips, and the panels this is used in do both — so an
 * in-place bubble is clipped to whichever panel it sits in.
 */
export function Tooltip({ label, placement = 'top', stretch = false, children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const bubbleRef = useRef<HTMLSpanElement | null>(null);

  const reposition = useCallback(() => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    const bubble = bubbleRef.current?.getBoundingClientRect();
    if (!anchor || !bubble) return;
    setAt(position(anchor, bubble, placement));
  }, [placement]);

  // Before paint, so the bubble is never seen at its unpositioned spot.
  useLayoutEffect(() => {
    if (!open) { setAt(null); return; }
    reposition();
  }, [open, label, reposition]);

  // The dock scrolls, and its scroll does not bubble — hence capture.
  useEffect(() => {
    if (!open) return;
    const onMove = () => reposition();
    addEventListener('scroll', onMove, true);
    addEventListener('resize', onMove);
    return () => {
      removeEventListener('scroll', onMove, true);
      removeEventListener('resize', onMove);
    };
  }, [open, reposition]);

  const show = () => setOpen(true);
  const hide = () => setOpen(false);

  return (
    <span
      ref={anchorRef}
      style={
        stretch
          // Both, so one flag works in a flex row and a block column alike.
          ? { position: 'relative', display: 'flex', flex: 1, width: '100%', minWidth: 0 }
          : { position: 'relative', display: 'inline-flex' }
      }
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={(event) => { if (event.key === 'Escape') hide(); }}
    >
      {/*
        aria-describedby goes on the wrapper rather than being cloned onto the
        child: cloning would force every caller's child to forward props, and
        this primitive should accept any element.
      */}
      <span
        aria-describedby={open && label ? id : undefined}
        style={stretch ? { display: 'flex', flex: 1, minWidth: 0 } : { display: 'inline-flex' }}
      >
        {children}
      </span>
      {open && label
        ? createPortal(
            <span
              ref={bubbleRef}
              role="tooltip"
              id={id}
              style={{
                ...BUBBLE,
                left: at?.left ?? 0,
                top: at?.top ?? 0,
                visibility: at ? 'visible' : 'hidden',
              }}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
