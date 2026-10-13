// The confirm step of a move: how they travel, and how long it takes (R-199).
//
// The fourth step of pick / aim / confirm, and a step rather than a dialog
// over the map: the route stays drawn behind it and re-draws as the transport
// changes, because a ship and a walker do not take the same way. What is
// being decided is visible the whole time.
//
// Every mode is listed with its own answer rather than one figure for the
// chosen one. The question a GM is actually asking is *"what is this worth"*,
// and that is a comparison — five days on foot against two by ship is the
// decision, and showing one number at a time hides it.

import type { Route, TravelMode, TravelModeId } from '@tt/domain';
import { daysAcross, routeAcross } from '@tt/domain';
import type { Campaign, Discovery, WorldCell } from '@tt/domain';
import { toGlobal } from '@tt/domain';
import { journeyLength } from '@tt/client-core';
import { Tooltip } from '@tt/ui';

export interface JourneyPanelProps {
  readonly who: string;
  readonly modes: readonly TravelMode[];
  /** The transport being costed. */
  readonly mode: TravelModeId;
  /** Where they stand and where they are going, for costing the other modes. */
  readonly from: WorldCell;
  readonly to: WorldCell;
  readonly campaign: Campaign;
  readonly discovery: Discovery;
  /** The route already drawn, for the mode in hand. */
  readonly route: Route | null;
  onMode: (mode: TravelModeId) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function JourneyPanel({
  who, modes, mode, from, to, campaign, discovery, route, onMode, onConfirm, onCancel,
}: JourneyPanelProps) {
  const start = toGlobal({ cx: from.cx, cz: from.cz }, from.x, from.z);
  const end = toGlobal({ cx: to.cx, cz: to.cz }, to.x, to.z);

  /*
   * Each mode routed on its own, because the cheapest way for a walker is not
   * the cheapest way for a boat — a ship's route is the water the walker
   * cannot cross. Re-costing the walker's line for a ship would report a
   * journey nobody takes. It is one A* per mode on the frame the menu opens,
   * and the menu opens on a click, not on a pointer move (R-198).
   */
  const legs = modes.map((entry) => {
    const found = entry.id === mode
      ? route
      : routeAcross(campaign.world, discovery, entry, start, end);
    return {
      mode: entry,
      days: found ? daysAcross(found, entry, campaign.world.metresPerCell) : null,
    };
  });
  const chosen = legs.find((leg) => leg.mode.id === mode);

  return (
    <div className="card">
      <h2>Journey</h2>
      <p className="hint">Moving {who}.</p>
      <ul className="palette ways">
        {legs.map(({ mode: entry, days }) => (
          <li key={entry.id}>
            <Tooltip
              label={days === null
                ? `${entry.name} cannot make this journey`
                : `${entry.name} — ${entry.kmPerDay} km a day`}
              placement="left"
              stretch
            >
              <button
                className={entry.id === mode ? 'on' : ''}
                onClick={() => onMode(entry.id)}
                aria-pressed={entry.id === mode}
                /* Not disabled: a mode that cannot make *this* journey is
                   still worth seeing in the list, and a GM may want to know
                   it was considered. Picking it simply shows no route. */
              >
                <span className="nm">{entry.name}</span>
                <span className="diff">{days === null ? 'no way' : journeyLength(days)}</span>
              </button>
            </Tooltip>
          </li>
        ))}
      </ul>
      {/* The mode's own name carries the preposition — "On foot", "By ship" —
          so putting another one in front gives "by on foot". */}
      <p className="readout">
        {chosen?.days != null
          ? `${chosen.mode.name} — ${journeyLength(chosen.days)}`
          : 'No way there by this transport.'}
      </p>
      <div className="btn-grid tools">
        <Tooltip label="Send them — Enter" placement="bottom" stretch>
          <button
            className="on"
            onClick={onConfirm}
            disabled={chosen?.days == null}
          >
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
