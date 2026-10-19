// Areas (D-341): a sphere, a cone, a line or a cube, drawn by a drag, covering
// the floors whose cubes are inside the shape — drawn, never resolved.

import { describe, it, expect } from 'vitest';
import type { BlockCoord, SwatchId } from '@tt/domain';
import {
  createMap, setBlocks, DEFAULT_FLOOR, areaFromDrag, inArea, areaFloors, areaAt, drawArea, editArea, removeArea,
  nameForArea, areaStartingAt, areasToJSON, areasFromJSON, NO_AREAS, MAX_AREA_SIZE,
} from '@tt/domain';

const cube = (x: number, y: number, z: number): BlockCoord => ({ x, y, z });
const STONE = DEFAULT_FLOOR as SwatchId;
const nobody = () => null;

describe('drawn by a drag', () => {
  it('a sphere as far round as the drag is long; a cone or a line pointing the way it went, as long', () => {
    expect(areaFromDrag('sphere', cube(5, 1, 5), cube(8, 1, 9))).toEqual({ at: cube(5, 1, 5), aim: { x: 0, y: 0, z: 0 }, size: 5 });
    expect(areaFromDrag('cone', cube(5, 1, 5), cube(5, 1, 9))).toEqual({ at: cube(5, 1, 5), aim: { x: 0, y: 0, z: 4 }, size: 4 });
    expect(areaFromDrag('line', cube(5, 1, 5), cube(2, 1, 5))).toMatchObject({ aim: { x: -3, y: 0, z: 0 }, size: 3 });
  });

  it('a cube from its corner to the far one, square on the floor, and never less than one', () => {
    expect(areaFromDrag('cube', cube(5, 1, 5), cube(3, 1, 8))).toEqual({ at: cube(5, 1, 5), aim: { x: -1, y: 0, z: 1 }, size: 4 });
    expect(areaFromDrag('sphere', cube(5, 1, 5), cube(5, 1, 5)).size).toBe(1);
    expect(areaFromDrag('cone', cube(5, 1, 5), cube(5, 1, 5)).aim).toEqual({ x: 1, y: 0, z: 0 });
    expect(areaFromDrag('sphere', cube(0, 1, 0), cube(90, 1, 0)).size).toBe(MAX_AREA_SIZE);
  });
});

describe('which cubes are in one', () => {
  const at = cube(5, 1, 5);

  it('a sphere: no further than its radius, middle to middle', () => {
    const sphere = { shape: 'sphere' as const, aim: { x: 0, y: 0, z: 0 }, size: 2 };
    expect(inArea(sphere, at, cube(7, 1, 5))).toBe(true);
    expect(inArea(sphere, at, cube(7, 1, 6))).toBe(false);
    expect(inArea(sphere, at, cube(5, 3, 5))).toBe(true);
  });

  it('a cone: ahead of its point, as wide at any distance as that distance, and not its own point', () => {
    const cone = { shape: 'cone' as const, aim: { x: 1, y: 0, z: 0 }, size: 4 };
    expect(inArea(cone, at, at)).toBe(false);
    expect(inArea(cone, at, cube(9, 1, 5))).toBe(true);
    expect(inArea(cone, at, cube(9, 1, 7))).toBe(true);
    expect(inArea(cone, at, cube(9, 1, 8))).toBe(false);
    expect(inArea(cone, at, cube(4, 1, 5))).toBe(false);
    expect(inArea(cone, at, cube(10, 1, 5))).toBe(false);
  });

  it('a line: ahead, as long as it is, a cube wide', () => {
    const line = { shape: 'line' as const, aim: { x: 0, y: 0, z: 1 }, size: 3 };
    expect(inArea(line, at, cube(5, 1, 8))).toBe(true);
    expect(inArea(line, at, cube(6, 1, 7))).toBe(false);
    expect(inArea(line, at, cube(5, 1, 9))).toBe(false);
  });

  it('a cube: from its corner, the ways it was drawn, and as tall as it is wide', () => {
    const box = { shape: 'cube' as const, aim: { x: -1, y: 0, z: 1 }, size: 3 };
    expect(inArea(box, at, cube(3, 1, 7))).toBe(true);
    expect(inArea(box, at, cube(3, 3, 7))).toBe(true);
    expect(inArea(box, at, cube(6, 1, 5))).toBe(false);
    expect(inArea(box, at, cube(5, 4, 5))).toBe(false);
  });

  it('tints the floors in it — air with a block under it — and nothing in a wall or in the air', () => {
    const map = setBlocks(createMap(), [cube(6, 1, 5)], STONE);
    const floors = areaFloors(map, { shape: 'sphere', aim: { x: 0, y: 0, z: 0 }, size: 1 }, cube(5, 1, 5));
    const keys = floors.map((one) => `${one.x},${one.y},${one.z}`).sort();
    // Its own cube and three beside it; the fourth is a block. The floor on top
    // of that block is 1.4 away, past a radius of 1.
    expect(keys).toEqual(['4,1,5', '5,1,4', '5,1,5', '5,1,6']);
    const wider = areaFloors(map, { shape: 'sphere', aim: { x: 0, y: 0, z: 0 }, size: 2 }, cube(5, 1, 5));
    expect(wider.some((one) => one.x === 6 && one.y === 2 && one.z === 5)).toBe(true);
    expect(wider.some((one) => one.x === 6 && one.y === 1 && one.z === 5)).toBe(false);
  });
});

describe('on a map', () => {
  it('is named for its shape, numbered past the ones there are', () => {
    let areas = drawArea(NO_AREAS, { shape: 'sphere', at: cube(1, 1, 1), aim: { x: 0, y: 0, z: 0 }, size: 3, colour: 'blue' });
    areas = drawArea(areas, { shape: 'sphere', at: cube(2, 1, 2), aim: { x: 0, y: 0, z: 0 }, size: 3, colour: 'plaid' });
    expect(areas.map((area) => area.name)).toEqual(['Sphere 1', 'Sphere 2']);
    expect(areas[1]!.colour).toBe('red');
    expect(nameForArea('cone', areas)).toBe('Cone 1');
  });

  it('follows somebody while they are here, lets go of them when it is moved, and comes away', () => {
    let areas = drawArea(NO_AREAS, { shape: 'sphere', at: cube(1, 1, 1), aim: { x: 0, y: 0, z: 0 }, size: 2, colour: 'green' });
    const id = areas[0]!.id as string;
    areas = editArea(areas, id, { follows: 'member_galion' });
    const galion = (who: string) => (who === 'member_galion' ? cube(7, 1, 7) : null);
    expect(areaAt(areas[0]!, galion)).toEqual(cube(7, 1, 7));
    expect(areaAt(areas[0]!, nobody)).toEqual(cube(1, 1, 1));
    expect(areaStartingAt(areas, cube(7, 1, 7), galion)?.id).toBe(id);
    const moved = editArea(areas, id, { at: cube(3, 1, 3) });
    expect(moved[0]).toMatchObject({ at: cube(3, 1, 3) });
    expect(moved[0]!.follows).toBeUndefined();
    expect(editArea(areas, id, { size: 500, name: '  Aura  ' })[0]).toMatchObject({ size: MAX_AREA_SIZE, name: 'Aura' });
    expect(removeArea(areas, id)).toEqual([]);
    expect(removeArea(areas, 'area_nope')).toBe(areas);
  });

  it('round-trips, and reads an odd one leniently', () => {
    let areas = drawArea(NO_AREAS, { shape: 'cone', at: cube(1, 1, 1), aim: { x: 2, y: 0, z: 1 }, size: 6, colour: 'violet' });
    areas = editArea(areas, areas[0]!.id, { hidden: true, follows: 'silver_n7' });
    expect(areasFromJSON(areasToJSON(areas))).toEqual(areas);
    expect(areasFromJSON([{ id: 'a', shape: 'blob', at: { x: 1, y: 1, z: 1 } }])).toBe(NO_AREAS);
    expect(areasFromJSON([{ id: 'a', shape: 'line', at: { x: 1, y: 1, z: 1 }, size: 0 }])[0]).toMatchObject({
      size: 1, aim: { x: 1, y: 0, z: 0 }, colour: 'red', name: 'Line', hidden: false,
    });
  });
});
