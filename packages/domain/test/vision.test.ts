// What the party sees in a map (R-15, R-40 to R-46, D-271), each claim a test
// that fails if the claim does (R-22).
//
// The maps here are a floor of stone at y 0, so a member stands at y 1 with an
// eye at 2.2 — 1.2 above the floor of their cube (R-43).

import { describe, it, expect } from 'vitest';
import { lineIsClear } from '@tt/geometry';
import type { BlockCoord, EncounterMap, MaterialId, MemberId, PartyMember, SwatchId } from '@tt/domain';
import {
  blockKey, swatchOf, setBlock, DEFAULT_VISION_RANGE,
  EYE_HEIGHT, EYE_UNDER_CEILING, NO_CELLS, eyeOf, memberSight, partySight, explore, shownBy, seenPart,
  cellsToJSON, cellsFromJSON,
  createCampaign, createLiveSave, withExplored, withTokens, exploredIn, tokensFor, forgetMap,
} from '@tt/domain';

const STONE = swatchOf('material:mineral' as MaterialId);
const GLASS = swatchOf('material:glass' as MaterialId);
const WATER = swatchOf('material:liquid' as MaterialId);

const key = (x: number, y: number, z: number) => blockKey({ x, y, z });

/** A floor of stone `size` across at y 0, and whatever else is listed. */
function field(extra: readonly [BlockCoord, SwatchId][] = [], size = 24): EncounterMap {
  const blocks = new Map<string, SwatchId>();
  for (let x = 0; x < size; x += 1) for (let z = 0; z < size; z += 1) blocks.set(key(x, 0, z), STONE);
  for (const [at, swatch] of extra) blocks.set(blockKey(at), swatch);
  return { origin: { x: 0, z: 0 }, size: { x: size, z: size }, blocks, planes: [] };
}

/** A wall along x = `at`, `high` cubes tall, the whole width of the field. */
function wall(at: number, high: number, swatch: SwatchId = STONE, size = 24): [BlockCoord, SwatchId][] {
  const out: [BlockCoord, SwatchId][] = [];
  for (let y = 1; y <= high; y += 1) for (let z = 0; z < size; z += 1) out.push([{ x: at, y, z }, swatch]);
  return out;
}

const member = (id: string, visionRange = DEFAULT_VISION_RANGE): PartyMember => ({
  id: id as MemberId, name: id, colour: '#ffffff', visionRange,
});

describe('one eye height, and the rule of thumb it buys (R-43)', () => {
  it('puts the eye 1.2 cubes above the floor of the token\'s cube', () => {
    expect(eyeOf(field(), { x: 3, y: 1, z: 10 })).toEqual({ x: 3.5, y: 1 + EYE_HEIGHT, z: 10.5 });
  });

  it('sees over a one-cube wall: the space beyond it, and the floor there', () => {
    const map = field(wall(4, 1));
    const seen = memberSight(map, { x: 3, y: 1, z: 10 }, 12);
    // Standing right against the wall, every cube beyond it on this row.
    for (let x = 5; x <= 12; x += 1) expect(seen.has(key(x, 1, 10)), `x ${x}`).toBe(true);
    // And so the floor under them is shown (D-271).
    const shown = shownBy(map, seen);
    for (let x = 5; x <= 12; x += 1) expect(shown.has(key(x, 0, 10)), `floor ${x}`).toBe(true);
  });

  it('is blocked by a two-cube wall: nothing beyond it is seen', () => {
    const map = field(wall(4, 2));
    const seen = memberSight(map, { x: 3, y: 1, z: 10 }, 12);
    expect([...seen].filter((cell) => Number(cell.split(',')[0]) >= 5)).toEqual([]);
  });

  it('buys one more cube of wall for each cube of elevation', () => {
    // A raised floor on both sides of a two-cube wall: standing on it, the wall
    // is chest-high again.
    const raised: [BlockCoord, SwatchId][] = [];
    for (let x = 0; x < 24; x += 1) for (let z = 0; z < 24; z += 1) raised.push([{ x, y: 1, z }, STONE]);
    const twoHigh = field([...raised, ...wall(4, 2)]);
    const seen = memberSight(twoHigh, { x: 3, y: 2, z: 10 }, 12);
    for (let x = 5; x <= 12; x += 1) expect(seen.has(key(x, 2, 10)), `x ${x}`).toBe(true);

    const threeHigh = field([...raised, ...wall(4, 3)]);
    const blocked = memberSight(threeHigh, { x: 3, y: 2, z: 10 }, 12);
    expect([...blocked].filter((cell) => Number(cell.split(',')[0]) >= 5)).toEqual([]);
  });
});

describe('the eye height ratio (R-43a)', () => {
  it('stays strictly between one and two cubes', () => {
    // At one or below, a one-cube wall blocks; at two or above, a two-cube
    // wall stops blocking. Either end breaks the rule above.
    expect(EYE_HEIGHT).toBeGreaterThan(1);
    expect(EYE_HEIGHT).toBeLessThan(2);
  });
});

describe('the eye under a ceiling one cube up (D-272)', () => {
  // A passage one cube high: a roof over x 0 to 23, z 9 to 11, and walls of
  // two cubes either side, so the only way to see is along it.
  const passage = (): EncounterMap => {
    const extra: [BlockCoord, SwatchId][] = [];
    for (let x = 0; x < 24; x += 1) {
      for (let z = 8; z <= 12; z += 1) extra.push([{ x, y: 2, z }, STONE]);
      extra.push([{ x, y: 1, z: 8 }, STONE], [{ x, y: 1, z: 12 }, STONE]);
    }
    return field(extra);
  };

  it('sits just under the ceiling, inside the token\'s own cube', () => {
    expect(eyeOf(passage(), { x: 3, y: 1, z: 10 }).y).toBe(1 + EYE_UNDER_CEILING);
  });

  it('sees along the passage, and nothing over the roof', () => {
    const seen = memberSight(passage(), { x: 3, y: 1, z: 10 }, 12);
    for (let x = 4; x <= 12; x += 1) expect(seen.has(key(x, 1, 10)), `x ${x}`).toBe(true);
    expect(seen.has(key(3, 3, 10))).toBe(false);
  });
});

describe('binary, from a handful of samples (R-41)', () => {
  it('counts a cube seen when any one line reaches it', () => {
    // A tall pillar across the line to the middle of a cube, but not across
    // the line to its far corner.
    const map = field([1, 2, 3, 4].map((y) => [{ x: 6, y, z: 10 }, STONE] as [BlockCoord, SwatchId]));
    const blocks = (x: number, y: number, z: number) => map.blocks.has(key(x, y, z));
    const eye = eyeOf(map, { x: 3, y: 1, z: 10 });
    expect(lineIsClear(blocks, eye, { x: 9.5, y: 1.5, z: 11.5 })).toBe(false);
    expect(lineIsClear(blocks, eye, { x: 9.92, y: 1.92, z: 11.92 })).toBe(true);
    expect(memberSight(map, { x: 3, y: 1, z: 10 }, 12).has(key(9, 1, 11))).toBe(true);
  });
});

describe('whole cubes, never faces (R-42, D-271)', () => {
  it('shows every block around the space seen: the floor, the wall, the ceiling', () => {
    // A low room: floor at 0, a wall at x 6, a ceiling at y 3 over x 0 to 5.
    const extra: [BlockCoord, SwatchId][] = [...wall(6, 3)];
    for (let x = 0; x <= 5; x += 1) for (let z = 0; z < 24; z += 1) extra.push([{ x, y: 3, z }, STONE]);
    const map = field(extra);
    const shown = shownBy(map, memberSight(map, { x: 2, y: 1, z: 10 }, 12));
    expect(shown.has(key(3, 0, 10))).toBe(true); // the floor
    expect(shown.has(key(6, 1, 10))).toBe(true); // the wall
    expect(shown.has(key(3, 3, 10))).toBe(true); // the ceiling
    // And nothing on the far side of the wall.
    expect(shown.has(key(8, 0, 10))).toBe(false);
  });

  it('shows what stands in space the party has seen as it is now', () => {
    // Explored is the party's knowledge of the map as it is, not a picture of
    // how it looked: a crate set down where they looked is on their screen.
    const map = field();
    const explored = memberSight(map, { x: 3, y: 1, z: 10 }, 12);
    const later = setBlock(map, { x: 6, y: 1, z: 10 }, STONE);
    expect(shownBy(later, explored).has(key(6, 1, 10))).toBe(true);
  });
});

describe('seams are sealed (R-44)', () => {
  it('does not see through where two cubes touch only along an edge', () => {
    // Two pillars, two cubes tall, touching corner to corner, with the member
    // on one side of the seam and the cube they would peek into on the other.
    const pillars: [BlockCoord, SwatchId][] = [];
    for (const y of [1, 2]) pillars.push([{ x: 3, y, z: 2 }, STONE], [{ x: 2, y, z: 3 }, STONE]);
    const map = field(pillars);
    expect(memberSight(map, { x: 2, y: 1, z: 2 }, 12).has(key(3, 1, 3))).toBe(false);
  });
});

describe('only blocks occlude (R-74, R-75)', () => {
  it('lets a figure standing in a doorway hide nothing behind it', () => {
    const map = field(wall(5, 3).filter(([at]) => at.z !== 10));
    const alone = partySight(map, new Map([['a' as MemberId, { x: 2, y: 1, z: 10 }]]), [member('a'), member('b')]);
    const withDoorway = partySight(
      map,
      new Map([['a' as MemberId, { x: 2, y: 1, z: 10 }], ['b' as MemberId, { x: 5, y: 1, z: 10 }]]),
      [member('a'), member('b')],
    );
    for (const cell of alone) expect(withDoorway.has(cell)).toBe(true);
    expect(alone.has(key(8, 1, 10))).toBe(true);
  });

  it('sees through glass', () => {
    const map = field(wall(4, 3, GLASS));
    expect(memberSight(map, { x: 2, y: 1, z: 10 }, 12).has(key(7, 1, 10))).toBe(true);
  });

  it('sees into water and down to the bed under it', () => {
    // A pond two deep: the floor dug out at x 6 to 9 and filled with water
    // over a stone bed at y -2.
    let map = field();
    for (let x = 6; x <= 9; x += 1) {
      for (let z = 8; z <= 12; z += 1) {
        map = setBlock(map, { x, y: 0, z }, WATER);
        map = setBlock(map, { x, y: -1, z }, WATER);
        map = setBlock(map, { x, y: -2, z }, STONE);
      }
    }
    const seen = memberSight(map, { x: 4, y: 1, z: 10 }, 12);
    expect(seen.has(key(7, -1, 10))).toBe(true);
    expect(shownBy(map, seen).has(key(7, -2, 10))).toBe(true);
  });
});

describe('omnidirectional, with a range of each member\'s own (R-46)', () => {
  it('sees out to the member\'s range and no further', () => {
    const near = memberSight(field(), { x: 2, y: 1, z: 10 }, 3);
    expect(near.has(key(4, 1, 10))).toBe(true);
    expect(near.has(key(8, 1, 10))).toBe(false);
  });

  it('sees in every direction, with no facing', () => {
    const seen = memberSight(field(), { x: 10, y: 1, z: 10 }, 6);
    for (const [x, z] of [[14, 10], [6, 10], [10, 14], [10, 6]] as const) {
      expect(seen.has(key(x, 1, z)), `${x},${z}`).toBe(true);
    }
  });

  it('sees nothing with a range of nothing', () => {
    expect(memberSight(field(), { x: 2, y: 1, z: 10 }, 0).size).toBe(0);
  });

  it('defaults to 60 ft, which is 12 cubes (R-46a)', () => {
    expect(DEFAULT_VISION_RANGE).toBe(12);
  });
});

describe('the party sees what any of them sees (R-15)', () => {
  it('is the union of every member standing in the map', () => {
    const map = field(wall(12, 3));
    const party = [member('a'), member('b'), member('c')];
    const tokens = new Map([['a' as MemberId, { x: 3, y: 1, z: 10 }], ['b' as MemberId, { x: 20, y: 1, z: 10 }]]);
    const seen = partySight(map, tokens, party);
    const a = memberSight(map, { x: 3, y: 1, z: 10 }, 12);
    const b = memberSight(map, { x: 20, y: 1, z: 10 }, 12);
    expect(seen).toEqual(new Set([...a, ...b]));
  });

  it('works it out once for the same map, tokens and roster', () => {
    const map = field();
    const party = [member('a')];
    const tokens = new Map([['a' as MemberId, { x: 3, y: 1, z: 10 }]]);
    expect(partySight(map, tokens, party)).toBe(partySight(map, tokens, party));
  });
});

describe('explored is cumulative (R-45)', () => {
  it('keeps what was seen and adds what is seen now', () => {
    const first = new Set([key(1, 1, 1)]);
    const grown = explore(first, new Set([key(2, 1, 1)]));
    expect(grown).toEqual(new Set([key(1, 1, 1), key(2, 1, 1)]));
  });

  it('hands back the same set when nothing is new (R-165)', () => {
    const explored = new Set([key(1, 1, 1), key(2, 1, 1)]);
    expect(explore(explored, new Set([key(2, 1, 1)]))).toBe(explored);
    expect(explore(NO_CELLS, NO_CELLS)).toBe(NO_CELLS);
  });
});

describe('what the table may be sent (R-85)', () => {
  it('is only the blocks the party has been shown', () => {
    const map = field(wall(12, 3));
    const explored = memberSight(map, { x: 3, y: 1, z: 10 }, 12);
    const part = seenPart(map, explored);
    expect(part.blocks.has(key(3, 0, 10))).toBe(true);
    expect(part.blocks.has(key(20, 0, 10))).toBe(false);
    expect([...part.blocks.keys()].every((cube) => shownBy(map, explored).has(cube))).toBe(true);
    // The same answer is the same object, so the wire's cache knows it (D-219).
    expect(seenPart(map, explored)).toBe(part);
  });
});

describe('what was seen, packed (R-59)', () => {
  it('comes back as it went in, wherever it is in the map', () => {
    const cells = new Set([key(-40, -3, 70), key(-39, -3, 70), key(-38, -3, 70), key(5, 12, -9)]);
    expect(cellsFromJSON(cellsToJSON(cells))).toEqual(cells);
  });

  it('packs a row of cubes side by side as one run', () => {
    const row = new Set(Array.from({ length: 30 }, (_, x) => key(x, 1, 4)));
    expect(cellsToJSON(row).runs).toEqual([0, 30]);
  });

  it('reads runs that do not add up as nothing seen, rather than seen askew', () => {
    const json = cellsToJSON(new Set([key(0, 0, 0), key(3, 0, 0)]));
    expect(cellsFromJSON({ ...json, runs: [...json.runs, 4] })).toBe(NO_CELLS);
    expect(cellsFromJSON(null)).toBe(NO_CELLS);
  });

  it('writes nothing seen as an empty box', () => {
    expect(cellsFromJSON(cellsToJSON(NO_CELLS)).size).toBe(0);
  });
});

describe('a fresh start in a map (D-277)', () => {
  it('forgets what was seen there and who stood there, and nothing anywhere else', () => {
    const aldra = 'member_aldra' as MemberId;
    let save = createLiveSave(createCampaign('Ashfall'), '2026-01-01T00:00:00.000Z');
    save = withExplored(save, 'poi_tavern', new Set([key(3, 1, 3)]));
    save = withTokens(save, 'poi_tavern', new Map([[aldra, { x: 3, y: 1, z: 3 }]]));
    save = withExplored(save, 'poi_cellar', new Set([key(9, -3, 9)]));
    save = withTokens(save, 'poi_cellar', new Map([[aldra, { x: 9, y: -3, z: 9 }]]));

    const fresh = forgetMap(save, 'poi_tavern');
    expect(exploredIn(fresh, 'poi_tavern')).toBe(NO_CELLS);
    expect(tokensFor(fresh, 'poi_tavern').size).toBe(0);
    expect(exploredIn(fresh, 'poi_cellar').has(key(9, -3, 9))).toBe(true);
    expect(tokensFor(fresh, 'poi_cellar').get(aldra)).toEqual({ x: 9, y: -3, z: 9 });
  });

  it('hands back the same save for a map with nothing to forget (R-165)', () => {
    const save = createLiveSave(createCampaign('Ashfall'), '2026-01-01T00:00:00.000Z');
    expect(forgetMap(save, 'poi_tavern')).toBe(save);
  });
});
