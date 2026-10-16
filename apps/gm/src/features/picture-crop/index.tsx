// Choosing which part of a picture goes on a card (R-205): the whole picture,
// a frame of the card's shape over it, and a preview of the card it makes.
//
// The frame's rules — its shape, and that it never leaves the picture — are
// `client-core`'s and tested there (R-23b). This only draws the frame and
// turns pointer movement into picture pixels.
//
// Rendered into `document.body`, not where it is used: the console's panels
// blur what is behind them, and `backdrop-filter` makes an element the box a
// `position: fixed` child is placed in — so a dialog left inside a panel
// would be fixed to the panel, not the window.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Corner, Frame } from '@tt/client-core';
import { cardPicture, movedFrame, resizedFrame, startingFrame } from '@tt/client-core';

interface Props {
  file: File;
  /** Whose card, said in the heading: "Galion's card". */
  title: string;
  /** The finished card picture. The dialog shows "Saving…" until it is closed. */
  onUse: (picture: Blob) => void;
  onCancel: () => void;
}

/** The most room the whole picture is given, in CSS pixels. */
const ROOM = { width: 520, height: 420 } as const;
/** The preview card's width; its height follows from the card's shape. */
const PREVIEW_WIDTH = 110;
const CORNERS: readonly Corner[] = ['nw', 'ne', 'sw', 'se'];

type Drag =
  | { readonly kind: 'move'; readonly x: number; readonly y: number; readonly from: Frame }
  | { readonly kind: 'resize'; readonly corner: Corner; readonly x: number; readonly y: number; readonly from: Frame };

export function PictureCrop({ file, title, onUse, onCancel }: Props) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const picture = useRef<HTMLImageElement | null>(null);
  const [size, setSize] = useState<{ readonly width: number; readonly height: number } | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null);

  // How many CSS pixels one picture pixel is drawn as. Small pictures are
  // drawn larger, so there is something to frame.
  const scale = size ? Math.min(ROOM.width / size.width, ROOM.height / size.height) : 1;

  const use = async () => {
    if (!picture.current || !frame || saving) return;
    setSaving(true);
    try {
      onUse(await cardPicture(picture.current, frame));
    } catch {
      setSaving(false);
      setProblem('This picture could not be turned into a card.');
    }
  };

  /*
   * Keys while the dialog is open belong to it. Taken in the capture phase
   * and stopped, so Q / E do not turn the camera and the digits do not change
   * tool behind a dialog the GM is looking at.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      if (e.key === 'Enter') { e.preventDefault(); void use(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const start = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!frame || saving) return;
    const corner = (e.target as HTMLElement).dataset.corner as Corner | undefined;
    const onFrame = (e.target as HTMLElement).closest('.crop-frame') !== null;
    if (!corner && !onFrame) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = corner
      ? { kind: 'resize', corner, x: e.clientX, y: e.clientY, from: frame }
      : { kind: 'move', x: e.clientX, y: e.clientY, from: frame };
  };

  const follow = (e: ReactPointerEvent<HTMLDivElement>) => {
    const now = drag.current;
    if (!now || !size) return;
    // From where the drag began, not from the last move: small rounding in
    // each step would otherwise add up into drift.
    const dx = (e.clientX - now.x) / scale;
    const dy = (e.clientY - now.y) / scale;
    setFrame(now.kind === 'move'
      ? movedFrame(now.from, dx, dy, size.width, size.height)
      : resizedFrame(now.from, now.corner, dx, dy, size.width, size.height));
  };

  const stop = () => { drag.current = null; };

  const preview = frame && size
    ? (() => {
      const s = PREVIEW_WIDTH / frame.width;
      return {
        backgroundImage: `url(${url})`,
        backgroundSize: `${size.width * s}px ${size.height * s}px`,
        backgroundPosition: `${-frame.x * s}px ${-frame.y * s}px`,
      };
    })()
    : undefined;

  return createPortal(
    <div className="crop-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="crop-dialog" role="dialog" aria-modal="true" aria-labelledby="crop-title">
        <h2 id="crop-title">{title}</h2>
        <p className="hint">
          Drag the frame to choose what goes on the card; drag a corner to resize it.
        </p>

        <div className="crop-body">
          <div
            className="crop-stage"
            style={size ? { width: size.width * scale, height: size.height * scale } : undefined}
            onPointerDown={start}
            onPointerMove={follow}
            onPointerUp={stop}
            onPointerCancel={stop}
          >
            <img
              ref={picture}
              src={url}
              alt=""
              draggable={false}
              onLoad={(e) => {
                const image = e.currentTarget;
                const width = image.naturalWidth;
                const height = image.naturalHeight;
                setSize({ width, height });
                setFrame(startingFrame(width, height));
              }}
              onError={() => setProblem('This file could not be opened as a picture.')}
            />
            {frame && (
              <div
                className="crop-frame"
                style={{
                  left: frame.x * scale,
                  top: frame.y * scale,
                  width: frame.width * scale,
                  height: frame.height * scale,
                }}
              >
                {CORNERS.map((corner) => (
                  <span key={corner} className="crop-handle" data-corner={corner} />
                ))}
              </div>
            )}
          </div>

          <div className="crop-side">
            <span className="lbl">On the card</span>
            <div className="crop-preview" style={preview} />
          </div>
        </div>

        {problem && <p className="warn">{problem}</p>}

        <div className="crop-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="on" onClick={() => { void use(); }} disabled={!frame || saving}>
            {saving ? 'Saving…' : 'Use picture'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
