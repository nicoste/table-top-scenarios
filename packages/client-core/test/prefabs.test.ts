// The Prefabs tool on the console (D-321): two corners to capture, a ghost
// and a click to place.

import { describe, it, expect } from 'vitest';
import type { BlockCoord, Prefab, SwatchId } from '@tt/domain';
import { capturePrefab, createMap, setBlocks } from '@tt/domain';
import {
  NOT_PLACING, turnPlacing, mirrorPlacing, prefabAim, prefabPreview, placeIntent, placePrompt,
  NO_CAPTURE, captureCorner, captureClick, captureBox, capturePrompt, describeBox, saveIntent,
} from '@tt/client-core';

const cube = (x: number, y: number, z: number): BlockCoord => ({ x, y, z });
/** A wooden post two high, in a box one wide. */
const post = (): Prefab => capturePrefab(
  setBlocks(createMap(), [cube(2, 1, 2), cube(2, 2, 2)], 'material:wood' as SwatchId), cube(2, 1, 2), cube(2, 2, 2),
  { name: 'Post' },
) as Prefab;

describe('capturing a box', () => {
  it('takes the first corner, then the second, and a third click starts again', () => {
    let capture = captureClick(NO_CAPTURE, cube(1, 1, 1));
    expect(capture).toEqual({ first: cube(1, 1, 1), second: null });
    capture = captureClick(capture, cube(4, 3, 2));
    expect(capture).toEqual({ first: cube(1, 1, 1), second: cube(4, 3, 2) });
    expect(captureClick(capture, cube(9, 1, 9))).toEqual({ first: cube(9, 1, 9), second: null });
  });

  it('outlines the box to the pointer until the second corner is down', () => {
    const capture = captureClick(NO_CAPTURE, cube(4, 3, 2));
    expect(captureBox(capture, cube(1, 1, 1))).toEqual({ min: cube(1, 1, 1), max: cube(4, 3, 2) });
    // Before any corner, the cube a click would take — so the tool never looks dead (D-324).
    expect(captureBox(NO_CAPTURE, cube(1, 1, 1))).toEqual({ min: cube(1, 1, 1), max: cube(1, 1, 1) });
    expect(captureBox(NO_CAPTURE, null)).toBeNull();
  });

  it('says the size as bare numbers, wide by tall by deep (D-316)', () => {
    expect(describeBox({ min: cube(1, 1, 1), max: cube(4, 3, 2) })).toBe('4 × 3 × 2');
    expect(capturePrompt(NO_CAPTURE, null)).toMatch(/one corner/);
    expect(capturePrompt(captureClick(NO_CAPTURE, cube(1, 1, 1)), cube(2, 1, 1))).toMatch(/2 × 1 × 1/);
  });

  it('sends a save only once both corners are down', () => {
    const half = captureClick(NO_CAPTURE, cube(1, 1, 1));
    expect(saveIntent(half, { name: 'Wall', tags: [] }, 'place_a', 'poi_a')).toBeNull();
    const whole = captureClick(half, cube(3, 2, 1));
    expect(saveIntent(whole, { name: 'Wall', tags: ['ruins'] }, 'place_a', 'poi_a')).toEqual({
      kind: 'savePrefab', placeId: 'place_a', poiId: 'poi_a',
      from: cube(1, 1, 1), to: cube(3, 2, 1), name: 'Wall', tags: ['ruins'],
    });
  });
});

describe('placing one', () => {
  it('turns with Z / X and mirrors', () => {
    expect(turnPlacing(NOT_PLACING, 1).facing).toBe(1);
    expect(turnPlacing(NOT_PLACING, -1).facing).toBe(3);
    expect(mirrorPlacing(mirrorPlacing(NOT_PLACING))).toEqual(NOT_PLACING);
  });

  it('sits against the face pointed at, where Build would put a block', () => {
    expect(prefabAim({ block: cube(3, 0, 3), adjacent: cube(3, 1, 3) } as never)).toEqual(cube(3, 1, 3));
    expect(prefabAim(null)).toBeNull();
  });

  it('previews every cube it puts down, and counts what falls outside the map', () => {
    const inside = prefabPreview(post(), cube(5, 1, 5), NOT_PLACING, createMap());
    expect(inside.cubes.map((c) => c.at)).toEqual(expect.arrayContaining([cube(5, 1, 5), cube(5, 2, 5)]));
    expect(inside.outside).toBe(0);
    const over = prefabPreview(post(), cube(-1, 1, 5), NOT_PLACING, createMap());
    expect(over.outside).toBe(2);
    expect(over.cubes.every((c) => c.outside)).toBe(true);
  });

  it('sends a placement only with a prefab in hand, turned and mirrored as shown', () => {
    expect(placeIntent(NOT_PLACING, cube(5, 1, 5), 'place_a', 'poi_a')).toBeNull();
    const placing = { ...mirrorPlacing(turnPlacing(NOT_PLACING, 1)), id: 'prefab_x', clear: true };
    expect(placeIntent(placing, cube(5, 1, 5), 'place_a', 'poi_a')).toEqual({
      kind: 'placePrefab', placeId: 'place_a', poiId: 'poi_a', id: 'prefab_x', at: cube(5, 1, 5),
      facing: 1, mirrored: true, clear: true,
    });
  });

  it('says what a click will do, and warns about what will be left out', () => {
    expect(placePrompt(null, null, 0)).toMatch(/Pick a prefab/);
    expect(placePrompt('Post', cube(1, 1, 1), 2)).toMatch(/2 of its blocks fall outside/);
  });
});

describe('a capture corner (D-323)', () => {
  const face = { block: cube(3, 0, 3), adjacent: cube(3, 1, 3) } as never;
  it('is the cube in front of the face, so a corner can be air', () => {
    expect(captureCorner(face, false)).toEqual(cube(3, 1, 3));
  });
  it('is the block itself with shift held, to take a floor too', () => {
    expect(captureCorner(face, true)).toEqual(cube(3, 0, 3));
    expect(captureCorner(null, true)).toBeNull();
  });
});
