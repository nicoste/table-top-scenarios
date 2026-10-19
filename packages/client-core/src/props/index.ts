// The Props tool on the console (D-322, D-328), and the door a Move click
// opens. Local until the click (R-64): the ghost follows the pointer and
// nothing reaches the host until a prop is put down, edited or opened.
//
// A prop in hand is placed by a click, one per click — never dragged along a
// line (D-322); with nothing in hand, a click on a prop selects it, to turn,
// refinish, open or remove.

import type { Intent } from '@tt/protocol';
import type { BlockCoord, Box, EncounterMap, Facing, Opened, PropFooting, SwatchId } from '@tt/domain';
import { propBox, propById, propCubes, propType, turned, whyNotPut } from '@tt/domain';
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

/** Why not, in the readout's words (R-18). */
export function propWords(why: PropFooting): string {
  switch (why) {
    case 'outside': return 'outside the map';
    case 'solid': return 'a block is in the way';
    case 'taken': return 'something is already there';
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
): PropPreview | null {
  const type = hand.type ? propType(hand.type) : null;
  if (!type) return null;
  const candidate = { type: type.id, at, facing: hand.facing };
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
export function placePropIntent(hand: PropHand, at: BlockCoord, placeId: string, poiId: string): Intent | null {
  if (!hand.type) return null;
  return {
    kind: 'placeProp', placeId, poiId, type: hand.type, at, facing: hand.facing,
    ...(hand.finish ? { finish: hand.finish } : {}),
  };
}

/** What the readout says with the Props tool in hand. */
export function propPrompt(name: string | null, at: BlockCoord | null, why: string | null): string {
  if (!name) return 'Pick a prop from the catalogue, or click one on the map to change it.';
  if (!at) return `Placing a ${name.toLowerCase()} — point at where it should stand.`;
  if (why) return `${name}: ${why}.`;
  return `Click to place a ${name.toLowerCase()} here. Z / X turn it.`;
}

/**
 * A Move click on a prop (D-328): opens it if it is shut, shuts it if it is
 * open — only for one that opens. Nothing for a table.
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

/** What Move's readout says over a prop that opens: "Open the door", "Close the chest". */
export function toggleLabel(map: EncounterMap, id: string, opened: Opened): string | null {
  const prop = propById(map.props, id);
  const type = prop ? propType(prop.type) : null;
  if (!prop || !type?.opens) return null;
  return `${opened.has(prop.id) ? 'Close' : 'Open'} the ${type.name.toLowerCase()}`;
}
