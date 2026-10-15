// @tt/client-core — what both browser apps need. Role-neutral by rule.

export { connect } from './net/index.js';
export type { Connection, Handlers } from './net/index.js';

export { initialServerState, initialViewState, keepUnchanged } from './store/index.js';
export type { ServerState, ViewState, Tool, MapTool } from './store/index.js';

export {
  idle, GROUP, pick, armed, aim, choose, ghostCell, aimedAt,
  canConfirm, movingFrom, travelIntent, travelPrompt, journeyLength,
} from './travel/index.js';
export type { Travel } from './travel/index.js';

export {
  still, grab, armedStride, tokenAim, aimStride, strideGhost, canStride, strideIntent,
  tableCeiling, standVerdict, tokenAction, stridePrompt,
} from './tokens/index.js';
export type { Stride, Headroom, TokenAction } from './tokens/index.js';

export {
  clickAction, holdsSelection, tableAction, mapAction, mapHover, mapDrags, mapAllowed,
} from './tools/index.js';

export { grabEnd } from './levels/index.js';

export { FRAME_WINDOW, keepRecent, summarise, rate } from './metrics/index.js';
export type { Frames } from './metrics/index.js';

export { cameraAction, wheelZoom, CAMERA_HINT } from './camera/index.js';
export type { CameraAction } from './camera/index.js';
export type {
  ClickAction, TableAction, MapAction, MapHover, MapAim, MapReach, MapVerdict, FillReach,
  Pointed, Cell, Slot, Context,
} from './tools/index.js';
