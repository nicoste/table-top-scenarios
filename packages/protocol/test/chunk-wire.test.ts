// Terrain on the wire (R-59, D-220).
//
// A chunk used to carry 900 copies of strings like `material:grass`, which was
// 126 KiB of a 143 KiB world and went to every screen on every accepted
// intent. The same world packs to 1.6 KiB. What these protect is the part that
// can go wrong quietly: a run stream that is off by one shears the world.

import { describe, it, expect } from 'vitest';
import {
  createCampaign, addChunk, ORIGIN, chunkAt, columnAt, setHeight, paintArea, paintCover,
  replaceChunk, CHUNK_SIZE,
} from '@tt/domain';
import type { CoverId } from '@tt/domain';
import { encodeChunk, decodeChunk, encodeWorld, decodeWorld } from '@tt/protocol';

const campaign = () => createCampaign('Ashfall');

describe('a chunk round trips', () => {
  it('brings back every column exactly', () => {
    const world = campaign().world;
    let chunk = chunkAt(world, ORIGIN)!;
    chunk = setHeight(chunk, 4, 6, 7);
    chunk = setHeight(chunk, 0, 0, 3);
    chunk = setHeight(chunk, CHUNK_SIZE - 1, CHUNK_SIZE - 1, 11);
    const back = decodeChunk(encodeChunk(chunk));
    for (let z = 0; z < CHUNK_SIZE; z += 1) {
      for (let x = 0; x < CHUNK_SIZE; x += 1) {
        const was = columnAt(chunk, x, z)!;
        const now = columnAt(back, x, z)!;
        expect(now.height, `${x},${z}`).toBe(was.height);
        expect(now.ground, `${x},${z}`).toBe(was.ground);
      }
    }
  });

  it('keeps the grid square, which is the failure that shears a world', () => {
    // The corners specifically: a run off by one puts every cell after it a
    // column to the left, and the map looks subtly wrong rather than broken.
    const chunk = setHeight(chunkAt(campaign().world, ORIGIN)!, CHUNK_SIZE - 1, 0, 9);
    const back = decodeChunk(encodeChunk(chunk));
    expect(columnAt(back, CHUNK_SIZE - 1, 0)?.height).toBe(9);
    expect(columnAt(back, 0, CHUNK_SIZE - 1)?.height).toBe(0);
  });

  it('carries several grounds through the palette', () => {
    const world = campaign().world;
    const at = { gx: ORIGIN.cx * CHUNK_SIZE + 3, gz: ORIGIN.cz * CHUNK_SIZE + 3 };
    const painted = chunkAt(paintArea(world, at, 3, 'material:grass' as never), ORIGIN)!;
    const back = decodeChunk(encodeChunk(painted));
    expect(columnAt(back, 3, 3)?.ground).toBe('material:grass');
    expect(columnAt(back, 20, 20)?.ground).toBe(columnAt(painted, 20, 20)?.ground);
  });

  it('is dramatically smaller than one entry per cell, which is the point', () => {
    const chunk = chunkAt(campaign().world, ORIGIN)!;
    const packed = JSON.stringify(encodeChunk(chunk)).length;
    const perCell = JSON.stringify({
      heights: chunk.columns.map((c) => c.height),
      terrain: chunk.columns.map((c) => c.ground),
    }).length;
    expect(packed).toBeLessThan(perCell / 10);
  });

  it('still reads a chunk written before packing (R-137a)', () => {
    // The migration. A world with plain arrays and no runs is read as it is.
    const old = {
      cx: ORIGIN.cx,
      cz: ORIGIN.cz,
      size: CHUNK_SIZE,
      heights: Array.from({ length: CHUNK_SIZE * CHUNK_SIZE }, (_, i) => (i === 5 ? 4 : 0)),
      terrain: Array.from({ length: CHUNK_SIZE * CHUNK_SIZE }, () => 'material:liquid'),
    };
    const back = decodeChunk(old as never);
    expect(columnAt(back, 5, 0)?.height).toBe(4);
    expect(columnAt(back, 6, 0)?.ground).toBe('material:liquid');
  });

  it('reads an unreadable chunk as sea rather than losing the campaign', () => {
    /*
     * Deliberately unlike a map body, which refuses (R-59). A body drawn one
     * cube askew is indistinguishable from the GM's own mistake, so refusing
     * is the honest answer. Terrain has a value in every cell by definition,
     * so a corrupt chunk has an obvious floor — sea — and one bad chunk should
     * not cost a campaign that may hold twenty good ones.
     */
    const good = encodeChunk(chunkAt(campaign().world, ORIGIN)!);
    const broken = { ...good, heightRuns: [...good.heightRuns!.slice(0, -1)] };
    const back = decodeChunk(broken);
    expect(back.columns).toHaveLength(CHUNK_SIZE * CHUNK_SIZE);
    expect(columnAt(back, 0, 0)?.height).toBe(0);
  });
});

describe('a chunk is packed once per version of it (R-165, D-220)', () => {
  it('hands back the same wire object for the same chunk', () => {
    const chunk = chunkAt(campaign().world, ORIGIN)!;
    expect(encodeChunk(chunk)).toBe(encodeChunk(chunk));
  });

  it('leaves untouched chunks alone when one is painted', () => {
    // The same property the maps have: editing one thing must not cost
    // anything for the rest.
    const base = campaign();
    const world = addChunk(base.world, { cx: ORIGIN.cx + 1, cz: ORIGIN.cz });
    const first = encodeWorld(world);
    const edited = replaceChunk(world, setHeight(chunkAt(world, ORIGIN)!, 2, 2, 6));
    const second = encodeWorld(edited);

    const at = (w: typeof first, cx: number) => w.chunks.find((c) => c.cx === cx)!;
    expect(at(second, ORIGIN.cx)).not.toBe(at(first, ORIGIN.cx));
    expect(at(second, ORIGIN.cx + 1)).toBe(at(first, ORIGIN.cx + 1));
  });

  it('never serves the old ground after an edit', () => {
    const base = campaign();
    const raised = replaceChunk(base.world, setHeight(chunkAt(base.world, ORIGIN)!, 1, 1, 8));
    expect(columnAt(chunkAt(decodeWorld(encodeWorld(raised)), ORIGIN)!, 1, 1)?.height).toBe(8);
    expect(columnAt(chunkAt(decodeWorld(encodeWorld(base.world)), ORIGIN)!, 1, 1)?.height).toBe(0);
  });
});

describe('what stands on a cell travels with it (R-193)', () => {
  const TREES = 'cover:trees' as CoverId;
  const PINES = 'cover:pines' as CoverId;

  it('says nothing at all about a chunk with nothing growing on it', () => {
    // The absence is the message (D-187). A bare world would otherwise send
    // 900 empty strings per chunk to say "no trees here".
    const wire = encodeChunk(chunkAt(campaign().world, ORIGIN)!);
    expect(wire.coverPalette).toBeUndefined();
    expect(wire.coverRuns).toBeUndefined();
  });

  it('brings back every cover, and every bare cell as bare', () => {
    let chunk = chunkAt(campaign().world, ORIGIN)!;
    chunk = paintCover(chunk, 3, 3, TREES);
    chunk = paintCover(chunk, 4, 3, TREES);
    chunk = paintCover(chunk, 9, 9, PINES);
    const back = decodeChunk(encodeChunk(chunk));
    expect(columnAt(back, 3, 3)?.cover).toBe(TREES);
    expect(columnAt(back, 4, 3)?.cover).toBe(TREES);
    expect(columnAt(back, 9, 9)?.cover).toBe(PINES);
    // Not `undefined` by accident: the key must be absent, so a bare cell is
    // one shape wherever it came from.
    expect('cover' in columnAt(back, 0, 0)!).toBe(false);
  });

  it('packs a forest into runs rather than a cover per cell', () => {
    let chunk = chunkAt(campaign().world, ORIGIN)!;
    for (let x = 0; x < CHUNK_SIZE; x += 1) chunk = paintCover(chunk, x, 0, TREES);
    const wire = encodeChunk(chunk);
    // One run of trees and one of bare, as pairs: far short of 900 entries.
    expect(wire.coverRuns!.length).toBeLessThan(10);
    expect(wire.coverPalette).toEqual(['', 'cover:trees']);
  });

  it('reads a chunk written before covers existed', () => {
    // Which is every chunk on disk right now (R-137a).
    const wire = encodeChunk(chunkAt(campaign().world, ORIGIN)!);
    const back = decodeChunk({ ...wire, coverPalette: undefined, coverRuns: undefined });
    expect(back.columns.every((c) => c.cover === undefined)).toBe(true);
  });

  it('drops a cover id it cannot read rather than losing the column', () => {
    const wire = encodeChunk(paintCover(chunkAt(campaign().world, ORIGIN)!, 2, 2, TREES));
    const back = decodeChunk({ ...wire, coverPalette: ['', 'not an id'] });
    expect(columnAt(back, 2, 2)?.cover).toBeUndefined();
    expect(columnAt(back, 2, 2)?.ground).toBe('material:liquid');
  });
});
