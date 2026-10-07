// Sight lines through a grid of cubes (R-41, R-44). The rules about eyes,
// ranges and what counts as seen are the domain's; these are only about the
// line itself — where it goes, and what stops it.

import { describe, it, expect } from 'vitest';
import { lineIsClear, cubeGrid, cubeIndex, cubeAt } from '@tt/geometry';
import type { Blocks } from '@tt/geometry';

/** Blocks at exactly these cubes, written "x,y,z". */
const solid = (...cubes: string[]): Blocks => {
  const set = new Set(cubes);
  return (x, y, z) => set.has(`${x},${y},${z}`);
};

describe('a sight line is walked cube by cube', () => {
  it('is clear through empty space', () => {
    expect(lineIsClear(solid(), { x: 0.5, y: 1.2, z: 0.5 }, { x: 9.3, y: 0.4, z: 6.8 })).toBe(true);
  });

  it('stops at a cube in the way', () => {
    const wall = solid('3,0,0');
    expect(lineIsClear(wall, { x: 0.5, y: 0.5, z: 0.5 }, { x: 6.5, y: 0.5, z: 0.5 })).toBe(false);
  });

  it('is not stopped by a cube beyond its end, or beside it', () => {
    const blocks = solid('7,0,0', '3,0,1');
    expect(lineIsClear(blocks, { x: 0.5, y: 0.5, z: 0.5 }, { x: 6.5, y: 0.5, z: 0.5 })).toBe(true);
  });

  it('is walked the same in every direction', () => {
    const wall = solid('-3,-2,-1');
    const from = { x: 0.5, y: 0.5, z: 0.5 };
    const to = { x: -5.4, y: -3.7, z: -1.9 };
    expect(lineIsClear(wall, from, to)).toBe(false);
    expect(lineIsClear(wall, to, from)).toBe(false);
    expect(lineIsClear(solid(), to, from)).toBe(true);
  });

  it('does not see out of a solid cube, and does not see into one', () => {
    const block = solid('0,0,0');
    expect(lineIsClear(block, { x: 0.5, y: 0.5, z: 0.5 }, { x: 4.5, y: 0.5, z: 0.5 })).toBe(false);
    expect(lineIsClear(block, { x: 4.5, y: 0.5, z: 0.5 }, { x: 0.5, y: 0.5, z: 0.5 })).toBe(false);
  });
});

describe('seams are sealed (R-44)', () => {
  // A line from the middle of one cube to the middle of its diagonal neighbour
  // passes exactly through the edge the other two share.
  const from = { x: 0.5, y: 0.5, z: 0.5 };
  const to = { x: 1.5, y: 0.5, z: 1.5 };

  it('does not let sight through two cubes that touch only along an edge', () => {
    expect(lineIsClear(solid('1,0,0', '0,0,1'), from, to)).toBe(false);
  });

  it('stops a line that runs exactly along one cube\'s edge, too', () => {
    expect(lineIsClear(solid('1,0,0'), from, to)).toBe(false);
    expect(lineIsClear(solid('0,0,1'), from, to)).toBe(false);
  });

  it('stops a line through a corner that a cube shares', () => {
    const corner = { x: 1.5, y: 1.5, z: 1.5 };
    expect(lineIsClear(solid(), from, corner)).toBe(true);
    expect(lineIsClear(solid('1,1,0'), from, corner)).toBe(false);
    expect(lineIsClear(solid('0,1,0'), from, corner)).toBe(false);
  });

  it('lets the same line through when nothing shares the edge', () => {
    expect(lineIsClear(solid('2,0,0', '0,0,2'), from, to)).toBe(true);
  });
});

describe('a grid of cubes', () => {
  it('reads empty outside its box, and its own number inside', () => {
    const grid = cubeGrid({ x: -2, y: -1, z: 3 }, { x: 4, y: 2, z: 5 });
    const at = cubeIndex(grid, 1, 0, 7);
    expect(at).toBeGreaterThanOrEqual(0);
    grid.cells[at] = 2;
    expect(cubeAt(grid, 1, 0, 7)).toBe(2);
    expect(cubeAt(grid, 1, 0, 6)).toBe(0);
    expect(cubeIndex(grid, 2, 0, 7)).toBe(-1);
    expect(cubeAt(grid, 2, 0, 7)).toBe(0);
  });
});
