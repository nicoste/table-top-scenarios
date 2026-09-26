// @tt/client-core — what both browser apps need. Role-neutral by rule.

export { connect } from './net/index.js';
export type { Connection, Handlers } from './net/index.js';

export { initialServerState, initialViewState } from './store/index.js';
export type { ServerState, ViewState, Tool, MapTool } from './store/index.js';

export { idle, GROUP, pick, armed, aim, ghostCell, canConfirm, travelIntent, travelPrompt } from './travel/index.js';
export type { Travel } from './travel/index.js';

export {
  clickAction, holdsSelection, tableAction, mapAction, mapHover, mapDrags, mapAllowed,
} from './tools/index.js';

export { grabEnd } from './levels/index.js';

export { cameraAction, CAMERA_HINT } from './camera/index.js';
export type { CameraAction } from './camera/index.js';
export type {
  ClickAction, TableAction, MapAction, MapHover, MapAim, MapVerdict, FillReach,
  Pointed, Cell, Slot, Context,
} from './tools/index.js';
