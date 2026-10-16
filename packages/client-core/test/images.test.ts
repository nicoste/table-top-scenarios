// Cutting a picture to a card's shape (R-204). The canvas half is the
// browser's; which part of the picture is kept is a rule, and tested.

import { describe, it, expect } from 'vitest';
import { coverCrop, CARD_PICTURE_WIDTH, CARD_PICTURE_HEIGHT } from '@tt/client-core';

const CARD = 5 / 7;

describe('cutting a picture to a card', () => {
  it('is a 5:7 card, small', () => {
    expect(CARD_PICTURE_WIDTH / CARD_PICTURE_HEIGHT).toBeCloseTo(CARD, 2);
    expect(CARD_PICTURE_WIDTH).toBeLessThanOrEqual(512);
  });

  it('keeps a picture that is already the shape whole', () => {
    expect(coverCrop(500, 700, CARD)).toEqual({ sx: 0, sy: 0, sw: 500, sh: 700 });
  });

  it('trims a wide picture evenly from both sides', () => {
    const crop = coverCrop(1000, 700, CARD);
    expect(crop.sw).toBeCloseTo(500);
    expect(crop.sh).toBe(700);
    expect(crop.sx).toBeCloseTo(250);
    expect(crop.sx + crop.sw).toBeCloseTo(750);
  });

  it('trims a tall picture mostly from the bottom, where the face is not', () => {
    // A full-length portrait: 500 wide, 1300 tall, so 600 must go.
    const crop = coverCrop(500, 1300, CARD);
    expect(crop.sh).toBeCloseTo(700);
    expect(crop.sy).toBeCloseTo(200);
    // A third off the top, two thirds off the bottom.
    expect(1300 - (crop.sy + crop.sh)).toBeCloseTo(400);
  });

  it('never stretches: what it keeps is always the card shape', () => {
    for (const [w, h] of [[1920, 1080], [300, 2000], [640, 640], [1, 1]] as const) {
      const crop = coverCrop(w, h, CARD);
      expect(crop.sw / crop.sh, `${w}x${h}`).toBeCloseTo(CARD, 5);
      expect(crop.sx).toBeGreaterThanOrEqual(0);
      expect(crop.sy).toBeGreaterThanOrEqual(0);
      expect(crop.sx + crop.sw).toBeLessThanOrEqual(w + 1e-9);
      expect(crop.sy + crop.sh).toBeLessThanOrEqual(h + 1e-9);
    }
  });

  it('does nothing foolish with an empty picture', () => {
    expect(coverCrop(0, 0, CARD)).toEqual({ sx: 0, sy: 0, sw: 0, sh: 0 });
  });
});
