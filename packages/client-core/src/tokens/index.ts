// Moving the party inside a map: pick a token, aim at a floor, confirm — the
// world's travel sequence one surface down (R-132, R-188), shared by both
// screens so the console and the table cannot drift into behaving differently.
//
// Local until the confirm, like travel (R-64): nothing reaches the host while
// the ghost follows the pointer.

import type { Intent } from '@tt/protocol';
import type { BlockCoord, Cells, EncounterMap, LevelRange, MemberId, Tokens } from '@tt/domain';
import {
  whyNotStand, standsInBand, topOfMap, planeSteps, MAP_MAX_HEIGHT, MAP_MIN_DEPTH, NONE_OPEN, propById, propType,
} from '@tt/domain';
import type { Opened } from '@tt/domain';
import type { FacePick, TokenRef } from '@tt/render';

export type Stride =
  | { readonly step: 'idle' }
  | {
    readonly step: 'aiming';
    readonly memberId: string;
    /** The cube the token would stand in; `null` until the pointer is over a floor. */
    readonly at: BlockCoord | null;
    /** Why not, in the words the prompt uses — or `null` when they can stand there. */
    readonly why: string | null;
  };

export const still: Stride = { step: 'idle' };

/** Takes hold of one member's token, aimed at nothing yet. */
export function grab(memberId: string): Stride {
  return { step: 'aiming', memberId, at: null, why: null };
}

/**
 * Starts the sequence by itself when somebody is waiting to be placed (D-167).
 *
 * With Move in hand and the party in this map, a member with nowhere to stand
 * is held ready — the first of them in roster order, and after each confirm,
 * the next (R-188). Put the tool down and the sequence goes with it, rather
 * than leave a ghost armed under a tool that does not own it.
 *
 * Only the console calls this. The first placement is the GM's to make, and a
 * "point at a floor" prompt on the shared screen before the GM has put anybody
 * anywhere is D-167's reason for the world's version arming on the console
 * alone. Called from an effect keyed on the tool and on who is next, so that
 * Escape stays escaped until one of those moves.
 */
export function armedStride(stride: Stride, moveActive: boolean, next: string | null): Stride {
  if (!moveActive) return stride.step === 'aiming' ? still : stride;
  if (stride.step === 'aiming' || next === null) return stride;
  return grab(next);
}

/**
 * Where a token would stand, given the face under the pointer (R-184).
 *
 * **Top faces only**: the cube above the block. A token stands *on* what you
 * point at, so a side face aims at nothing — pointing at a wall never puts
 * somebody on top of it, and the GM turns the camera or cuts the band to reach
 * a floor a wall is hiding.
 *
 * The top of a prop, when one is nearer than the block behind it, is pointed
 * at in its own right (D-350): the cube above stairs is stood in. Above any
 * other prop the stand rules say why not, as they would over a wall.
 *
 * A ladder is pointed at in its own cube (D-357), whichever face of it is
 * under the pointer: a token is put on a rung, not above the ladder.
 */
export function tokenAim(face: FacePick | null, propFace: FacePick | null = null, rung = false): BlockCoord | null {
  if (rung && propFace) return propFace.block;
  const on = propFace ?? face;
  if (!on) return null;
  const { block, adjacent } = on;
  const up = adjacent.x === block.x && adjacent.z === block.z && adjacent.y === block.y + 1;
  if (up) return adjacent;
  // The side of a prop: the floor behind it, as before props were pointed at.
  return propFace ? tokenAim(face) : null;
}

/** Whether the prop under the pointer holds somebody in its own cube — a ladder (D-357) — for `tokenAim`. */
export function onRung(map: EncounterMap | null, prop: string | null): boolean {
  if (!map || !prop) return false;
  const found = propById(map.props, prop);
  return !!found && !!propType(found.type)?.climbable;
}

/** Identity-preserving, so a pointer that has not changed cube re-renders nothing. */
export function aimStride(stride: Stride, at: BlockCoord | null, why: string | null): Stride {
  if (stride.step !== 'aiming') return stride;
  const same = (at === null && stride.at === null)
    || (at !== null && stride.at !== null
      && at.x === stride.at.x && at.y === stride.at.y && at.z === stride.at.z);
  if (same && why === stride.why) return stride;
  return { ...stride, at, why: at ? why : null };
}

/** Where the ghost stands: nowhere unless the move would actually be made. */
export function strideGhost(stride: Stride): BlockCoord | null {
  return stride.step === 'aiming' && stride.why === null ? stride.at : null;
}

/**
 * The move a confirm sends. It names the map, so the host can refuse it if the
 * party has left that map in the meantime rather than land it in another one.
 */
export function strideIntent(
  stride: Extract<Stride, { step: 'aiming' }>,
  at: BlockCoord,
  placeId: string,
  poiId: string,
): Intent {
  return { kind: 'moveToken', placeId, poiId, memberId: stride.memberId, at };
}

/**
 * How far up a screen may let somebody stand: a band it knows, or a ceiling it
 * has worked out (R-185).
 *
 * The console knows its band. The table does not — it is sent a slice and
 * never the cut (D-250) — so it gets a ceiling from what it does hold.
 */
export type Headroom =
  | { readonly band: LevelRange }
  | { readonly ceiling: number }
  | null;

/**
 * The lowest level a table cannot be sure is inside its band (R-185).
 *
 * The table holds a slice and the plane list, and a band always rests on a
 * stop (R-161). So the band's top is at or above the first stop over the
 * highest level the table was shown — and a cube below that stop is certainly
 * inside it.
 *
 * Conservative on purpose. A band whose top levels are empty reads as ending
 * lower than it does, and the table then refuses a cube the host would allow:
 * a refusal the host never had to make, which is the safe direction to be
 * wrong in (R-138). The alternative — sending the table its band — is a
 * widening D-250 would ask to be argued for.
 */
export function tableCeiling(slice: EncounterMap): number {
  const top = topOfMap(slice);
  const above = planeSteps(slice.planes, MAP_MAX_HEIGHT, MAP_MIN_DEPTH).find((step) => step > top);
  return above ?? MAP_MAX_HEIGHT;
}

/**
 * Whether a member may stand in a cube, judged from what this screen holds —
 * or why not (R-138).
 *
 * The host is the authority (R-3); this is so a ghost never stands where a
 * click would be refused. **The levels are judged first**, the order the host
 * uses for the table: every other reason describes a cube, and a cube outside
 * the band is one the table was never sent.
 *
 * **Then sight, when `seen` is given** — the table's case (D-275). The players
 * may only stand somebody where the party has looked, and the table is sent
 * exactly that, so it can tell before it asks. The console passes nothing:
 * the GM stands anybody anywhere (R-39).
 */
export function standVerdict(
  map: EncounterMap,
  tokens: Tokens,
  memberId: string,
  at: BlockCoord,
  headroom: Headroom,
  seen: Cells | null = null,
  /**
   * Cubes silver tokens stand in (D-307) — all of them on the console, and on
   * the table only the ones it was sent. One to a cube, gold or silver.
   */
  others: ReadonlySet<string> = new Set(),
  /** Which props stand open in this map (D-322), from the save. */
  opened: Opened = NONE_OPEN,
): string | null {
  if (headroom && 'band' in headroom && !standsInBand(headroom.band, at)) {
    return 'outside the levels being shown';
  }
  if (headroom && 'ceiling' in headroom && at.y >= headroom.ceiling) {
    return 'above the levels being shown';
  }
  if (seen && !seen.has(`${at.x},${at.y},${at.z}`)) return 'the party has not seen it';
  switch (whyNotStand(map, tokens, memberId as MemberId, at, others, opened)) {
    case 'outside': return 'outside the map';
    case 'solid': return 'a block is there';
    case 'blocked': return 'something is in the way';
    case 'unsupported': return 'nothing to stand on';
    case 'taken': return 'somebody is standing there';
    default: return null;
  }
}

/** What a click means inside a map, to the Move tool and to the table alike (R-188). */
export type TokenAction =
  | { readonly kind: 'nothing' }
  | { readonly kind: 'confirm' }
  | { readonly kind: 'pickToken'; readonly memberId: string }
  | { readonly kind: 'pickSilver'; readonly id: string };

/**
 * A move in progress owns the click (D-174's rule, inside a map): it confirms
 * or cancels, whatever is under the pointer. Otherwise a token starts a move
 * and anything else does nothing.
 *
 * `silver` is the silver token under the pointer — passed by the console
 * alone, since only the GM moves them (R-206). A party token wins when both
 * are hit: it is the players', and the one more likely meant.
 */
export function tokenAction(
  token: TokenRef | null,
  aiming: boolean,
  silver: string | null = null,
): TokenAction {
  if (aiming) return { kind: 'confirm' };
  if (token) return { kind: 'pickToken', memberId: token.memberId };
  if (silver) return { kind: 'pickSilver', id: silver };
  return { kind: 'nothing' };
}

/**
 * Whether a move is a jump (D-371, D-372): the path chosen on screen — ground
 * or jump — and Shift, which does the other one while it is held. So a mouse
 * alone, or a finger, can jump, and a keyboard still can in passing.
 */
export function jumps(leap: boolean, shift: boolean): boolean {
  return leap !== shift;
}

/**
 * What to tell whoever is moving a token, on either screen — and, once they
 * have somewhere to go, whether it is a walk or a jump and how Shift switches
 * it (D-371). Placing somebody for the first time is neither.
 */
export function stridePrompt(
  stride: Stride,
  nameOf: (id: string) => string | null,
  placing: boolean,
  jumping = false,
  /** Is Shift held — is it what made the move what it is? */
  shift = jumping,
): string | null {
  if (stride.step !== 'aiming') return null;
  const who = nameOf(stride.memberId) ?? 'them';
  if (!stride.at) return `${placing ? 'Placing' : 'Moving'} ${who} — point at a floor.`;
  if (stride.why) return `${who}: ${stride.why}.`;
  if (placing) return `Place ${who} here? Click to confirm, Escape or right-click to cancel.`;
  return moveQuestion(who, jumping, shift);
}

/** The question a move asks before the click: walk or jump, and how Shift switches it (D-371, D-372). */
export function moveQuestion(who: string, jumping: boolean, shift = jumping): string {
  const other = jumping ? 'walk' : 'jump';
  const key = shift ? `let go of Shift to ${other}` : `hold Shift to ${other}`;
  return `${jumping ? 'Jump' : 'Move'} ${who} here? Click to confirm, ${key}, Escape or right-click to cancel.`;
}
