// Moving and turning a place (R-203): pick it up, aim, set it down — and a
// right-click that puts it back by sending nothing at all.

import { describe, it, expect } from 'vitest';
import {
  emptyHanded, pickUp, turnCarried, canSetDown, setDownIntent, placesPrompt,
} from '@tt/client-core';
import { asFacing, turned } from '@tt/domain';
import type { WorldCell } from '@tt/domain';
import type { Carry } from '@tt/client-core';

const cell = (x: number, z: number): WorldCell => ({ cx: 15, cz: 15, x, z });
const HOME = cell(4, 4);
const carrying = pickUp('place_inn', HOME, 0);
/** The facing in hand, or null with nothing in hand. */
const facingOf = (carry: Carry) => (carry.step === 'carrying' ? carry.facing : null);

describe('which way a place faces', () => {
  it('turns a quarter at a time and comes back round', () => {
    expect(turned(0, 1)).toBe(1);
    expect(turned(3, 1)).toBe(0);
    expect(turned(0, -1)).toBe(3);
    expect(turned(2, 4)).toBe(2);
  });

  it('brings any whole number back into one turn', () => {
    // What the wire does with a facing it did not expect, rather than refuse
    // to open a campaign over which way a hut points.
    expect(asFacing(7)).toBe(3);
    expect(asFacing(-5)).toBe(3);
    expect(asFacing(Number.NaN)).toBe(0);
  });
});

describe('carrying a place', () => {
  it('starts facing the way it already faced', () => {
    expect(facingOf(pickUp('place_inn', HOME, 2))).toBe(2);
  });

  it('turns while carried, and only then', () => {
    expect(facingOf(turnCarried(carrying, 1))).toBe(1);
    // Empty-handed it hands back the same object, which is how the caller
    // knows to turn the facing for the *next* place instead.
    expect(turnCarried(emptyHanded, 1)).toBe(emptyHanded);
    expect(turnCarried(carrying, 0)).toBe(carrying);
  });

  it('will not set down on another place', () => {
    expect(canSetDown(carrying, 'place_mill')).toBe(false);
    expect(setDownIntent(carrying, cell(9, 9), 'place_mill')).toBeNull();
  });

  it('sets down on bare ground, moving it and keeping its facing', () => {
    expect(setDownIntent(turnCarried(carrying, 1), cell(9, 9), null)).toEqual({
      kind: 'movePlace', id: 'place_inn', cell: cell(9, 9), facing: 1,
    });
  });

  it('may be set back down on its own cell, which is how it is turned in place', () => {
    expect(canSetDown(carrying, 'place_inn')).toBe(true);
    expect(setDownIntent(turnCarried(carrying, -1), HOME, 'place_inn')).toEqual({
      kind: 'movePlace', id: 'place_inn', cell: HOME, facing: 3,
    });
  });

  it('sends nothing when it is put back exactly as it was', () => {
    // A pick-up-and-put-back is not an edit, and an edit that changes nothing
    // would still land in the undo history.
    expect(setDownIntent(carrying, HOME, 'place_inn')).toBeNull();
    // Four quarter turns is where it started.
    const roundTheClock = [1, 1, 1, 1].reduce((c, step) => turnCarried(c, step), carrying);
    expect(setDownIntent(roundTheClock, HOME, 'place_inn')).toBeNull();
  });

  it('sets nothing down from empty hands, or onto nothing', () => {
    expect(setDownIntent(emptyHanded, cell(1, 1), null)).toBeNull();
    expect(setDownIntent(carrying, null, null)).toBeNull();
  });
});

describe('what the readout says', () => {
  const inn = { id: 'place_inn', name: 'The Inn' };
  const mill = { id: 'place_mill', name: 'The Mill' };

  it('offers to pick up a place under the pointer', () => {
    expect(placesPrompt(emptyHanded, mill, null)).toBe('Click to pick up The Mill');
  });

  it('leaves bare ground to the ground readout', () => {
    expect(placesPrompt(emptyHanded, null, null)).toBeNull();
  });

  it('says why it will not set down on another place, before the click', () => {
    expect(placesPrompt(carrying, mill, 'The Inn')).toBe('The Mill is already here');
  });

  it('names the keys while carrying, over bare ground or its own cell', () => {
    for (const here of [null, inn]) {
      const prompt = placesPrompt(carrying, here, 'The Inn')!;
      expect(prompt).toContain('Set The Inn down here?');
      expect(prompt).toContain('Z / X');
      expect(prompt).toContain('right-click');
    }
  });
});
