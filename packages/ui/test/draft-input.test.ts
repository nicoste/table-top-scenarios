// When a draft becomes an edit (R-163).
//
// The component needs a DOM and there is none here, so the rule lives outside
// it and is tested on its own (R-23b). What is being protected: the GM reported
// that a level's height could not be retyped, because the field validated every
// keystroke and an empty box is not a number — so it put the old value straight
// back. There is no route from 3 to 12 that does not pass through 1.

import { describe, it, expect } from 'vitest';
import { commits } from '@tt/ui';

const whole = (draft: string) => Number.isInteger(Number.parseInt(draft, 10));

describe('commits', () => {
  it('says nothing happened when the field was never typed into', () => {
    // Tabbing through a field is not an edit, and dispatching for it would put
    // an entry in the undo history for a gesture that changed nothing.
    expect(commits(null, 'Roof')).toBe(false);
  });

  it('says nothing happened when the draft came back to where it started', () => {
    expect(commits('Roof', 'Roof')).toBe(false);
    expect(commits('Roof', 'Roof', (d) => d.length > 0)).toBe(false);
  });

  it('commits a finished draft that differs', () => {
    expect(commits('Rooftop', 'Roof')).toBe(true);
    expect(commits('12', '3', whole)).toBe(true);
  });

  it('commits an empty draft only when nothing says otherwise', () => {
    // Clearing a field is a real intention. Whether it is *allowed* is the
    // caller's business — a level needs a name, a note does not.
    expect(commits('', 'a note')).toBe(true);
    expect(commits('', 'Roof', (d) => d.trim().length > 0)).toBe(false);
  });

  it('judges only the finished draft, never the typing', () => {
    /*
     * The whole point. Every one of these fails on the way to a legal value,
     * and a field that rejected them as they were typed would be unusable —
     * which is exactly what the GM hit.
     */
    for (const halfway of ['', '-', '1']) {
      // They are only ever asked about once the GM has stopped.
      expect(commits(halfway, '3', whole), halfway).toBe(whole(halfway));
    }
    expect(commits('-3', '3', whole)).toBe(true);
    expect(commits('12', '3', whole)).toBe(true);
  });

  it('refuses a draft that is still not a number when the GM leaves', () => {
    expect(commits('abc', '3', whole)).toBe(false);
    expect(commits('', '3', whole)).toBe(false);
  });
});
