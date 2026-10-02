// The level ladder: cutting planes and the band, as one control (R-146, R-161).
//
// The GM's own drawing, and R-146's original brief built at last: *"a double
// range slider, where the GM can specify the steps/planes by presetting their Y
// values."*
//
// Three things the first attempt got wrong, all visible the moment a GM used it
// (D-206):
//
//   - **A handle that landed on a cap vanished**, because the cap's flat marker
//     replaced the handle's ring. The band appeared to have only one end.
//   - **Rows came and went.** The band was allowed to rest between levels, so
//     the ladder grew a ghost row to show where it was — and that row
//     evaporated the moment the band moved. A list that rearranges itself as
//     you touch it reads as broken.
//   - **Nothing said what was draggable.** Clicking a row moved the nearer
//     handle: fine once you know, unguessable before.
//
// So: every row is a stop and the band always rests on one (the domain keeps
// that true now, R-161); a handle draws *over* whatever marker its row has; and
// the handles drag, which is what a double range slider is.
//
// The axis is **evenly spaced, not proportional to height**. Proportional is
// the obvious choice and it is wrong: with Bedrock at -16 and Sky at 32, a roof
// at 3 and a water level at 0 land six percent apart and overlap. It also means
// a row cannot be dragged to a new *height* — an ordinal axis has no answer to
// "what height did I drop it at" — so the number beside each name is how a
// height is set, and it is exact.

import { useRef, useState } from 'react';
import type { Intent, MapWire } from '@tt/protocol';
import { MAP_MAX_HEIGHT, MAP_MIN_DEPTH, planeSteps, stepLabel } from '@tt/domain';
import type { LevelRange } from '@tt/domain';
import { grabEnd } from '@tt/client-core';
import { ConfirmDelete, DraftInput } from '@tt/ui';

interface Props {
  readonly map: MapWire;
  readonly range: LevelRange;
  readonly placeId: string;
  readonly poiId: string;
  dispatch: (intent: Intent) => void;
}

/** One stop on the axis: a height the band may rest on. */
interface Stop {
  readonly y: number;
  readonly name: string;
  /** Absent for the two fixed bounds, which are not the GM's to edit. */
  readonly planeId: string | null;
}

export function LevelLadder({ map, range, placeId, poiId, dispatch }: Props) {
  const [name, setName] = useState('');
  const [y, setY] = useState('');
  /** Which end is being dragged, and the stop it has reached. */
  const drag = useRef<{ end: 'lower' | 'upper'; at: number } | null>(null);
  const list = useRef<HTMLUListElement | null>(null);

  const planes = map.planes ?? [];

  /**
   * Every stop, highest first. Exactly the bounds and the planes — nothing
   * synthetic, so the list does not change shape when the band moves.
   */
  const stops: Stop[] = [...planeSteps(planes, MAP_MAX_HEIGHT, MAP_MIN_DEPTH)]
    .sort((a, b) => b - a)
    .map((at) => {
      const plane = planes.find((candidate) => candidate.y === at);
      return {
        y: at,
        name: stepLabel(at, MAP_MAX_HEIGHT, MAP_MIN_DEPTH) ?? plane?.name ?? `Level ${at}`,
        planeId: plane?.id ?? null,
      };
    });

  const move = (end: 'lower' | 'upper', to: number) => {
    const next = end === 'lower'
      ? { lower: to, upper: range.upper }
      : { lower: range.lower, upper: to };
    if (next.lower === range.lower && next.upper === range.upper) return;
    dispatch({ kind: 'setRange', placeId, poiId, ...next });
  };

  /**
   * The stop under a pointer, found by hit-testing rows rather than by
   * arithmetic — the rows are the truth about where the stops are drawn.
   */
  const stopUnder = (clientY: number): number | null => {
    const rows = list.current?.children;
    if (!rows || rows.length === 0) return null;
    for (let i = 0; i < rows.length; i += 1) {
      const box = rows[i]!.getBoundingClientRect();
      if (clientY >= box.top && clientY <= box.bottom) return stops[i]!.y;
    }
    // Past either end: clamp to the nearest, so dragging off the top does not
    // simply stop responding.
    const top = rows[0]!.getBoundingClientRect();
    return clientY < top.top ? stops[0]!.y : stops[rows.length - 1]!.y;
  };

  /**
   * Pressing anywhere on the rail takes hold of a handle (D-208).
   *
   * One gesture for both cases: on a handle it grabs that handle, on any other
   * row it brings the nearer end there and you are already dragging it — which
   * is how a slider behaves, and what the GM meant by a double range slider.
   *
   * It is also what stops the ladder acting twice. The version this replaces
   * moved the band on a **click**, and a click fires on release — the same
   * release that ends a drag. React reuses the row's button as the handle
   * moves, so letting go after a drag fired a click on the row the drag
   * *started* from and threw the band back there. Nothing listens for a
   * pointer click here now, so it cannot recur.
   */
  const onRowDown = (stop: Stop) => (e: React.PointerEvent) => {
    e.preventDefault();
    const end = grabEnd(range, stop.y);
    drag.current = { end, at: stop.y };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // No capture (a synthetic pointer, or one already released). The drag
      // still tracks: moves are handled on the list, not on the handle.
    }
    move(end, stop.y);
  };

  const onDragMove = (e: React.PointerEvent) => {
    const held = drag.current;
    if (!held) return;
    const at = stopUnder(e.clientY);
    // Only when the pointer crosses into another row: a drag within one row
    // would otherwise send an intent per pixel.
    if (at === null || at === held.at) return;
    drag.current = { ...held, at };
    move(held.end, at);
  };

  const endDrag = () => { drag.current = null; };

  const add = () => {
    const at = Number.parseInt(y, 10);
    if (!Number.isInteger(at)) return;
    dispatch({ kind: 'addPlane', placeId, poiId, name: name.trim(), y: at });
    setName('');
    setY('');
  };

  return (
    <>
      <ul
        className="ladder"
        ref={list}
        onPointerMove={onDragMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {stops.map((stop, i) => {
          const inBand = stop.y >= range.lower && stop.y <= range.upper;
          const end = stop.y === range.upper
            ? 'upper'
            : stop.y === range.lower ? 'lower' : null;
          return (
            <li key={stop.y} className={stop.planeId ? '' : 'cap'}>
              <span className="rail">
                {/*
                  Two half-segments, so the band's colour starts and stops at a
                  handle rather than in the gap between two rows.
                */}
                <i className={i > 0 && inBand && stop.y !== range.upper ? 'lit' : ''} />
                <i className={i < stops.length - 1 && inBand && stop.y !== range.lower ? 'lit' : ''} />
                {/*
                  The row's own marker — a bar for a bound, a dot for a level —
                  drawn separately from the handle, so a handle resting on a
                  bound is still a handle and not a bar.
                */}
                <span className={`mark${inBand ? ' in' : ''}`} aria-hidden />
                {/*
                  One button whether or not a handle rests here, so the press
                  that starts a drag and the press that summons a handle are the
                  same gesture — and so React has no pair of elements to swap
                  handlers between mid-drag.
                */}
                <button
                  className={end ? 'grip' : 'pick'}
                  aria-label={end
                    ? `Drag the ${end === 'upper' ? 'top' : 'bottom'} of the band`
                    : `Bring the band to ${stop.name}`}
                  title={end
                    ? `Drag to move the ${end === 'upper' ? 'top' : 'bottom'} of the band`
                    : `Bring the nearer end of the band to ${stop.name}`}
                  onPointerDown={onRowDown(stop)}
                  onClick={(e) => {
                    // Keyboard only. A pointer click has already been served by
                    // the press above, and serving it twice is the bug.
                    if (e.detail !== 0) return;
                    move(grabEnd(range, stop.y), stop.y);
                  }}
                />
              </span>

              {stop.planeId ? (
                <DraftInput
                  className="plain"
                  value={stop.name}
                  valid={(name) => name.trim().length > 0}
                  onCommit={(name) => dispatch({
                    kind: 'renamePlane', placeId, poiId, planeId: stop.planeId!, name,
                  })}
                />
              ) : (
                <span className="nm">{stop.name}</span>
              )}

              {stop.planeId ? (
                /*
                  The height goes *inside* the question (R-151), which is what
                  `children` is for: armed, the row reads name / Cut / Keep and
                  the number steps aside. Rendered beside it instead, the two
                  answers were a fifth cell in a four-column row and "Keep"
                  wrapped underneath, where it read as a stray word.
                */
                <ConfirmDelete
                  label={`Delete ${stop.name}`}
                  onConfirm={() => dispatch({
                    kind: 'removePlane', placeId, poiId, planeId: stop.planeId!,
                  })}
                >
                  {/*
                    A height is finished before it is an edit (R-163). Validated
                    on the way out rather than per keystroke: there is no route
                    from 3 to 12 that does not pass through 1, which is a
                    perfectly legal height and would really move the level.
                  */}
                  <DraftInput
                    className="tiny"
                    inputMode="numeric"
                    value={String(stop.y)}
                    valid={(draft) => Number.isInteger(Number.parseInt(draft, 10))}
                    onCommit={(draft) => dispatch({
                      kind: 'movePlane',
                      placeId,
                      poiId,
                      planeId: stop.planeId!,
                      y: Number.parseInt(draft, 10),
                    })}
                  />
                </ConfirmDelete>
              ) : (
                <span className="lbl at">{stop.y}</span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="row">
        <input
          placeholder="level name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
        />
        <input
          className="tiny"
          placeholder="y"
          inputMode="numeric"
          value={y}
          onChange={(e) => setY(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
        />
        <button onClick={add} disabled={!Number.isInteger(Number.parseInt(y, 10))}>
          Add
        </button>
      </div>
    </>
  );
}
