// Silver tokens (D-307, R-206): everyone in a map who is not the party.

import { describe, it, expect } from 'vitest';
import {
  addTemplate, EMPTY_LIBRARY, createMap, setMapBlocks,
  NO_SILVER, NO_TOKENS, SUFFIX_LETTERS, nameFor, whyNotPlace, spawnSilver, moveSilver, renameSilver,
  hideSilver, removeSilver, onLibrary, settledSilver, silverAt, silverToJSON, silverFromJSON,
  whyNotStand, placeToken, settled,
} from '@tt/domain';
import type { BlockCoord, EncounterMap, MemberId, SilverTokens, SwatchId, Tokens } from '@tt/domain';

const STONE = 'material:stone' as SwatchId;
const FLOOR_Y = 0;
/** A 6 × 6 floor at y = 0, so every cube at y = 1 is somewhere to stand. */
function floor(): EncounterMap {
  const cells: BlockCoord[] = [];
  for (let x = 0; x < 6; x += 1) for (let z = 0; z < 6; z += 1) cells.push({ x, y: FLOOR_Y, z });
  return setMapBlocks([{ id: 'p', pois: [{ id: 'm', map: createMap() }] } as never], 'p' as never, 'm' as never, cells, STONE)[0]!.pois[0]!.map!;
}
const at = (x: number, z: number): BlockCoord => ({ x, y: FLOOR_Y + 1, z });
const [goblin] = addTemplate(EMPTY_LIBRARY, { name: 'Goblin' });
/** A fixed sequence, so a name can be predicted. */
const dice = (...rolls: number[]) => { let i = 0; return () => rolls[i++ % rolls.length]!; };

describe('naming a token (D-307)', () => {
  it('is the entry name, a letter and a digit', () => {
    expect(nameFor('Goblin', [], dice(0, 0))).toBe('Goblin A0');
    expect(nameFor('Goblin', [], dice(0.99, 0.99))).toBe('Goblin Z9');
  });

  it('never uses I or O, which read as 1 and 0', () => {
    expect(SUFFIX_LETTERS).not.toContain('I');
    expect(SUFFIX_LETTERS).not.toContain('O');
    expect(SUFFIX_LETTERS).toHaveLength(24);
  });

  it('is never one already used in the map, whatever the case', () => {
    expect(nameFor('Goblin', ['goblin a0'], dice(0, 0, 0.5, 0.5))).not.toBe('Goblin A0');
  });

  it('still finds a name in a crowded map, and past every pair', () => {
    const all = [...SUFFIX_LETTERS].flatMap((l) => Array.from({ length: 10 }, (_, d) => `Goblin ${l}${d}`));
    const next = nameFor('Goblin', all, dice(0));
    expect(all).not.toContain(next);
    expect(next).toMatch(/^Goblin [A-Z]\d\d$/);
  });
});

describe('where a silver token may stand', () => {
  const map = floor();

  it('needs a floor and an empty cube, like the party (R-184)', () => {
    expect(whyNotPlace(map, NO_TOKENS, NO_SILVER, at(2, 2))).toBeNull();
    expect(whyNotPlace(map, NO_TOKENS, NO_SILVER, { x: 2, y: 0, z: 2 })).toBe('solid');
    expect(whyNotPlace(map, NO_TOKENS, NO_SILVER, { x: 2, y: 3, z: 2 })).toBe('unsupported');
    expect(whyNotPlace(map, NO_TOKENS, NO_SILVER, at(40, 40))).toBe('outside');
  });

  it('one to a cube, gold or silver', () => {
    const party: Tokens = new Map([['member_a' as MemberId, at(1, 1)]]);
    expect(whyNotPlace(map, party, NO_SILVER, at(1, 1))).toBe('taken');
    const one = spawnSilver(map, NO_TOKENS, NO_SILVER, goblin!, at(3, 3));
    expect(whyNotPlace(map, NO_TOKENS, one, at(3, 3))).toBe('taken');
    // And the party will not step into a goblin's cube either.
    expect(whyNotStand(map, NO_TOKENS, 'member_a' as MemberId, at(3, 3), new Set(['3,1,3']))).toBe('taken');
    expect(placeToken(map, NO_TOKENS, 'member_a' as MemberId, at(3, 3), new Set(['3,1,3']))).toBe(NO_TOKENS);
  });

  it('is not in its own way when it moves', () => {
    const one = spawnSilver(map, NO_TOKENS, NO_SILVER, goblin!, at(3, 3));
    expect(whyNotPlace(map, NO_TOKENS, one, at(3, 3), one[0]!.id)).toBeNull();
  });
});

describe('placing and keeping silver tokens', () => {
  const map = floor();
  const two = (): SilverTokens => {
    const one = spawnSilver(map, NO_TOKENS, NO_SILVER, goblin!, at(1, 1), dice(0, 0));
    return spawnSilver(map, NO_TOKENS, one, goblin!, at(2, 2), dice(0, 0, 0.1, 0.1));
  };

  it('places one, named for its entry, shown, at the end of the list', () => {
    const list = two();
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ templateId: goblin!.id, name: 'Goblin A0', hidden: false, at: at(1, 1) });
    expect(list[1]!.name).not.toBe('Goblin A0');
  });

  it('refuses a cube it cannot stand in, leaving the list as it was', () => {
    const list = two();
    expect(spawnSilver(map, NO_TOKENS, list, goblin!, at(1, 1))).toBe(list);
  });

  it('moves, renames, hides and removes — each the same list when nothing changes', () => {
    const list = two();
    const id = list[0]!.id;
    expect(silverAt(moveSilver(map, NO_TOKENS, list, id, at(5, 5)), at(5, 5))?.id).toBe(id);
    expect(moveSilver(map, NO_TOKENS, list, id, at(2, 2))).toBe(list);
    expect(renameSilver(list, id, '  Boss  ')[0]!.name).toBe('Boss');
    expect(renameSilver(list, id, '   ')).toBe(list);
    expect(hideSilver(list, id, true)[0]!.hidden).toBe(true);
    expect(hideSilver(list, id, false)).toBe(list);
    expect(removeSilver(list, id)).toHaveLength(1);
    expect(removeSilver(list, 'silver_nobody')).toBe(list);
  });

  it('goes with its library entry (D-307)', () => {
    const list = two();
    expect(onLibrary(list, new Set([goblin!.id as string]))).toBe(list);
    expect(onLibrary(list, new Set())).toEqual([]);
  });

  it('is dropped when built into, and a member remembered under a goblin is placed again', () => {
    const list = two();
    const walled = setMapBlocks([{ id: 'p', pois: [{ id: 'm', map }] } as never], 'p' as never, 'm' as never, [at(1, 1)], STONE)[0]!.pois[0]!.map!;
    expect(settledSilver(walled, list).map((t) => t.at)).toEqual([at(2, 2)]);
    const remembered: Tokens = new Map([['member_a' as MemberId, at(2, 2)]]);
    expect(settled(map, remembered, new Set(['2,1,2'])).size).toBe(0);
  });

  it('round-trips, writing `hidden` only when it is', () => {
    const list = hideSilver(two(), two()[0]!.id, false);
    const json = silverToJSON(list);
    expect(json[0]).not.toHaveProperty('hidden');
    expect(silverFromJSON(JSON.parse(JSON.stringify(json)))).toEqual(list);
  });
});
