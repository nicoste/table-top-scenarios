// @tt/protocol — the wire contract. Defines the messages; never sends one.

export {
  TerrainIdSchema, GroundSchema, MarkerIdSchema, CellIndex, ChunkCoordSchema,
  MarkerWireSchema, PlaceCellSchema, WorldCellSchema, PlaceNoteWireSchema, PlaceWireSchema,
  MapWireSchema, PoiWireSchema,
  encodePoi, decodePoi, parseMarkerId,
  DiscoveryWireSchema, PlacementWireSchema, SaveWireSchema, encodeSave, decodeSave,
  TravellingWireSchema, travellingToWire, travellingFromWire, ImageIdSchema,
  IMAGE_PATH, imageUrl, SilverTokenWireSchema, TokenTemplateWireSchema,
  encodePlacement, decodePlacement, CubeWireSchema, TokensWireSchema,
  CellsWireSchema, cellsWire, cellsFromWire,
  ChunkWireSchema, TerrainWireSchema, MemberWireSchema, WorldWireSchema, CampaignWireSchema,
  encodeChunk, encodeWorld, encodeCampaign, decodeChunk, decodeWorld, decodeCampaign,
  parseGround, parseCover,
  mapWire,
} from './wire/index.js';
export type {
  ChunkWire, CampaignWire, PlaceWire, SaveWire, PlacementWire, MapWire, TokensWire, CellsWire,
  TravellingWire, SilverTokenWire, TokenTemplateWire,
} from './wire/index.js';

export { IntentSchema, parseIntent } from './intents/index.js';
export type { Intent, IntentKind } from './intents/index.js';

export { viewFor } from './view/index.js';

/**
 * Re-exported so `apps/host` can name a save's storage key without depending on
 * `domain` (R-5). One definition, reachable from both sides of the graph.
 */
export { liveSaveId } from '@tt/domain';
export type {
  Role, CampaignSummary, HostState, History, GmView, TableView, TableFog, TableSilverWire, View,
  OutboundMessage,
} from './view/index.js';
