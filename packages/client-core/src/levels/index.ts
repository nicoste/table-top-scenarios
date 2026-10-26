// Which end of the band a press takes hold of (R-146, R-161).
//
// One rule, and it was hiding in the ladder (R-23b). It runs on every press
// now that pressing a row and dragging a handle are the same gesture (D-208),
// so it decides what happens to the band far more often than it used to.

import type { LevelRange } from '@tt/domain';
import { clampRange, MAP_MAX_HEIGHT, MAP_MIN_DEPTH, settleRange } from '@tt/domain';

/**
 * The end a press at this height should move: whichever is nearer.
 *
 * Ties go to the lower end, and the tie is not hypothetical — it is every
 * press exactly halfway between the two handles. Either answer is defensible;
 * what matters is that the same press always gives the same one.
 *
 * On a handle it returns that handle, which is the case that makes one gesture
 * do for both: the distance to it is zero, so nothing else can be nearer. The
 * two ends can never share a height (a band that selects nothing is opened
 * before it is stored), so a press on one is never ambiguous.
 */
export function grabEnd(range: LevelRange, at: number): 'lower' | 'upper' {
  return Math.abs(at - range.lower) <= Math.abs(at - range.upper) ? 'lower' : 'upper';
}

/** Where one row of the ladder was drawn, top and bottom, in client pixels. */
export interface RowBox {
  readonly top: number;
  readonly bottom: number;
}

/**
 * Which row a pointer is over, from the rows **as they were when the drag
 * began** — clamped to the first or last past either end, so dragging off the
 * ladder keeps responding (D-317).
 *
 * Not the rows as drawn now, and that was a bug the GM found by dragging: the
 * band decides whether the party is inside the levels the table is shown, a
 * card above the ladder says so in a sentence of a different length, and the
 * ladder moved under a pointer that had not. Read live, the same pointer was
 * over another row, which moved the band back, which changed the sentence
 * back — the band flickering as fast as the screen could draw. Read from the
 * boxes taken at the press, nothing drawn elsewhere can feed back into the
 * drag. `null` for a ladder with no rows.
 */
export function rowAt(rows: readonly RowBox[], clientY: number): number | null {
  if (rows.length === 0) return null;
  const hit = rows.findIndex((row) => clientY >= row.top && clientY <= row.bottom);
  if (hit >= 0) return hit;
  return clientY < rows[0]!.top ? 0 : rows.length - 1;
}

/**
 * The GM's own band for the open map (D-369): where they last moved it,
 * settled onto the levels as they stand now — a level deleted under an end
 * moves it to the nearest, as the host moves the table's — or, until they move
 * it, the table's own.
 */
export function ownBand(
  own: LevelRange | null,
  table: LevelRange,
  planes: readonly { readonly y: number }[],
): LevelRange {
  return own ? settleRange(planes, own, MAP_MAX_HEIGHT, MAP_MIN_DEPTH) : table;
}

/**
 * The band with one end taken to a stop, made legal the way the host makes the
 * table's (R-161): never pulled onto a step, and never selecting nothing. The
 * same band back when nothing changed, so a drag within one row moves nothing.
 */
export function bandMoved(
  range: LevelRange,
  end: 'lower' | 'upper',
  to: number,
  planes: readonly { readonly y: number }[],
): LevelRange {
  const next = clampRange(
    planes,
    end === 'lower' ? { lower: to, upper: range.upper } : { lower: range.lower, upper: to },
    MAP_MAX_HEIGHT,
    MAP_MIN_DEPTH,
  );
  return next.lower === range.lower && next.upper === range.upper ? range : next;
}

