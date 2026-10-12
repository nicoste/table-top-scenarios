import { describe, it, expect } from 'vitest';
import {
  CHUNK_SIZE, MAX_HEIGHT, OPEN_WATER, GROUND_FROM_TERRAIN, isKnownSwatch, registryId,
  createChunk, emptyWorld, addChunk, replaceChunk, chunkAt, isAuthored, creatableSlots,
  columnAt, paintGround, setHeight, raiseHeight, clampHeight,
  isCreatableSlot, packRuns, unpackRuns,
} from '@tt/domain';
import type { SwatchId } from '@tt/domain';

const grass = 'material:grass' as SwatchId;

describe('a fresh chunk (R-78)', () => {
  it('is flat at height 0 and entirely water', () => {
    const chunk = createChunk({ cx: 3, cz: 4 });
    expect(chunk.columns).toHaveLength(CHUNK_SIZE * CHUNK_SIZE);
    expect(chunk.columns.every((c) => c.height === 0 && c.ground === OPEN_WATER)).toBe(true);
  });
});

describe('column access (D-060)', () => {
  const chunk = createChunk({ cx: 0, cz: 0 });
  it('returns null out of bounds instead of undefined', () => {
    expect(columnAt(chunk, -1, 0)).toBeNull();
    expect(columnAt(chunk, 0, CHUNK_SIZE)).toBeNull();
    expect(columnAt(chunk, 1.5, 2)).toBeNull();
  });
  it('returns a column in bounds', () => {
    expect(columnAt(chunk, 0, 0)).not.toBeNull();
    expect(columnAt(chunk, CHUNK_SIZE - 1, CHUNK_SIZE - 1)).not.toBeNull();
  });
});

describe('the two tools never touch each other (R-88, R-89)', () => {
  it('painting changes terrain and leaves height alone', () => {
    let chunk = createChunk({ cx: 0, cz: 0 });
    chunk = setHeight(chunk, 5, 5, 7);
    chunk = paintGround(chunk, 5, 5, grass);
    expect(columnAt(chunk, 5, 5)).toEqual({ height: 7, ground: grass });
  });

  it('raising changes height and leaves terrain alone', () => {
    let chunk = createChunk({ cx: 0, cz: 0 });
    chunk = paintGround(chunk, 2, 2, grass);
    chunk = raiseHeight(chunk, 2, 2, 3);
    expect(columnAt(chunk, 2, 2)).toEqual({ height: 3, ground: grass });
  });
});

describe('height is clamped and snapped (R-80, R-89)', () => {
  it('snaps to whole cubes', () => {
    expect(clampHeight(3.4)).toBe(3);
    expect(clampHeight(3.6)).toBe(4);
  });
  it('cannot go below sea level or above the cap', () => {
    expect(clampHeight(-5)).toBe(0);
    expect(clampHeight(MAX_HEIGHT + 10)).toBe(MAX_HEIGHT);
  });
  it('caps at 30 levels', () => {
    expect(MAX_HEIGHT).toBe(30);
  });
  it('lowering a column at sea level is a no-op, not a negative', () => {
    const chunk = raiseHeight(createChunk({ cx: 0, cz: 0 }), 1, 1, -3);
    expect(columnAt(chunk, 1, 1)?.height).toBe(0);
  });
});

describe('edits are immutable', () => {
  it('does not mutate the chunk it was given', () => {
    const before = createChunk({ cx: 0, cz: 0 });
    const after = setHeight(before, 1, 1, 5);
    expect(columnAt(before, 1, 1)?.height).toBe(0);
    expect(columnAt(after, 1, 1)?.height).toBe(5);
  });
  it('returns the same chunk when nothing would change', () => {
    const chunk = createChunk({ cx: 0, cz: 0 });
    expect(setHeight(chunk, 1, 1, 0)).toBe(chunk);
    expect(paintGround(chunk, 1, 1, OPEN_WATER)).toBe(chunk);
  });
});

describe('chunks are sparse, and absent means Unknown (R-16, D-010)', () => {
  it('an empty world knows nothing', () => {
    const world = emptyWorld();
    expect(world.chunks.size).toBe(0);
    expect(isAuthored(world, { cx: 0, cz: 0 })).toBe(false);
    expect(chunkAt(world, { cx: 0, cz: 0 })).toBeNull();
  });

  it('refuses chunks outside the world bounds', () => {
    const world = emptyWorld({ x: 20, z: 20 });
    expect(addChunk(world, { cx: 20, cz: 0 }).chunks.size).toBe(0);
    expect(addChunk(world, { cx: -1, cz: 0 }).chunks.size).toBe(0);
  });

  it('will not overwrite an authored chunk', () => {
    let world = addChunk(emptyWorld(), { cx: 5, cz: 5 });
    world = replaceChunk(world, setHeight(createChunk({ cx: 5, cz: 5 }), 0, 0, 9));
    const again = addChunk(world, { cx: 5, cz: 5 });
    expect(chunkAt(again, { cx: 5, cz: 5 })?.columns[0]?.height).toBe(9);
  });
});

describe('the + affordance (R-79)', () => {
  it('offers the origin when the world is empty', () => {
    expect(creatableSlots(emptyWorld())).toEqual([{ cx: 0, cz: 0 }]);
  });

  it('has a 30-cell chunk edge', () => {
    expect(CHUNK_SIZE).toBe(30);
  });

  it('offers all eight neighbours of one chunk, diagonals included', () => {
    const world = addChunk(emptyWorld(), { cx: 5, cz: 5 });
    const slots = creatableSlots(world).map((c) => `${c.cx},${c.cz}`).sort();
    expect(slots).toEqual(['4,4', '4,5', '4,6', '5,4', '5,6', '6,4', '6,5', '6,6']);
  });

  it('accepts a purely diagonal slot', () => {
    const world = addChunk(emptyWorld(), { cx: 5, cz: 5 });
    expect(isCreatableSlot(world, { cx: 6, cz: 6 })).toBe(true);
    expect(isCreatableSlot(world, { cx: 7, cz: 7 })).toBe(false);
  });

  it('never offers a slot that already holds a chunk', () => {
    let world = addChunk(emptyWorld(), { cx: 5, cz: 5 });
    world = addChunk(world, { cx: 6, cz: 5 });
    const slots = creatableSlots(world).map((c) => `${c.cx},${c.cz}`);
    expect(slots).not.toContain('5,5');
    expect(slots).not.toContain('6,5');
    expect(new Set(slots).size).toBe(slots.length);
  });

  it('clips slots to the world bounds', () => {
    const world = addChunk(emptyWorld({ x: 20, z: 20 }), { cx: 0, cz: 0 });
    const slots = creatableSlots(world).map((c) => `${c.cx},${c.cz}`).sort();
    expect(slots).toEqual(['0,1', '1,0', '1,1']);
  });
});

describe('a world written before D-280 still reads (R-137a)', () => {
  it('maps every one of the twelve old terrain ids onto a swatch the registry knows', () => {
    const old = [
      'water', 'shallows', 'sand', 'grass', 'forest', 'hills',
      'rock', 'snow', 'swamp', 'road', 'moor', 'jungle',
    ];
    for (const name of old) {
      const ground = GROUND_FROM_TERRAIN[`terrain:${name}`];
      expect(ground, `terrain:${name} has no ground`).toBeTruthy();
      expect(isKnownSwatch(ground!), `${name} -> ${ground}`).toBe(true);
    }
    expect(Object.keys(GROUND_FROM_TERRAIN)).toHaveLength(old.length);
  });

  it('keeps water impassable and the road the fast one, which is the point of the table', () => {
    expect(GROUND_FROM_TERRAIN['terrain:water']).toBe(OPEN_WATER);
    expect(GROUND_FROM_TERRAIN['terrain:road']).toBe('material:brick/dressed');
  });

  it('rejects a malformed registry id', () => {
    expect(() => registryId('material', 'Not Valid')).toThrow();
  });
});

describe('no-op edits stay no-ops all the way up', () => {
  it('replaceChunk returns the same world when handed the chunk already there', () => {
    const world = addChunk(emptyWorld(), { cx: 1, cz: 1 });
    const existing = chunkAt(world, { cx: 1, cz: 1 })!;
    expect(replaceChunk(world, existing)).toBe(world);
  });

  it('a height set to its current value changes no object identity', () => {
    const world = addChunk(emptyWorld(), { cx: 1, cz: 1 });
    const chunk = chunkAt(world, { cx: 1, cz: 1 })!;
    expect(replaceChunk(world, setHeight(chunk, 0, 0, 0))).toBe(world);
  });

  it('ignores a chunk for a coordinate that was never authored', () => {
    const world = emptyWorld();
    expect(replaceChunk(world, createChunk({ cx: 2, cz: 2 }))).toBe(world);
  });
});

describe('run-length encoding a dense array (R-59, D-220)', () => {
  it('comes back exactly, however the values fall', () => {
    for (const values of [
      [],
      [7],
      [1, 1, 1, 1],
      [0, 1, 0, 1, 0],
      [3, 3, 9, 9, 9, 0],
      Array.from({ length: 900 }, (_, i) => (i < 800 ? 0 : 4)),
    ]) {
      expect(unpackRuns(packRuns(values), values.length), JSON.stringify(values.slice(0, 6)))
        .toEqual(values);
    }
  });

  it('collapses a stretch of one value to a single pair', () => {
    // The property the whole thing rests on: 900 cells of sea cost two numbers.
    expect(packRuns(Array.from({ length: 900 }, () => 0))).toEqual([900, 0]);
  });

  it('refuses runs that do not add up to what was asked for', () => {
    // A count wrong by one shifts every cell after it, so a world would be
    // silently sheared by a column — which looks like somebody's mistake
    // rather than a corrupt file (R-18).
    expect(unpackRuns([3, 1], 4)).toBeNull();
    expect(unpackRuns([5, 1], 4)).toBeNull();
    expect(unpackRuns([3, 1, 1], 4)).toBeNull();
    expect(unpackRuns([2, 1, 2, 0], 4)).toEqual([1, 1, 0, 0]);
  });

  it('refuses a count it would have to allocate for before noticing', () => {
    // Guarded on the way in rather than after filling: a corrupt stream must
    // not be able to ask for a hundred million entries first.
    expect(unpackRuns([1e9, 0], 10)).toBeNull();
  });

  it('refuses a stream with a count and no value', () => {
    expect(unpackRuns([4], 4)).toBeNull();
  });
});
