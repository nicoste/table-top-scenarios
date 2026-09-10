// @tt/protocol — the wire contract. Defines the messages; never sends one.

export {
  TerrainIdSchema, MarkerIdSchema, CellIndex, ChunkCoordSchema,
  MarkerWireSchema, PoiCellSchema, PoiNoteWireSchema, PoiWireSchema,
  encodePoi, decodePoi, parseMarkerId,
  ChunkWireSchema, TerrainWireSchema, MemberWireSchema, WorldWireSchema, CampaignWireSchema,
  encodeChunk, encodeWorld, encodeCampaign, decodeChunk, decodeWorld, decodeCampaign,
  parseTerrainId,
} from './wire/index.js';
export type { ChunkWire, CampaignWire, PoiWire } from './wire/index.js';

export { IntentSchema, parseIntent } from './intents/index.js';
export type { Intent, IntentKind } from './intents/index.js';

export { viewFor } from './view/index.js';
export type {
  Role, CampaignSummary, HostState, GmView, TableView, View, OutboundMessage,
} from './view/index.js';
