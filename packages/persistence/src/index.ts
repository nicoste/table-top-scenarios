// @tt/persistence — campaign and save stores. Stores and loads; decides nothing.

export { fileCampaignStore, memoryCampaignStore } from './campaign-store/index.js';
export type { CampaignStore } from './campaign-store/index.js';

export { fileSaveStore, memorySaveStore } from './save-store/index.js';
export type { SaveStore } from './save-store/index.js';

export { fileImageStore, imageIdFor, looksLike } from './image-store/index.js';
export type { ImageStore } from './image-store/index.js';
