// Which end a press takes hold of (R-146, D-208).
//
// Extracted from the ladder because it is a rule, not a detail of a component
// (R-23b) — and because pressing a row and dragging a handle became one
// gesture, so this now decides the outcome of every press.

import { describe, it, expect } from 'vitest';
import { grabEnd } from '@tt/client-core';

const band = { lower: 0, upper: 8 };

describe('grabEnd', () => {
  it('takes the handle you pressed on', () => {
    // The case that lets one gesture serve both: a press on a handle can only
    // mean that handle, because nothing is nearer to it than itself.
    expect(grabEnd(band, 0)).toBe('lower');
    expect(grabEnd(band, 8)).toBe('upper');
  });

  it('takes the nearer end from anywhere else', () => {
    expect(grabEnd(band, 1)).toBe('lower');
    expect(grabEnd(band, 7)).toBe('upper');
  });

  it('reaches out to a press beyond either end', () => {
    // Pressing below the band brings the bottom down to meet you, rather than
    // dragging the top past it.
    expect(grabEnd(band, -16)).toBe('lower');
    expect(grabEnd(band, 32)).toBe('upper');
  });

  it('answers the halfway press the same way every time', () => {
    // Exactly between the two. Either end is defensible; a press that
    // sometimes grabs one and sometimes the other is not.
    expect(grabEnd(band, 4)).toBe('lower');
    expect(grabEnd(band, 4)).toBe('lower');
    expect(grabEnd({ lower: -16, upper: 32 }, 8)).toBe('lower');
  });

  it('works below zero, where the bug lived', () => {
    const deep = { lower: -16, upper: 0 };
    expect(grabEnd(deep, -16)).toBe('lower');
    expect(grabEnd(deep, 0)).toBe('upper');
    expect(grabEnd(deep, -2)).toBe('upper');
  });
});
