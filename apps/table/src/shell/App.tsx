// The table display: the shared screen everyone looks at. No tools, no campaign
// list, no secrets (R-94).
//
// Two interactions, both about looking and going: move the party's own pawns
// (D-152), and select a place to read what the party knows about it (D-174).
// No roster, and on the world no tool palette — a click means whatever
// `tableAction` says it means, and a travel in progress outranks everything.
// Inside a map, one small palette (D-344): Move, the ruler, and the players'
// own areas.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { decodeCampaign, decodePlacement, cellsFromWire } from '@tt/protocol';
import {
  CHUNK_SIZE, DEFAULT_MARKERS, DEFAULT_MATERIALS, mapFromJSON, clampLighting, tokensFromJSON,
  allKnownIn, routeAcross, toGlobal, blockKey, carriedFromJSON, carriedLightFromJSON, areasFromJSON,
} from '@tt/domain';
import type { BlockCoord, MemberId, Route, TravelModeId, Travelling } from '@tt/domain';
import type { Intent, TableView } from '@tt/protocol';
import type { MeasureHand, Stride, Travel } from '@tt/client-core';
import {
  idle, pick, aim, ghostCell, canConfirm, movingFrom, aimedAt, travelIntent, travelPrompt,
  tableAction,
  cameraAction, wheelZoom, CAMERA_HINT,
  still, grab, tokenAim, aimStride, strideGhost, strideIntent, standVerdict, tableCeiling, walkShown,
  tokenAction, stridePrompt,
  MEASURE_START, measureCleared, measurePress, measureDrag, measureRelease, rulerShown, areasShown, handleAt,
  measurePrompt, faceCentre, floorCentre,
} from '@tt/client-core';
import { defaultTarget, worldCentre } from '@tt/render';
import type { Picked, RulerPoint, Standing, StageFog } from '@tt/render';
import { useStage } from '../scene/use-stage.js';
import { useCost, COST_HINT } from '../scene/use-cost.js';
import { PlaceCard } from '../features/place/index.js';
import { TableTools } from '../features/tools/index.js';
import { Compass, Metrics } from '@tt/ui';

interface Props {
  view: TableView | null;
  status: 'connecting' | 'open' | 'closed';
  rejection: string | null;
  dispatch: (intent: Intent) => void;
}

/** Pointer travel, in px, under which a press counts as a click and not a pan. */
const CLICK_SLOP = 4;

export function App({ view, status, rejection, dispatch }: Props) {
  const { setCanvas, canvas, stage, frames, draws } = useStage();
  const cost = useCost(stage, frames, draws);
  const openedId = useRef<string | null>(null);
  /** A press under way: where it was, whether it has moved, and which button — the right one only pans. */
  const drag = useRef<{ x: number; y: number; moved: boolean; button: number } | null>(null);
  /**
   * The palette inside a map (D-344): Move, or measuring with the ruler or a
   * shape in hand. Kept in a ref as well as state, for the console's reason: a
   * pointer-up can come before the render a drag's last move asked for.
   */
  const [measuring, setMeasuring] = useState(false);
  const [hand, setHandState] = useState<MeasureHand>(MEASURE_START);
  const handRef = useRef<MeasureHand>(MEASURE_START);
  const setHand = useCallback((next: MeasureHand) => {
    handRef.current = next;
    setHandState(next);
  }, []);
  const [overHandle, setOverHandle] = useState(false);
  const [travel, setTravel] = useState<Travel>(idle);
  /** A party token being moved inside the map (R-188). Never armed here (D-167). */
  const [stride, setStride] = useState<Stride>(still);
  const [selectedPlace, setSelectedPlace] = useState<string | null>(null);
  const campaign = view?.campaign ?? null;

  /**
   * Resolved against the **current** wire every render, never cached.
   *
   * The GM can hide a place, or delete it, while a player has it open. Holding
   * a copy would leave its notes on the shared screen after the host stopped
   * sending them, which is the one thing this screen must never do (R-141).
   */
  const place = selectedPlace
    ? campaign?.places.find((place) => place.id === selectedPlace) ?? null
    : null;
  const markerName = place
    ? DEFAULT_MARKERS.find((m) => m.id === place.markerId)?.name ?? null
    : null;
  const placementWire = view?.placement ?? null;
  const lighting = view?.lighting ?? null;

  /**
   * The map the party has been taken into, if any (R-158).
   *
   * Found by looking for the one point of interest that came with a body. The
   * table is not told *where the party is* as a fact — it is told by being sent
   * geometry for exactly one place and nothing for the rest, which means this
   * screen cannot get it wrong and cannot be asked to draw a room it was not
   * given (R-85).
   */
  const insideWire = campaign?.places
    .flatMap((p) => p.pois.map((poi) => ({ place: p, poi })))
    .find(({ poi }) => poi.map !== null) ?? null;

  /**
   * The slice this screen was sent, decoded once: the stage draws it, and the
   * Move sequence judges cubes against it (R-185). It is all the table ever
   * holds of the map, and that is enough — a cube it can aim at is one it was
   * sent.
   */
  const body = useMemo(
    () => (insideWire?.poi.map ? mapFromJSON(insideWire.poi.map) : null),
    [insideWire?.poi.map],
  );
  /**
   * Where the party stands in that map: only those inside the band, because
   * that is all `viewFor` sends (R-185, D-259).
   */
  const tokensWire = view?.tokens ?? null;
  const standing = useMemo(() => tokensFromJSON(tokensWire), [tokensWire]);
  /**
   * The party's fog over that map (R-45, D-273): where they have looked, and
   * which of the blocks this screen holds they see now. Everything else it
   * holds is explored, and what they have never seen it was never sent (R-85).
   */
  const fogWire = view?.fog ?? null;
  const seen = useMemo(() => (fogWire ? cellsFromWire(fogWire.seen) : null), [fogWire?.seen]);
  const lit = useMemo(() => (fogWire ? cellsFromWire(fogWire.lit) : null), [fogWire?.lit]);
  const fog: StageFog | null = useMemo(() => (lit ? { lit, shown: null } : null), [lit]);
  const colourOf = (id: string) => campaign?.party.find((m) => m.id === id)?.colour ?? '#ffffff';

  const nameOf = useCallback(
    (id: string) => campaign?.party.find((m) => m.id === id)?.name ?? null,
    [campaign],
  );

  /**
   * The campaign as domain types, decoded once per push.
   *
   * The stage needed it anyway; the route the players are shown is costed
   * over the same object rather than a second decode of the same bytes.
   */
  const decoded = useMemo(() => (campaign ? decodeCampaign(campaign) : null), [campaign]);

  useEffect(() => {
    if (!stage) return;
    if (!campaign || !decoded) { stage.setCampaign(null); openedId.current = null; return; }
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
  }, [campaign, decoded, stage]);

  // Pawns move far more often than the world changes, so they ride their own
  // effect rather than forcing terrain to rebuild (R-19a).
  useEffect(() => {
    stage?.setPlacement(placementWire ? decodePlacement(placementWire) : null);
  }, [placementWire, stage]);

  /*
   * The hour is the GM's and arrives like everything else does (R-181,
   * D-250). Its own effect for the same reason pawns have one: the sun is set
   * far more often than the world changes, and a slider being dragged must not
   * rebuild terrain.
   */
  useEffect(() => {
    if (lighting) stage?.setLighting(clampLighting(lighting));
  }, [lighting, stage]);

  useEffect(() => {
    stage?.aimAt(ghostCell(travel));
  }, [travel, stage]);

  /**
   * What the party travels by (R-200), as the GM granted it (D-304).
   *
   * Sent rather than assumed, and that is the whole reason this screen can
   * draw a route at all: a table costing the journey on foot while the
   * console costs it under sail would be two answers to one question (R-19).
   *
   * Memoised on the three ids, not on the wire object, which the host builds
   * fresh for every message — a new object each push would run an A\* per
   * push instead of per aim.
   */
  const way = view?.travelling ?? null;
  const travelling = useMemo<Travelling>(() => ({
    land: (way?.land ?? null) as TravelModeId | null,
    water: (way?.water ?? null) as TravelModeId | null,
    air: (way?.air ?? null) as TravelModeId | null,
  }), [way?.land, way?.water, way?.air]);

  /**
   * Everything this screen holds is Known, by construction (D-140, D-304).
   *
   * The table is never told *which* chunks the party has found — that is
   * itself the answer to what is hidden (R-85) — so it is handed a world
   * already cut to them, and a discovery over exactly that world says the
   * same thing without saying anything new.
   */
  const known = useMemo(() => (decoded ? allKnownIn(decoded.world) : null), [decoded]);

  /**
   * The route the players are shown while a journey is being aimed (R-197).
   *
   * The console's effect, on the other screen and for the same reasons: keyed
   * on `travel`, which holds its identity while the pointer wanders inside
   * one cell (R-165), so one search per cell crossed and not one per pointer
   * move (R-198).
   */
  const [route, setRoute] = useState<Route | null>(null);
  useEffect(() => {
    if (!stage) return;
    const placed = placementWire ? decodePlacement(placementWire) : null;
    const from = placed ? movingFrom(travel, placed) : null;
    const to = aimedAt(travel);
    if (!decoded || !known || !from || !to) {
      setRoute(null);
      stage.showRoute(null, '#ffffff');
      return;
    }
    const found = routeAcross(
      decoded.world,
      known,
      travelling,
      toGlobal({ cx: from.cx, cz: from.cz }, from.x, from.z),
      toGlobal({ cx: to.cx, cz: to.cz }, to.x, to.z),
    );
    setRoute(found);
    stage.showRoute(
      found?.cells ?? null,
      travel.step !== 'idle' && travel.pawn.memberId
        ? colourOf(travel.pawn.memberId)
        : '#e6e9ef',
    );
  }, [travel, stage, decoded, known, travelling, placementWire]);

  /**
   * Follow the GM into a map, and back out (R-158).
   *
   * No range is passed: the table was sent only the slice, so there is nothing
   * out of range for it to fade. The console is the screen that draws the whole
   * body and dims the rest (D-182).
   */
  useEffect(() => {
    if (!stage) return;
    stage.setMap(
      body,
      DEFAULT_MATERIALS,
      insideWire ? `${insideWire.place.id}/${insideWire.poi.id}` : null,
    );
  }, [stage, insideWire?.place.id, insideWire?.poi.id, body]);

  // The fog, as an attribute on the body this screen already holds: a step
  // that shows nothing new costs a colour write, not a rebuild (R-69).
  useEffect(() => { stage?.setFog(fog); }, [stage, fog]);

  // The party in the map, as they were sent (R-184). Their own effect, for the
  // pawns' reason: they move far more often than the map changes (R-19a).
  /** The lights they carry (D-335), sent for exactly the members sent. */
  const carriedWire = view?.carried ?? null;
  const carried = useMemo(() => carriedFromJSON(carriedWire), [carriedWire]);
  useEffect(() => {
    if (!stage) return;
    const tokens: Standing[] = [...standing].map(([memberId, at]) => ({
      memberId, at, colour: colourOf(memberId),
      picture: campaign?.party.find((m) => m.id === memberId)?.image ?? null,
      light: carried.get(memberId) ?? null,
    }));
    stage.setTokens(tokens);
  }, [stage, standing, campaign?.party, carried]);

  /**
   * Everyone not of the party whom the party can see right now (R-206). The
   * host decided who that is; this screen draws what it was sent, and was
   * sent no one it may not show — never a hidden one, never one behind a
   * wall. Not pickable here: they are the GM's (R-136).
   */
  const silverWire = view?.silver ?? null;
  useEffect(() => {
    stage?.setSilver(silverWire
      ? silverWire.map((token) => ({
        id: token.id, name: token.name, at: token.at, picture: token.image, hidden: false,
        light: token.light ? carriedLightFromJSON(token.light) : null,
      }))
      : null);
  }, [stage, silverWire]);
  /**
   * Which of the props this screen holds stand open (D-322): sent by the
   * host for exactly the props it sent, so a door is drawn open and walked
   * through here as on the console.
   */
  /**
   * The areas on this map (D-341), as the host sent them: none hidden, each
   * where it is now. Drawn, never resolved.
   */
  const areasWire = view?.areas ?? null;
  const areasHere = useMemo(() => areasFromJSON(areasWire), [areasWire]);
  /** The ones drawn from this screen: the only ones it may move or take away (D-344). */
  const mine = useMemo(() => areasHere.filter((area) => area.byTable), [areasHere]);
  useEffect(() => {
    // Each where the host put it — one that follows somebody arrives where they stand.
    stage?.setAreas(insideWire ? areasShown(areasHere, measuring ? hand : null, () => null) : null);
  }, [stage, insideWire, areasHere, measuring, hand]);
  // The ruler: this screen's alone, never sent (D-341).
  useEffect(() => {
    stage?.showRuler(insideWire && measuring ? rulerShown(hand) : null);
  }, [stage, insideWire, measuring, hand]);
  const openedWire = view?.opened ?? null;
  const opened = useMemo(() => new Set<string>(openedWire ?? []), [openedWire]);
  useEffect(() => { stage?.setOpened(opened); }, [stage, opened]);
  /** Their cubes, so the party's ghost never stands on a goblin the table can see. */
  const silverCubes = useMemo(
    () => new Set((silverWire ?? []).map((token) => `${token.at.x},${token.at.y},${token.at.z}`)),
    [silverWire],
  );

  // Leaving the map, or the GM taking the party somewhere else, ends a move —
  // the one inside the map, and a journey aimed out on the world with it.
  useEffect(() => {
    setStride(still);
    setTravel(idle);
    setHand(measureCleared(handRef.current));
  }, [insideWire?.place.id, insideWire?.poi.id]);

  useEffect(() => {
    stage?.aimToken(
      strideGhost(stride),
      stride.step === 'aiming' ? colourOf(stride.memberId) : undefined,
    );
  }, [stride, stage]);

  /**
   * Whether the member being moved may stand in a cube, judged from what this
   * screen holds (R-138): the slice, the tokens it was sent, and a ceiling
   * worked out from the plane list, since the table is never told its band.
   */
  const strideVerdict = (memberId: string, at: BlockCoord) => (body
    ? standVerdict(body, standing, memberId, at, { ceiling: tableCeiling(body) }, seen, silverCubes, opened)
    : 'outside the map');

  /**
   * The walk the token being moved would take, and how far (R-209), over
   * what this screen holds: below its ceiling, and only floors the party has
   * seen — a path drawn through a room nobody has looked into would draw the
   * room (R-85's standard, R-131's reason).
   */
  const walk = useMemo(() => {
    if (stride.step !== 'aiming' || !body) return null;
    const ceiling = tableCeiling(body);
    return walkShown(
      body,
      standing.get(stride.memberId as MemberId) ?? null,
      strideGhost(stride),
      (at) => at.y < ceiling && (!seen || seen.has(blockKey(at))),
      opened,
    );
  }, [stride, body, standing, seen, opened]);
  useEffect(() => {
    stage?.showWalk(walk, stride.step === 'aiming' ? colourOf(stride.memberId) : undefined);
  }, [walk, stage]);

  // Escape cancels a move or closes an open place (R-132, R-139), and the
  // camera keys are the console's, unchanged — one table decides both (R-156).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const camera = cameraAction(event.code);
      if (camera && stage) {
        if (camera.kind === 'turn') stage.rotate(camera.steps);
        else stage.tilt(camera.steps);
        return;
      }
      if (event.code !== 'Escape') return;
      if (measuring && handRef.current.from) setHand(measureCleared(handRef.current));
      else if (stride.step === 'aiming') setStride(still);
      else if (travel.step === 'aiming') setTravel(idle);
      else setSelectedPlace(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [travel.step, stride.step, stage, measuring]);

  /*
   * The wheel zooms, by the same step as on the console (R-156). Attached here
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

  /**
   * The cube the ruler or a shape means (D-341): where somebody stands, when
   * the pointer is on them, and otherwise the cube against the face pointed
   * at — and the ruler's end, the middle of that face (D-342).
   */
  const measuredAt = (picked: Picked): BlockCoord | null => {
    if (picked.token) return standing.get(picked.token.memberId as MemberId) ?? null;
    if (picked.silver) return silverWire?.find((token) => token.id === picked.silver)?.at ?? null;
    return picked.face?.adjacent ?? null;
  };
  const measuredPoint = (picked: Picked): RulerPoint | null => {
    if (picked.token || picked.silver) {
      const at = measuredAt(picked);
      return at ? floorCentre(at) : null;
    }
    return picked.face ? faceCentre(picked.face) : null;
  };
  const noFollowing = () => null;

  const onPointerMove = (event: React.PointerEvent) => {
    if (drag.current) {
      const dx = event.clientX - drag.current.x;
      const dy = event.clientY - drag.current.y;
      if (Math.abs(dx) > CLICK_SLOP || Math.abs(dy) > CLICK_SLOP) drag.current.moved = true;
      if (drag.current.moved && stage) {
        stage.pan(dx, dy);
        drag.current = { ...drag.current, x: event.clientX, y: event.clientY, moved: true };
      }
      return;
    }
    // Measuring or drawing (D-344): the drag follows the pointer, a face at a time.
    if (insideWire && measuring && stage) {
      const picked = stage.pick(event.clientX, event.clientY);
      const at = measuredAt(picked);
      const now = handRef.current;
      const next = measureDrag(now, at, measuredPoint(picked));
      if (next !== now) setHand(next);
      setOverHandle(!now.held && handleAt(mine, at, noFollowing) !== null);
      return;
    }
    // Inside a map the only thing that follows the pointer is a token being
    // moved, and only onto a floor its member may stand on (R-138).
    if (insideWire) {
      if (stride.step !== 'aiming' || !stage) return;
      const at = tokenAim(stage.pick(event.clientX, event.clientY).face);
      setStride((current) => (current.step === 'aiming'
        ? aimStride(current, at, at ? strideVerdict(current.memberId, at) : null)
        : current));
      return;
    }
    if (travel.step !== 'aiming' || !stage) return;
    const hit = stage.pick(event.clientX, event.clientY);
    // The table only ever receives Known chunks (D-140), so any cell it can
    // raycast is reachable by construction. Stated rather than assumed, because
    // the guard is what makes the ghost honest (D-164).
    setTravel((current) => aim(current, hit.column, hit.column !== null));
  };

  const onClick = (event: React.PointerEvent) => {
    if (!stage) return;
    const hit = stage.pick(event.clientX, event.clientY);

    // Inside a map, a click picks up a party token or puts one down — the
    // players' own, so this screen may (R-136). A move in progress owns the
    // click: it confirms on a floor the member may stand on, judged where the
    // click landed, and cancels anywhere else (R-188).
    if (insideWire) {
      const act = tokenAction(hit.token, stride.step === 'aiming');
      if (act.kind === 'confirm' && stride.step === 'aiming') {
        const at = tokenAim(hit.face);
        if (at && strideVerdict(stride.memberId, at) === null) {
          dispatch(strideIntent(stride, at, insideWire.place.id, insideWire.poi.id));
        }
        setStride(still);
        return;
      }
      if (act.kind === 'pickToken') setStride(grab(act.memberId));
      return;
    }

    const action = tableAction(
      { pawn: hit.pawn, placeId: hit.placeId, cell: hit.column, slot: hit.slot },
      travel.step === 'aiming',
    );

    switch (action.kind) {
      case 'travel':
        // Second click confirms. Anything that is not a reachable cell cancels,
        // rather than sending a move the host would refuse. The `step` check is
        // redundant at runtime — `tableAction` only answers 'travel' while
        // aiming — but it is how the compiler narrows `travel` to that variant.
        if (travel.step === 'aiming' && canConfirm(travel) && hit.column) {
          dispatch(travelIntent(travel.pawn, hit.column));
        }
        setTravel(idle);
        return;
      case 'pickPawn':
        setTravel(pick(action.pawn));
        return;
      case 'selectPlace':
        setSelectedPlace(action.placeId);
        return;
      case 'clearSelection':
        setSelectedPlace(null);
        return;
      default:
        return;
    }
  };

  const waiting = status !== 'open'
    ? { title: status === 'closed' ? 'Disconnected' : 'Connecting…', body: status === 'closed' ? 'Waiting for the host to come back.' : 'Joining the table.' }
    : !campaign
      ? { title: 'Waiting for the GM', body: 'No campaign is open yet.' }
      : null;

  // The table only ever moves somebody already standing, so it is never placing.
  const prompt = insideWire
    ? measuring ? measurePrompt(hand, overHandle) : stridePrompt(stride, nameOf, false)
    // The days go in the sentence: this screen has no panel to put them in,
    // and how long it takes is the whole output of a route (R-199, D-304).
    : travelPrompt(travel, nameOf, route);

  /**
   * Which way the camera is facing, for the compass (R-155).
   *
   * The *live* bearing from the stage, so the dial turns with the world instead
   * of jumping ahead of it (R-156). It arrives per frame while turning and not
   * at all otherwise, so panning costs nothing.
   */
  const [bearing, setBearing] = useState(0);
  useEffect(() => {
    stage?.watchCamera(setBearing);
    return () => stage?.watchCamera(null);
  }, [stage]);

  return (
    <>
      {/* The cost of this screen, on this screen (R-166). Last, so it draws
          over everything, and absent entirely when it is off. */}
      {cost.on && cost.reading && <Metrics reading={cost.reading} hint={COST_HINT} />}
      <div className="stage">
        <canvas
          ref={setCanvas}
          onPointerDown={(e) => {
            if (e.button === 2 || e.button === 1) {
              if (travel.step === 'aiming') setTravel(idle);
              if (stride.step === 'aiming') setStride(still);
              // And it pans, so the view still moves while the left button draws (D-344).
              drag.current = { x: e.clientX, y: e.clientY, moved: false, button: e.button };
              return;
            }
            // Measuring or drawing: a press starts a ruler or an area, or picks
            // one of the players' own areas up by its handle (D-344).
            if (insideWire && measuring && stage) {
              const picked = stage.pick(e.clientX, e.clientY);
              const at = measuredAt(picked);
              setHand(measurePress(handRef.current, at, handleAt(mine, at, noFollowing), measuredPoint(picked)));
              return;
            }
            drag.current = { x: e.clientX, y: e.clientY, moved: false, button: e.button };
          }}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => {
            if (insideWire && measuring && handRef.current.held) {
              const { hand: next, intent } = measureRelease(handRef.current, insideWire.place.id, insideWire.poi.id);
              setHand(next);
              if (intent) dispatch(intent);
              return;
            }
            const press = drag.current;
            drag.current = null;
            if (press && !press.moved && press.button === 0) onClick(e);
          }}
          onPointerLeave={() => {
            drag.current = null;
            // A drag that leaves the screen is let go of, not finished: nothing is sent.
            if (handRef.current.held) setHand(measureCleared(handRef.current));
            setOverHandle(false);
          }}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      {waiting && (
        <div className="launcher">
          <div className="card"><h1>{waiting.title}</h1><p>{waiting.body}</p></div>
        </div>
      )}

      {!waiting && !insideWire && place && (
        <PlaceCard place={place} markerName={markerName} onClose={() => setSelectedPlace(null)} />
      )}

      {!waiting && insideWire && (
        <TableTools
          measuring={measuring}
          hand={hand}
          onMove={() => { setMeasuring(false); setHand(measureCleared(handRef.current)); }}
          onMeasure={() => { setMeasuring(true); setStride(still); }}
          onHand={(next) => { setMeasuring(true); setStride(still); setHand(next); }}
          mine={mine}
          onRemove={(id) => dispatch({ kind: 'removeArea', placeId: insideWire.place.id, poiId: insideWire.poi.id, id })}
        />
      )}

      {/* The table can be read from any side of a physical table, so the
          compass matters more here than on the console (R-155). */}
      <Compass bearing={bearing} hidden={!!waiting} />

      {!waiting && <div className="badge">{campaign?.name}</div>}
      {/*
        One bar. A prompt outranks the legend, because being told what this
        gesture will do matters more than being reminded how to turn — and the
        table stays minimal either way (R-94).
      */}
      {!waiting && <div className="hints">{prompt ?? CAMERA_HINT}</div>}
      {rejection && <div className="toast">{rejection}</div>}
    </>
  );
}
