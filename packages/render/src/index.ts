// @tt/render — three.js. Turns domain data into pictures; knows no network.

export {
  YAW_STEPS, YAW_OFFSET, PITCH_STEPS, MIN_ZOOM, MAX_ZOOM, yawRadians,
  defaultTarget, clampTarget, createCamera, applyTarget, placeCamera, northBearing,
  yawDegrees, pitchDegrees, nearestAngle, approach, TURN_TAU,
} from './camera/index.js';
export type { CameraTarget, CameraView } from './camera/index.js';

export { HEIGHT_SCALE, buildWorldMeshes, columnCentre, worldCentre, surfaceAt } from './world/index.js';
export type { ColumnAddress, WorldMeshes } from './world/index.js';

export { MARKER_ZOOM, LABEL_PIXELS, buildPlaceMarkers, nameLabel } from './places/index.js';
export type { PlaceMarkers, Label } from './places/index.js';

export { buildPartyPawns } from './pawns/index.js';
export type { PartyPawns, PawnRef } from './pawns/index.js';

export { grainAt } from './grain/index.js';

export { Stage, FRAME_BUDGET_MS, FRAME_SLOP_MS, IDLE_HEARTBEAT_MS } from './stage/index.js';
export type { StageCost } from './stage/index.js';
export type { Picked, SlotAddress, Standing } from './stage/index.js';

export { buildPartyTokens } from './tokens/index.js';
export type { PartyTokens, TokenRef, TokenSpec } from './tokens/index.js';

export { intendedCell } from './picking/index.js';
export type { PickedThings } from './picking/index.js';

export { surfaceMove, showWorldMarkers } from './surface/index.js';
export type { SurfaceMove } from './surface/index.js';

export { buildBlockBody } from './blocks/index.js';
export type { BlockBody, FacePick } from './blocks/index.js';

// The figure in a material's surface (R-177).
export { isFigured } from './patterns/index.js';
