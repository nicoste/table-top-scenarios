// Stairs (D-349): a block drawn as steps. A mark beside the block, never a
// rule — and it goes where the block goes: laid with it, erased with it,
// written with it, cut with it, carried and turned in a prefab.

import { describe, it, expect } from 'vitest';
import type { BlockCoord, SwatchId } from '@tt/domain';
import {
  createMap, setBlocks, clearBlocks, paintBlocks, DEFAULT_FLOOR, stairsAt, mapToJSON, mapFromJSON, sliceOf,
  whyNotStand, capturePrefab, stampPrefab, prefabToJSON, prefabFromJSON, blockKey,
} from '@tt/domain';
import type { MemberId } from '@tt/domain';

const cube = (x: number, y: number, z: number): BlockCoord => ({ x, y, z });
const STONE = DEFAULT_FLOOR as SwatchId;
const WOOD = 'material:wood/oak' as SwatchId;

describe('a stair is a block, drawn as steps', () => {
  it('is laid with its block, and is a block to every rule', () => {
    const map = setBlocks(createMap(), [cube(3, 1, 3)], STONE, 1);
    expect(stairsAt(map, cube(3, 1, 3))).toBe(1);
    expect(stairsAt(map, cube(4, 1, 3))).toBeNull();
    // Somebody stands on it as on any block, and not in it.
    expect(whyNotStand(map, new Map(), 'member_a' as MemberId, cube(3, 2, 3))).toBeNull();
    expect(whyNotStand(map, new Map(), 'member_a' as MemberId, cube(3, 1, 3))).toBe('solid');
  });

  it('goes with its block when erased, and a plain block laid there after is plain', () => {
    let map = setBlocks(createMap(), [cube(3, 1, 3)], STONE, 2);
    map = clearBlocks(map, [cube(3, 1, 3)]);
    expect(map.stairs).toBeUndefined();
    map = setBlocks(map, [cube(3, 1, 3)], STONE);
    expect(stairsAt(map, cube(3, 1, 3))).toBeNull();
  });

  it('stays a stair when repainted', () => {
    const map = paintBlocks(setBlocks(createMap(), [cube(3, 1, 3)], STONE, 3), [cube(3, 1, 3)], WOOD);
    expect(stairsAt(map, cube(3, 1, 3))).toBe(3);
  });

  it('round-trips, and a slice writes only the stairs of the blocks it holds', () => {
    let map = setBlocks(createMap(), [cube(3, 1, 3)], STONE, 1);
    map = setBlocks(map, [cube(3, 5, 3)], STONE, 2);
    const back = mapFromJSON(mapToJSON(map))!;
    expect(stairsAt(back, cube(3, 1, 3))).toBe(1);
    expect(stairsAt(back, cube(3, 5, 3))).toBe(2);
    const low = mapToJSON(sliceOf(map, { lower: 0, upper: 4 }));
    expect(low.stairs).toEqual([{ x: 3, y: 1, z: 3, facing: 1 }]);
    expect(mapToJSON(createMap())).not.toHaveProperty('stairs');
  });

  it('is carried in a prefab, and turned and mirrored with it', () => {
    const map = setBlocks(createMap(), [cube(2, 1, 2), cube(3, 1, 2)], STONE, 0);
    const prefab = capturePrefab(map, cube(2, 1, 2), cube(3, 1, 2));
    if (typeof prefab === 'string') throw new Error(prefab);
    expect(prefab.stairs?.get(blockKey(cube(0, 0, 0)))).toBe(0);
    expect(prefabFromJSON(prefabToJSON(prefab))!.stairs).toEqual(prefab.stairs);
    // A quarter turn clockwise turns the stairs with it; mirrored, the other way round.
    const turned = stampPrefab(createMap(), prefab, cube(8, 1, 8), { facing: 1, mirrored: false, clear: false });
    const placed = [...(turned.stairs ?? [])];
    expect(placed).toHaveLength(2);
    expect(placed.every(([, facing]) => facing === 1)).toBe(true);
    const mirrored = stampPrefab(createMap(), prefab, cube(8, 1, 8), { facing: 1, mirrored: true, clear: false });
    expect([...(mirrored.stairs ?? [])].every(([, facing]) => facing === 1)).toBe(true);
    const sideways = setBlocks(createMap(), [cube(2, 1, 2)], STONE, 1);
    const one = capturePrefab(sideways, cube(2, 1, 2), cube(2, 1, 2));
    if (typeof one === 'string') throw new Error(one);
    const flipped = stampPrefab(createMap(), one, cube(8, 1, 8), { facing: 0, mirrored: true, clear: false });
    expect([...(flipped.stairs ?? [])][0]![1]).toBe(3);
  });

  it('a prefab\'s plain block over a stair makes it plain', () => {
    const plain = capturePrefab(setBlocks(createMap(), [cube(2, 1, 2)], STONE), cube(2, 1, 2), cube(2, 1, 2));
    if (typeof plain === 'string') throw new Error(plain);
    const map = setBlocks(createMap(), [cube(8, 1, 8)], STONE, 2);
    const stamped = stampPrefab(map, plain, cube(8, 1, 8), { facing: 0, mirrored: false, clear: false });
    expect(stairsAt(stamped, cube(8, 1, 8))).toBeNull();
  });
});
