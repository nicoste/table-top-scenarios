// The route, drawn as the cells it crosses (R-198, D-297).
//
// This was a ribbon first, and the ribbon was wrong for a reason worth
// keeping: a strip has to **interpolate between cells**, and the world does
// not. Two cells a step apart in height are a step, not a slope, so the ribbon
// drew a diagonal plane across a corner that the ground does not have — which
// read as the route doing something strange rather than as the route going
// somewhere (D-297).
//
// A square per cell interpolates nothing. Each one lies flat on the top of its
// own column at its own height, so a staircase reads as a staircase and a
// diagonal reads as two cells touching at a corner, which is exactly what it
// is. The cost model underneath is unchanged — this was never a costing
// problem, it was the drawing claiming to know what is between.

import { BufferGeometry, BufferAttribute } from 'three';
import type { Vector3 } from 'three';

/**
 * How much of its cell each square covers.
 *
 * Inset on purpose. Filling the cell would make a run of them one unbroken
 * band — a ribbon again, with the same lie about what lies between — and the
 * whole point is that the route is a set of cells you can count.
 */
export const ROUTE_PATCH = 0.74;
/**
 * How far above the surface the squares float.
 *
 * Enough to clear the ground they lie on. Each takes the height of its own
 * cell, so this is a constant and never a slope.
 */
export const ROUTE_LIFT = 0.06;

/**
 * One flat square per point, each at that point's own height.
 *
 * Nothing is drawn between them, which is the point: the geometry makes no
 * claim about ground it was not given. Returns an empty geometry for no
 * points rather than throwing — an aim that found no route is the common
 * case, and a route of one cell is a real answer.
 */
export function routePatches(
  points: readonly Vector3[],
  size: number = ROUTE_PATCH,
): BufferGeometry {
  const geometry = new BufferGeometry();
  if (points.length === 0) {
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(0), 3));
    return geometry;
  }

  const half = size / 2;
  const positions = new Float32Array(points.length * 12);
  const indices = new Uint32Array(points.length * 6);

  points.forEach((point, i) => {
    const at = i * 12;
    // Corners, anticlockwise from the near-left. Flat: one y for all four,
    // because a cell has one height and the square is lying on it.
    const corners: readonly (readonly [number, number])[] = [
      [-half, -half], [half, -half], [half, half], [-half, half],
    ];
    corners.forEach(([dx, dz], corner) => {
      positions[at + corner * 3] = point.x + dx;
      positions[at + corner * 3 + 1] = point.y;
      positions[at + corner * 3 + 2] = point.z + dz;
    });
    const base = i * 4;
    const index = i * 6;
    indices[index] = base;
    indices[index + 1] = base + 1;
    indices[index + 2] = base + 2;
    indices[index + 3] = base;
    indices[index + 4] = base + 2;
    indices[index + 5] = base + 3;
  });

  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}
