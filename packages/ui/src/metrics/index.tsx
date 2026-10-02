// What this screen is costing, on the screen itself (R-166).
//
// The GM asked for this before any visual work, to find out whether what we
// build is cheap — and they were right to, though the first measurement was
// taken by hand and found something nobody would have guessed (D-217). The
// point of having it here instead is that the numbers are read on the machine
// that matters: the table display, which may be a modest box driving a TV and
// which nobody is sitting in front of with a profiler.
//
// Presentational, like everything in this package: it is handed a reading and
// draws it. What the numbers mean, and whether they are good, is the app's.

import type { Frames } from './kinds.js';

export interface Reading {
  /** Frame times, summarised. `null` before the first frame. */
  readonly frames: Frames | null;
  readonly calls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly programs: number;
  /** Milliseconds the last map body took to build. */
  readonly rebuildMs: number;
  readonly blocks: number;
  /** Bytes in the last view that arrived, and how many arrived this second. */
  readonly payload: number;
  readonly pushes: number;
  /** JS heap in bytes where the browser offers it — not GPU memory, which no
   *  browser offers at all. */
  readonly heap: number | null;
}

export interface MetricsProps {
  readonly reading: Reading;
  /** What switches it off again, for the line at the bottom. */
  readonly hint: string;
}

const ms = (n: number) => `${n.toFixed(1)} ms`;
const kib = (n: number) => `${(n / 1024).toFixed(1)} KiB`;
const count = (n: number) => n.toLocaleString();

export function Metrics({ reading, hint }: MetricsProps) {
  const { frames } = reading;
  return (
    <div className="metrics">
      <h2>Cost</h2>
      <dl>
        {/* The headline is the median, and the hitch gets its own row — a
            screen can read sixty and still jolt every time a map rebuilds. */}
        <dt>rate</dt>
        <dd>{frames ? `${frames.fps.toFixed(0)} fps` : '—'}</dd>
        <dt>frame p50</dt>
        <dd>{frames ? ms(frames.p50) : '—'}</dd>
        <dt>frame p95</dt>
        <dd className={frames && frames.p95 > 20 ? 'warn' : ''}>
          {frames ? ms(frames.p95) : '—'}
        </dd>
        <dt>worst</dt>
        <dd className={frames && frames.worst > 50 ? 'warn' : ''}>
          {frames ? ms(frames.worst) : '—'}
        </dd>

        <dt>draw calls</dt>
        <dd>{count(reading.calls)}</dd>
        <dt>triangles</dt>
        <dd>{count(reading.triangles)}</dd>
        <dt>cubes</dt>
        <dd>{count(reading.blocks)}</dd>

        {/* Climbing while nothing is created is the signature of a leak. */}
        <dt>geometries</dt>
        <dd>{count(reading.geometries)}</dd>
        <dt>textures</dt>
        <dd>{count(reading.textures)}</dd>
        <dt>shaders</dt>
        <dd>{count(reading.programs)}</dd>

        <dt>last rebuild</dt>
        <dd className={reading.rebuildMs > 20 ? 'warn' : ''}>{ms(reading.rebuildMs)}</dd>
        <dt>last push</dt>
        <dd>{kib(reading.payload)}</dd>
        <dt>pushes/s</dt>
        <dd className={reading.pushes > 20 ? 'warn' : ''}>{count(reading.pushes)}</dd>
        <dt>js heap</dt>
        <dd>{reading.heap === null ? 'n/a' : kib(reading.heap)}</dd>
      </dl>
      <p className="hint">{hint}</p>
    </div>
  );
}
