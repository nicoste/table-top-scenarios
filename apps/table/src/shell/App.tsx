// The table display: the shared screen everyone looks at. Read-only in v0.1 —
// no tools, no campaign list, no secrets (R-94).

import { useEffect, useRef } from 'react';
import { decodeCampaign } from '@tt/protocol';
import type { TableView } from '@tt/protocol';
import { defaultTarget, worldCentre } from '@tt/render';
import { useStage } from '../scene/use-stage.js';

interface Props {
  view: TableView | null;
  status: 'connecting' | 'open' | 'closed';
}

export function App({ view, status }: Props) {
  const { setCanvas, stage } = useStage();
  const openedId = useRef<string | null>(null);
  const panning = useRef<{ x: number; y: number } | null>(null);
  const campaign = view?.campaign ?? null;

  useEffect(() => {
    if (!stage) return;
    if (!campaign) { stage.setCampaign(null); openedId.current = null; return; }
    const decoded = decodeCampaign(campaign);
    const fresh = openedId.current !== campaign.id;
    stage.setCampaign(decoded, fresh);
    if (fresh) {
      stage.setTarget({ ...defaultTarget(worldCentre(decoded.world)), zoom: 34 });
      openedId.current = campaign.id;
    }
  }, [campaign, stage]);

  const waiting = status !== 'open'
    ? { title: status === 'closed' ? 'Disconnected' : 'Connecting…', body: status === 'closed' ? 'Waiting for the host to come back.' : 'Joining the table.' }
    : !campaign
      ? { title: 'Waiting for the GM', body: 'No campaign is open yet.' }
      : null;

  return (
    <>
      <div className="stage">
        <canvas
          ref={setCanvas}
          onPointerDown={(e) => { panning.current = { x: e.clientX, y: e.clientY }; }}
          onPointerMove={(e) => {
            if (!panning.current || !stage) return;
            stage.pan(e.clientX - panning.current.x, e.clientY - panning.current.y);
            panning.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={() => { panning.current = null; }}
          onPointerLeave={() => { panning.current = null; }}
          onWheel={(e) => { e.preventDefault(); stage?.nudgeZoom(e.deltaY > 0 ? 1.12 : 1 / 1.12); }}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      {waiting && (
        <div className="launcher">
          <div className="card"><h1>{waiting.title}</h1><p>{waiting.body}</p></div>
        </div>
      )}

      {!waiting && <div className="badge">{campaign?.name}</div>}
    </>
  );
}
