// The arithmetic behind the overlay (R-166).
//
// Worth testing rather than eyeballing, because a frame counter that is wrong
// is worse than none: it sends you optimising something that was already fast.

import { describe, it, expect } from 'vitest';
import { keepRecent, summarise, rate, FRAME_WINDOW } from '@tt/client-core';

describe('summarise', () => {
  it('has nothing to say before the first frame', () => {
    expect(summarise([])).toBeNull();
  });

  it('reports the rate the screen usually runs at', () => {
    const steady = Array.from({ length: 60 }, () => 16.7);
    const frames = summarise(steady)!;
    expect(frames.fps).toBeCloseTo(59.9, 0);
    expect(frames.p50).toBeCloseTo(16.7);
    expect(frames.p95).toBeCloseTo(16.7);
  });

  it('keeps a hitch out of the headline and in its own column', () => {
    /*
     * The whole reason this is not a mean. Thirty-nine good frames and one
     * terrible one is exactly what a map rebuild looks like, and a mean would
     * report 20 fps for a screen that is smooth except for one visible jolt.
     * The GM needs to know both things, separately.
     */
    const mostlyFine = [...Array.from({ length: 39 }, () => 4), 200];
    const frames = summarise(mostlyFine)!;
    expect(frames.p50).toBe(4);
    expect(frames.fps).toBe(250);
    expect(frames.worst).toBe(200);
    const mean = mostlyFine.reduce((a, b) => a + b, 0) / mostlyFine.length;
    expect(mean).toBeGreaterThan(8);
  });

  it('puts one frame in twenty at or past p95', () => {
    // Nearest-rank, so every number reported is a frame that really happened.
    const window = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(summarise(window)!.p95).toBe(95);
    expect(summarise(window)!.worst).toBe(100);
    expect(summarise(window)!.p50).toBe(50);
  });

  it('survives a single sample', () => {
    const frames = summarise([8])!;
    expect(frames.p50).toBe(8);
    expect(frames.p95).toBe(8);
    expect(frames.worst).toBe(8);
    expect(frames.frames).toBe(1);
  });

  it('does not divide by a frame that took no time', () => {
    expect(summarise([0])!.fps).toBe(0);
  });
});

describe('keepRecent', () => {
  it('forgets the oldest once the window is full', () => {
    let window: number[] = [];
    for (let i = 0; i < FRAME_WINDOW + 10; i += 1) window = keepRecent(window, i);
    expect(window).toHaveLength(FRAME_WINDOW);
    expect(window[0]).toBe(10);
    expect(window[window.length - 1]).toBe(FRAME_WINDOW + 9);
  });

  it('is a window, not a log: a slow minute ago is not this second', () => {
    // A hitch that scrolls out of the window stops being reported, which is
    // the point — the overlay says what is happening, not what once did.
    let window = keepRecent([], 500, 3);
    for (const ms of [4, 4, 4]) window = keepRecent(window, ms, 3);
    expect(summarise(window)!.worst).toBe(4);
  });
});

describe('rate', () => {
  it('counts only what happened inside the window', () => {
    const now = 10_000;
    expect(rate([9_500, 9_800, 9_999], now)).toBe(3);
    expect(rate([8_000, 9_500], now)).toBe(1);
    expect(rate([], now)).toBe(0);
  });

  it('counts a stamp exactly on the edge', () => {
    expect(rate([9_000], 10_000)).toBe(1);
    expect(rate([8_999], 10_000)).toBe(0);
  });
});
