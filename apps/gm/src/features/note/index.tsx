// A note only the GM sees, under a row: a silver token's (R-208) or a party
// member's (D-315). One line — the note, or an offer to write one — that
// opens into a box in place when clicked.
//
// One component for both because they are the same thing to the GM, and two
// copies of the keys below would drift: one would learn Escape and the other
// would not.

import { useState } from 'react';

/**
 * The box: written in place, kept on leaving it or on ⌘/Ctrl + Enter, put
 * back on Escape. A textarea, not a line: "wounded, fleeing, has the key" is
 * a sentence.
 */
function NoteField({ value, name, onCommit, onClose }: {
  value: string;
  name: string;
  onCommit: (note: string) => void;
  /** Leaving the box closes it, whether or not anything was written. */
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <textarea
      className="stage-note"
      value={draft}
      maxLength={500}
      rows={2}
      autoFocus
      placeholder={`A note on ${name} — only you see it`}
      aria-label={`Note on ${name}`}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft.trim() !== value) onCommit(draft); onClose(); }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          const box = e.target as HTMLTextAreaElement;
          setDraft(value);
          // After the revert has rendered, so the blur finds nothing to keep.
          requestAnimationFrame(() => box.blur());
        }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.target as HTMLTextAreaElement).blur();
      }}
    />
  );
}

/**
 * The line, written or empty, and **the same box either way** (D-314): only
 * the words differ. Click to write.
 */
export function GmNote({ note, name, onCommit }: {
  note: string;
  /** Whose note it is, for the placeholder and the label. */
  name: string;
  /** The whole new note; empty clears it. Called only when it changed. */
  onCommit: (note: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (open) {
    return <NoteField value={note} name={name} onCommit={onCommit} onClose={() => setOpen(false)} />;
  }
  return (
    <button
      className={`plain stage-note-line${note ? '' : ' empty'}`}
      onClick={() => setOpen(true)}
      title={note ? 'Edit the note — only you see it' : 'Only you see it'}
    >
      {note || 'Add a note…'}
    </button>
  );
}
