// Placing and moving silver tokens on the console (R-206).

import { describe, it, expect } from 'vitest';
import {
  noSilverMove, grabSilver, aimSilverMove, silverMoveGhost, silverVerdict, silverMoveIntent,
  spawnIntent, silverMovePrompt, spawnPrompt, tokenAction,
} from '@tt/client-core';
import {
  createMap, addTemplate, EMPTY_LIBRARY, spawnSilver, NO_SILVER, NO_TOKENS,
} from '@tt/domain';
import type { BlockCoord, MemberId, Tokens } from '@tt/domain';

const map = createMap();
const at = (x: number, z: number): BlockCoord => ({ x, y: 1, z });
const [goblin] = addTemplate(EMPTY_LIBRARY, { name: 'Goblin' });
const one = spawnSilver(map, NO_TOKENS, NO_SILVER, goblin!, at(4, 4));

describe('where the console lets a silver token stand', () => {
  it('on any floor nobody is standing on', () => {
    expect(silverVerdict(map, NO_TOKENS, one, at(5, 5), null)).toBeNull();
  });

  it('says why not, before the click (R-18)', () => {
    const party: Tokens = new Map([['member_a' as MemberId, at(2, 2)]]);
    expect(silverVerdict(map, party, one, at(2, 2), null)).toBe('somebody is standing there');
    expect(silverVerdict(map, NO_TOKENS, one, at(4, 4), null)).toBe('somebody is standing there');
    expect(silverVerdict(map, NO_TOKENS, one, { x: 4, y: 0, z: 4 }, null)).toBe('a block is there');
    expect(silverVerdict(map, NO_TOKENS, one, { x: 4, y: 5, z: 4 }, null)).toBe('nothing to stand on');
    expect(silverVerdict(map, NO_TOKENS, one, at(5, 5), { lower: 3, upper: 9 })).toBe('outside the levels being shown');
  });

  it('lets a token being moved stay where it is', () => {
    expect(silverVerdict(map, NO_TOKENS, one, at(4, 4), null, one[0]!.id)).toBeNull();
  });
});

describe('moving one', () => {
  it('ghosts only where the move would be made', () => {
    const held = grabSilver('silver_a');
    expect(silverMoveGhost(aimSilverMove(held, at(5, 5), null))).toEqual(at(5, 5));
    expect(silverMoveGhost(aimSilverMove(held, at(5, 5), 'a block is there'))).toBeNull();
    expect(silverMoveGhost(noSilverMove)).toBeNull();
  });

  it('keeps its identity while the pointer stays in one cube (R-165)', () => {
    const aimed = aimSilverMove(grabSilver('silver_a'), at(5, 5), null);
    expect(aimSilverMove(aimed, at(5, 5), null)).toBe(aimed);
  });

  it('names the map in what it sends', () => {
    const held = grabSilver('silver_a') as Extract<ReturnType<typeof grabSilver>, { step: 'aiming' }>;
    expect(silverMoveIntent(held, at(6, 6), 'place_p', 'poi_m'))
      .toEqual({ kind: 'moveSilver', placeId: 'place_p', poiId: 'poi_m', id: 'silver_a', at: at(6, 6) });
    expect(spawnIntent('template_g', at(6, 6), 'place_p', 'poi_m'))
      .toEqual({ kind: 'spawnSilver', placeId: 'place_p', poiId: 'poi_m', templateId: 'template_g', at: at(6, 6) });
  });

  it('is picked up under Move, the party first when both are under the pointer', () => {
    expect(tokenAction(null, false, 'silver_a')).toEqual({ kind: 'pickSilver', id: 'silver_a' });
    expect(tokenAction({ memberId: 'member_a' }, false, 'silver_a')).toEqual({ kind: 'pickToken', memberId: 'member_a' });
    expect(tokenAction(null, true, 'silver_a')).toEqual({ kind: 'confirm' });
    // The table passes no silver: it never picks one up.
    expect(tokenAction(null, false)).toEqual({ kind: 'nothing' });
  });
});

describe('what the readout says', () => {
  it('while placing', () => {
    expect(spawnPrompt(null, at(1, 1), null)).toMatch(/Pick a token from the library/);
    expect(spawnPrompt('Goblin', null, null)).toMatch(/point at a floor/);
    expect(spawnPrompt('Goblin', at(1, 1), 'a block is there')).toBe('Goblin: a block is there.');
    expect(spawnPrompt('Goblin', at(1, 1), null)).toMatch(/Click to place Goblin here\. Keep clicking/);
  });

  it('while moving', () => {
    const named = (id: string) => (id === 'silver_a' ? 'Goblin N7' : null);
    expect(silverMovePrompt(noSilverMove, named)).toBeNull();
    expect(silverMovePrompt(grabSilver('silver_a'), named)).toBe('Moving Goblin N7 — point at a floor.');
    expect(silverMovePrompt(aimSilverMove(grabSilver('silver_a'), at(2, 2), null), named)).toMatch(/^Move Goblin N7 here\?/);
  });
});
