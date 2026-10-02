// What a screen is costing, as numbers a person can act on (R-166).
//
// The arithmetic lives here, away from the renderer that produces the samples
// and the panel that draws them, because it is the part with opinions in it
// (R-23b) — and because a frame counter that is wrong is worse than none: it
// sends you optimising the thing that was already fast.
//
// **Not mean FPS.** A mean hides the thing that hurts at a table. A screen can
// read sixty while visibly stuttering every time a map rebuilds, because one
// frame in forty took 200 ms and thirty-nine took four. The hitch is what the
// players see, so the headline is the slow end of the distribution.

/** Two seconds at 60Hz: long enough to catch a hitch, short enough to forget one. */
export const FRAME_WINDOW = 120;

export interface Frames {
  /** How many samples this is drawn from. */
  readonly frames: number;
  /** The median frame, as frames per second — the rate it *usually* runs at. */
  readonly fps: number;
  readonly p50: number;
  /** The slow end: one frame in twenty is at least this long. */
  readonly p95: number;
  readonly worst: number;
}

/** Adds a sample, keeping the most recent `cap`. */
export function keepRecent(
  window: readonly number[],
  next: number,
  cap = FRAME_WINDOW,
): number[] {
  const kept = window.length >= cap ? window.slice(window.length - cap + 1) : [...window];
  kept.push(next);
  return kept;
}

/**
 * Nearest-rank percentile: the smallest sample at least `p` of the way
 * through. No interpolation, so every number reported is a frame that really
 * happened — which matters when the next question is always "which frame?".
 */
function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]!;
}

export function summarise(window: readonly number[]): Frames | null {
  if (window.length === 0) return null;
  const sorted = [...window].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  return {
    frames: window.length,
    // From the median rather than the mean, so one 200 ms hitch does not drag
    // the headline down and hide that it is otherwise smooth. The hitch has
    // its own column.
    fps: p50 > 0 ? 1000 / p50 : 0,
    p50,
    p95: percentile(sorted, 95),
    worst: sorted[sorted.length - 1]!,
  };
}

/**
 * How many of these happened in the last second.
 *
 * For view pushes, where the rate is the number that explains everything else:
 * a drag that pushes fifteen times a second is doing fifteen times the work of
 * the one push anybody thought about.
 */
export function rate(stamps: readonly number[], now: number, overMs = 1000): number {
  return stamps.reduce((n, at) => (now - at <= overMs ? n + 1 : n), 0);
}
