// The level ladder: cutting planes and the band, as one control (R-146, R-161).
//
// The GM's own drawing, and their original brief from R-146 finally built: *"a
// double range slider, where the GM can specify the steps/planes by presetting
// their Y values."* Two selects were the placeholder; this is the thing.
//
// The axis is **evenly spaced, not proportional to height**. Proportional is
// the obvious choice and it is wrong: with Bedrock at -16 and Sky at 32, a roof
// at 3 and a water level at 0 land six percent apart and overlap. Ordinal
// spacing gives every level the same room to be read and clicked, which is what
// a list of levels is for.
//
// It also means a rung cannot be *dragged* to a new height: on an ordinal axis
// there is no answer to "what height did I just drop it at". The number beside
// each name is how a height is set, and it is exact.

import { useState } from 'react';
import type { Intent, MapWire } from '@tt/protocol';
import { MAP_MAX_HEIGHT, MAP_MIN_DEPTH, planeSteps, stepLabel } from '@tt/domain';
import type { LevelRange } from '@tt/domain';
import { ConfirmDelete } from '@tt/ui';

interface Props {
  readonly map: MapWire;
  readonly range: LevelRange;
  readonly placeId: string;
  readonly poiId: string;
  dispatch: (intent: Intent) => void;
}

/** One rung: a height, what it is called, and the plane behind it if any. */
interface Rung {
  readonly y: number;
  readonly name: string;
  /** Absent for the two fixed bounds, and for a band handle left off-step. */
  readonly planeId: string | null;
  readonly fixed: boolean;
}

export function LevelLadder({ map, range, placeId, poiId, dispatch }: Props) {
  const [name, setName] = useState('');
  const [y, setY] = useState('');
  const planes = map.planes ?? [];

  /*
   * Every height the ladder shows, highest first — the bounds, the planes, and
   * wherever the band currently sits.
   *
   * That last one matters: a plane the GM moves or deletes can strand a band
   * off-step, and a ladder that did not show it would be claiming the table is
   * being shown something it is not (R-161). Snapping the band instead would
   * change the party's view unasked.
   */
  const rungs: Rung[] = [...new Set([
    ...planeSteps(planes, MAP_MAX_HEIGHT, MAP_MIN_DEPTH),
    ...planes.map((plane) => plane.y),
    range.lower,
    range.upper,
  ])]
    .sort((a, b) => b - a)
    .map((at) => {
      const plane = planes.find((candidate) => candidate.y === at);
      const bound = stepLabel(at, MAP_MAX_HEIGHT, MAP_MIN_DEPTH);
      return {
        y: at,
        name: bound ?? plane?.name ?? `Level ${at}`,
        planeId: plane?.id ?? null,
        fixed: bound !== null,
      };
    });

  /**
   * Clicking a rung moves the **nearer** handle to it.
   *
   * One gesture for both ends, and no way to invert the band: whichever handle
   * is closer is the one that was meant, and a click below the bottom handle
   * moves the bottom rather than dragging the top past it.
   */
  const setBound = (at: number) => {
    const toLower = Math.abs(at - range.lower);
    const toUpper = Math.abs(at - range.upper);
    const lower = toLower <= toUpper ? at : range.lower;
    const upper = toLower <= toUpper ? range.upper : at;
    dispatch({ kind: 'setRange', placeId, poiId, lower, upper });
  };

  const add = () => {
    const at = Number.parseInt(y, 10);
    if (!Number.isInteger(at)) return;
    dispatch({ kind: 'addPlane', placeId, poiId, name: name.trim(), y: at });
    setName('');
    setY('');
  };

  return (
    <>
      <ul className="ladder">
        {rungs.map((rung, i) => {
          const inBand = rung.y >= range.lower && rung.y <= range.upper;
          const isHandle = rung.y === range.lower || rung.y === range.upper;
          return (
            <li key={rung.y} className={rung.fixed ? 'cap' : ''}>
              {/*
                The axis is drawn per rung as two half-segments, so the band's
                colour starts and stops exactly at a handle rather than at the
                gap between two rows.
              */}
              <span className="rail" aria-hidden>
                <i className={i > 0 && inBand && rung.y !== range.upper ? 'lit' : ''} />
                <i className={i < rungs.length - 1 && inBand && rung.y !== range.lower ? 'lit' : ''} />
                {/*
                  A plain button, not a `Tooltip`: the wrapper that component
                  adds becomes a third row of the rail's grid and pushes the
                  knob half a row below the level it marks. A native `title`
                  costs nothing here and stays where it is put.
                */}
                <button
                  className={`knob${isHandle ? ' handle' : ''}${inBand ? ' in' : ''}`}
                  aria-label={`Cut at ${rung.name}`}
                  title={isHandle
                    ? `The band ${rung.y === range.upper ? 'stops' : 'starts'} here`
                    : `Move the nearer end of the band to ${rung.name}`}
                  onClick={() => setBound(rung.y)}
                />
              </span>

              {rung.fixed || !rung.planeId ? (
                <span className="nm">{rung.name}</span>
              ) : (
                <input
                  value={rung.name}
                  onChange={(e) => dispatch({
                    kind: 'renamePlane', placeId, poiId, planeId: rung.planeId!, name: e.target.value,
                  })}
                />
              )}

              {rung.planeId ? (
                <>
                  <input
                    className="tiny"
                    inputMode="numeric"
                    value={rung.y}
                    onChange={(e) => {
                      const next = Number.parseInt(e.target.value, 10);
                      if (!Number.isInteger(next)) return;
                      dispatch({
                        kind: 'movePlane', placeId, poiId, planeId: rung.planeId!, y: next,
                      });
                    }}
                  />
                  <ConfirmDelete
                    label={`Remove the cut at ${rung.name}`}
                    confirmLabel="Cut"
                    onConfirm={() => dispatch({
                      kind: 'removePlane', placeId, poiId, planeId: rung.planeId!,
                    })}
                  />
                </>
              ) : (
                // A bound, or a band handle the GM left where a plane used to
                // be. Neither has a height to edit or anything to delete.
                <span className="lbl at">{rung.y}</span>
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
