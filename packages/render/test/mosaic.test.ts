// The party's card when they travel together (D-314): every face in one card.
// Pure arithmetic, testable where the canvas is not (R-23b).

import { describe, it, expect } from 'vitest';
import { mosaicGrid, mosaicTiles } from '@tt/render';

const W = 256;
const H = 358;

describe('laying out the party mosaic', () => {
  it('stacks two, top and bottom, rather than two slivers side by side', () => {
    expect(mosaicGrid(1)).toEqual({ cols: 1, rows: 1 });
    expect(mosaicGrid(2)).toEqual({ cols: 1, rows: 2 });
  });

  it('takes two columns up to six — most parties', () => {
    expect(mosaicGrid(3)).toEqual({ cols: 2, rows: 2 });
    expect(mosaicGrid(4)).toEqual({ cols: 2, rows: 2 });
    expect(mosaicGrid(5)).toEqual({ cols: 2, rows: 3 });
    expect(mosaicGrid(6)).toEqual({ cols: 2, rows: 3 });
  });

  it('takes three past six, and as square a grid as fits past nine', () => {
    expect(mosaicGrid(7)).toEqual({ cols: 3, rows: 3 });
    expect(mosaicGrid(9)).toEqual({ cols: 3, rows: 3 });
    expect(mosaicGrid(12)).toEqual({ cols: 4, rows: 3 });
  });

  it('places one tile per face, in reading order, inside the card, never overlapping', () => {
    for (const count of [1, 2, 3, 4, 5, 6, 7, 10]) {
      const tiles = mosaicTiles(count, W, H, 6);
      expect(tiles).toHaveLength(count);
      for (const tile of tiles) {
        expect(tile.x).toBeGreaterThanOrEqual(0);
        expect(tile.y).toBeGreaterThanOrEqual(0);
        expect(tile.x + tile.width).toBeLessThanOrEqual(W + 1e-9);
        expect(tile.y + tile.height).toBeLessThanOrEqual(H + 1e-9);
      }
      for (let a = 0; a < tiles.length; a += 1) {
        for (let b = a + 1; b < tiles.length; b += 1) {
          const [p, q] = [tiles[a]!, tiles[b]!];
          const apart = p.x + p.width <= q.x + 1e-9 || q.x + q.width <= p.x + 1e-9
            || p.y + p.height <= q.y + 1e-9 || q.y + q.height <= p.y + 1e-9;
          expect(apart, `${count}: ${a} and ${b}`).toBe(true);
        }
      }
    }
  });

  it('leaves the gap between tiles, and the last cells of a part-full grid empty', () => {
    const [first, second, third] = mosaicTiles(3, W, H, 6);
    expect(second!.x - (first!.x + first!.width)).toBeCloseTo(6);
    // Three in a 2 × 2: the third starts the second row; the fourth cell stays empty.
    expect(third!.x).toBe(0);
    expect(third!.y).toBeCloseTo(first!.height + 6);
  });

  it('is one whole-card tile for a party of one, and nothing for nobody', () => {
    expect(mosaicTiles(1, W, H, 6)).toEqual([{ x: 0, y: 0, width: W, height: H }]);
    expect(mosaicTiles(0, W, H, 6)).toEqual([]);
  });
});
