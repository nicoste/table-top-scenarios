// The pick / aim / choose / confirm sequence (R-132, R-199), including the
// client-side reachability guard that D-164 added.
//
// This exists because of a gap the GM pointed out: bugs living in the apps were
// getting fixed without tests, since R-23 exempts the apps. The sequence is not
// three.js — it is a state machine — so it moved into `client-core` and is
// tested like any other rule.

import { describe, it, expect } from 'vitest';
import type { Travel } from '@tt/client-core';
import {
  idle, GROUP, pick, armed, aim, choose, byWay, ghostCell, aimedAt,
  canConfirm, travelIntent, travelPrompt, journeyLength,
} from '@tt/client-core';
import type { TravelModeId } from '@tt/domain';
import type { WorldCell } from '@tt/domain';

const cell = (x: number, z: number): WorldCell => ({ cx: 15, cz: 15, x, z });
const group = { memberId: null };
const member = { memberId: 'member_frodo' };
const nameOf = (id: string) => (id === 'member_frodo' ? 'Frodo' : null);

const aiming = (at: WorldCell | null, reachable: boolean): Travel =>
  aim(pick(group), at, reachable);

describe('picking up a pawn', () => {
  it('starts aiming at nothing, and nothing is confirmable yet', () => {
    const travel = pick(group);
    expect(travel.step).toBe('aiming');
    expect(ghostCell(travel)).toBeNull();
    expect(canConfirm(travel)).toBe(false);
  });

  it('ignores aiming while idle', () => {
    expect(aim(idle, cell(1, 1), true)).toBe(idle);
  });
});

describe('the ghost only stands where the party could (D-164)', () => {
  it('appears on a reachable cell', () => {
    const travel = aiming(cell(4, 4), true);
    expect(ghostCell(travel)).toEqual(cell(4, 4));
    expect(canConfirm(travel)).toBe(true);
  });

  it('stays off the board over unexplored ground', () => {
    // The bug: the GM console draws every authored chunk with fog on top, so the
    // terrain under the dark is real geometry and aims perfectly well. The ghost
    // followed the pointer in and offered a move the host then refused.
    const travel = aiming(cell(4, 4), false);
    expect(ghostCell(travel)).toBeNull();
    expect(canConfirm(travel)).toBe(false);
  });

  it('is never confirmable with no cell under the pointer', () => {
    expect(canConfirm(aiming(null, true))).toBe(false);
  });

  it('forgets reachability when the pointer leaves the map', () => {
    const away = aim(aiming(cell(4, 4), true), null, true);
    expect(away.step === 'aiming' && away.reachable).toBe(false);
  });
});

describe('identity, so a pointer move does not re-render the world', () => {
  it('is preserved when nothing changed', () => {
    const travel = aiming(cell(4, 4), true);
    expect(aim(travel, cell(4, 4), true)).toBe(travel);
  });

  it('is not preserved when the cell changes', () => {
    const travel = aiming(cell(4, 4), true);
    expect(aim(travel, cell(5, 4), true)).not.toBe(travel);
  });

  it('is not preserved when only reachability changes', () => {
    // Same cell, but the GM just revealed the chunk: the ghost has to appear.
    const travel = aiming(cell(4, 4), false);
    const now = aim(travel, cell(4, 4), true);
    expect(now).not.toBe(travel);
    expect(ghostCell(now)).toEqual(cell(4, 4));
  });
});

describe('what a confirmed move sends', () => {
  it('moves the whole party for the group pawn', () => {
    expect(travelIntent(group, cell(2, 3))).toEqual({ kind: 'moveParty', cell: cell(2, 3) });
  });

  it('moves one member by id', () => {
    expect(travelIntent(member, cell(2, 3)))
      .toEqual({ kind: 'movePartyMember', memberId: 'member_frodo', cell: cell(2, 3) });
  });
});

describe('what the prompt says', () => {
  it('says nothing at all when idle', () => {
    expect(travelPrompt(idle, nameOf)).toBeNull();
  });

  it('asks for a destination before the pointer has moved', () => {
    expect(travelPrompt(pick(group), nameOf)).toMatch(/Point at a revealed cell/);
  });

  it('offers both ways out on a reachable cell', () => {
    const prompt = travelPrompt(aiming(cell(1, 1), true), nameOf)!;
    expect(prompt).toMatch(/Click to confirm/);
    expect(prompt).toMatch(/Escape/);
    expect(prompt).toMatch(/right-click/);
  });

  it('explains the refusal instead of going quiet', () => {
    // Silence here is the whole complaint: the pointer is over ground and
    // nothing happens (R-18).
    expect(travelPrompt(aiming(cell(1, 1), false), nameOf))
      .toMatch(/have not been there — reveal the chunk first/);
  });

  it('names the member when one is travelling alone', () => {
    expect(travelPrompt(aim(pick(member), cell(1, 1), true), nameOf)).toMatch(/Move Frodo here/);
  });

  it('falls back to a pronoun for a member it cannot name', () => {
    expect(travelPrompt(aim(pick({ memberId: 'gone' }), cell(1, 1), true), nameOf))
      .toMatch(/Move them here/);
  });
});

describe('the first placement, when there is no pawn to pick up (D-167)', () => {
  it('arms itself with the group pawn', () => {
    // The bug the GM hit on a fresh campaign: reveal a chunk, then discover the
    // party cannot be placed at all, because step one is "pick a pawn".
    const travel = armed(idle, true, false);
    expect(travel.step).toBe('aiming');
    expect(travel.step === 'aiming' && travel.pawn).toEqual(GROUP);
  });

  it('confirms into a plain move, so placement needs no second intent', () => {
    const ready = aim(armed(idle, true, false), cell(6, 6), true);
    expect(canConfirm(ready)).toBe(true);
    expect(travelIntent(GROUP, cell(6, 6))).toEqual({ kind: 'moveParty', cell: cell(6, 6) });
  });

  it('still refuses to aim at unexplored ground while placing', () => {
    // Placement obeys R-131 like any other move: there is no exemption for the
    // first one.
    const blocked = aim(armed(idle, true, false), cell(6, 6), false);
    expect(ghostCell(blocked)).toBeNull();
    expect(canConfirm(blocked)).toBe(false);
  });

  it('does nothing once the party is on the map', () => {
    expect(armed(idle, true, true)).toBe(idle);
  });

  it('does not re-arm over a sequence already running', () => {
    const running = aim(pick({ memberId: 'member_frodo' }), cell(1, 1), true);
    expect(armed(running, true, false)).toBe(running);
  });

  it('disarms when the tool is switched away before placing', () => {
    const ready = aim(armed(idle, true, false), cell(6, 6), true);
    expect(armed(ready, false, false)).toBe(idle);
  });

  it('leaves an idle sequence alone under another tool', () => {
    expect(armed(idle, false, false)).toBe(idle);
  });
});

describe('the costing step, between aiming and the move (R-199)', () => {
  const FOOT = 'travel:foot' as TravelModeId;
  const SHIP = 'travel:ship' as TravelModeId;

  it('opens on a reachable cell, carrying the destination and the transport', () => {
    const next = choose(aiming(cell(4, 4), true), FOOT);
    expect(next.step).toBe('choosing');
    if (next.step !== 'choosing') throw new Error('unreachable');
    expect(next.at).toEqual(cell(4, 4));
    expect(next.mode).toBe(FOOT);
    expect(next.pawn).toEqual(group);
  });

  it('refuses to open on ground the party cannot reach', () => {
    // The same click that lands on unexplored ground. A menu offering to cost
    // a journey nobody can make is worse than no menu, so the caller gets the
    // sequence back unchanged and cancels it itself (D-164).
    const stuck = aiming(cell(4, 4), false);
    expect(choose(stuck, FOOT)).toBe(stuck);
    // Aimed at nothing at all: the pointer is off the map.
    const nowhere = aiming(null, true);
    expect(choose(nowhere, FOOT)).toBe(nowhere);
    expect(choose(idle, FOOT)).toBe(idle);
  });

  it('swaps the transport, and keeps identity when it is already that one', () => {
    // Identity because the route is recomputed off this state: re-picking the
    // mode already in hand must not re-run the search (R-165, R-198).
    const open = choose(aiming(cell(4, 4), true), FOOT);
    expect(byWay(open, FOOT)).toBe(open);
    const sailed = byWay(open, SHIP);
    expect(sailed).not.toBe(open);
    expect(sailed.step === 'choosing' && sailed.mode).toBe(SHIP);
  });

  it('leaves anything that is not being costed alone', () => {
    expect(byWay(idle, SHIP)).toBe(idle);
    const stuck = aiming(cell(4, 4), true);
    expect(byWay(stuck, SHIP)).toBe(stuck);
  });

  it('keeps the ghost and the route on the destination while the menu is open', () => {
    // The route stays drawn behind the menu and redraws as the transport
    // changes, so what is being decided is visible the whole time.
    const open = choose(aiming(cell(7, 2), true), FOOT);
    expect(ghostCell(open)).toEqual(cell(7, 2));
    expect(aimedAt(open)).toEqual(cell(7, 2));
  });

  it('asks the question in the readout rather than repeating the menu', () => {
    const open = choose(aim(pick(member), cell(1, 1), true), FOOT);
    expect(travelPrompt(open, nameOf)).toBe('How are Frodo travelling?');
  });

  it('sends the same intent it always did, from wherever the menu left it', () => {
    // The transport is not on the wire: it chooses the route and reports the
    // days, and nothing yet records how a journey was made (D-298).
    const open = choose(aiming(cell(9, 9), true), FOOT);
    if (open.step !== 'choosing') throw new Error('unreachable');
    expect(travelIntent(open.pawn, open.at)).toEqual({ kind: 'moveParty', cell: cell(9, 9) });
  });
});

describe('how long a journey is, said out loud (R-199)', () => {
  it('counts in hours right up to the day', () => {
    // The thing this exists to prevent: "a day" for everything from half a
    // day to a day put a forced march and a mounted ride on the same line
    // when one is half again faster (D-298).
    expect(journeyLength(0.5)).toBe('12 hours');
    expect(journeyLength(0.62)).toBe('15 hours');
    expect(journeyLength(0.96)).toBe('23 hours');
    expect(journeyLength(0.5)).not.toBe(journeyLength(0.96));
  });

  it('says a day for a day, and decimals past it', () => {
    expect(journeyLength(1)).toBe('a day');
    expect(journeyLength(1.04)).toBe('a day');
    expect(journeyLength(1.2)).toBe('1.2 days');
    expect(journeyLength(17.35)).toBe('17.4 days');
  });

  it('rounds the short end to something a GM would say', () => {
    expect(journeyLength(0.02)).toBe('under an hour');
    expect(journeyLength(0)).toBe('under an hour');
    expect(journeyLength(1 / 24)).toBe('an hour');
  });

  it('refuses to invent a number it does not have', () => {
    expect(journeyLength(Number.NaN)).toBe('—');
    expect(journeyLength(Number.POSITIVE_INFINITY)).toBe('—');
    expect(journeyLength(-1)).toBe('—');
  });
});
