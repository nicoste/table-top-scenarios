// @tt/render — three.js. Turns domain data into pictures; knows no network.

export {
  YAW_STEPS, YAW_OFFSET, PITCH_STEPS, MIN_ZOOM, MAX_ZOOM, yawRadians,
  defaultTarget, clampTarget, createCamera, applyTarget,
} from './camera/index.js';
export type { CameraTarget } from './camera/index.js';

export { HEIGHT_SCALE, buildWorldMeshes, columnCentre, worldCentre, surfaceAt } from './world/index.js';
export type { ColumnAddress, WorldMeshes } from './world/index.js';

export { MARKER_ZOOM, LABEL_PIXELS, buildPoiMarkers, nameLabel } from './pois/index.js';
export type { PoiMarkers, Label } from './pois/index.js';

export { buildPartyPawns } from './pawns/index.js';
export type { PartyPawns, PawnRef } from './pawns/index.js';

export { Stage } from './stage/index.js';
export type { Picked, SlotAddress } from './stage/index.js';
