// A console trace for the GM's own hands.
//
// The ladder "still works weird", and neither of us can see why from outside:
// every gesture crosses a pointer, a hit-test, an intent, a socket, the host's
// store, the domain and a view push before anything moves on screen. A handle
// that lands in the wrong place could be any of those, and a screenshot of the
// result cannot say which. So each step prints itself, in order, and the GM can
// read their own gesture back and point at the line that is wrong.
//
// Not a logging framework: one channel, meant to be read by a person at the
// moment it happens, not collected. On by default because a trace you have to
// remember to switch on is off when you need it. Silence it from the console
// with `__trace = false`.

const START = performance.now();
let seq = 0;

declare global {
  var __trace: boolean | undefined;
}

export function tracing(): boolean {
  return globalThis.__trace !== false;
}

/**
 * One line: when, which channel, what happened, and the detail beside it.
 *
 * The number and the clock are half the value. The question is nearly always
 * *what happened between these two things* — an answer that arrived late, a
 * move with no press before it — and an unordered console cannot answer that.
 */
export function trace(channel: string, what: string, detail?: unknown): void {
  if (!tracing()) return;
  seq += 1;
  const at = ((performance.now() - START) / 1000).toFixed(3);
  const line = `%c${String(seq).padStart(3, '0')} ${at}s %c${channel}%c ${what}`;
  const clock = 'color:#7a8290';
  const tag = 'color:#0b0d10;background:#8fd0ff;padding:0 5px;border-radius:3px;font-weight:600';
  if (detail === undefined) console.log(line, clock, tag, '');
  else console.log(line, clock, tag, '', detail);
}

/** Said once, so the GM knows the noise is deliberate and how to stop it. */
export function announceTrace(): void {
  if (!tracing()) return;
  console.log(
    '%cTable Top Scenarios%c tracing is on. Type %c__trace = false%c to silence it.',
    'color:#0b0d10;background:#8fd0ff;padding:0 5px;border-radius:3px;font-weight:600',
    'color:#7a8290', 'color:#e8eef7;background:#1b2028;padding:0 4px;border-radius:3px', '',
  );
}
