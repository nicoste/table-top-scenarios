// @tt/domain — the nouns and their invariants. Pure data and pure functions;
// no I/O, no rendering, no transport. See README.md.

export * as ids from './ids/index.js';
export {
  isRegistryId, registryId, freshId,
} from './ids/index.js';
export type {
  CampaignId, SaveId, MemberId, TerrainId, PlaceId, NoteId, PoiId, MarkerId, MaterialId,
} from './ids/index.js';

export type { Terrain, Difficulty } from './terrain/index.js';
export { DEFAULT_TERRAIN, WATER, terrainById, requireTerrain } from './terrain/index.js';

export type { Column, Chunk, ChunkCoord, World, GlobalCell, WorldCell } from './world/index.js';
export {
  CHUNK_SIZE, MAX_HEIGHT, DEFAULT_METRES_PER_CELL, DEFAULT_METRES_PER_LEVEL,
  DEFAULT_WORLD_BOUNDS, SEA_LEVEL_WATER, centreOfBounds,
  chunkKey, parseChunkKey, createChunk, emptyWorld, inBounds, chunkAt, isAuthored,
  sameWorldCell, chunkOf, isValidWorldCell,
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

export type { Marker, MarkerPart, PartShape } from './markers/index.js';
export { DEFAULT_MARKERS, DEFAULT_MARKER, markerById, isKnownMarker } from './markers/index.js';

export type { Place, PlaceNote, PlaceCell, Poi } from './place/index.js';
export type { Material } from './materials/index.js';
export {
  DEFAULT_MATERIALS, DEFAULT_FLOOR, materialById, isKnownMaterial, requireMaterial,
} from './materials/index.js';
export type { EncounterMap, BlockCoord, MapJSON } from './map/index.js';
export {
  MAP_PATCH, MAP_MAX_HEIGHT, blockKey, parseBlockKey, inMap, blockAt,
  createMap, setBlock, clearBlock, growMap, topOfMap, mapToJSON, mapFromJSON,
} from './map/index.js';
export {
  MAX_PLACE_NAME, MAX_NOTE_TEXT, sameCell, placeGlobal, placeCellFromGlobal, isValidPlaceCell,
  placeAt, placeById, placesInChunk,
  addPlace, renamePlace, setPlaceMarker, movePlace, removePlace,
  addNote, editNote, setNoteVisible, removeNote, moveNote, partyVisibleNotes,
  MAX_POI_NAME, moveWithin,
  addPoi, renamePoi, setPoiVisible, removePoi, movePoi,
  partyVisiblePois,
  addMap, setMapBlock, clearMapBlock, growPoiMap, poiById,
} from './place/index.js';

export type { Discovery } from './discovery/index.js';
export {
  emptyDiscovery, isChunkKnown, isPlaceRevealed, setChunkKnown, setPlaceRevealed,
  setPlacesRevealed, isPlaceOnTable, discoveryToJSON, discoveryFromJSON,
} from './discovery/index.js';

export type { Save } from './save/index.js';
export {
  SAVE_SCHEMA_VERSION, LIVE_LABEL,
  liveSaveId, createLiveSave, belongsTo, matchesCampaignVersion,
  touch, upgraded, withDiscovery, withPlacement, pruneDiscovery, pruneMembers,
} from './save/index.js';

export type { Placement, PlacementJSON } from './placement/index.js';
export {
  emptyPlacement, isPartyPlaced, memberCell, pawns,
  withGroupAt, withMemberAt, gathered, scattered, prunePlacement,
  placementToJSON, placementFromJSON,
} from './placement/index.js';

export type { Campaign } from './campaign/index.js';
export { upgradedCampaign } from './campaign/index.js';
export {
  SCHEMA_VERSION, ORIGIN, DEFAULT_BOUNDS, createCampaign, duplicateCampaign, uniqueCampaignName,
} from './campaign/index.js';
