// The Tokens Library (D-307): everyone who is not the party, made once and
// placed as often as the GM likes. Shown with the Spawn tool in hand: choose
// an entry, click floors.
//
// Shared by every campaign, so nothing here is under undo — and deleting an
// entry takes every token placed from it, in every campaign, which is why
// that one asks in words rather than with a bare ×.

import { useMemo, useState } from 'react';
import type { Intent, TokenTemplateWire } from '@tt/protocol';
import { imageUrl } from '@tt/protocol';
import { searchLibrary, tagsFromText } from '@tt/domain';
import type { ImageId, TokenTemplate } from '@tt/domain';
import { uploadPicture } from '@tt/client-core';
import { PictureInput } from '@tt/ui';
import { PictureCrop } from '../picture-crop/index.js';

/** A silver card with no picture is grey (D-307), here as on the table. */
const GREY = '#858c94';

interface Props {
  library: readonly TokenTemplateWire[];
  /** The entry a click on a floor places, if one is chosen. */
  chosen: string | null;
  onChoose: (id: string | null) => void;
  dispatch: (intent: Intent) => void;
}

/** What the editor holds while it is open: a new entry, or one being changed. */
interface Draft {
  readonly id: string | null;
  readonly name: string;
  readonly tags: string;
  readonly image: ImageId | null;
}

export function LibraryPanel({ library, chosen, onChoose, dispatch }: Props) {
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [framing, setFraming] = useState<File | null>(null);
  const [storing, setStoring] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // The wire's entries are the domain's shape; searching is the domain's rule.
  const found = useMemo(
    () => searchLibrary(library as unknown as readonly TokenTemplate[], query),
    [library, query],
  );

  const open = (entry: TokenTemplateWire | null) => {
    setProblem(null);
    setDeleting(false);
    setDraft(entry
      ? { id: entry.id, name: entry.name, tags: entry.tags.join(' '), image: entry.image as ImageId | null }
      : { id: null, name: '', tags: '', image: null });
  };

  const save = () => {
    if (!draft) return;
    const fields = { name: draft.name, tags: [...tagsFromText(draft.tags)], image: draft.image };
    if (draft.id) {
      dispatch({ kind: 'editTemplate', id: draft.id, ...fields });
    } else {
      dispatch({ kind: 'addTemplate', ...fields });
      // The new entry is the one a click places next: that is why it was made.
      onChoose(null);
    }
    setDraft(null);
  };

  const remove = () => {
    if (!draft?.id) return;
    dispatch({ kind: 'removeTemplate', id: draft.id });
    if (chosen === draft.id) onChoose(null);
    setDraft(null);
  };

  const store = async (picture: Blob) => {
    setStoring(true);
    setProblem(null);
    try {
      const image = await uploadPicture(picture);
      setDraft((now) => (now ? { ...now, image } : now));
    } catch {
      setProblem('That picture could not be stored. Try again, or a different file.');
    } finally {
      setStoring(false);
      setFraming(null);
    }
  };

  if (draft) {
    const name = draft.name.trim() || 'New token';
    return (
      <div className="card library">
        <h2>{draft.id ? 'Edit token' : 'New token'}</h2>
        <label className="lbl" htmlFor="lib-name">Name</label>
        <input
          id="lib-name"
          value={draft.name}
          maxLength={40}
          placeholder="Goblin"
          autoFocus
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
        />
        <label className="lbl" htmlFor="lib-tags">Tags</label>
        <input
          id="lib-tags"
          value={draft.tags}
          placeholder="npc saltmarsh"
          onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
        />
        <div className="row library-picture">
          <span className="lbl">Card</span>
          <PictureInput
            src={draft.image ? imageUrl(draft.image) : null}
            fallback={GREY}
            busy={storing}
            label={`Picture for ${name}`}
            onPick={(file) => { setProblem(null); setFraming(file); }}
            onClear={() => setDraft({ ...draft, image: null })}
          />
          <span className="hint grow">Optional: without one the card is grey.</span>
        </div>
        {problem && <p className="warn">{problem}</p>}

        {deleting ? (
          <div className="warn library-delete">
            <p>
              Delete <b>{name}</b>? Every {name} on stage, <b>in every campaign</b>, goes
              with it. This cannot be undone.
            </p>
            <div className="btn-grid tools">
              <button className="danger" onClick={remove}>Delete</button>
              <button onClick={() => setDeleting(false)}>Keep</button>
            </div>
          </div>
        ) : (
          <div className="btn-grid tools">
            <button className="on" onClick={save} disabled={storing}>
              {draft.id ? 'Save' : 'Create'}
            </button>
            <button onClick={() => setDraft(null)}>Cancel</button>
            {draft.id && (
              <button className="wide quiet" onClick={() => setDeleting(true)}>Delete from the library…</button>
            )}
          </div>
        )}

        {framing && (
          <PictureCrop
            file={framing}
            title={`${name}'s card`}
            onCancel={() => setFraming(null)}
            onUse={(picture) => { void store(picture); }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="card library">
      <h2>Tokens Library</h2>
      <input
        className="library-search"
        value={query}
        placeholder="Search names and tags…"
        aria-label="Search the library"
        onChange={(e) => setQuery(e.target.value)}
      />
      {library.length === 0 ? (
        <p className="hint">
          Empty so far. Everyone who is not the party lives here — monsters, a
          bartender, a gate guard — and every campaign shares them.
        </p>
      ) : found.length === 0 ? (
        <p className="hint">Nothing matches. Every word has to match a name or a tag.</p>
      ) : (
        <ul className="library-list">
          {found.map((entry) => (
            <li key={entry.id} className={entry.id === chosen ? 'on' : ''}>
              <button
                className="plain library-entry"
                aria-pressed={entry.id === chosen}
                onClick={() => onChoose(entry.id === chosen ? null : entry.id)}
              >
                <span
                  className="library-card"
                  style={entry.image
                    ? { backgroundImage: `url(${imageUrl(entry.image)})` }
                    : { background: GREY }}
                />
                <span className="library-words">
                  <span className="nm">{entry.name}</span>
                  {entry.tags.length > 0 && <span className="tags">{entry.tags.join(' · ')}</span>}
                </span>
              </button>
              <button
                className="quiet"
                title={`Edit ${entry.name}`}
                aria-label={`Edit ${entry.name}`}
                onClick={() => open(library.find((e) => e.id === entry.id) ?? null)}
              >
                ✎
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <button onClick={() => open(null)}>+ New token</button>
      </div>
    </div>
  );
}
