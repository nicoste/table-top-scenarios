// Props (D-321, D-322, D-328): placed one at a time, a box of whole cubes, and
// two rules — whether they stop sight, and whether they stop walking, as they
// stand now.

import { describe, it, expect } from 'vitest';
import type { BlockCoord, EncounterMap, MemberId, PartyMember, SwatchId } from '@tt/domain';
import {
  createMap, setBlocks, blockKey, DEFAULT_FLOOR, PROP_TYPES, propType, propBox, propAt, whyNotPut, putProp,
  editProp, removeProp, propRules, NONE_OPEN, whyNotStand, walkAcross, partySight, mapToJSON, mapFromJSON,
  sliceOf, seenPart, propsSeen, sightShows, shownBy, createCampaign, createLiveSave, openedIn, withOpen, tidyOpened,
  statesOf, isLit, reachOf, backOf, facingWithBack, MAX_LIGHT_REACH, floorUnder, dropBelow, whyNotPlace, paintOf, flameOf,
  isKnownSwatch, prefabFromJSON, prefabToJSON,
  NO_SILVER, NO_TOKENS,
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
  it('has the doors and bars, the furniture, the lights (D-335) and stairs (D-350)', () => {
    expect(PROP_TYPES.map((type) => type.id)).toEqual([
      'door', 'cell-door', 'bars', 'portcullis', 'chest', 'table', 'chair', 'bookcase', 'barrel', 'crate',
      'torch', 'lantern', 'candles', 'brazier', 'campfire', 'stairs',
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
  it('stands in air on a block, painted with its first material unless another is asked for (D-352)', () => {
    const map = door(withDoorway());
    expect(map.props).toHaveLength(1);
    expect(map.props[0]).toMatchObject({ type: 'door', facing: 1, paint: 'material:wood' });
    expect(map.props[0]!.flame).toBeUndefined();
    expect(propAt(map.props, cube(5, 2, 7))?.type).toBe('door');
    // Any material — brick, not one the catalogue offers a door in.
    const brick = putProp(withDoorway(), { type: 'door', at: cube(5, 1, 7), facing: 1, paint: 'material:brick/limestone' });
    expect(paintOf(brick.props[0]!)).toBe('material:brick/limestone');
    const odd = putProp(withDoorway(), { type: 'door', at: cube(5, 1, 7), facing: 1, paint: 'material:gold' });
    expect(odd.props[0]!.paint).toBe('material:wood');
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

  it('turns where it stands only if the turn fits, repaints, and comes away', () => {
    let map = putProp(createMap(), { type: 'portcullis', at: cube(3, 1, 3), facing: 0 });
    const id = map.props[0]!.id;
    expect(map.props[0]!.paint).toBe('material:mineral/iron');
    const walled = setBlocks(map, [cube(3, 1, 2)], STONE);
    expect(editProp(walled, id, { facing: 1 })).toBe(walled);
    map = editProp(map, id, { facing: 1, paint: 'material:mineral/copper' });
    expect(map.props[0]).toMatchObject({ facing: 1, paint: 'material:mineral/copper' });
    expect(editProp(map, id, { paint: 'material:nothing' })).toBe(map);
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

describe('what sight shows now, props and all (D-332)', () => {
  it('is the blocks it shows and the cubes of the props it shows — and nothing of a prop out of sight', () => {
    const map = door(withDoorway());
    const near = sightShows(map, new Set([blockKey(cube(4, 1, 7))]));
    expect(near.has(blockKey(cube(5, 1, 7)))).toBe(true);
    expect(near.has(blockKey(cube(5, 2, 7)))).toBe(true);
    const far = sightShows(map, new Set([blockKey(cube(1, 1, 1))]));
    expect(far.has(blockKey(cube(5, 1, 7)))).toBe(false);
    // Without props, it is what the blocks alone show.
    const bare = withDoorway();
    const cells = new Set([blockKey(cube(4, 1, 7))]);
    expect(sightShows(bare, cells)).toBe(shownBy(bare, cells));
  });
});

describe('lights (D-335)', () => {
  it('are placed lit, and their other state is out, in words of their own', () => {
    const map = putProp(createMap(), { type: 'lantern', at: cube(3, 1, 3), facing: 0 });
    const lantern = map.props[0]!;
    expect(isLit(lantern)).toBe(true);
    expect(isLit(lantern, new Set([lantern.id as string]))).toBe(false);
    expect(statesOf(propType('lantern')!)).toMatchObject({ placed: 'lit', other: 'out', toOther: 'Put out', toPlaced: 'Light' });
    expect(statesOf(propType('door')!)).toMatchObject({ placed: 'shut', other: 'open' });
    expect(isLit(putProp(createMap(), { type: 'table', at: cube(3, 1, 3), facing: 0 }).props[0]!)).toBe(false);
  });

  it('stop nothing, but a brazier and a campfire are in the way, lit or out', () => {
    expect(propType('torch')).toMatchObject({ closed: { blocksSight: false, blocksWalking: false } });
    expect(propType('brazier')).toMatchObject({ closed: { blocksWalking: true }, open: { blocksWalking: true } });
    expect(propType('campfire')).toMatchObject({ closed: { blocksSight: false, blocksWalking: true } });
  });

  it('a torch hangs on the block behind it, and nothing under it will do instead', () => {
    // Its back is toward −z unturned, and turns with it.
    expect([0, 1, 2, 3].map((facing) => backOf(facing as 0))).toEqual([
      { x: 0, z: -1 }, { x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 },
    ]);
    expect(facingWithBack({ x: 1, z: 0 })).toBe(1);
    expect(facingWithBack({ x: 1, z: 1 })).toBeNull();
    const map = withDoorway();
    // Beside the wall at x = 5, its back to it: facing 1.
    expect(whyNotPut(map, { type: 'torch', at: cube(4, 2, 3), facing: 1 })).toBeNull();
    expect(whyNotPut(map, { type: 'torch', at: cube(4, 2, 3), facing: 3 })).toBe('unhung');
    // On the floor in the open, with nothing behind it.
    expect(whyNotPut(map, { type: 'torch', at: cube(2, 1, 2), facing: 0 })).toBe('unhung');
  });

  it('reach as far as their type says, or as far as the GM sets, in bounds', () => {
    let map = putProp(createMap(), { type: 'torch', at: cube(0, 1, 3), facing: 3 });
    // No wall behind it in a new map: not placed. Hang it on one.
    expect(map.props).toHaveLength(0);
    map = putProp(setBlocks(createMap(), [cube(0, 1, 3)], STONE), { type: 'lantern', at: cube(3, 1, 3), facing: 0 });
    const id = map.props[0]!.id as string;
    expect(reachOf(map.props[0]!)).toBe(5);
    map = editProp(map, id, { reach: 9 });
    expect(map.props[0]!.reach).toBe(9);
    expect(reachOf(map.props[0]!)).toBe(9);
    expect(mapFromJSON(mapToJSON(map))!.props[0]!.reach).toBe(9);
    expect(reachOf(editProp(map, id, { reach: 500 }).props[0]!)).toBe(MAX_LIGHT_REACH);
    // Its type's own reach again is no reach of its own.
    expect(editProp(map, id, { reach: 5 }).props[0]!.reach).toBeUndefined();
    // A table has none, and is not given one.
    const table = putProp(createMap(), { type: 'table', at: cube(3, 1, 3), facing: 0 });
    expect(editProp(table, table.props[0]!.id, { reach: 4 })).toBe(table);
    expect(reachOf(table.props[0]!)).toBeNull();
  });
});

describe('stairs (D-350)', () => {
  const nobody = new Map<MemberId, BlockCoord>();
  /** A ledge two high across x = 4, too high for the walk to climb from the floor. */
  const ledge = () => {
    const wall: BlockCoord[] = [];
    for (let z = 0; z < 16; z += 1) wall.push(cube(4, 1, z), cube(4, 2, z));
    return setBlocks(createMap(), wall, STONE);
  };

  it('stop sight and walking as a block does, and are stood on as one', () => {
    const map = putProp(createMap(), { type: 'stairs', at: cube(3, 1, 3), facing: 1 });
    const rules = propRules(map.props);
    for (const set of [rules.sight, rules.walking, rules.floors]) expect(set.has(blockKey(cube(3, 1, 3)))).toBe(true);
    expect(floorUnder(map, cube(3, 2, 3))).toBe(true);
    expect(whyNotStand(map, nobody, 'member_a' as MemberId, cube(3, 2, 3))).toBeNull();
    expect(whyNotStand(map, nobody, 'member_a' as MemberId, cube(3, 1, 3))).toBe('blocked');
    expect(whyNotPlace(map, NO_TOKENS, NO_SILVER, cube(3, 2, 3))).toBeNull();
    // A fall from above stops on them.
    expect(dropBelow(map, cube(3, 5, 3))).toBe(3);
    // A chair is in the way, but nobody stands on it.
    const chair = putProp(createMap(), { type: 'chair', at: cube(3, 1, 3), facing: 0 });
    expect(propRules(chair.props).floors.size).toBe(0);
    expect(whyNotStand(chair, nobody, 'member_a' as MemberId, cube(3, 2, 3))).toBe('unsupported');
  });

  it('are the way up a ledge the walk cannot climb from the floor', () => {
    const map = ledge();
    expect(walkAcross(map, cube(1, 1, 3), cube(4, 3, 3))).toBeNull();
    const walk = walkAcross(putProp(map, { type: 'stairs', at: cube(3, 1, 3), facing: 1 }), cube(1, 1, 3), cube(4, 3, 3));
    expect(walk?.cubes).toContainEqual(cube(3, 2, 3));
  });

  it('stand on stairs, for a flight', () => {
    const map = putProp(createMap(), { type: 'stairs', at: cube(3, 1, 3), facing: 1 });
    expect(whyNotPut(map, { type: 'stairs', at: cube(3, 2, 3), facing: 1 })).toBeNull();
  });
});

describe('furniture a whole cube tall (D-351)', () => {
  const nobody = new Map<MemberId, BlockCoord>();

  it('is stood on: a table, a bookcase, a barrel, a crate — not a chair or a chest', () => {
    const holds = PROP_TYPES.filter((type) => type.holds).map((type) => type.id);
    expect(holds).toEqual(['table', 'bookcase', 'barrel', 'crate', 'stairs']);
    for (const type of ['table', 'bookcase', 'barrel', 'crate']) {
      const map = putProp(createMap(), { type, at: cube(3, 1, 3), facing: 0 });
      expect(whyNotStand(map, nobody, 'member_a' as MemberId, cube(3, 2, 3))).toBeNull();
    }
  });

  it('piled up, is a way up to a ledge', () => {
    // A balcony three high across x = 6: nothing climbs it from the floor.
    const wall: BlockCoord[] = [];
    for (let z = 0; z < 16; z += 1) wall.push(cube(6, 1, z), cube(6, 2, z), cube(6, 3, z));
    let map = setBlocks(createMap(), wall, STONE);
    expect(walkAcross(map, cube(2, 1, 3), cube(6, 4, 3))).toBeNull();
    // A crate, two crates on a crate beside it: a step, then two.
    for (const at of [cube(4, 1, 3), cube(5, 1, 3), cube(5, 2, 3)]) map = putProp(map, { type: 'crate', at, facing: 0 });
    expect(map.props).toHaveLength(3);
    const walk = walkAcross(map, cube(2, 1, 3), cube(6, 4, 3));
    expect(walk?.cubes).toContainEqual(cube(4, 2, 3));
    expect(walk?.cubes).toContainEqual(cube(5, 3, 3));
  });
});

describe('paint (D-352)', () => {
  it('every type offers materials the registry knows, and a light its flames', () => {
    for (const type of PROP_TYPES) {
      expect(type.paints.length, type.id).toBeGreaterThan(0);
      for (const paint of type.paints) expect(isKnownSwatch(paint), `${type.id}: ${paint}`).toBe(true);
      expect(!!type.flames, type.id).toBe(!!type.light);
    }
  });

  it('a light is painted where it holds its flame, and keeps its flame apart', () => {
    let map = putProp(createMap(), { type: 'candles', at: cube(3, 1, 3), facing: 0 });
    expect(map.props[0]).toMatchObject({ paint: 'material:mineral/gold', flame: 'candle' });
    const id = map.props[0]!.id;
    map = editProp(map, id, { paint: 'material:mineral/iron', flame: 'cold' });
    expect(map.props[0]).toMatchObject({ paint: 'material:mineral/iron', flame: 'cold' });
    // A flame it does not have is not taken.
    expect(editProp(map, id, { flame: 'purple' })).toBe(map);
    expect(flameOf(map.props[0]!)).toBe('cold');
    expect(flameOf({ type: 'table' })).toBeNull();
  });

  it('round-trips with the map, and a map from before paint keeps its look', () => {
    const map = door(withDoorway());
    const painted = editProp(map, doorId(map), { paint: 'material:brick' });
    expect(mapFromJSON(mapToJSON(painted))!.props[0]!.paint).toBe('material:brick');
    // Written with a finish: wood is oak, iron is iron, a flame is a flame.
    const old = mapToJSON(painted);
    const props = [
      { id: 'prop_a', type: 'door', at: { x: 5, y: 1, z: 7 }, facing: 1, finish: 'dark-wood' },
      { id: 'prop_b', type: 'bars', at: { x: 2, y: 1, z: 2 }, facing: 0, finish: 'iron' },
      { id: 'prop_c', type: 'torch', at: { x: 4, y: 2, z: 3 }, facing: 1, finish: 'green' },
      { id: 'prop_d', type: 'chest', at: { x: 3, y: 1, z: 3 }, facing: 0, finish: 'plaid' },
    ];
    const read = mapFromJSON({ ...old, props })!.props;
    expect(read.map((prop) => paintOf(prop))).toEqual([
      'material:wood/dark-oak', 'material:mineral/iron', 'material:mineral/iron', 'material:wood',
    ]);
    expect(read.map((prop) => flameOf(prop))).toEqual([null, null, 'green', null]);
  });

  it('goes with a prop into a prefab and out of one, and a prefab from before paint keeps its look', () => {
    const json = { id: 'prefab_a', name: 'Store', tags: [], size: { x: 2, y: 1, z: 1 }, palette: [], runs: [2, 0],
      props: [
        { type: 'crate', at: { x: 0, y: 0, z: 0 }, facing: 0, paint: 'material:wood/dark-oak' },
        { type: 'lantern', at: { x: 1, y: 0, z: 0 }, facing: 0, finish: 'green' },
      ] };
    const prefab = prefabFromJSON(json)!;
    expect(prefab.props).toEqual([
      { type: 'crate', at: cube(0, 0, 0), facing: 0, paint: 'material:wood/dark-oak' },
      { type: 'lantern', at: cube(1, 0, 0), facing: 0, flame: 'green' },
    ]);
    expect(prefabToJSON(prefab).props).toEqual([
      { type: 'crate', at: { x: 0, y: 0, z: 0 }, facing: 0, paint: 'material:wood/dark-oak' },
      { type: 'lantern', at: { x: 1, y: 0, z: 0 }, facing: 0, flame: 'green' },
    ]);
  });
});

