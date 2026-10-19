// Which end a press takes hold of (R-146, D-208).
//
// Extracted from the ladder because it is a rule, not a detail of a component
// (R-23b) — and because pressing a row and dragging a handle became one
// gesture, so this now decides the outcome of every press.

import { describe, it, expect } from 'vitest';
import { grabEnd, rowAt } from '@tt/client-core';

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

describe('rowAt (D-317)', () => {
  // Three rows, 20 px each, from y 100.
  const rows = [{ top: 100, bottom: 120 }, { top: 120, bottom: 140 }, { top: 140, bottom: 160 }];

  it('finds the row a pointer is over', () => {
    expect(rowAt(rows, 105)).toBe(0);
    expect(rowAt(rows, 130)).toBe(1);
    expect(rowAt(rows, 159)).toBe(2);
  });

  it('clamps past either end, so dragging off the ladder keeps responding', () => {
    expect(rowAt(rows, 10)).toBe(0);
    expect(rowAt(rows, 900)).toBe(2);
  });

  it('is nothing for a ladder with no rows', () => {
    expect(rowAt([], 130)).toBeNull();
  });

  it('answers from the boxes it is handed, so a ladder that moves mid-drag cannot throw the band back', () => {
    // The ladder slid 20 px down after the press; the pointer did not move.
    // Read from the boxes taken at the press, it is still over the same row.
    const atPress = rowAt(rows, 130);
    const moved = rows.map((row) => ({ top: row.top + 20, bottom: row.bottom + 20 }));
    expect(rowAt(rows, 130)).toBe(atPress);
    expect(rowAt(moved, 130)).not.toBe(atPress);
  });
});
