// A picture for a card: a small card showing it (or its colour), which opens
// the file picker when clicked, and a way to take the picture off again.
//
// Knows nothing about what happens to the file — preparing and storing it is
// the caller's (R-204). It only says which file was chosen, or that the
// picture should go.

import { useRef } from 'react';

export interface PictureInputProps {
  /** The picture on the card, as an address, or `null` for none. */
  src: string | null;
  /** What the card shows with no picture: a CSS colour. */
  fallback: string;
  /** While a chosen file is being prepared and stored. */
  busy?: boolean;
  /** Said to a screen reader and on hover, e.g. "Picture for Aldra". */
  label: string;
  onPick: (file: File) => void;
  onClear: () => void;
}

export function PictureInput({ src, fallback, busy = false, label, onPick, onClear }: PictureInputProps) {
  const file = useRef<HTMLInputElement | null>(null);
  return (
    <span className="picture-input">
      <button
        type="button"
        className="picture-card"
        title={src ? `${label} — click to change` : `${label} — click to choose one`}
        aria-label={label}
        disabled={busy}
        style={{ background: fallback }}
        onClick={() => file.current?.click()}
      >
        {src && <img src={src} alt="" />}
        {busy && <span className="picture-busy">…</span>}
      </button>
      <input
        ref={file}
        type="file"
        // Anything the browser can open: it is redrawn into a card's picture
        // before it is sent, so the kind it arrives as does not matter.
        accept="image/*"
        hidden
        onChange={(e) => {
          const chosen = e.target.files?.[0];
          // Cleared so choosing the same file again still fires.
          e.target.value = '';
          if (chosen) onPick(chosen);
        }}
      />
      {src && !busy && (
        <button
          type="button"
          className="plain picture-clear"
          title="Remove picture"
          aria-label="Remove picture"
          onClick={onClear}
        >
          ×
        </button>
      )}
    </span>
  );
}
