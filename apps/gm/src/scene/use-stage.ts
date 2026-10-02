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
} {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const frames = useRef<number[]>([]);
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
      // The interval between *renders*, which is what the screen shows. A
      // window of skipped ticks would read as a flattering 8 ms and mean
      // nothing.
      if (previous.current !== 0) frames.current = keepRecent(frames.current, since);
      previous.current = now;
      created.render();
    };
    loop();

    // Debug handle: the GM console only, and it exposes nothing the GM does not
    // already have on screen. Used to diagnose picking.
    (window as unknown as { __stage?: Stage }).__stage = created;

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

  return { setCanvas, stage, frames };
}
