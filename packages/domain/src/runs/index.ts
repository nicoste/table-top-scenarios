// Run-length encoding for a flat array of numbers (R-59).
//
// Terrain and heights are stored one value per cell, and a world is overwhelmingly
// made of long stretches of the same thing: 8,100 cells of one campaign's
// terrain came to 135 runs, and its heights to 9 (D-220).
//
// Separate from the voxel body's packing, which looks similar and is not the
// same: a body is **sparse**, so it is encoded from its occupied cells and
// never walks its box (R-59). These two take a dense array because terrain and
// heights have a value in every cell by definition — there is no air in a
// heightmap.

/** `[count, value, count, value, …]`. */
export function packRuns(values: readonly number[]): number[] {
  const runs: number[] = [];
  let value: number | null = null;
  let count = 0;
  for (const next of values) {
    if (next === value) { count += 1; continue; }
    if (value !== null) runs.push(count, value);
    value = next;
    count = 1;
  }
  if (value !== null) runs.push(count, value);
  return runs;
}

/**
 * Expands runs back into `expected` values, or `null` if they do not add up.
 *
 * Refusing beats guessing, for the reason a voxel body refuses: a count that
 * is wrong by one shifts every cell after it, and a world silently sheared by
 * one column looks like somebody's own mistake rather than a corrupt file
 * (R-18).
 */
export function unpackRuns(runs: readonly number[], expected: number): number[] | null {
  if (runs.length % 2 !== 0) return null;
  const values: number[] = [];
  for (let i = 0; i < runs.length; i += 2) {
    const count = runs[i]!;
    const value = runs[i + 1]!;
    if (!Number.isInteger(count) || count < 0) return null;
    // Guard before filling: a corrupt count could otherwise ask for a hundred
    // million entries before anyone notices it was wrong.
    if (values.length + count > expected) return null;
    for (let k = 0; k < count; k += 1) values.push(value);
  }
  return values.length === expected ? values : null;
}
