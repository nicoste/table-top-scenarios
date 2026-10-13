// The route across the world (R-52, R-52a, R-133).
//
// The first thing that has ever read the difficulty model, so these are as
// much a test of the numbers as of the search: a jungle really is slower than
// a meadow, a mountain really is worth going around, and water really does
// need a boat.

import { describe, it, expect } from 'vitest';
import {
  createCampaign, ORIGIN, chunkAt, replaceChunk, paintGround, paintCover, setHeight,
  emptyDiscovery, setChunkKnown, DEFAULT_TRAVEL_MODES,
  DEFAULT_METRES_PER_CELL, toGlobal, routeAcross, daysAcross,
} from '@tt/domain';
import type { Chunk, CoverId, Discovery, SwatchId, TravelMode, World } from '@tt/domain';

const GRASS = 'material:grass' as SwatchId;
const ROCK = 'material:mineral' as SwatchId;
const WATER = 'material:liquid' as SwatchId;
const ROAD = 'material:brick/dressed' as SwatchId;
const TREES = 'cover:trees' as CoverId;
const DARK_LEAVES = 'material:vegetation/dark' as SwatchId;

const mode = (id: string): TravelMode => {
  const found = DEFAULT_TRAVEL_MODES.find((m) => m.id === `travel:${id}`);
  if (!found) throw new Error(`no such mode: ${id}`);
  return found;
};
const foot = mode('foot');
const ship = mode('ship');

/** One known chunk of grassland, which is the reference ground at ×1. */
function grassland(): { world: World; discovery: Discovery } {
  const campaign = createCampaign('Ashfall');
  let chunk = chunkAt(campaign.world, ORIGIN)!;
  for (let z = 0; z < 30; z += 1) for (let x = 0; x < 30; x += 1) chunk = paintGround(chunk, x, z, GRASS);
  return {
    world: replaceChunk(campaign.world, chunk),
    discovery: setChunkKnown(emptyDiscovery(), ORIGIN, true),
  };
}

const put = (world: World, chunk: Chunk): World => replaceChunk(world, chunk);
const only = (world: World): Chunk => chunkAt(world, ORIGIN)!;
const cell = (x: number, z: number) => toGlobal(ORIGIN, x, z);

describe('a route reads the difficulty nobody was reading (R-52)', () => {
  it('crosses open grassland at one cell per cell', () => {
    const { world, discovery } = grassland();
    const route = routeAcross(world, discovery, foot, cell(2, 2), cell(7, 2))!;
    expect(route).not.toBeNull();
    expect(route.cells).toHaveLength(6);
    // Five steps of reference ground, flat: the number every other difficulty
    // in the registry is normalised against.
    expect(route.cost).toBeCloseTo(5, 6);
  });

  it('counts a diagonal as a diagonal, not as a step', () => {
    const { world, discovery } = grassland();
    const route = routeAcross(world, discovery, foot, cell(2, 2), cell(5, 5))!;
    expect(route.cells).toHaveLength(4);
    expect(route.cost).toBeCloseTo(3 * Math.SQRT2, 6);
  });

  it('prefers the road, because laid stone is the one ground faster than grass', () => {
    const { world: grass, discovery } = grassland();
    let chunk = only(grass);
    // A road running the long way round: 0.75 a cell against grass at 1.
    for (let x = 2; x <= 12; x += 1) chunk = paintGround(chunk, x, 6, ROAD);
    const world = put(grass, chunk);
    const straight = routeAcross(grass, discovery, foot, cell(2, 6), cell(12, 6))!;
    const paved = routeAcross(world, discovery, foot, cell(2, 6), cell(12, 6))!;
    expect(paved.cost).toBeLessThan(straight.cost);
    expect(paved.cost).toBeCloseTo(10 * 0.75, 6);
  });

  it('weighs a wood against the detour round it, and the sums are tight (R-193)', () => {
    /*
     * Stepping aside one cell and back is two diagonals where it would have
     * been two orthogonals: 2√2 against 1 + d, so a cell is worth avoiding
     * only once it costs more than **1.83**. That is a narrower margin than
     * it looks, and it is why the first two versions of this test were wrong
     * about what the cheapest route is.
     */
    const { world: bare, discovery } = grassland();
    // One cell on the direct line, with open grass either side of it, so
    // there genuinely is a detour to choose. Painting the whole row — which
    // is what the version before this did — leaves nothing to step aside to
    // and the route crosses whatever it costs.
    const blocked = (ground: SwatchId | null, cover: CoverId | null): World => {
      let chunk = only(bare);
      if (ground) chunk = paintGround(chunk, 6, 5, ground);
      if (cover) chunk = paintCover(chunk, 6, 5, cover);
      return put(bare, chunk);
    };
    const crosses = (world: World) => routeAcross(world, discovery, foot, cell(6, 3), cell(6, 7))!
      .cells.some((c) => c.gz === cell(0, 5).gz && c.gx === cell(6, 0).gx);

    // Trees over grass: ×1.5, so the crossing costs 2.5 against the detour's
    // 2.83. It walks through the wood, and it is right to.
    expect(crosses(blocked(null, TREES))).toBe(true);
    // Dark undergrowth: ×2.5, so the crossing costs 3.5 and the detour wins.
    expect(crosses(blocked(DARK_LEAVES, null))).toBe(false);

    // Either way a wood costs more than open ground, which is the whole
    // reason any of these numbers exist.
    const open = routeAcross(bare, discovery, foot, cell(6, 3), cell(6, 7))!;
    expect(routeAcross(blocked(null, TREES), discovery, foot, cell(6, 3), cell(6, 7))!.cost)
      .toBeGreaterThan(open.cost);
  });
});

describe('altitude is free and slope is not (R-52a)', () => {
  it('prefers the ramp to the cliff, which is the whole of D-296', () => {
    /*
     * The bug the GM found: the old cost was linear in *total* ascent, so a
     * sheer face and a gentle ramp of the same height cost the same — and
     * whenever the face was shorter it was strictly cheaper. Measured before
     * the fix, these two came to 18.30 and 18.30 exactly.
     *
     * Two separate worlds, not two rows of one, so neither journey can borrow
     * the other's slope: the first version of this test let the "cliff" route
     * detour to the ramp and compared a thing to itself.
     */
    const wall = (shape: (x: number) => number): World => {
      const { world } = grassland();
      let chunk = only(world);
      for (let z = 0; z < 30; z += 1) {
        for (let x = 6; x <= 15; x += 1) chunk = setHeight(chunk, x, z, shape(x));
      }
      return put(world, chunk);
    };
    const { discovery } = grassland();
    const cliff = routeAcross(wall(() => 10), discovery, foot, cell(5, 2), cell(15, 2))!;
    const ramp = routeAcross(wall((x) => x - 5), discovery, foot, cell(5, 2), cell(15, 2))!;

    // Ten levels gained either way, over the same ten cells.
    expect(ramp.cost).toBeLessThan(cliff.cost);
    // Not marginally, and not by the thirty-fold a head-on 45° step would
    // suggest: the cliff route halves its own gradient by taking the face at
    // an angle, which is the next test.
    expect(cliff.cost / ramp.cost).toBeGreaterThan(1.5);
  });

  it('takes a steep face at an angle, which nobody told it to do', () => {
    /*
     * Emergent, and worth pinning because it is the model being right rather
     * than the code being clever: a diagonal covers √2 cells of ground for
     * the same rise, so it is a gentler gradient and costs less. The router
     * traverses a cliff instead of going at it head-on — a switchback,
     * arrived at from `grade = rise / run` and nothing else.
     */
    const { world, discovery } = grassland();
    let chunk = only(world);
    for (let z = 0; z < 30; z += 1) for (let x = 6; x <= 15; x += 1) chunk = setHeight(chunk, x, z, 10);
    const face = put(world, chunk);
    const route = routeAcross(face, discovery, foot, cell(5, 2), cell(15, 2))!;
    // The step onto the face moves in z as well as x: it is not straight on.
    const onto = route.cells[1]!;
    expect(onto.gx).toBe(cell(6, 0).gx);
    expect(onto.gz).not.toBe(cell(0, 2).gz);
  });

  it('walks round a sheer face to reach a summit by its steps', () => {
    // The GM's own words: "the travel recommends to do a huge climb instead
    // to go over the mountain steps".
    const { world: flat, discovery } = grassland();
    let chunk = only(flat);
    // A plateau at ten, met by a cliff everywhere except a staircase at z=8.
    for (let z = 0; z < 30; z += 1) for (let x = 12; x < 30; x += 1) chunk = setHeight(chunk, x, z, 10);
    for (let x = 2; x <= 11; x += 1) chunk = setHeight(chunk, x, 8, x - 1);
    const world = put(flat, chunk);
    const route = routeAcross(world, discovery, foot, cell(2, 2), cell(14, 2))!;
    // It detours to the staircase rather than taking the face head-on.
    expect(route.cells.some((c) => c.gz === cell(0, 8).gz)).toBe(true);
  });

  it('leaves a plateau alone, because being high costs nothing', () => {
    const { world: flat, discovery } = grassland();
    let chunk = only(flat);
    for (let x = 0; x < 30; x += 1) for (let z = 0; z < 30; z += 1) chunk = setHeight(chunk, x, z, 9);
    const high = put(flat, chunk);
    const low = routeAcross(flat, discovery, foot, cell(2, 2), cell(9, 2))!;
    const plateau = routeAcross(high, discovery, foot, cell(2, 2), cell(9, 2))!;
    expect(plateau.cost).toBeCloseTo(low.cost, 6);
  });

  it('walks round a mountain when going over it costs more', () => {
    const { world: flat, discovery } = grassland();
    let chunk = only(flat);
    for (let z = 4; z <= 6; z += 1) {
      chunk = setHeight(chunk, 5, z, 20);
      chunk = paintGround(chunk, 5, z, ROCK);
    }
    const world = put(flat, chunk);
    const route = routeAcross(world, discovery, foot, cell(5, 3), cell(5, 7))!;
    expect(route.cells.some((c) => c.gx === cell(5, 5).gx && c.gz === cell(5, 5).gz)).toBe(false);
  });
});

describe('a diagonal crosses a corner, and that is the decision (D-294)', () => {
  it('passes between two impassable cells that meet at a point', () => {
    /*
     * Deliberate, and the reason is about **how water is drawn**, not about
     * pathfinding: a river is painted as an orthogonal zig-zag, because a
     * diagonal chain of 1.5 km cells does not read as a river — it reads as a
     * dotted line. So the squeeze needs a shape nobody paints, and guarding
     * it would cost a check on every diagonal step of every search to forbid
     * a case the map cannot honestly show (D-294).
     *
     * Here so that it is a decision in the record rather than an oversight
     * somebody later corrects.
     */
    const { world: land, discovery } = grassland();
    let chunk = only(land);
    chunk = paintGround(chunk, 5, 4, WATER);
    chunk = paintGround(chunk, 4, 5, WATER);
    const world = put(land, chunk);
    const route = routeAcross(world, discovery, foot, cell(4, 4), cell(5, 5))!;
    expect(route.cells).toEqual([cell(4, 4), cell(5, 5)]);
    expect(route.cost).toBeCloseTo(Math.SQRT2, 6);
  });

  it('still cannot enter the water itself', () => {
    // The corner is a gap between cells; the cells are as impassable as ever.
    const { world: land, discovery } = grassland();
    let chunk = only(land);
    for (let x = 0; x < 30; x += 1) chunk = paintGround(chunk, x, 5, WATER);
    const world = put(land, chunk);
    expect(routeAcross(world, discovery, foot, cell(5, 3), cell(5, 5))).toBeNull();
  });
});

describe('what a route will not do', () => {
  it('refuses to cross water on foot, and sails it by ship', () => {
    const { world: land, discovery } = grassland();
    let chunk = only(land);
    for (let x = 0; x < 30; x += 1) chunk = paintGround(chunk, x, 5, WATER);
    const world = put(land, chunk);
    expect(routeAcross(world, discovery, foot, cell(5, 3), cell(5, 7))).toBeNull();
    // And the ship cannot come ashore, which is the other half of R-83a.
    expect(routeAcross(world, discovery, ship, cell(5, 3), cell(5, 7))).toBeNull();
    expect(routeAcross(world, discovery, ship, cell(2, 5), cell(20, 5))).not.toBeNull();
  });

  it('will not route through ground the party has never seen (R-133)', () => {
    // The rule that keeps a drawn line from teaching the shape of the land.
    const { world } = grassland();
    const unknown = emptyDiscovery();
    expect(routeAcross(world, unknown, foot, cell(2, 2), cell(7, 2))).toBeNull();
  });

  it('gives up rather than searching the world, and says so by saying nothing', () => {
    const { world, discovery } = grassland();
    // A budget of two settles almost nothing, which is the ceiling behaving.
    expect(routeAcross(world, discovery, foot, cell(2, 2), cell(28, 28), 2)).toBeNull();
  });

  it('answers a journey of no distance with the cell itself', () => {
    const { world, discovery } = grassland();
    const route = routeAcross(world, discovery, foot, cell(4, 4), cell(4, 4))!;
    expect(route.cells).toEqual([cell(4, 4)]);
    expect(route.cost).toBe(0);
  });
});

describe('cost becomes days where the two scales meet', () => {
  it('turns ten cells of grassland into the distance it is', () => {
    const { world, discovery } = grassland();
    const route = routeAcross(world, discovery, foot, cell(2, 2), cell(12, 2))!;
    // Ten cells at 1.5 km, against 39 km a day on foot.
    const days = daysAcross(route, foot, DEFAULT_METRES_PER_CELL);
    expect(days).toBeCloseTo(15 / foot.kmPerDay, 6);
    expect(days).toBeLessThan(0.5);
  });

  it('makes the forced march faster than the cautious one over the same ground', () => {
    const { world, discovery } = grassland();
    const route = routeAcross(world, discovery, foot, cell(2, 2), cell(20, 2))!;
    expect(daysAcross(route, mode('forced'), DEFAULT_METRES_PER_CELL))
      .toBeLessThan(daysAcross(route, mode('cautious'), DEFAULT_METRES_PER_CELL));
  });
});
