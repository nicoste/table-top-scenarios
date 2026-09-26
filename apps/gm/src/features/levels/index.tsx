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
//
// It looks right now and still behaves oddly, so every step of every gesture
// traces itself (see `trace.ts`). The band is not local state: a handle moves
// only when the host answers, so the trace prints what was asked, what came
// back, how long it took, and says so plainly when nothing came back at all.

import { useEffect, useRef, useState } from 'react';
import type { Intent, MapWire } from '@tt/protocol';
import { MAP_MAX_HEIGHT, MAP_MIN_DEPTH, planeSteps, stepLabel } from '@tt/domain';
import type { LevelRange } from '@tt/domain';
import { ConfirmDelete } from '@tt/ui';
import { trace } from '../../trace.js';

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

/** What was last asked of the host, so the answer can be timed and checked. */
interface Asked {
  readonly what: string;
  readonly at: number;
  readonly want: string | null;
}

const band = (range: LevelRange) => `${range.lower} → ${range.upper}`;

/** How long to wait before saying an intent went unanswered. */
const ANSWER_BY = 500;

export function LevelLadder({ map, range, placeId, poiId, dispatch }: Props) {
  const [name, setName] = useState('');
  const [y, setY] = useState('');
  /** Which end is being dragged, and where it has got to. */
  const drag = useRef<
    { end: 'lower' | 'upper'; at: number; from: LevelRange; steps: number } | null
  >(null);
  const list = useRef<HTMLUListElement | null>(null);
  const asked = useRef<Asked | null>(null);
  /** When the last drag ended — a click arriving just after one is a suspect. */
  const dragEndedAt = useRef(0);

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

  const ladder = stops.map((stop) => `${stop.name} @ ${stop.y}`);
  const ladderKey = ladder.join(' | ');

  /* The state on arrival, and after that only what changes. */
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    trace('ladder', 'open', { poi: poiId, band: band(range), levels: ladder });
  });

  /**
   * The answer to whatever was last asked — or a change nobody asked for.
   *
   * One edit can change both halves: cutting a level settles the band onto
   * another, so two answers arrive in one commit and only the first has an ask
   * to match. A change arriving on its own with nothing pending is a different
   * thing entirely — undo, another console, a repair on open — and worth
   * saying out loud.
   */
  const lastAnswer = useRef(0);
  const answered = (what: string, got: string) => {
    const want = asked.current;
    const alongside = performance.now() - lastAnswer.current < 5;
    asked.current = null;
    lastAnswer.current = performance.now();
    if (!want) {
      trace('ladder', alongside ? `⇐ ${what}: ${got}` : `⇐ ${what} changed with nothing asked`, { now: got });
      return;
    }
    trace('ladder', `⇐ ${what}: ${got}`, {
      answering: want.what,
      after: `${Math.round(performance.now() - want.at)}ms`,
      ...(want.want && want.want !== got ? { asked_for: want.want, note: 'the host did not give what was asked' } : {}),
    });
  };

  const started = useRef(false);
  useEffect(() => {
    if (!started.current) return;
    answered('band', band(range));
  }, [range.lower, range.upper]);

  useEffect(() => {
    if (!started.current) { started.current = true; return; }
    answered('levels', ladderKey);
  }, [ladderKey]);

  /**
   * Asks the host for something and starts the clock on the answer.
   *
   * Nothing here changes state — the ladder draws whatever the last view push
   * said — so an intent the host quietly refuses looks exactly like a gesture
   * that missed. The timer is what tells those two apart.
   */
  const send = (intent: Intent, what: string, want: string | null = null) => {
    const mark: Asked = { what, at: performance.now(), want };
    asked.current = mark;
    trace('ladder', `⇒ ${what}`, intent);
    dispatch(intent);
    window.setTimeout(() => {
      if (asked.current !== mark) return;
      asked.current = null;
      trace('ladder', `⚠ nothing changed after "${what}" — refused, or it was already so`, intent);
    }, ANSWER_BY);
  };

  const move = (end: 'lower' | 'upper', to: number, why: string) => {
    const next = end === 'lower'
      ? { lower: to, upper: range.upper }
      : { lower: range.lower, upper: to };
    if (next.lower === range.lower && next.upper === range.upper) {
      trace('ladder', `${why}: the ${end} end is already at ${to}`, { band: band(range) });
      return;
    }
    send(
      { kind: 'setRange', placeId, poiId, ...next },
      `${why} — ${end} to ${to}`,
      band(next),
    );
  };

  /** Which end a click on this stop should move: whichever is nearer. */
  const nearerEnd = (at: number): 'lower' | 'upper' =>
    (Math.abs(at - range.lower) <= Math.abs(at - range.upper) ? 'lower' : 'upper');

  /**
   * The stop under a pointer, found by hit-testing rows rather than by
   * arithmetic — the rows are the truth about where the stops are drawn.
   */
  const stopUnder = (clientY: number): { y: number; row: number; name: string } | null => {
    const rows = list.current?.children;
    if (!rows || rows.length === 0) return null;
    const found = (row: number) => ({ y: stops[row]!.y, row, name: stops[row]!.name });
    for (let i = 0; i < rows.length; i += 1) {
      const box = rows[i]!.getBoundingClientRect();
      if (clientY >= box.top && clientY <= box.bottom) return found(i);
    }
    // Past either end: clamp to the nearest, so dragging off the top does not
    // simply stop responding.
    const top = rows[0]!.getBoundingClientRect();
    return clientY < top.top ? found(0) : found(rows.length - 1);
  };

  const onHandleDown = (end: 'lower' | 'upper') => (e: React.PointerEvent) => {
    e.preventDefault();
    const at = end === 'lower' ? range.lower : range.upper;
    drag.current = { end, at, from: range, steps: 0 };
    let captured = false;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      captured = true;
    } catch {
      captured = false;
    }
    trace('grip', `down on the ${end === 'upper' ? 'top' : 'bottom'} handle`, {
      at,
      band: band(range),
      pointer: `${e.pointerType} #${e.pointerId}`,
      captured,
      on: (e.target as HTMLElement).className || (e.target as HTMLElement).tagName,
    });
  };

  const onDragMove = (e: React.PointerEvent) => {
    const held = drag.current;
    if (!held) return;
    if (e.buttons === 0) {
      // Nothing is pressed, yet a drag is still running: the release was never
      // seen, and from here the band follows the bare pointer.
      trace('grip', '⚠ moving with no button held — the last release went missing', {
        end: held.end, at: held.at,
      });
    }
    const hit = stopUnder(e.clientY);
    // Only when the pointer crosses into another row: a drag within one row
    // would otherwise send an intent per pixel.
    if (hit === null || hit.y === held.at) return;
    held.steps += 1;
    drag.current = { ...held, at: hit.y };
    trace('grip', `drag: ${held.end} crosses into ${hit.name} (${hit.y})`, {
      row: hit.row, at: Math.round(e.clientY), steps: held.steps,
    });
    move(held.end, hit.y, 'drag');
  };

  const endDrag = (how: string) => (e: React.PointerEvent) => {
    const held = drag.current;
    drag.current = null;
    if (!held) {
      trace('grip', `${how} with no drag running`, {
        on: (e.target as HTMLElement).className || (e.target as HTMLElement).tagName,
      });
      return;
    }
    dragEndedAt.current = performance.now();
    trace('grip', `${how} — the ${held.end} end let go at ${held.at}`, {
      steps: held.steps,
      started: band(held.from),
      drawn: band(range),
      on: (e.target as HTMLElement).className || (e.target as HTMLElement).tagName,
    });
  };

  /**
   * Every click in the ladder, before the button that owns it runs.
   *
   * A click fires on release, and a drag ends in a release — so a click landing
   * here right after a drag is a second gesture the GM did not make. Whether
   * that happens is exactly the sort of thing that cannot be seen from outside.
   */
  const onAnyClick = (e: React.MouseEvent) => {
    const since = dragEndedAt.current ? performance.now() - dragEndedAt.current : null;
    trace('ladder', 'click', {
      on: (e.target as HTMLElement).className || (e.target as HTMLElement).tagName,
      ...(since === null
        ? { after_a_drag: 'no drag yet' }
        : { after_a_drag: `${Math.round(since)}ms ago`, ...(since < 400 ? { suspect: 'this click follows a drag' } : {}) }),
    });
  };

  const add = () => {
    const at = Number.parseInt(y, 10);
    if (!Number.isInteger(at)) {
      trace('level', `"${y}" is not a height`, { name });
      return;
    }
    send({ kind: 'addPlane', placeId, poiId, name: name.trim(), y: at }, `add ${name.trim() || `Level ${at}`} at ${at}`);
    setName('');
    setY('');
  };

  return (
    <>
      <ul
        className="ladder"
        ref={list}
        onPointerMove={onDragMove}
        onPointerUp={endDrag('up')}
        onPointerCancel={endDrag('cancelled')}
        onClickCapture={onAnyClick}
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
                {end ? (
                  <button
                    className="grip"
                    aria-label={`Drag the ${end === 'upper' ? 'top' : 'bottom'} of the band`}
                    title={`Drag to move the ${end === 'upper' ? 'top' : 'bottom'} of the band`}
                    onPointerDown={onHandleDown(end)}
                  />
                ) : (
                  <button
                    className="pick"
                    aria-label={`Bring the band to ${stop.name}`}
                    title={`Bring the nearer end of the band to ${stop.name}`}
                    onClick={() => {
                      const which = nearerEnd(stop.y);
                      trace('ladder', `tap on ${stop.name} (${stop.y})`, {
                        band: band(range),
                        nearer: which,
                        away: { lower: Math.abs(stop.y - range.lower), upper: Math.abs(stop.y - range.upper) },
                      });
                      move(which, stop.y, `tap ${stop.name}`);
                    }}
                  />
                )}
              </span>

              {stop.planeId ? (
                <input
                  className="plain"
                  value={stop.name}
                  onChange={(e) => send(
                    {
                      kind: 'renamePlane', placeId, poiId, planeId: stop.planeId!, name: e.target.value,
                    },
                    `rename ${stop.name} to "${e.target.value}"`,
                  )}
                />
              ) : (
                <span className="nm">{stop.name}</span>
              )}

              {stop.planeId ? (
                <>
                  <input
                    className="tiny"
                    inputMode="numeric"
                    value={stop.y}
                    onChange={(e) => {
                      const next = Number.parseInt(e.target.value, 10);
                      if (!Number.isInteger(next)) {
                        trace('level', `height "${e.target.value}" ignored — not a number`, { plane: stop.name });
                        return;
                      }
                      send(
                        { kind: 'movePlane', placeId, poiId, planeId: stop.planeId!, y: next },
                        `move ${stop.name} to ${next}`,
                      );
                    }}
                  />
                  <ConfirmDelete
                    label={`Remove ${stop.name}`}
                    confirmLabel="Cut"
                    onConfirm={() => send(
                      { kind: 'removePlane', placeId, poiId, planeId: stop.planeId! },
                      `cut ${stop.name}`,
                    )}
                  />
                </>
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
