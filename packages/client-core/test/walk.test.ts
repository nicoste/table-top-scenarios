// The walk shown while a move is aimed (R-209): a bare number, or no path.

import { describe, it, expect } from 'vitest';
import type { BlockCoord } from '@tt/domain';
import { createMap, setBlocks, DEFAULT_FLOOR } from '@tt/domain';
import { NO_PATH, walkLength, walkShown } from '@tt/client-core';

const cube = (x: number, y: number, z: number): BlockCoord => ({ x, y, z });

describe('the length, as the readout says it (D-316)', () => {
  it('is a bare number, to one decimal, and none when whole', () => {
    expect(walkLength(7)).toBe('7');
    expect(walkLength(3 * Math.SQRT2)).toBe('4.2');
    expect(walkLength(2.96)).toBe('3');
    expect(walkLength(0.3)).toBe('0.3');
  });
});

describe('what a move being aimed shows', () => {
  it('the floors on the way and how far', () => {
    const shown = walkShown(createMap(), cube(1, 1, 1), cube(4, 1, 4));
    expect(shown?.label).toBe('4.2');
    expect(shown?.cubes).toHaveLength(4);
    expect(shown?.to).toEqual(cube(4, 1, 4));
  });

  it('no path, and nothing drawn, when nothing connects them', () => {
    // A pillar two blocks high: its top cannot be walked to.
    const map = setBlocks(createMap(), [cube(5, 1, 5), cube(5, 2, 5)], DEFAULT_FLOOR);
    expect(walkShown(map, cube(1, 1, 1), cube(5, 3, 5))).toEqual({ to: cube(5, 3, 5), cubes: [], label: NO_PATH });
  });

  it('nothing with nobody to measure from, nowhere aimed, or the aim on their own cube', () => {
    expect(walkShown(createMap(), null, cube(4, 1, 4))).toBeNull();
    expect(walkShown(createMap(), cube(1, 1, 1), null)).toBeNull();
    expect(walkShown(null, cube(1, 1, 1), cube(4, 1, 4))).toBeNull();
    expect(walkShown(createMap(), cube(1, 1, 1), cube(1, 1, 1))).toBeNull();
  });

  it('keeps to the floors the screen allows', () => {
    expect(walkShown(createMap(), cube(1, 1, 1), cube(4, 1, 4), (at) => at.x < 3)?.label).toBe(NO_PATH);
  });
});

describe('what a jump being aimed shows (D-371)', () => {
  it('an arc from the token, no floors, and the straight distance', () => {
    const shown = walkShown(createMap(), cube(1, 5, 1), cube(4, 1, 1), undefined, undefined, true);
    expect(shown).toEqual({ to: cube(4, 1, 1), cubes: [], label: '5', jumpFrom: cube(1, 5, 1) });
  });

  it('is always there to be shown, where no walk is', () => {
    const map = setBlocks(createMap(), [cube(5, 1, 5), cube(5, 2, 5)], DEFAULT_FLOOR);
    expect(walkShown(map, cube(1, 1, 1), cube(5, 3, 5))?.label).toBe(NO_PATH);
    expect(walkShown(map, cube(1, 1, 1), cube(5, 3, 5), undefined, undefined, true)?.label).toBe('6');
  });
});

