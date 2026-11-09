// The opening screen: a campaign list, or a single create affordance (R-92).

import { useState } from 'react';
import type { CampaignSummary, Intent } from '@tt/protocol';
import { BrandLogo, Tooltip } from '@tt/ui';

export interface LauncherDioramaInfo {
  readonly step: number;
  readonly total: number;
  readonly phase: 'build' | 'undo';
  readonly title: string;
}

interface Props {
  campaigns: readonly CampaignSummary[];
  dispatch: (intent: Intent) => void;
  diorama?: LauncherDioramaInfo;
}

export function Launcher({ campaigns, dispatch, diorama }: Props) {
  const [name, setName] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    dispatch({ kind: 'createCampaign', name: trimmed });
    setName('');
  };

  const statusBadge = diorama
    ? `${diorama.phase === 'build' ? 'Step' : 'Undo'} ${diorama.step}/${diorama.total}`
    : undefined;

  return (
    <div className="launcher">
      <div className="card">
        <div className="launcher-brand">
          <BrandLogo subtitle="GM Console" statusLabel={statusBadge} />
          {diorama && (
            <div className="diorama-status" aria-live="polite">
              <div className="diorama-pips" aria-hidden="true">
                {Array.from({ length: diorama.total }, (_, i) => {
                  const index = i + 1;
                  const lit = index <= diorama.step;
                  const current = index === diorama.step;
                  return (
                    <span
                      key={index}
                      className={`diorama-pip${lit ? ' lit' : ''}${current ? ' current' : ''}`}
                    />
                  );
                })}
              </div>
              <span className="diorama-caption">
                {diorama.phase === 'build' ? 'Building' : 'Undoing'}: {diorama.title}
              </span>
            </div>
          )}
        </div>
        <p className="launcher-lead">
          {campaigns.length === 0 ? 'No campaigns yet.' : 'Pick a campaign, or start another.'}
        </p>

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
                        cannot read the disk to copy something closed (R-97).

                        Open comes first and Delete is the quiet one: the common
                        action should be the one the pointer reaches, and the
                        destructive one should not sit where a mis-aimed click
                        lands (D-173). */}
                    <button onClick={() => dispatch({ kind: 'openCampaign', id: c.id })}>Open</button>
                    <Tooltip label={`Delete “${c.name}”`} placement="top">
                      <button className="quiet danger-trigger" onClick={() => setConfirming(c.id)}>Delete</button>
                    </Tooltip>
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
