// Cutting a picture to a card's shape (R-204). The canvas half is the
// browser's; which part of the picture is kept is a rule, and tested.

import { describe, it, expect } from 'vitest';
import {
  coverCrop, CARD_PICTURE_WIDTH, CARD_PICTURE_HEIGHT, MIN_FRAME_WIDTH,
  startingFrame, movedFrame, resizedFrame,
} from '@tt/client-core';
import type { Corner, Frame } from '@tt/client-core';

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

/** Is this frame still the card's shape and still inside a w × h picture? */
function honest(frame: Frame, w: number, h: number) {
  expect(frame.width / frame.height).toBeCloseTo(CARD, 6);
  expect(frame.x).toBeGreaterThanOrEqual(-1e-9);
  expect(frame.y).toBeGreaterThanOrEqual(-1e-9);
  expect(frame.x + frame.width).toBeLessThanOrEqual(w + 1e-9);
  expect(frame.y + frame.height).toBeLessThanOrEqual(h + 1e-9);
}

describe('the frame the GM moves (R-205)', () => {
  const W = 1200;
  const H = 800;
  const start = startingFrame(W, H, CARD);

  it('starts where the automatic cut was, so accepting at once changes nothing', () => {
    const auto = coverCrop(W, H, CARD);
    expect(start).toEqual({ x: auto.sx, y: auto.sy, width: auto.sw, height: auto.sh });
    honest(start, W, H);
  });

  it('moves with the pointer, and stops at the edges of the picture', () => {
    expect(movedFrame(start, 100, 0, W, H).x).toBeCloseTo(start.x + 100);
    // Full height already, so it cannot move up or down at all.
    expect(movedFrame(start, 0, 300, W, H).y).toBe(0);
    expect(movedFrame(start, -5000, 0, W, H).x).toBe(0);
    expect(movedFrame(start, 5000, 0, W, H).x).toBeCloseTo(W - start.width);
    honest(movedFrame(start, 5000, -5000, W, H), W, H);
  });

  it('keeps its size when it is moved', () => {
    const moved = movedFrame(start, -123, 45, W, H);
    expect(moved.width).toBe(start.width);
    expect(moved.height).toBe(start.height);
  });

  it('shrinks from a corner with the opposite corner held still', () => {
    const smaller = resizedFrame(start, 'se', -200, -200, W, H, CARD);
    expect(smaller.x).toBe(start.x);
    expect(smaller.y).toBe(start.y);
    expect(smaller.width).toBeLessThan(start.width);
    honest(smaller, W, H);

    const fromNorthWest = resizedFrame(start, 'nw', 150, 150, W, H, CARD);
    expect(fromNorthWest.x + fromNorthWest.width).toBeCloseTo(start.x + start.width);
    expect(fromNorthWest.y + fromNorthWest.height).toBeCloseTo(start.y + start.height);
    honest(fromNorthWest, W, H);
  });

  it('grows only as far as the picture goes in that direction', () => {
    const small: Frame = { x: 500, y: 300, width: 100, height: 140 };
    const grown = resizedFrame(small, 'se', 5000, 5000, W, H, CARD);
    // Bottom edge reached first: 800 − 300 = 500 tall.
    expect(grown.y + grown.height).toBeCloseTo(H);
    expect(grown.x).toBe(500);
    honest(grown, W, H);
  });

  it('follows whichever way the pointer went further', () => {
    const small: Frame = { x: 100, y: 100, width: 100, height: 140 };
    // Mostly sideways: the width follows the pointer.
    expect(resizedFrame(small, 'se', 60, 0, W, H, CARD).width).toBeCloseTo(160);
    // Mostly down: the height follows it, and the width with it.
    expect(resizedFrame(small, 'se', 0, 70, W, H, CARD).height).toBeCloseTo(210);
  });

  it('cannot be shrunk to a dot', () => {
    for (const corner of ['nw', 'ne', 'sw', 'se'] as Corner[]) {
      const tiny = resizedFrame(start, corner, corner.includes('w') ? 5000 : -5000, corner.includes('n') ? 5000 : -5000, W, H, CARD);
      expect(tiny.width, corner).toBeCloseTo(MIN_FRAME_WIDTH);
      honest(tiny, W, H);
    }
  });

  it('frames a picture smaller than the smallest frame whole, rather than leaving it', () => {
    const icon = startingFrame(20, 28, CARD);
    const squeezed = resizedFrame(icon, 'se', -100, -100, 20, 28, CARD);
    honest(squeezed, 20, 28);
    expect(squeezed.width).toBeCloseTo(20);
  });

  it('stays honest through any sequence of drags', () => {
    // A deterministic walk: every corner, every direction, large and small.
    let frame = start;
    const corners: Corner[] = ['nw', 'ne', 'sw', 'se'];
    for (let i = 0; i < 400; i += 1) {
      const dx = ((i * 37) % 301) - 150;
      const dy = ((i * 53) % 241) - 120;
      frame = i % 3 === 0
        ? movedFrame(frame, dx, dy, W, H)
        : resizedFrame(frame, corners[i % 4]!, dx, dy, W, H, CARD);
      honest(frame, W, H);
    }
  });
});

