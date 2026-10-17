// How far a token would walk inside a map (R-209): real distance over floors
// somebody could stand on, a preview and never a rule (D-316).

import { describe, it, expect } from 'vitest';
import type { BlockCoord, EncounterMap } from '@tt/domain';
import { createMap, setBlocks, DEFAULT_FLOOR, walkAcross, sameCube } from '@tt/domain';

const cube = (x: number, y: number, z: number): BlockCoord => ({ x, y, z });
/** A new map: a floor at y0 across 16×16, so everybody stands at y1. */
const floor = () => createMap();
const build = (map: EncounterMap, cubes: readonly BlockCoord[]) => setBlocks(map, cubes, DEFAULT_FLOOR);
/** A column of blocks from y1 up to `height`, on the floor. */
const pillar = (x: number, z: number, height: number) =>
  Array.from({ length: height }, (_, i) => cube(x, 1 + i, z));
const close = (value: number | undefined, expected: number) => expect(value).toBeCloseTo(expected, 9);

describe('walking on one level', () => {
  it('counts a straight step as 1', () => {
    const walk = walkAcross(floor(), cube(1, 1, 1), cube(6, 1, 1));
    close(walk?.length, 5);
    expect(walk?.cubes).toHaveLength(6);
    expect(walk?.cubes[0]).toEqual(cube(1, 1, 1));
    expect(walk?.cubes.at(-1)).toEqual(cube(6, 1, 1));
  });

  it('counts a diagonal as √2, and mixes the two the shortest way', () => {
    close(walkAcross(floor(), cube(1, 1, 1), cube(4, 1, 4))?.length, 3 * Math.SQRT2);
    close(walkAcross(floor(), cube(1, 1, 1), cube(6, 1, 3))?.length, 3 + 2 * Math.SQRT2);
  });

  it('is nothing to stand where you stand', () => {
    expect(walkAcross(floor(), cube(2, 1, 2), cube(2, 1, 2))).toEqual({ cubes: [cube(2, 1, 2)], length: 0 });
  });

  it('walks round a wall, never through it', () => {
    // A wall two blocks high across x = 4, from z = 0 to z = 9.
    const map = build(floor(), Array.from({ length: 10 }, (_, z) => pillar(4, z, 2)).flat());
    const walk = walkAcross(map, cube(2, 1, 2), cube(6, 1, 2))!;
    expect(walk.length).toBeGreaterThan(4);
    expect(walk.cubes.every((at) => at.x !== 4 || at.z > 9)).toBe(true);
  });

  it('does not squeeze between two blocks that meet only at their corners', () => {
    // Shut in a corner of the map by two blocks meeting diagonally.
    const map = build(floor(), [...pillar(1, 0, 2), ...pillar(0, 1, 2)]);
    expect(walkAcross(map, cube(0, 1, 0), cube(1, 1, 1))).toBeNull();
  });
});

describe('walking up and down', () => {
  /** A platform one block high over x ≥ 4. */
  const step = () => build(floor(), Array.from({ length: 12 }, (_, x) =>
    Array.from({ length: 16 }, (__, z) => cube(x + 4, 1, z))).flat());

  it('takes a step up with a step across: √2 for the stair', () => {
    close(walkAcross(step(), cube(2, 1, 2), cube(5, 2, 2))?.length, 2 + Math.SQRT2);
  });

  it('is as long coming back down', () => {
    close(walkAcross(step(), cube(5, 2, 2), cube(2, 1, 2))?.length, 2 + Math.SQRT2);
  });

  it('takes a stair diagonally at √3', () => {
    close(walkAcross(step(), cube(3, 1, 3), cube(4, 2, 4))?.length, Math.sqrt(3));
  });

  it('cannot climb a ledge two blocks high, so a pillar has no path to its top', () => {
    const map = build(floor(), pillar(5, 5, 2));
    expect(walkAcross(map, cube(2, 1, 2), cube(5, 3, 5))).toBeNull();
  });

  it('cannot step down two blocks either', () => {
    const map = build(floor(), pillar(5, 5, 2));
    expect(walkAcross(map, cube(5, 3, 5), cube(2, 1, 2))).toBeNull();
  });

  it('needs room overhead to climb', () => {
    // A stair under a low ceiling: the block above the lower cube shuts it.
    const map = build(step(), Array.from({ length: 16 }, (_, z) => cube(3, 2, z)));
    expect(walkAcross(map, cube(2, 1, 2), cube(5, 2, 2))).toBeNull();
  });
});

describe('what a path may cross', () => {
  it('only floors the screen allows, so the table never routes through a room unseen', () => {
    const map = build(floor(), Array.from({ length: 10 }, (_, z) => pillar(4, z, 2)).flat());
    // The way round the end of the wall is not allowed: no path.
    expect(walkAcross(map, cube(2, 1, 2), cube(6, 1, 2), (at) => at.z <= 9)).toBeNull();
  });

  it('is no path to a cube nobody could stand in', () => {
    expect(walkAcross(floor(), cube(1, 1, 1), cube(5, 0, 5))).toBeNull();
    expect(walkAcross(floor(), cube(1, 1, 1), cube(5, 2, 5))).toBeNull();
  });

  it('gives up past its budget rather than search a city', () => {
    expect(walkAcross(floor(), cube(0, 1, 0), cube(15, 1, 15), () => true, 3)).toBeNull();
  });

  it('every step of the walk is one step: neighbours, one level at most', () => {
    const map = build(floor(), [...pillar(3, 3, 1), ...pillar(4, 3, 1), ...pillar(5, 6, 2)]);
    const walk = walkAcross(map, cube(0, 1, 0), cube(12, 1, 9))!;
    walk.cubes.slice(1).forEach((at, i) => {
      const was = walk.cubes[i]!;
      expect(Math.max(Math.abs(at.x - was.x), Math.abs(at.z - was.z))).toBe(1);
      expect(Math.abs(at.y - was.y)).toBeLessThanOrEqual(1);
      expect(sameCube(at, was)).toBe(false);
    });
  });
});
