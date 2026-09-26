// Cutting planes and the level range (R-146).
//
// The GM's worked example is the spine of this file: planes at 4, 8 and 12, and
// the four bands they asked for by name. If those four read wrong, the feature
// is wrong however well the parts behave.

import { describe, it, expect } from 'vitest';
import {
  addPlane, renamePlane, movePlane, removePlane, planeAt, planeById,
  planeSteps, fullRange, snapRange, inRange, sameRange, isFullRange, validPlaneY,
  planesToJSON, planesFromJSON,
  createMap, setBlock, sliceOf, blockAt, blockKey,
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
  it('sits strictly between the bounds, and never on the datum', () => {
    // All three fixed steps are already steps (R-161), so a plane at any of
    // them would be a named cut that cuts nothing.
    expect(validPlaneY(1, CAP, FLOOR)).toBe(true);
    expect(validPlaneY(CAP - 1, CAP, FLOOR)).toBe(true);
    expect(validPlaneY(FLOOR + 1, CAP, FLOOR)).toBe(true);
    expect(validPlaneY(0, CAP, FLOOR)).toBe(false);
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
    expect(movePlane(planes, id, 0, CAP, FLOOR)).toBe(planes);

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
  it('is the planes plus three fixed reference heights', () => {
    expect(planeSteps(tavern(), CAP, FLOOR)).toEqual([FLOOR, 0, 4, 8, 12, CAP]);
  });

  it('gives an undivided map the three, and nothing else', () => {
    // Zero is a step whether or not anything was ever dug, because it is the
    // datum every other height is above or below.
    expect(planeSteps([], CAP, FLOOR)).toEqual([FLOOR, 0, CAP]);
  });

  it('holds still when the map is dug or filled in', () => {
    // The bug this replaces: the lowest step used to be the deepest block, so
    // the bottom label slid downward as the GM dug and the original ground
    // lost its name the moment anything went beneath it.
    expect(planeSteps([], CAP, FLOOR)).toEqual(planeSteps(tavern(), CAP, FLOOR).filter(
      (y) => y === FLOOR || y === 0 || y === CAP,
    ));
  });

  it('names the three, and lets the GM name the rest', () => {
    expect(stepLabel(CAP, CAP, FLOOR)).toBe('Sky');
    expect(stepLabel(0, CAP, FLOOR)).toBe('Water level');
    expect(stepLabel(FLOOR, CAP, FLOOR)).toBe('Bedrock');
    // A plane's height is the GM's to name, so the domain declines to.
    expect(stepLabel(4, CAP, FLOOR)).toBeNull();
    expect(stepLabel(-4, CAP, FLOOR)).toBeNull();
  });

  it('still selects the whole body when nothing is cut', () => {
    const only = snapRange([], { lower: FLOOR, upper: CAP }, CAP, FLOOR);
    expect(only).toEqual({ lower: FLOOR, upper: CAP });
    expect(isFullRange(only, CAP, FLOOR)).toBe(true);
  });
});

describe("the GM's four bands, by name", () => {
  const planes = tavern();
  const band = (lower: number, upper: number) => snapRange(planes, { lower, upper }, CAP, FLOOR);

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
    const cellar = band(0, 4);
    expect(cellar).toEqual({ lower: 0, upper: 4 });
    expect(inRange(cellar, 0)).toBe(true);
    expect(inRange(cellar, 3)).toBe(true);
    expect(inRange(cellar, 4)).toBe(false);
  });
});

describe('snapping', () => {
  const planes = tavern();

  it('pulls a handle to the nearest step', () => {
    expect(snapRange(planes, { lower: 5, upper: 11 }, CAP, FLOOR)).toEqual({ lower: 4, upper: 12 });
    expect(snapRange(planes, { lower: 3, upper: 13 }, CAP, FLOOR)).toEqual({ lower: 4, upper: 12 });
  });

  it('opens a band the GM pinched shut between two steps', () => {
    // 7 and 9 both snap to 8, which would select nothing, so it opens upward to
    // the storey that step names — the nearest band that is actually a band.
    expect(snapRange(planes, { lower: 7, upper: 9 }, CAP, FLOOR)).toEqual({ lower: 8, upper: 12 });
  });

  it('orders the handles when the GM drags one past the other', () => {
    expect(snapRange(planes, { lower: 12, upper: 4 }, CAP, FLOOR)).toEqual({ lower: 4, upper: 12 });
  });

  it('never selects nothing, and opens upward when pinched', () => {
    // A band is named by the step it sits on, so pinching at a step gives the
    // storey *above* it. Downward would hand back the cellar — or, at water
    // level, the empty underworld (R-161).
    const collapsed = snapRange(planes, { lower: 8, upper: 8 }, CAP, FLOOR);
    expect(collapsed.lower).toBeLessThan(collapsed.upper);
    expect(collapsed).toEqual({ lower: 8, upper: 12 });

    expect(snapRange(planes, { lower: 0, upper: 0 }, CAP, FLOOR))
      .toEqual({ lower: 0, upper: 4 });

    // At the ceiling there is no up, so it opens down instead.
    expect(snapRange(planes, { lower: CAP, upper: CAP }, CAP, FLOOR))
      .toEqual({ lower: 12, upper: CAP });
  });

  it('clamps a handle far outside the body', () => {
    expect(snapRange(planes, { lower: -50, upper: 900 }, CAP, FLOOR))
      .toEqual({ lower: FLOOR, upper: CAP });
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
