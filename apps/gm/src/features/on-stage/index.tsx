// Everyone on stage in this map, in one list (R-208): the party — when it is
// in here — and everyone placed from the Tokens Library, each with a number
// the GM types, sorted highest first.
//
// Not an initiative tracker (section 1): nothing rolls, nothing knows whose
// turn it is. A number and a sort, for a fight or anything else that needs
// an order. Per map, so the cellar has its own.
//
// Silver tokens are renamed, hidden, noted and taken away here (R-206);
// party members are picked up for Move and given their sight, as the party
// card used to (R-46, R-188).

import { useState } from 'react';
import type { Intent, SilverTokenWire, TokenTemplateWire } from '@tt/protocol';
import { imageUrl } from '@tt/protocol';
import { inOrder, orderFromJSON, MAX_ORDER, MIN_ORDER } from '@tt/domain';
import { ConfirmDelete, DraftInput, Tooltip } from '@tt/ui';

const GREY = '#858c94';

/** One party member, as the list needs them. */
export interface PartyOnStage {
  readonly id: string;
  readonly name: string;
  readonly colour: string;
  readonly picture: string | null;
  /** Standing in this map, waiting to be placed, or standing outside the table's band. */
  readonly status: 'standing' | 'to place' | 'not on the table';
  /** How far they see, in cubes (R-46). */
  readonly sight: number;
}

interface Props {
  /** Empty when the party is not in this map. */
  party: readonly PartyOnStage[];
  silver: readonly SilverTokenWire[];
  /** This map's numbers, as the save carries them. */
  order: Readonly<Record<string, unknown>>;
  library: readonly TokenTemplateWire[];
  placeId: string;
  poiId: string;
  dispatch: (intent: Intent) => void;
  onPickMember: (memberId: string) => void;
}

type Row =
  | { readonly id: string; readonly kind: 'party'; readonly member: PartyOnStage }
  | { readonly id: string; readonly kind: 'silver'; readonly token: SilverTokenWire };

/**
 * The eye a password field uses to show and hide what is typed (D-311): open
 * while the players may see the token, struck through while it is hidden.
 */
function Eye({ hidden }: { readonly hidden: boolean }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {hidden && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}

/** A whole number in range, or blank for none. */
const isOrder = (draft: string) => {
  const text = draft.trim();
  if (text === '') return true;
  if (!/^-?\d+$/.test(text)) return false;
  const value = Number(text);
  return value >= MIN_ORDER && value <= MAX_ORDER;
};

/** A sight the field will take: whole cubes, none to two hundred (the intent's own bounds). */
const isSight = (draft: string) => /^\d{1,3}$/.test(draft.trim()) && Number(draft) <= 200;

/**
 * The GM's note on a silver token (R-208): written in place, kept on leaving
 * the box or on ⌘/Ctrl + Enter, put back on Escape. A textarea, not a line:
 * "wounded, fleeing, has the key" is a sentence.
 */
function NoteField({ value, name, onCommit, onClose }: {
  value: string;
  name: string;
  onCommit: (note: string) => void;
  /** Leaving the box closes it, whether or not anything was written. */
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <textarea
      className="stage-note"
      value={draft}
      maxLength={500}
      rows={2}
      autoFocus
      placeholder={`A note on ${name} — only you see it`}
      aria-label={`Note on ${name}`}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft.trim() !== value) onCommit(draft); onClose(); }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          const box = e.target as HTMLTextAreaElement;
          setDraft(value);
          // After the revert has rendered, so the blur finds nothing to keep.
          requestAnimationFrame(() => box.blur());
        }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.target as HTMLTextAreaElement).blur();
      }}
    />
  );
}

export function OnStagePanel({ party, silver, order, library, placeId, poiId, dispatch, onPickMember }: Props) {
  /** Whose note is open, if anyone's. */
  const [noting, setNoting] = useState<string | null>(null);
  const where = { placeId, poiId };
  const pictureOf = (templateId: string) => library.find((entry) => entry.id === templateId)?.image ?? null;
  const numbers = orderFromJSON(order);

  const rows = inOrder<Row>([
    ...party.map((member) => ({ id: member.id, kind: 'party' as const, member })),
    ...silver.map((token) => ({ id: token.id, kind: 'silver' as const, token })),
  ], numbers);

  const number = (row: Row, name: string) => (
    <Tooltip label="Order — highest first, blank for none. Yours to set: nothing rolls." placement="left">
      <DraftInput
        className="stage-order"
        aria-label={`${name}'s number`}
        inputMode="numeric"
        placeholder="–"
        value={numbers.has(row.id) ? String(numbers.get(row.id)) : ''}
        valid={isOrder}
        onCommit={(draft) => dispatch({
          kind: 'setOrder', ...where, id: row.id, order: draft.trim() === '' ? null : Number(draft.trim()),
        })}
      />
    </Tooltip>
  );

  return (
    <div className="card on-stage">
      <h2>On stage</h2>
      {rows.length === 0 ? (
        <p className="hint">
          Nobody here yet. Bring the party in, or pick <b>Spawn</b> (key 4) and a
          token from the library, then click floors.
        </p>
      ) : (
        <ul className="stage-list">
          {rows.map((row) => {
            if (row.kind === 'party') {
              const { member } = row;
              return (
                <li key={row.id} className="gold">
                  <div className="stage-row">
                    {number(row, member.name)}
                    <span
                      className="library-card"
                      style={member.picture
                        ? { backgroundImage: `url(${imageUrl(member.picture)})` }
                        : { background: member.colour }}
                    />
                    {/* A click picks them up with Move — the way in for one
                        behind a wall, or not placed yet (R-188). */}
                    <button className="plain stage-name" onClick={() => onPickMember(member.id)}>
                      <span className="nm">{member.name}</span>
                      {member.status !== 'standing' && <span className="where">{member.status}</span>}
                    </button>
                    <Tooltip label={`How far ${member.name} sees, in cubes — 12 is 60 ft`} placement="left">
                      <span className="stage-sight">
                        <span className="lbl">sees</span>
                        <DraftInput
                          className="sight"
                          aria-label={`${member.name}'s sight, in cubes`}
                          inputMode="numeric"
                          value={String(member.sight)}
                          valid={isSight}
                          onCommit={(draft) => dispatch({
                            kind: 'editMember', id: member.id, visionRange: Number(draft.trim()),
                          })}
                        />
                      </span>
                    </Tooltip>
                  </div>
                </li>
              );
            }
            const { token } = row;
            const picture = pictureOf(token.templateId);
            const hidden = token.hidden === true;
            const note = token.note ?? '';
            return (
              <li key={row.id} className={hidden ? 'hidden' : ''}>
                <div className="stage-row">
                  {number(row, token.name)}
                  {/* The card opens the note: the one thing a row has no room for. */}
                  <Tooltip label={note ? 'Edit the note — only you see it' : 'Add a note — only you see it'} placement="left">
                    <button
                      className={`plain library-card note-card${note ? ' noted' : ''}`}
                      aria-label={`Note on ${token.name}`}
                      aria-expanded={noting === row.id}
                      style={picture ? { backgroundImage: `url(${imageUrl(picture)})` } : { background: GREY }}
                      onClick={() => setNoting(noting === row.id ? null : row.id)}
                    />
                  </Tooltip>
                  <DraftInput
                    value={token.name}
                    valid={(name) => name.trim().length > 0}
                    onCommit={(name) => dispatch({ kind: 'renameSilver', ...where, id: token.id, name })}
                  />
                  <ConfirmDelete
                    label={`Take ${token.name} off the map`}
                    confirmLabel="Remove"
                    onConfirm={() => dispatch({ kind: 'removeSilver', ...where, id: token.id })}
                  >
                    {/* Only ever hides more (R-206). */}
                    <Tooltip
                      label={hidden
                        ? 'Hidden from the players — click to let them see it when they can'
                        : 'The players see it when the party can — click to hide it'}
                      placement="left"
                    >
                      <button
                        className={`quiet eye${hidden ? ' off' : ''}`}
                        aria-pressed={hidden}
                        aria-label={hidden ? `Show ${token.name}` : `Hide ${token.name}`}
                        onClick={() => dispatch({ kind: 'hideSilver', ...where, id: token.id, hidden: !hidden })}
                      >
                        <Eye hidden={hidden} />
                      </button>
                    </Tooltip>
                  </ConfirmDelete>
                </div>
                {noting === row.id ? (
                  <NoteField
                    value={note}
                    name={token.name}
                    onCommit={(next) => dispatch({ kind: 'noteSilver', ...where, id: token.id, note: next })}
                    onClose={() => setNoting(null)}
                  />
                ) : note && (
                  <button className="plain stage-note-line" onClick={() => setNoting(row.id)} title="Edit the note">
                    {note}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
