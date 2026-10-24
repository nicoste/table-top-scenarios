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
  idle, GROUP, pick, armed, aim, choose, ghostCell, aimedAt,
  canConfirm, movingFrom, travelIntent, travelPrompt, journeyLength, journeyReadout,
} from '@tt/client-core';
import type { MemberId, Placement, Route, WorldCell } from '@tt/domain';

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

  it('carries the days when it is given a route (D-304)', () => {
    // The table display has no panel to put them in, and how long it takes is
    // the output of a route — so it goes in the sentence, on both screens.
    const route = { cells: [], days: 2.4, legs: [] } as unknown as Route;
    const prompt = travelPrompt(aiming(cell(1, 1), true), nameOf, route)!;
    expect(prompt).toContain('2.4 days');
    expect(prompt).toMatch(/Click to confirm/);
  });

  it('says there is no way rather than falling silent about it', () => {
    // `null` from the router is "I cannot show you a way", not "you may not
    // go" (R-197) — and the click still works, so the clause has to say which.
    const prompt = travelPrompt(aiming(cell(1, 1), true), nameOf, null)!;
    expect(prompt).toContain('no way there with what they have');
    expect(prompt).toMatch(/Click to confirm/);
  });

  it('says neither when no route was asked for', () => {
    // The third argument is optional, and a caller that leaves it out is
    // saying "I have not worked one out", which is not the same as "none".
    expect(travelPrompt(aiming(cell(1, 1), true), nameOf)).not.toContain('no way');
  });
});

describe('where the route starts from', () => {
  const together: Placement = { together: true, at: cell(3, 3), members: new Map() };
  const apart: Placement = {
    together: false,
    at: cell(3, 3),
    members: new Map([['member_frodo' as MemberId, cell(7, 9)]]),
  };

  it('is nowhere when nobody has been picked up', () => {
    expect(movingFrom(idle, together)).toBeNull();
  });

  it('is the party cell for the group pawn', () => {
    expect(movingFrom(pick(group), together)).toEqual(cell(3, 3));
  });

  it('is the member own cell when the party has split', () => {
    expect(movingFrom(pick(member), apart)).toEqual(cell(7, 9));
  });

  it('falls back to the party cell for a member who has no cell of their own', () => {
    // Somebody added to the roster after the split stands where the party was
    // when it split, which is `memberCell`'s answer and not a second one.
    expect(movingFrom(pick({ memberId: 'member_sam' }), apart)).toEqual(cell(3, 3));
  });

  it('is nowhere when the party has not been placed at all', () => {
    expect(movingFrom(pick(group), { together: true, at: null, members: new Map() })).toBeNull();
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
  it('opens on a reachable cell, carrying the destination', () => {
    const next = choose(aiming(cell(4, 4), true));
    expect(next.step).toBe('choosing');
    if (next.step !== 'choosing') throw new Error('unreachable');
    expect(next.at).toEqual(cell(4, 4));
    expect(next.pawn).toEqual(group);
  });

  it('carries no transport, because that is a fact about the party (R-200)', () => {
    // Chosen when the tool is picked up and kept between moves, so the step
    // has nothing to ask and nothing to swap (D-299).
    const next = choose(aiming(cell(4, 4), true));
    expect(Object.keys(next).sort()).toEqual(['at', 'pawn', 'step']);
  });

  it('refuses to open on ground the party cannot reach', () => {
    // The same click that lands on unexplored ground. A menu offering to cost
    // a journey nobody can make is worse than no menu, so the caller gets the
    // sequence back unchanged and cancels it itself (D-164).
    const stuck = aiming(cell(4, 4), false);
    expect(choose(stuck)).toBe(stuck);
    const nowhere = aiming(null, true);
    expect(choose(nowhere)).toBe(nowhere);
    expect(choose(idle)).toBe(idle);
  });

  it('keeps the ghost and the route on the destination while the menu is open', () => {
    const open = choose(aiming(cell(7, 2), true));
    expect(ghostCell(open)).toEqual(cell(7, 2));
    expect(aimedAt(open)).toEqual(cell(7, 2));
  });

  it('asks the question in the readout rather than repeating the menu', () => {
    const open = choose(aim(pick(member), cell(1, 1), true));
    expect(travelPrompt(open, nameOf)).toBe('How are Frodo travelling?');
  });

  it('sends the same intent it always did, from wherever the menu left it', () => {
    const open = choose(aiming(cell(9, 9), true));
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

describe('what the Travel card says of a journey (D-363)', () => {
  const nameOf = (mode: string) => ({ 'travel:balloon': 'By balloon', 'travel:foot': 'On foot', 'travel:canoe': 'By canoe' }[mode] ?? mode);
  it('names the way when it is all one way, and leaves a mixed one to its list', () => {
    const route = (legs: { mode: string; days: number }[], days: number) => ({ cells: [], days, legs } as never);
    expect(journeyReadout(route([{ mode: 'travel:balloon', days: 0.7 }], 0.7), nameOf)).toBe('17 hours · By balloon');
    expect(journeyReadout(route([{ mode: 'travel:foot', days: 2 }, { mode: 'travel:canoe', days: 1 }], 3), nameOf)).toBe('3.0 days');
    // Where it stands already: no way at all, only the length.
    expect(journeyReadout(route([], 0), nameOf)).toBe('under an hour');
  });
});

