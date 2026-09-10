// The table display: the shared screen everyone looks at. No tools, no campaign
// list, no secrets (R-94).
//
// It has exactly **one** interaction: moving the party's own pawns (R-134,
// D-152). There is no tool to select because there is nothing else here to
// click. It does not grow a palette, a dock, or a roster.

import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeCampaign, decodePlacement } from '@tt/protocol';
import { CHUNK_SIZE } from '@tt/domain';
import type { Intent, TableView } from '@tt/protocol';
import type { Travel } from '@tt/client-core';
import { idle, pick, aim, travelIntent, travelPrompt } from '@tt/client-core';
import { defaultTarget, worldCentre } from '@tt/render';
import { useStage } from '../scene/use-stage.js';

interface Props {
  view: TableView | null;
  status: 'connecting' | 'open' | 'closed';
  rejection: string | null;
  dispatch: (intent: Intent) => void;
}

/** Pointer travel, in px, under which a press counts as a click and not a pan. */
const CLICK_SLOP = 4;

export function App({ view, status, rejection, dispatch }: Props) {
  const { setCanvas, stage } = useStage();
  const openedId = useRef<string | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [travel, setTravel] = useState<Travel>(idle);
  const campaign = view?.campaign ?? null;
  const placementWire = view?.placement ?? null;

  const nameOf = useCallback(
    (id: string) => campaign?.party.find((m) => m.id === id)?.name ?? null,
    [campaign],
  );

  useEffect(() => {
    if (!stage) return;
    if (!campaign) { stage.setCampaign(null); openedId.current = null; return; }
    const decoded = decodeCampaign(campaign);
    const fresh = openedId.current !== campaign.id;
    stage.setCampaign(decoded, fresh);
    // Chunks the party has not been shown arrive as coordinates only (R-16) and
    // are drawn as featureless placeholders.
    stage.setFogChunks(campaign.world.unknownChunks);
    if (fresh) {
      // A table that has been shown nothing yet has no known chunks to centre
      // on, so fall back to the placeholders.
      const placeholders = campaign.world.unknownChunks;
      const centre = decoded.world.chunks.size > 0 || placeholders.length === 0
        ? worldCentre(decoded.world)
        : {
          x: (placeholders.reduce((sum, c) => sum + c.cx, 0) / placeholders.length + 0.5) * CHUNK_SIZE,
          y: 0,
          z: (placeholders.reduce((sum, c) => sum + c.cz, 0) / placeholders.length + 0.5) * CHUNK_SIZE,
        };
      stage.setTarget({ ...defaultTarget(centre), zoom: 34 });
      openedId.current = campaign.id;
    }
  }, [campaign, stage]);

  // Pawns move far more often than the world changes, so they ride their own
  // effect rather than forcing terrain to rebuild (R-19a).
  useEffect(() => {
    stage?.setPlacement(placementWire ? decodePlacement(placementWire) : null);
  }, [placementWire, stage]);

  useEffect(() => {
    stage?.aimAt(travel.step === 'aiming' ? travel.at : null);
  }, [travel, stage]);

  // Escape cancels, wherever the pointer is (R-132).
  useEffect(() => {
    if (travel.step !== 'aiming') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Escape') setTravel(idle);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [travel.step]);

  const onPointerMove = (event: React.PointerEvent) => {
    if (drag.current) {
      const dx = event.clientX - drag.current.x;
      const dy = event.clientY - drag.current.y;
      if (Math.abs(dx) > CLICK_SLOP || Math.abs(dy) > CLICK_SLOP) drag.current.moved = true;
      if (drag.current.moved && stage) {
        stage.pan(dx, dy);
        drag.current = { x: event.clientX, y: event.clientY, moved: true };
      }
      return;
    }
    if (travel.step !== 'aiming' || !stage) return;
    const hit = stage.pick(event.clientX, event.clientY);
    setTravel((current) => aim(current, hit.column));
  };

  const onClick = (event: React.PointerEvent) => {
    if (!stage) return;
    const hit = stage.pick(event.clientX, event.clientY);

    if (travel.step === 'aiming') {
      // Second click confirms. Anything that is not a cell cancels, rather than
      // silently doing nothing.
      if (hit.column) dispatch(travelIntent(travel.pawn, hit.column));
      setTravel(idle);
      return;
    }
    if (hit.pawn) setTravel(pick(hit.pawn));
  };

  const waiting = status !== 'open'
    ? { title: status === 'closed' ? 'Disconnected' : 'Connecting…', body: status === 'closed' ? 'Waiting for the host to come back.' : 'Joining the table.' }
    : !campaign
      ? { title: 'Waiting for the GM', body: 'No campaign is open yet.' }
      : null;

  const prompt = travelPrompt(travel, nameOf);

  return (
    <>
      <div className="stage">
        <canvas
          ref={setCanvas}
          onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, moved: false }; }}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => {
            const dragged = drag.current?.moved ?? true;
            drag.current = null;
            if (!dragged) onClick(e);
          }}
          onPointerLeave={() => { drag.current = null; }}
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
      {!waiting && prompt && <div className="hints">{prompt}</div>}
      {rejection && <div className="toast">{rejection}</div>}
    </>
  );
}
