// The Measure tool (D-341): a drag measures or draws, a press on a handle
// moves an area, and only a finished drag reaches the host.

import { describe, it, expect } from 'vitest';
import type { BlockCoord } from '@tt/domain';
import { drawArea, NO_AREAS } from '@tt/domain';
import {
  MEASURE_START, chooseMeasure, measurePress, measureDrag, measureRelease, rulerShown, rulerLength, areasShown,
  handleAt, measurePrompt, measureCleared, faceCentre, floorCentre,
} from '@tt/client-core';

const cube = (x: number, y: number, z: number): BlockCoord => ({ x, y, z });
const nobody = () => null;

describe('the ruler', () => {
  it('measures straight from the middle of one face to another\'s, a bare number, and stays until the next press', () => {
    expect(rulerLength(cube(0, 1, 0), cube(3, 1, 4))).toBe('5');
    expect(rulerLength(cube(0, 1, 0), cube(1, 2, 1))).toBe('1.7');
    // Pointing at the top of a floor block, and at the side of a wall (D-342).
    const floor = faceCentre({ block: cube(1, 0, 1), adjacent: cube(1, 1, 1) } as never);
    const wall = faceCentre({ block: cube(5, 1, 1), adjacent: cube(4, 1, 1) } as never);
    expect(floor).toEqual({ x: 1.5, y: 1, z: 1.5 });
    expect(wall).toEqual({ x: 5, y: 1.5, z: 1.5 });
    expect(floorCentre(cube(4, 1, 5))).toEqual({ x: 4.5, y: 1, z: 5.5 });
    let hand = measurePress(MEASURE_START, cube(1, 1, 1), null, floor);
    hand = measureDrag(hand, cube(4, 1, 5), floorCentre(cube(4, 1, 5)));
    expect(rulerShown(hand)).toEqual({ from: floor, to: { x: 4.5, y: 1, z: 5.5 }, label: '5' });
    // The same cube in front of it, but the wall's face this time: the ruler follows.
    expect(rulerShown(measureDrag(hand, cube(4, 1, 1), wall))!.to).toEqual(wall);
    const released = measureRelease(hand, 'place_a', 'poi_a');
    expect(released.intent).toBeNull();
    expect(rulerShown(released.hand)).not.toBeNull();
    expect(rulerShown(measureCleared(released.hand))).toBeNull();
    expect(measurePrompt(hand, false)).toMatch(/^5 — /);
  });
});

describe('drawing an area', () => {
  it('is a picture while dragged, and sent when let go', () => {
    let hand = chooseMeasure(MEASURE_START, 'cone');
    hand = measurePress(hand, cube(2, 1, 2), null);
    hand = measureDrag(hand, cube(2, 1, 6));
    expect(rulerShown(hand)).toBeNull();
    const drawn = areasShown(NO_AREAS, hand, nobody);
    expect(drawn).toEqual([expect.objectContaining({ id: 'draft', shape: 'cone', at: cube(2, 1, 2), size: 4 })]);
    const { hand: after, intent } = measureRelease(hand, 'place_a', 'poi_a');
    expect(intent).toEqual({
      kind: 'placeArea', placeId: 'place_a', poiId: 'poi_a', shape: 'cone', at: cube(2, 1, 2), aim: { x: 0, y: 0, z: 4 }, size: 4, colour: 'red',
    });
    expect(after.from).toBeNull();
  });
});

describe('moving an area', () => {
  it('is picked up by the handle on its starting cube, follows the drag, and is sent where it is let go', () => {
    const areas = drawArea(NO_AREAS, { shape: 'sphere', at: cube(5, 1, 5), aim: { x: 0, y: 0, z: 0 }, size: 2, colour: 'blue' });
    const id = areas[0]!.id as string;
    expect(handleAt(areas, cube(5, 1, 5), nobody)).toBe(id);
    expect(handleAt(areas, cube(6, 1, 5), nobody)).toBeNull();
    let hand = measurePress(chooseMeasure(MEASURE_START, 'line'), cube(5, 1, 5), id);
    hand = measureDrag(hand, cube(9, 1, 9));
    expect(areasShown(areas, hand, nobody)).toEqual([expect.objectContaining({ id, at: cube(9, 1, 9) })]);
    expect(measureRelease(hand, 'place_a', 'poi_a').intent).toEqual({
      kind: 'editArea', placeId: 'place_a', poiId: 'poi_a', id, at: cube(9, 1, 9),
    });
    // Picked up and put back down where it was: nothing to send.
    expect(measureRelease(measurePress(MEASURE_START, cube(5, 1, 5), id), 'place_a', 'poi_a').intent).toBeNull();
  });
});
