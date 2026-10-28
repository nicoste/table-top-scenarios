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
import { ColourInput, DraftInput, PictureInput, Tooltip } from '@tt/ui';
import { PictureCrop } from '../picture-crop/index.js';
import { GmNote } from '../note/index.js';

interface Props {
  campaign: CampaignWire;
  placement: PlacementWire | null;
  /** False until some chunk is Known: the party cannot stand in fog (R-131). */
  canPlace: boolean;
  /** The GM's notes on the members, the same ones On stage shows (D-315). */
  notes: MemberNotes;
  dispatch: (intent: Intent) => void;
}

export function PartyPanel({ campaign, placement, canPlace, notes, dispatch }: Props) {
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

      {!canPlace ? (
        <p className="warn">
          Reveal a chunk before placing the party — they cannot stand anywhere they
          have not been.
        </p>
      ) : !placed && (
        <p className="hint">
          Not on the map yet. Pick <b>Travel</b> (key 2) and click a revealed cell —
          the sequence is already waiting for a destination.
        </p>
      )}

      <div className="reveal" style={{ marginBottom: 8 }}>
        <Tooltip label="One pawn for the whole party" placement="left">
          <button
            className={together ? 'on' : ''}
            onClick={() => dispatch({ kind: 'setPartyTogether', together: true })}
          >
            Together
          </button>
        </Tooltip>
        <Tooltip label="A pawn each, to move separately" placement="left">
          <button
            className={!together ? 'on' : ''}
            onClick={() => dispatch({ kind: 'setPartyTogether', together: false })}
          >
            Separated
          </button>
        </Tooltip>
      </div>

      {campaign.party.map((m) => (
        <div className="member" key={m.id}>
          <div className="top">
            {/* No colour dot: the row below shows the colour and the card both. */}
            <DraftInput
              value={m.name}
              valid={(name) => name.trim().length > 0}
              onCommit={(name) => dispatch({ kind: 'editMember', id: m.id, name })}
            />
            <button
              title="Remove"
              disabled={campaign.party.length <= 1}
              onClick={() => dispatch({ kind: 'removeMember', id: m.id })}
            >
              ×
            </button>
          </div>
          <div className="grid">
            {/*
              One row for how their card looks: its colour, and the picture
              that covers it when there is one (R-204). Two rows pushed the
              roster under the address box at six members.
            */}
            <label htmlFor={`c-${m.id}`}>Base color &amp; card</label>
            <div className="card-look">
              {/* One edit per choice, not one per frame of the drag (R-163). */}
              <ColourInput
                id={`c-${m.id}`}
                value={m.colour}
                onCommit={(colour) => dispatch({ kind: 'editMember', id: m.id, colour })}
              />
              {/* Optional: without one the card is their colour. */}
              <PictureInput
                src={m.image ? imageUrl(m.image) : null}
                fallback={m.colour}
                busy={busy === m.id}
                label={`Picture for ${m.name}`}
                onPick={(file) => { setProblem(null); setFraming({ memberId: m.id, name: m.name, file }); }}
                onClear={() => dispatch({ kind: 'editMember', id: m.id, image: null })}
              />
            </div>
          </div>
          {/* Across maps, so here on the world as well as On stage in a map. */}
          <GmNote
            note={notes.get(m.id) ?? ''}
            name={m.name}
            onCommit={(note) => dispatch({ kind: 'noteMember', id: m.id, note })}
          />
        </div>
      ))}
      {problem && <p className="warn">{problem}</p>}
      {framing && (
        <PictureCrop
          file={framing.file}
          title={`${framing.name}'s card`}
          onCancel={() => setFraming(null)}
          onUse={(picture) => { void store(framing.memberId, picture); }}
        />
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <button onClick={() => dispatch({ kind: 'addMember' })}>+ member</button>
      </div>
    </div>
  );
}
