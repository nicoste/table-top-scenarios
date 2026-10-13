// The route's squares (R-198, D-297).
//
// Pure arithmetic over points, testable where the mesh around it is not
// (R-23, R-23b). The thing it has to get right is also the whole reason it
// replaced a ribbon: **it must say nothing about the ground between cells.**

import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { routePatches, ROUTE_PATCH } from '@tt/render';

const at = (x: number, y: number, z: number) => new Vector3(x, y, z);
const corners = (points: Vector3[], size = ROUTE_PATCH) => {
  const array = routePatches(points, size).getAttribute('position').array;
  const out: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < array.length; i += 3) {
    out.push({ x: array[i]!, y: array[i + 1]!, z: array[i + 2]! });
  }
  return out;
};

describe('a square for every cell and nothing in between', () => {
  it('draws nothing for no points', () => {
    expect(routePatches([]).getAttribute('position').count).toBe(0);
  });

  it('draws one for a route of a single cell', () => {
    // The party aiming at the square it is already standing in.
    const geometry = routePatches([at(0, 0, 0)]);
    expect(geometry.getAttribute('position').count).toBe(4);
    expect(geometry.getIndex()!.count).toBe(6);
  });

  it('counts four corners and two triangles a cell', () => {
    const points = [at(0, 0, 0), at(1, 0, 0), at(2, 0, 0)];
    const geometry = routePatches(points);
    expect(geometry.getAttribute('position').count).toBe(points.length * 4);
    expect(geometry.getIndex()!.count).toBe(points.length * 6);
  });
});

describe('each square is flat, at its own height', () => {
  it('gives all four corners of a cell the same y', () => {
    // The ribbon's failure, in one assertion: a square cannot slope, so it
    // cannot draw a ramp across a step the ground does not have (D-297).
    const pts = corners([at(0, 0, 0), at(1, 2, 1)]);
    expect(pts.slice(0, 4).every((c) => c.y === 0)).toBe(true);
    expect(pts.slice(4, 8).every((c) => c.y === 2)).toBe(true);
  });

  it('takes each cell to its own height, so a staircase reads as steps', () => {
    const pts = corners([at(0, 0, 0), at(1, 1, 0), at(2, 2, 0)]);
    expect([pts[0]!.y, pts[4]!.y, pts[8]!.y]).toEqual([0, 1, 2]);
  });
});

describe('the squares are inset, so a run of them can be counted', () => {
  it('covers less than the whole cell', () => {
    // Filling it would make a line of them one unbroken band, which is a
    // ribbon again and makes the same claim about what lies between.
    expect(ROUTE_PATCH).toBeLessThan(1);
    const [a, b, c, d] = corners([at(5, 0, 5)]);
    expect(b!.x - a!.x).toBeCloseTo(ROUTE_PATCH, 6);
    expect(c!.z - b!.z).toBeCloseTo(ROUTE_PATCH, 6);
    expect(d!.x).toBeCloseTo(5 - ROUTE_PATCH / 2, 6);
  });

  it('centres each square on its cell', () => {
    const pts = corners([at(7, 3, 9)]);
    const mid = pts.reduce((sum, p) => ({ x: sum.x + p.x / 4, z: sum.z + p.z / 4 }), { x: 0, z: 0 });
    expect(mid.x).toBeCloseTo(7, 6);
    expect(mid.z).toBeCloseTo(9, 6);
  });
});
