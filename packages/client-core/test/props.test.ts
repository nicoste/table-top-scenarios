// The Props tool on the console, and the door a Play click opens (D-322, D-328).

import { describe, it, expect } from 'vitest';
import type { BlockCoord, EncounterMap, SwatchId } from '@tt/domain';
import { createMap, setBlocks, putProp, propType, DEFAULT_FLOOR } from '@tt/domain';
import {
  EMPTY_HAND, takeProp, turnHand, propAim, propWall, propPreview, placePropIntent, propPrompt, toggleIntent, toggleLabel,
  paintPropIntent, paintPropPrompt, propMovePreview, propMoveIntent, propMovePrompt,
} from '@tt/client-core';

const cube = (x: number, y: number, z: number): BlockCoord => ({ x, y, z });
const withDoor = (): EncounterMap => putProp(createMap(), { type: 'door', at: cube(5, 1, 7), facing: 1 });

describe('the prop in hand', () => {
  it('is taken from the catalogue in its first paint, and put back by picking it again', () => {
    const hand = takeProp(EMPTY_HAND, 'door');
    expect(hand).toEqual({ type: 'door', facing: 0, paint: null, flame: null });
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
    expect(fine.ghost).toEqual({ type: 'door', at: cube(3, 1, 3), facing: 1, paint: null, flame: null, refused: false });
    const walled = setBlocks(map, [cube(3, 2, 3)], DEFAULT_FLOOR as SwatchId);
    const refused = propPreview(walled, hand, cube(3, 1, 3), new Set())!;
    expect(refused.why).toBe('a block is in the way');
    expect(refused.ghost.refused).toBe(true);
    expect(propPreview(map, EMPTY_HAND, cube(3, 1, 3), new Set())).toBeNull();
  });

  it('sends a placement only with a prop in hand, turned and painted as shown', () => {
    expect(placePropIntent(EMPTY_HAND, cube(3, 1, 3), 'place_a', 'poi_a')).toBeNull();
    const hand = { ...turnHand(takeProp(EMPTY_HAND, 'door'), 1), paint: 'material:mineral/iron' as SwatchId };
    expect(placePropIntent(hand, cube(3, 1, 3), 'place_a', 'poi_a')).toEqual({
      kind: 'placeProp', placeId: 'place_a', poiId: 'poi_a', type: 'door', at: cube(3, 1, 3), facing: 1, paint: 'material:mineral/iron',
    });
    expect(propPrompt(propType('door')!, cube(3, 1, 3), null)).toMatch(/Click to place a door/);
    expect(propPrompt(propType('candles')!, null, null)).toMatch(/^Placing candles/);
    expect(propPrompt(null, null, null)).toMatch(/Pick a prop/);
  });
});

describe('a Play click on a door (D-328, D-354)', () => {
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

  it('is put out and lit by a Play click, in its own words', () => {
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

describe('painting a prop (D-352)', () => {
  it('in hand: placed in the paint and flame chosen, or its first', () => {
    const hand = { ...takeProp(EMPTY_HAND, 'lantern'), paint: 'material:mineral/copper' as SwatchId, flame: 'cold' };
    expect(placePropIntent(hand, cube(3, 1, 3), 'place_a', 'poi_a')).toMatchObject({ paint: 'material:mineral/copper', flame: 'cold' });
    expect(placePropIntent(takeProp(hand, 'chest'), cube(3, 1, 3), 'place_a', 'poi_a')).not.toHaveProperty('paint');
    expect(propPreview(createMap(), hand, cube(3, 1, 3), new Set())!.ghost).toMatchObject({ paint: 'material:mineral/copper', flame: 'cold' });
  });

  it('with the Paint tool: that prop alone, one click, nothing when it is that already', () => {
    const map = putProp(createMap(), { type: 'chest', at: cube(3, 1, 3), facing: 0 });
    const id = map.props[0]!.id as string;
    const brick = 'material:brick' as SwatchId;
    expect(paintPropIntent(map, id, brick, 'place_a', 'poi_a')).toEqual({
      kind: 'editProp', placeId: 'place_a', poiId: 'poi_a', id, paint: brick,
    });
    expect(paintPropPrompt(map, id, brick)).toBe('Click to paint the chest Clay.');
    expect(paintPropIntent(map, id, 'material:wood' as SwatchId, 'place_a', 'poi_a')).toBeNull();
    expect(paintPropPrompt(map, id, 'material:wood' as SwatchId)).toBe('Chest: already Oak.');
    expect(paintPropIntent(map, 'prop_nobody', brick, 'place_a', 'poi_a')).toBeNull();
  });
});

describe('dragging a prop (D-354)', () => {
  it('shows it and what it carries where they would land, sends the move only where it may go', () => {
    let map = putProp(createMap(), { type: 'barrel', at: cube(3, 1, 3), facing: 0 });
    map = putProp(map, { type: 'candles', at: cube(3, 2, 3), facing: 0 });
    map = setBlocks(map, [cube(6, 1, 3)], DEFAULT_FLOOR as SwatchId);
    const id = map.props[0]!.id as string;
    const none = new Set<string>();
    expect(propMovePreview(map, { id, at: null }, none)).toBeNull();
    expect(propMovePreview(map, { id, at: cube(3, 1, 3) }, none)).toBeNull();
    expect(propMovePrompt(map, { id, at: null }, none)).toMatch(/^Moving the barrel and what is on it/);
    const fine = propMovePreview(map, { id, at: cube(4, 1, 5) }, none)!;
    expect(fine.why).toBeNull();
    expect(fine.ghosts.map((ghost) => ghost.at)).toEqual([cube(4, 1, 5), cube(4, 2, 5)]);
    expect(fine.box).toEqual({ min: cube(4, 1, 5), max: cube(4, 2, 5) });
    expect(propMoveIntent(map, { id, at: cube(4, 1, 5) }, none, 'place_a', 'poi_a')).toEqual({
      kind: 'moveProp', placeId: 'place_a', poiId: 'poi_a', id, at: cube(4, 1, 5),
    });
    expect(propMovePrompt(map, { id, at: cube(4, 1, 5) }, none)).toBe('Let go to move the barrel and what is on it here.');
    const walled = propMovePreview(map, { id, at: cube(6, 1, 3) }, none)!;
    expect(walled.why).toBe('a block is in the way');
    expect(walled.ghosts.every((ghost) => ghost.refused)).toBe(true);
    expect(propMoveIntent(map, { id, at: cube(6, 1, 3) }, none, 'place_a', 'poi_a')).toBeNull();
  });
});

describe('a prop\'s face offers only what fits (D-356)', () => {
  it('in hand: no preview where it could not stand, where a block\'s face says why', () => {
    // Bars on the floor; the cube in front of their upper half is air.
    const map = putProp(createMap(), { type: 'bars', at: cube(8, 1, 5), facing: 1 });
    const hand = takeProp(EMPTY_HAND, 'cell-door');
    expect(propPreview(map, hand, cube(9, 2, 5), new Set(), null, true)).toBeNull();
    expect(propPreview(map, hand, cube(9, 2, 5), new Set())!.why).toBe('nothing under it or beside it to hold it');
    // In front of them on the floor, it fits, and is offered from their face too.
    expect(propPreview(map, hand, cube(9, 1, 5), new Set(), null, true)!.why).toBeNull();
  });

  it('dragged: no ghost where it could not land', () => {
    let map = putProp(createMap(), { type: 'bars', at: cube(8, 1, 5), facing: 1 });
    map = putProp(map, { type: 'chair', at: cube(3, 1, 3), facing: 0 });
    const id = map.props[1]!.id as string;
    expect(propMovePreview(map, { id, at: cube(9, 2, 5), onProp: true }, new Set())).toBeNull();
    expect(propMovePreview(map, { id, at: cube(9, 2, 5) }, new Set())!.why).not.toBeNull();
    expect(propMovePreview(map, { id, at: cube(9, 1, 5), onProp: true }, new Set())!.why).toBeNull();
  });
});

