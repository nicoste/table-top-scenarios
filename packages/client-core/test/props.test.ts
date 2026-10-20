// The Props tool on the console, and the door a Move click opens (D-322, D-328).

import { describe, it, expect } from 'vitest';
import type { BlockCoord, EncounterMap, SwatchId } from '@tt/domain';
import { createMap, setBlocks, putProp, propType, DEFAULT_FLOOR } from '@tt/domain';
import {
  EMPTY_HAND, takeProp, turnHand, propAim, propWall, propPreview, placePropIntent, propPrompt, toggleIntent, toggleLabel,
} from '@tt/client-core';

const cube = (x: number, y: number, z: number): BlockCoord => ({ x, y, z });
const withDoor = (): EncounterMap => putProp(createMap(), { type: 'door', at: cube(5, 1, 7), facing: 1 });

describe('the prop in hand', () => {
  it('is taken from the catalogue in its first finish, and put back by picking it again', () => {
    const hand = takeProp(EMPTY_HAND, 'door');
    expect(hand).toEqual({ type: 'door', facing: 0, finish: null });
    expect(takeProp(hand, 'door').type).toBeNull();
    expect(takeProp(hand, 'chest').type).toBe('chest');
  });

  it('turns with Z / X', () => {
    expect(turnHand(EMPTY_HAND, 1).facing).toBe(1);
    expect(turnHand(EMPTY_HAND, -1).facing).toBe(3);
  });

  it("stands against the face pointed at, or against a prop's, to stack", () => {
    const floor = { block: cube(3, 0, 3), adjacent: cube(3, 1, 3) };
    const top = { block: cube(3, 1, 3), adjacent: cube(3, 2, 3) };
    expect(propAim(floor as never, null)).toEqual(cube(3, 1, 3));
    expect(propAim(floor as never, top as never)).toEqual(cube(3, 2, 3));
    expect(propAim(null, null)).toBeNull();
  });
});

describe('the preview', () => {
  it('is the prop itself, turned as it will stand, framed by its box, and says why not when it cannot stand there (D-351)', () => {
    const map = createMap();
    const hand = turnHand(takeProp(EMPTY_HAND, 'door'), 1);
    const fine = propPreview(map, hand, cube(3, 1, 3), new Set())!;
    expect(fine.why).toBeNull();
    expect(fine.box).toEqual({ min: cube(3, 1, 3), max: cube(3, 2, 3) });
    expect(fine.ghost).toEqual({ type: 'door', at: cube(3, 1, 3), facing: 1, finish: null, refused: false });
    const walled = setBlocks(map, [cube(3, 2, 3)], DEFAULT_FLOOR as SwatchId);
    const refused = propPreview(walled, hand, cube(3, 1, 3), new Set())!;
    expect(refused.why).toBe('a block is in the way');
    expect(refused.ghost.refused).toBe(true);
    expect(propPreview(map, EMPTY_HAND, cube(3, 1, 3), new Set())).toBeNull();
  });

  it('sends a placement only with a prop in hand, turned and finished as shown', () => {
    expect(placePropIntent(EMPTY_HAND, cube(3, 1, 3), 'place_a', 'poi_a')).toBeNull();
    const hand = { ...turnHand(takeProp(EMPTY_HAND, 'door'), 1), finish: 'iron' };
    expect(placePropIntent(hand, cube(3, 1, 3), 'place_a', 'poi_a')).toEqual({
      kind: 'placeProp', placeId: 'place_a', poiId: 'poi_a', type: 'door', at: cube(3, 1, 3), facing: 1, finish: 'iron',
    });
    expect(propPrompt(propType('door')!, cube(3, 1, 3), null)).toMatch(/Click to place a door/);
    expect(propPrompt(propType('candles')!, null, null)).toMatch(/^Placing candles/);
    expect(propPrompt(null, null, null)).toMatch(/Pick a prop/);
  });
});

describe('a Move click on a door (D-328)', () => {
  it('opens a shut one and shuts an open one, and does nothing to a table', () => {
    const map = withDoor();
    const id = map.props[0]!.id as string;
    expect(toggleIntent(map, id, new Set(), 'place_a', 'poi_a')).toEqual({
      kind: 'setPropOpen', placeId: 'place_a', poiId: 'poi_a', id, open: true,
    });
    expect(toggleIntent(map, id, new Set([id]), 'place_a', 'poi_a')).toMatchObject({ open: false });
    expect(toggleLabel(map, id, new Set())).toBe('Open the door');
    expect(toggleLabel(map, id, new Set([id]))).toBe('Close the door');
    const table = putProp(createMap(), { type: 'table', at: cube(3, 1, 3), facing: 0 });
    expect(toggleIntent(table, table.props[0]!.id, new Set(), 'place_a', 'poi_a')).toBeNull();
    expect(toggleLabel(table, table.props[0]!.id, new Set())).toBeNull();
  });
});

describe('a light (D-335)', () => {
  it('hangs on the wall pointed at, turned to it, whatever the hand\'s own turn', () => {
    // The side of a block at x = 6, pointed at from x = 5: its back to +x, facing 1.
    const side = { block: cube(6, 1, 3), adjacent: cube(5, 1, 3) };
    expect(propWall(side as never, null)).toBe(1);
    expect(propWall({ block: cube(3, 0, 3), adjacent: cube(3, 1, 3) } as never, null)).toBeNull();
    expect(propWall(side as never, side as never)).toBeNull();
    const map = setBlocks(createMap(), [cube(6, 1, 3)], DEFAULT_FLOOR as SwatchId);
    const hand = takeProp(EMPTY_HAND, 'torch');
    expect(propPreview(map, hand, cube(5, 1, 3), new Set(), 1)!.why).toBeNull();
    expect(propPreview(map, hand, cube(5, 1, 3), new Set(), null)!.why).toBe('no wall behind it to hang on');
    expect(placePropIntent(hand, cube(5, 1, 3), 'place_a', 'poi_a', 1)).toMatchObject({ facing: 1 });
    // Anything that stands keeps the hand's turn.
    expect(placePropIntent(turnHand(takeProp(EMPTY_HAND, 'lantern'), 1), cube(5, 1, 3), 'place_a', 'poi_a', 3)).toMatchObject({ facing: 1 });
    expect(propPrompt(propType('torch')!, cube(5, 1, 3), null)).toMatch(/Click to hang a torch/);
  });

  it('is put out and lit by a Move click, in its own words', () => {
    const map = putProp(createMap(), { type: 'campfire', at: cube(3, 1, 3), facing: 0 });
    const id = map.props[0]!.id as string;
    expect(toggleLabel(map, id, new Set())).toBe('Put out the campfire');
    expect(toggleLabel(map, id, new Set([id]))).toBe('Light the campfire');
    expect(toggleIntent(map, id, new Set(), 'place_a', 'poi_a')).toMatchObject({ open: true });
  });
});

describe('stairs (D-350)', () => {
  it('climb toward the wall pointed at, and keep the hand\'s turn over a floor', () => {
    const hand = turnHand(takeProp(EMPTY_HAND, 'stairs'), -1);
    expect(placePropIntent(hand, cube(5, 1, 3), 'place_a', 'poi_a', 1)).toMatchObject({ type: 'stairs', facing: 1 });
    expect(placePropIntent(hand, cube(5, 1, 3), 'place_a', 'poi_a', null)).toMatchObject({ facing: 3 });
  });
});

