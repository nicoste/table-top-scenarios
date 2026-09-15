// A delete that asks first (R-151).
//
// A component rather than a copied pair of buttons, because the rule is "every
// affordance that destroys authored content asks first" and a rule enforced by
// remembering to type it is a rule that lasts until the next list gets a `×`.
//
// Presentational, like everything in this package: it takes a callback and
// knows nothing about what is being deleted. It leans on the host app's global
// `button.quiet` and `button.danger`, the same way every caller of `Tooltip`
// already passes its own classes (R-111 — no CSS pipeline here).

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Tooltip } from '../tooltip/index.js';
import type { Placement } from '../tooltip/index.js';

export interface ConfirmDeleteProps {
  /** What the `×` destroys, e.g. `Delete "The tavern"`. Tooltip and aria name. */
  label: string;
  /** The word on the armed button. Short: it shares a narrow row with "Keep". */
  confirmLabel?: string;
  /** Which side the tooltip prefers. */
  placement?: Placement;
  onConfirm: () => void;
  /**
   * The row's other actions, to the left of the `×`.
   *
   * They are handed over rather than placed beside this component so the
   * question can take the whole row. Asking in place keeps the answer on one
   * line in a 228px dock, and a row that briefly offers nothing but "Delete"
   * and "Keep" is unambiguous about what is being asked.
   */
  children?: ReactNode;
}

export function ConfirmDelete({
  label, confirmLabel = 'Delete', placement = 'left', onConfirm, children,
}: ConfirmDeleteProps) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <>
        {children}
        <Tooltip label={label} placement={placement}>
          <button className="quiet" aria-label={label} onClick={() => setArmed(true)}>×</button>
        </Tooltip>
      </>
    );
  }

  // Disarmed before the callback, since confirming usually unmounts this very
  // component.
  return (
    <>
      <button className="danger" onClick={() => { setArmed(false); onConfirm(); }}>
        {confirmLabel}
      </button>
      {/*
        "Keep" is last on purpose, so it lands where the `×` just was. The row is
        right-aligned and the `×` is its right edge: put "Delete" there and the
        second click of a double-click destroys the thing the first click only
        asked about.
      */}
      <button className="quiet" onClick={() => setArmed(false)}>Keep</button>
    </>
  );
}
