// The GM console shell: launcher until a campaign is open, then the world.

import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeCampaign, decodePlacement } from '@tt/protocol';
import { CHUNK_SIZE, MAX_HEIGHT, clampBrush, creatableSlots, sameWorldCell } from '@tt/domain';
import type { GmView, Intent } from '@tt/protocol';
import { defaultTarget, worldCentre } from '@tt/render';
import type { Tool, Travel } from '@tt/client-core';
import {
  idle, pick, armed, aim, ghostCell, canConfirm, travelIntent, travelPrompt,
  clickAction, holdsSelection,
} from '@tt/client-core';
import { useStage } from '../scene/use-stage.js';
import { Launcher } from '../features/launcher/index.js';
import { BuildWorldPanel } from '../features/build-world/index.js';
import { PartyPanel } from '../features/party/index.js';
import { PlacesPanel, PoiInspector } from '../features/poi/index.js';
import { ChunkInspector } from '../features/visibility/index.js';
import { ConnectBadge } from '../features/connect/index.js';
import { Tooltip } from '@tt/ui';

interface Props {
  view: GmView | null;
  status: 'connecting' | 'open' | 'closed';
  /** Which seat this console actually holds (R-129). */
  seat: 'unknown' | 'gm' | 'viewer';
  rejection: string | null;
  dispatch: (intent: Intent) => void;
}

export function App({ view, status, seat, rejection, dispatch }: Props) {
  const [tool, setTool] = useState<Tool>('select');
  const [terrainId, setTerrainId] = useState('terrain:grass');
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  const [brush, setBrush] = useState(1);
  const [markerId, setMarkerId] = useState('marker:village');
  const [selectedPoi, setSelectedPoi] = useState<string | null>(null);
  const [selectedChunk, setSelectedChunk] = useState<{ cx: number; cz: number } | null>(null);
  const [travel, setTravel] = useState<Travel>(idle);
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
  const memberName = (id: string) => campaign?.party.find((m) => m.id === id)?.name ?? null;
  /** One POI per cell (R-119), checked on the wire form the app actually holds. */
  const occupied = (cell: { cx: number; cz: number; x: number; z: number }) =>
    (campaign?.pois ?? []).some((poi) => sameWorldCell(poi.cell, cell));
  /**
   * Can the party stand here? The GM console draws unknown chunks too, with fog
   * over them, so the ground under the dark is real geometry and aims fine —
   * hence this check, not just the one in `sim` (D-164).
   */
  const standable = (cell: { cx: number; cz: number } | null) =>
    cell !== null && knownChunks.has(`${cell.cx},${cell.cz}`);
  const placement = view?.save?.placement ?? null;
  const partyPlaced = Boolean(
    placement && (placement.at || Object.keys(placement.members).length > 0),
  );

  // Selection lives in view state, so a snapshot cannot close the panel the GM
  // is typing into (R-64). It is resolved against the latest campaign each
  // render, so a deleted POI simply stops resolving.
  const poi = campaign?.pois.find((p) => p.id === selectedPoi) ?? null;

  // Discovery lives in the save; the GM console shows it so the GM can see what
  // the players are missing.
  const knownChunks = new Set(view?.save?.discovery.chunks ?? []);
  const revealedPois = new Set(view?.save?.discovery.pois ?? []);
  const unknownChunks = (campaign?.world.chunks ?? [])
    .filter((c) => !knownChunks.has(`${c.cx},${c.cz}`))
    .map((c) => ({ cx: c.cx, cz: c.cz }));
  const chunkPois = selectedChunk
    ? (campaign?.pois ?? []).filter((p) => p.cell.cx === selectedChunk.cx && p.cell.cz === selectedChunk.cz)
    : [];

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
    stage.setFogChunks(unknownChunks);
  }, [campaign, stage, view?.save]);

  // The party moves far more often than the world changes (R-19a).
  useEffect(() => {
    stage?.setPlacement(view?.save ? decodePlacement(view.save.placement) : null);
  }, [view?.save, stage]);

  useEffect(() => {
    stage?.aimAt(ghostCell(travel));
  }, [travel, stage]);

  // With nothing on the board there is no pawn to pick up, so the sequence
  // starts itself (D-167).
  useEffect(() => {
    setTravel((current) => armed(current, tool === 'travel', partyPlaced));
  }, [tool, partyPlaced]);

  // An inspector open under Paint describes something that tool cannot act on
  // (D-168). Only the neutral tool holds a selection.
  useEffect(() => {
    if (holdsSelection(tool)) return;
    setSelectedPoi(null);
    setSelectedChunk(null);
  }, [tool]);

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
      // Right-click cancels a move in progress instead of starting a pan: it is
      // the universal "never mind" and the hand is already on the mouse (D-165).
      if (travel.step === 'aiming') {
        setTravel(idle);
        stage.showHighlight(null, 0);
        return;
      }
      panning.current = { x: e.clientX, y: e.clientY };
      return;
    }
    const picked = stage.pick(e.clientX, e.clientY);

    // Mid-sequence, the click means confirm or cancel and nothing else (R-132).
    if (travel.step === 'aiming') {
      // An unreachable cell is not confirmable, so the click cancels instead of
      // sending a move the host would refuse (D-164).
      if (canConfirm(travel) && picked.column) dispatch(travelIntent(travel.pawn, picked.column));
      setTravel(idle);
      // The aim highlight belongs to the sequence, so it goes with it.
      stage.showHighlight(null, 0);
      return;
    }

    // What the click meant is decided by the tested table in `client-core`
    // (R-87c), not by the order of `if`s in a pointer handler. This switch only
    // carries it out.
    const action = clickAction(tool, {
      pawn: picked.pawn,
      poiId: picked.poiId,
      cell: picked.column,
      slot: picked.slot,
    }, { occupied });

    switch (action.kind) {
      case 'createChunk':
        dispatch({ kind: 'addChunk', cx: action.slot.cx, cz: action.slot.cz });
        return;

      case 'pickPawn':
        setTravel(pick(action.pawn));
        return;

      case 'selectPoi':
        setSelectedPoi(action.poiId);
        setSelectedChunk(null);
        return;

      case 'selectChunk':
        setSelectedPoi(null);
        setSelectedChunk(action.coord);
        return;

      case 'placePoi': {
        const { cx, cz, x, z } = action.cell;
        pendingPoiCell.current = cellKey(action.cell);
        dispatch({ kind: 'addPoi', cell: { cx, cz, x, z }, markerId });
        return;
      }

      case 'paint':
        painting.current = cellKey(action.cell);
        dispatch({ kind: 'paintTerrain', ...action.cell, terrainId, size: brush });
        e.currentTarget.setPointerCapture(e.pointerId);
        return;

      case 'raise':
        drag.current = { startY: e.clientY, base: heightAt(action.cell), cell: action.cell };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;

      default:
        return;
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!stage) return;

    if (travel.step === 'aiming') {
      const picked = stage.pick(e.clientX, e.clientY);
      setTravel((current) => aim(current, picked.column, standable(picked.column)));
      stage.showHighlight(picked.column, picked.column ? heightAt(picked.column) : 0, 1);
      return;
    }

    if (panning.current) {
      stage.pan(e.clientX - panning.current.x, e.clientY - panning.current.y);
      panning.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (tool === 'select' || tool === 'travel') {
      stage.showHighlight(null, 0);
      setHoverLabel(null);
      return;
    }

    if (tool === 'places') {
      const picked = stage.pick(e.clientX, e.clientY);
      stage.showHighlight(picked.column, picked.column ? heightAt(picked.column) : 0, 1);
      // Says the cell is taken *before* the click that would do nothing, so a
      // dropped click reads as a rule rather than as a dead button (R-18).
      if (picked.column && occupied(picked.column)) {
        setHoverLabel('Already a place here');
        return;
      }
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
        case '5': setTool('travel'); return;
        // Brush moved down one when travel took 5, so the digits still run
        // left-to-right through the tools and then the brushes. `[` and `]` are
        // the primary brush keys anyway.
        case '6': setBrush(1); return;
        case '7': setBrush(2); return;
        case '8': setBrush(3); return;
        default: break;
      }

      switch (e.code) {
        case 'KeyQ': stage.rotate(-1); return;
        case 'KeyE': stage.rotate(1); return;
        case 'KeyR': stage.tilt(1); return;
        case 'KeyF': stage.tilt(-1); return;
        case 'BracketLeft': setBrush((n) => clampBrush(n - 1)); return;
        case 'BracketRight': setBrush((n) => clampBrush(n + 1)); return;
        case 'Escape':
          setTravel(idle);
          stage.showHighlight(null, 0);
          setSelectedPoi(null);
          setSelectedChunk(null);
          return;
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

      {status === 'open' && seat === 'viewer' && (
        <div className="launcher">
          <div className="card">
            <h1>Another console has the GM seat</h1>
            <p>
              This tab is watching. Reload it to take the seat back — the other
              console becomes the viewer instead.
            </p>
            <button onClick={() => location.reload()}>Take the GM seat</button>
          </div>
        </div>
      )}

      {status === 'open' && seat === 'gm' && !campaign && (
        <Launcher campaigns={view?.campaigns ?? []} dispatch={dispatch} />
      )}

      {status === 'open' && seat === 'gm' && campaign && (
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
              // Mid-sequence the readout says what the click will do, since that
              // is more useful than the terrain under the pointer (R-132).
              hoverLabel={travelPrompt(travel, memberName) ?? hoverLabel}
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
                revealed={revealedPois.has(poi.id)}
                chunkKnown={knownChunks.has(`${poi.cell.cx},${poi.cell.cz}`)}
                dispatch={dispatch}
                onClose={() => setSelectedPoi(null)}
              />
            )}
            {!poi && selectedChunk && (
              <ChunkInspector
                coord={selectedChunk}
                known={knownChunks.has(`${selectedChunk.cx},${selectedChunk.cz}`)}
                poiCount={chunkPois.length}
                revealedPoiCount={chunkPois.filter((p) => revealedPois.has(p.id)).length}
                dispatch={dispatch}
              />
            )}
            <PartyPanel
              campaign={campaign}
              placement={placement}
              canPlace={knownChunks.size > 0}
              dispatch={dispatch}
            />
          </div>

          <div className="hints">
            1–5 tool · 6/7/8 or [ ] brush · Q/E turn · R/F tilt · right-drag pan · wheel zoom
          </div>
          <ConnectBadge urls={view?.connect ?? []} />
        </>
      )}

      {rejection && <div className="toast">{rejection}</div>}
    </>
  );
}
