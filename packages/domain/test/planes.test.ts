// Cutting planes and the level range (R-146).
//
// The GM's worked example is the spine of this file: planes at 4, 8 and 12, and
// the four bands they asked for by name. If those four read wrong, the feature
// is wrong however well the parts behave.

import { describe, it, expect } from 'vitest';
import {
  addPlane, renamePlane, movePlane, removePlane, planeAt, planeById,
  planeSteps, fullRange, clampRange, inRange, sameRange, isFullRange, validPlaneY,
  planesToJSON, planesFromJSON,
  createMap, setBlock, sliceOf, blockAt, blockKey, WATER_LEVEL,
  MAP_MAX_HEIGHT, MAP_MIN_DEPTH, stepLabel, DEFAULT_MATERIALS,
} from '@tt/domain';
import type { CuttingPlane, MaterialId, PlaneId } from '@tt/domain';

const CAP = MAP_MAX_HEIGHT;
const FLOOR = MAP_MIN_DEPTH;
const STONE = DEFAULT_MATERIALS.find((m) => m.name === 'Stone')!.id;
const at = (x: number, y: number, z: number) => ({ x, y, z });

/** The GM's tavern: a cellar, a ground floor, an upstairs and a roof. */
function tavern(): readonly CuttingPlane[] {
  let planes = addPlane([], 'Ground floor', 4, CAP, FLOOR);
  planes = addPlane(planes, 'Upstairs', 8, CAP, FLOOR);
  planes = addPlane(planes, 'Roof', 12, CAP, FLOOR);
  return planes;
}

describe('a plane is a height and a name (R-146)', () => {
  it('sits strictly between the two bounds', () => {
    // Both bounds are already steps (R-161), so a plane at either would be a
    // named cut that cuts nothing. Zero is *not* excluded: water level is an
    // ordinary plane, which is why it can be renamed and deleted.
    expect(validPlaneY(1, CAP, FLOOR)).toBe(true);
    expect(validPlaneY(0, CAP, FLOOR)).toBe(true);
    expect(validPlaneY(CAP - 1, CAP, FLOOR)).toBe(true);
    expect(validPlaneY(FLOOR + 1, CAP, FLOOR)).toBe(true);
    expect(validPlaneY(CAP, CAP, FLOOR)).toBe(false);
    expect(validPlaneY(FLOOR, CAP, FLOOR)).toBe(false);
    expect(validPlaneY(FLOOR - 1, CAP, FLOOR)).toBe(false);
    expect(validPlaneY(4.5, CAP, FLOOR)).toBe(false);
  });

  it('may sit underground, now that a map can be dug (R-160)', () => {
    const cellar = addPlane([], 'Cellar ceiling', -4, CAP, FLOOR);
    expect(cellar).toHaveLength(1);
    expect(cellar[0]!.y).toBe(-4);
  });

  it('refuses one at a height that is already cut', () => {
    const planes = tavern();
    expect(addPlane(planes, 'Also the ground floor', 4, CAP, FLOOR)).toBe(planes);
  });

  it('keeps the list ordered by height, however it was built', () => {
    let planes = addPlane([], 'Roof', 12, CAP, FLOOR);
    planes = addPlane(planes, 'Ground floor', 4, CAP, FLOOR);
    planes = addPlane(planes, 'Upstairs', 8, CAP, FLOOR);
    expect(planes.map((p) => p.y)).toEqual([4, 8, 12]);
  });

  it('names an unnamed one after its height rather than leaving it blank', () => {
    expect(addPlane([], '   ', 6, CAP, FLOOR)[0]!.name).toBe('Level 6');
  });

  it('renames, moves and removes, preserving identity when nothing changes (R-12)', () => {
    const planes = tavern();
    const id = planeAt(planes, 8)!.id;

    expect(renamePlane(planes, id, 'First floor')[1]!.name).toBe('First floor');
    expect(renamePlane(planes, id, 'Upstairs')).toBe(planes);
    expect(renamePlane(planes, id, '  ')).toBe(planes);
    expect(renamePlane(planes, 'plane_ghost' as PlaneId, 'x')).toBe(planes);

    expect(planeAt(movePlane(planes, id, 9, CAP, FLOOR), 9)!.id).toBe(id);
    // 4 is taken, so the move is refused rather than silently swapping them.
    expect(movePlane(planes, id, 4, CAP, FLOOR)).toBe(planes);
    expect(movePlane(planes, id, 8, CAP, FLOOR)).toBe(planes);
    expect(movePlane(planes, id, FLOOR, CAP, FLOOR)).toBe(planes);

    expect(removePlane(planes, id)).toHaveLength(2);
    expect(removePlane(planes, 'plane_ghost' as PlaneId)).toBe(planes);
  });

  it('moving one keeps the list ordered', () => {
    const planes = tavern();
    const ground = planeAt(planes, 4)!.id;
    expect(movePlane(planes, ground, 20, CAP, FLOOR).map((p) => p.y)).toEqual([8, 12, 20]);
  });

  it('finds a plane by id', () => {
    const planes = tavern();
    expect(planeById(planes, planes[0]!.id)!.name).toBe('Ground floor');
    expect(planeById(planes, 'plane_ghost' as PlaneId)).toBeNull();
  });
});

describe('the steps a range may snap to (R-161)', () => {
  it('is the planes plus the two fixed bounds', () => {
    expect(planeSteps(tavern(), CAP, FLOOR)).toEqual([FLOOR, 4, 8, 12, CAP]);
  });

  it('gives an uncut map the two, and nothing else', () => {
    expect(planeSteps([], CAP, FLOOR)).toEqual([FLOOR, CAP]);
  });

  it('holds still when the map is dug or filled in', () => {
    // The bug this replaces: the lowest step used to be the deepest block, so
    // the bottom label slid downward as the GM dug. The bounds do not move for
    // anything, which is what makes them references.
    const ends = planeSteps(tavern(), CAP, FLOOR).filter((y) => y === FLOOR || y === CAP);
    expect(ends).toEqual([FLOOR, CAP]);
  });

  it('names the two bounds, and lets the GM name everything else', () => {
    expect(stepLabel(CAP, CAP, FLOOR)).toBe('Sky');
    expect(stepLabel(FLOOR, CAP, FLOOR)).toBe('Bedrock');
    // Every other height is the GM's to name, zero included — a new map simply
    // starts with a plane there called water level.
    expect(stepLabel(0, CAP, FLOOR)).toBeNull();
    expect(stepLabel(4, CAP, FLOOR)).toBeNull();
    expect(stepLabel(-4, CAP, FLOOR)).toBeNull();
  });

  it('starts a new map with its ground named, as a plane like any other', () => {
    const fresh = createMap();
    expect(fresh.planes.map((plane) => [plane.name, plane.y])).toEqual([[WATER_LEVEL, 0]]);
    // Deletable, which is the point of it being a plane.
    expect(removePlane(fresh.planes, fresh.planes[0]!.id)).toEqual([]);
  });

  it('still selects the whole body when nothing is cut', () => {
    const only = clampRange([], { lower: FLOOR, upper: CAP }, CAP, FLOOR);
    expect(only).toEqual({ lower: FLOOR, upper: CAP });
    expect(isFullRange(only, CAP, FLOOR)).toBe(true);
  });
});

describe("the GM's four bands, by name", () => {
  const planes = tavern();
  const band = (lower: number, upper: number) => clampRange(planes, { lower, upper }, CAP, FLOOR);

  it('outside: the building without its cellar', () => {
    expect(band(4, CAP)).toEqual({ lower: 4, upper: CAP });
    expect(inRange(band(4, CAP), 0)).toBe(false);
    expect(inRange(band(4, CAP), 4)).toBe(true);
    expect(inRange(band(4, CAP), 20)).toBe(true);
  });

  it('inside: the ground floor alone', () => {
    const inside = band(4, 8);
    expect(inside).toEqual({ lower: 4, upper: 8 });
    expect(inRange(inside, 4)).toBe(true);
    expect(inRange(inside, 7)).toBe(true);
    // Half-open: the plane at 8 belongs to what is above it.
    expect(inRange(inside, 8)).toBe(false);
  });

  it('upstairs: ground plus the floor above', () => {
    expect(band(4, 12)).toEqual({ lower: 4, upper: 12 });
    expect(inRange(band(4, 12), 8)).toBe(true);
    expect(inRange(band(4, 12), 12)).toBe(false);
  });

  it('underground: the cellar alone', () => {
    // Zero is not a step in this fixture — the tavern's planes are 4, 8 and 12
    // — so the lower handle snaps to Bedrock, and the cellar is everything
    // below the ground floor.
    const cellar = band(FLOOR, 4);
    expect(cellar).toEqual({ lower: FLOOR, upper: 4 });
    expect(inRange(cellar, 0)).toBe(true);
    expect(inRange(cellar, 3)).toBe(true);
    expect(inRange(cellar, -5)).toBe(true);
    expect(inRange(cellar, 4)).toBe(false);
  });
});

describe('making a band legal (R-161)', () => {
  const planes = tavern();
  const clamp = (lower: number, upper: number) =>
    clampRange(planes, { lower, upper }, CAP, FLOOR);

  it('leaves a handle exactly where it was put', () => {
    // The bug this replaces: both bounds were pulled onto the nearest step on
    // every change, so moving the top handle re-snapped the bottom one and a
    // GM could lose their cellar to a click somewhere else entirely.
    expect(clamp(-2, 3)).toEqual({ lower: -2, upper: 3 });
    expect(clamp(5, 11)).toEqual({ lower: 5, upper: 11 });
  });

  it('orders the handles when they arrive the wrong way round', () => {
    expect(clamp(12, 4)).toEqual({ lower: 4, upper: 12 });
  });

  it('clamps to the two bounds', () => {
    expect(clamp(-50, 900)).toEqual({ lower: FLOOR, upper: CAP });
  });

  it('never selects nothing, and opens upward when pinched', () => {
    // A band is named by the step it sits on, so pinching at a level gives the
    // storey above it.
    const collapsed = clamp(8, 8);
    expect(collapsed.lower).toBeLessThan(collapsed.upper);
    expect(collapsed).toEqual({ lower: 8, upper: 12 });

    // Between two steps, it opens to the next one up.
    expect(clamp(5, 5)).toEqual({ lower: 5, upper: 8 });

    // At the ceiling there is no up, so it opens down instead.
    expect(clamp(CAP, CAP)).toEqual({ lower: 12, upper: CAP });
  });

  it('compares two ranges', () => {
    expect(sameRange(fullRange(CAP, FLOOR), { lower: FLOOR, upper: CAP })).toBe(true);
    expect(sameRange(fullRange(CAP, FLOOR), { lower: 4, upper: CAP })).toBe(false);
  });
});

describe('the slice the table is sent (R-146, R-85)', () => {
  function built() {
    let map = createMap();
    map = { ...map, planes: tavern() };
    map = setBlock(map, at(1, 1, 1), STONE);   // cellar
    map = setBlock(map, at(2, 5, 2), STONE);   // ground floor
    map = setBlock(map, at(3, 9, 3), STONE);   // upstairs
    return map;
  }

  it('keeps only the blocks inside the band', () => {
    const ground = sliceOf(built(), { lower: 4, upper: 8 });
    expect(blockAt(ground, at(2, 5, 2))).toBe(STONE);
    expect(blockAt(ground, at(1, 1, 1))).toBeNull();
    expect(blockAt(ground, at(3, 9, 3))).toBeNull();
    // The floor at Y0 is below the band too.
    expect(blockAt(ground, at(0, 0, 0))).toBeNull();
  });

  it('removes the cut levels rather than marking them', () => {
    // R-85: a secret is never sent. A cellar the GM cut away must be absent
    // from the payload, not present and undrawn.
    const payload = JSON.stringify([...sliceOf(built(), { lower: 4, upper: 8 }).blocks.keys()]);
    expect(payload).not.toContain('1,1,1');
    expect(payload).not.toContain('3,9,3');
  });

  it('sends the footprint and the plane names whole', () => {
    // The table still has to know how big the floor is, and a level called
    // "cellar" is not itself a secret — what is in it is.
    const slice = sliceOf(built(), { lower: 4, upper: 8 });
    expect(slice.size).toEqual(built().size);
    expect(slice.origin).toEqual(built().origin);
    expect(slice.planes.map((p) => p.name)).toEqual(['Ground floor', 'Upstairs', 'Roof']);
  });

  it('is the whole body when the range is', () => {
    const whole = sliceOf(built(), fullRange(CAP, FLOOR));
    expect(whole.blocks.size).toBe(built().blocks.size);
  });
});

describe('planes on the wire and on disk', () => {
  it('round-trips, ordered', () => {
    const back = planesFromJSON(JSON.parse(JSON.stringify(planesToJSON(tavern()))));
    expect(back.map((p) => [p.name, p.y])).toEqual([
      ['Ground floor', 4], ['Upstairs', 8], ['Roof', 12],
    ]);
  });

  it('reads a map written before planes existed as one nobody has cut', () => {
    expect(planesFromJSON(undefined)).toEqual([]);
    expect(planesFromJSON(null)).toEqual([]);
  });

  it('comes along when the footprint grows', () => {
    // A cut at "cellar ceiling" is still at that height after the map grows
    // sideways — the planes are part of the building.
    const map = { ...createMap(), planes: tavern() };
    const grown = { ...map, blocks: new Map(map.blocks).set(blockKey(at(0, 0, 0)), STONE as MaterialId) };
    expect(grown.planes).toHaveLength(3);
  });
});
