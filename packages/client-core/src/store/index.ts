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
export type Tool = 'paint' | 'height';

export interface ViewState {
  readonly camera: CameraTarget;
  readonly tool: Tool;
  readonly terrainId: string;
  readonly hover: { cx: number; cz: number; x: number; z: number } | null;
  readonly panel: 'none' | 'party';
}

export function initialViewState(camera: CameraTarget): ViewState {
  return { camera, tool: 'paint', terrainId: 'terrain:grass', hover: null, panel: 'party' };
}
