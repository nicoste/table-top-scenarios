// The travel tool's panel (R-199, R-200): what the party can travel by, and —
// once a destination is aimed at — what that journey costs.
//
// **One card, because it is one question asked in two halves.** The
// conveyances are the constant: they are a fact about the party, chosen when
// the tool is picked up like every other tool's options. The journey appears
// under them when there is one, and the pickers stay live beneath it, because
// the route and the days recompute as they change — *"what if we had a boat"*
// is exactly the question a GM asks while looking at four days on foot
// (D-300).
//
// It was two cards for a day, "Travelling by" and "Journey", which put a
// heading between a question and its answer.

import type { Medium, Route, TravelMode, TravelModeId, Travelling } from '@tt/domain';
import { journeyLength } from '@tt/client-core';
import { Tooltip } from '@tt/ui';

/** The journey being costed, or null when the party is not going anywhere. */
export interface Journey {
  readonly who: string;
  /** The route previewed, or null when there is no way there. */
  readonly route: Route | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export interface TravelPanelProps {
  readonly modes: readonly TravelMode[];
  readonly travelling: Travelling;
  readonly journey: Journey | null;
  onTravelling: (travelling: Travelling) => void;
}

const GROUPS: readonly {
  readonly medium: Medium;
  readonly title: string;
  readonly none: string;
}[] = [
  { medium: 'land', title: 'On land', none: 'Cannot cross land' },
  { medium: 'water', title: 'On water', none: 'Cannot cross water' },
  { medium: 'air', title: 'In the air', none: 'Cannot fly' },
];

export function TravelPanel({ modes, travelling, journey, onTravelling }: TravelPanelProps) {
  const nameOf = (id: string) => modes.find((mode) => mode.id === id)?.name ?? 'somehow';
  // One leg is the whole journey, and repeating it under the total is noise.
  const legs = journey?.route && journey.route.legs.length > 1 ? journey.route.legs : [];

  return (
    <div className="card">
      <h2>Travel</h2>

      {/*
        A dropdown a medium, not a list of every conveyance in the game
        (D-301). Fifteen rows to say three things pushed the answer below the
        fold, and what a GM needs to see at rest is *what the party has* —
        which is exactly the one row a closed select shows.

        The native control, like the place inspector's marker picker: the
        shell already styles `select`, it collapses on its own, and it is
        keyboard- and screen-reader-correct for nothing.
      */}
      {GROUPS.map(({ medium, title, none }) => {
        const chosen = travelling[medium];
        return (
          <label className="row way-row" key={medium}>
            <span className="lbl">{title}</span>
            <select
              value={chosen ?? ''}
              aria-label={title}
              onChange={(e) => onTravelling({
                ...travelling,
                [medium]: e.target.value === '' ? null : (e.target.value as TravelModeId),
              })}
            >
              {/* `None` is a choice and not an absence: no boat is the fact
                  that decides where the party can go. */}
              <option value="">{none}</option>
              {/*
                Slowest first, after `None` (D-302). A **sort in the panel**,
                not a reorder of the registry: those ids are append-only and
                saved worlds reference them, so the order they were added in
                is not the order they are read in (R-11).
              */}
              {modes
                .filter((mode) => mode.medium === medium)
                .slice()
                .sort((a, b) => a.kmPerDay - b.kmPerDay)
                .map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.name} · {mode.kmPerDay} km
                </option>
                ))}
            </select>
          </label>
        );
      })}

      {journey ? (
        <div className="journey">
          <p className="lbl">Moving {journey.who}</p>
          {journey.route ? (
            <>
              <p className="readout">{journeyLength(journey.route.days)}</p>
              {legs.length > 0 && (
                <ul className="palette ways">
                  {legs.map((leg) => (
                    <li key={leg.mode}>
                      <button className="plain" disabled>
                        <span className="nm">{nameOf(leg.mode)}</span>
                        <span className="diff">{journeyLength(leg.days)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="readout">
              No way there with what they have. Give them something for the
              water, or go round.
            </p>
          )}
          <div className="btn-grid tools">
            <Tooltip label="Send them" placement="bottom" stretch>
              <button className="on" onClick={journey.onConfirm} disabled={journey.route === null}>
                ✓ Travel
              </button>
            </Tooltip>
            <Tooltip label="Never mind — Escape" placement="bottom" stretch>
              <button onClick={journey.onCancel}>✕ Cancel</button>
            </Tooltip>
          </div>
        </div>
      ) : (
        <p className="hint">
          The party uses whichever of these suits the ground under them, so
          walking to a coast and sailing from it is <b>one journey</b>. With
          nothing on the water, a river is a wall.
        </p>
      )}
    </div>
  );
}
