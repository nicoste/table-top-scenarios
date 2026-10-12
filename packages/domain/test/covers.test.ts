// The world's second axis (R-193, D-280): what stands on a cell, and what it
// costs to get through.
//
// The registry is data and the arithmetic is four lines, which is exactly the
// shape that goes wrong silently: a cover naming a swatch nobody registered
// draws nothing and says nothing, and a multiply that forgets `impassable`
// lets a party row a forest.

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_COVERS, DEFAULT_TRAVEL_MODES,
  coverById, isKnownCover, overCover, cellCost, isKnownSwatch, clumpsIn,
  createChunk, columnAt, paintCover, paintGround, emptyWorld, addChunk, chunkAt, coverArea,
  toGlobal, CHUNK_SIZE,
} from '@tt/domain';
import type { Column, CoverId, SwatchId, TravelMode } from '@tt/domain';

const TREES = 'cover:trees' as CoverId;
const mode = (id: string): TravelMode => {
  const found = DEFAULT_TRAVEL_MODES.find((m) => m.id === `travel:${id}`);
  if (!found) throw new Error(`no such mode: ${id}`);
  return found;
};
const foot = mode('foot');

describe('the cover registry (R-193, R-11)', () => {
  it('addresses entries by namespaced string id, never by index', () => {
    for (const cover of DEFAULT_COVERS) {
      expect(cover.id).toMatch(/^cover:[a-z0-9-]+$/);
      expect(isKnownCover(cover.id)).toBe(true);
    }
    expect(new Set(DEFAULT_COVERS.map((c) => c.id)).size).toBe(DEFAULT_COVERS.length);
  });

  it('rejects a cover nobody registered', () => {
    expect(isKnownCover('cover:beanstalk' as CoverId)).toBe(false);
    expect(coverById(DEFAULT_COVERS, 'cover:beanstalk' as CoverId)).toBeNull();
  });

  it('builds every part out of a swatch the materials registry knows (R-194)', () => {
    // The silent one. A typo here draws nothing at all — no colour to be
    // obviously wrong in, just a tree with no canopy and nobody told.
    for (const cover of DEFAULT_COVERS) {
      expect(cover.parts.length, `${cover.name} has no parts`).toBeGreaterThan(0);
      for (const part of cover.parts) {
        expect(isKnownSwatch(part.swatch), `${cover.name}: ${part.swatch}`).toBe(true);
      }
    }
  });

  it('makes every cover cost something, because that is what earns the id (R-195)', () => {
    // A cover at exactly 1 is scenery, and scenery does not get a permanent
    // id: what a cell *looks* like is the ground's job already. Several
    // covers may share a cost — a pine, an oak and a palm are one price and
    // three climates — but none of them may be free.
    for (const cover of DEFAULT_COVERS) {
      expect(Number.isFinite(cover.difficulty), cover.name).toBe(true);
      expect(cover.difficulty, cover.name).toBeGreaterThan(1);
    }
  });

  it('lets covers share a cost, which is how look and cost stay separate', () => {
    // The evidence that R-195 is about earning an id and not about being
    // unique: the wooded ones are all one price.
    const wooded = ['Trees', 'Pines', 'Palms', 'Dead trees']
      .map((name) => DEFAULT_COVERS.find((c) => c.name === name)!);
    expect(wooded.every((c) => c?.difficulty === 1.5)).toBe(true);
  });

  it('is two of a thing, never one (R-194)', () => {
    // One object alone in a cell reads as a specimen; two read as cover, and
    // two that wander apart read as different cells (D-285).
    for (const cover of DEFAULT_COVERS) {
      expect(clumpsIn(cover), cover.name).toBe(2);
    }
  });

  it('numbers its clumps from zero with no gaps, since the renderer indexes them', () => {
    for (const cover of DEFAULT_COVERS) {
      const used = new Set(cover.parts.map((part) => part.clump));
      expect([...used].sort(), cover.name).toEqual(
        Array.from({ length: clumpsIn(cover) }, (_unused, i) => i),
      );
    }
  });

  it('keeps every clump inside its own cell, wander and all', () => {
    /*
     * The one thing a cover has to say is *which cell this is*, and a crown
     * that laps over the edge makes that a lie. Half a cell is the limit; the
     * renderer's wander and its fifth of extra scale are priced in here
     * rather than left to be noticed on screen.
     */
    const WANDER = 0.075;
    const BIGGEST = 1.2;
    for (const cover of DEFAULT_COVERS) {
      for (const part of cover.parts) {
        /*
         * The bounding *circle*, not the extent along each axis. A part may
         * be turned about its own axis — a palm's fronds are — and a plank
         * 0.26 long and 0.07 wide swings its length into z at sixty degrees.
         * Measuring per axis would have passed that and let a frond lap into
         * the cell next door.
         */
        const reach = part.shape === 'box'
          ? Math.hypot(part.size[0] / 2, part.size[2] / 2)
          : Math.max(part.size[0], part.size[2]);
        const from = Math.hypot(part.at[0], part.at[2]);
        const edge = (from + reach) * BIGGEST + WANDER;
        expect(edge, `${cover.name} ${part.shape}`).toBeLessThan(0.5);
      }
    }
  });

  it('tells the wooded covers apart by shape, not by colour (D-286)', () => {
    // Four covers at one price, so the silhouette is the only thing carrying
    // the difference: stacked boxes, a cone, a helix of planks, and a trunk
    // with nothing on top at all.
    const of = (id: string) => coverById(DEFAULT_COVERS, id as CoverId)!;
    /*
     * Shape *and* size. Shape alone is too crude a proxy and said so: a dead
     * tree's two limbs are a cylinder and two boxes, and so is a broadleaf's
     * trunk and crown. What separates them is that one pair of boxes is wide
     * and the other is a pair of sticks.
     */
    const silhouette = (id: string) => of(id).parts
      .map((part) => `${part.shape}:${part.size.map((n) => n.toFixed(2)).join('x')}`)
      .join(',');

    expect(of(TREES).parts.some((part) => part.shape === 'cone')).toBe(false);
    expect(of('cover:pines').parts.filter((part) => part.shape === 'cone').length).toBe(2);
    // The palm's fronds are turned and the dead tree's limbs are, which is
    // the whole of what `turn` buys.
    expect(of('cover:palms').parts.filter((part) => part.turn).length).toBe(4);
    expect(of('cover:deadwood').parts.every((part) => part.shape !== 'cone')).toBe(true);

    const wooded = ['cover:trees', 'cover:pines', 'cover:palms', 'cover:deadwood'];
    expect(new Set(wooded.map(silhouette)).size, 'two wooded covers share a silhouette')
      .toBe(wooded.length);
  });

  it('stands everything at or above the ground it is planted on', () => {
    // A part sunk below y=0 would be buried in the column it stands on, which
    // on a world seen from above means invisible.
    for (const cover of DEFAULT_COVERS) {
      for (const part of cover.parts) {
        expect(part.at[1] - part.size[1] / 2, `${cover.name}`).toBeGreaterThanOrEqual(-0.01);
      }
    }
  });
});

describe('a cover multiplies the ground, and never rescues it (R-193)', () => {
  it('turns grass into a forest by arithmetic rather than by a new entry', () => {
    const trees = coverById(DEFAULT_COVERS, TREES)!;
    expect(overCover(1, trees)).toBe(1.5);
    // Sand at 1.5 with the same trees. Sixty-five combinations, no table.
    expect(overCover(1.5, trees)).toBe(2.25);
  });

  it('leaves bare ground exactly as it was', () => {
    expect(overCover(1, null)).toBe(1);
    expect(overCover('impassable', null)).toBe('impassable');
  });

  it('keeps impassable impassable whatever is growing in it', () => {
    // The rule that makes an island need a boat however it is planted.
    for (const cover of DEFAULT_COVERS) {
      expect(overCover('impassable', cover), cover.name).toBe('impassable');
    }
  });
});

describe('what one cell costs, across both axes', () => {
  const cell = (ground: string, cover?: string, difficulty?: number): Column => ({
    height: 0,
    ground: ground as SwatchId,
    ...(cover ? { cover: cover as CoverId } : {}),
    ...(difficulty !== undefined ? { difficulty } : {}),
  });

  it('reads the ground when nothing stands on it', () => {
    expect(cellCost(foot, cell('material:grass'))).toBe(1);
  });

  it('multiplies by what does', () => {
    expect(cellCost(foot, cell('material:grass', 'cover:trees'))).toBe(1.5);
    expect(cellCost(foot, cell('material:soil/sand', 'cover:trees'))).toBe(2.25);
    expect(cellCost(foot, cell('material:grass', 'cover:scrub'))).toBe(1.25);
  });

  it('lets the cell override win outright, and does not multiply it', () => {
    // A GM who writes a number on a cell has said what crossing it costs. A
    // road through a wood is the case, and 0.75 x 1.5 would be arguing.
    expect(cellCost(foot, cell('material:grass', 'cover:trees', 0.75))).toBe(0.75);
  });

  it('still cannot be waded, whatever is growing in the water', () => {
    expect(cellCost(foot, cell('material:liquid', 'cover:scrub'))).toBe('impassable');
  });

  it('ignores a cover the registry has forgotten rather than throwing', () => {
    // A world written by a newer build should lose its scenery, not its ground.
    expect(cellCost(foot, cell('material:grass', 'cover:beanstalk'))).toBe(1);
  });
});

describe('painting the two axes independently (R-193)', () => {
  it('plants a cover without disturbing the ground', () => {
    let chunk = paintGround(createChunk({ cx: 0, cz: 0 }), 4, 4, 'material:grass' as SwatchId);
    chunk = paintCover(chunk, 4, 4, TREES);
    expect(columnAt(chunk, 4, 4)).toEqual({
      height: 0, ground: 'material:grass', cover: TREES,
    });
  });

  it('repaints the ground without uprooting what stands on it', () => {
    let chunk = paintCover(createChunk({ cx: 0, cz: 0 }), 4, 4, TREES);
    chunk = paintGround(chunk, 4, 4, 'material:soil/snow' as SwatchId);
    // Snow with pines is a taiga; snow with trees is this. Neither is an entry.
    expect(columnAt(chunk, 4, 4)?.cover).toBe(TREES);
    expect(columnAt(chunk, 4, 4)?.ground).toBe('material:soil/snow');
  });

  it('clears a cell by deleting the key, not by storing a null', () => {
    // One shape for a bare cell however it got that way, so the wire and
    // every comparison see the same thing (R-137a).
    let chunk = paintCover(createChunk({ cx: 0, cz: 0 }), 4, 4, TREES);
    chunk = paintCover(chunk, 4, 4, null);
    expect(columnAt(chunk, 4, 4)).toEqual({ height: 0, ground: 'material:liquid' });
    expect('cover' in columnAt(chunk, 4, 4)!).toBe(false);
  });

  it('preserves identity when nothing changed (R-165)', () => {
    const bare = createChunk({ cx: 0, cz: 0 });
    expect(paintCover(bare, 4, 4, null)).toBe(bare);
    const planted = paintCover(bare, 4, 4, TREES);
    expect(paintCover(planted, 4, 4, TREES)).toBe(planted);
  });

  it('spreads across chunk boundaries like every other brush (R-88b)', () => {
    let world = addChunk(emptyWorld(), { cx: 5, cz: 5 });
    world = addChunk(world, { cx: 6, cz: 5 });
    const at = toGlobal({ cx: 5, cz: 5 }, CHUNK_SIZE - 1, 10);
    const planted = coverArea(world, at, 3, TREES);
    expect(columnAt(chunkAt(planted, { cx: 5, cz: 5 })!, CHUNK_SIZE - 1, 10)?.cover).toBe(TREES);
    expect(columnAt(chunkAt(planted, { cx: 6, cz: 5 })!, 0, 10)?.cover).toBe(TREES);
  });
});
