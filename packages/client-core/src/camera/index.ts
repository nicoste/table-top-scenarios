// What a key does to the camera (R-156).
//
// Here rather than in each shell because the two screens must agree: the rule
// is that the camera behaves identically on the console and on the table, and a
// rule kept by two files remembering the same four `case` labels is a rule that
// holds until one of them is edited. One table, both callers, one test.
//
// Tools are *not* here. Those differ per surface and per seat by design
// (R-148), and the table has none at all.

export type CameraAction =
  | { readonly kind: 'turn'; readonly steps: number }
  | { readonly kind: 'tilt'; readonly steps: number };

/**
 * The camera key bindings, or `null` for a key the camera does not want.
 *
 * `KeyboardEvent.code`, not `key`: these are physical positions — Q and E sit
 * either side of W, and R and F above and below — so they must not move when
 * the layout does. A French keyboard's A where Q is would otherwise turn the
 * world with a letter that is not on the key.
 */
export function cameraAction(code: string): CameraAction | null {
  switch (code) {
    case 'KeyQ': return { kind: 'turn', steps: -1 };
    case 'KeyE': return { kind: 'turn', steps: 1 };
    case 'KeyR': return { kind: 'tilt', steps: 1 };
    case 'KeyF': return { kind: 'tilt', steps: -1 };
    default: return null;
  }
}

/** How far one wheel tick zooms, as a factor on the zoom. */
const WHEEL_STEP = 1.12;

/**
 * What one wheel tick does to the zoom: the factor both screens hand to
 * `nudgeZoom`, for the keys' reason — one rule, one place (R-156).
 *
 * The zoom is how much of the world is in view, so scrolling down (a positive
 * `deltaY`) zooms out and scrolling up zooms in by exactly as much. A tick is a
 * tick: how far the wheel says it moved is not read.
 */
export function wheelZoom(deltaY: number): number {
  return deltaY > 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
}

/**
 * The one line of help both screens show, so they cannot describe different
 * controls from the ones `cameraAction` implements.
 */
export const CAMERA_HINT = 'Q/E turn · R/F tilt · right-drag pan · wheel zoom';
