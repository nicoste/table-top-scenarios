// The pick / aim / confirm sequence (R-132), including the client-side
// reachability guard that D-164 added.
//
// This exists because of a gap the GM pointed out: bugs living in the apps were
// getting fixed without tests, since R-23 exempts the apps. The sequence is not
// three.js — it is a state machine — so it moved into `client-core` and is
// tested like any other rule.

import { describe, it, expect } from 'vitest';
import type { Travel } from '@tt/client-core';
import { idle, GROUP, pick, armed, aim, ghostCell, canConfirm, travelIntent, travelPrompt } from '@tt/client-core';
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
