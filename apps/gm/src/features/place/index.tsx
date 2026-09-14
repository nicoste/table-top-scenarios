// The Places tool and the place inspector (R-86, GM console side).

import { useState } from 'react';
import type { CampaignWire, Intent, PlaceWire } from '@tt/protocol';
import { Tooltip } from '@tt/ui';

interface ToolProps {
  campaign: CampaignWire;
  markerId: string;
  onMarker: (id: string) => void;
}

/** Which marker a newly placed place gets. */
export function PlacesPanel({ campaign, markerId, onMarker }: ToolProps) {
  return (
    <div className="card">
      <h2>Marker</h2>
      <ul className="palette">
        {campaign.markers.map((m) => (
          <li key={m.id}>
            <Tooltip label={`${m.name} — cosmetic only`} placement="right" stretch>
              <button
                className={m.id === markerId ? 'on' : ''}
                onClick={() => onMarker(m.id)}
                aria-pressed={m.id === markerId}
              >
                <span className="nm">{m.name}</span>
              </button>
            </Tooltip>
          </li>
        ))}
      </ul>
      <p className="hint">Click an empty cell to place. Click a marker to edit it.</p>
    </div>
  );
}

interface InspectorProps {
  place: PlaceWire;
  markers: CampaignWire['markers'];
  revealed: boolean;
  chunkKnown: boolean;
  dispatch: (intent: Intent) => void;
  onClose: () => void;
}

export function PlaceInspector({ place, markers, revealed, chunkKnown, dispatch, onClose }: InspectorProps) {
  const [draft, setDraft] = useState('');
  const [poiDraft, setPoiDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const addNote = () => {
    const text = draft.trim();
    if (!text) return;
    dispatch({ kind: 'addNote', placeId: place.id, text });
    setDraft('');
  };

  const addPoi = () => {
    const name = poiDraft.trim();
    if (!name) return;
    dispatch({ kind: 'addPoi', placeId: place.id, name });
    setPoiDraft('');
  };

  return (
    <div className="card">
      <h2>Place</h2>

      <input
        value={place.name}
        onChange={(e) => dispatch({ kind: 'renamePlace', id: place.id, name: e.target.value })}
      />

      <label className="row" style={{ marginTop: 8 }}>
        <span className="lbl">marker</span>
        <select
          value={place.markerId}
          onChange={(e) => dispatch({ kind: 'setPlaceMarker', id: place.id, markerId: e.target.value })}
        >
          {markers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>

      <p className="hint">
        at chunk {place.cell.cx},{place.cell.cz} · cell {place.cell.x},{place.cell.z}
      </p>

      <div className="reveal">
        <Tooltip
          label={revealed ? 'The party knows this place' : 'Hidden from the party'}
          placement="left"
        >
          <button
            className={revealed ? 'on' : ''}
            aria-pressed={revealed}
            onClick={() => dispatch({ kind: 'setPlaceRevealed', placeId: place.id, revealed: !revealed })}
          >
            {revealed ? '👁 Revealed' : '🔒 Hidden'}
          </button>
        </Tooltip>
      </div>

      {/* Revealed alone is not enough: the chunk has to be Known too (D-132).
          Saying so beats the GM wondering why the marker never appeared. */}
      {revealed && !chunkKnown && (
        <p className="warn">
          Still hidden — the chunk it sits in is Unknown.
        </p>
      )}

      <h2 style={{ marginTop: 12 }}>Notes</h2>
      {place.notes.length === 0 && <p className="hint">Nothing recorded yet.</p>}
      <ul className="notes">
        {place.notes.map((note, i) => (
          <li key={note.id}>
            {/*
              The eye is the only thing that decides whether a note reaches the
              table display — everything else here is GM-side (R-85).
            */}
            <Tooltip
              label={note.visibleToParty ? 'Players can read this' : 'GM only'}
              placement="right"
            >
              <button
                className={`quiet eye${note.visibleToParty ? ' shown' : ''}`}
                aria-pressed={note.visibleToParty}
                onClick={() => dispatch({
                  kind: 'setNoteVisible', placeId: place.id, noteId: note.id,
                  visibleToParty: !note.visibleToParty,
                })}
              >
                {note.visibleToParty ? '👁' : '🔒'}
              </button>
            </Tooltip>

            <textarea
              rows={2}
              value={note.text}
              onChange={(e) => dispatch({
                kind: 'editNote', placeId: place.id, noteId: note.id, text: e.target.value,
              })}
            />

            <div className="note-actions">
              <button
                className="quiet"
                disabled={i === 0}
                title="Move up"
                onClick={() => dispatch({ kind: 'moveNote', placeId: place.id, noteId: note.id, delta: -1 })}
              >↑</button>
              <button
                className="quiet"
                disabled={i === place.notes.length - 1}
                title="Move down"
                onClick={() => dispatch({ kind: 'moveNote', placeId: place.id, noteId: note.id, delta: 1 })}
              >↓</button>
              <button
                className="quiet"
                title="Delete note"
                onClick={() => dispatch({ kind: 'removeNote', placeId: place.id, noteId: note.id })}
              >×</button>
            </div>
          </li>
        ))}
      </ul>

      <div className="row">
        <input
          placeholder="Add a note"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addNote(); }}
        />
        <button onClick={addNote} disabled={!draft.trim()}>Add</button>
      </div>

      {/*
        Pois. The same shape as notes on purpose (D-175): ordered, each one
        individually visible, and the eye is again the only thing that decides
        whether it reaches the table (R-85). No map yet — that is O-009, and an
        entry here is the name it will hang off.
      */}
      <h2 style={{ marginTop: 12 }}>Points of interest</h2>
      {place.pois.length === 0 && (
        <p className="hint">None yet — a church, a market, an arena.</p>
      )}
      <ul className="notes">
        {place.pois.map((poi, i) => (
          <li key={poi.id}>
            <Tooltip
              label={poi.visibleToParty ? 'Players can see this' : 'GM only'}
              placement="right"
            >
              <button
                className={`quiet eye${poi.visibleToParty ? ' shown' : ''}`}
                aria-pressed={poi.visibleToParty}
                onClick={() => dispatch({
                  kind: 'setPoiVisible', placeId: place.id, poiId: poi.id,
                  visibleToParty: !poi.visibleToParty,
                })}
              >
                {poi.visibleToParty ? '👁' : '🔒'}
              </button>
            </Tooltip>

            <input
              value={poi.name}
              onChange={(e) => dispatch({
                kind: 'renamePoi', placeId: place.id, poiId: poi.id, name: e.target.value,
              })}
            />

            <div className="note-actions">
              <button
                className="quiet"
                disabled={i === 0}
                title="Move up"
                onClick={() => dispatch({ kind: 'movePoi', placeId: place.id, poiId: poi.id, delta: -1 })}
              >↑</button>
              <button
                className="quiet"
                disabled={i === place.pois.length - 1}
                title="Move down"
                onClick={() => dispatch({ kind: 'movePoi', placeId: place.id, poiId: poi.id, delta: 1 })}
              >↓</button>
              <button
                className="quiet"
                title="Delete point of interest"
                onClick={() => dispatch({ kind: 'removePoi', placeId: place.id, poiId: poi.id })}
              >×</button>
            </div>
          </li>
        ))}
      </ul>

      <div className="row">
        <input
          placeholder="Add a point of interest"
          value={poiDraft}
          onChange={(e) => setPoiDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addPoi(); }}
        />
        <button onClick={addPoi} disabled={!poiDraft.trim()}>Add</button>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <button onClick={onClose}>Done</button>
        {confirmDelete ? (
          <>
            <button className="danger" onClick={() => { dispatch({ kind: 'removePlace', id: place.id }); onClose(); }}>
              Delete place
            </button>
            <button onClick={() => setConfirmDelete(false)}>Keep</button>
          </>
        ) : (
          <button className="quiet" onClick={() => setConfirmDelete(true)}>Delete</button>
        )}
      </div>
    </div>
  );
}
