// Prefabs (D-321): a box of a map saved by name, and stamped into any map,
// turned and mirrored. Its blocks win; its air leaves the map alone.

import { describe, it, expect } from 'vitest';
import type { BlockCoord, EncounterMap, Prefab, SwatchId } from '@tt/domain';
import {
  createMap, setBlocks, clearBlocks, blockAt, blockKey, searchLibrary,
  capturePrefab, placedBlocks, placedBox, turnedSize, stampPrefab, editPrefab, removePrefab, addPrefab,
  placedProps, putProp,
  prefabToJSON, prefabFromJSON, NO_PREFABS, MAX_PREFAB_SIDE,
} from '@tt/domain';

const cube = (x: number, y: number, z: number): BlockCoord => ({ x, y, z });
const STONE = 'material:stone' as SwatchId;
const WOOD = 'material:wood' as SwatchId;
const sorted = (cubes: readonly { at: BlockCoord }[]) =>
  cubes.map(({ at }) => blockKey(at)).sort();

/**
 * An L of stone on the floor of a new map (whose floor is y0 across 16×16):
 * three cubes along x from (4,1,4), and one more at (4,1,5) — so a turn or a
 * mirror shows, which a symmetrical shape would hide.
 */
function withL(): EncounterMap {
  return setBlocks(createMap(), [cube(4, 1, 4), cube(5, 1, 4), cube(6, 1, 4), cube(4, 1, 5)], STONE);
}
/** The L captured with nothing under it: a box 3 wide, 1 tall, 2 deep. */
const theL = (): Prefab => capturePrefab(withL(), cube(4, 1, 4), cube(6, 1, 5), { name: 'L' }) as Prefab;

describe('capturing a box', () => {
  it('keeps the cubes relative to the box, and the box as drawn', () => {
    const prefab = theL();
    expect(prefab.size).toEqual({ x: 3, y: 1, z: 2 });
    expect([...prefab.blocks.keys()].sort()).toEqual(['0,0,0', '0,0,1', '1,0,0', '2,0,0']);
    expect(prefab.name).toBe('L');
  });

  it('takes the corners either way round, and keeps the air at the edges', () => {
    const prefab = capturePrefab(withL(), cube(7, 2, 6), cube(4, 1, 4)) as Prefab;
    expect(prefab.size).toEqual({ x: 4, y: 2, z: 3 });
    expect(prefab.blocks.size).toBe(4);
  });

  it('refuses a box with nothing in it, and one too big to save', () => {
    expect(capturePrefab(createMap(), cube(1, 5, 1), cube(3, 7, 3))).toBe('nothing is built in that box');
    expect(capturePrefab(withL(), cube(0, 0, 0), cube(MAX_PREFAB_SIDE, 0, 0))).toBe('that box is too big to save');
  });
});

describe('placing it, turned and mirrored', () => {
  it('sits on the cube pointed at, its footprint centred there', () => {
    const box = placedBox(theL(), cube(10, 1, 10), { facing: 0, mirrored: false });
    expect(box).toEqual({ min: cube(9, 1, 9), max: cube(11, 1, 10) });
  });

  it('puts the L down as it was, unturned', () => {
    expect(sorted(placedBlocks(theL(), cube(10, 1, 10), { facing: 0, mirrored: false })))
      .toEqual(['10,1,9', '11,1,9', '9,1,10', '9,1,9'].sort());
  });

  it('turns a quarter clockwise seen from above: x runs into z, and the box turns with it', () => {
    expect(turnedSize({ x: 3, y: 1, z: 2 }, 1)).toEqual({ x: 2, y: 1, z: 3 });
    // The arm along +x now runs along +z; the foot that stuck out along +z
    // now sticks out along -x.
    const cubes = placedBlocks(theL(), cube(10, 1, 10), { facing: 1, mirrored: false });
    expect(sorted(cubes)).toEqual(['10,1,10', '10,1,11', '10,1,9', '9,1,9'].sort());
  });

  it('comes back to where it started after four quarter turns', () => {
    const start = sorted(placedBlocks(theL(), cube(10, 1, 10), { facing: 0, mirrored: false }));
    expect(sorted(placedBlocks(theL(), cube(10, 1, 10), { facing: 2, mirrored: false }))).not.toEqual(start);
    expect(sorted(placedBlocks(theL(), cube(10, 1, 10), { facing: 3, mirrored: false }))).not.toEqual(start);
  });

  it('mirrors left to right: the foot moves to the other end', () => {
    const cubes = placedBlocks(theL(), cube(10, 1, 10), { facing: 0, mirrored: true });
    expect(sorted(cubes)).toEqual(['10,1,9', '11,1,10', '11,1,9', '9,1,9'].sort());
  });
});

describe('stamping it into a map (D-321)', () => {
  /** A wooden post two high, captured with a cube of air beside it. */
  const post = (): Prefab => capturePrefab(
    setBlocks(createMap(), [cube(2, 1, 2), cube(2, 2, 2)], WOOD), cube(2, 1, 2), cube(3, 2, 2),
  ) as Prefab;

  it('lets its blocks win over what is there', () => {
    const map = setBlocks(createMap(), [cube(10, 1, 10)], STONE);
    const stamped = stampPrefab(map, post(), cube(11, 1, 10), { facing: 0, mirrored: false, clear: false });
    expect(blockAt(stamped, cube(10, 1, 10))).toBe(WOOD);
    expect(blockAt(stamped, cube(10, 2, 10))).toBe(WOOD);
  });

  it('leaves the map alone where it has air', () => {
    const map = setBlocks(createMap(), [cube(11, 1, 10)], STONE);
    const stamped = stampPrefab(map, post(), cube(11, 1, 10), { facing: 0, mirrored: false, clear: false });
    expect(blockAt(stamped, cube(11, 1, 10))).toBe(STONE);
  });

  it('with clear, empties its whole box first', () => {
    const map = setBlocks(createMap(), [cube(11, 1, 10), cube(11, 2, 10)], STONE);
    const stamped = stampPrefab(map, post(), cube(11, 1, 10), { facing: 0, mirrored: false, clear: true });
    expect(blockAt(stamped, cube(11, 1, 10))).toBeNull();
    expect(blockAt(stamped, cube(11, 2, 10))).toBeNull();
    expect(blockAt(stamped, cube(10, 2, 10))).toBe(WOOD);
  });

  it('leaves out what lands outside the map, and never lands on somebody', () => {
    const outside = stampPrefab(createMap(), post(), cube(0, 1, 0), { facing: 0, mirrored: false, clear: false });
    expect(blockAt(outside, cube(-1, 1, 0))).toBeNull();
    const kept = stampPrefab(
      createMap(), post(), cube(11, 1, 10), { facing: 0, mirrored: false, clear: false }, new Set(['10,1,10']),
    );
    expect(blockAt(kept, cube(10, 1, 10))).toBeNull();
    expect(blockAt(kept, cube(10, 2, 10))).toBe(WOOD);
  });

  it('is the same map when it changes nothing (R-165)', () => {
    const map = setBlocks(createMap(), [cube(10, 1, 10), cube(10, 2, 10)], WOOD);
    expect(stampPrefab(map, post(), cube(11, 1, 10), { facing: 0, mirrored: false, clear: false })).toBe(map);
    const outside = clearBlocks(createMap(), []);
    expect(stampPrefab(outside, post(), cube(-20, 1, -20), { facing: 0, mirrored: false, clear: false })).toBe(outside);
  });
});

describe('the library', () => {
  it('renames and retags, and removes — what was placed from it is not its business', () => {
    let prefabs = addPrefab(NO_PREFABS, theL());
    const id = prefabs[0]!.id;
    prefabs = editPrefab(prefabs, id, { name: '  Corner   wall ', tags: ['Ruins', 'ruins', 'wall'] });
    expect(prefabs[0]!.name).toBe('Corner wall');
    expect(prefabs[0]!.tags).toEqual(['ruins', 'wall']);
    expect(editPrefab(prefabs, id, { name: 'Corner wall' })).toBe(prefabs);
    expect(removePrefab(prefabs, id)).toEqual([]);
    expect(searchLibrary(prefabs, 'ruin')).toHaveLength(1);
  });
});

describe('on disk', () => {
  it('round-trips, packed', () => {
    const prefab = theL();
    const json = prefabToJSON(prefab);
    expect(json.palette).toEqual([STONE]);
    expect(prefabFromJSON(JSON.parse(JSON.stringify(json)))).toEqual(prefab);
  });

  it('refuses a body whose runs do not add up, or an id that could not be a file name', () => {
    const json = prefabToJSON(theL());
    expect(prefabFromJSON({ ...json, runs: [...json.runs, 1, 0] })).toBeNull();
    expect(prefabFromJSON({ ...json, id: '../../etc' })).toBeNull();
    expect(prefabFromJSON({ ...json, size: { x: 0, y: 1, z: 2 } })).toBeNull();
  });

  it('repairs what it can: a blank name, untidy tags', () => {
    const json = prefabToJSON(theL());
    const read = prefabFromJSON({ ...json, name: '   ', tags: ['A b', 7] });
    expect(read?.name).toBe('New prefab');
    expect(read?.tags).toEqual(['a-b']);
  });
});

describe('props in a prefab (D-322)', () => {
  /** A doorway in a short wall along z at x = 4, with a door hung in it, facing 1. */
  const doorway = () => {
    const wall = setBlocks(createMap(), [cube(4, 1, 3), cube(4, 2, 3), cube(4, 1, 5), cube(4, 2, 5), cube(4, 3, 4)], STONE);
    return putProp(wall, { type: 'door', at: cube(4, 1, 4), facing: 1 });
  };
  const captured = () => capturePrefab(doorway(), cube(4, 1, 3), cube(4, 3, 5), { name: 'Doorway' }) as Prefab;

  it('takes the props wholly inside the box, at their places in it, and leaves one the box cuts through', () => {
    expect(captured().props).toEqual([{ type: 'door', at: cube(0, 0, 1), facing: 1, paint: 'material:wood' }]);
    const half = capturePrefab(doorway(), cube(4, 1, 3), cube(4, 1, 5)) as Prefab;
    expect(half.props).toEqual([]);
  });

  it('puts the door down in the doorway, turned with the blocks', () => {
    const turnedOnce = placedProps(captured(), cube(10, 1, 10), { facing: 1, mirrored: false });
    expect(turnedOnce).toHaveLength(1);
    expect(turnedOnce[0]!.facing).toBe(2);
    const blocks = placedBlocks(captured(), cube(10, 1, 10), { facing: 1, mirrored: false });
    const lintel = blocks.find((b) => b.at.y === 3)!.at;
    // The door stands under its lintel, whichever way the prefab is turned.
    expect(turnedOnce[0]!.at).toEqual({ x: lintel.x, y: 1, z: lintel.z });
  });

  it('mirrors a door\'s facing with the blocks', () => {
    expect(placedProps(captured(), cube(10, 1, 10), { facing: 0, mirrored: true })[0]!.facing).toBe(3);
  });

  it('stamps the door with the wall, and leaves out a prop that would not fit', () => {
    const stamped = stampPrefab(createMap(), captured(), cube(10, 1, 10), { facing: 0, mirrored: false, clear: false });
    expect(stamped.props).toHaveLength(1);
    expect(stamped.props[0]).toMatchObject({ type: 'door', facing: 1 });
    // Somebody standing where the door would hang: the wall goes up, the door does not.
    const where = placedProps(captured(), cube(10, 1, 10), { facing: 0, mirrored: false })[0]!.at;
    const kept = stampPrefab(createMap(), captured(), cube(10, 1, 10), { facing: 0, mirrored: false, clear: false }, new Set([blockKey(where)]));
    expect(kept.props).toEqual([]);
    expect(kept.blocks.size).toBeGreaterThan(createMap().blocks.size);
  });

  it('round-trips its props on disk', () => {
    const prefab = captured();
    expect(prefabFromJSON(JSON.parse(JSON.stringify(prefabToJSON(prefab))))).toEqual(prefab);
  });
});
