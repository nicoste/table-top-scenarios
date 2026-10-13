// The confirm step of a move: how long it takes, and go or not (R-199).
//
// It used to ask which transport, which is now asked when the tool is picked
// up (R-200) — so what is left is the answer: the journey, how the days were
// spent, and two buttons. The route stays drawn behind it.
//
// **The legs are the interesting line.** A journey that walks to a coast and
// sails from it is one move now, and "4.2 days" alone would hide that half of
// it was on the water. Saying where the time went is what makes a mixed
// journey legible.

import type { Route, TravelMode } from '@tt/domain';
import { journeyLength } from '@tt/client-core';
import { Tooltip } from '@tt/ui';

export interface JourneyPanelProps {
  readonly who: string;
  readonly modes: readonly TravelMode[];
  /** The route being previewed, or null when there is no way there. */
  readonly route: Route | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function JourneyPanel({ who, modes, route, onConfirm, onCancel }: JourneyPanelProps) {
  const nameOf = (id: string) => modes.find((mode) => mode.id === id)?.name ?? 'somehow';
  // One leg is the whole journey, and repeating it under the total is noise.
  const legs = route && route.legs.length > 1 ? route.legs : [];

  return (
    <div className="card">
      <h2>Journey</h2>
      <p className="hint">Moving {who}.</p>
      {route ? (
        <>
          <p className="readout">{journeyLength(route.days)}</p>
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
          No way there with what they have. Give them something for the water,
          or go round.
        </p>
      )}
      <div className="btn-grid tools">
        <Tooltip label="Send them" placement="bottom" stretch>
          <button className="on" onClick={onConfirm} disabled={route === null}>
            ✓ Travel
          </button>
        </Tooltip>
        <Tooltip label="Never mind — Escape" placement="bottom" stretch>
          <button onClick={onCancel}>✕ Cancel</button>
        </Tooltip>
      </div>
    </div>
  );
}
