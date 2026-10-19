// Props (D-321, D-322, D-328): placed one at a time, a box of whole cubes, and
// two rules — whether they stop sight, and whether they stop walking, as they
// stand now.

import { describe, it, expect } from 'vitest';
import type { BlockCoord, EncounterMap, MemberId, PartyMember, SwatchId } from '@tt/domain';
import {
  createMap, setBlocks, blockKey, DEFAULT_FLOOR, PROP_TYPES, propType, propBox, propAt, whyNotPut, putProp,
  editProp, removeProp, propRules, NONE_OPEN, whyNotStand, walkAcross, partySight, mapToJSON, mapFromJSON,
  sliceOf, seenPart, propsSeen, createCampaign, createLiveSave, openedIn, withOpen, tidyOpened,
} from '@tt/domain';

const cube = (x: number, y: number, z: number): BlockCoord => ({ x, y, z });
const STONE = DEFAULT_FLOOR as SwatchId;

/**
 * A room: the new map's floor at y0, and a wall two high across x = 5 from
 * z = 0 to z = 15 with a doorway at z = 7 — where a door is put.
 */
function withDoorway(): EncounterMap {
  const wall: BlockCoord[] = [];
  for (let z = 0; z < 16; z += 1) {
    if (z === 7) continue;
    wall.push(cube(5, 1, z), cube(5, 2, z));
  }
  return setBlocks(createMap(), wall, STONE);
}
const door = (map: EncounterMap) => putProp(map, { type: 'door', at: cube(5, 1, 7), facing: 1 });
const doorId = (map: EncounterMap) => map.props[0]!.id as string;

describe('the catalogue (D-328)', () => {
  it('has the doors and bars, and the furniture', () => {
    expect(PROP_TYPES.map((type) => type.id)).toEqual([
      'door', 'cell-door', 'bars', 'portcullis', 'chest', 'table', 'chair', 'bookcase', 'barrel', 'crate',
    ]);
  });

  it('says what each does: a door stops both, shut; bars stop walking; furniture walking; a bookcase both', () => {
    expect(propType('door')).toMatchObject({ opens: true, closed: { blocksSight: true, blocksWalking: true }, open: { blocksSight: false, blocksWalking: false } });
    expect(propType('bars')).toMatchObject({ opens: false, closed: { blocksSight: false, blocksWalking: true } });
    expect(propType('table')).toMatchObject({ closed: { blocksSight: false, blocksWalking: true } });
    expect(propType('bookcase')).toMatchObject({ closed: { blocksSight: true, blocksWalking: true } });
  });

  it('a door is one wide and two tall; a portcullis two wide, and turning turns its box', () => {
    expect(propBox({ type: 'door', at: cube(5, 1, 7), facing: 0 })).toEqual({ min: cube(5, 1, 7), max: cube(5, 2, 7) });
    expect(propBox({ type: 'portcullis', at: cube(5, 1, 7), facing: 0 })).toEqual({ min: cube(4, 1, 7), max: cube(5, 2, 7) });
    expect(propBox({ type: 'portcullis', at: cube(5, 1, 7), facing: 1 })).toEqual({ min: cube(5, 1, 6), max: cube(5, 2, 7) });
  });
});

describe('putting one down', () => {
  it('stands in air on a block, its finish the first unless one it has is asked for', () => {
    const map = door(withDoorway());
    expect(map.props).toHaveLength(1);
    expect(map.props[0]).toMatchObject({ type: 'door', facing: 1, finish: 'wood' });
    expect(propAt(map.props, cube(5, 2, 7))?.type).toBe('door');
    const iron = putProp(withDoorway(), { type: 'door', at: cube(5, 1, 7), facing: 1, finish: 'iron' });
    expect(iron.props[0]!.finish).toBe('iron');
    const odd = putProp(withDoorway(), { type: 'door', at: cube(5, 1, 7), facing: 1, finish: 'gold' });
    expect(odd.props[0]!.finish).toBe('wood');
  });

  it('says why not: outside, a block, something there, nothing under it', () => {
    expect(whyNotPut(createMap(), { type: 'door', at: cube(-1, 1, 0), facing: 0 })).toBe('outside');
    expect(whyNotPut(withDoorway(), { type: 'door', at: cube(5, 1, 6), facing: 0 })).toBe('solid');
    expect(whyNotPut(door(withDoorway()), { type: 'chair', at: cube(5, 2, 7), facing: 0 })).toBe('taken');
    expect(whyNotPut(createMap(), { type: 'chair', at: cube(3, 1, 3), facing: 0 }, new Set(['3,1,3']))).toBe('taken');
    expect(whyNotPut(createMap(), { type: 'chair', at: cube(3, 4, 3), facing: 0 })).toBe('unsupported');
  });

  it('stacks: a bookcase stands on a bookcase (D-322)', () => {
    let map = putProp(createMap(), { type: 'bookcase', at: cube(3, 1, 3), facing: 0 });
    map = putProp(map, { type: 'bookcase', at: cube(3, 2, 3), facing: 0 });
    expect(map.props).toHaveLength(2);
  });

  it('turns where it stands only if the turn fits, refinishes, and comes away', () => {
    let map = putProp(createMap(), { type: 'portcullis', at: cube(3, 1, 3), facing: 0 });
    const id = map.props[0]!.id;
    const walled = setBlocks(map, [cube(3, 1, 2)], STONE);
    expect(editProp(walled, id, { facing: 1 })).toBe(walled);
    map = editProp(map, id, { facing: 1, finish: 'rusted' });
    expect(map.props[0]).toMatchObject({ facing: 1, finish: 'rusted' });
    expect(editProp(map, id, { facing: 1 })).toBe(map);
    expect(removeProp(map, id).props).toEqual([]);
  });
});

describe('what a prop does, as it stands now', () => {
  it('a shut door stops sight and walking in both its cubes; open, neither', () => {
    const map = door(withDoorway());
    const shut = propRules(map.props, NONE_OPEN);
    expect([...shut.sight].sort()).toEqual(['5,1,7', '5,2,7']);
    expect([...shut.walking].sort()).toEqual(['5,1,7', '5,2,7']);
    const open = propRules(map.props, new Set([doorId(map)]));
    expect(open.sight.size).toBe(0);
    expect(open.walking.size).toBe(0);
    expect(open.occupied.size).toBe(2);
  });

  it('a party member cannot stand in a shut doorway, and can in an open one', () => {
    const map = door(withDoorway());
    const nobody = new Map<MemberId, BlockCoord>();
    expect(whyNotStand(map, nobody, 'member_a' as MemberId, cube(5, 1, 7))).toBe('blocked');
    expect(whyNotStand(map, nobody, 'member_a' as MemberId, cube(5, 1, 7), new Set(), new Set([doorId(map)]))).toBeNull();
  });

  it('the walk goes through an open door and has no way through a shut one (R-209)', () => {
    const map = door(withDoorway());
    expect(walkAcross(map, cube(3, 1, 7), cube(7, 1, 7))).toBeNull();
    const open = walkAcross(map, cube(3, 1, 7), cube(7, 1, 7), undefined, undefined, new Set([doorId(map)]));
    expect(open?.length).toBeCloseTo(4, 9);
  });

  it('sight stops at a shut door and goes through an open one', () => {
    const map = door(withDoorway());
    const aldra: PartyMember = { id: 'member_a' as MemberId, name: 'Aldra', colour: '#fff', visionRange: 12, image: null };
    const tokens = new Map<MemberId, BlockCoord>([[aldra.id, cube(3, 1, 7)]]);
    const beyond = blockKey(cube(7, 1, 7));
    expect(partySight(map, tokens, [aldra]).has(beyond)).toBe(false);
    expect(partySight(map, tokens, [aldra], new Set([doorId(map)])).has(beyond)).toBe(true);
  });
});

describe('a map\'s props, written and cut', () => {
  it('round-trips with the map, and a map written before props had none', () => {
    const map = door(withDoorway());
    const back = mapFromJSON(JSON.parse(JSON.stringify(mapToJSON(map))))!;
    expect(back.props).toEqual(map.props);
    const { props: _none, ...older } = mapToJSON(createMap());
    expect(mapFromJSON(older)!.props).toEqual([]);
  });

  it('goes with the level it stands on when the map is cut', () => {
    const map = door(withDoorway());
    expect(sliceOf(map, { lower: 1, upper: 2 }).props).toHaveLength(1);
    expect(sliceOf(map, { lower: 2, upper: 5 }).props).toHaveLength(0);
  });

  it('reaches the table once a cube of it, or one beside it, has been seen (R-85)', () => {
    const map = door(withDoorway());
    expect(seenPart(map, new Set([blockKey(cube(1, 1, 1))])).props).toHaveLength(0);
    expect(seenPart(map, new Set([blockKey(cube(4, 1, 7))])).props).toHaveLength(1);
  });
});

describe('which props stand open, in the save (R-140)', () => {
  it('opens and closes one, keeps no empty entry, and forgets props that are gone', () => {
    const campaign = createCampaign('Ashfall');
    let save = createLiveSave(campaign, '2026-01-01T00:00:00.000Z');
    save = withOpen(save, 'poi_a', 'prop_door', true);
    expect(openedIn(save, 'poi_a').has('prop_door')).toBe(true);
    expect(withOpen(save, 'poi_a', 'prop_door', true)).toBe(save);
    expect(withOpen(save, 'poi_a', 'prop_door', false).opened.size).toBe(0);
    expect(tidyOpened(save, () => new Set()).opened.size).toBe(0);
    expect(tidyOpened(save, () => new Set(['prop_door']))).toBe(save);
    expect(tidyOpened(save, () => null).opened.size).toBe(0);
  });
});

describe('the props the party has seen (D-331)', () => {
  it('is the one rule the table and the Party\'s view both read: seen, or beside what was seen', () => {
    const map = door(withDoorway());
    expect(propsSeen(map.props, new Set())).toEqual([]);
    expect(propsSeen(map.props, new Set([blockKey(cube(4, 1, 7))]))).toBe(map.props);
    expect(propsSeen(map.props, new Set([blockKey(cube(1, 1, 1))]))).toEqual([]);
  });
});
