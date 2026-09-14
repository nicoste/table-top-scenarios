// @tt/sim — authoritative simulation. Pure: no clock, no I/O, no network.

export { apply, openedWith } from './apply/index.js';
export type { Applied, Effect } from './apply/index.js';

export {
  MAX_HISTORY, emptyHistory, canUndo, canRedo, remember, undone, redone,
} from './history/index.js';
export type { Stepped } from './history/index.js';
