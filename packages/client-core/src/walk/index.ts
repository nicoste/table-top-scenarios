// The walk a token being moved would take, and how far, as both screens show
// it while a move is aimed (R-209). Local, like the ghost it rides with
// (R-64): each screen draws its own aim, and nothing reaches the host.
//
// A preview, never a rule (R-133): a move with no path is allowed all the
// same, and the readout says so in two words.

import type { BlockCoord, EncounterMap, Opened } from '@tt/domain';
import { walkAcross } from '@tt/domain';
import type { WalkDrawn } from '@tt/render';

export const NO_PATH = 'no path';

/**
 * A length as the readout says it: a **bare number**, to one decimal and
 * none when it is whole — `7`, `7.4` (D-316). No unit, as with "sees 12":
 * what it counts in is the table's business.
 */
export function walkLength(length: number): string {
  return String(Math.round(length * 10) / 10);
}

/**
 * What to draw for a move being aimed: the floors on the way and the number,
 * or *no path*. Nothing at all with no token to measure from — somebody being
 * placed for the first time — or no ghost standing, or the aim on their own
 * cube.
 *
 * `may` is the screen's own limits on the floors a path may cross: the band
 * on the console while levelling, and on the table its ceiling and the floors
 * the party has seen, so a path never draws a room nobody has looked into.
 */
export function walkShown(
  map: EncounterMap | null,
  from: BlockCoord | null,
  to: BlockCoord | null,
  may?: (at: BlockCoord) => boolean,
  /** Which props stand open (D-322): a walk goes through an open door and round a shut one. */
  opened?: Opened,
): WalkDrawn | null {
  if (!map || !from || !to) return null;
  if (from.x === to.x && from.y === to.y && from.z === to.z) return null;
  const walk = walkAcross(map, from, to, may, undefined, opened);
  return walk
    ? { to, cubes: walk.cubes, label: walkLength(walk.length) }
    : { to, cubes: [], label: NO_PATH };
}
