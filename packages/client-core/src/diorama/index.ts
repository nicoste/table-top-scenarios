// Living 3D Isometric Terrain Diorama (D-382): drives the WebGL Stage behind
// the Main Menu (`!campaign`) with a 10-step voxel construction & undo loop.
//
// Builds a floating 16×16 isometric island from bedrock and river channel (Step 1)
// through a winding limestone & gold-trimmed road (Step 2), stone arch bridge
// (Step 3), northern cliffside ridge (Step 4), watchtower foundation (Step 5),
// crenelated keep walls (Step 6), ancient pines (Step 7), wayside camp & oak
// gate (Step 8), lit road beacons at golden dusk (Step 9), and the arriving
// party on the road (Step 10) — then undoes step-by-step back to Step 1 and loops.

import { useEffect, useState } from 'react';
import {
  blockKey, DAYLIGHT, DEFAULT_MATERIALS, OPEN_SKY, TORCH,
} from '@tt/domain';
import type {
  BlockCoord, EncounterMap, Lighting, Prop, PropId, SwatchId,
} from '@tt/domain';
import type { Stage, Standing } from '@tt/render';

export const DIORAMA_TOTAL_STEPS = 10;

const STEP_INTERVAL_MS = 1150;

const SWATCH = {
  soil: 'material:soil' as SwatchId,
  sand: 'material:soil/sand' as SwatchId,
  grass: 'material:grass' as SwatchId,
  darkGrass: 'material:grass/dark' as SwatchId,
  water: 'material:liquid' as SwatchId,
  shore: 'material:liquid/shore' as SwatchId,
  stone: 'material:brick/dressed' as SwatchId,
  limestone: 'material:brick/limestone' as SwatchId,
  rock: 'material:mineral' as SwatchId,
  darkRock: 'material:mineral/dark-rock' as SwatchId,
  gold: 'material:mineral/gold' as SwatchId,
  oak: 'material:wood' as SwatchId,
  darkOak: 'material:wood/dark-oak' as SwatchId,
  leaves: 'material:vegetation' as SwatchId,
  lightLeaves: 'material:vegetation/light' as SwatchId,
  darkLeaves: 'material:vegetation/dark' as SwatchId,
} as const;

export const DIORAMA_STEP_TITLES: readonly string[] = [
  'Floating island & stream',
  'Winding cobblestone road',
  'Stone arch bridge',
  'Northern cliffside crag',
  'Watchtower foundation',
  'Keep walls & battlements',
  'Wayside pines & canopy',
  'Outpost camp & oak gate',
  'Roadside beacons at dusk',
  'Party on the road',
];

export interface DioramaCursor {
  readonly step: number;
  readonly phase: 'build' | 'undo';
  readonly hold: number;
}

export interface DioramaState {
  readonly step: number;
  readonly total: number;
  readonly phase: 'build' | 'undo';
  readonly title: string;
  readonly statusText: string;
  readonly map: EncounterMap;
  readonly tokens: readonly Standing[];
  readonly lighting: Lighting;
}

/** Advances the 1..10 build → hold → 10..1 undo → hold loop by one tick. */
export function nextDioramaCursor(cursor: DioramaCursor): DioramaCursor {
  if (cursor.hold > 0) {
    return { ...cursor, hold: cursor.hold - 1 };
  }
  if (cursor.phase === 'build') {
    if (cursor.step >= DIORAMA_TOTAL_STEPS) {
      return { step: DIORAMA_TOTAL_STEPS - 1, phase: 'undo', hold: 0 };
    }
    const nextStep = cursor.step + 1;
    return {
      step: nextStep,
      phase: 'build',
      hold: nextStep === DIORAMA_TOTAL_STEPS ? 1 : 0,
    };
  }
  if (cursor.step <= 1) {
    return { step: 2, phase: 'build', hold: 0 };
  }
  const prevStep = cursor.step - 1;
  return {
    step: prevStep,
    phase: 'undo',
    hold: prevStep === 1 ? 1 : 0,
  };
}

function put(
  blocks: Map<string, SwatchId>,
  x: number,
  y: number,
  z: number,
  swatch: SwatchId,
): void {
  blocks.set(blockKey({ x, y, z }), swatch);
}

function fillBox(
  blocks: Map<string, SwatchId>,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  swatch: SwatchId,
): void {
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        put(blocks, x, y, z, swatch);
      }
    }
  }
}

function prop(
  id: string,
  type: string,
  at: BlockCoord,
  facing: 0 | 1 | 2 | 3 = 0,
  extra?: { paint?: SwatchId; flame?: string; reach?: number },
): Prop {
  return {
    id: `prop:${id}` as PropId,
    type,
    at,
    facing,
    ...(extra?.paint ? { paint: extra.paint } : {}),
    ...(extra?.flame ? { flame: extra.flame } : {}),
    ...(extra?.reach ? { reach: extra.reach } : {}),
  };
}

// Road path cells from foreground (South-East) across the bridge toward the
// Watchtower crest (North-West, pointing toward the Main Menu title card).
const ROAD_CELLS: readonly (readonly [number, number])[] = [
  // Foreground approach
  [13, 12], [12, 12], [13, 11], [12, 11], [11, 11],
  [12, 10], [11, 10], [10, 10],
  // Bridge approach & span (z = 8..9, x = 8..10)
  [10, 9], [9, 9], [8, 9],
  [9, 8], [8, 8], [7, 8],
  // Upper road curving toward the Watchtower gate (x = 4..7, z = 6..7)
  [8, 7], [7, 7], [6, 7],
  [7, 6], [6, 6], [5, 6],
];

/**
 * Pure builder returning the exact 3D EncounterMap, party tokens, and lighting
 * for step `1..10` of the Main Menu diorama.
 */
export function dioramaAtStep(
  rawStep: number,
  phase: 'build' | 'undo' = 'build',
): DioramaState {
  const step = Math.max(1, Math.min(DIORAMA_TOTAL_STEPS, Math.round(rawStep)));
  const blocks = new Map<string, SwatchId>();
  const props: Prop[] = [];

  // ── STEP 1: Floating Island Underside, Grass Plateau & River Channel ──
  // Deep tapered bedrock core (y = -2)
  for (let x = 4; x <= 11; x++) {
    for (let z = 4; z <= 11; z++) {
      const dist = Math.hypot(x - 7.5, z - 7.5);
      if (dist <= 4.6) {
        put(blocks, x, -2, z, SWATCH.darkRock);
      }
    }
  }
  // Tapered soil & stone sub-layer (y = -1)
  for (let x = 2; x <= 13; x++) {
    for (let z = 2; z <= 13; z++) {
      const dist = Math.hypot(x - 7.5, z - 7.5);
      if (dist <= 6.2) {
        put(blocks, x, -1, z, dist > 5.1 ? SWATCH.rock : SWATCH.soil);
      }
    }
  }
  // Surface grass plateau (y = 0) with natural island silhouette
  for (let x = 1; x <= 14; x++) {
    for (let z = 1; z <= 14; z++) {
      const dist = Math.hypot(x - 7.5, z - 7.5);
      if (dist <= 7.1) {
        const checker = (x + z) % 3 === 0;
        put(blocks, x, 0, z, checker ? SWATCH.darkGrass : SWATCH.grass);
      }
    }
  }
  // Sparkling diagonal stream cutting from North-East (x=12,z=3) to South-West (x=3,z=12)
  for (let x = 1; x <= 14; x++) {
    for (let z = 1; z <= 14; z++) {
      const key = blockKey({ x, y: 0, z });
      if (!blocks.has(key)) continue;
      const riverDist = Math.abs((x + z) - 16);
      if (riverDist <= 1) {
        put(blocks, x, 0, z, SWATCH.water);
      } else if (riverDist === 2) {
        put(blocks, x, 0, z, SWATCH.shore);
      }
    }
  }

  // ── STEP 2: The Winding Golden/Limestone Road ──
  if (step >= 2) {
    for (const [rx, rz] of ROAD_CELLS) {
      const riverDist = Math.abs((rx + rz) - 16);
      // Leave the river gap open until Step 3 builds the bridge
      if (step < 3 && riverDist <= 1) continue;
      const isEdge = (rx + rz) % 4 === 0;
      put(blocks, rx, 0, rz, isEdge ? SWATCH.gold : SWATCH.limestone);
    }
  }

  // ── STEP 3: Stone Arch Bridge Across the Stream ──
  if (step >= 3) {
    // Bridge deck over the river channel
    for (const [bx, bz] of [
      [10, 9], [9, 9], [8, 9],
      [9, 8], [8, 8], [7, 8],
    ] as const) {
      put(blocks, bx, 0, bz, SWATCH.stone);
    }
    // Bridge stone parapets (y = 1) flanking the crossing
    put(blocks, 10, 1, 7, SWATCH.limestone);
    put(blocks, 7, 1, 10, SWATCH.limestone);
  }

  // ── STEP 4: Northern Cliffside Ridge & Overlook ──
  if (step >= 4) {
    fillBox(blocks, 2, 1, 2, 7, 1, 5, SWATCH.rock);
    fillBox(blocks, 2, 2, 2, 5, 2, 4, SWATCH.darkRock);
    // Mossy grass cap on the western crag
    fillBox(blocks, 2, 3, 2, 4, 3, 3, SWATCH.darkGrass);
    // Terraced stone outcrop on the eastern bank
    fillBox(blocks, 10, 1, 3, 12, 1, 5, SWATCH.rock);
    put(blocks, 11, 2, 4, SWATCH.darkGrass);
  }

  // ── STEP 5: Watchtower Foundation & Approach Stairs ──
  if (step >= 5) {
    // Dressed stone plinth & oak inner floor at y = 1 (x: 3..6, z: 3..6)
    fillBox(blocks, 3, 1, 3, 6, 1, 6, SWATCH.stone);
    fillBox(blocks, 4, 1, 4, 5, 1, 5, SWATCH.oak);
    // Stone stairs climbing from the road (x=5, z=7) up to the tower gate
    props.push(prop('tower-stairs', 'stairs', { x: 5, y: 1, z: 7 }, 0, { paint: SWATCH.stone }));
  }

  // ── STEP 6: Watchtower Keep Walls & Battlements ──
  if (step >= 6) {
    for (let y = 2; y <= 4; y++) {
      for (let x = 3; x <= 6; x++) {
        for (let z = 3; z <= 6; z++) {
          const onWall = x === 3 || x === 6 || z === 3 || z === 6;
          if (!onWall) continue;
          // Leave doorway at (x=5, z=6, y=2..3) facing the road
          if (x === 5 && z === 6 && (y === 2 || y === 3)) continue;
          const isCorner = (x === 3 || x === 6) && (z === 3 || z === 6);
          put(blocks, x, y, z, isCorner ? SWATCH.limestone : SWATCH.stone);
        }
      }
    }
    // Roof floor at y = 4 inside the tower
    fillBox(blocks, 4, 4, 4, 5, 4, 5, SWATCH.darkOak);
    // Crenelated battlements at y = 5
    for (const [bx, bz] of [
      [3, 3], [5, 3], [6, 3],
      [3, 5], [6, 5],
      [3, 6], [4, 6], [6, 6],
    ] as const) {
      put(blocks, bx, 5, bz, SWATCH.limestone);
    }
    // Gold beacon plinth on the tower crown
    put(blocks, 4, 5, 4, SWATCH.gold);
  }

  // ── STEP 7: Ancient Pines & Layered Foliage ──
  if (step >= 7) {
    // Pine 1: Eastern overlook (x=11, z=4, base at y=2)
    put(blocks, 11, 3, 4, SWATCH.darkOak);
    put(blocks, 11, 4, 4, SWATCH.darkOak);
    fillBox(blocks, 10, 4, 3, 12, 4, 5, SWATCH.darkLeaves);
    put(blocks, 11, 5, 4, SWATCH.leaves);
    put(blocks, 11, 6, 4, SWATCH.lightLeaves);

    // Pine 2: Southern riverside grove (x=4, z=11, base at y=0)
    put(blocks, 4, 1, 11, SWATCH.darkOak);
    put(blocks, 4, 2, 11, SWATCH.darkOak);
    fillBox(blocks, 3, 3, 10, 5, 3, 12, SWATCH.leaves);
    put(blocks, 4, 4, 11, SWATCH.lightLeaves);

    // Pine 3: Northern crag pine (x=2, z=7, base at y=0)
    put(blocks, 2, 1, 7, SWATCH.darkOak);
    put(blocks, 2, 2, 7, SWATCH.darkOak);
    fillBox(blocks, 1, 3, 6, 3, 3, 8, SWATCH.darkLeaves);
    put(blocks, 2, 4, 7, SWATCH.leaves);
  }

  // ── STEP 8: Wayside Outpost Camp & Watchtower Gate ──
  if (step >= 8) {
    // Watchtower oak door at the entrance (x=5, y=2, z=6)
    props.push(prop('tower-door', 'door', { x: 5, y: 2, z: 6 }, 0, { paint: SWATCH.darkOak }));
    // Wayside Supply Camp beside the road (x=9..10, z=11..12)
    props.push(prop('camp-table', 'table', { x: 9, y: 1, z: 11 }, 0, { paint: SWATCH.oak }));
    props.push(prop('camp-barrel', 'barrel', { x: 8, y: 1, z: 11 }, 0, { paint: SWATCH.darkOak }));
    props.push(prop('camp-crate', 'crate', { x: 7, y: 2, z: 4 }, 1, { paint: SWATCH.oak }));
    props.push(prop('tower-chest', 'chest', { x: 4, y: 2, z: 4 }, 2, { paint: SWATCH.gold }));
  }

  // ── STEP 9: Road Beacons & Warm Dusk Lamplight ──
  if (step >= 9) {
    // Watchtower roof brazier beacon
    props.push(prop('roof-brazier', 'brazier', { x: 4, y: 6, z: 4 }, 0, {
      paint: SWATCH.gold,
      flame: 'fire',
      reach: 10,
    }));
    // Bridge parapet lanterns lighting the crossing
    props.push(prop('bridge-lantern-ne', 'lantern', { x: 10, y: 2, z: 7 }, 0, {
      paint: SWATCH.gold,
      flame: 'candle',
      reach: 7,
    }));
    props.push(prop('bridge-lantern-sw', 'lantern', { x: 7, y: 2, z: 10 }, 0, {
      paint: SWATCH.gold,
      flame: 'candle',
      reach: 7,
    }));
    // Wayside campfire beside the lower road
    props.push(prop('wayside-campfire', 'campfire', { x: 10, y: 1, z: 12 }, 0, {
      flame: 'fire',
      reach: 9,
    }));
  }

  // ── STEP 10: The Party Arrives Along the Lit Road ──
  const tokens: Standing[] = step >= 10
    ? [
      {
        memberId: 'diorama-vanguard',
        colour: '#f59e0b',
        picture: null,
        at: { x: 6, y: 1, z: 6 },
        light: TORCH,
      },
      {
        memberId: 'diorama-ranger',
        colour: '#38bdf8',
        picture: null,
        at: { x: 8, y: 1, z: 8 },
        light: null,
      },
      {
        memberId: 'diorama-arcanist',
        colour: '#a78bfa',
        picture: null,
        at: { x: 11, y: 1, z: 11 },
        light: null,
      },
    ]
    : [];

  // Shift lighting to golden dusk on steps 9 & 10 so the road beacons glow warmly
  const lighting: Lighting = step >= 9
    ? {
      angle: 28,
      sun: '#ffb36b',
      sunLevel: 1.35,
      ambience: { colour: '#4b5c82', level: 0.55 },
    }
    : {
      ...DAYLIGHT,
      angle: 42,
      sun: '#fff2d6',
      sunLevel: 1.85,
      ambience: { ...OPEN_SKY, level: 0.7 },
    };

  const title = DIORAMA_STEP_TITLES[step - 1] ?? 'Floating terrain';
  const verb = phase === 'build' ? 'Building' : 'Undoing';
  const statusText = `Step ${step} / ${DIORAMA_TOTAL_STEPS} · ${verb}: ${title}`;

  const map: EncounterMap = {
    origin: { x: 0, z: 0 },
    size: { x: 16, z: 16 },
    blocks,
    planes: [],
    props,
  };

  return {
    step,
    total: DIORAMA_TOTAL_STEPS,
    phase,
    title,
    statusText,
    map,
    tokens,
    lighting,
  };
}

/**
 * Drives the WebGL `Stage` with the 10-step isometric diorama while `active`
 * is true (`!campaign`), and tears it down cleanly when a campaign opens.
 */
export function useDiorama(stage: Stage | null, active: boolean): DioramaState {
  const [cursor, setCursor] = useState<DioramaCursor>({
    step: 1,
    phase: 'build',
    hold: 0,
  });

  useEffect(() => {
    if (!active) {
      setCursor({ step: 1, phase: 'build', hold: 0 });
      return;
    }
    const timer = setInterval(() => {
      setCursor((now) => nextDioramaCursor(now));
    }, STEP_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active]);

  const state = dioramaAtStep(cursor.step, cursor.phase);

  // Frame the isometric floating island once when entering the Main Menu, and
  // clean up the diorama map & tokens when transitioning into a campaign.
  useEffect(() => {
    if (!stage || !active) return;
    stage.setLampShadows('soft');
    return () => {
      stage.setTokens(null);
      stage.setMap(null, DEFAULT_MATERIALS, null);
      stage.setLighting(DAYLIGHT);
    };
  }, [stage, active]);

  useEffect(() => {
    if (!stage || !active) return;
    const firstFrame = cursor.step === 1 && cursor.phase === 'build' && cursor.hold === 0;
    stage.setMap(state.map, DEFAULT_MATERIALS, '__diorama__');
    stage.setTokens(state.tokens);
    stage.setLighting(state.lighting);
    if (firstFrame) {
      // Offset the camera focus slightly toward screen-left (-X, +Z) so the
      // floating island sits comfortably in the right-centre of the viewport
      // alongside the Main Menu card.
      stage.setTarget({
        focus: { x: 6.2, y: 1.2, z: 9.2 },
        yawStep: 0,
        pitchStep: 1,
        zoom: 22,
      });
    }
  }, [stage, active, state, cursor.step, cursor.phase, cursor.hold]);

  return state;
}
