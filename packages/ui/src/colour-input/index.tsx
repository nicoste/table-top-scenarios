// A colour that becomes an edit when it stops moving (R-163).
//
// `DraftInput`'s problem, with none of `DraftInput`'s signals. A colour input
// opens the operating system's own panel, which is a window and not part of the
// page: dragging in it streams `change` at the element, and the mouse release
// that ends the drag is never delivered here at all. Nor does the element
// reliably blur when the panel closes. So "commit on release" cannot be written
// as written — the release is not observable.
//
// What is observable is the colour **settling**. A GM dragging through a
// gradient produces a change every few milliseconds; a GM who has chosen
// produces none. A short quiet period is therefore the same event, measured
// from this side of the window, and it does not depend on which of `input` and
// `change` a given browser decides to fire.
//
// Without it, every intermediate colour was its own undo step (R-140a) — a
// single drag through the picker could push every real edit off the end of a
// bounded history.

import { useEffect, useRef, useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { commits } from '../draft-input/index.js';

type Passed = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'onBlur' | 'type'
>;

export interface ColourInputProps extends Passed {
  /** What the store says, as `#rrggbb`. */
  value: string;
  onCommit: (value: string) => void;
  /**
   * How long the colour must hold still before it counts as chosen.
   *
   * Long enough that no human drag is quiet for that long mid-gesture, short
   * enough that letting go feels like it took. A quarter of a second is both.
   */
  settleMs?: number;
}

export function ColourInput({
  value, onCommit, settleMs = 250, ...rest
}: ColourInputProps) {
  /** `null` means "not being picked": show whatever the store says. */
  const [draft, setDraft] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const stop = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };

  // A pending commit outlives nothing: a timer that fires into an unmounted
  // component would dispatch an edit from a panel nobody is looking at.
  useEffect(() => stop, []);

  const settle = (next: string) => {
    setDraft(next);
    stop();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setDraft(null);
      if (commits(next, value)) onCommit(next);
    }, settleMs);
  };

  return (
    <input
      type="color"
      {...rest}
      value={draft ?? value}
      onChange={(e) => settle(e.target.value)}
      // Tabbing away is an unambiguous "done", so it need not wait out the
      // quiet period.
      onBlur={() => {
        const picked = draft;
        stop();
        setDraft(null);
        if (commits(picked, value)) onCommit(picked!);
      }}
    />
  );
}
