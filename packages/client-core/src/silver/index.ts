// Placing and moving silver tokens (R-206), on the console — the only screen
// that may. The party's token sequence (R-188), for the GM's people: pick one
// up, aim at a floor, confirm; or, with Spawn in hand, aim and click to place
// another from the Tokens Library, as many times as the GM likes (D-307).
//
// Local until the click (R-64): nothing reaches the host while a ghost
// follows the pointer.

import type { Intent } from '@tt/protocol';
import type { BlockCoord, EncounterMap, LevelRange, SilverTokens, Tokens } from '@tt/domain';
import { NONE_OPEN, standsInBand, whyNotPlace } from '@tt/domain';
import type { Opened } from '@tt/domain';
import { moveQuestion } from '../tokens/index.js';

/** A silver token being moved, if one is. */
export type SilverMove =
  | { readonly step: 'idle' }
  | {
    readonly step: 'aiming';
    readonly id: string;
    /** The cube it would stand in; `null` until the pointer is over a floor. */
    readonly at: BlockCoord | null;
    /** Why not, in the readout's words, or `null` when it can stand there. */
    readonly why: string | null;
  };

export const noSilverMove: SilverMove = { step: 'idle' };

export function grabSilver(id: string): SilverMove {
  return { step: 'aiming', id, at: null, why: null };
}

/** Identity-preserving, so a pointer that has not changed cube re-renders nothing. */
export function aimSilverMove(move: SilverMove, at: BlockCoord | null, why: string | null): SilverMove {
  if (move.step !== 'aiming') return move;
  const same = (at === null && move.at === null)
    || (at !== null && move.at !== null && at.x === move.at.x && at.y === move.at.y && at.z === move.at.z);
  if (same && why === move.why) return move;
  return { ...move, at, why: at ? why : null };
}

/** Where the ghost stands: nowhere unless the move would be made. */
export function silverMoveGhost(move: SilverMove): BlockCoord | null {
  return move.step === 'aiming' && move.why === null ? move.at : null;
}

/**
 * Whether a silver token may stand in a cube, judged from what the console
 * holds — or why not, in the words the readout uses (R-18). The host decides
 * (R-3); this is so a ghost never stands where a click would be refused.
 *
 * The band first, when the console is levelling: a token placed outside it
 * would stand where the GM cannot see it drawn (R-185). Then the footing, and
 * one to a cube, gold or silver (D-307). `self` is the token being moved.
 */
export function silverVerdict(
  map: EncounterMap,
  party: Tokens,
  silver: SilverTokens,
  at: BlockCoord,
  band: LevelRange | null,
  self?: string,
  opened: Opened = NONE_OPEN,
): string | null {
  if (band && !standsInBand(band, at)) return 'outside the levels being shown';
  switch (whyNotPlace(map, party, silver, at, self, opened)) {
    case 'outside': return 'outside the map';
    case 'solid': return 'a block is there';
    case 'blocked': return 'something is in the way';
    case 'unsupported': return 'nothing to stand on';
    case 'taken': return 'somebody is standing there';
    default: return null;
  }
}

/** The move a confirm sends. It names the map, so it can never land in another. */
export function silverMoveIntent(
  move: Extract<SilverMove, { step: 'aiming' }>,
  at: BlockCoord,
  placeId: string,
  poiId: string,
): Intent {
  return { kind: 'moveSilver', placeId, poiId, id: move.id, at };
}

/** Places another token from a library entry (D-307). */
export function spawnIntent(templateId: string, at: BlockCoord, placeId: string, poiId: string): Intent {
  return { kind: 'spawnSilver', placeId, poiId, templateId, at };
}

/** What the readout says while a silver token is being moved. */
export function silverMovePrompt(
  move: SilverMove,
  nameOf: (id: string) => string | null,
  jumping = false,
  shift = jumping,
): string | null {
  if (move.step !== 'aiming') return null;
  const who = nameOf(move.id) ?? 'them';
  if (!move.at) return `Moving ${who} — point at a floor.`;
  if (move.why) return `${who}: ${move.why}.`;
  return moveQuestion(who, jumping, shift);
}

/**
 * What the readout says with Spawn in hand (R-18): which entry a click will
 * place, and where — or why it will not, before the click.
 */
export function spawnPrompt(entry: string | null, at: BlockCoord | null, why: string | null): string {
  if (!entry) return 'Pick a token from the library to place it.';
  if (!at) return `Placing ${entry} — point at a floor.`;
  if (why) return `${entry}: ${why}.`;
  return `Click to place ${entry} here. Keep clicking to place more.`;
}
