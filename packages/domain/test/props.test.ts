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
  isKnownSwatch, prefabFromJSON, prefabToJSON, stackOf, whyNotMove, moveProp, landedStack,
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
  it('has the doors and bars, the furniture, the lights (D-335), stairs (D-350) and a ladder (D-357)', () => {
    expect(PROP_TYPES.map((type) => type.id)).toEqual([
      'door', 'cell-door', 'bars', 'portcullis', 'chest', 'table', 'chair', 'bookcase', 'barrel', 'crate',
      'torch', 'lantern', 'candles', 'brazier', 'campfire', 'stairs', 'ladder', 'rope', 'holds', 'vines',
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

  it('is held from the side too (D-354): bars across the top of a doorway, a prop against a prop', () => {
    // The doorway at z = 7 in the wall at x = 5: its upper cube, the wall to either side.
    expect(whyNotPut(withDoorway(), { type: 'bars', at: cube(5, 2, 7), facing: 1 })).toBeNull();
    // Over the open floor, nothing beside it: not held.
    expect(whyNotPut(withDoorway(), { type: 'bars', at: cube(2, 2, 2), facing: 0 })).toBe('unsupported');
    // Beside a cell door standing on the floor, up in the air.
    const gate = putProp(createMap(), { type: 'cell-door', at: cube(3, 1, 3), facing: 0 });
    expect(whyNotPut(gate, { type: 'bars', at: cube(4, 2, 3), facing: 0 })).toBeNull();
    expect(whyNotPut(gate, { type: 'bars', at: cube(4, 3, 3), facing: 0 })).toBe('unsupported');
  });

  it('is held at its ends only, never by what is in front of it or behind it (D-355)', () => {
    // The same bars, a quarter turn on: the cell door is behind them now.
    const gate = putProp(createMap(), { type: 'cell-door', at: cube(3, 1, 3), facing: 0 });
    expect(whyNotPut(gate, { type: 'bars', at: cube(4, 2, 3), facing: 1 })).toBe('unsupported');
    // A cell door a cube up in front of a row of bars, held by nothing but them.
    let row = createMap();
    for (const y of [1, 2, 3]) row = putProp(row, { type: 'bars', at: cube(8, y, 5), facing: 1 });
    expect(row.props).toHaveLength(3);
    expect(whyNotPut(row, { type: 'cell-door', at: cube(9, 2, 5), facing: 1 })).toBe('unsupported');
    // In line with them, it is held.
    expect(whyNotPut(row, { type: 'bars', at: cube(8, 2, 6), facing: 1 })).toBeNull();
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

describe('moving a prop (D-354)', () => {
  /** A barrel with candles on it, a bookcase with a bookcase on it, and a crate beside the barrel. */
  const room = () => {
    let map = putProp(createMap(), { type: 'barrel', at: cube(3, 1, 3), facing: 0, paint: 'material:brick' });
    map = putProp(map, { type: 'candles', at: cube(3, 2, 3), facing: 0, flame: 'green' });
    map = putProp(map, { type: 'bookcase', at: cube(6, 1, 6), facing: 2 });
    map = putProp(map, { type: 'bookcase', at: cube(6, 2, 6), facing: 2 });
    map = putProp(map, { type: 'crate', at: cube(4, 1, 3), facing: 0 });
    return map;
  };
  const idOf = (map: EncounterMap, type: string, y = 1) => map.props.find((one) => one.type === type && one.at.y === y)!.id;

  it('carries what rests on it, and leaves what only stands beside it', () => {
    const map = room();
    expect(stackOf(map.props, idOf(map, 'barrel')).map((one) => one.type)).toEqual(['barrel', 'candles']);
    expect(stackOf(map.props, idOf(map, 'candles', 2)).map((one) => one.type)).toEqual(['candles']);
    const moved = moveProp(map, idOf(map, 'barrel'), cube(3, 1, 8));
    const barrel = moved.props.find((one) => one.type === 'barrel')!;
    const candles = moved.props.find((one) => one.type === 'candles')!;
    expect(barrel).toMatchObject({ id: idOf(map, 'barrel'), at: cube(3, 1, 8), paint: 'material:brick' });
    expect(candles).toMatchObject({ at: cube(3, 2, 8), flame: 'green' });
    expect(moved.props.find((one) => one.type === 'crate')!.at).toEqual(cube(4, 1, 3));
    // In the order they were, so nothing else about the map changes.
    expect(moved.props.map((one) => one.id)).toEqual(map.props.map((one) => one.id));
  });

  it('says why not, and leaves the map as it was', () => {
    const map = setBlocks(room(), [cube(3, 1, 9), cube(8, 2, 6)], STONE);
    const barrel = idOf(map, 'barrel');
    expect(whyNotMove(map, barrel, cube(3, 1, 9))).toBe('solid');
    expect(whyNotMove(map, barrel, cube(4, 1, 3))).toBe('taken');
    expect(whyNotMove(map, barrel, cube(3, 1, 3), new Set(['3,1,3']))).toBeNull();
    expect(whyNotMove(map, barrel, cube(3, 4, 12))).toBe('unsupported');
    expect(moveProp(map, barrel, cube(3, 1, 9))).toBe(map);
    // The lower bookcase, carrying the upper: its top is blocked one over.
    const bookcase = idOf(map, 'bookcase');
    expect(whyNotMove(map, bookcase, cube(8, 1, 6))).toBe('solid');
    expect(whyNotMove(map, bookcase, cube(7, 1, 6))).toBeNull();
    // Moving onto its own old place, one along, is no collision with itself.
    expect(whyNotMove(map, barrel, cube(3, 1, 4))).toBeNull();
  });
});

describe('a ladder (D-357)', () => {
  const nobody = new Map<MemberId, BlockCoord>();
  /** A wall three high across x = 6. */
  const wall = () => {
    const blocks: BlockCoord[] = [];
    for (let z = 0; z < 16; z += 1) blocks.push(cube(6, 1, z), cube(6, 2, z), cube(6, 3, z));
    return setBlocks(createMap(), blocks, STONE);
  };

  it('leans on the wall behind it, or stands on the floor or on another ladder', () => {
    // Its back to the wall at x = 6 is facing 1; a cube up, nothing under it.
    expect(whyNotPut(wall(), { type: 'ladder', at: cube(5, 2, 3), facing: 1 })).toBeNull();
    expect(whyNotPut(wall(), { type: 'ladder', at: cube(5, 2, 3), facing: 3 })).toBe('unsupported');
    let map = putProp(createMap(), { type: 'ladder', at: cube(3, 1, 3), facing: 0 });
    expect(whyNotPut(map, { type: 'ladder', at: cube(3, 2, 3), facing: 0 })).toBeNull();
    map = putProp(map, { type: 'ladder', at: cube(3, 2, 3), facing: 0 });
    expect(map.props).toHaveLength(2);
  });

  it('is in nobody\'s way, and somebody may be anywhere up it', () => {
    let map = wall();
    for (const y of [1, 2, 3]) map = putProp(map, { type: 'ladder', at: cube(5, y, 3), facing: 1 });
    const rules = propRules(map.props);
    expect(rules.sight.size + rules.walking.size).toBe(0);
    // On the second rung, with air under it.
    expect(whyNotStand(map, nobody, 'member_a' as MemberId, cube(5, 3, 3))).toBeNull();
    expect(whyNotPlace(map, NO_TOKENS, NO_SILVER, cube(5, 2, 3))).toBeNull();
    expect(dropBelow(map, cube(5, 3, 3))).toBe(0);
    // Beside it, still nothing.
    expect(whyNotStand(map, nobody, 'member_a' as MemberId, cube(4, 3, 3))).toBe('unsupported');
  });
});

describe('the GM\'s note on a prop (D-357)', () => {
  it('is written, kept with the map, and taken away by an empty one', () => {
    let map = putProp(createMap(), { type: 'chest', at: cube(3, 1, 3), facing: 0 });
    const id = map.props[0]!.id;
    map = editProp(map, id, { note: '  30 gp and a cursed ring  ' });
    expect(map.props[0]!.note).toBe('30 gp and a cursed ring');
    expect(mapFromJSON(mapToJSON(map))!.props[0]!.note).toBe('30 gp and a cursed ring');
    expect(editProp(map, id, { note: '30 gp and a cursed ring' })).toBe(map);
    expect(editProp(map, id, { note: '   ' }).props[0]).not.toHaveProperty('note');
  });

  it('never reaches the party: what they have seen holds the chest, not the note', () => {
    const map = putProp(createMap(), { type: 'chest', at: cube(3, 1, 3), facing: 0 });
    const noted = editProp(map, map.props[0]!.id, { note: 'a mimic' });
    const seen = seenPart(noted, new Set(['3,1,3']));
    expect(seen.props).toHaveLength(1);
    expect(seen.props[0]).not.toHaveProperty('note');
    expect(JSON.stringify(mapToJSON(seen))).not.toContain('mimic');
  });
});

describe('a prop turned as it is moved (D-357)', () => {
  it('turns with all it carries, each about the prop\'s own cube', () => {
    let map = putProp(createMap(), { type: 'portcullis', at: cube(5, 1, 5), facing: 0 });
    map = putProp(map, { type: 'candles', at: cube(4, 3, 5), facing: 0 });
    const id = map.props[0]!.id;
    // The candles stand on its far end; a quarter turn puts that end toward −z.
    expect(landedStack(map.props, id, cube(5, 1, 5), 1).map((one) => [one.at, one.facing])).toEqual([
      [cube(5, 1, 5), 1], [cube(5, 3, 4), 1],
    ]);
    const turned = moveProp(map, id, cube(5, 1, 5), new Set(), 1);
    expect(turned.props.map((one) => one.facing)).toEqual([1, 1]);
    expect(whyNotMove(map, id, cube(5, 1, 5), new Set(), 0)).toBeNull();
    expect(moveProp(map, id, cube(5, 1, 5), new Set(), 0)).toBe(map);
  });
});

describe('more ways up (D-358)', () => {
  const nobody = new Map<MemberId, BlockCoord>();
  /** A ledge four high across x = 6 — its top is stood on at y = 5 — and a beam over (3, 6, 3). */
  const cliff = () => {
    const blocks: BlockCoord[] = [cube(3, 6, 3)];
    for (let z = 0; z < 16; z += 1) for (let y = 1; y <= 4; y += 1) blocks.push(cube(6, y, z));
    return setBlocks(createMap(), blocks, STONE);
  };

  it('a rope hangs from what is above it, and from nothing else', () => {
    let map = cliff();
    expect(whyNotPut(map, { type: 'rope', at: cube(3, 5, 3), facing: 0 })).toBeNull();
    expect(whyNotPut(map, { type: 'rope', at: cube(2, 5, 3), facing: 0 })).toBe('untied');
    // On the floor, with nothing over it: not a rope, a heap.
    expect(whyNotPut(map, { type: 'rope', at: cube(2, 1, 2), facing: 0 })).toBe('untied');
    for (const y of [5, 4, 3, 2]) map = putProp(map, { type: 'rope', at: cube(3, y, 3), facing: 0 });
    expect(map.props).toHaveLength(4);
    expect(whyNotStand(map, nobody, 'member_a' as MemberId, cube(3, 4, 3))).toBeNull();
  });

  it('holds and vines go on a wall, as a torch does, and are climbed', () => {
    const map = cliff();
    for (const type of ['holds', 'vines']) {
      expect(whyNotPut(map, { type, at: cube(5, 3, 3), facing: 1 })).toBeNull();
      expect(whyNotPut(map, { type, at: cube(5, 3, 3), facing: 3 })).toBe('unhung');
      const on = putProp(map, { type, at: cube(5, 3, 3), facing: 1 });
      expect(whyNotStand(on, nobody, 'member_a' as MemberId, cube(5, 3, 3))).toBeNull();
    }
  });

  it('the walk climbs them, a cube straight up or down counting 1, and goes nowhere else straight up', () => {
    let map = cliff();
    expect(walkAcross(map, cube(4, 1, 3), cube(6, 5, 3))).toBeNull();
    for (const y of [1, 2, 3, 4]) map = putProp(map, { type: 'ladder', at: cube(5, y, 3), facing: 1 });
    // Onto the ladder a rung up, as up a stair; straight up it; off the top onto the ledge.
    const up = walkAcross(map, cube(4, 1, 3), cube(6, 5, 3))!;
    expect(up.cubes).toEqual([cube(4, 1, 3), cube(5, 2, 3), cube(5, 3, 3), cube(5, 4, 3), cube(6, 5, 3)]);
    expect(up.length).toBeCloseTo(Math.SQRT2 + 2 + Math.SQRT2, 9);
    // Nothing climbed, nothing straight up: beside the ladder, a cube up is in the air.
    expect(walkAcross(map, cube(4, 1, 3), cube(4, 2, 3))).toBeNull();
    // Back down the same way, as long.
    expect(walkAcross(map, cube(6, 5, 3), cube(4, 1, 3))!.length).toBeCloseTo(up.length, 9);
    // A row of holds is a way across the face, rung to rung.
    let face = cliff();
    for (const z of [3, 4, 5]) face = putProp(face, { type: 'holds', at: cube(5, 3, z), facing: 1 });
    expect(walkAcross(face, cube(5, 3, 3), cube(5, 3, 5))!.length).toBeCloseTo(2, 9);
  });
});

