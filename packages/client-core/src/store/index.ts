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

/** View state: local only. Never persisted, never transmitted (R-84). */
/**
 * `select` is the neutral tool: it changes nothing and only picks things out.
 *
 * Without it every click on the map edits something, so there is no way to
 * inspect a place without risking creating another one — and no safe state to
 * return to after an action completes (D-127).
 */
export type Tool = 'select' | 'paint' | 'height' | 'places';

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
