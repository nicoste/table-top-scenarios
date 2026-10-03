// Why a wall of one material does not look moulded (R-172).
//
// Forty identical swatches in a row is what reads as plastic. A few percent of
// drift per cube breaks it, and costs nothing: no texture, no shader, no art,
// one multiply on a colour that was being written anyway.
//
// **Deterministic from the coordinate, never random.** The body is rebuilt
// whole on every edit (R-171), so a random shade would mean every cube in the
// map shimmering each time the GM places one. The same cube is the same shade
// for the life of the map, and two maps built the same way look the same.

/**
 * A stable number in `[-1, 1]` for a cell, from its coordinates alone.
 *
 * An integer hash rather than anything trigonometric: `Math.sin(x * 12.9898)`
 * is the usual one-liner and it bands badly on a grid, which is precisely the
 * arrangement every cube here is in. The constants are odd and large so that
 * the three axes do not share factors — neighbours along any axis have to land
 * far apart, and that is the only property this really has to have.
 */
export function grainAt(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 0x1b873593) ^ Math.imul(y | 0, 0x85ebca6b) ^ Math.imul(z | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  h = (h ^ (h >>> 13)) >>> 0;
  return (h / 0x7fffffff) - 1;
}
