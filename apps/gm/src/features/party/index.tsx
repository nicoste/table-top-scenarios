// The party roster: campaign-level definitions, instanced into poi maps
// later (R-91). Plus where they are standing, which is play state (D-155).
//
// **No vision field here.** It is an poi quantity — 12 cells at the
// poi cell (R-46a) — and beside a 600 m world cell it reads as 7 km of
// sight. It stays in the model, unrendered, until pois exist (R-135).

import { useState } from 'react';
import type { Intent, PlacementWire } from '@tt/protocol';
import type { MemberNotes } from '@tt/domain';
import type { CampaignWire } from '@tt/protocol';
import { imageUrl } from '@tt/protocol';
import { uploadPicture } from '@tt/client-core';
import { ColourInput, ConfirmDelete, DraftInput, PictureInput, Tooltip } from '@tt/ui';
import { PictureCrop } from '../picture-crop/index.js';
import { GmNote } from '../note/index.js';

interface Props {
  campaign: CampaignWire;
  placement: PlacementWire | null;
  /** False until some chunk is Known: the party cannot stand in fog (R-131). */
  canPlace: boolean;
  /** The GM's notes on the members, the same ones On stage shows (D-315). */
  notes: MemberNotes;
  /** When the table is inside a point of interest while the console is on the world (D-381). */
  insidePoi?: {
    readonly placeName: string;
    readonly poiName: string;
    onOpen: () => void;
    onLeave: () => void;
  } | null;
  dispatch: (intent: Intent) => void;
}

export function PartyPanel({ campaign, placement, canPlace, notes, insidePoi = null, dispatch }: Props) {
  /** Whose picture is being stored, if anyone's. */
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** A chosen file waiting for the GM to frame it (R-205). */
  const [framing, setFraming] = useState<{ readonly memberId: string; readonly name: string; readonly file: File } | null>(null);

  /**
   * A framed picture onto a member's card (R-204): stored by the host under
   * its own name, and only then named in an edit — so the edit is the one
   * thing that changes the card.
   */
  const store = async (memberId: string, picture: Blob) => {
    setBusy(memberId);
    setProblem(null);
    try {
      const image = await uploadPicture(picture);
      dispatch({ kind: 'editMember', id: memberId, image });
    } catch {
      setProblem('That picture could not be stored. Try again, or a different file.');
    } finally {
      setBusy(null);
      setFraming(null);
    }
  };
  const together = placement?.together ?? true;
  const placed = Boolean(placement && (placement.at || Object.keys(placement.members).length > 0));

  return (
    <div className="card">
      <h2>Party</h2>

      {insidePoi && (
        <div className="notice">
          <p className="notice-text">
            Table is inside <b>{insidePoi.poiName}</b> ({insidePoi.placeName}).
          </p>
          <div className="btn-grid campaign-actions">
            <Tooltip label="Open the map the table is currently viewing" placement="bottom" stretch>
              <button className="on" onClick={insidePoi.onOpen}>Open map</button>
            </Tooltip>
            <Tooltip label="Send the party back out to the world map" placement="bottom" stretch>
              <button onClick={insidePoi.onLeave}>Bring out</button>
            </Tooltip>
          </div>
        </div>
      )}

      {!canPlace ? (
        <p className="warn">
          Reveal a chunk before placing the party — they cannot stand anywhere they
          have not been.
        </p>
      ) : !placed && (
        <p className="hint" style={{ marginBottom: 8 }}>
          Not on the map yet. Pick <b>Travel</b> (key 2) and click a revealed cell —
          the sequence is already waiting for a destination.
        </p>
      )}

      <div className="reveal" style={{ marginBottom: 8 }}>
        <Tooltip label="One pawn for the whole party" placement="left" stretch>
          <button
            className={together ? 'on' : ''}
            onClick={() => dispatch({ kind: 'setPartyTogether', together: true })}
          >
            Together
          </button>
        </Tooltip>
        <Tooltip label="A pawn each, to move separately" placement="left" stretch>
          <button
            className={!together ? 'on' : ''}
            onClick={() => dispatch({ kind: 'setPartyTogether', together: false })}
          >
            Separated
          </button>
        </Tooltip>
      </div>

      <div className="member-list">
        {campaign.party.map((m) => (
          <div className="member" key={m.id}>
            <div className="top">
              {/*
                One row for who they are and how their card looks (R-204):
                portrait card (with its own corner clear badge), base colour
                swatch, name field, and row remove action. Asking hides the
                whole row, name included, since a name field beside "Remove"
                and "Keep" would be a stub, so the button says whom it removes.
                One branch for any party size: going from one member to two
                never rebuilds a row being typed in.
              */}
              <ConfirmDelete
                label={campaign.party.length > 1 ? `Remove ${m.name}` : 'The party keeps at least one member'}
                confirmLabel={`Remove ${m.name}`}
                disabled={campaign.party.length < 2}
                onConfirm={() => dispatch({ kind: 'removeMember', id: m.id })}
              >
                <PictureInput
                  src={m.image ? imageUrl(m.image) : null}
                  fallback={m.colour}
                  busy={busy === m.id}
                  label={`Picture for ${m.name}`}
                  onPick={(file) => { setProblem(null); setFraming({ memberId: m.id, name: m.name, file }); }}
                  onClear={() => dispatch({ kind: 'editMember', id: m.id, image: null })}
                />
                <Tooltip label={`Base colour for ${m.name}`} placement="bottom">
                  <ColourInput
                    id={`c-${m.id}`}
                    aria-label={`Base colour for ${m.name}`}
                    value={m.colour}
                    onCommit={(colour) => dispatch({ kind: 'editMember', id: m.id, colour })}
                  />
                </Tooltip>
                <DraftInput
                  value={m.name}
                  valid={(name) => name.trim().length > 0}
                  onCommit={(name) => dispatch({ kind: 'editMember', id: m.id, name })}
                />
              </ConfirmDelete>
            </div>
            {/* Across maps, so here on the world as well as On stage in a map. */}
            <GmNote
              note={notes.get(m.id) ?? ''}
              name={m.name}
              onCommit={(note) => dispatch({ kind: 'noteMember', id: m.id, note })}
            />
          </div>
        ))}
      </div>
      {problem && <p className="warn">{problem}</p>}
      {framing && (
        <PictureCrop
          file={framing.file}
          title={`${framing.name}'s card`}
          onCancel={() => setFraming(null)}
          onUse={(picture) => { void store(framing.memberId, picture); }}
        />
      )}
      <div className="btn-grid" style={{ marginTop: 8 }}>
        <button className="wide" onClick={() => dispatch({ kind: 'addMember' })}>+ Member</button>
      </div>
    </div>
  );
}
