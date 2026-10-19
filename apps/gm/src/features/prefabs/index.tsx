// The Prefabs library (D-321): pieces of map saved once and stamped into any
// map of any campaign. Shown with the Prefabs tool in hand — **Place** picks
// one and clicks floors, **Capture** saves a new one from two corner blocks.
//
// Shared by every campaign, so renaming and deleting are not under undo; a
// placement is, one step each. Deleting a prefab leaves everything placed
// from it: a stamp, not a link.

import { useMemo, useState } from 'react';
import type { Intent, PrefabWire } from '@tt/protocol';
import type { Prefab } from '@tt/domain';
import { searchLibrary, tagsFromText } from '@tt/domain';
import type { Capture, PrefabPlacing } from '@tt/client-core';
import { NO_CAPTURE, captureBox, describeBox, mirrorPlacing, saveIntent, turnPlacing } from '@tt/client-core';
import { Tooltip } from '@tt/ui';

export type PrefabMode = 'place' | 'capture';

interface Props {
  prefabs: readonly PrefabWire[];
  mode: PrefabMode;
  onMode: (mode: PrefabMode) => void;
  placing: PrefabPlacing;
  onPlacing: (next: PrefabPlacing) => void;
  capture: Capture;
  onCapture: (next: Capture) => void;
  /**
   * What the box between the two corners would save, worked out by the
   * caller from the map: how many blocks, or why it cannot be saved.
   */
  captured: Prefab | string | null;
  /** Saved: the caller picks the new one when it arrives. */
  onSaved: () => void;
  placeId: string;
  poiId: string;
  dispatch: (intent: Intent) => void;
}

const sizeOf = (prefab: PrefabWire) => `${prefab.size.x} × ${prefab.size.y} × ${prefab.size.z}`;

export function PrefabsPanel({
  prefabs, mode, onMode, placing, onPlacing, capture, onCapture, captured, onSaved,
  placeId, poiId, dispatch,
}: Props) {
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  /** The prefab whose name and tags are open for editing, if any. */
  const [editing, setEditing] = useState<{ id: string; name: string; tags: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const found = useMemo(() => searchLibrary(prefabs, query), [prefabs, query]);
  const chosen = prefabs.find((prefab) => prefab.id === placing.id) ?? null;

  const save = () => {
    const intent = saveIntent(capture, { name, tags: tagsFromText(tags) }, placeId, poiId);
    if (!intent || typeof captured === 'string') return;
    dispatch(intent);
    setName('');
    setTags('');
    onCapture(NO_CAPTURE);
    onSaved();
  };

  const saveEdit = () => {
    if (!editing) return;
    dispatch({ kind: 'editPrefab', id: editing.id, name: editing.name, tags: [...tagsFromText(editing.tags)] });
    setEditing(null);
  };

  const remove = () => {
    if (!editing) return;
    dispatch({ kind: 'removePrefab', id: editing.id });
    if (placing.id === editing.id) onPlacing({ ...placing, id: null });
    setEditing(null);
    setDeleting(false);
  };

  if (editing) {
    const shown = editing.name.trim() || 'this prefab';
    return (
      <div className="card library">
        <h2>Edit prefab</h2>
        <label className="lbl" htmlFor="prefab-edit-name">Name</label>
        <input
          id="prefab-edit-name"
          value={editing.name}
          maxLength={40}
          autoFocus
          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); }}
        />
        <label className="lbl" htmlFor="prefab-edit-tags">Tags</label>
        <input
          id="prefab-edit-tags"
          value={editing.tags}
          placeholder="trees forest"
          onChange={(e) => setEditing({ ...editing, tags: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); }}
        />
        {deleting ? (
          <div className="warn library-delete">
            <p>
              Delete <b>{shown}</b> from the library? Everything already placed from it
              stays where it is. This cannot be undone.
            </p>
            <div className="btn-grid tools">
              <button className="danger" onClick={remove}>Delete</button>
              <button onClick={() => setDeleting(false)}>Keep</button>
            </div>
          </div>
        ) : (
          <div className="btn-grid tools">
            <button className="on" onClick={saveEdit}>Save</button>
            <button onClick={() => setEditing(null)}>Cancel</button>
            <button className="wide quiet" onClick={() => setDeleting(true)}>Delete from the library…</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card library prefabs">
      <h2>Prefabs</h2>
      <div className="reveal" style={{ marginBottom: 8 }}>
        <Tooltip
          label={prefabs.length === 0 ? 'Nothing saved yet — capture one first' : 'Pick a saved prefab and click where it goes'}
          placement="left"
        >
          <button
            className={mode === 'place' ? 'on' : ''}
            disabled={prefabs.length === 0}
            onClick={() => onMode('place')}
          >
            Place
          </button>
        </Tooltip>
        <Tooltip label="Save a piece of this map: click two corner blocks" placement="left">
          <button className={mode === 'capture' ? 'on' : ''} onClick={() => onMode('capture')}>Capture</button>
        </Tooltip>
      </div>

      {mode === 'capture' ? (
        <>
          {capture.step !== 'done' ? (
            <p className="hint">
              Three clicks: <b>a corner</b> — the outlined cube is in; <b>the opposite
              corner of the area</b>, on that corner&apos;s level; then <b>the top</b> —
              point at the highest block of what you are saving, the top of the tree,
              and click. Hold <b>⇧ shift</b> on the first click to take the block itself
              rather than the cube in front of it. Cut the <b>levels</b> to reach inside
              a building; <b>Escape</b> steps back a click.
            </p>
          ) : typeof captured === 'string' ? (
            <p className="warn">That box cannot be saved: {captured}.</p>
          ) : (
            <>
              {captured && (
                <p className="readout">
                  {describeBox(captureBox(capture, null)!)} · {captured.blocks.size} blocks
                </p>
              )}
              <label className="lbl" htmlFor="prefab-name">Name</label>
              <input
                id="prefab-name"
                value={name}
                maxLength={40}
                placeholder="Watchtower"
                autoFocus
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
              />
              <label className="lbl" htmlFor="prefab-tags">Tags</label>
              <input
                id="prefab-tags"
                value={tags}
                placeholder="towers ruins"
                onChange={(e) => setTags(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
              />
            </>
          )}
          {capture.step !== 'start' && (
            <div className="btn-grid tools" style={{ marginTop: 8 }}>
              {capture.step === 'done' && typeof captured !== 'string' && (
                <button className="on" onClick={save}>Save prefab</button>
              )}
              <button onClick={() => onCapture(NO_CAPTURE)}>Start over</button>
            </div>
          )}
        </>
      ) : (
        <>
          <input
            className="library-search"
            value={query}
            placeholder="Search names and tags…"
            aria-label="Search the prefabs"
            onChange={(e) => setQuery(e.target.value)}
          />
          {prefabs.length === 0 ? (
            <p className="hint">
              Empty so far. Switch to <b>Capture</b> and click two corners around a
              tree, a house or a stretch of corridor — every campaign shares them.
            </p>
          ) : found.length === 0 ? (
            <p className="hint">Nothing matches. Every word has to match a name or a tag.</p>
          ) : (
            <ul className="library-list">
              {found.map((prefab) => (
                <li key={prefab.id} className={prefab.id === placing.id ? 'on' : ''}>
                  <button
                    className="plain library-entry"
                    aria-pressed={prefab.id === placing.id}
                    onClick={() => onPlacing({ ...placing, id: prefab.id === placing.id ? null : prefab.id })}
                  >
                    <span className="library-words">
                      <span className="nm">{prefab.name}</span>
                      <span className="tags">
                        {[sizeOf(prefab), ...prefab.tags].join(' · ')}
                      </span>
                    </span>
                  </button>
                  <button
                    className="quiet"
                    title={`Edit ${prefab.name}`}
                    aria-label={`Edit ${prefab.name}`}
                    onClick={() => { setDeleting(false); setEditing({ id: prefab.id, name: prefab.name, tags: prefab.tags.join(' ') }); }}
                  >
                    ✎
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!chosen && found.length > 0 && (
            <p className="warn prefab-pick">Pick one to place it — a click on the map does nothing until you do.</p>
          )}
          {chosen && (
            <>
              <div className="btn-grid tools" style={{ marginTop: 8 }}>
                <Tooltip label="A quarter turn anticlockwise — Z" placement="bottom" stretch>
                  <button onClick={() => onPlacing(turnPlacing(placing, -1))}>↺ Turn</button>
                </Tooltip>
                <Tooltip label="A quarter turn clockwise — X" placement="bottom" stretch>
                  <button onClick={() => onPlacing(turnPlacing(placing, 1))}>↻ Turn</button>
                </Tooltip>
                <Tooltip label="Flip it left to right — M" placement="bottom" stretch>
                  <button className={placing.mirrored ? 'on' : ''} onClick={() => onPlacing(mirrorPlacing(placing))}>
                    ⇋ Mirror
                  </button>
                </Tooltip>
                <Tooltip label="Empty its whole box first — for a room sunk into rock" placement="bottom" stretch>
                  <button className={placing.clear ? 'on' : ''} onClick={() => onPlacing({ ...placing, clear: !placing.clear })}>
                    ▢ Clear box
                  </button>
                </Tooltip>
              </div>
              <p className="hint">
                Its blocks win over what is there; its air leaves the map alone —
                unless <b>Clear box</b> is on, which empties the whole box first.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
