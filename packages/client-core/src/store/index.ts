// Server state and view state are separate stores (R-64). The snapshot is
// replaced wholesale and never mutated; view state is local and a snapshot must
// never overwrite it.

import type { CameraTarget } from '@tt/render';
import type { Role, View } from '@tt/protocol';

/** Server state: whatever the host last sent. Read-only, replaced wholesale. */
export interface ServerState {
  readonly role: Role | null;
  readonly view: View | null;
  readonly status: 'connecting' | 'open' | 'closed';
  readonly lastRejection: string | null;
}

export const initialServerState: ServerState = {
  role: null, view: null, status: 'connecting', lastRejection: null,
};

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

/** View state: local only. Never persisted, never transmitted (R-84). */
/**
 * `select` is the neutral tool: it changes nothing and only picks things out.
 *
 * Without it every click on the map edits something, so there is no way to
 * inspect a place without risking creating another one — and no safe state to
 * return to after an action completes (D-127).
 */
export type Tool = 'select' | 'paint' | 'height' | 'places' | 'travel';

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
export type MapTool = 'build' | 'paint' | 'move';

export interface ViewState {
  readonly camera: CameraTarget;
  readonly tool: Tool;
  readonly terrainId: string;
  readonly hover: { cx: number; cz: number; x: number; z: number } | null;
  readonly panel: 'none' | 'party';
}

export function initialViewState(camera: CameraTarget): ViewState {
  return { camera, tool: 'select', terrainId: 'terrain:grass', hover: null, panel: 'party' };
}
