// The route ribbon's shape (R-197, D-295).
//
// Pure arithmetic over points, so it is testable where the mesh around it is
// not (R-23, R-23b) — and it has failure modes that look like a rendering
// glitch rather than a bug: a corner that pinches, a strip that narrows on a
// slope, a winding that turns the whole thing invisible from above.

import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { ribbonGeometry, ROUTE_WIDTH } from '@tt/render';

const at = (x: number, y: number, z: number) => new Vector3(x, y, z);
const positions = (points: Vector3[], width = ROUTE_WIDTH) => {
  const array = ribbonGeometry(points, width).getAttribute('position').array;
  const out: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < array.length; i += 3) {
    out.push({ x: array[i]!, y: array[i + 1]!, z: array[i + 2]! });
  }
  return out;
};

describe('a route of no length is a real answer', () => {
  it('draws nothing for one point or none', () => {
    expect(ribbonGeometry([]).getAttribute('position').count).toBe(0);
    expect(ribbonGeometry([at(0, 0, 0)]).getAttribute('position').count).toBe(0);
    // A party already standing where it is aiming is a route of one cell, and
    // the aim step asks for it on every move into the pawn's own square.
    expect(ribbonGeometry([at(0, 0, 0)]).getIndex()).toBeNull();
  });
});

describe('two vertices a point, two triangles a segment', () => {
  it('counts both', () => {
    const points = [at(0, 0, 0), at(1, 0, 0), at(2, 0, 0), at(3, 0, 0)];
    const geometry = ribbonGeometry(points);
    expect(geometry.getAttribute('position').count).toBe(points.length * 2);
    expect(geometry.getIndex()!.count).toBe((points.length - 1) * 6);
  });
});

describe('the strip is laid across the direction of travel', () => {
  it('offsets a straight run to either side, by half the width', () => {
    const [left, right] = positions([at(0, 0, 0), at(4, 0, 0)]);
    // Travelling along x, so the width is in z.
    expect(left!.z).toBeCloseTo(-ROUTE_WIDTH / 2, 6);
    expect(right!.z).toBeCloseTo(ROUTE_WIDTH / 2, 6);
    expect(left!.x).toBeCloseTo(0, 6);
  });

  it('bisects a corner rather than following one leg into it', () => {
    // A right angle: in along x, out along z. Laying the width off either leg
    // alone pinches the inside of the bend and leaves a notch on the outside.
    const pts = positions([at(0, 0, 0), at(2, 0, 0), at(2, 0, 2)]);
    const [cornerA, cornerB] = [pts[2]!, pts[3]!];
    // The bisector of +x and +z runs diagonally, so the width is offset on
    // both axes, not on one.
    expect(Math.abs(cornerA.x - 2)).toBeGreaterThan(0.01);
    expect(Math.abs(cornerA.z - 0)).toBeGreaterThan(0.01);
    // And the two sides still straddle the corner point evenly.
    expect((cornerA.x + cornerB.x) / 2).toBeCloseTo(2, 6);
    expect((cornerA.z + cornerB.z) / 2).toBeCloseTo(0, 6);
  });

  it('keeps its width horizontal however steeply it climbs', () => {
    // A ribbon narrowed by its own slope would read as the route thinning
    // out exactly where the ground gets interesting.
    const flat = positions([at(0, 0, 0), at(4, 0, 0)]);
    const steep = positions([at(0, 0, 0), at(4, 9, 0)]);
    expect(steep[0]!.z).toBeCloseTo(flat[0]!.z, 6);
    expect(steep[1]!.z).toBeCloseTo(flat[1]!.z, 6);
  });

  it('takes each point to its own height, so it drapes', () => {
    // Half of what the cost is about is the climb, so the line has to show it.
    const pts = positions([at(0, 0, 0), at(1, 3, 0), at(2, 1, 0)]);
    expect([pts[0]!.y, pts[2]!.y, pts[4]!.y]).toEqual([0, 3, 1]);
  });
});
