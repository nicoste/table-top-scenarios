// @tt/domain — the nouns and their invariants. Pure data and pure functions;
// no I/O, no rendering, no transport. See README.md.

export * as ids from './ids/index.js';
export {
  isRegistryId, registryId, freshId,
} from './ids/index.js';
export type {
  CampaignId, SaveId, MemberId, TerrainId, PoiId, NoteId, EncounterId, MarkerId,
} from './ids/index.js';

export type { Terrain, Difficulty } from './terrain/index.js';
export { DEFAULT_TERRAIN, WATER, terrainById, requireTerrain } from './terrain/index.js';

export type { Column, Chunk, ChunkCoord, World, GlobalCell } from './world/index.js';
export {
  CHUNK_SIZE, MAX_HEIGHT, DEFAULT_METRES_PER_CELL, DEFAULT_METRES_PER_LEVEL,
  DEFAULT_WORLD_BOUNDS, SEA_LEVEL_WATER, centreOfBounds,
  chunkKey, parseChunkKey, createChunk, emptyWorld, inBounds, chunkAt, isKnown,
  columnAt, paintTerrain, clampHeight, setHeight, raiseHeight,
  addChunk, replaceChunk, creatableSlots, isCreatableSlot, CHUNK_NEIGHBOURS,
  MAX_BRUSH, clampBrush, toGlobal, fromGlobal, brushCells, brushCentreOffset,
  paintArea, setHeightArea, raiseArea,
} from './world/index.js';

export type { PartyMember } from './party/index.js';
export {
  DEFAULT_VISION_RANGE, nextPawnColour, createMember, startingParty, editMember, removeMember,
} from './party/index.js';

export type { TravelMode, TravelModeId } from './travel/index.js';
export {
  DEFAULT_TRAVEL_MODES, DEFAULT_SLOPE_FACTOR, travelModeById, terrainCost, isPassable,
} from './travel/index.js';

export type { Campaign, Poi, PoiNote } from './campaign/index.js';
export {
  SCHEMA_VERSION, ORIGIN, DEFAULT_BOUNDS, createCampaign, duplicateCampaign, uniqueCampaignName,
} from './campaign/index.js';
