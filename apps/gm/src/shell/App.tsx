// The GM console shell: launcher until a campaign is open, then the world.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { decodeCampaign, decodePlacement, cellsFromWire, travellingToWire } from '@tt/protocol';
import {
  MAX_HEIGHT, WHOLE_MAP, rangeIn, stepBrush, WORLD_BRUSHES, BRUSHES, DEFAULT_BRUSH, brushById,
  routeAcross, toGlobal, DEFAULT_TRAVEL_MODES, discoveryFromJSON, asFacing, turned,
  silverFromJSON, silverCubes, silverInBand, silverShown, NO_SILVER,
  chunkAt, columnAt,
  creatableSlots, sameWorldCell,
  DEFAULT_MATERIALS, DEFAULT_FLOOR, mapFromJSON, fillRegion, sliceOf, inRange, inMap, blockAt,
  bottomOfMap, cutOf, cutIdIn, familyOf, sunReaches, litBy, MAP_MAX_HEIGHT,
  DAYLIGHT, clampLighting,
  NO_TOKENS, tokensIn, onRoster, unplaced, tokensInBand, standsInBand, standingAt,
  NO_CELLS, shownBy, memberNotesFromJSON, carriedFromJSON, areasFromJSON, areaAt,
  prefabFromJSON, capturePrefab, propById, propBox, propType, blockKey, propsSeen, sightShows,
} from '@tt/domain';
import type {
  SwatchId, CoverId, Lighting, Ambience, MemberId, Tokens, BlockCoord, Route, Travelling,
  TravelModeId, Facing,
} from '@tt/domain';
import type { GmView, Intent } from '@tt/protocol';
import { defaultTarget, worldCentre, SILVER } from '@tt/render';
import type { Picked, Present, RulerPoint, Standing, StageFog } from '@tt/render';
import type {
  Capture, Carry, MeasureHand, PrefabPlacing, PropHand, SilverMove, Stride, Tool, Travel,
} from '@tt/client-core';
import {
  emptyHanded, pickUp, turnCarried, canSetDown, setDownIntent, placesPrompt,
  worldToolShows, mapToolShows,
  noSilverMove, grabSilver, aimSilverMove, silverMoveGhost, silverVerdict, silverMoveIntent,
  spawnIntent, silverMovePrompt, spawnPrompt,
  idle, pick, armed, aim, choose, ghostCell, aimedAt, travelIntent, travelPrompt,
  clickAction, holdsSelection, mapAction, mapHover, mapDrags, mapAllowed,
  cameraAction, wheelZoom, CAMERA_HINT,
  still, grab, armedStride, tokenAim, aimStride, strideGhost, strideIntent, standVerdict, walkShown,
  tokenAction, stridePrompt,
  NOT_PLACING, turnPlacing, mirrorPlacing, prefabAim, prefabPreview, placeIntent, placePrompt,
  NO_CAPTURE, captureCorner, captureClick, captureHeight, captureBack, captureBox, capturePrompt,
  EMPTY_HAND, turnHand, propAim, propWall, propPreview, placePropIntent, propPrompt, toggleIntent, toggleLabel,
  paintPropIntent, paintPropPrompt,
  MEASURE_START, measureCleared, measurePress, measureDrag, measureRelease, rulerShown, areasShown, handleAt,
  measurePrompt, faceCentre, floorCentre,
} from '@tt/client-core';
import type { MapAction, MapReach, MapTool } from '@tt/client-core';
import { useStage } from '../scene/use-stage.js';
import { useCost, COST_HINT } from '../scene/use-cost.js';
import { Launcher } from '../features/launcher/index.js';
import { LightPanel } from '../features/light/index.js';
import { BuildWorldPanel } from '../features/build-world/index.js';
import { PartyPanel } from '../features/party/index.js';
import { PlacesPanel, PlaceInspector } from '../features/place/index.js';
import { TravelPanel } from '../features/travel/index.js';
import { LibraryPanel } from '../features/library/index.js';
import { PrefabsPanel } from '../features/prefabs/index.js';
import type { PrefabMode } from '../features/prefabs/index.js';
import { PropsPanel } from '../features/props/index.js';
import { MeasurePanel } from '../features/measure/index.js';
import { OnStagePanel } from '../features/on-stage/index.js';
import { ChunkInspector } from '../features/visibility/index.js';
import { MapPanel } from '../features/map/index.js';
import { ConnectBadge } from '../features/connect/index.js';
import { Compass, Metrics, Tooltip } from '@tt/ui';

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
  const [ground, setGround] = useState<SwatchId>('material:grass' as SwatchId);
  /** What the cover brush holds; null is the eraser (R-193). */
  const [cover, setCover] = useState<CoverId | null>('cover:trees' as CoverId);
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  const [brush, setBrush] = useState(1);
  const [markerId, setMarkerId] = useState('marker:village');
  /**
   * Which way the next place will face (R-203): turned with Z / X before the
   * click, and kept between placements the way the brush size is.
   */
  const [facing, setFacing] = useState<Facing>(0);
  /** A place being moved, if one is in hand. Local until set down (R-64). */
  const [hands, setHands] = useState<Carry>(emptyHanded);
  /** The Tokens Library entry a Spawn click places (D-307), if one is chosen. */
  const [chosenTemplate, setChosenTemplate] = useState<string | null>(null);
  /** A silver token being moved, if one is (R-206). Local until confirmed. */
  const [silverMove, setSilverMove] = useState<SilverMove>(noSilverMove);
  /**
   * The Prefabs tool (D-321): placing or capturing; the prefab in hand and
   * how it is turned, kept between placements as the brush is; the corners
   * of a box being captured; and the cube under the pointer for each.
   */
  const [prefabMode, setPrefabMode] = useState<PrefabMode>('place');
  const [placing, setPlacing] = useState<PrefabPlacing>(NOT_PLACING);
  const [capture, setCapture] = useState<Capture>(NO_CAPTURE);
  const [prefabAt, setPrefabAt] = useState<BlockCoord | null>(null);
  const [captureHover, setCaptureHover] = useState<BlockCoord | null>(null);
  /** A prefab was just saved: the next one to arrive is put in hand. */
  const awaitingPrefab = useRef<number | null>(null);
  /**
   * The Props tool (D-328): the prop in hand, kept between placements as the
   * brush is; the one clicked on the map when nothing is in hand; and the
   * cube the pointer would stand a prop in.
   */
  const [propHand, setPropHand] = useState<PropHand>(EMPTY_HAND);
  const [selectedProp, setSelectedProp] = useState<string | null>(null);
  /**
   * The Measure tool (D-341): the ruler or a shape in hand, and the drag under
   * way. Kept in a ref as well, because a pointer-up can arrive before the
   * render that a drag's last move asked for.
   */
  const [measure, setMeasureState] = useState<MeasureHand>(MEASURE_START);
  const measureRef = useRef<MeasureHand>(MEASURE_START);
  const setMeasure = useCallback((next: MeasureHand) => {
    measureRef.current = next;
    setMeasureState(next);
  }, []);
  /** Whether the pointer is over an area's handle, for the readout. */
  const [overHandle, setOverHandle] = useState(false);
  const [propAt, setPropAt] = useState<BlockCoord | null>(null);
  /** The wall a torch would hang on there, when the pointer is on one (D-335). */
  const [propWallAt, setPropWallAt] = useState<0 | 1 | 2 | 3 | null>(null);
  /**
   * The cell under the pointer while the Places tool is out, so the ghost can
   * be redrawn by a key press as well as by a pointer move. Replaced only when
   * the pointer crosses into another cell (R-165).
   */
  const [placeAim, setPlaceAim] = useState<{ cx: number; cz: number; x: number; z: number } | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<string | null>(null);
  const [selectedChunk, setSelectedChunk] = useState<{ cx: number; cz: number } | null>(null);
  const [travel, setTravel] = useState<Travel>(idle);
  /**
   * What the party can travel by (R-200), asked when the tool is picked up
   * rather than after aiming. A fact about the party, not about this journey.
   *
   * **Read from the save, not held here** (D-304). It was console state for a
   * day, which meant a reload put the party's ship back in the harbour and,
   * worse, that the table drew the same journey on foot while the console
   * drew it under sail. One source, both screens (R-19).
   *
   * Memoised on the three ids rather than on the wire object, which is built
   * fresh for every message the host sends: a new object each push would run
   * an A* per push instead of per aim.
   */
  const way = view?.save?.travelling ?? null;
  const travelling = useMemo<Travelling>(() => ({
    land: (way?.land ?? null) as TravelModeId | null,
    water: (way?.water ?? null) as TravelModeId | null,
    air: (way?.air ?? null) as TravelModeId | null,
  }), [way?.land, way?.water, way?.air]);
  /** The route being previewed, so the menu can price it (R-199). */
  const [route, setRoute] = useState<Route | null>(null);
  /**
   * Which map is open, if any. **View state, never on the wire** (R-64, D-185):
   * which surface the console is showing is the console's business, and the
   * intents that edit a map name their place and point of interest themselves.
   */
  const [openMap, setOpenMap] = useState<{ placeId: string; poiId: string } | null>(null);
  const [mapTool, setMapTool] = useState<MapTool>('build');
  /**
   * A token being moved inside the open map (R-188). View state, like the
   * world's travel sequence: nothing reaches the host until the confirm.
   */
  const [stride, setStride] = useState<Stride>(still);
  /**
   * Is the console showing only the band, like the table (R-159)?
   *
   * The GM's toggle, and view state (R-64): which levels *they* are looking at
   * is nobody else's business, and it must not follow them between maps or
   * survive a reload as a surprise. Off by default, because the whole body is
   * the safe view to build in and a permanently dimmed screen was a tax on
   * every session to answer a question the GM asks occasionally.
   */
  const [levelling, setLevelling] = useState(false);
  /**
   * The console drawing the table's picture (R-76, D-274): the band, and the
   * party's fog over it. View state (R-64), off by default — the GM builds on
   * the whole map — and only while the party is in the open map, because the
   * fog is theirs.
   */
  const [partyView, setPartyView] = useState(false);
  /**
   * Is Alt/Option down — the dig modifier (R-160)?
   *
   * State rather than a ref, because the outline has to move the moment the key
   * goes down, with the pointer stationary. That is the whole of its
   * discoverability: press it and the wireframe drops under the cube, release
   * and it comes back, so the modifier teaches itself in one press.
   */
  const [digging, setDigging] = useState(false);
  /**
   * Is Shift down — the other mode of whichever tool is selected (R-162)?
   *
   * Build erases, Paint fills. Tracked exactly like Alt and for the same
   * reason: the outline has to answer the key with the pointer stationary, and
   * turning red under a held Shift is the whole of how the modifier is
   * discovered.
   */
  const [shifting, setShifting] = useState(false);
  /**
   * Which shape the brush lays down (R-164).
   *
   * Held as an id rather than the shape itself, so that the registry stays the
   * one place a brush is defined. View state (R-64), like the world's terrain
   * brush and for the same reason — how wide the GM is working is not a fact
   * about the campaign.
   */
  const [mapBrush, setMapBrush] = useState(DEFAULT_BRUSH.id);
  /**
   * Where the pointer last was over the canvas.
   *
   * Needed for the same reason: recomputing the outline on a *key* event means
   * re-picking at a position no pointer event is going to supply.
   */
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  /**
   * What the next click lays down: a material **and** the cut of it (R-176).
   *
   * One piece of state rather than two, because the list makes it one choice —
   * a row for the plain cut, a square beside it for one of that material's own.
   * Shades belong to the material, so "keep the shade, change the material"
   * is not a move the GM can make and not a state we have to hold (D-242).
   */
  const [swatch, setSwatch] = useState<SwatchId>(DEFAULT_FLOOR);
  /**
   * How the scene is lit (R-181) — sent to the host, and **held here while it
   * is being set**.
   *
   * It lives in the save, because the GM sets it for the table (D-250). But a
   * control that rebuilt the whole description from the *view* every time lost
   * changes: two fields moved inside one round trip each compose against a
   * value that has not come back yet, so the second overwrites the first.
   *
   * So the console owns it while the GM is working and adopts the save's value
   * when a campaign opens — the same shape as the tool and the brush beside
   * it, with a broadcast attached.
   */
  const [lighting, setLighting] = useState<Lighting>(DAYLIGHT);
  const relight = (next: Lighting) => {
    const lit = clampLighting(next);
    setLighting(lit);
    dispatch({ kind: 'setLighting', lighting: lit });
  };
  /**
   * The cell a place was just placed on, waiting for the snapshot that will carry
   * it. The host assigns the id, so the client cannot know it in advance — but
   * one place per cell (R-119) makes the cell an unambiguous handle until then.
   */
  const pendingPlaceCell = useRef<string | null>(null);
  const { setCanvas, canvas, stage, frames, draws } = useStage();
  const cost = useCost(stage, frames, draws);
  const openedId = useRef<string | null>(null);
  const drag = useRef<{ startY: number; base: number; cell: { cx: number; cz: number; x: number; z: number } } | null>(null);
  const panning = useRef<{ x: number; y: number } | null>(null);
  /**
   * The stroke in progress: which cell it last touched, and which axis it is
   * painting (R-193). Both tools drag identically — a cell under a stationary
   * pointer stays where it is — so they share one gesture and differ only in
   * the intent they send.
   */
  const painting = useRef<{ key: string; axis: 'ground' | 'cover' } | null>(null);
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

  /**
   * Whose ambience the card is editing (R-182): the open place's, or the
   * world's. The sun above it is the world's either way.
   */
  const litPoi = openPoi ?? null;
  const ambience = litPoi?.ambience ?? lighting.ambience;
  const litWhere = litPoi ? litPoi.name : 'the world';
  /*
   * The stage holds lights; this holds the description of them (R-181).
   *
   * Resolved the same way the table's is (R-182): the world's hour and sun,
   * with the ambience of whatever surface is open. `viewFor` does this for the
   * table and the console has to do it for itself, because it is not looking
   * at a view of its own screen.
   */

  const reambience = (next: Ambience) => {
    if (litPoi && openPlace) {
      dispatch({
        kind: 'setPoiAmbience', placeId: openPlace.id, poiId: litPoi.id, ambience: next,
      });
      return;
    }
    relight({ ...lighting, ambience: next });
  };

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
  /** The Party's view, while there is a party in the open map to see it. */
  const previewing = partyView && partyHere;
  /**
   * Showing the band alone, for either reason: levelling, or the Party's view,
   * which is the band with the fog over it. Everything R-159 says about the
   * first holds for the second — what is cut away is absent, so it is refused
   * rather than built into and lost.
   */
  const banded = levelling || previewing;
  /**
   * The band the open map is cut to (R-146).
   *
   * Read for whichever map is open, not for wherever the party is: the fade is
   * the GM's own working view, and cutting to one floor is how a multi-level
   * building gets built (D-201).
   */
  const openRange = openMap ? rangeIn(view?.save?.ranges ?? {}, openMap.poiId) : null;

  /**
   * Whether the sun is in what the GM is looking at (R-183).
   *
   * Only while levelling: with the whole body on screen the roof is there and
   * the sun belongs, however the band is set for the table.
   */
  const sunlit = !levelling || !openRange || sunReaches(openRange, MAP_MAX_HEIGHT);
  useEffect(() => {
    stage?.setLighting(litBy(lighting, ambience, sunlit));
  }, [stage, lighting, ambience, sunlit]);

  /**
   * Where the party stands in the open map (R-184) — present only when they
   * are in it. Positions in a map they have left are remembered (D-256), but
   * they are a memory: not drawn, and in nobody's way (R-186).
   *
   * Read through the roster, so a member removed mid-scene stands nowhere.
   * Memoised on the wire's own record, because the hover readout re-renders
   * the console on every pointer move and a fresh Map each time would rebuild
   * the tokens with it.
   */
  const roster = campaign?.party ?? null;
  const tokensWire = openMap ? view?.save?.tokens?.[openMap.poiId] : undefined;
  const present: Tokens = useMemo(
    () => (partyHere && openMap && roster
      ? onRoster(
        tokensIn({ [openMap.poiId]: tokensWire ?? {} }, openMap.poiId),
        roster.map((member) => ({ id: member.id as MemberId })),
      )
      : NO_TOKENS),
    [partyHere, openMap?.poiId, tokensWire, roster],
  );
  /**
   * Everyone in the open map who is not the party (R-206) — in every map,
   * whether or not the party is in it: the GM sets a cellar out in advance.
   * Memoised on the wire's own list for `present`'s reason.
   */
  const silverWire = openMap ? view?.save?.silver?.[openMap.poiId] : undefined;
  const silverHere = useMemo(() => (silverWire ? silverFromJSON(silverWire) : NO_SILVER), [silverWire]);
  /** The areas drawn on the open map (D-341), from the save. */
  const areasWire = openMap ? view?.save?.areas?.[openMap.poiId] : undefined;
  const areasHere = useMemo(() => areasFromJSON(areasWire), [areasWire]);
  /**
   * Which props stand open in the open map (D-322), from the save. The view
   * keeps an unchanged list the same array, so this is the same set until a
   * door moves.
   */
  const openedWire = openMap ? view?.save?.opened?.[openMap.poiId] : undefined;
  const openedHere = useMemo(() => new Set<string>(openedWire ?? []), [openedWire]);
  const library = view?.library ?? [];
  const silverName = (id: string) => silverHere.find((token) => token.id === id)?.name ?? null;
  /**
   * The roster as it stands in the open map: placed or not, inside the band
   * the table is shown or not, and how far each sees (R-184, R-46). The party
   * card counts from it; the On stage list draws it (R-208).
   */
  const partyRows = (roster ?? []).map((member) => {
    const at = present.get(member.id as MemberId) ?? null;
    return {
      id: member.id,
      name: member.name,
      colour: member.colour,
      standing: at !== null,
      onTable: at !== null && (!openRange || standsInBand(openRange, at)),
      sight: member.visionRange,
    };
  });
  /** Who is still waiting to be placed, in roster order (R-188). */
  const waiting = useMemo(
    () => (partyHere && roster
      ? unplaced(roster.map((member) => ({ id: member.id as MemberId })), present)
      : []),
    [partyHere, roster, present],
  );
  const nextToPlace = waiting[0] ?? null;
  const memberColour = (id: string) => roster?.find((member) => member.id === id)?.colour ?? '#ffffff';
  /** Their card's picture, or `null` for the colour (R-204). */
  const memberPicture = (id: string) => roster?.find((member) => member.id === id)?.image ?? null;
  /** The GM's notes on the members, one each across every map (D-315). */
  const memberNotes = useMemo(() => memberNotesFromJSON(view?.save?.memberNotes), [view?.save?.memberNotes]);
  /** The lights the members carry, one each across every map (D-335). */
  const carried = useMemo(() => carriedFromJSON(view?.save?.carried), [view?.save?.carried]);

  const cellKey = (c: { cx: number; cz: number; x: number; z: number }) => `${c.cx}:${c.cz}:${c.x}:${c.z}`;
  const memberName = (id: string) => campaign?.party.find((m) => m.id === id)?.name ?? null;
  /**
   * The place on a cell, if any — one per cell (R-119) — read from the wire
   * form the app actually holds.
   */
  const placeOn = (cell: { cx: number; cz: number; x: number; z: number } | null) =>
    (cell ? (campaign?.places ?? []).find((place) => sameWorldCell(place.cell, cell)) : null) ?? null;
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
    if (!decoded) return;
    const fresh = openedId.current !== campaign.id;
    stage.setCampaign(decoded, fresh);
    if (fresh) {
      stage.setTarget({ ...defaultTarget(worldCentre(decoded.world)), zoom: 34 });
      openedId.current = campaign.id;
      // Whatever hour this campaign was left at (R-181).
      setLighting(clampLighting(view?.save?.lighting ?? DAYLIGHT));
    }
    // R-79 lives in domain; the console draws from it and never restates it.
    stage.setSlots(creatableSlots(decoded.world));
    stage.setFogChunks(unknownChunks);
    // Discovery, not the whole save: a token stepping or the hour turning
    // changes the save and has nothing to do with the world (R-19a, D-270).
  }, [campaign, stage, view?.save?.discovery]);

  // The party moves far more often than the world changes (R-19a).
  useEffect(() => {
    stage?.setPlacement(view?.save ? decodePlacement(view.save.placement) : null);
  }, [view?.save?.placement, stage]);

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
   * What the console actually draws: the band alone while levelling, otherwise
   * everything (R-159).
   *
   * A *slice*, not a dimming. It is the same function the boundary uses to cut
   * the table's payload, which means the GM levelling is looking at precisely
   * what the table is looking at — and, just as importantly, that hidden blocks
   * are absent from the scene and so cannot be picked. A dimmed block is still
   * clickable, which is how a GM ends up editing something they cannot see.
   */
  const exploredWire = openMap ? view?.save?.explored?.[openMap.poiId] : undefined;
  const shownBody = useMemo(() => {
    const sliced = openBody && banded && openRange ? sliceOf(openBody, openRange) : openBody;
    // The Party's view draws only the props the party has seen, by the rule
    // the table's payload is cut with (D-331); the fog hides blocks, but a
    // prop is no block, and a fresh start left the furniture standing.
    if (!sliced || !previewing) return sliced;
    const props = propsSeen(sliced.props, exploredWire ? cellsFromWire(exploredWire) : NO_CELLS);
    return props === sliced.props ? sliced : { ...sliced, props };
  }, [openBody, banded, previewing, exploredWire, openRange?.lower, openRange?.upper]);

  /**
   * The party's fog, for the console's preview of the table (R-76, D-274):
   * the blocks the party sees now are lit, the ones they have only seen are
   * greyed, and the rest are drawn as nothing. Worked out from the whole body
   * and the save's own record by the same rule the filter cuts the table's
   * payload with (D-271), so the preview cannot disagree with the table.
   */
  const sightWire = view?.sight ?? null;
  const partyFog: StageFog | null = useMemo(() => {
    if (!previewing || !openBody) return null;
    return {
      // Blocks and props alike (D-332), by the rule the table's fog uses.
      lit: sightShows(openBody, sightWire ? cellsFromWire(sightWire) : NO_CELLS),
      shown: shownBy(openBody, exploredWire ? cellsFromWire(exploredWire) : NO_CELLS),
    };
  }, [previewing, openBody, sightWire, exploredWire]);
  useEffect(() => { stage?.setFog(partyFog); }, [stage, partyFog]);

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

  /**
   * The two held modifiers — Alt to dig (R-160), Shift for the tool's other
   * mode (R-162) — and the outline answers to both immediately.
   *
   * Three parts, and the last two are the ones that bite:
   *
   * - `keydown`/`keyup` read the modifier flags off the event rather than
   *   matching key names, because the pointer is not moving and because a
   *   `keyup` for Shift does not say which Shift.
   * - **Re-aim from the last pointer position** when it changes. Without this
   *   the GM holds Option and nothing happens until they twitch the mouse,
   *   which reads as the modifier being broken.
   * - **Clear on blur.** A window that loses focus while the key is held never
   *   receives the keyup, and the console would stay in dig mode with nothing
   *   on screen saying so.
   */
  useEffect(() => {
    const read = (e: KeyboardEvent) => { setDigging(e.altKey); setShifting(e.shiftKey); };
    const onBlur = () => { setDigging(false); setShifting(false); };
    addEventListener('keydown', read);
    addEventListener('keyup', read);
    addEventListener('blur', onBlur);
    return () => {
      removeEventListener('keydown', read);
      removeEventListener('keyup', read);
      removeEventListener('blur', onBlur);
    };
  }, []);

  useEffect(() => {
    if (!stage || !openMap) return;
    const at = lastPointer.current;
    if (!at) return;
    const picked = stage.pick(at.x, at.y);
    const action = mapAction(mapTool, picked.face, reach);
    const hover = mapHover(action, undefined, aimAt(action));
    setHoverLabel(hover.label);
    stage.showBlockGhost(hover.ghost, ghostTint(action));
    // Only what a still hand can change: the modifiers and the brush. A re-aim
    // on every render would fight the pointer.
  }, [digging, shifting, mapBrush]);

  // The compass follows the camera, on both surfaces (R-152, R-155).
  useEffect(() => {
    stage?.watchCamera(setBearing);
    return () => stage?.watchCamera(null);
  }, [stage]);

  // The open map is its own surface (R-148). Passing null returns to the world,
  // whose meshes were hidden rather than destroyed.
  useEffect(() => {
    if (!stage) return;
    const body = shownBody;
    // Keyed by which point of interest, not by the body: this effect reruns for
    // every block placed, because the wire hands back a new object each time
    // (D-185). The key is what tells the stage a *surface* changed, so the
    // camera frames a map once on the way in and never again (R-152).
    stage.setMap(
      body,
      DEFAULT_MATERIALS,
      openMap ? `${openMap.placeId}/${openMap.poiId}` : null,
    );
  }, [shownBody, openMap, stage]);

  // A point of interest whose map the GM deleted, or which they removed
  // outright, must not leave the console stranded on a surface that is gone.
  useEffect(() => {
    if (openMap && !openMapWire) setOpenMap(null);
  }, [openMap, openMapWire]);

  /*
   * The party in the open map (R-184). While levelling, only the ones standing
   * inside the band — the console then shows exactly what the table does
   * (R-159, R-185), and a token standing on a level that is not drawn would be
   * hanging over nothing.
   */
  useEffect(() => {
    if (!stage) return;
    const shown = banded && openRange ? tokensInBand(present, openRange) : present;
    const standing: Standing[] = [...shown].map(([memberId, at]) => ({
      memberId, at, colour: memberColour(memberId), picture: memberPicture(memberId),
      light: carried.get(memberId) ?? null,
    }));
    stage.setTokens(standing);
  }, [stage, present, banded, openRange?.lower, openRange?.upper, roster, carried]);

  /**
   * Everyone in the open map who is not the party (R-206), hidden ones too —
   * drawn faint, so the GM sees what the players do not. While levelling,
   * only the ones inside the band, for the party tokens' reason (R-185).
   */
  useEffect(() => {
    if (!stage) return;
    /*
     * The Party's view draws what the table is sent, by the rule that cuts
     * it (R-206): nobody hidden, nobody out of the party's present sight.
     * Otherwise, while levelling, the band; otherwise everyone, hidden ones
     * faint — the GM's own view.
     */
    const shown = previewing
      ? silverShown(silverHere, sightWire ? cellsFromWire(sightWire) : NO_CELLS, openRange ?? WHOLE_MAP)
      : banded && openRange ? silverInBand(silverHere, openRange) : silverHere;
    const pictureOf = (templateId: string) => library.find((entry) => entry.id === templateId)?.image ?? null;
    const present3d: Present[] = shown.map((token) => ({
      id: token.id, name: token.name, at: token.at, hidden: token.hidden, picture: pictureOf(token.templateId),
      light: token.light ?? null,
    }));
    stage.setSilver(present3d);
  }, [stage, silverHere, banded, previewing, sightWire, openRange?.lower, openRange?.upper, library]);

  // The ghost of a silver token being moved, where it would stand.
  useEffect(() => {
    if (mapTool !== 'spawn') stage?.aimSilver(silverMoveGhost(silverMove));
  }, [silverMove, stage, mapTool]);

  /**
   * The prefabs as the domain's shape, decoded once per prefab: the view
   * keeps an unchanged prefab the same object between pushes, so this only
   * decodes what changed.
   */
  const prefabWires = view?.prefabs;
  const prefabs = useMemo(
    () => (prefabWires ?? []).map((wire) => prefabFromJSON(wire)).filter((one): one is NonNullable<typeof one> => !!one),
    [prefabWires],
  );
  // With nothing saved there is nothing to place, so the tool opens on Capture
  // — a Place mode with an empty list is a tool where every click does nothing (D-324).
  useEffect(() => {
    if (mapTool === 'prefabs' && prefabs.length === 0) setPrefabMode('capture');
  }, [mapTool, prefabs.length]);
  // A prefab just saved is put in hand when it arrives: that is why it was made.
  useEffect(() => {
    if (awaitingPrefab.current === null || prefabs.length <= awaitingPrefab.current) return;
    awaitingPrefab.current = null;
    const newest = prefabs[prefabs.length - 1]!;
    setPlacing((now) => ({ ...now, id: newest.id }));
    setPrefabMode('place');
  }, [prefabs]);
  /** What the box being captured would save — or why it cannot be. */
  const captured = useMemo(
    () => (capture.step === 'done' && openBody ? capturePrefab(openBody, capture.box.min, capture.box.max) : null),
    [capture, openBody],
  );
  /*
   * The Prefabs tool's ghost, its box and its readout (D-321): drawn from
   * state rather than in the pointer handler, so a key that turns or mirrors
   * the prefab redraws it without the pointer moving.
   */
  useEffect(() => {
    if (!stage || !openMap || mapTool !== 'prefabs') return;
    if (prefabMode === 'capture') {
      stage.showPrefabGhost(null);
      const box = captureBox(capture, captureHover);
      stage.showBlockGhost(box ? [box.min, box.max] : [], 0x7fd4ff);
      setHoverLabel(capturePrompt(capture, captureHover));
      return;
    }
    const prefab = prefabs.find((one) => one.id === placing.id) ?? null;
    if (!prefab || !prefabAt || !openBody) {
      stage.showPrefabGhost(null);
      stage.showBlockGhost([]);
      setHoverLabel(placePrompt(prefab?.name ?? null, prefabAt, 0));
      return;
    }
    const preview = prefabPreview(prefab, prefabAt, placing, openBody);
    stage.showPrefabGhost(preview.cubes);
    // Orange while it will carve its box, so the GM sees the box is the edit.
    stage.showBlockGhost([preview.box.min, preview.box.max], placing.clear ? 0xff9a5a : 0xffffff);
    setHoverLabel(placePrompt(prefab.name, prefabAt, preview.outside));
  }, [stage, openMap, mapTool, prefabMode, capture, captureHover, placing, prefabAt, prefabs, openBody]);
  // The doors as the save has them, drawn open or shut (D-322).
  useEffect(() => { stage?.setOpened(openedHere); }, [stage, openedHere]);
  /** Where somebody on stage here stands, by id — what an area following them goes by (D-341). */
  const standingById = useCallback(
    (id: string) => present.get(id as MemberId) ?? silverHere.find((token) => token.id === id)?.at ?? null,
    [present, silverHere],
  );
  /*
   * The areas on the open map (D-341), each where it is now — the one being
   * drawn or moved where the drag has it. In the Party's view, only what the
   * table is sent: nothing hidden.
   */
  useEffect(() => {
    if (!stage) return;
    const seen = previewing ? areasHere.filter((area) => !area.hidden) : areasHere;
    /*
     * While levelling, or in the Party's view, only the areas that start on a
     * level being drawn, and their outlines cut where the levels are (D-348):
     * an area on a level cut away is cut away with it, as a token is (R-185).
     */
    const range = banded && openRange ? openRange : null;
    const shown = range ? seen.filter((area) => standsInBand(range, areaAt(area, standingById))) : seen;
    stage.setAreas(
      openMap ? areasShown(shown, mapTool === 'measure' ? measure : null, standingById) : null,
      range ? range.upper : null,
    );
  }, [stage, openMap, areasHere, measure, mapTool, standingById, previewing, banded, openRange?.lower, openRange?.upper]);
  // The ruler: this screen's alone (D-341).
  useEffect(() => {
    stage?.showRuler(openMap && mapTool === 'measure' ? rulerShown(measure) : null);
  }, [stage, openMap, mapTool, measure]);
  useEffect(() => {
    if (openMap && mapTool === 'measure') setHoverLabel(measurePrompt(measure, overHandle));
  }, [openMap, mapTool, measure, overHandle]);
  /** Every cube somebody stands in, gold or silver: a prop keeps out of them (R-186). */
  const standingCubes = useMemo(
    () => new Set<string>([...[...present.values()].map(blockKey), ...silverCubes(silverHere)]),
    [present, silverHere],
  );
  /*
   * The Props tool's ghost, outline and readout (D-328), drawn from state so
   * a turn by key redraws it without the pointer moving: the prop in hand
   * where it would stand — red where it cannot — or the selected prop framed.
   */
  useEffect(() => {
    if (!stage || !openMap || mapTool !== 'props' || !openBody) return;
    if (propHand.type) {
      const preview = propAt ? propPreview(openBody, propHand, propAt, standingCubes, propWallAt) : null;
      stage.showPropGhost(preview?.ghost ?? null);
      stage.showBlockGhost(preview ? [preview.box.min, preview.box.max] : [], preview?.why ? 0xff6b6b : 0xffffff);
      const type = propType(propHand.type);
      setHoverLabel(propPrompt(type ?? null, propAt, preview?.why ?? null));
      return;
    }
    stage.showPropGhost(null);
    const chosen = selectedProp ? propById(openBody.props, selectedProp) : null;
    if (chosen) {
      const box = propBox(chosen);
      stage.showBlockGhost([box.min, box.max], 0x7fd4ff);
      setHoverLabel(`${propType(chosen.type)?.name ?? 'Prop'} selected — change it in the panel, or Escape to let go.`);
      return;
    }
    stage.showBlockGhost([]);
    setHoverLabel(propPrompt(null, null, null));
  }, [stage, openMap, mapTool, openBody, propHand, propAt, propWallAt, selectedProp, standingCubes]);
  // A prop removed, or undone away, is no longer selected.
  useEffect(() => {
    if (selectedProp && openBody && !propById(openBody.props, selectedProp)) setSelectedProp(null);
  }, [selectedProp, openBody]);

  // Putting the tool down, or changing map, drops the ghost and any half-drawn box.
  useEffect(() => {
    stage?.showPrefabGhost(null);
    stage?.showPropGhost(null);
    stage?.showBlockGhost([]);
    setCapture(NO_CAPTURE);
    setPrefabAt(null);
    setCaptureHover(null);
    setPropAt(null);
    setPropWallAt(null);
    setSelectedProp(null);
    setMeasure(measureCleared(measureRef.current));
    setOverHandle(false);
  }, [mapTool, openMap?.poiId, stage]);

  // Changing tool, or map, drops a silver token in hand and the Spawn ghost.
  useEffect(() => {
    setSilverMove(noSilverMove);
    stage?.aimSilver(null);
  }, [mapTool, openMap?.poiId, stage]);

  // Somebody waiting to be placed and Move in hand: the sequence holds them
  // ready, first in roster order, and the next after each confirm (D-167,
  // R-188). Keyed on the tool and on who is next, so Escape stays escaped.
  useEffect(() => {
    setStride((current) => armedStride(current, mapTool === 'move' && partyHere, nextToPlace));
  }, [mapTool, partyHere, nextToPlace]);

  // A different surface, or none, is a different sequence.
  useEffect(() => { setStride(still); }, [openMap?.placeId, openMap?.poiId]);

  useEffect(() => {
    stage?.aimToken(
      strideGhost(stride),
      stride.step === 'aiming' ? memberColour(stride.memberId) : undefined,
    );
  }, [stride, stage]);

  /**
   * Whether the member being moved may stand in a cube, judged from the whole
   * body — the console holds all of it — and, while levelling, from the band
   * the GM is looking at, which is R-159's rule for building too (R-185).
   */
  const strideVerdict = (memberId: string, at: BlockCoord) => (openBody
    ? standVerdict(
      openBody, present, memberId, at, banded && openRange ? { band: openRange } : null,
      null, silverCubes(silverHere), openedHere,
    )
    : 'outside the map');
  /** Whether a silver token may stand there, or why not (R-206). */
  const silverVerdictAt = (at: BlockCoord, self?: string) => (openBody
    ? silverVerdict(openBody, present, silverHere, at, banded && openRange ? openRange : null, self, openedHere)
    : 'outside the map');

  /**
   * The walk the token being moved would take, and how far (R-209) — a party
   * member's or a silver token's, whichever is in hand. Over the whole body,
   * and while levelling only the band's floors, which are the ones drawn.
   * Worked out when the aim changes cube, since both aims keep their identity
   * until then.
   */
  const walk = useMemo(() => {
    const may = banded && openRange
      ? (at: BlockCoord) => standsInBand(openRange, at)
      : undefined;
    if (stride.step === 'aiming') {
      return walkShown(openBody, present.get(stride.memberId as MemberId) ?? null, strideGhost(stride), may, openedHere);
    }
    if (silverMove.step === 'aiming' && mapTool !== 'spawn') {
      const from = silverHere.find((token) => token.id === silverMove.id)?.at ?? null;
      return walkShown(openBody, from, silverMoveGhost(silverMove), may, openedHere);
    }
    return null;
  }, [openBody, stride, silverMove, mapTool, present, silverHere, banded, openRange?.lower, openRange?.upper, openedHere]);
  useEffect(() => {
    stage?.showWalk(walk, stride.step === 'aiming' ? memberColour(stride.memberId) : SILVER);
  }, [walk, stage]);

  // With nothing on the board there is no pawn to pick up, so the sequence
  // starts itself (D-167).
  useEffect(() => {
    setTravel((current) => armed(current, tool === 'travel', partyPlaced));
  }, [tool, partyPlaced]);

  // Putting the Places tool down, or opening a map, puts a carried place back:
  // it was never sent, so there is nothing else to undo (R-203).
  useEffect(() => {
    setHands(emptyHanded);
    // And forgets where it was aiming, so coming back does not show a ghost
    // on a cell the pointer left a tool ago.
    setPlaceAim(null);
  }, [tool, openMap]);

  // An inspector open under Paint describes something that tool cannot act on
  // (D-168). Only the neutral tool holds a selection.
  useEffect(() => {
    if (holdsSelection(tool)) return;
    setSelectedPlace(null);
    setSelectedChunk(null);
  }, [tool]);

  /**
   * The campaign as domain types, decoded once per push.
   *
   * The scene needed this anyway; the readout below used to reach into the
   * wire's own arrays instead, which stopped working the day terrain was
   * packed (D-220) and was the wrong shape before that. A console should not
   * need to know how a chunk is encoded to say what is under the pointer.
   */
  const decoded = useMemo(() => (campaign ? decodeCampaign(campaign) : null), [campaign]);

  /**
   * The route under the pointer during the aim step (R-197, O-019).
   *
   * Keyed on `travel`, which is **identity-preserving within a cell** (R-165):
   * `aim` hands back the same object while the pointer wanders inside one
   * cell, so this runs when the pointer crosses into a new one and not on
   * every move. An A* per pointer move would have been the obvious reading of
   * R-132 and the wrong one.
   *
   * It needs the party's own cell to start from, and the discovery to stay out
   * of ground nobody has seen (R-133).
   */
  useEffect(() => {
    if (!stage) return;
    const placed = view?.save ? decodePlacement(view.save.placement) : null;
    const known = view?.save ? discoveryFromJSON(view.save.discovery) : null;
    // Where the mover is standing now: the whole party, or the one pawn.
    const from = travel.step !== 'idle'
      ? (travel.pawn.memberId
        ? placed?.members.get(travel.pawn.memberId as MemberId) ?? null
        : placed?.at ?? null)
      : null;
    const to = aimedAt(travel);
    if (!decoded || !known || !from || !to) {
      setRoute(null);
      stage.showRoute(null, '#ffffff');
      return;
    }
    const route = routeAcross(
      decoded.world,
      known,
      travelling,
      toGlobal({ cx: from.cx, cz: from.cz }, from.x, from.z),
      toGlobal({ cx: to.cx, cz: to.cz }, to.x, to.z),
    );
    setRoute(route);
    stage.showRoute(
      route?.cells ?? null,
      travel.step !== 'idle' && travel.pawn.memberId
        ? memberColour(travel.pawn.memberId)
        : '#e6e9ef',
    );
  }, [travel, stage, decoded, travelling, view?.save?.discovery, view?.save?.placement]);

  const columnInfo = useCallback((cell: { cx: number; cz: number; x: number; z: number }) => {
    const chunk = decoded ? chunkAt(decoded.world, { cx: cell.cx, cz: cell.cz }) : null;
    if (!chunk) return null;
    const column = columnAt(chunk, cell.x, cell.z);
    if (!column) return null;
    return {
      height: column.height,
      terrain: (() => {
        // The cut's name, which is what a GM says out loud (R-178).
        const family = familyOf(column.ground);
        return family ? cutOf(family, cutIdIn(column.ground)).name : (column.ground as string);
      })(),
    };
  }, [decoded, campaign]);

  /**
   * Where a place would go, and the faint copy of the one in hand (R-203).
   *
   * From state rather than from the pointer handler, so that Z / X — which
   * move no pointer — turn the ghost where it stands. The ghost shows only
   * where the click would actually land something: bare ground, or the
   * carried place's own cell. Over another place the readout says why not.
   */
  useEffect(() => {
    if (!stage) return;
    if (tool !== 'places' || openMap) {
      stage.showPlaceGhost(null);
      stage.dimPlace(null);
      return;
    }
    const carried = hands.step === 'carrying'
      ? campaign?.places.find((place) => place.id === hands.placeId) ?? null
      : null;
    stage.dimPlace(carried?.id ?? null);
    const occupant = placeAim
      ? (campaign?.places ?? []).find((place) => sameWorldCell(place.cell, placeAim))?.id ?? null
      : null;
    const lands = hands.step === 'carrying'
      ? canSetDown(hands, occupant)
      : occupant === null;
    stage.showPlaceGhost(
      lands ? placeAim : null,
      carried ? carried.markerId : markerId,
      hands.step === 'carrying' ? hands.facing : facing,
    );
    /*
     * The readout, from the same state and for the same reason: it says what
     * the click will do *before* it is made, including when it will do
     * nothing (R-18) — and it has to be right the moment a place is picked
     * up or set down, not on the next pointer move. It was, for one build,
     * still offering to set down a place that had just been set down.
     */
    const here = placeAim
      ? (campaign?.places ?? []).find((place) => sameWorldCell(place.cell, placeAim)) ?? null
      : null;
    const prompt = placesPrompt(hands, here, carried?.name ?? null);
    if (prompt) { setHoverLabel(prompt); return; }
    const info = placeAim ? columnInfo(placeAim) : null;
    setHoverLabel(info ? `${info.terrain}, height ${info.height}` : null);
  }, [stage, tool, openMap, hands, placeAim, facing, markerId, campaign?.places, columnInfo]);

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
  /**
   * What the tool is aimed at, and whether it may act (R-159).
   *
   * The occupancy check reads the **whole** body, not the slice the GM is
   * shown: the point is to catch a cell that holds a block they cannot see.
   * Asking the drawn geometry would answer "empty" and be exactly wrong.
   */
  /**
   * What the pointer is carrying: the brush, the held keys, and the levels the
   * GM is allowed to reach (R-162).
   *
   * Assembled once and passed to every `mapAction` call, so pointer-down and
   * pointer-move cannot disagree about what a gesture means — which is the
   * same reason `mapEdit` is one function and not a branch in each.
   */
  const reach: MapReach = {
    brush: brushById(mapBrush),
    alt: digging,
    shift: shifting,
    within: banded ? openRange ?? WHOLE_MAP : null,
  };

  /**
   * What colour the outline takes, which is the whole of how a mode announces
   * itself (R-162).
   *
   * **White, except red for erase.** I tried tinting it with the material about
   * to be laid down, on the theory that the GM would see the colour before the
   * click. It reads badly for the obvious reason, once you watch someone use
   * it: the cube you are about to place is nearly always against cubes of the
   * same material, so the outline disappears into exactly the surface it is
   * supposed to stand out from — and the material is already named and swatched
   * in the palette two cards up. Red for erase survives because it is not a
   * material at all, and because contrast is the point of it.
   */
  const ERASE_TINT = 0xff5964;
  const ghostTint = (action: MapAction): number =>
    (action.kind === 'erase' ? ERASE_TINT : 0xffffff);

  const aimAt = (action: MapAction) => {
    const occupied = action.kind !== 'nothing' && !!openBody
      && !!blockAt(openBody, action.at);
    const inBounds = action.kind === 'nothing' || (!!openBody && inMap(openBody, action.at));
    // Somebody's cube is clipped out of a build by the host (R-186); a click
    // aimed straight at one says so instead of earning a toast.
    const standing = action.kind !== 'nothing' && standingAt(present, action.at) !== null;
    return mapAllowed(action, { occupied, inBounds, standing });
  };

  const mapEdit = (action: MapAction, stroke: string | null) => {
    if (!openMap || action.kind === 'nothing') return;
    const which = { placeId: openMap.placeId, poiId: openMap.poiId };
    const tagged = stroke ? { stroke } : {};
    switch (action.kind) {
      case 'place':
        // The whole patch in one intent: one undo, one write, one broadcast,
        // however wide the brush (R-162).
        dispatch({ kind: 'setBlock', ...which, cells: action.cells, swatch, ...tagged });
        return;
      case 'paint':
        // Its own intent, not `setBlock` with different cells. The two are
        // refused for opposite reasons — build will not overwrite, paint will
        // not conjure — and one intent could not do both (R-159).
        dispatch({ kind: 'paintBlock', ...which, cells: action.cells, swatch, ...tagged });
        return;
      case 'erase':
        dispatch({ kind: 'clearBlock', ...which, cells: action.cells, ...tagged });
        return;
      case 'fill':
        // No stroke: a fill is already one intent covering a whole region, so
        // it is one undo without any help.
        dispatch({ kind: 'fillMaterial', ...which, ...action.at, swatch });
        return;
    }
  };

  /**
   * The cube the Measure tool means (D-341): where somebody stands, when the
   * pointer is on them — a ruler from Galion, an aura round a goblin — and
   * otherwise the cube against the face pointed at, as a token would stand.
   */
  const measuredAt = (picked: Picked): BlockCoord | null => {
    if (picked.token) return present.get(picked.token.memberId as MemberId) ?? null;
    if (picked.silver) return silverHere.find((token) => token.id === picked.silver)?.at ?? null;
    return picked.face?.adjacent ?? null;
  };
  /**
   * Where the ruler ends (D-342): the middle of the face under the pointer, as
   * every tool's aim sits on the face it points at — or, on somebody, the
   * middle of the floor they stand on.
   */
  const measuredPoint = (picked: Picked): RulerPoint | null => {
    if (picked.token || picked.silver) {
      const at = measuredAt(picked);
      return at ? floorCentre(at) : null;
    }
    return picked.face ? faceCentre(picked.face) : null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!stage || !campaign) return;
    if (e.button === 2 || e.button === 1) {
      // Right-click cancels a move in progress instead of starting a pan: it is
      // the universal "never mind" and the hand is already on the mouse (D-165).
      if (travel.step !== 'idle') {
        setTravel(idle);
        stage.showHighlight(null, 0);
        return;
      }
      if (openMap && stride.step === 'aiming') {
        setStride(still);
        return;
      }
      if (openMap && silverMove.step === 'aiming') {
        setSilverMove(noSilverMove);
        return;
      }
      // A place in hand goes back where it came from — nothing was sent, so
      // there is nothing to undo (R-203).
      if (!openMap && hands.step === 'carrying') {
        setHands(emptyHanded);
        return;
      }
      panning.current = { x: e.clientX, y: e.clientY };
      return;
    }
    const picked = stage.pick(e.clientX, e.clientY);

    // Inside a map, the world's tool table does not apply at all (R-148).
    if (openMap && mapTool === 'move') {
      // Move picks tokens, then a floor (R-188). A move in progress owns the
      // click: it confirms on a cube the member may stand in, judged where the
      // click landed, and cancels anywhere else. Silver tokens too, on the
      // console alone (R-206).
      const act = tokenAction(
        picked.token, stride.step === 'aiming' || silverMove.step === 'aiming', picked.silver,
      );
      if (act.kind === 'confirm' && stride.step === 'aiming') {
        const at = tokenAim(picked.face, picked.propFace);
        if (at && strideVerdict(stride.memberId, at) === null) {
          dispatch(strideIntent(stride, at, openMap.placeId, openMap.poiId));
        }
        setStride(still);
        return;
      }
      if (act.kind === 'confirm' && silverMove.step === 'aiming') {
        const at = tokenAim(picked.face, picked.propFace);
        if (at && silverVerdictAt(at, silverMove.id) === null) {
          dispatch(silverMoveIntent(silverMove, at, openMap.placeId, openMap.poiId));
        }
        setSilverMove(noSilverMove);
        return;
      }
      // Nothing to pick up: a door under the pointer opens or shuts (D-328).
      if (act.kind === 'nothing' && picked.prop && openBody) {
        const intent = toggleIntent(openBody, picked.prop, openedHere, openMap.placeId, openMap.poiId);
        if (intent) dispatch(intent);
        return;
      }
      if (act.kind === 'pickToken') setStride(grab(act.memberId));
      if (act.kind === 'pickSilver') setSilverMove(grabSilver(act.id));
      return;
    }
    /*
     * Measure (D-341): a press starts the ruler or an area where it lands — on
     * somebody, from where they stand — or, on an area's handle, picks the
     * area up to move it.
     */
    if (openMap && mapTool === 'measure') {
      const at = measuredAt(picked);
      setMeasure(measurePress(measureRef.current, at, handleAt(areasHere, at, standingById), measuredPoint(picked)));
      return;
    }
    /*
     * Props (D-328): with one in hand, a click puts it down where the ghost
     * stands, one per click; with nothing in hand, a click on a prop selects
     * it, and anywhere else lets go.
     */
    if (openMap && mapTool === 'props') {
      if (propHand.type) {
        const at = propAim(picked.face, picked.propFace);
        const wall = propWall(picked.face, picked.propFace);
        const preview = at && openBody ? propPreview(openBody, propHand, at, standingCubes, wall) : null;
        const intent = at && preview && !preview.why ? placePropIntent(propHand, at, openMap.placeId, openMap.poiId, wall) : null;
        if (intent) dispatch(intent);
        return;
      }
      setSelectedProp(picked.prop);
      return;
    }
    /*
     * Prefabs (D-321): capturing takes a corner per click; placing stamps
     * the prefab in hand where the ghost stands, and keeps it in hand — a
     * row of trees is a click each.
     */
    if (openMap && mapTool === 'prefabs') {
      if (prefabMode === 'capture') {
        // Three clicks (D-325): a corner, the area's far corner, the height —
        // which is the block clicked, the top of the tree (D-326).
        const at = capture.step === 'height'
          ? picked.face?.block ?? null
          : captureCorner(picked.face, e.shiftKey);
        setCapture((now) => captureClick(now, at));
        return;
      }
      const at = prefabAim(picked.face);
      const intent = at ? placeIntent(placing, at, openMap.placeId, openMap.poiId) : null;
      if (intent) dispatch(intent);
      return;
    }
    /*
     * Spawn places another of the chosen entry on the floor clicked, and
     * stays in hand (D-307): five goblins are five clicks. A floor the token
     * cannot stand on does nothing; the readout has already said why.
     */
    if (openMap && mapTool === 'spawn') {
      const at = tokenAim(picked.face, picked.propFace);
      if (chosenTemplate && at && silverVerdictAt(at) === null) {
        dispatch(spawnIntent(chosenTemplate, at, openMap.placeId, openMap.poiId));
      }
      return;
    }
    // A Paint click on a prop paints that prop and nothing else (D-352).
    if (openMap && mapTool === 'paint' && picked.prop && openBody) {
      const intent = paintPropIntent(openBody, picked.prop, swatch, openMap.placeId, openMap.poiId);
      if (intent) dispatch(intent);
      return;
    }
    if (openMap) {
      const action = mapAction(mapTool, picked.face, reach);
      // Refused here as well as by the host, so a click the readout already
      // called impossible never becomes a rejection toast (R-159).
      if (aimAt(action).kind === 'stop') return;
      // Only the brush keeps acting as the pointer moves (R-153), and when it
      // does the whole drag is one undo, so the stroke id is generated here.
      if (mapDrags(action)) {
        blockStroke.current = newStroke();
        lastBlock.current = null;
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      mapEdit(action, blockStroke.current);
      return;
    }

    /*
     * A place in hand: the click sets it down (R-203). On bare ground or its
     * own cell it lands and the hands are empty; on another place, or off the
     * world, it stays in hand — a misclick should not undo the turning.
     */
    if (hands.step === 'carrying') {
      const occupant = placeOn(picked.column)?.id ?? null;
      const intent = setDownIntent(hands, picked.column, occupant);
      if (intent) dispatch(intent);
      if (picked.column && canSetDown(hands, occupant)) setHands(emptyHanded);
      return;
    }

    // Mid-sequence, the click means confirm or cancel and nothing else (R-132).
    if (travel.step === 'aiming') {
      /*
       * The click no longer sends the move: it opens the costing step, where
       * the transport is chosen and the journey is reported in days (R-199).
       * An unreachable cell is still a cancel — `choose` refuses it, and
       * there is nothing worth costing.
       */
      const next = choose(travel);
      setTravel(next.step === 'choosing' ? next : idle);
      if (next.step !== 'choosing') stage.showHighlight(null, 0);
      return;
    }
    // While the menu is open the map is not taking clicks: the answer is in
    // the panel, and a stray click on the world must not move anybody.
    if (travel.step === 'choosing') return;

    // What the click meant is decided by the tested table in `client-core`
    // (R-87c), not by the order of `if`s in a pointer handler. This switch only
    // carries it out.
    const action = clickAction(tool, {
      pawn: picked.pawn,
      placeId: picked.placeId,
      cell: picked.column,
      slot: picked.slot,
    }, { placeAt: (cell) => placeOn(cell)?.id ?? null });

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
        dispatch({ kind: 'addPlace', cell: { cx, cz, x, z }, markerId, facing });
        return;
      }

      case 'pickPlace': {
        const place = campaign.places.find((candidate) => candidate.id === action.placeId);
        if (place) setHands(pickUp(place.id, place.cell, asFacing(place.facing)));
        return;
      }

      case 'paint':
        painting.current = { key: cellKey(action.cell), axis: 'ground' };
        dispatch({ kind: 'paintGround', ...action.cell, ground, size: brush, stroke: newStroke() });
        e.currentTarget.setPointerCapture(e.pointerId);
        return;

      case 'cover':
        painting.current = { key: cellKey(action.cell), axis: 'cover' };
        dispatch({ kind: 'paintCover', ...action.cell, cover, size: brush, stroke: newStroke() });
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

    if (openMap && mapTool === 'move') {
      lastPointer.current = { x: e.clientX, y: e.clientY };
      stage.showBlockGhost([]);
      const picked = stage.pick(e.clientX, e.clientY);
      if (stride.step === 'aiming') {
        // The ghost follows the pointer only onto a floor the member may stand
        // on; anywhere else the prompt says why (R-138).
        const at = tokenAim(picked.face, picked.propFace);
        setStride((current) => (current.step === 'aiming'
          ? aimStride(current, at, at ? strideVerdict(current.memberId, at) : null)
          : current));
        setHoverLabel(null);
        return;
      }
      if (silverMove.step === 'aiming') {
        const at = tokenAim(picked.face, picked.propFace);
        setSilverMove((current) => (current.step === 'aiming'
          ? aimSilverMove(current, at, at ? silverVerdictAt(at, current.id) : null)
          : current));
        setHoverLabel(null);
        return;
      }
      const name = picked.token
        ? memberName(picked.token.memberId)
        : picked.silver ? silverName(picked.silver) : null;
      // A door, when there is no token under the pointer: a click opens it (D-328).
      const door = !name && picked.prop && openBody ? toggleLabel(openBody, picked.prop, openedHere) : null;
      setHoverLabel(name ? `Pick up ${name}` : door);
      return;
    }

    if (openMap && mapTool === 'measure') {
      lastPointer.current = { x: e.clientX, y: e.clientY };
      const picked = stage.pick(e.clientX, e.clientY);
      const at = measuredAt(picked);
      const now = measureRef.current;
      const next = measureDrag(now, at, measuredPoint(picked));
      if (next !== now) setMeasure(next);
      setOverHandle(!now.held && handleAt(areasHere, at, standingById) !== null);
      return;
    }

    if (openMap && mapTool === 'props') {
      lastPointer.current = { x: e.clientX, y: e.clientY };
      const picked = stage.pick(e.clientX, e.clientY);
      const at = propAim(picked.face, picked.propFace);
      setPropAt((now) => (now === at || (now && at && now.x === at.x && now.y === at.y && now.z === at.z) ? now : at));
      setPropWallAt(propWall(picked.face, picked.propFace));
      return;
    }

    if (openMap && mapTool === 'prefabs') {
      lastPointer.current = { x: e.clientX, y: e.clientY };
      const face = stage.pick(e.clientX, e.clientY).face;
      // Only when the pointer reaches another cube: the ghost is drawn from
      // these, and the same cube again must not redraw a thousand of them.
      const same = (a: BlockCoord | null, b: BlockCoord | null) =>
        a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.z === b.z);
      if (prefabMode === 'capture') {
        // Setting the height, the block under the pointer is the top (D-326).
        if (capture.step === 'height') {
          const block = face?.block ?? null;
          setCapture((now) => captureHeight(now, block));
          return;
        }
        const at = captureCorner(face, e.shiftKey);
        setCaptureHover((now) => (same(now, at) ? now : at));
      } else {
        const at = prefabAim(face);
        setPrefabAt((now) => (same(now, at) ? now : at));
      }
      return;
    }

    if (openMap && mapTool === 'spawn') {
      lastPointer.current = { x: e.clientX, y: e.clientY };
      stage.showBlockGhost([]);
      const spot = stage.pick(e.clientX, e.clientY);
      const at = tokenAim(spot.face, spot.propFace);
      const why = at ? silverVerdictAt(at) : null;
      stage.aimSilver(chosenTemplate && at && why === null ? at : null);
      const entry = chosenTemplate ? library.find((one) => one.id === chosenTemplate)?.name ?? null : null;
      setHoverLabel(spawnPrompt(entry, at, why));
      return;
    }

    if (openMap) {
      lastPointer.current = { x: e.clientX, y: e.clientY };
      const picked = stage.pick(e.clientX, e.clientY);
      // Paint over a prop paints that prop, and only it, whatever the brush —
      // a fill included (D-352). A stroke under way paints blocks alone.
      const painted = mapTool === 'paint' && blockStroke.current === null && picked.prop && openBody
        ? propById(openBody.props, picked.prop) : null;
      if (painted && openBody) {
        const box = propBox(painted);
        stage.showBlockGhost([box.min, box.max], 0xffffff);
        setHoverLabel(paintPropPrompt(openBody, painted.id, swatch));
        return;
      }
      const action = mapAction(mapTool, picked.face, reach);
      const verdict = aimAt(action);
      // A fill follows connected material straight through a cut, so while
      // levelling it also reports how much of its reach is out of sight.
      const fill = action.kind === 'fill' && openBody
        ? (() => {
          const cells = fillRegion(openBody, action.at);
          const range = openRange ?? WHOLE_MAP;
          return {
            total: cells.length,
            unseen: banded ? cells.filter((c) => !inRange(range, c.y)).length : 0,
          };
        })()
        : undefined;
      const hover = mapHover(action, fill, verdict);
      setHoverLabel(hover.label);
      stage.showBlockGhost(hover.ghost, ghostTint(action));

      // Build and erase only ever *show* what a click would do (R-153): they
      // move their own target, so a hand that drifts mid-click would climb.
      // The brush does not, so it paints every new block it crosses — once
      // each, under the one stroke id that makes the drag a single undo.
      if (blockStroke.current === null || action.kind === 'nothing') return;
      if (verdict.kind === 'stop') return;
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
      const column = picked.column;
      // The ghost and the readout are drawn by an effect from this, so a
      // Z / X or a set-down with the pointer still updates both; replaced
      // only on crossing into a new cell.
      setPlaceAim((current) => (
        current === column || (current && column && sameWorldCell(current, column)) ? current : column
      ));
      return;
    }

    if (painting.current !== null) {
      // Drag to paint: each newly entered cell is painted once (R-88, R-87).
      const picked = stage.pick(e.clientX, e.clientY);
      if (picked.column) {
        const key = cellKey(picked.column);
        stage.showHighlight(picked.column, heightAt(picked.column), brush);
        if (key !== painting.current.key) {
          const tagged = stroke.current ? { stroke: stroke.current } : {};
          const axis = painting.current.axis;
          painting.current = { key, axis };
          dispatch(axis === 'cover'
            ? { kind: 'paintCover', ...picked.column, cover, size: brush, ...tagged }
            : { kind: 'paintGround', ...picked.column, ground, size: brush, ...tagged });
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

  /** The pointer coming up: a drag with the Measure tool is finished, and what it drew is sent (D-341). */
  const onPointerUp = () => {
    if (openMap && mapTool === 'measure' && measureRef.current.held) {
      const { hand, intent } = measureRelease(measureRef.current, openMap.placeId, openMap.poiId);
      setMeasure(hand);
      if (intent) dispatch(intent);
    }
    endGesture();
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
    lastPointer.current = null;
    /*
     * The Prefabs tool draws from its own state, and a box being captured is
     * not a hover: it is what the GM is about to name in the panel, which is
     * exactly where the pointer goes next. Clearing every outline on leaving
     * the map made it vanish while it was being named (D-327). Only what
     * followed the pointer goes — the placing ghost, the cube under it before
     * a first corner — and the effect redraws the rest.
     */
    if (openMap && mapTool === 'prefabs') {
      setPrefabAt(null);
      if (capture.step === 'start') setCaptureHover(null);
      return;
    }
    // The same for props: the ghost goes, the selected prop's outline stays.
    if (openMap && mapTool === 'props') {
      setPropAt(null);
      setPropWallAt(null);
      return;
    }
    // A drag that leaves the map is let go of, not finished: nothing is sent.
    if (openMap && mapTool === 'measure') {
      if (measureRef.current.held) setMeasure(measureCleared(measureRef.current));
      setOverHandle(false);
      return;
    }
    setHoverLabel(null);
    stage?.showBlockGhost([]);
  };

  /*
   * The wheel zooms, by the same step as on the table (R-156). Attached here
   * with `passive: false` rather than as `onWheel`, because React attaches
   * wheel handlers as passive: the `preventDefault` in one is ignored, with an
   * error in the console on every tick. Keyed on the canvas in state, not a
   * ref, for the reason `useStage` gives.
   */
  useEffect(() => {
    if (!canvas || !stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stage.nudgeZoom(wheelZoom(e.deltaY));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [canvas, stage]);

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

      const digit = /^(?:Digit|Numpad)([0-9])$/.exec(e.code)?.[1];
      if (openMap) {
        if (digit === '1') { setMapTool('build'); return; }
        if (digit === '2') { setMapTool('paint'); return; }
        // Tools along the digits, left to right, as in the world (D-160).
        if (digit === '3') { setMapTool('move'); return; }
        // The fourth (D-307): everyone else, from the Tokens Library.
        if (digit === '4') { setMapTool('spawn'); return; }
        // The fifth (D-321): pieces of map, saved and stamped.
        if (digit === '5') { setMapTool('prefabs'); return; }
        // The sixth (D-328): doors, bars and furniture.
        if (digit === '6') { setMapTool('props'); return; }
        // The seventh (D-341): the ruler, and areas.
        if (digit === '7') { setMapTool('measure'); return; }
        // Backspace — or Delete, where there is one — removes the prop selected
        // (D-330). A field being typed in never gets here (the guard above).
        if (mapTool === 'props' && (e.code === 'Backspace' || e.code === 'Delete') && selectedProp && openMap) {
          e.preventDefault();
          dispatch({ kind: 'removeProp', placeId: openMap.placeId, poiId: openMap.poiId, id: selectedProp });
          setSelectedProp(null);
          return;
        }
        // Z / X turn the prop in hand, or the one selected (R-203).
        if (mapTool === 'props' && (e.code === 'KeyZ' || e.code === 'KeyX')) {
          const step = e.code === 'KeyX' ? 1 : -1;
          if (propHand.type) setPropHand((now) => turnHand(now, step));
          else if (selectedProp && openBody && openMap) {
            const prop = propById(openBody.props, selectedProp);
            if (prop) {
              dispatch({ kind: 'editProp', placeId: openMap.placeId, poiId: openMap.poiId, id: prop.id, facing: turned(prop.facing, step) });
            }
          }
          return;
        }
        // Z / X turn the prefab in hand, as they turn a place (R-203); M mirrors it.
        if (mapTool === 'prefabs' && (e.code === 'KeyZ' || e.code === 'KeyX')) {
          setPlacing((now) => turnPlacing(now, e.code === 'KeyX' ? 1 : -1));
          return;
        }
        if (mapTool === 'prefabs' && e.code === 'KeyM') {
          setPlacing(mirrorPlacing);
          return;
        }
        // The brushes run along the digits from 8, after the seven tools, as the
        // world's terrain brushes do (R-164) — and on past 0 to minus and equals
        // (D-328, D-341).
        const KEYS = ['8', '9', '0'];
        const picked = e.code === 'Minus' ? 3 : e.code === 'Equal' ? 4 : digit ? KEYS.indexOf(digit) : -1;
        if (picked >= 0 && picked < BRUSHES.length) {
          setMapBrush(BRUSHES[picked]!.id);
          return;
        }
        // And `[` `]` step through them in order, as they do in the world.
        if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
          const step = e.code === 'BracketRight' ? 1 : -1;
          setMapBrush((id) => {
            const now = BRUSHES.findIndex((brush) => brush.id === id);
            const next = Math.min(BRUSHES.length - 1, Math.max(0, now + step));
            return BRUSHES[next]!.id;
          });
          return;
        }
        if (e.code === 'Escape') {
          // A move in progress is the nearer thing to back out of (R-139).
          if (stride.step === 'aiming') { setStride(still); return; }
          if (silverMove.step === 'aiming') { setSilverMove(noSilverMove); return; }
          // A half-drawn box, then a prefab in hand.
          if (mapTool === 'prefabs' && capture.step !== 'start') { setCapture(captureBack); return; }
          // A prop in hand, then the one selected (D-328).
          if (mapTool === 'props' && propHand.type) { setPropHand((now) => ({ ...now, type: null })); return; }
          if (mapTool === 'props' && selectedProp) { setSelectedProp(null); return; }
          if (mapTool === 'prefabs' && placing.id) { setPlacing((now) => ({ ...now, id: null })); return; }
          // The ruler standing, or a drag under way (D-341).
          if (mapTool === 'measure' && measureRef.current.from) { setMeasure(measureCleared(measureRef.current)); return; }
          // And nothing else: Escape never leaves the map (D-345). Leaving is the
          // map card's button — one Escape too many must not drop the GM out.
          return;
        }
      } else {
        switch (digit) {
          case '1': setTool('select'); return;
          case '2': setTool('travel'); return;
          case '3': setTool('places'); return;
          case '4': setTool('height'); return;
          case '5': setTool('paint'); return;
          case '6': setTool('cover'); return;
          // The brushes follow the tools, so the digits still run
          // left-to-right across the panel. `[` and `]` are the primary brush
          // keys anyway, which is what makes shuffling these harmless.
          case '7': setBrush(WORLD_BRUSHES[0]!); return;
          case '8': setBrush(WORLD_BRUSHES[1]!); return;
          case '9': setBrush(WORLD_BRUSHES[2]!); return;
          default: break;
        }

        /*
         * Z / X turn a place a quarter — Z anticlockwise, X clockwise, seen
         * from above (R-203). The one in hand if there is one, otherwise the
         * next one to be placed. Not Q / E: those turn the camera, and a GM
         * carrying a castle wants to turn the view to see where its gate
         * points. Plain Z only — cmd+Z was claimed above, for undo.
         */
        if (tool === 'places' && (e.code === 'KeyZ' || e.code === 'KeyX')) {
          const step = e.code === 'KeyX' ? 1 : -1;
          if (hands.step === 'carrying') setHands((carry) => turnCarried(carry, step));
          else setFacing((now) => turned(now, step));
          return;
        }

        switch (e.code) {
          // A step through the listed sizes, not arithmetic on the number:
          // they are 1, 3 and 5 now, so n ± 1 would land between them (D-291).
          case 'BracketLeft': setBrush((n) => stepBrush(n, -1)); return;
          case 'BracketRight': setBrush((n) => stepBrush(n, 1)); return;
          case 'Escape':
            // A place in hand goes back where it came from, like a right-click.
            setHands(emptyHanded);
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
    // quietly changed the world tool behind the map instead. `stride.step`
    // for the same reason: Escape has to know whether a move is in progress.
    // `tool` and `hands.step` so Z / X know whether they turn a place in hand.
  }, [stage, openMap, stride.step, silverMove.step, tool, hands.step, mapTool, capture.step, placing.id, propHand.type, selectedProp, openBody]);

  return (
    <>
      <div className="stage">
        <canvas
          ref={setCanvas}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      {/* The cost of this screen, on this screen (R-166). Last, so it draws
          over everything, and absent entirely when it is off. */}
      {cost.on && cost.reading && <Metrics reading={cost.reading} hint={COST_HINT} />}

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
            // Counted from the decoded body rather than the wire: the wire
            // carries a packed run stream now, and a panel should not need to
            // know how a map is encoded to say how big it is (D-217).
            blocks={openBody?.blocks.size ?? 0}
            dug={openBody ? Math.min(0, bottomOfMap(openBody)) : 0}
            tool={mapTool}
            materials={DEFAULT_MATERIALS}
            swatch={swatch}
            // Mid-move the readout says what the click will do, like the
            // world's travel prompt (R-132).
            hoverLabel={mapTool === 'move'
              ? stridePrompt(
                stride,
                memberName,
                stride.step === 'aiming' && !present.has(stride.memberId as MemberId),
              ) ?? silverMovePrompt(silverMove, silverName) ?? hoverLabel
              : hoverLabel}
            partyHere={partyHere}
            party={partyRows}
            partyCanSee={
              revealedPois.has(openPlace.id)
              && knownChunks.has(`${openPlace.cell.cx},${openPlace.cell.cz}`)
              && openPoi.visibleToParty
            }
            range={openRange ?? WHOLE_MAP}
            levelling={levelling}
            onLevelling={setLevelling}
            partyView={previewing}
            onPartyView={setPartyView}
            seen={exploredWire ? cellsFromWire(exploredWire).size : 0}
            brush={mapBrush}
            shifting={shifting}
            onTool={setMapTool}
            onBrush={setMapBrush}
            onSwatch={setSwatch}
            onLeave={() => setOpenMap(null)}
            dispatch={dispatch}
            placeId={openPlace.id}
            poiId={openPoi.id}
          />
          <LightPanel
            lighting={lighting}
            ambience={ambience}
            where={litWhere}
            sunlit={sunlit}
            onLighting={relight}
            onAmbience={reambience}
          />
        </div>
      )}

      {/*
        The other side of a map: the Tokens Library while Spawn is in hand,
        and everyone on stage who is not the party, always (D-307, R-206).
      */}
      {status === 'open' && seat === 'gm' && campaign && openMapWire && openPlace && openPoi && (
        <div className="dock dock-right dock-wide">
          {mapToolShows(mapTool, 'library') && (
            <LibraryPanel
              library={library}
              chosen={chosenTemplate}
              onChoose={setChosenTemplate}
              dispatch={dispatch}
            />
          )}
          {mapToolShows(mapTool, 'measure') && (
            <MeasurePanel
              hand={measure}
              onHand={setMeasure}
              areas={areasHere}
              people={[
                ...[...present.keys()].map((id) => ({ id: id as string, name: memberName(id) ?? 'member' })),
                ...silverHere.map((token) => ({ id: token.id as string, name: token.name })),
              ]}
              placeId={openPlace.id}
              poiId={openPoi.id}
              dispatch={dispatch}
            />
          )}
          {mapToolShows(mapTool, 'props') && (
            <PropsPanel
              hand={propHand}
              onHand={setPropHand}
              selected={selectedProp && openBody ? propById(openBody.props, selectedProp) : null}
              onSelect={setSelectedProp}
              opened={openedHere}
              placeId={openPlace.id}
              poiId={openPoi.id}
              swatch={swatch}
              dispatch={dispatch}
            />
          )}
          {mapToolShows(mapTool, 'prefabs') && (
            <PrefabsPanel
              prefabs={view?.prefabs ?? []}
              mode={prefabMode}
              onMode={(mode) => { setPrefabMode(mode); setCapture(NO_CAPTURE); }}
              placing={placing}
              onPlacing={setPlacing}
              capture={capture}
              onCapture={setCapture}
              captured={captured}
              onSaved={() => { awaitingPrefab.current = prefabs.length; }}
              placeId={openPlace.id}
              poiId={openPoi.id}
              dispatch={dispatch}
            />
          )}
          <OnStagePanel
            party={partyHere
              ? partyRows.map((row) => ({
                id: row.id,
                name: row.name,
                colour: row.colour,
                picture: memberPicture(row.id),
                sight: row.sight,
                note: memberNotes.get(row.id) ?? '',
                light: carried.get(row.id) ?? null,
              }))
              : []}
            silver={silverWire ?? []}
            order={view?.save?.order?.[openPoi.id] ?? {}}
            library={library}
            placeId={openPlace.id}
            poiId={openPoi.id}
            dispatch={dispatch}
            // A row picks a member up with Move — the way in for one hard to
            // click, behind a wall or not placed yet (R-188).
            onPickMember={(memberId) => {
              setMapTool('move');
              setStride(grab(memberId));
            }}
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
              tool={tool}
              ground={ground}
              cover={cover}
              brush={brush}
              // Mid-sequence the readout says what the click will do, since that
              // is more useful than the ground under the pointer (R-132).
              hoverLabel={travelPrompt(travel, memberName, route) ?? hoverLabel}
              onTool={setTool}
              onGround={setGround}
              onCover={setCover}
              onBrush={setBrush}
            />
            {worldToolShows(tool, 'markers') && (
              <PlacesPanel markerId={markerId} onMarker={setMarkerId} />
            )}
            {/*
              One card for the tool (D-300): the conveyances it always shows,
              and the journey underneath once there is one to cost. The
              pickers stay live through the costing step, because the route
              and the days recompute as they change.
            */}
            {worldToolShows(tool, 'travel') && (
              <TravelPanel
                modes={DEFAULT_TRAVEL_MODES}
                travelling={travelling}
                onTravelling={(next) => dispatch({
                  kind: 'setTravelling', travelling: travellingToWire(next),
                })}
                journey={travel.step === 'choosing' ? {
                  who: travel.pawn.memberId
                    ? memberName(travel.pawn.memberId) ?? 'them'
                    : 'the party',
                  route,
                  onConfirm: () => {
                    dispatch(travelIntent(travel.pawn, travel.at));
                    setTravel(idle);
                    stage?.showHighlight(null, 0);
                  },
                  onCancel: () => { setTravel(idle); stage?.showHighlight(null, 0); },
                } : null}
              />
            )}
            <LightPanel
              lighting={lighting}
              ambience={lighting.ambience}
              where="the world"
              sunlit
              onLighting={relight}
              onAmbience={(next) => relight({ ...lighting, ambience: next })}
            />
          </div>

          <div className="dock dock-right">
            {place && (
              <PlaceInspector
                place={place}
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
              notes={memberNotes}
              dispatch={dispatch}
            />
          </div>

          <div className="hints">
            1–6 tool · 7/8/9 or [ ] brush · {CAMERA_HINT}
          </div>
          <ConnectBadge urls={view?.connect ?? []} />
        </>
      )}

      {rejection && <div className="toast">{rejection}</div>}
    </>
  );
}
