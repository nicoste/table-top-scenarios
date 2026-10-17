// @tt/domain — the nouns and their invariants. Pure data and pure functions;
// no I/O, no rendering, no transport. See README.md.

export * as ids from './ids/index.js';
export {
  isRegistryId, registryId, freshId,
} from './ids/index.js';
export type {
  CampaignId, SaveId, MemberId, PlaceId, CoverId, NoteId, PoiId, PlaneId, MarkerId, MaterialId,
  SwatchId, TemplateId, SilverId,
} from './ids/index.js';


export type { Column, Chunk, ChunkCoord, World, GlobalCell, WorldCell } from './world/index.js';
export {
  CHUNK_SIZE, MAX_HEIGHT, DEFAULT_METRES_PER_CELL, DEFAULT_METRES_PER_LEVEL,
  DEFAULT_WORLD_BOUNDS, SEA_LEVEL_WATER, OPEN_WATER, GROUND_FROM_TERRAIN, centreOfBounds,
  chunkKey, parseChunkKey, createChunk, emptyWorld, inBounds, chunkAt, isAuthored,
  sameWorldCell, chunkOf, isValidWorldCell,
  columnAt, paintGround, paintCover, clampHeight, setHeight, raiseHeight,
  addChunk, replaceChunk, creatableSlots, isCreatableSlot, CHUNK_NEIGHBOURS,
  WORLD_BRUSHES, MAX_BRUSH, clampBrush, stepBrush, toGlobal, fromGlobal,
  brushCells, brushCentreOffset,
  paintArea, coverArea, setHeightArea, raiseArea,
} from './world/index.js';

export { packRuns, unpackRuns } from './runs/index.js';

export type { PartyMember } from './party/index.js';
export type { ImageId, ImageExtension } from './images/index.js';
export {
  IMAGE_TYPES, MAX_IMAGE_BYTES, isImageId, imageExtension, imageType, coverCrop,
} from './images/index.js';
export {
  DEFAULT_VISION_RANGE, nextPawnColour, createMember, startingParty, editMember, removeMember,
} from './party/index.js';

export type { TravelMode, TravelModeId, Slope, Medium, Travelling } from './travel/index.js';
export {
  DEFAULT_TRAVEL_MODES, ON_FOOT, waysOf, climbFactor, travelModeById, groundCost, cellCost, isPassable,
} from './travel/index.js';

export type { Marker, MarkerPart, PartShape } from './markers/index.js';
export { DEFAULT_MARKERS, DEFAULT_MARKER, markerById, isKnownMarker } from './markers/index.js';

export type { Place, PlaceNote, PlaceCell, Poi, Facing } from './place/index.js';
export type { Lighting, Ambience } from './light/index.js';
export {
  DAYLIGHT, OPEN_SKY, MIN_ANGLE, MAX_ANGLE, MIN_SUN, MAX_SUN, MIN_FILL, MAX_FILL,
  clampLighting, clampAmbience, sunDirection, shadowReach, hourLabel, bounceOf, litBy,
} from './light/index.js';
export type { Route } from './route/index.js';
export { routeAcross, daysAcross, ROUTE_BUDGET } from './route/index.js';
export type { Material, Cut, Difficulty } from './materials/index.js';
export type { Cover, CoverPart } from './covers/index.js';
export {
  DEFAULT_COVERS, coverById, isKnownCover, overCover, clumpsIn,
} from './covers/index.js';
export {
  DEFAULT_MATERIALS, DEFAULT_FLOOR, materialById, isKnownMaterial, requireMaterial,
  swatchOf, swatchFor, materialIn, cutIdIn, cutOf, colourOf, isKnownSwatch, difficultyOf,
  familyOf,
} from './materials/index.js';
export type { EncounterMap, BlockCoord, Brush, Expand, MapJSON, MapJSONIn } from './map/index.js';

export { withPoiAmbience } from './place/index.js';
export {
  MAX_PLANE_NAME, validPlaneY, planeAt, planeById,
  addPlane, renamePlane, movePlane, removePlane,
  planeSteps, fullRange, clampRange, settleRange, inRange, sameRange, isFullRange, stepLabel, sunReaches, WATER_LEVEL,
  planesToJSON, planesFromJSON,
} from './planes/index.js';
export type { CuttingPlane, LevelRange, PlaneJSON } from './planes/index.js';
export {
  MAP_PATCH, MAP_MAX_HEIGHT, MAP_MIN_DEPTH, WHOLE_MAP, blockKey, parseBlockKey, inMap, blockAt,
  BRUSHES, DEFAULT_BRUSH, MAP_BRUSH_CELLS, brushById, brushPatch,
  setBlocks, paintBlocks, clearBlocks,
  createMap, setBlock, clearBlock, growMap, topOfMap, bottomOfMap, mapToJSON, mapFromJSON, packBlocks, unpackBlocks,
  fillRegion, fillMaterial, mapCentre, enclosing, sliceOf,
} from './map/index.js';
export {
  MAX_PLACE_NAME, MAX_NOTE_TEXT, sameCell, placeGlobal, placeCellFromGlobal, isValidPlaceCell,
  placeAt, placeById, placesInChunk,
  addPlace, renamePlace, setPlaceMarker, movePlace, removePlace, asFacing, turned,
  addNote, editNote, setNoteVisible, removeNote, moveNote, partyVisibleNotes,
  MAX_POI_NAME, moveWithin,
  addPoi, renamePoi, setPoiVisible, removePoi, movePoi,
  partyVisiblePois,
  setMapBlock, clearMapBlock, setMapBlocks, paintMapBlocks, clearMapBlocks,
  fillPoiMaterial, growPoiMap, poiById, withPoiMaps,
  addPoiPlane, renamePoiPlane, movePoiPlane, removePoiPlane,
} from './place/index.js';

export type { Discovery } from './discovery/index.js';
export {
  emptyDiscovery, allKnownIn, isChunkKnown, isPlaceRevealed, setChunkKnown, setPlaceRevealed,
  setPlacesRevealed, isPlaceOnTable, isPoiOnTable, discoveryToJSON, discoveryFromJSON,
} from './discovery/index.js';

export type { Save, Inside } from './save/index.js';
export {
  SAVE_SCHEMA_VERSION, LIVE_LABEL,
  liveSaveId, createLiveSave, belongsTo, matchesCampaignVersion,
  touch, upgraded, withDiscovery, withPlacement, pruneDiscovery, pruneMembers,
  enteringMap, leavingMap, rangeFor, rangeIn, withRange, withLighting, withTravelling,
  pruneInside, pruneRanges, settleRanges,
  tokensFor, tokensIn, withTokens, settleTokens, pruneTokens,
  exploredIn, withExplored, pruneExplored, lookAround, forgetMap,
  silverIn, withSilver, withoutStrays, orderIn, withStageOrder, tidyOrder, withNoteOn,
} from './save/index.js';

export type { MemberNotes, MemberNotesJSON } from './member-notes/index.js';
export {
  NO_MEMBER_NOTES, MAX_MEMBER_NOTE, withMemberNote, notesOnRoster, memberNotesToJSON, memberNotesFromJSON,
} from './member-notes/index.js';

export type { StageOrder, StageOrderJSON } from './order/index.js';
export {
  NO_ORDER, MIN_ORDER, MAX_ORDER, cleanOrder, withOrder, inOrder, onStage, orderToJSON, orderFromJSON,
} from './order/index.js';

export type { TokenTemplate, TokensLibrary, TokenTemplateJSON } from './library/index.js';
export {
  EMPTY_LIBRARY, MAX_TEMPLATE_NAME, MAX_TAG, MAX_TAGS, MAX_SHEET_URL, cleanSheetUrl,
  cleanTags, tagsFromText, templateById, addTemplate, editTemplate, removeTemplate, searchLibrary,
  libraryToJSON, libraryFromJSON,
} from './library/index.js';

export type { SilverToken, SilverTokens, SilverTokenJSON } from './silver/index.js';
export {
  NO_SILVER, MAX_SILVER_NAME, MAX_SILVER_NOTE, SUFFIX_LETTERS,
  silverAt, silverCubes, nameFor, whyNotPlace, spawnSilver, moveSilver, renameSilver, hideSilver, noteSilver,
  removeSilver, onLibrary, settledSilver, silverInBand, silverShown, silverToJSON, silverFromJSON,
} from './silver/index.js';

export type { Tokens, TokensJSON, Footing } from './tokens/index.js';
export {
  NO_TOKENS, sameCube, standingAt, whyNotStand, placeToken, standsInBand, tokensInBand,
  onRoster, unplaced, clearOfTokens, settled, dropBelow, tokensToJSON, tokensFromJSON,
} from './tokens/index.js';

export type { Cells, CellsJSON } from './vision/index.js';
export {
  EYE_HEIGHT, EYE_UNDER_CEILING, NO_CELLS, eyeOf, memberSight, partySight, explore, shownBy,
  seenPart, cellsToJSON, cellsFromJSON,
} from './vision/index.js';

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
