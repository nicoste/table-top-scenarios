// The Props tool on the console (D-322, D-328), and the door a Play click
// opens. Local until the click (R-64): the ghost follows the pointer and
// nothing reaches the host until a prop is put down, edited or opened.
//
// A prop in hand is placed by a click, one per click — never dragged along a
// line (D-322); with nothing in hand, a click on a prop selects it, to turn,
// repaint, open or remove. The Paint tool paints a prop too, one per click,
// whatever its brush (D-352).

import type { Intent } from '@tt/protocol';
import type { BlockCoord, Box, EncounterMap, Facing, Opened, PropFooting, PropType, SwatchId } from '@tt/domain';
import {
  facingWithBack, paintOf, propBox, propById, propType, stackOf, statesOf, swatchName, turned, whyNotMove, whyNotPut,
} from '@tt/domain';
import type { FacePick, PropGhostDrawn } from '@tt/render';

/** The prop in hand: which catalogue entry, turned how, painted with what, and a light's flame. */
export interface PropHand {
  readonly type: string | null;
  readonly facing: Facing;
  /** Any block material (D-352); `null` for the entry's first. */
  readonly paint: SwatchId | null;
  /** A light's flame; `null` for the entry's first. */
  readonly flame: string | null;
}

export const EMPTY_HAND: PropHand = { type: null, facing: 0, paint: null, flame: null };

/** Picks an entry from the catalogue — in its first paint and flame — or puts it back if it was in hand. */
export function takeProp(hand: PropHand, type: string): PropHand {
  return hand.type === type ? { ...hand, type: null } : { ...hand, type, paint: null, flame: null };
}

/** Z / X: a quarter turn anticlockwise or clockwise, seen from above (R-203). */
export function turnHand(hand: PropHand, step: number): PropHand {
  return { ...hand, facing: turned(hand.facing, step) };
}

/**
 * Where a prop would stand, given what is under the pointer: against the face
 * pointed at — the cube Build would fill — and against a prop's face when the
 * pointer is on one, so a bookcase stands on a bookcase (D-322).
 */
export function propAim(face: FacePick | null, propFace: FacePick | null): BlockCoord | null {
  return (propFace ?? face)?.adjacent ?? null;
}

/**
 * The facing that hangs a torch on the wall pointed at (D-335): its back to
 * the block whose side is under the pointer. `null` over a floor, a ceiling
 * or a prop — then the hand's own facing, turned with Z / X, decides.
 */
export function propWall(face: FacePick | null, propFace: FacePick | null): Facing | null {
  if (propFace || !face || face.adjacent.y !== face.block.y) return null;
  return facingWithBack({ x: face.block.x - face.adjacent.x, z: face.block.z - face.adjacent.z });
}

/**
 * How the prop in hand would be turned here: to the wall pointed at, for one
 * that hangs (D-335) or is set against one, as stairs are (D-350).
 */
function facingHere(hand: PropHand, wall: Facing | null): Facing {
  const type = hand.type ? propType(hand.type) : undefined;
  return wall !== null && (type?.hangs || type?.turnsToWall) ? wall : hand.facing;
}

/** Why not, in the readout's words (R-18). */
export function propWords(why: PropFooting): string {
  switch (why) {
    case 'outside': return 'outside the map';
    case 'solid': return 'a block is in the way';
    case 'taken': return 'something is already there';
    case 'unhung': return 'no wall behind it to hang on';
    default: return 'nothing under it or beside it to hold it';
  }
}

/**
 * What a click would do here: the box it would fill, the prop itself as it
 * would stand there (D-351), and why not if it cannot.
 */
export interface PropPreview {
  readonly box: Box;
  readonly ghost: PropGhostDrawn;
  readonly why: string | null;
}

export function propPreview(
  map: EncounterMap,
  hand: PropHand,
  at: BlockCoord,
  standing: ReadonlySet<string>,
  /** The wall pointed at, for one that hangs (`propWall`). */
  wall: Facing | null = null,
): PropPreview | null {
  const type = hand.type ? propType(hand.type) : null;
  if (!type) return null;
  const candidate = { type: type.id, at, facing: facingHere(hand, wall) };
  const why = whyNotPut(map, candidate, standing);
  return {
    box: propBox(candidate),
    ghost: { ...candidate, paint: hand.paint, flame: hand.flame, refused: why !== null },
    why: why ? propWords(why) : null,
  };
}

/** The placement a click sends, or nothing with no prop in hand. */
export function placePropIntent(
  hand: PropHand,
  at: BlockCoord,
  placeId: string,
  poiId: string,
  wall: Facing | null = null,
): Intent | null {
  if (!hand.type) return null;
  return {
    kind: 'placeProp', placeId, poiId, type: hand.type, at, facing: facingHere(hand, wall),
    ...(hand.paint ? { paint: hand.paint } : {}),
    ...(hand.flame ? { flame: hand.flame } : {}),
  };
}

/**
 * A prop being dragged somewhere else (D-354): the one selected, pressed on
 * and dragged with the Props tool and nothing in hand. Local until it is let
 * go (R-64); what rests on it goes with it.
 */
export interface PropDrag {
  readonly id: string;
  /** The cube it would stand at, as a prop in hand would; null until the pointer finds one. */
  readonly at: BlockCoord | null;
}

/** What letting go would do: everything carried, where it would land, the box round it, and why not. */
export interface PropMovePreview {
  readonly box: Box;
  readonly ghosts: readonly PropGhostDrawn[];
  readonly why: string | null;
}

const sameCube = (a: BlockCoord, b: BlockCoord) => a.x === b.x && a.y === b.y && a.z === b.z;

/** The ghosts of a drag, or nothing while it would land where it stands. */
export function propMovePreview(
  map: EncounterMap,
  drag: PropDrag,
  standing: ReadonlySet<string>,
): PropMovePreview | null {
  const stack = stackOf(map.props, drag.id);
  const prop = stack[0];
  if (!prop || !drag.at || sameCube(prop.at, drag.at)) return null;
  const why = whyNotMove(map, drag.id, drag.at, standing);
  const step = { x: drag.at.x - prop.at.x, y: drag.at.y - prop.at.y, z: drag.at.z - prop.at.z };
  const landed = stack.map((one) => ({ ...one, at: { x: one.at.x + step.x, y: one.at.y + step.y, z: one.at.z + step.z } }));
  const boxes = landed.map(propBox);
  return {
    box: {
      min: { x: Math.min(...boxes.map((b) => b.min.x)), y: Math.min(...boxes.map((b) => b.min.y)), z: Math.min(...boxes.map((b) => b.min.z)) },
      max: { x: Math.max(...boxes.map((b) => b.max.x)), y: Math.max(...boxes.map((b) => b.max.y)), z: Math.max(...boxes.map((b) => b.max.z)) },
    },
    ghosts: landed.map((one) => ({
      type: one.type, at: one.at, facing: one.facing, paint: one.paint ?? null, flame: one.flame ?? null, refused: why !== null,
    })),
    why: why ? propWords(why) : null,
  };
}

/** What letting go sends: the move, or nothing where it would not stand or would not move. */
export function propMoveIntent(
  map: EncounterMap,
  drag: PropDrag,
  standing: ReadonlySet<string>,
  placeId: string,
  poiId: string,
): Intent | null {
  const preview = propMovePreview(map, drag, standing);
  if (!preview || preview.why || !drag.at) return null;
  return { kind: 'moveProp', placeId, poiId, id: drag.id, at: drag.at };
}

/** What the readout says while a prop is dragged: where it would go, or why not. */
export function propMovePrompt(map: EncounterMap, drag: PropDrag, standing: ReadonlySet<string>): string {
  const stack = stackOf(map.props, drag.id);
  const type = stack[0] ? propType(stack[0].type) : undefined;
  if (!type) return '';
  const what = `the ${type.name.toLowerCase()}${stack.length > 1 ? ' and what is on it' : ''}`;
  const preview = propMovePreview(map, drag, standing);
  if (!preview) return `Moving ${what} — drag it where it should stand; Escape leaves it.`;
  if (preview.why) return `${type.name}: ${preview.why}.`;
  return `Let go to move ${what} here.`;
}

/**
 * What a Paint click on a prop sends (D-352): that prop, and only that one,
 * painted with the material in hand — whatever the brush, a fill included —
 * or nothing when it is painted with it already.
 */
export function paintPropIntent(
  map: EncounterMap,
  id: string,
  swatch: SwatchId,
  placeId: string,
  poiId: string,
): Intent | null {
  const prop = propById(map.props, id);
  if (!prop || paintOf(prop) === swatch) return null;
  return { kind: 'editProp', placeId, poiId, id: prop.id, paint: swatch };
}

/** What the readout says with Paint over a prop: what a click would make it, or that it is already. */
export function paintPropPrompt(map: EncounterMap, id: string, swatch: SwatchId): string | null {
  const prop = propById(map.props, id);
  const type = prop ? propType(prop.type) : undefined;
  if (!prop || !type) return null;
  const name = swatchName(swatch) ?? 'that';
  const the = `the ${type.name.toLowerCase()}`;
  return paintOf(prop) === swatch
    ? `${type.name}: already ${name}.`
    : `Click to paint ${the} ${name}.`;
}

/**
 * What the readout says with the Props tool in hand. One that hangs is hung on
 * a wall (D-335); stairs are turned to one, or with Z / X (D-350).
 */
export function propPrompt(type: PropType | null, at: BlockCoord | null, why: string | null): string {
  if (!type) return 'Pick a prop from the catalogue, or click one on the map to change it.';
  // "a torch", but "candles" and "stairs".
  const one = `${type.plural ? '' : 'a '}${type.name.toLowerCase()}`;
  if (!at) return type.hangs ? `Hanging ${one} — point at a wall.` : `Placing ${one} — point at where it should stand.`;
  if (why) return `${type.name}: ${why}.`;
  return type.hangs ? `Click to hang ${one} here.` : `Click to place ${one} here. Z / X turn it.`;
}

/**
 * A Play click on a prop (D-328, D-354): opens it if it is shut, shuts it if it is
 * open — or puts a light out, or lights it (D-335). Only for one that
 * changes; nothing for a table.
 */
export function toggleIntent(
  map: EncounterMap,
  id: string,
  opened: Opened,
  placeId: string,
  poiId: string,
): Intent | null {
  const prop = propById(map.props, id);
  if (!prop || !propType(prop.type)?.opens) return null;
  return { kind: 'setPropOpen', placeId, poiId, id: prop.id, open: !opened.has(prop.id) };
}

/** What Play's readout says over a prop that changes: "Open the door", "Put out the torch". */
export function toggleLabel(map: EncounterMap, id: string, opened: Opened): string | null {
  const prop = propById(map.props, id);
  const type = prop ? propType(prop.type) : null;
  if (!prop || !type?.opens) return null;
  const states = statesOf(type);
  return `${opened.has(prop.id) ? states.toPlaced : states.toOther} the ${type.name.toLowerCase()}`;
}
