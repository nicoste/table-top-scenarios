// Every cube its own shade (R-172).
//
// The hash is pure, so it is tested without a renderer (R-23b) — and it is
// worth testing, because the property that matters is not "is it random" but
// "do neighbours differ", and a hash can be beautifully distributed overall
// while banding on exactly the grid every cube in this app sits on.

import { describe, it, expect } from 'vitest';
import { grainAt } from '@tt/render';

describe('grainAt', () => {
  it('gives a cube the same shade every time', () => {
    /*
     * The whole reason it is a hash and not a random number. A body is rebuilt
     * whole on every edit, so a shade that changed per rebuild would make the
     * entire map shimmer each time the GM places one cube.
     */
    for (const [x, y, z] of [[0, 0, 0], [7, -3, 12], [-40, 31, -9]]) {
      expect(grainAt(x!, y!, z!)).toBe(grainAt(x!, y!, z!));
    }
  });

  it('stays inside the range the caller scales', () => {
    for (let i = 0; i < 2000; i += 1) {
      const v = grainAt(i % 97, (i * 7) % 31 - 16, (i * 13) % 89);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('gives neighbours different shades, in every direction', () => {
    // The property the whole thing exists for. A hash that agreed with its
    // neighbour would draw the identical wall it is meant to break up.
    const here = grainAt(5, 6, 7);
    for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
      const there = grainAt(5 + dx!, 6 + dy!, 7 + dz!);
      expect(Math.abs(there - here), `${dx},${dy},${dz}`).toBeGreaterThan(0.05);
    }
  });

  it('does not band along a row, which is what a wall is', () => {
    /*
     * `Math.sin(n * 12.9898)` is the usual one-liner for this and it bands on
     * integer grids — a run of cubes picks up a visible repeating ripple,
     * which looks worse than no grain at all.
     *
     * Tested as the property rather than by counting distinct values: with
     * 256 samples over a range rounded to two places, a *perfect* hash still
     * collides into about 148 buckets by birthday alone, so a count proves
     * nothing either way. What matters is how far apart neighbours sit *on
     * average* — a coincidental match is fine and natural, a wall of them is
     * banding — and that the row has no short period.
     */
    const row = Array.from({ length: 256 }, (_, x) => grainAt(x, 4, 4));
    const steps = row.slice(1).map((v, i) => Math.abs(v - row[i]!));
    // Uniform values on [-1, 1] average two thirds apart; banding collapses it.
    expect(steps.reduce((a, b) => a + b, 0) / steps.length).toBeGreaterThan(0.5);

    for (const lag of [1, 2, 3, 4, 8, 16]) {
      const repeats = row.filter((v, i) => i + lag < row.length && v === row[i + lag]).length;
      expect(repeats, `period ${lag}`).toBe(0);
    }
  });

  it('spreads either side of the colour the GM picked', () => {
    // Centred, so a wall is not uniformly darker or lighter than the swatch
    // the GM picked in the palette.
    const many = Array.from({ length: 4000 }, (_, i) => grainAt(i % 61, (i * 3) % 29, (i * 11) % 83));
    const mean = many.reduce((a, b) => a + b, 0) / many.length;
    expect(Math.abs(mean)).toBeLessThan(0.08);
    expect(many.filter((v) => v > 0).length).toBeGreaterThan(many.length * 0.4);
    expect(many.filter((v) => v < 0).length).toBeGreaterThan(many.length * 0.4);
  });

  it('separates the three axes, so a diagonal is not a repeat', () => {
    const diagonal = Array.from({ length: 64 }, (_, i) => grainAt(i, i, i));
    expect(new Set(diagonal.map((v) => v.toFixed(3))).size).toBeGreaterThan(55);
  });
});
