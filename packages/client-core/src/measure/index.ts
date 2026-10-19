// The Measure tool (D-341): the ruler, and areas drawn and moved by dragging.
// Local until the release (R-64): the ruler is this screen's alone and never
// reaches the host, and an area being drawn or moved is only a picture until
// the pointer comes up.
//
// **A drag draws.** With the ruler, from the cube pressed to the cube let go
// of, and how far — a bare number (D-316), straight from middle to middle;
// it stays until the next press. With a shape, the area a drag that long
// would be (`areaFromDrag`), sent when the pointer comes up.
//
// **A press on an area's handle moves it** — the small mark on the cube it
// starts from — whatever is in hand, so an area is never drawn by accident
// over the one being picked up.

import type { Intent } from '@tt/protocol';
import type { Area, AreaShape, Areas, BlockCoord } from '@tt/domain';
import { AREA_COLOURS, AREA_SHAPES, areaAt, areaColour, areaFromDrag, areaStartingAt } from '@tt/domain';
import type { AreaDrawn, RulerDrawn } from '@tt/render';
import { walkLength } from '../walk/index.js';

export type MeasureMode = 'ruler' | AreaShape;

/** What the Measure tool has in hand, and the drag under way. */
export interface MeasureHand {
  readonly mode: MeasureMode;
  /** The colour a new area is drawn in: one of `AREA_COLOURS`, by id. */
  readonly colour: string;
  /** Where the press was, and where the pointer is now: a ruler, or an area being drawn or moved. */
  readonly from: BlockCoord | null;
  readonly to: BlockCoord | null;
  /** Still held down. */
  readonly held: boolean;
  /** The area being moved by its handle, by id. */
  readonly moving: string | null;
}

export const MEASURE_START: MeasureHand = {
  mode: 'ruler', colour: AREA_COLOURS[0]!.id, from: null, to: null, held: false, moving: null,
};

const same = (a: BlockCoord | null, b: BlockCoord | null) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.z === b.z);

/** The ruler or a shape, with nothing half-drawn. */
export function chooseMeasure(hand: MeasureHand, mode: MeasureMode): MeasureHand {
  return { ...hand, mode, from: null, to: null, held: false, moving: null };
}

export function chooseAreaColour(hand: MeasureHand, colour: string): MeasureHand {
  return { ...hand, colour };
}

/** Lets go of everything: the ruler standing, a drag under way. */
export function measureCleared(hand: MeasureHand): MeasureHand {
  return { ...hand, from: null, to: null, held: false, moving: null };
}

/**
 * A press on a cube: on an area's handle, picks it up to move; anywhere else,
 * starts a ruler or an area there. Off the map, lets go of the ruler.
 */
export function measurePress(hand: MeasureHand, at: BlockCoord | null, handle: string | null): MeasureHand {
  if (!at) return measureCleared(hand);
  return { ...hand, from: at, to: at, held: true, moving: handle };
}

/** The pointer moving with the button down: the drag follows it, a cube at a time. */
export function measureDrag(hand: MeasureHand, at: BlockCoord | null): MeasureHand {
  if (!hand.held || !at || same(at, hand.to)) return hand;
  return { ...hand, to: at };
}

/**
 * The pointer coming up: an area moved or drawn is sent; a ruler stays where
 * it is, for reading out, until the next press.
 */
export function measureRelease(
  hand: MeasureHand,
  placeId: string,
  poiId: string,
): { readonly hand: MeasureHand; readonly intent: Intent | null } {
  if (!hand.held || !hand.from || !hand.to) return { hand, intent: null };
  if (hand.moving) {
    const intent: Intent | null = same(hand.from, hand.to)
      ? null
      : { kind: 'editArea', placeId, poiId, id: hand.moving, at: hand.to };
    return { hand: measureCleared(hand), intent };
  }
  if (hand.mode === 'ruler') return { hand: { ...hand, held: false }, intent: null };
  const drawn = areaFromDrag(hand.mode, hand.from, hand.to);
  return {
    hand: measureCleared(hand),
    intent: {
      kind: 'placeArea', placeId, poiId, shape: hand.mode, at: drawn.at, aim: drawn.aim, size: drawn.size, colour: hand.colour,
    },
  };
}

/** How far apart two cubes are, middle to middle, as the readout says it. */
export function rulerLength(from: BlockCoord, to: BlockCoord): string {
  return walkLength(Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z));
}

/** The ruler to draw, or none. */
export function rulerShown(hand: MeasureHand): RulerDrawn | null {
  if (hand.mode !== 'ruler' || hand.moving || !hand.from || !hand.to || same(hand.from, hand.to)) return null;
  return { from: hand.from, to: hand.to, label: rulerLength(hand.from, hand.to) };
}

/**
 * Every area to draw, each where it is now — the one being moved where the
 * pointer has it — and the one being drawn. Hidden ones are drawn faint: only
 * the console has them, since the table is never sent one.
 */
export function areasShown(
  areas: Areas,
  hand: MeasureHand | null,
  standing: (id: string) => BlockCoord | null,
): readonly AreaDrawn[] {
  const drawn: AreaDrawn[] = areas.map((area: Area) => ({
    id: area.id,
    shape: area.shape,
    at: hand?.held && hand.moving === area.id && hand.to ? hand.to : areaAt(area, standing),
    aim: area.aim,
    size: area.size,
    colour: areaColour(area.colour),
    faint: area.hidden,
  }));
  if (hand?.held && !hand.moving && hand.mode !== 'ruler' && hand.from && hand.to) {
    const draft = areaFromDrag(hand.mode, hand.from, hand.to);
    drawn.push({ id: 'draft', shape: hand.mode, ...draft, colour: areaColour(hand.colour) });
  }
  return drawn;
}

/** The area whose handle is on this cube, by id — what a press there picks up. */
export function handleAt(areas: Areas, at: BlockCoord | null, standing: (id: string) => BlockCoord | null): string | null {
  return at ? areaStartingAt(areas, at, standing)?.id ?? null : null;
}

/** What the readout says with the Measure tool in hand. */
export function measurePrompt(hand: MeasureHand, overHandle: boolean): string {
  if (hand.held && hand.moving) return 'Let go where it should start.';
  if (overHandle) return 'Drag to move this area.';
  if (hand.mode === 'ruler') {
    if (hand.held && hand.from && hand.to) return `${rulerLength(hand.from, hand.to)} — let go to keep it.`;
    return 'Drag from one cube to another to measure.';
  }
  const shape = AREA_SHAPES.find((one) => one.id === hand.mode)!.name.toLowerCase();
  if (hand.held && hand.from && hand.to) {
    const { size } = areaFromDrag(hand.mode, hand.from, hand.to);
    return `A ${shape}, ${size} — let go to draw it.`;
  }
  return hand.mode === 'sphere'
    ? 'Drag from the middle outwards to draw a sphere.'
    : hand.mode === 'cube'
      ? 'Drag from one corner to the other to draw a cube.'
      : `Drag from its point the way it goes to draw a ${shape}.`;
}
