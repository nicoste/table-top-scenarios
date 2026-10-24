// The shape of a brush seen from above (D-364): round, as near as cells get,
// shared by the world's brushes and the map's flat ones so a 7 is the same 7
// on both.
//
// **Drawn, not worked out.** A circle of cells has no single right answer at
// these sizes — the GM asked for a cross at 3, and no rule that gives a cross
// at 3 also gives a pleasing 9 — so each size is written down as it should
// look, and the code only reads it.

/** Every brush span there is, odd so the cell pointed at is the middle (D-291). */
export const BRUSH_SPANS = [1, 3, 5, 7, 9, 11] as const;

/** Each span, row by row from −z to +z: `#` is in the brush, `.` is not. */
const SHAPES: Readonly<Record<number, readonly string[]>> = {
  1: ['#'],
  3: [
    '.#.',
    '###',
    '.#.',
  ],
  5: [
    '.###.',
    '#####',
    '#####',
    '#####',
    '.###.',
  ],
  7: [
    '..###..',
    '.#####.',
    '#######',
    '#######',
    '#######',
    '.#####.',
    '..###..',
  ],
  9: [
    '..#####..',
    '.#######.',
    '#########',
    '#########',
    '#########',
    '#########',
    '#########',
    '.#######.',
    '..#####..',
  ],
  11: [
    '...#####...',
    '..#######..',
    '.#########.',
    '###########',
    '###########',
    '###########',
    '###########',
    '###########',
    '.#########.',
    '..#######..',
    '...#####...',
  ],
};

/** Read once: the offsets from the middle cell each span covers. */
const OFFSETS = new Map<number, readonly (readonly [number, number])[]>(
  Object.entries(SHAPES).map(([span, rows]) => {
    const half = Math.floor(Number(span) / 2);
    const cells: [number, number][] = [];
    rows.forEach((row, z) => [...row].forEach((mark, x) => { if (mark === '#') cells.push([x - half, z - half]); }));
    return [Number(span), cells];
  }),
);

/**
 * The cells a brush of this span covers, as `[dx, dz]` from the cell pointed
 * at — round, and always including it. A span with no shape written down is
 * the nearest one there is.
 */
export function footprintOf(span: number): readonly (readonly [number, number])[] {
  const nearest = BRUSH_SPANS.reduce((best, n) => (Math.abs(n - span) < Math.abs(best - span) ? n : best), 1 as number);
  return OFFSETS.get(nearest)!;
}
