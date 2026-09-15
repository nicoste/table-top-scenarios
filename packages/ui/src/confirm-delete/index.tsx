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
}

export function ConfirmDelete({
  label, confirmLabel = 'Delete', placement = 'left', onConfirm,
}: ConfirmDeleteProps) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <Tooltip label={label} placement={placement}>
        <button className="quiet" aria-label={label} onClick={() => setArmed(true)}>×</button>
      </Tooltip>
    );
  }

  // The pair sits in its own flex box so that it wraps as a unit. A caller's
  // row of small buttons is narrow enough that two words will drop to a second
  // line, and "Keep" stranded there alone reads like a third action rather than
  // the answer to the question beside it.
  //
  // Disarmed before the callback, since confirming usually unmounts this very
  // component.
  return (
    <span style={{ display: 'flex', gap: 3 }}>
      <button className="danger" onClick={() => { setArmed(false); onConfirm(); }}>
        {confirmLabel}
      </button>
      <button className="quiet" onClick={() => setArmed(false)}>Keep</button>
    </span>
  );
}
