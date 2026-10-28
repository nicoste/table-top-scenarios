// The handoff between React and what React does not own: the stage on its
// canvas (R-68), and the cost overlay that measures it (R-166).
//
// Here rather than in each app (D-377). Both apps carried their own copy, on
// the grounds that the two screens differed enough to need one each; by the
// time they were compared the copies differed by a debug line and a comment,
// and the comment was the stale one.

import { useEffect, useRef, useState } from 'react';
import type { LightShadows } from '@tt/domain';
import { nextShadows } from '@tt/domain';
import { Stage, FRAME_BUDGET_MS, FRAME_SLOP_MS, IDLE_HEARTBEAT_MS } from '@tt/render';
import { imageUrl } from '@tt/protocol';
import { keepRecent, rate, summarise } from '../metrics/index.js';

// -- the stage ----------------------------------------------------------------
//
// React owns the DOM; the Stage owns the canvas. One handoff, imperative after
// that (R-68). No react-three-fiber.
//
// The canvas is tracked in *state* via a callback ref, not in a ref. A ref does
// not re-render, so an effect keyed on it would run once — before a conditionally
// rendered canvas exists — and never again. State makes the canvas's arrival a
// dependency the effect can actually see.

export function useStage(): {
  setCanvas: (canvas: HTMLCanvasElement | null) => void;
  /**
   * The canvas once it is mounted — from state, for the reason above — for the
   * listeners a shell has to attach itself rather than through React: the
   * wheel's, which must not be passive.
   */
  canvas: HTMLCanvasElement | null;
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
  const drawnBefore = useRef(false);
  const previous = useRef(0);

  useEffect(() => {
    if (!canvas) return;
    const created = new Stage(canvas);
    // Where cards' pictures come from: the host that served this page (R-204).
    created.setPictureSource(imageUrl);
    setStage(created);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      // Capped (R-169). Asking for the next frame first, so a skipped tick
      // still keeps the loop alive.
      const since = previous.current === 0 ? Infinity : now - previous.current;
      if (since < FRAME_BUDGET_MS - FRAME_SLOP_MS) return;
      const kind = created.render();
      if (kind === 'skipped') return;
      /*
       * The clock moves on for *any* frame drawn, heartbeat included. It used
       * to move only for real ones, so the first frame after a quiet minute
       * measured the whole minute and the panel reported a ten-second frame
       * (D-231).
       */
      previous.current = now;
      draws.current = [...draws.current.filter((at) => now - at <= 2000), now];
      /*
       * Sampled only when this frame *and* the one before it were real, and
       * only when they were close enough together to be a frame rate at all.
       * An interval longer than the heartbeat cannot be a slow frame — the
       * heartbeat guarantees a draw sooner than that — so it is a gap in
       * drawing, which is what `drawn` is for (R-170, D-230).
       */
      const measurable = kind === 'drawn' && drawnBefore.current && since <= IDLE_HEARTBEAT_MS;
      drawnBefore.current = kind === 'drawn';
      if (measurable) frames.current = keepRecent(frames.current, since);
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

  return { setCanvas, canvas, stage, frames, draws };
}

// -- the cost overlay ---------------------------------------------------------
//
// Wiring the cost overlay to a screen (R-166). Everything with an opinion in
// it — the percentiles, the windows, the rate — is in `metrics` and tested.
//
// Off by default, and while it is off nothing is sampled: the frame window is
// collected regardless (a hitch cannot be measured after the fact) but
// `renderer.info` is not read and no state is set, so an unopened overlay
// costs a boolean.

/** Four times a second: fast enough to watch, slow enough not to be the cost. */
const SAMPLE_MS = 250;

/*
 * Matched by **position**, not by character.
 *
 * `e.key` for this key is a backtick unshifted and a tilde shifted, so a check
 * against the character turned the shifted binding off before it could look at
 * the modifier — shift+backtick simply did nothing (D-224). `e.code` is the
 * key in that place whatever the layout says, which is the convention the rest
 * of the console already follows for its digits and brackets.
 */
export const COST_CODE = 'Backquote';
export const COST_HINT = 'backtick closes this · shift+backtick occlusion · T surface figure · L light shadows: soft, real, none';

/*
 * Traffic is recorded where the socket is and read where the overlay is, and
 * those are different components. A module-level recorder rather than a prop
 * threaded through everything in between: it is a diagnostic, it is per-page
 * by construction, and the alternative is changing four signatures to carry a
 * number nothing else wants.
 */
let payload = 0;
let arrivals: number[] = [];

export function recordTraffic(chars: number): void {
  payload = chars;
  const now = performance.now();
  arrivals = [...arrivals.filter((at) => now - at <= 2000), now];
}

/** Chrome and Edge only, and coarse by design. No browser reports GPU memory. */
function heapNow(): number | null {
  const perf = performance as unknown as { memory?: { usedJSHeapSize?: number } };
  return perf.memory?.usedJSHeapSize ?? null;
}

/** The switches a reading reports, so an A/B is legible. */
interface Switches {
  readonly occlusion: boolean;
  readonly figures: boolean;
  readonly lampShadows: LightShadows;
}

/**
 * One sample of what this screen costs.
 *
 * Its shape is `@tt/ui`'s `Reading`, which this package may not name (R-5):
 * the app hands one to the other, and that is where the compiler holds the
 * two to each other.
 */
function sample(stage: Stage | null, frames: readonly number[], draws: readonly number[], switches: Switches) {
  const cost = stage?.cost();
  const now = performance.now();
  return {
    frames: summarise(frames),
    calls: cost?.calls ?? 0,
    triangles: cost?.triangles ?? 0,
    geometries: cost?.geometries ?? 0,
    textures: cost?.textures ?? 0,
    programs: cost?.programs ?? 0,
    rebuildMs: cost?.rebuildMs ?? 0,
    rebuilds: cost?.rebuilds ?? 0,
    blocks: cost?.blocks ?? 0,
    payload,
    pushes: rate(arrivals, now),
    drawn: rate(draws, now),
    heap: heapNow(),
    ...switches,
    gpuMs: cost?.gpuMs ?? null,
    budgetMs: FRAME_BUDGET_MS,
  };
}

export type Reading = ReturnType<typeof sample>;

export function useCost(
  stage: Stage | null,
  frames: { current: number[] },
  draws: { current: number[] },
): {
  on: boolean;
  reading: Reading | null;
} {
  const [on, setOn] = useState(false);
  /*
   * Ambient occlusion costs time every frame rather than once at build
   * (R-168), and the only machine whose answer matters is the one driving the
   * table. A switch beside the numbers is what makes that measurable by the
   * person standing in front of it.
   *
   * **On by default, on both screens** (D-234).
   *
   * It was off on the console on the strength of a laptop getting warm —
   * measured before frames were capped (R-169) and before they were drawn
   * only when something changed (R-170). Occlusion cost 19.7 ms of every
   * frame at 120 a second then; it costs 4.8 ms of the frames actually drawn
   * now, and the console draws two a second while the GM reads the map.
   *
   * And shading corners is what makes depth legible, which is worth more to
   * somebody placing cubes than to anybody watching.
   */
  const [occlusion, setOcclusion] = useState(true);
  /** The figure in a material's surface (R-177), on T. On, like occlusion. */
  const [figures, setFigures] = useState(true);
  /**
   * How lights are shaded (D-339), stepped by L: soft, real, none, and round
   * again. **Soft to start, never real**: every real lamp is six more passes
   * over the scene each time something it lights moves, and this screen's
   * computer is the one to say whether it can afford them (D-338).
   */
  const [lampShadows, setLampShadows] = useState<LightShadows>('soft');
  const [reading, setReading] = useState<Reading | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const typing = (e.target as HTMLElement | null)?.tagName;
      if (typing && /^(INPUT|TEXTAREA|SELECT)$/.test(typing)) return;
      if (e.code === 'KeyT') { setFigures((drawn) => !drawn); return; }
      if (e.code === 'KeyL') { setLampShadows(nextShadows); return; }
      if (e.code !== COST_CODE) return;
      // Not while the GM is naming something: a backtick belongs to the field.
      const to = e.target as HTMLElement | null;
      if (to && /^(INPUT|TEXTAREA|SELECT)$/.test(to.tagName)) return;
      if (e.shiftKey) setOcclusion((lit) => !lit);
      else setOn((showing) => !showing);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { stage?.setOcclusion(occlusion); }, [stage, occlusion]);
  useEffect(() => { stage?.setFigures(figures); }, [stage, figures]);
  useEffect(() => { stage?.setLampShadows(lampShadows); }, [stage, lampShadows]);

  useEffect(() => {
    if (!on) { setReading(null); return undefined; }
    const take = () => {
      setReading(sample(stage, frames.current, draws.current, { occlusion, figures, lampShadows }));
    };
    take();
    const timer = setInterval(take, SAMPLE_MS);
    return () => clearInterval(timer);
  }, [on, stage, frames, draws, occlusion, figures, lampShadows]);

  return { on, reading };
}
