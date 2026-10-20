// Everyone on stage in this map, in one list (R-208): the party — when it is
// in here — and everyone placed from the Tokens Library, each with a number
// the GM types, sorted highest first.
//
// Not an initiative tracker (section 1): nothing rolls, nothing knows whose
// turn it is. A number and a sort, for a fight or anything else that needs
// an order. Per map, so the cellar has its own.
//
// Silver tokens are renamed, hidden, noted and taken away here (R-206);
// party members are picked up for Play, given their sight, as the party card
// used to (R-46, R-188), and noted (D-315). Anybody may be given a light to
// carry (D-335).

import type { Intent, SilverTokenWire, TokenTemplateWire } from '@tt/protocol';
import { imageUrl } from '@tt/protocol';
import type { CarriedLight } from '@tt/domain';
import { carriedLightFromJSON, inOrder, orderFromJSON, MAX_ORDER, MIN_ORDER } from '@tt/domain';
import { ConfirmDelete, DraftInput, Tooltip } from '@tt/ui';
import { GmNote } from '../note/index.js';
import { CarriedLightLine, FlameButton } from '../carried/index.js';

const GREY = '#858c94';

/** One party member, as the list needs them. */
export interface PartyOnStage {
  readonly id: string;
  readonly name: string;
  readonly colour: string;
  readonly picture: string | null;
  /** How far they see, in cubes (R-46). */
  readonly sight: number;
  /** The GM's note on them, the same in every map (D-315); empty for none. */
  readonly note: string;
  /** The light they carry, the same in every map (D-335), or none. */
  readonly light: CarriedLight | null;
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

/** A chain link: the token's sheet, shown over its picture on hover (D-313). */
function LinkIcon() {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
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

export function OnStagePanel({ party, silver, order, library, placeId, poiId, dispatch, onPickMember }: Props) {
  const where = { placeId, poiId };
  const entryOf = (templateId: string) => library.find((entry) => entry.id === templateId) ?? null;
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
                    {/* A click picks them up with Play — the way in for one
                        behind a wall, or not placed yet (R-188). */}
                    <button className="plain stage-name" onClick={() => onPickMember(member.id)}>
                      {/* The name and nothing beside it (D-318, D-332): a hint here
                          squeezed the name to an ellipsis, and the party card
                          already says who is outside the band or still to place. */}
                      <span className="nm">{member.name}</span>
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
                    <FlameButton
                      light={member.light}
                      name={member.name}
                      onChange={(light) => dispatch({ kind: 'carryLight', id: member.id, light })}
                    />
                  </div>
                  {member.light && (
                    <CarriedLightLine
                      light={member.light}
                      name={member.name}
                      onChange={(light) => dispatch({ kind: 'carryLight', id: member.id, light })}
                    />
                  )}
                  {/* The same note in every map: it is the member's, not this map's (D-315). */}
                  <GmNote
                    note={member.note}
                    name={member.name}
                    onCommit={(note) => dispatch({ kind: 'noteMember', id: member.id, note })}
                  />
                </li>
              );
            }
            const { token } = row;
            const entry = entryOf(token.templateId);
            const picture = entry?.image ?? null;
            const sheet = entry?.url ?? null;
            const hidden = token.hidden === true;
            const note = token.note ?? '';
            const light = token.light ? carriedLightFromJSON(token.light) : null;
            const carry = (next: CarriedLight | null) => dispatch({ kind: 'lightSilver', ...where, id: token.id, light: next });
            const look = picture ? { backgroundImage: `url(${imageUrl(picture)})` } : { background: GREY };
            return (
              <li key={row.id} className={hidden ? 'hidden' : ''}>
                <div className="stage-row">
                  {number(row, token.name)}
                  {/*
                    The picture opens the sheet, when the entry has one (D-313):
                    a link icon over it on hover says so. Without a sheet it is
                    only a picture — nothing to click, nothing promised.
                  */}
                  {sheet ? (
                    <a
                      className="library-card sheet-link"
                      href={sheet}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Open ${entry?.name ?? token.name}'s sheet`}
                      aria-label={`Open ${entry?.name ?? token.name}'s sheet`}
                      style={look}
                    >
                      <span className="link-badge"><LinkIcon /></span>
                    </a>
                  ) : (
                    <span className="library-card" style={look} />
                  )}
                  <DraftInput
                    value={token.name}
                    valid={(name) => name.trim().length > 0}
                    onCommit={(name) => dispatch({ kind: 'renameSilver', ...where, id: token.id, name })}
                  />
                  <FlameButton light={light} name={token.name} onChange={carry} />
                  {/* The eye and the × touch: they are one group of actions. */}
                  <span className="stage-actions">
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
                  </span>
                </div>
                {light && <CarriedLightLine light={light} name={token.name} onChange={carry} />}
                {/*
                  The note, a row of its own across the whole width (D-313):
                  the note itself, or an offer to write one. Click to edit.
                */}
                <GmNote
                  note={note}
                  name={token.name}
                  onCommit={(next) => dispatch({ kind: 'noteSilver', ...where, id: token.id, note: next })}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
