// Wiring the cost overlay to this screen (R-166).
//
// Duplicated in both apps, like `use-stage` beside it and for the same reason:
// it is the handoff between React and things React does not own, and the two
// screens are different enough that sharing it would mean a parameter for
// every difference. Everything with an opinion in it — the percentiles, the
// windows, the rate — is in `@tt/client-core` and tested once.
//
// Off by default, and while it is off nothing is sampled: the frame window is
// collected regardless (a hitch cannot be measured after the fact) but
// `renderer.info` is not read and no state is set, so an unopened overlay
// costs a boolean.

import { useEffect, useState } from 'react';
import type { Stage } from '@tt/render';
import { FRAME_BUDGET_MS } from '@tt/render';
import { rate, summarise } from '@tt/client-core';
import type { Reading } from '@tt/ui';

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
export const COST_HINT = 'backtick closes this · shift+backtick occlusion · T surface figure';

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
   * It was off here on the strength of a laptop getting warm — measured
   * before frames were capped (R-169) and before they were drawn only when
   * something changed (R-170). Occlusion cost 19.7 ms of every frame at 120
   * a second then; it costs 4.8 ms of the frames actually drawn now, and this
   * screen draws two a second while the GM reads the map.
   *
   * And shading corners is what makes depth legible, which is worth more to
   * somebody placing cubes than to anybody watching.
   */
  const [occlusion, setOcclusion] = useState(true);
  /** The figure in a material's surface (R-177), on T. On, like occlusion. */
  const [figures, setFigures] = useState(true);
  const [reading, setReading] = useState<Reading | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const typing = (e.target as HTMLElement | null)?.tagName;
      if (typing && /^(INPUT|TEXTAREA|SELECT)$/.test(typing)) return;
      if (e.code === 'KeyT') { setFigures((drawn) => !drawn); return; }
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

  useEffect(() => {
    if (!on) { setReading(null); return undefined; }
    const take = () => {
      const cost = stage?.cost();
      setReading({
        frames: summarise(frames.current),
        calls: cost?.calls ?? 0,
        triangles: cost?.triangles ?? 0,
        geometries: cost?.geometries ?? 0,
        textures: cost?.textures ?? 0,
        programs: cost?.programs ?? 0,
        rebuildMs: cost?.rebuildMs ?? 0,
        blocks: cost?.blocks ?? 0,
        payload,
        pushes: rate(arrivals, performance.now()),
        drawn: rate(draws.current, performance.now()),
        heap: heapNow(),
        occlusion,
        figures,
        gpuMs: cost?.gpuMs ?? null,
        budgetMs: FRAME_BUDGET_MS,
      });
    };
    take();
    const timer = setInterval(take, SAMPLE_MS);
    return () => clearInterval(timer);
  }, [on, stage, frames, draws, occlusion, figures]);

  return { on, reading };
}
