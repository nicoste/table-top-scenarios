// The Props tool on the console (D-322, D-328), and the door a Move click
// opens. Local until the click (R-64): the ghost follows the pointer and
// nothing reaches the host until a prop is put down, edited or opened.
//
// A prop in hand is placed by a click, one per click — never dragged along a
// line (D-322); with nothing in hand, a click on a prop selects it, to turn,
// refinish, open or remove.

import type { Intent } from '@tt/protocol';
import type { BlockCoord, Box, EncounterMap, Facing, Opened, PropFooting, PropType, SwatchId } from '@tt/domain';
import { facingWithBack, propBox, propById, propCubes, propType, statesOf, turned, whyNotPut } from '@tt/domain';
import type { FacePick, GhostCube } from '@tt/render';

/** The prop in hand: which catalogue entry, turned how, in which finish. */
export interface PropHand {
  readonly type: string | null;
  readonly facing: Facing;
  /** `null` for the entry's first finish. */
  readonly finish: string | null;
}

export const EMPTY_HAND: PropHand = { type: null, facing: 0, finish: null };

/** Picks an entry from the catalogue — in its first finish — or puts it back if it was in hand. */
export function takeProp(hand: PropHand, type: string): PropHand {
  return hand.type === type ? { ...hand, type: null } : { ...hand, type, finish: null };
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
    default: return 'nothing under it to stand on';
  }
}

/** What a click would do here: the box it would fill, drawn as cubes, and why not if it cannot. */
export interface PropPreview {
  readonly box: Box;
  readonly cubes: readonly GhostCube[];
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
  const finish = type.finishes.find((one) => one.id === hand.finish) ?? type.finishes[0]!;
  const why = whyNotPut(map, candidate, standing);
  return {
    box: propBox(candidate),
    cubes: propCubes(candidate).map((cube) => ({
      // Its finish, not a material: a prop is not made of blocks.
      at: cube, swatch: '' as SwatchId, outside: why !== null, colour: finish.colour,
    })),
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
    ...(hand.finish ? { finish: hand.finish } : {}),
  };
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
 * A Move click on a prop (D-328): opens it if it is shut, shuts it if it is
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

/** What Move's readout says over a prop that changes: "Open the door", "Put out the torch". */
export function toggleLabel(map: EncounterMap, id: string, opened: Opened): string | null {
  const prop = propById(map.props, id);
  const type = prop ? propType(prop.type) : null;
  if (!prop || !type?.opens) return null;
  const states = statesOf(type);
  return `${opened.has(prop.id) ? states.toPlaced : states.toOther} the ${type.name.toLowerCase()}`;
}
