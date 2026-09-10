// @tt/client-core — what both browser apps need. Role-neutral by rule.

export { connect } from './net/index.js';
export type { Connection, Handlers } from './net/index.js';

export { initialServerState, initialViewState } from './store/index.js';
export type { ServerState, ViewState, Tool } from './store/index.js';

export { idle, GROUP, pick, armed, aim, ghostCell, canConfirm, travelIntent, travelPrompt } from './travel/index.js';
export type { Travel } from './travel/index.js';

export { clickAction, holdsSelection } from './tools/index.js';
export type { ClickAction, Pointed, Cell, Slot, Context } from './tools/index.js';
