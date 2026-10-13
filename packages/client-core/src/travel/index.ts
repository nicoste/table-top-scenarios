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
  }
  /**
   * Aimed and clicked, now being **costed** (R-199).
   *
   * A fourth step rather than a fourth thing the click does: the destination
   * is settled and what is left is to look at what it costs and say yes. It
   * carries no transport, because the party's conveyances are chosen when the
   * tool is picked up and are a fact about the party, not about this journey
   * (R-200).
   */
  | {
    readonly step: 'choosing';
    readonly pawn: PawnRef;
    readonly at: WorldCell;
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

/**
 * Opens the costing step, or leaves the sequence where it is.
 *
 * Guarded on `canConfirm` rather than trusting the caller: the click that
 * reaches here is the same click that lands on unreachable ground, and a menu
 * offering to cost a journey nobody can make is worse than no menu.
 */
export function choose(travel: Travel): Travel {
  if (!canConfirm(travel) || travel.step !== 'aiming' || !travel.at) return travel;
  return { step: 'choosing', pawn: travel.pawn, at: travel.at };
}

/** Where the ghost should stand: nowhere unless the move is actually possible. */
export function ghostCell(travel: Travel): WorldCell | null {
  if (travel.step === 'choosing') return travel.at;
  return travel.step === 'aiming' && travel.reachable ? travel.at : null;
}

/** The cell a route should be drawn to, through either of the live steps. */
export function aimedAt(travel: Travel): WorldCell | null {
  if (travel.step === 'choosing') return travel.at;
  return travel.step === 'aiming' ? travel.at : null;
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

/**
 * A journey's length, said the way it is said at a table (R-199).
 *
 * **Hours right up to the day**, because the alternative collapses a range
 * that matters: "a day" for everything between half a day and a day put a
 * forced march and a mounted ride on the same line when one is half again
 * faster than the other (D-298). Over a day it is days to one decimal, which
 * is as much precision as a 1.5 km cell honestly carries.
 */
export function journeyLength(days: number): string {
  if (!Number.isFinite(days) || days < 0) return '—';
  if (days * 24 < 1) return 'under an hour';
  if (days < 1) {
    const hours = Math.round(days * 24);
    return hours === 1 ? 'an hour' : `${hours} hours`;
  }
  if (days < 1.05) return 'a day';
  return `${days.toFixed(1)} days`;
}

/** What to tell the user they are doing, on either screen. */
export function travelPrompt(travel: Travel, nameOf: (id: string) => string | null): string | null {
  if (travel.step === 'idle') return null;
  const who = travel.pawn.memberId === null ? 'the party' : nameOf(travel.pawn.memberId) ?? 'them';
  // The menu says the rest; the readout only has to say whose journey it is.
  if (travel.step === 'choosing') return `How are ${who} travelling?`;
  if (!travel.at) return `Moving ${who}. Point at a revealed cell.`;
  return travel.reachable
    ? `Move ${who} here? Click to confirm, Escape or right-click to cancel.`
    : `${who[0]!.toUpperCase()}${who.slice(1)} have not been there — reveal the chunk first.`;
}
