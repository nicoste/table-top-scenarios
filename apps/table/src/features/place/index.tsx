// What the party knows about a place (D-174). Table display only.
//
// Read-only by construction, not by discipline: this component takes no
// `dispatch`, so there is nothing it *could* send. Players do not write notes,
// reorder them, rename the place or delete it — the GM's inspector does all of
// that, and none of it belongs on the shared screen.
//
// Every note here arrived already filtered: `viewFor` strips anything not marked
// visible to the party before it leaves the host (R-85), so a secret is not
// merely unrendered, it was never sent.

import type { PoiWire } from '@tt/protocol';

interface Props {
  place: PoiWire;
  /** What this marker is called, for a subtitle. Cosmetic only (R-82). */
  markerName: string | null;
  onClose: () => void;
}

export function PlaceCard({ place, markerName, onClose }: Props) {
  return (
    <div className="dock">
      <div className="card">
        <h2>{place.name}</h2>
        {markerName && <p className="hint" style={{ margin: '0 0 8px' }}>{markerName}</p>}

        {place.notes.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>
            Nothing is known about this place yet.
          </p>
        ) : (
          <ul className="notes-read">
            {place.notes.map((note) => (
              <li key={note.id}>{note.text}</li>
            ))}
          </ul>
        )}

        <button style={{ marginTop: 10 }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
