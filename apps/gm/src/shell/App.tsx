// The GM console shell: launcher until a campaign is open, then the world.

import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeCampaign } from '@tt/protocol';
import { CHUNK_SIZE, MAX_HEIGHT, clampBrush, creatableSlots } from '@tt/domain';
import type { GmView, Intent } from '@tt/protocol';
import { defaultTarget, worldCentre } from '@tt/render';
import type { Tool } from '@tt/client-core';
import { useStage } from '../scene/use-stage.js';
import { Launcher } from '../features/launcher/index.js';
import { BuildWorldPanel } from '../features/build-world/index.js';
import { PartyPanel } from '../features/party/index.js';
import { PlacesPanel, PoiInspector } from '../features/poi/index.js';
import { ConnectBadge } from '../features/connect/index.js';
import { Tooltip } from '@tt/ui';

interface Props {
  view: GmView | null;
  status: 'connecting' | 'open' | 'closed';
  rejection: string | null;
  dispatch: (intent: Intent) => void;
}

export function App({ view, status, rejection, dispatch }: Props) {
  const [tool, setTool] = useState<Tool>('select');
  const [terrainId, setTerrainId] = useState('terrain:grass');
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  const [brush, setBrush] = useState(1);
  const [markerId, setMarkerId] = useState('marker:village');
  const [selectedPoi, setSelectedPoi] = useState<string | null>(null);
  /**
   * The cell a POI was just placed on, waiting for the snapshot that will carry
   * it. The host assigns the id, so the client cannot know it in advance — but
   * one POI per cell (R-119) makes the cell an unambiguous handle until then.
   */
  const pendingPoiCell = useRef<string | null>(null);
  const { setCanvas, stage } = useStage();
  const openedId = useRef<string | null>(null);
  const drag = useRef<{ startY: number; base: number; cell: { cx: number; cz: number; x: number; z: number } } | null>(null);
  const panning = useRef<{ x: number; y: number } | null>(null);
  const painting = useRef<string | null>(null);

  const campaign = view?.campaign ?? null;

  const cellKey = (c: { cx: number; cz: number; x: number; z: number }) => `${c.cx}:${c.cz}:${c.x}:${c.z}`;

  // Selection lives in view state, so a snapshot cannot close the panel the GM
  // is typing into (R-64). It is resolved against the latest campaign each
  // render, so a deleted POI simply stops resolving.
  const poi = campaign?.pois.find((p) => p.id === selectedPoi) ?? null;

  // Push server state into the Stage. Recentre only when a different campaign
  // opens, so an edit never yanks the camera (R-64).
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
    // R-79 lives in domain; the console draws from it and never restates it.
    stage.setSlots(creatableSlots(decoded.world));
  }, [campaign, stage]);

  const columnInfo = useCallback((cell: { cx: number; cz: number; x: number; z: number }) => {
    const chunk = campaign?.world.chunks.find((c) => c.cx === cell.cx && c.cz === cell.cz);
    if (!chunk) return null;
    const i = cell.z * CHUNK_SIZE + cell.x;
    const id = chunk.terrain[i];
    return {
      height: chunk.heights[i] ?? 0,
      terrain: campaign?.terrain.find((t) => t.id === id)?.name ?? id ?? '?',
    };
  }, [campaign]);

  useEffect(() => {
    const waiting = pendingPoiCell.current;
    if (!waiting || !campaign) return;
    const placed = campaign.pois.find(
      (p) => `${p.cell.cx}:${p.cell.cz}:${p.cell.x}:${p.cell.z}` === waiting,
    );
    if (!placed) return;
    pendingPoiCell.current = null;
    setSelectedPoi(placed.id);
    // Drop to the neutral tool so the next click inspects rather than places
    // another one (D-127).
    setTool('select');
  }, [campaign]);

  const heightAt = useCallback(
    (cell: { cx: number; cz: number; x: number; z: number }) => columnInfo(cell)?.height ?? 0,
    [columnInfo],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!stage || !campaign) return;
    if (e.button === 2 || e.button === 1) {
      panning.current = { x: e.clientX, y: e.clientY };
      return;
    }
    const picked = stage.pick(e.clientX, e.clientY);

    // A marker always means the place it belongs to, whatever the tool (R-86).
    // The tool is left alone: switching to Places would arm the next click to
    // create another POI, which is exactly what D-127 fixes.
    if (picked.poiId) { setSelectedPoi(picked.poiId); return; }

    if (picked.slot) {
      dispatch({ kind: 'addChunk', cx: picked.slot.cx, cz: picked.slot.cz });
      return;
    }
    if (!picked.column) return;

    if (tool === 'select') {
      // Clicking bare ground clears the selection; the marker branch above
      // handles picking one.
      setSelectedPoi(null);
      return;
    }

    if (tool === 'places') {
      const { cx, cz, x, z } = picked.column;
      pendingPoiCell.current = cellKey(picked.column);
      dispatch({ kind: 'addPoi', cell: { cx, cz, x, z }, markerId });
      return;
    }

    if (tool === 'paint') {
      painting.current = cellKey(picked.column);
      dispatch({ kind: 'paintTerrain', ...picked.column, terrainId, size: brush });
      e.currentTarget.setPointerCapture(e.pointerId);
    } else {
      drag.current = { startY: e.clientY, base: heightAt(picked.column), cell: picked.column };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!stage) return;

    if (panning.current) {
      stage.pan(e.clientX - panning.current.x, e.clientY - panning.current.y);
      panning.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (tool === 'select') {
      stage.showHighlight(null, 0);
      setHoverLabel(null);
      return;
    }

    if (tool === 'places') {
      const picked = stage.pick(e.clientX, e.clientY);
      stage.showHighlight(picked.column, picked.column ? heightAt(picked.column) : 0, 1);
      const info = picked.column ? columnInfo(picked.column) : null;
      setHoverLabel(info ? `${info.terrain}, height ${info.height}` : null);
      return;
    }

    if (painting.current !== null) {
      // Drag to paint: each newly entered cell is painted once (R-88, R-87).
      const picked = stage.pick(e.clientX, e.clientY);
      if (picked.column) {
        const key = cellKey(picked.column);
        stage.showHighlight(picked.column, heightAt(picked.column), brush);
        if (key !== painting.current) {
          painting.current = key;
          dispatch({ kind: 'paintTerrain', ...picked.column, terrainId, size: brush });
        }
      }
      return;
    }

    if (drag.current) {
      // Vertical drag, snapped to whole cubes (R-89). Up is higher.
      const steps = Math.round((drag.current.startY - e.clientY) / 18);
      const height = Math.max(0, Math.min(MAX_HEIGHT, drag.current.base + steps));
      dispatch({ kind: 'setHeight', ...drag.current.cell, height, size: brush });
      stage.showHighlight(drag.current.cell, height, brush);
      return;
    }

    const picked = stage.pick(e.clientX, e.clientY);
    stage.showHighlight(picked.column, picked.column ? heightAt(picked.column) : 0, brush);
    const info = picked.column ? columnInfo(picked.column) : null;
    setHoverLabel(info ? `${info.terrain}, height ${info.height}` : null);
  };

  const endGesture = () => { drag.current = null; panning.current = null; painting.current = null; };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    stage?.nudgeZoom(e.deltaY > 0 ? 1.12 : 1 / 1.12);
  };

  useEffect(() => {
    /**
     * Keyed on `event.code`, the *physical* key, not `event.key`.
     *
     * `event.key` is what the layout produces, and on several Mac layouts the
     * number row does not emit bare digits — so `key === '1'` silently never
     * fires. `code === 'Digit1'` is the key in that position whatever the layout
     * says, and Numpad is accepted alongside it for anyone who has one.
     */
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!stage) return;

      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)?.[1];
      switch (digit) {
        case '1': setTool('select'); return;
        case '2': setTool('paint'); return;
        case '3': setTool('height'); return;
        case '4': setTool('places'); return;
        case '5': setBrush(1); return;
        case '6': setBrush(2); return;
        case '7': setBrush(3); return;
        default: break;
      }

      switch (e.code) {
        case 'KeyQ': stage.rotate(-1); return;
        case 'KeyE': stage.rotate(1); return;
        case 'KeyR': stage.tilt(1); return;
        case 'KeyF': stage.tilt(-1); return;
        case 'BracketLeft': setBrush((n) => clampBrush(n - 1)); return;
        case 'BracketRight': setBrush((n) => clampBrush(n + 1)); return;
        case 'Escape': setSelectedPoi(null); return;
        default: break;
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [stage]);

  return (
    <>
      <div className="stage">
        <canvas
          ref={setCanvas}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endGesture}
          onPointerLeave={endGesture}
          onWheel={onWheel}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      {status !== 'open' && (
        <div className="launcher">
          <div className="card">
            <h1>{status === 'closed' ? 'Disconnected' : 'Connecting…'}</h1>
            <p>{status === 'closed' ? 'Lost the host. Retrying.' : 'Reaching the host.'}</p>
          </div>
        </div>
      )}

      {status === 'open' && !campaign && (
        <Launcher campaigns={view?.campaigns ?? []} dispatch={dispatch} />
      )}

      {status === 'open' && campaign && (
        <>
          <div className="dock">
            <div className="card">
              <h2>{campaign.name}</h2>
              <div className="row">
                <button onClick={() => dispatch({ kind: 'closeCampaign' })}>← campaigns</button>
                <Tooltip label="Save a copy as a new campaign" placement="bottom">
                  <button onClick={() => dispatch({ kind: 'duplicateCampaign', id: campaign.id })}>
                    Duplicate
                  </button>
                </Tooltip>
              </div>
            </div>
            <BuildWorldPanel
              campaign={campaign}
              tool={tool}
              terrainId={terrainId}
              brush={brush}
              hoverLabel={hoverLabel}
              onTool={setTool}
              onTerrain={setTerrainId}
              onBrush={setBrush}
            />
            {tool === 'places' && (
              <PlacesPanel campaign={campaign} markerId={markerId} onMarker={setMarkerId} />
            )}
          </div>

          <div className="dock dock-right">
            {poi && (
              <PoiInspector
                poi={poi}
                markers={campaign.markers}
                dispatch={dispatch}
                onClose={() => setSelectedPoi(null)}
              />
            )}
            <PartyPanel campaign={campaign} dispatch={dispatch} />
          </div>

          <div className="hints">
            1–4 tool · 5/6/7 or [ ] brush · Q/E turn · R/F tilt · right-drag pan · wheel zoom
          </div>
          <ConnectBadge urls={view?.connect ?? []} />
        </>
      )}

      {rejection && <div className="toast">{rejection}</div>}
    </>
  );
}
