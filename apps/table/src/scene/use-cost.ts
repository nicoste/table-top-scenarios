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
export const COST_HINT = 'backtick closes this · shift+backtick toggles occlusion';

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
   * **On by default here, and off on the console** (D-233). The two screens
   * have different jobs: this one is a stage the players look at, and it is
   * still for minutes at a time — so with frames drawn on demand (R-170) the
   * occlusion costs nothing at all while nobody is touching anything. The
   * console is a tool being worked in, where every cube placed already pays
   * for a rebuild.
   */
  const [occlusion, setOcclusion] = useState(true);
  const [reading, setReading] = useState<Reading | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== COST_CODE || e.metaKey || e.ctrlKey || e.altKey) return;
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
        gpuMs: cost?.gpuMs ?? null,
        budgetMs: FRAME_BUDGET_MS,
      });
    };
    take();
    const timer = setInterval(take, SAMPLE_MS);
    return () => clearInterval(timer);
  }, [on, stage, frames, draws, occlusion]);

  return { on, reading };
}
