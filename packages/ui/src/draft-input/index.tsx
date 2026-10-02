// A field that becomes an edit when you are finished with it (R-163).
//
// Every text field in the console used to dispatch on **every keystroke**, and
// the GM found the case where that is not merely wasteful but unusable: a
// level's height. The field is controlled by the stored value, so clearing it
// to type a new one puts an empty string through `parseInt`, which is not a
// number, which is refused — and the old value comes straight back. There is no
// way to get from `3` to `12` except by passing through `1`, which is a
// different, legal height and really moves the level.
//
// The text fields were quietly bad in the same way: backspacing a name to
// nothing snapped it back, because an empty name is refused. And each keystroke
// was its own **undo step**, so renaming a place cost as many entries as it had
// letters — and the history is bounded, so a long name pushed real edits off
// the end of it.
//
// So: a draft lives here while the field has focus, and becomes an edit on blur
// or Enter. Escape abandons it. Nothing leaves this component until the GM is
// done typing, which is also the only point at which the value is worth
// validating.
//
// Presentational, like everything in this package: it takes a string and gives
// one back, and knows nothing about what the string means.

import { useRef, useState } from 'react';
import type { InputHTMLAttributes } from 'react';

type Passed = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'onBlur' | 'onKeyDown'
>;

export interface DraftInputProps extends Passed {
  /** What the store says. Shown whenever the field is not being edited. */
  value: string;
  /** Called once, with the finished draft, when it differs from `value`. */
  onCommit: (value: string) => void;
  /**
   * Is this draft worth committing? A draft that fails reverts on the way out.
   *
   * The point of having it here rather than in the caller's handler: a *partly
   * typed* value fails this constantly — "1" on the way to "12", "-" on the way
   * to "-3" — and must not be rejected until the GM stops typing.
   */
  valid?: (draft: string) => boolean;
  /** Renders a textarea instead, for prose. Same behaviour otherwise. */
  multiline?: boolean;
  rows?: number;
}

/**
 * Does a finished draft become an edit?
 *
 * Out here rather than inside the handler because it is the rule and not a
 * detail of the markup (R-23b), and because there is no DOM to test the
 * component in. Three ways to be a no-op, and the first two matter most: a
 * field the GM tabbed through without typing must not dispatch, and neither
 * must one they typed into and put back.
 */
export function commits(
  draft: string | null,
  value: string,
  valid?: (draft: string) => boolean,
): boolean {
  if (draft === null || draft === value) return false;
  return valid ? valid(draft) : true;
}

export function DraftInput({
  value, onCommit, valid, multiline = false, rows, ...rest
}: DraftInputProps) {
  /** `null` means "not being edited": show whatever the store says. */
  const [draft, setDraft] = useState<string | null>(null);
  const field = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const finish = () => {
    const typed = draft;
    setDraft(null);
    if (commits(typed, value, valid)) onCommit(typed!);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Enter commits — except in prose, where it is a line break and the GM
    // leaving the field is the only sensible signal that they are done.
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      field.current?.blur();
      return;
    }
    if (e.key === 'Escape') {
      setDraft(null);
      // Blurring after clearing the draft, so `finish` finds nothing to do.
      requestAnimationFrame(() => field.current?.blur());
    }
  };

  const shared = {
    value: draft ?? value,
    // Taken on focus as well as on change, so a view push mid-edit cannot
    // overwrite what the GM is typing.
    onFocus: () => setDraft(value),
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: finish,
    onKeyDown,
  };

  return multiline
    ? (
      <textarea
        ref={field as React.Ref<HTMLTextAreaElement>}
        rows={rows}
        {...(rest as object)}
        {...shared}
      />
    )
    : <input ref={field as React.Ref<HTMLInputElement>} {...rest} {...shared} />;
}
