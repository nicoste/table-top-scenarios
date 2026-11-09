// Whether this browser can draw the screens (D-386).
//
// The stylesheets mix every colour with color-mix() and lay some rows out with
// :has(). A browser without either draws panels with no background and buttons
// out of place: half a screen that looks like a bug. So each page carries a
// sentence saying the browser is too old, which the stylesheet hides when both
// work, and a screen starts only where they do — the sentence stays otherwise.

/** The oldest browsers that have both, as the sentence in each page says it. */
export const BROWSER_FLOOR = 'Chrome or Edge 111, Safari 16.2 or Firefox 121';

const NEEDS = ['(color: color-mix(in srgb, red 50%, blue))', 'selector(:has(a))'];

/** True when `supports` (the browser's `CSS.supports`) says yes to everything the screens use. */
export function browserIsEnough(supports: (condition: string) => boolean): boolean {
  return NEEDS.every((condition) => {
    try {
      return supports(condition);
    } catch {
      // A browser too old for the question is too old for the answer.
      return false;
    }
  });
}
