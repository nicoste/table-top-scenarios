// A picture for a card: a small card showing it (or its colour), which opens
// the file picker when clicked, and a way to take the picture off again.
//
// Knows nothing about what happens to the file — preparing and storing it is
// the caller's (R-204). It only says which file was chosen, or that the
// picture should go — and asks first, as every delete does (R-151).

import { useRef, useState } from 'react';
import { Tooltip } from '../tooltip/index.js';

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
  const [asking, setAsking] = useState(false);
  return (
    <span className="picture-input">
      {/* In place, both: the card sits in its row, and the badge on its corner (R-110). */}
      <Tooltip label={src ? `${label} — click to change` : `${label} — click to choose one`} placement="left" inPlace>
        <button
          type="button"
          className="picture-card"
          aria-label={label}
          disabled={busy}
          style={{ background: fallback }}
          onClick={() => file.current?.click()}
        >
          {src && <img src={src} alt="" />}
          {busy && <span className="picture-busy">…</span>}
        </button>
      </Tooltip>
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
      {src && !busy && !asking && (
        <Tooltip label="Remove picture" placement="top" inPlace>
          <button
            type="button"
            className="plain picture-clear"
            aria-label="Remove picture"
            onClick={() => setAsking(true)}
          >
            ×
          </button>
        </Tooltip>
      )}
      {/*
        "Keep" first, so it opens under the pointer where the × was: the second
        click of a double-click keeps the picture. ConfirmDelete puts it last
        for the same reason, where its row's × was.
      */}
      {src && !busy && asking && (
        <span className="picture-ask" role="group" aria-label="Remove the picture?">
          <button type="button" className="quiet" onClick={() => setAsking(false)}>Keep</button>
          <button type="button" className="danger" onClick={() => { setAsking(false); onClear(); }}>
            Remove
          </button>
        </span>
      )}
    </span>
  );
}
