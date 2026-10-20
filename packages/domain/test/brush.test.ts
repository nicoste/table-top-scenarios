import { describe, it, expect } from 'vitest';
import {
  CHUNK_SIZE, MAX_BRUSH, clampBrush, brushCells, brushCentreOffset, toGlobal, fromGlobal,
  paintArea, setHeightArea, raiseArea, emptyWorld, addChunk, chunkAt, columnAt,
  WORLD_BRUSHES, stepBrush, BRUSHES,
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
  it('covers size² cells', () => {
    for (const n of WORLD_BRUSHES) expect(brushCells({ gx: 10, gz: 10 }, n)).toHaveLength(n * n);
  });

  it('centres odd sizes on the anchor', () => {
    expect(brushCells({ gx: 5, gz: 5 }, 1).map(key)).toEqual(['5,5']);
    expect(brushCells({ gx: 5, gz: 5 }, 3).map(key).sort()).toEqual(
      ['4,4', '4,5', '4,6', '5,4', '5,5', '5,6', '6,4', '6,5', '6,6'],
    );
  });

  it('offers only odd sizes, so every brush has a centre cell (D-291)', () => {
    // The whole reason 2x2 went: it had to lean one way off the pointer.
    expect(WORLD_BRUSHES.every((n) => n % 2 === 1)).toBe(true);
    expect([...WORLD_BRUSHES]).toEqual([1, 3, 5]);
    // The same three the map offers as flats, which is the point of it.
    // Stairs are one cube of a shape, not a flat (D-349).
    expect([...WORLD_BRUSHES]).toEqual(
      BRUSHES.filter((brush) => brush.rise === 1 && !brush.stairs).map((brush) => brush.span),
    );
  });

  it('reaches five across at the widest', () => {
    expect(brushCells({ gx: 5, gz: 5 }, 5)).toHaveLength(25);
    expect(brushCells({ gx: 5, gz: 5 }, 5).map(key)).toContain('3,3');
    expect(brushCells({ gx: 5, gz: 5 }, 5).map(key)).toContain('7,7');
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
    expect(stepBrush(3, 1)).toBe(5);
    expect(stepBrush(5, 1)).toBe(5);
    expect(stepBrush(5, -1)).toBe(3);
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

  it('stamps a flat plateau with setHeightArea', () => {
    const world = addChunk(emptyWorld(), { cx: 0, cz: 0 });
    const raised = setHeightArea(world, { gx: 10, gz: 10 }, 3, 6);
    const chunk = chunkAt(raised, { cx: 0, cz: 0 })!;
    for (let z = 9; z <= 11; z++) for (let x = 9; x <= 11; x++) {
      expect(columnAt(chunk, x, z)?.height, `${x},${z}`).toBe(6);
    }
    expect(columnAt(chunk, 8, 10)?.height).toBe(0);
  });

  it('preserves relative heights with raiseArea', () => {
    let world = addChunk(emptyWorld(), { cx: 0, cz: 0 });
    world = setHeightArea(world, { gx: 10, gz: 10 }, 1, 4);
    world = raiseArea(world, { gx: 10, gz: 10 }, 3, 2);
    const chunk = chunkAt(world, { cx: 0, cz: 0 })!;
    expect(columnAt(chunk, 10, 10)?.height).toBe(6);
    expect(columnAt(chunk, 9, 10)?.height).toBe(2);
  });

  it('returns the same world when the brush changes nothing', () => {
    const world = addChunk(emptyWorld(), { cx: 0, cz: 0 });
    expect(setHeightArea(world, { gx: 10, gz: 10 }, 3, 0)).toBe(world);
  });
});
