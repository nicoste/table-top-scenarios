// The GM console shell: launcher until a campaign is open, then the world.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { decodeCampaign, decodePlacement } from '@tt/protocol';
import {
  CHUNK_SIZE, MAX_HEIGHT, MAP_MAX_HEIGHT, clampBrush, creatableSlots, sameWorldCell,
  DEFAULT_MATERIALS, DEFAULT_FLOOR, mapFromJSON, fillRegion,
} from '@tt/domain';
import type { GmView, Intent } from '@tt/protocol';
import { defaultTarget, worldCentre } from '@tt/render';
import type { Tool, Travel } from '@tt/client-core';
import {
  idle, pick, armed, aim, ghostCell, canConfirm, travelIntent, travelPrompt,
  clickAction, holdsSelection, mapAction, mapHover, mapDrags, cameraAction, CAMERA_HINT,
} from '@tt/client-core';
import type { MapAction, MapTool } from '@tt/client-core';
import { useStage } from '../scene/use-stage.js';
import { Launcher } from '../features/launcher/index.js';
import { BuildWorldPanel } from '../features/build-world/index.js';
import { PartyPanel } from '../features/party/index.js';
import { PlacesPanel, PlaceInspector } from '../features/place/index.js';
import { ChunkInspector } from '../features/visibility/index.js';
import { MapPanel } from '../features/map/index.js';
import { ConnectBadge } from '../features/connect/index.js';
import { Compass, Tooltip } from '@tt/ui';

/** Mac shows ⌘, everything else Ctrl. Cosmetic: the binding accepts both (R-140). */
const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  ? '\u2318'
  : 'Ctrl+';

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
  const [selectedPlace, setSelectedPlace] = useState<string | null>(null);
  const [selectedChunk, setSelectedChunk] = useState<{ cx: number; cz: number } | null>(null);
  const [travel, setTravel] = useState<Travel>(idle);
  /**
   * Which map is open, if any. **View state, never on the wire** (R-64, D-185):
   * which surface the console is showing is the console's business, and the
   * intents that edit a map name their place and point of interest themselves.
   */
  const [openMap, setOpenMap] = useState<{ placeId: string; poiId: string } | null>(null);
  const [mapTool, setMapTool] = useState<MapTool>('build');
  const [materialId, setMaterialId] = useState<string>(DEFAULT_FLOOR);
  /**
   * The cell a place was just placed on, waiting for the snapshot that will carry
   * it. The host assigns the id, so the client cannot know it in advance — but
   * one place per cell (R-119) makes the cell an unambiguous handle until then.
   */
  const pendingPlaceCell = useRef<string | null>(null);
  const { setCanvas, stage } = useStage();
  const openedId = useRef<string | null>(null);
  const drag = useRef<{ startY: number; base: number; cell: { cx: number; cz: number; x: number; z: number } } | null>(null);
  const panning = useRef<{ x: number; y: number } | null>(null);
  const painting = useRef<string | null>(null);
  /**
   * Ties one gesture's intents together for undo (D-170). Generated per
   * pointerdown; the host only ever compares it to the previous one, so any
   * unique-enough string does.
   */
  const stroke = useRef<string | null>(null);
  /**
   * Which way the camera is facing, for the compass (R-155).
   *
   * The stage hands over the *live* bearing, so the dial moves with the world
   * during a turn rather than jumping ahead of it (R-156). It arrives once per
   * frame while turning and not at all otherwise, so a pan costs nothing.
   */
  const [bearing, setBearing] = useState(0);
  /** The current brush gesture, so a drag of paint is one undo (R-140b). */
  const blockStroke = useRef<string | null>(null);
  /** The last block the brush touched, so one drag does not re-send it. */
  const lastBlock = useRef<string | null>(null);
  const newStroke = () => {
    stroke.current = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    return stroke.current;
  };

  const campaign = view?.campaign ?? null;

  /**
   * Resolved from the current wire every render, never cached — the same reason
   * the table's selection is (R-141). A map the GM deletes, or a point of
   * interest they remove, must not leave a stale body on screen.
   */
  const openPlace = openMap
    ? campaign?.places.find((place) => place.id === openMap.placeId) ?? null
    : null;
  const openPoi = openMap && openPlace
    ? openPlace.pois.find((poi) => poi.id === openMap.poiId) ?? null
    : null;
  const openMapWire = openPoi?.map ?? null;
  /**
   * Where the party is, and the band the table is being shown (R-158).
   *
   * Play state, unlike `openMap` — which stays the console's own business, so a
   * GM can build a tavern the party has not found. The two coincide most of the
   * time because opening a map takes the party in when it can (D-200).
   */
  const inside = view?.save?.inside ?? null;
  const partyHere = !!inside && !!openMap
    && inside.placeId === openMap.placeId && inside.poiId === openMap.poiId;
  /**
   * The band the open map is cut to (R-146).
   *
   * Read for whichever map is open, not for wherever the party is: the fade is
   * the GM's own working view, and cutting to one floor is how a multi-level
   * building gets built (D-201).
   */
  const openRange = openMap
    ? view?.save?.ranges[openMap.poiId] ?? { lower: 0, upper: MAP_MAX_HEIGHT }
    : null;

  const cellKey = (c: { cx: number; cz: number; x: number; z: number }) => `${c.cx}:${c.cz}:${c.x}:${c.z}`;
  const memberName = (id: string) => campaign?.party.find((m) => m.id === id)?.name ?? null;
  /** One place per cell (R-119), checked on the wire form the app actually holds. */
  const occupied = (cell: { cx: number; cz: number; x: number; z: number }) =>
    (campaign?.places ?? []).some((place) => sameWorldCell(place.cell, cell));
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
  // render, so a deleted place simply stops resolving.
  const place = campaign?.places.find((p) => p.id === selectedPlace) ?? null;

  // Discovery lives in the save; the GM console shows it so the GM can see what
  // the players are missing.
  const knownChunks = new Set(view?.save?.discovery.chunks ?? []);
  const revealedPois = new Set(view?.save?.discovery.places ?? []);
  const unknownChunks = (campaign?.world.chunks ?? [])
    .filter((c) => !knownChunks.has(`${c.cx},${c.cz}`))
    .map((c) => ({ cx: c.cx, cz: c.cz }));
  const chunkPois = selectedChunk
    ? (campaign?.places ?? []).filter((p) => p.cell.cx === selectedChunk.cx && p.cell.cz === selectedChunk.cz)
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

  /**
   * The open map as domain data.
   *
   * Decoded once per wire change and shared: the stage draws it, and the fill
   * tool needs it to count the region under the pointer before the GM clicks
   * (R-154). Decoding twice would mean two bodies that can disagree.
   */
  const openBody = useMemo(
    () => (openMapWire ? mapFromJSON(openMapWire) : null),
    [openMapWire],
  );

  /**
   * Opening a map takes the party in — *"when a GM open a map, the party goes
   * in"* — but only when they could see it anyway (R-158).
   *
   * The check is here rather than left to the host's rejection because the
   * console knows the answer: dispatching an intent it can see will be refused
   * would put a toast on screen every time the GM opened a map they are still
   * building. The host still guards it; this only avoids asking.
   */
  useEffect(() => {
    if (!openMap || !openPlace || !openPoi) return;
    if (inside?.placeId === openMap.placeId && inside?.poiId === openMap.poiId) return;
    const onTable = revealedPois.has(openPlace.id)
      && knownChunks.has(`${openPlace.cell.cx},${openPlace.cell.cz}`)
      && openPoi.visibleToParty;
    if (onTable) dispatch({ kind: 'enterMap', placeId: openMap.placeId, poiId: openMap.poiId });
    // `inside` is deliberately *not* a dependency: this fires when the GM opens
    // a map, and must not fire again when the party's own state changes under
    // it — otherwise bringing them out would immediately put them back.
  }, [openMap, openPlace?.id, openPoi?.id, openPoi?.visibleToParty]);

  // The compass follows the camera, on both surfaces (R-152, R-155).
  useEffect(() => {
    stage?.watchCamera(setBearing);
    return () => stage?.watchCamera(null);
  }, [stage]);

  // The open map is its own surface (R-148). Passing null returns to the world,
  // whose meshes were hidden rather than destroyed.
  useEffect(() => {
    if (!stage) return;
    const body = openBody;
    // Keyed by which point of interest, not by the body: this effect reruns for
    // every block placed, because the wire hands back a new object each time
    // (D-185). The key is what tells the stage a *surface* changed, so the
    // camera frames a map once on the way in and never again (R-152).
    stage.setMap(
      body,
      DEFAULT_MATERIALS,
      openMap ? `${openMap.placeId}/${openMap.poiId}` : null,
      openRange,
    );
  }, [openBody, openMap, stage, openRange?.lower, openRange?.upper]);

  // A point of interest whose map the GM deleted, or which they removed
  // outright, must not leave the console stranded on a surface that is gone.
  useEffect(() => {
    if (openMap && !openMapWire) setOpenMap(null);
  }, [openMap, openMapWire]);

  // With nothing on the board there is no pawn to pick up, so the sequence
  // starts itself (D-167).
  useEffect(() => {
    setTravel((current) => armed(current, tool === 'travel', partyPlaced));
  }, [tool, partyPlaced]);

  // An inspector open under Paint describes something that tool cannot act on
  // (D-168). Only the neutral tool holds a selection.
  useEffect(() => {
    if (holdsSelection(tool)) return;
    setSelectedPlace(null);
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
    const waiting = pendingPlaceCell.current;
    if (!waiting || !campaign) return;
    const placed = campaign.places.find(
      (p) => `${p.cell.cx}:${p.cell.cz}:${p.cell.x}:${p.cell.z}` === waiting,
    );
    if (!placed) return;
    pendingPlaceCell.current = null;
    setSelectedPlace(placed.id);
    // Drop to the neutral tool so the next click inspects rather than places
    // another one (D-127).
    setTool('select');
  }, [campaign]);

  const heightAt = useCallback(
    (cell: { cx: number; cz: number; x: number; z: number }) => columnInfo(cell)?.height ?? 0,
    [columnInfo],
  );

  /**
   * Performs a map action, whatever the tool decided it was.
   *
   * One place rather than a branch in pointer-down and another in pointer-move,
   * because the brush runs through both and the two copies would drift.
   */
  const mapEdit = (action: MapAction, stroke: string | null) => {
    if (!openMap || action.kind === 'nothing') return;
    const where = { placeId: openMap.placeId, poiId: openMap.poiId, ...action.at };
    const tagged = stroke ? { stroke } : {};
    switch (action.kind) {
      case 'place':
        dispatch({ kind: 'setBlock', ...where, materialId, ...tagged });
        return;
      case 'paint':
        // The same intent as `place`, deliberately: `setBlock` replaces the
        // material of a block that is already there, and paint only ever
        // targets a block the GM can see. What differs is the *cell* the tool
        // chose — the block itself rather than the space against its face.
        dispatch({ kind: 'setBlock', ...where, materialId, ...tagged });
        return;
      case 'erase':
        dispatch({ kind: 'clearBlock', ...where, ...tagged });
        return;
      case 'fill':
        // No stroke: a fill is already one intent covering a whole region, so
        // it is one undo without any help.
        dispatch({ kind: 'fillMaterial', ...where, materialId });
        return;
    }
  };

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

    // Inside a map, the world's tool table does not apply at all (R-148).
    if (openMap) {
      const action = mapAction(mapTool, picked.face);
      // Only the brush keeps acting as the pointer moves (R-153), and when it
      // does the whole drag is one undo, so the stroke id is generated here.
      if (mapDrags(mapTool) && action.kind !== 'nothing') {
        blockStroke.current = newStroke();
        lastBlock.current = null;
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      mapEdit(action, blockStroke.current);
      return;
    }

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
      placeId: picked.placeId,
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

      case 'selectPlace':
        setSelectedPlace(action.placeId);
        setSelectedChunk(null);
        return;

      case 'selectChunk':
        setSelectedPlace(null);
        setSelectedChunk(action.coord);
        return;

      case 'placePoi': {
        const { cx, cz, x, z } = action.cell;
        pendingPlaceCell.current = cellKey(action.cell);
        dispatch({ kind: 'addPlace', cell: { cx, cz, x, z }, markerId });
        return;
      }

      case 'paint':
        painting.current = cellKey(action.cell);
        dispatch({ kind: 'paintTerrain', ...action.cell, terrainId, size: brush, stroke: newStroke() });
        e.currentTarget.setPointerCapture(e.pointerId);
        return;

      case 'raise':
        drag.current = { startY: e.clientY, base: heightAt(action.cell), cell: action.cell };
        newStroke();
        e.currentTarget.setPointerCapture(e.pointerId);
        return;

      default:
        return;
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!stage) return;

    // Before any surface branch, because the camera belongs to no surface
    // (R-152). It sat below the map branch, so a right-drag inside a map armed
    // a pan that no move ever applied — the third time an early return here
    // has swallowed a camera control.
    if (panning.current) {
      stage.pan(e.clientX - panning.current.x, e.clientY - panning.current.y);
      panning.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (openMap) {
      const picked = stage.pick(e.clientX, e.clientY);
      const action = mapAction(mapTool, picked.face);
      const region = action.kind === 'fill' && openBody
        ? fillRegion(openBody, action.at).length
        : undefined;
      const hover = mapHover(action, region);
      setHoverLabel(hover.label);
      stage.showBlockGhost(hover.ghost);

      // Build and erase only ever *show* what a click would do (R-153): they
      // move their own target, so a hand that drifts mid-click would climb.
      // The brush does not, so it paints every new block it crosses — once
      // each, under the one stroke id that makes the drag a single undo.
      if (blockStroke.current === null || action.kind === 'nothing') return;
      const key = `${action.at.x},${action.at.y},${action.at.z}`;
      if (key === lastBlock.current) return;
      lastBlock.current = key;
      mapEdit(action, blockStroke.current);
      return;
    }

    if (travel.step === 'aiming') {
      const picked = stage.pick(e.clientX, e.clientY);
      setTravel((current) => aim(current, picked.column, standable(picked.column)));
      stage.showHighlight(picked.column, picked.column ? heightAt(picked.column) : 0, 1);
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
          dispatch({
            kind: 'paintTerrain', ...picked.column, terrainId, size: brush,
            ...(stroke.current ? { stroke: stroke.current } : {}),
          });
        }
      }
      return;
    }

    if (drag.current) {
      // Vertical drag, snapped to whole cubes (R-89). Up is higher.
      const steps = Math.round((drag.current.startY - e.clientY) / 18);
      const height = Math.max(0, Math.min(MAX_HEIGHT, drag.current.base + steps));
      dispatch({
        kind: 'setHeight', ...drag.current.cell, height, size: brush,
        ...(stroke.current ? { stroke: stroke.current } : {}),
      });
      stage.showHighlight(drag.current.cell, height, brush);
      return;
    }

    const picked = stage.pick(e.clientX, e.clientY);
    stage.showHighlight(picked.column, picked.column ? heightAt(picked.column) : 0, brush);
    const info = picked.column ? columnInfo(picked.column) : null;
    setHoverLabel(info ? `${info.terrain}, height ${info.height}` : null);
  };

  const endGesture = () => {
    drag.current = null;
    panning.current = null;
    painting.current = null;
    stroke.current = null;
    blockStroke.current = null;
    lastBlock.current = null;
  };

  /**
   * The pointer left the canvas, so nothing is about to happen anywhere.
   *
   * Separate from `endGesture`, which also runs on pointer-up — clearing the
   * outline there would blink it off under a stationary cursor after every
   * click.
   */
  const onPointerLeave = () => {
    endGesture();
    setHoverLabel(null);
    stage?.showBlockGhost(null);
  };

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

      // Undo comes *before* the modifier guard below, because it is the one
      // shortcut that needs one. cmd on a Mac, ctrl elsewhere; shift redoes
      // (R-140). preventDefault so the browser does not also undo something.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.code === 'KeyZ') {
        e.preventDefault();
        dispatch({ kind: e.shiftKey ? 'redo' : 'undo' });
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!stage) return;

      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)?.[1];
      if (openMap) {
        if (digit === '1') { setMapTool('build'); return; }
        if (digit === '2') { setMapTool('erase'); return; }
        if (digit === '3') { setMapTool('paint'); return; }
        if (digit === '4') { setMapTool('fill'); return; }
        if (e.code === 'Escape') { setOpenMap(null); return; }
      } else {
        switch (digit) {
          case '1': setTool('select'); return;
          case '2': setTool('paint'); return;
          case '3': setTool('height'); return;
          case '4': setTool('places'); return;
          case '5': setTool('travel'); return;
          // Brush moved down one when travel took 5, so the digits still run
          // left-to-right through the tools and then the brushes. `[` and `]`
          // are the primary brush keys anyway.
          case '6': setBrush(1); return;
          case '7': setBrush(2); return;
          case '8': setBrush(3); return;
          default: break;
        }

        switch (e.code) {
          case 'BracketLeft': setBrush((n) => clampBrush(n - 1)); return;
          case 'BracketRight': setBrush((n) => clampBrush(n + 1)); return;
          case 'Escape':
            setTravel(idle);
            stage.showHighlight(null, 0);
            setSelectedPlace(null);
            setSelectedChunk(null);
            return;
          default: break;
        }
      }

      // The camera belongs to no surface (R-152), and to no seat either: the
      // table reads the same table (R-156). This used to sit behind the world's
      // branch, so inside a map Q/E/R/F did nothing at all — and a tavern is
      // exactly where turning matters, since a wall you built is between you
      // and the room behind it.
      const camera = cameraAction(e.code);
      if (camera) {
        if (camera.kind === 'turn') stage.rotate(camera.steps);
        else stage.tilt(camera.steps);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
    // `openMap` belongs here. Without it the listener kept the value it was
    // mounted with, so inside a map the digits and Escape ran the *world*
    // branch: 1/2 never switched Build/Erase, Escape never left, and both
    // quietly changed the world tool behind the map instead.
  }, [stage, openMap]);

  return (
    <>
      <div className="stage">
        <canvas
          ref={setCanvas}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endGesture}
          onPointerLeave={onPointerLeave}
          onWheel={onWheel}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      {/* Both surfaces, and hidden only when a screen-filling card owns the
          view — there is no north to point at on the launcher (R-155). */}
      <Compass
        bearing={bearing}
        hidden={status !== 'open' || seat !== 'gm' || !campaign}
      />

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

      {status === 'open' && seat === 'gm' && campaign && openMapWire && openPlace && openPoi && (
        <div className="dock">
          <MapPanel
            placeName={openPlace.name}
            poiName={openPoi.name}
            map={openMapWire}
            tool={mapTool}
            materials={DEFAULT_MATERIALS}
            materialId={materialId}
            hoverLabel={hoverLabel}
            partyHere={partyHere}
            partyCanSee={
              revealedPois.has(openPlace.id)
              && knownChunks.has(`${openPlace.cell.cx},${openPlace.cell.cz}`)
              && openPoi.visibleToParty
            }
            range={openRange ?? { lower: 0, upper: MAP_MAX_HEIGHT }}
            onTool={setMapTool}
            onMaterial={setMaterialId}
            onLeave={() => setOpenMap(null)}
            dispatch={dispatch}
            placeId={openPlace.id}
            poiId={openPoi.id}
          />
        </div>
      )}

      {status === 'open' && seat === 'gm' && campaign && !openMapWire && (
        <>
          <div className="dock">
            <div className="card">
              <h2>{campaign.name}</h2>
              <div className="btn-grid campaign-actions">
                <Tooltip label="Close this campaign and pick another" placement="bottom" stretch>
                  <button className="wide" onClick={() => dispatch({ kind: 'closeCampaign' })}>
                    ← Back to main menu
                  </button>
                </Tooltip>
                <Tooltip label="Save a copy as a new campaign" placement="bottom" stretch>
                  <button
                    className="wide"
                    onClick={() => dispatch({ kind: 'duplicateCampaign', id: campaign.id })}
                  >
                    Duplicate campaign
                  </button>
                </Tooltip>
                {/* Buttons as well as the shortcut: a keyboard-only feature is
                    one nobody finds, and the disabled state says when there is
                    nothing left to take back (R-140). */}
                <Tooltip label={`Undo — ${MOD}Z`} placement="bottom" stretch>
                  <button disabled={!view?.canUndo} onClick={() => dispatch({ kind: 'undo' })}>
                    ↶ Undo
                  </button>
                </Tooltip>
                <Tooltip label={`Redo — ${MOD}\u21e7Z`} placement="bottom" stretch>
                  <button disabled={!view?.canRedo} onClick={() => dispatch({ kind: 'redo' })}>
                    ↷ Redo
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
            {place && (
              <PlaceInspector
                place={place}
                markers={campaign.markers}
                revealed={revealedPois.has(place.id)}
                chunkKnown={knownChunks.has(`${place.cell.cx},${place.cell.cz}`)}
                dispatch={dispatch}
                onClose={() => setSelectedPlace(null)}
                onOpenMap={(poiId) => {
                  setOpenMap({ placeId: place.id, poiId });
                  setSelectedPlace(null);
                }}
              />
            )}
            {!place && selectedChunk && (
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
            1–5 tool · 6/7/8 or [ ] brush · {CAMERA_HINT}
          </div>
          <ConnectBadge urls={view?.connect ?? []} />
        </>
      )}

      {rejection && <div className="toast">{rejection}</div>}
    </>
  );
}
