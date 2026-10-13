// The route, drawn as a ribbon over the ground it crosses (R-197, D-295).
//
// A ribbon rather than outlined cells. The outline the hover already uses is
// right for *one* cell — it says "this one" — and wrong for forty, where what
// the GM is reading is a **line going somewhere**, not a set of cells. A strip
// following the route reads as a journey at the zoom the world is seen at, and
// it climbs with the land it crosses, which is half of what the cost is about.
//
// It is geometry and not a texture, because it has to sit on ground that goes
// up and down: every point takes the height of the cell it stands on, so the
// ribbon drapes rather than floats.

import { BufferGeometry, BufferAttribute, Vector3 } from 'three';

/** How wide the strip is, in cells. A third, so it reads without hiding the ground. */
export const ROUTE_WIDTH = 0.34;
/**
 * How far above the surface it floats.
 *
 * Enough to clear the ground it lies on without reading as hovering. Each
 * point is lifted off its *own* cell, so this is a constant rather than a
 * sloped offset — the drape does the rest.
 */
export const ROUTE_LIFT = 0.06;

/**
 * A strip through the given points, flat-side-up.
 *
 * The width is laid off the **turn**, not the incoming direction: at a corner
 * the perpendicular is the average of the two legs, so the outside of a bend
 * does not pinch and the inside does not fold over itself. At the ends there
 * is only one leg, so it is that one.
 *
 * Returns an empty geometry for fewer than two points rather than throwing: a
 * route of one cell is a real answer (the party is already there), and an aim
 * that found nothing is the common case.
 */
export function ribbonGeometry(
  points: readonly Vector3[],
  width: number = ROUTE_WIDTH,
): BufferGeometry {
  const geometry = new BufferGeometry();
  if (points.length < 2) {
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(0), 3));
    return geometry;
  }

  const half = width / 2;
  const positions = new Float32Array(points.length * 6);
  const side = new Vector3();
  const back = new Vector3();
  const forth = new Vector3();

  for (let i = 0; i < points.length; i += 1) {
    const here = points[i]!;
    const before = points[i - 1];
    const after = points[i + 1];
    // Flattened to the ground plane: the ribbon is wide horizontally however
    // steeply it is climbing, or a slope would make it look narrower.
    back.set(0, 0, 0);
    forth.set(0, 0, 0);
    if (before) back.set(here.x - before.x, 0, here.z - before.z).normalize();
    if (after) forth.set(after.x - here.x, 0, after.z - here.z).normalize();
    const along = back.add(forth);
    if (along.lengthSq() === 0) along.set(1, 0, 0);
    along.normalize();
    // Perpendicular in the ground plane: (x, z) turned a quarter.
    side.set(-along.z, 0, along.x).multiplyScalar(half);

    const at = i * 6;
    positions[at] = here.x - side.x;
    positions[at + 1] = here.y;
    positions[at + 2] = here.z - side.z;
    positions[at + 3] = here.x + side.x;
    positions[at + 4] = here.y;
    positions[at + 5] = here.z + side.z;
  }

  const indices = new Uint32Array((points.length - 1) * 6);
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = i * 2;
    const at = i * 6;
    indices[at] = a;
    indices[at + 1] = a + 1;
    indices[at + 2] = a + 2;
    indices[at + 3] = a + 1;
    indices[at + 4] = a + 3;
    indices[at + 5] = a + 2;
  }

  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}
