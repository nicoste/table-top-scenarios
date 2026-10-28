// Server state and view state are separate (R-64). What the host sent is
// replaced wholesale and never mutated; what a screen holds for itself — the
// tool in hand, the camera — is local and a view arriving never overwrites it.
// Each app keeps both as its own React state; this is what they share.

/**
 * The view that just arrived, with every part that did not change replaced by
 * the object the screen already holds (R-19a, D-270).
 *
 * Every message is parsed from text, so without this every part of it is a new
 * object — and both screens decide what to rebuild by identity. Turning the
 * hour rebuilt the world and the map on both of them, because the map that
 * came back equal was not the same map.
 *
 * Still replaced wholesale (R-64): nothing is mutated, and a part that changed
 * anywhere inside is new all the way up. Only what is equal by value keeps its
 * identity, which is the one thing the screens were missing. Plain JSON in,
 * so equal means equal: no dates, no functions, no cycles.
 */
export function keepUnchanged<T>(previous: unknown, next: T): T {
  if (previous === next) return next;
  if (typeof next !== 'object' || next === null) return next;
  if (typeof previous !== 'object' || previous === null) return next;

  if (Array.isArray(next)) {
    if (!Array.isArray(previous)) return next;
    let same = previous.length === next.length;
    const kept = next.map((item: unknown, index) => {
      const one = keepUnchanged(previous[index], item);
      if (one !== previous[index]) same = false;
      return one;
    });
    return (same ? previous : kept) as T;
  }
  if (Array.isArray(previous)) return next;

  const before = previous as Record<string, unknown>;
  const after = next as Record<string, unknown>;
  const keys = Object.keys(after);
  let same = keys.length === Object.keys(before).length;
  const kept: Record<string, unknown> = {};
  for (const key of keys) {
    const one = keepUnchanged(before[key], after[key]);
    if (one !== before[key] || !(key in before)) same = false;
    kept[key] = one;
  }
  return (same ? before : kept) as T;
}

/**
 * `select` is the neutral tool: it changes nothing and only picks things out.
 *
 * Without it every click on the map edits something, so there is no way to
 * inspect a place without risking creating another one — and no safe state to
 * return to after an action completes (D-127).
 */
export type Tool = 'select' | 'paint' | 'cover' | 'height' | 'places' | 'travel';

/**
 * Tools that exist only inside an encounter map (R-148).
 *
 * A separate type, not more members on `Tool`: world tools have no meaning in a
 * map and map tools none outside it, so a single union would let the compiler
 * accept "paint terrain" while standing in a tavern.
 *
 * `move` is the third (D-258): the party's tokens, picked and stood somewhere
 * else (R-188). Travel's job, one surface down.
 */
/** `spawn` places silver tokens from the Tokens Library (D-307). */
/** `prefabs` saves a box of the map and places saved ones (D-321). */
/** `props` places doors, bars and furniture, and changes them (D-328). */
/** `measure` is the ruler, and draws and moves areas (D-341). */
export type MapTool = 'build' | 'paint' | 'move' | 'spawn' | 'prefabs' | 'props' | 'measure';
