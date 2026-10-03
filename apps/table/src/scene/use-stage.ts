// React owns the DOM; the Stage owns the canvas. One handoff, imperative after
// that (R-68). No react-three-fiber.
//
// The canvas is tracked in *state* via a callback ref, not in a ref. A ref does
// not re-render, so an effect keyed on it would run once — before a conditionally
// rendered canvas exists — and never again. State makes the canvas's arrival a
// dependency the effect can actually see.

import { useEffect, useRef, useState } from 'react';
import { Stage, FRAME_BUDGET_MS, FRAME_SLOP_MS } from '@tt/render';
import { keepRecent } from '@tt/client-core';

export function useStage(): {
  setCanvas: (canvas: HTMLCanvasElement | null) => void;
  stage: Stage | null;
  /**
   * Recent frame intervals in ms (R-166).
   *
   * Measured here because this owns the only per-frame callback there is, and
   * the interval between callbacks is the frame a viewer actually sees — the
   * time spent *inside* `render` would miss everything the browser does
   * between calls. Collected always, since a hitch cannot be measured by
   * switching the counter on after it has happened.
   */
  frames: { current: number[] };
  /**
   * When each frame was drawn (R-170).
   *
   * Separate from the intervals, because the window of intervals is counted
   * in samples: at two frames a second it holds a minute of history, and the
   * panel went on reporting thirty while the screen drew two. A rate has to
   * be measured against the clock, not against a sample count.
   */
  draws: { current: number[] };
} {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const frames = useRef<number[]>([]);
  const draws = useRef<number[]>([]);
  const previous = useRef(0);

  useEffect(() => {
    if (!canvas) return;
    const created = new Stage(canvas);
    setStage(created);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      // Capped (R-169). Asking for the next frame first, so a skipped tick
      // still keeps the loop alive.
      const since = previous.current === 0 ? Infinity : now - previous.current;
      if (since < FRAME_BUDGET_MS - FRAME_SLOP_MS) return;
      // Only when a frame was actually drawn (R-170). A still screen draws
      // twice a second, and the panel should say so — "2 fps" while nothing
      // is happening is the saving, reported rather than hidden.
      /*
       * A heartbeat frame counts as drawn — it is one — but it is not
       * sampled: its interval is the heartbeat rather than a cost, and it
       * would make an idle screen read as a half-second frame (D-230).
       */
      const kind = created.render();
      if (kind === 'skipped') return;
      draws.current = [...draws.current.filter((at) => now - at <= 2000), now];
      if (kind !== 'drawn') return;
      if (previous.current !== 0) frames.current = keepRecent(frames.current, since);
      previous.current = now;
    };
    loop();

    const observer = new ResizeObserver(() => created.resize());
    observer.observe(canvas);
    created.resize();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      created.dispose();
      setStage(null);
    };
  }, [canvas]);

  return { setCanvas, stage, frames, draws };
}
