// The pick / aim / confirm sequence, shared by both screens (R-132, R-134).
//
// Deliberately not React: it is a three-state machine and one intent mapping,
// and both apps hold the state with their own `useState`. What has to be shared
// is the *shape* of the sequence, so the GM console and the table display cannot
// drift into behaving differently.
//
// The whole sequence is local (R-64). Nothing reaches the host until `confirm`,
// which is what leaves room for the pathfinding preview to draw into the aim step
// and the travel menu to grow out of the confirm step (O-019, O-020) without a
// round-trip per pointer move.

import type { Intent } from '@tt/protocol';
import type { WorldCell } from '@tt/domain';
import type { PawnRef } from '@tt/render';

export type Travel =
  | { readonly step: 'idle' }
  | {
    readonly step: 'aiming';
    readonly pawn: PawnRef;
    /** Where the pointer last was over a cell; null before it has moved. */
    readonly at: WorldCell | null;
  };

export const idle: Travel = { step: 'idle' };

export function pick(pawn: PawnRef): Travel {
  return { step: 'aiming', pawn, at: null };
}

export function aim(travel: Travel, cell: WorldCell | null): Travel {
  if (travel.step !== 'aiming') return travel;
  if (cell === travel.at) return travel;
  if (cell && travel.at && sameCell(cell, travel.at)) return travel;
  return { ...travel, at: cell };
}

function sameCell(a: WorldCell, b: WorldCell): boolean {
  return a.cx === b.cx && a.cz === b.cz && a.x === b.x && a.z === b.z;
}

/**
 * The intent a confirmed move sends.
 *
 * The group pawn and a member pawn are different intents rather than one intent
 * with a nullable id, so `sim` can refuse moving a member while the party is
 * together without inspecting a payload for absence.
 */
export function travelIntent(pawn: PawnRef, cell: WorldCell): Intent {
  return pawn.memberId === null
    ? { kind: 'moveParty', cell }
    : { kind: 'movePartyMember', memberId: pawn.memberId, cell };
}

/** What to tell the user they are doing, on either screen. */
export function travelPrompt(travel: Travel, nameOf: (id: string) => string | null): string | null {
  if (travel.step !== 'aiming') return null;
  const who = travel.pawn.memberId === null ? 'the party' : nameOf(travel.pawn.memberId) ?? 'them';
  return travel.at
    ? `Move ${who} here? Click to confirm, or press Escape.`
    : `Moving ${who}. Point at a revealed cell.`;
}
