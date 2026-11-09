import { describe, it, expect } from 'vitest';
import { browserIsEnough } from '@tt/client-core';

describe('browserIsEnough (D-386)', () => {
  it('lets a screen start where colour mixing and :has() both work', () => {
    expect(browserIsEnough(() => true)).toBe(true);
  });

  it('keeps it from starting where either is missing, so the page says why', () => {
    expect(browserIsEnough((condition) => !condition.includes('color-mix'))).toBe(false);
    expect(browserIsEnough((condition) => !condition.includes(':has'))).toBe(false);
  });

  it('counts a browser that cannot even ask as too old', () => {
    expect(browserIsEnough(() => { throw new Error('not supported'); })).toBe(false);
  });
});
