// Moving and turning a place: pick it up, aim at a cell, set it down (R-203) —
// the travel and token sequences again, for the thing the GM builds rather
// than the people who walk through it.
//
// Local until it is set down, like both of those (R-64): nothing reaches the
// host while the ghost follows the pointer, so putting it back is not an undo,
// it is simply not sending anything.

import type { Intent } from '@tt/protocol';
import type { Facing, WorldCell } from '@tt/domain';
import { turned } from '@tt/domain';

export type Carry =
  | { readonly step: 'idle' }
  | {
    readonly step: 'carrying';
    readonly placeId: string;
    /** Where it came from, which is where a right-click puts it back. */
    readonly home: WorldCell;
    /** Which way it faced when picked up, so putting it back is recognisable. */
    readonly homeFacing: Facing;
    /** Which way it faces now — turned while carried, set down with it. */
    readonly facing: Facing;
  };

export const emptyHanded: Carry = { step: 'idle' };

/** Takes hold of a place, facing the way it already faces. */
export function pickUp(placeId: string, home: WorldCell, facing: Facing): Carry {
  return { step: 'carrying', placeId, home, homeFacing: facing, facing };
}

/**
 * The carried place turned a quarter at a time (Z / X). Positive is clockwise
 * seen from above. With nothing in hand it hands back the same object, so the
 * caller can turn the facing for the *next* place instead.
 */
export function turnCarried(carry: Carry, steps: number): Carry {
  if (carry.step !== 'carrying' || steps === 0) return carry;
  return { ...carry, facing: turned(carry.facing, steps) };
}

/**
 * Whether the carried place may be set down on this cell, given what already
 * stands there.
 *
 * A different place there is a no (R-119, one place per cell); its **own**
 * home is a yes, because setting it back down where it was is how it is
 * turned without being moved.
 */
export function canSetDown(carry: Carry, occupant: string | null): boolean {
  return carry.step === 'carrying' && (occupant === null || occupant === carry.placeId);
}

/**
 * The intent that sets the carried place down here, or `null`.
 *
 * `null` when the cell will not take it, and also when **nothing changed** —
 * set down on its own cell facing the way it already faced. That is a
 * pick-up-and-put-back, and sending it would put an edit that changes nothing
 * in the undo history.
 */
export function setDownIntent(
  carry: Carry,
  cell: WorldCell | null,
  occupant: string | null,
): Intent | null {
  if (carry.step !== 'carrying' || !cell || !canSetDown(carry, occupant)) return null;
  const home = carry.home;
  const moved = cell.cx !== home.cx || cell.cz !== home.cz || cell.x !== home.x || cell.z !== home.z;
  if (!moved && carry.facing === carry.homeFacing) return null;
  return {
    kind: 'movePlace',
    id: carry.placeId,
    cell: { cx: cell.cx, cz: cell.cz, x: cell.x, z: cell.z },
    facing: carry.facing,
  };
}

/**
 * What the readout says under the Places tool, or `null` to leave it to the
 * ground readout (R-18: a click that will do nothing says so first).
 *
 * `here` is the place on the hovered cell, if any.
 */
export function placesPrompt(
  carry: Carry,
  here: { readonly id: string; readonly name: string } | null,
  carriedName: string | null,
): string | null {
  if (carry.step === 'carrying') {
    const name = carriedName ?? 'it';
    if (here && here.id !== carry.placeId) return `${here.name} is already here`;
    return `Set ${name} down here? Z / X turn it, right-click puts it back.`;
  }
  if (here) return `Click to pick up ${here.name}`;
  return null;
}
