import { describe, it, expect } from 'vitest';
import {
  CHUNK_SIZE, MAX_BRUSH, clampBrush, brushCells, brushCentreOffset, toGlobal, fromGlobal,
  paintArea, setHeightArea, raiseArea, emptyWorld, addChunk, chunkAt, columnAt, registryId,
} from '@tt/domain';
import type { TerrainId } from '@tt/domain';

const grass = registryId<'TerrainId'>('terrain', 'grass') as TerrainId;
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
    for (const n of [1, 2, 3]) expect(brushCells({ gx: 10, gz: 10 }, n)).toHaveLength(n * n);
  });

  it('centres odd sizes on the anchor', () => {
    expect(brushCells({ gx: 5, gz: 5 }, 1).map(key)).toEqual(['5,5']);
    expect(brushCells({ gx: 5, gz: 5 }, 3).map(key).sort()).toEqual(
      ['4,4', '4,5', '4,6', '5,4', '5,5', '5,6', '6,4', '6,5', '6,6'],
    );
  });

  it('extends even sizes forward, since they have no centre cell', () => {
    expect(brushCells({ gx: 5, gz: 5 }, 2).map(key).sort()).toEqual(['5,5', '5,6', '6,5', '6,6']);
  });

  it('always includes the anchor itself', () => {
    for (const n of [1, 2, 3]) expect(brushCells({ gx: 9, gz: 9 }, n).map(key)).toContain('9,9');
  });

  it('offsets the outline to match the cells it will edit', () => {
    expect(brushCentreOffset(1)).toBe(0);
    expect(brushCentreOffset(2)).toBe(0.5);
    expect(brushCentreOffset(3)).toBe(0);
  });

  it('clamps out-of-range sizes rather than throwing', () => {
    expect(clampBrush(0)).toBe(1);
    expect(clampBrush(99)).toBe(MAX_BRUSH);
    expect(clampBrush(2.4)).toBe(2);
    expect(clampBrush(Number.NaN)).toBe(1);
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
    expect(columnAt(chunkAt(painted, { cx: 5, cz: 5 })!, CHUNK_SIZE - 1, 10)?.terrainId).toBe(grass);
    expect(columnAt(chunkAt(painted, { cx: 6, cz: 5 })!, 0, 10)?.terrainId).toBe(grass);
  });

  it('skips cells in chunks that do not exist rather than creating them', () => {
    const world = addChunk(emptyWorld(), { cx: 5, cz: 5 });
    const at = toGlobal({ cx: 5, cz: 5 }, CHUNK_SIZE - 1, 10);
    const painted = paintArea(world, at, 3, grass);
    expect(painted.chunks.size).toBe(1);
    expect(columnAt(chunkAt(painted, { cx: 5, cz: 5 })!, CHUNK_SIZE - 1, 10)?.terrainId).toBe(grass);
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
