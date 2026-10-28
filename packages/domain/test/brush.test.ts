import { describe, it, expect } from 'vitest';
import {
  CHUNK_SIZE, MAX_BRUSH, clampBrush, brushCells, brushCentreOffset, toGlobal, fromGlobal,
  paintArea, emptyWorld, addChunk, chunkAt, columnAt,
  WORLD_BRUSHES, stepBrush, BRUSHES, liftArea, MAX_HEIGHT,
} from '@tt/domain';
import type { SwatchId } from '@tt/domain';

const grass = 'material:grass' as SwatchId;
const key = (c: { gx: number; gz: number }) => `${c.gx},${c.gz}`;

describe('global coordinates round-trip', () => {
  it('converts both ways for every corner of a chunk', () => {
    for (const [x, z] of [[0, 0], [CHUNK_SIZE - 1, 0], [0, CHUNK_SIZE - 1], [CHUNK_SIZE - 1, CHUNK_SIZE - 1]]) {
      const global = toGlobal({ cx: 4, cz: 7 }, x!, z!);
      expect(fromGlobal(global)).toEqual({ coord: { cx: 4, cz: 7 }, x, z });
    }
  });

  it('handles negative chunk coordinates without wrapping wrongly', () => {
    const global = toGlobal({ cx: -1, cz: -2 }, 3, 5);
    expect(fromGlobal(global)).toEqual({ coord: { cx: -1, cz: -2 }, x: 3, z: 5 });
  });
});

describe('brush footprints', () => {
  it('is round, as near as cells get: a cross at 3, and rounder as it grows (D-364)', () => {
    expect(WORLD_BRUSHES.map((n) => brushCells({ gx: 10, gz: 10 }, n).length)).toEqual([1, 5, 21, 37, 69, 97]);
    for (const n of WORLD_BRUSHES) {
      const half = (n - 1) / 2;
      const cells = new Set(brushCells({ gx: 0, gz: 0 }, n).map(key));
      // The same every quarter turn and every mirror, and inside its square.
      for (const cell of cells) {
        const [x, z] = cell.split(',').map(Number) as [number, number];
        for (const [a, b] of [[-x, z], [x, -z], [z, x]]) expect(cells.has(`${a},${b}`), `${n}: ${cell}`).toBe(true);
        expect(Math.max(Math.abs(x), Math.abs(z))).toBeLessThanOrEqual(half);
      }
      // Reaching its full width across the middle, and never its corners.
      expect(cells.has(`${half},0`) && cells.has(`0,${half}`)).toBe(true);
      if (n > 1) expect(cells.has(`${half},${half}`)).toBe(false);
    }
  });

  it('centres odd sizes on the anchor', () => {
    expect(brushCells({ gx: 5, gz: 5 }, 1).map(key)).toEqual(['5,5']);
    expect(brushCells({ gx: 5, gz: 5 }, 3).map(key).sort()).toEqual(['4,5', '5,4', '5,5', '5,6', '6,5']);
  });

  it('offers only odd sizes, so every brush has a centre cell (D-291)', () => {
    // The whole reason 2x2 went: it had to lean one way off the pointer.
    expect(WORLD_BRUSHES.every((n) => n % 2 === 1)).toBe(true);
    expect([...WORLD_BRUSHES]).toEqual([1, 3, 5, 7, 9, 11]);
    // The same the map offers as flats, which is the point of it.
    expect([...WORLD_BRUSHES]).toEqual(
      BRUSHES.filter((brush) => brush.rise === 1).map((brush) => brush.span),
    );
  });

  it('reaches eleven across at the widest', () => {
    const cells = brushCells({ gx: 5, gz: 5 }, 11).map(key);
    expect(cells).toContain('0,5');
    expect(cells).toContain('10,5');
    expect(cells).not.toContain('0,0');
  });

  it('always includes the anchor itself', () => {
    for (const n of WORLD_BRUSHES) {
      expect(brushCells({ gx: 9, gz: 9 }, n).map(key)).toContain('9,9');
    }
  });

  it('needs no outline offset at all now, and still asks for one', () => {
    // Zero for every listed size, because every listed size is odd. The
    // outline keeps reading it so an even brush could come back without the
    // outline drifting half a cell off the cells that get painted.
    for (const n of WORLD_BRUSHES) expect(brushCentreOffset(n), `${n}`).toBe(0);
  });

  it('snaps anything else to the nearest size it offers', () => {
    expect(clampBrush(0)).toBe(1);
    expect(clampBrush(99)).toBe(MAX_BRUSH);
    expect(clampBrush(2)).toBe(1);     // a tie goes to the narrower
    expect(clampBrush(2.4)).toBe(3);
    expect(clampBrush(4)).toBe(3);
    expect(clampBrush(Number.NaN)).toBe(1);
  });

  it('steps through the sizes rather than counting, and stops at the ends', () => {
    // `[` and `]`. Arithmetic on the number would land between them.
    expect(stepBrush(1, 1)).toBe(3);
    expect(stepBrush(5, 1)).toBe(7);
    expect(stepBrush(9, 1)).toBe(11);
    expect(stepBrush(11, 1)).toBe(11);
    expect(stepBrush(11, -1)).toBe(9);
    expect(stepBrush(1, -1)).toBe(1);
  });
});

describe('brushes across chunk boundaries', () => {
  function twoChunks() {
    let world = addChunk(emptyWorld(), { cx: 5, cz: 5 });
    world = addChunk(world, { cx: 6, cz: 5 });
    return world;
  }

  it('paints into the neighbouring chunk when it straddles the edge', () => {
    const world = twoChunks();
    // last column of chunk 5, so a 3-wide brush reaches into chunk 6
    const at = toGlobal({ cx: 5, cz: 5 }, CHUNK_SIZE - 1, 10);
    const painted = paintArea(world, at, 3, grass);
    expect(columnAt(chunkAt(painted, { cx: 5, cz: 5 })!, CHUNK_SIZE - 1, 10)?.ground).toBe(grass);
    expect(columnAt(chunkAt(painted, { cx: 6, cz: 5 })!, 0, 10)?.ground).toBe(grass);
  });

  it('skips cells in chunks that do not exist rather than creating them', () => {
    const world = addChunk(emptyWorld(), { cx: 5, cz: 5 });
    const at = toGlobal({ cx: 5, cz: 5 }, CHUNK_SIZE - 1, 10);
    const painted = paintArea(world, at, 3, grass);
    expect(painted.chunks.size).toBe(1);
    expect(columnAt(chunkAt(painted, { cx: 5, cz: 5 })!, CHUNK_SIZE - 1, 10)?.ground).toBe(grass);
  });

  it('lifts flat ground into a plateau, in the brush\'s round shape', () => {
    const world = addChunk(emptyWorld(), { cx: 0, cz: 0 });
    const raised = liftArea(world, world, { gx: 10, gz: 10 }, 3, 6);
    const chunk = chunkAt(raised, { cx: 0, cz: 0 })!;
    for (const [x, z] of [[10, 10], [9, 10], [11, 10], [10, 9], [10, 11]]) {
      expect(columnAt(chunk, x!, z!)?.height, `${x},${z}`).toBe(6);
    }
    // A cross at 3: its corners are left alone.
    expect(columnAt(chunk, 9, 9)?.height).toBe(0);
    expect(columnAt(chunk, 8, 10)?.height).toBe(0);
  });

  it('returns the same world when the brush changes nothing', () => {
    const world = addChunk(emptyWorld(), { cx: 0, cz: 0 });
    expect(liftArea(world, world, { gx: 10, gz: 10 }, 3, 0)).toBe(world);
  });
});

describe('lifting the ground under a brush (D-367)', () => {
  /** A ridge across the 3-cross at 10,10: the middle 4 high, its arms 1, 2, 3 and 0. */
  const ridge = () => {
    let world = addChunk(emptyWorld(), { cx: 0, cz: 0 });
    for (const [x, z, h] of [[10, 10, 4], [9, 10, 1], [11, 10, 2], [10, 9, 3]] as const) {
      world = liftArea(world, world, { gx: x, gz: z }, 1, h);
    }
    return world;
  };
  const heights = (world: ReturnType<typeof ridge>) => [[10, 10], [9, 10], [11, 10], [10, 9], [10, 11]]
    .map(([x, z]) => columnAt(chunkAt(world, { cx: 0, cz: 0 })!, x!, z!)!.height);

  it('moves every column together, keeping their offsets', () => {
    const from = ridge();
    expect(heights(liftArea(from, from, { gx: 10, gz: 10 }, 3, 2))).toEqual([6, 3, 4, 5, 2]);
    expect(heights(liftArea(from, from, { gx: 10, gz: 10 }, 3, -1))).toEqual([3, 0, 1, 2, 0]);
  });

  it('stops each column at the limits on its own, and the rest close in on it', () => {
    const from = ridge();
    const high = liftArea(from, from, { gx: 10, gz: 10 }, 3, MAX_HEIGHT - 3);
    expect(heights(high)).toEqual([MAX_HEIGHT, MAX_HEIGHT - 2, MAX_HEIGHT - 1, MAX_HEIGHT, MAX_HEIGHT - 3]);
  });

  it('measures from where it started, so going too far and back gives the shape back', () => {
    const from = ridge();
    const over = liftArea(from, from, { gx: 10, gz: 10 }, 3, MAX_HEIGHT);
    expect(heights(liftArea(over, from, { gx: 10, gz: 10 }, 3, 0))).toEqual(heights(from));
  });
});

