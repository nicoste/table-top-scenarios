// The party roster: campaign-level definitions, instanced into encounter maps
// later (R-91).

import type { Intent } from '@tt/protocol';
import type { CampaignWire } from '@tt/protocol';

interface Props {
  campaign: CampaignWire;
  dispatch: (intent: Intent) => void;
}

export function PartyPanel({ campaign, dispatch }: Props) {
  return (
    <div className="card">
      <h2>Party</h2>
      {campaign.party.map((m) => (
        <div className="member" key={m.id}>
          <div className="top">
            <span className="dot" style={{ background: m.colour }} />
            <input
              value={m.name}
              onChange={(e) => dispatch({ kind: 'editMember', id: m.id, name: e.target.value })}
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
            <input
              id={`c-${m.id}`}
              type="color"
              value={m.colour}
              onChange={(e) => dispatch({ kind: 'editMember', id: m.id, colour: e.target.value })}
            />
            <label htmlFor={`v-${m.id}`}>vision</label>
            <input
              id={`v-${m.id}`}
              type="number"
              min={0}
              max={200}
              value={m.visionRange}
              onChange={(e) => dispatch({ kind: 'editMember', id: m.id, visionRange: Number(e.target.value) })}
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
