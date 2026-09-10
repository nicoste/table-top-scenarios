// The Places tool and the POI inspector (R-86, GM console side).

import { useState } from 'react';
import type { CampaignWire, Intent, PoiWire } from '@tt/protocol';
import { Tooltip } from '@tt/ui';

interface ToolProps {
  campaign: CampaignWire;
  markerId: string;
  onMarker: (id: string) => void;
}

/** Which marker a newly placed POI gets. */
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
  poi: PoiWire;
  markers: CampaignWire['markers'];
  dispatch: (intent: Intent) => void;
  onClose: () => void;
}

export function PoiInspector({ poi, markers, dispatch, onClose }: InspectorProps) {
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const addNote = () => {
    const text = draft.trim();
    if (!text) return;
    dispatch({ kind: 'addNote', poiId: poi.id, text });
    setDraft('');
  };

  return (
    <div className="card">
      <h2>Place</h2>

      <input
        value={poi.name}
        onChange={(e) => dispatch({ kind: 'renamePoi', id: poi.id, name: e.target.value })}
      />

      <label className="row" style={{ marginTop: 8 }}>
        <span className="lbl">marker</span>
        <select
          value={poi.markerId}
          onChange={(e) => dispatch({ kind: 'setPoiMarker', id: poi.id, markerId: e.target.value })}
        >
          {markers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>

      <p className="hint">
        at chunk {poi.cell.cx},{poi.cell.cz} · cell {poi.cell.x},{poi.cell.z}
      </p>

      <h2 style={{ marginTop: 12 }}>Notes</h2>
      {poi.notes.length === 0 && <p className="hint">Nothing recorded yet.</p>}
      <ul className="notes">
        {poi.notes.map((note, i) => (
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
                  kind: 'setNoteVisible', poiId: poi.id, noteId: note.id,
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
                kind: 'editNote', poiId: poi.id, noteId: note.id, text: e.target.value,
              })}
            />

            <div className="note-actions">
              <button
                className="quiet"
                disabled={i === 0}
                title="Move up"
                onClick={() => dispatch({ kind: 'moveNote', poiId: poi.id, noteId: note.id, delta: -1 })}
              >↑</button>
              <button
                className="quiet"
                disabled={i === poi.notes.length - 1}
                title="Move down"
                onClick={() => dispatch({ kind: 'moveNote', poiId: poi.id, noteId: note.id, delta: 1 })}
              >↓</button>
              <button
                className="quiet"
                title="Delete note"
                onClick={() => dispatch({ kind: 'removeNote', poiId: poi.id, noteId: note.id })}
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

      <div className="row" style={{ marginTop: 10 }}>
        <button onClick={onClose}>Done</button>
        {confirmDelete ? (
          <>
            <button className="danger" onClick={() => { dispatch({ kind: 'removePoi', id: poi.id }); onClose(); }}>
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
