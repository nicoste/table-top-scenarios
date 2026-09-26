// Which end of the band a press takes hold of (R-146, R-161).
//
// One rule, and it was hiding in the ladder (R-23b). It runs on every press
// now that pressing a row and dragging a handle are the same gesture (D-208),
// so it decides what happens to the band far more often than it used to.

import type { LevelRange } from '@tt/domain';

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
