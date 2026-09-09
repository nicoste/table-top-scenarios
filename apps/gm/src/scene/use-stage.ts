// React owns the DOM; the Stage owns the canvas. One handoff, imperative after
// that (R-68). No react-three-fiber.
//
// The canvas is tracked in *state* via a callback ref, not in a ref. A ref does
// not re-render, so an effect keyed on it would run once — before a conditionally
// rendered canvas exists — and never again. State makes the canvas's arrival a
// dependency the effect can actually see.

import { useEffect, useState } from 'react';
import { Stage } from '@tt/render';

export function useStage(): {
  setCanvas: (canvas: HTMLCanvasElement | null) => void;
  stage: Stage | null;
} {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);

  useEffect(() => {
    if (!canvas) return;
    const created = new Stage(canvas);
    setStage(created);

    let raf = 0;
    const loop = () => { created.render(); raf = requestAnimationFrame(loop); };
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

  return { setCanvas, stage };
}
