// The party roster: campaign-level definitions, instanced into poi maps
// later (R-91). Plus where they are standing, which is play state (D-155).
//
// **No vision field here.** It is an poi quantity — 12 cells at the
// poi cell (R-46a) — and beside a 1.5 km world cell it reads as 18 km of
// sight. It stays in the model, unrendered, until pois exist (R-135).

import type { Intent, PlacementWire } from '@tt/protocol';
import type { CampaignWire } from '@tt/protocol';
import { ColourInput, DraftInput, Tooltip } from '@tt/ui';

interface Props {
  campaign: CampaignWire;
  placement: PlacementWire | null;
  /** False until some chunk is Known: the party cannot stand in fog (R-131). */
  canPlace: boolean;
  dispatch: (intent: Intent) => void;
}

export function PartyPanel({ campaign, placement, canPlace, dispatch }: Props) {
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
          Not on the map yet. Pick <b>Travel</b> (key 5) and click a revealed cell —
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
            <span className="dot" style={{ background: m.colour }} />
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
            <label htmlFor={`c-${m.id}`}>colour</label>
            {/* One edit per choice, not one per frame of the drag (R-163). */}
            <ColourInput
              id={`c-${m.id}`}
              value={m.colour}
              onCommit={(colour) => dispatch({ kind: 'editMember', id: m.id, colour })}
            />
          </div>
        </div>
      ))}
      <div className="row" style={{ marginTop: 10 }}>
        <button onClick={() => dispatch({ kind: 'addMember' })}>+ member</button>
      </div>
    </div>
  );
}
