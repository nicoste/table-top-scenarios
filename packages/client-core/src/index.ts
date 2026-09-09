// @tt/client-core — what both browser apps need. Role-neutral by rule.

export { connect } from './net/index.js';
export type { Connection, Handlers } from './net/index.js';

export { initialServerState, initialViewState } from './store/index.js';
export type { ServerState, ViewState, Tool } from './store/index.js';
