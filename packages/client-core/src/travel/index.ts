// The pick / aim / confirm sequence, shared by both screens (R-132, R-134).
//
// Deliberately not React: it is a small state machine and one intent mapping,
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
    /**
     * Whether the party could actually stand there (R-131).
     *
     * Checked on the client as well as in `sim` — not because the client is
     * trusted, but because a ghost that follows the pointer into unexplored
     * ground offers a move that will be refused. The GM console draws every
     * authored chunk with a fog overlay on top, so the terrain under the dark is
     * real geometry and aims perfectly well (D-164).
     */
    readonly reachable: boolean;
  };

export const idle: Travel = { step: 'idle' };

/** The whole party travelling as one. Also the pawn used for a first placement. */
export const GROUP: PawnRef = { memberId: null };

export function pick(pawn: PawnRef): Travel {
  return { step: 'aiming', pawn, at: null, reachable: false };
}

/**
 * Starts the sequence by itself when there is **nothing to pick up**.
 *
 * The party's first appearance on the map is a move like any other (D-150) — but
 * step one is "pick a pawn", and before the first placement no pawn exists. That
 * left the party unplaceable through the UI, with the panel cheerfully
 * instructing a flow that could not run (D-167).
 *
 * So with the travel tool active and the party nowhere, the sequence arms itself
 * holding the group pawn: aim and confirm work unchanged, ghost and reachability
 * guard included.
 */
export function armed(travel: Travel, travelActive: boolean, partyPlaced: boolean): Travel {
  if (partyPlaced) return travel;
  if (travelActive) return travel.step === 'aiming' ? travel : pick(GROUP);
  // Tool switched away before placing: drop the sequence rather than leave a
  // ghost armed under a tool that does not own it.
  return travel.step === 'aiming' ? idle : travel;
}

export function aim(travel: Travel, cell: WorldCell | null, reachable: boolean): Travel {
  if (travel.step !== 'aiming') return travel;
  const same = cell === travel.at || (cell && travel.at && sameCell(cell, travel.at));
  if (same && reachable === travel.reachable) return travel;
  return { ...travel, at: cell, reachable: cell ? reachable : false };
}

/** Where the ghost should stand: nowhere unless the move is actually possible. */
export function ghostCell(travel: Travel): WorldCell | null {
  return travel.step === 'aiming' && travel.reachable ? travel.at : null;
}

/** Whether a click right now would send a move. */
export function canConfirm(travel: Travel): boolean {
  return travel.step === 'aiming' && travel.reachable && travel.at !== null;
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
  if (!travel.at) return `Moving ${who}. Point at a revealed cell.`;
  return travel.reachable
    ? `Move ${who} here? Click to confirm, Escape or right-click to cancel.`
    : `${who[0]!.toUpperCase()}${who.slice(1)} have not been there — reveal the chunk first.`;
}
