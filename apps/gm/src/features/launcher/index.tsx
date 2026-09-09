// The opening screen: a campaign list, or a single create affordance (R-92).

import { useState } from 'react';
import type { CampaignSummary, Intent } from '@tt/protocol';
import { Tooltip } from '@tt/ui';

interface Props {
  campaigns: readonly CampaignSummary[];
  dispatch: (intent: Intent) => void;
}

export function Launcher({ campaigns, dispatch }: Props) {
  const [name, setName] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    dispatch({ kind: 'createCampaign', name: trimmed });
    setName('');
  };

  return (
    <div className="launcher">
      <div className="card">
        <h1>Table Top Scenarios</h1>
        <p>{campaigns.length === 0 ? 'No campaigns yet.' : 'Pick a campaign, or start another.'}</p>

        {campaigns.length > 0 && (
          <ul>
            {campaigns.map((c) => (
              <li key={c.id}>
                {confirming === c.id ? (
                  <>
                    <span className="nm danger">Delete “{c.name}”?</span>
                    <button className="danger" onClick={() => { dispatch({ kind: 'deleteCampaign', id: c.id }); setConfirming(null); }}>
                      Delete
                    </button>
                    <button onClick={() => setConfirming(null)}>Keep</button>
                  </>
                ) : (
                  <>
                    <span className="nm">{c.name}</span>
                    {/* Duplicate lives in the open campaign, not here — sim
                        cannot read the disk to copy something closed (R-97). */}
                    <Tooltip label={`Delete “${c.name}”`} placement="top">
                      <button className="quiet" onClick={() => setConfirming(c.id)}>×</button>
                    </Tooltip>
                    <button onClick={() => dispatch({ kind: 'openCampaign', id: c.id })}>Open</button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="row">
          <input
            placeholder="Campaign name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
          />
          <button onClick={create} disabled={!name.trim()}>Create</button>
        </div>
      </div>
    </div>
  );
}
