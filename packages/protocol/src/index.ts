// @tt/protocol — the wire contract. Defines the messages; never sends one.

export {
  TerrainIdSchema, MarkerIdSchema, CellIndex, ChunkCoordSchema,
  MarkerWireSchema, PoiCellSchema, PoiNoteWireSchema, PoiWireSchema,
  encodePoi, decodePoi, parseMarkerId,
  DiscoveryWireSchema, SaveWireSchema, encodeSave, decodeSave,
  ChunkWireSchema, TerrainWireSchema, MemberWireSchema, WorldWireSchema, CampaignWireSchema,
  encodeChunk, encodeWorld, encodeCampaign, decodeChunk, decodeWorld, decodeCampaign,
  parseTerrainId,
} from './wire/index.js';
export type { ChunkWire, CampaignWire, PoiWire, SaveWire } from './wire/index.js';

export { IntentSchema, parseIntent } from './intents/index.js';
export type { Intent, IntentKind } from './intents/index.js';

export { viewFor } from './view/index.js';

/**
 * Re-exported so `apps/host` can name a save's storage key without depending on
 * `domain` (R-5). One definition, reachable from both sides of the graph.
 */
export { liveSaveId } from '@tt/domain';
export type {
  Role, CampaignSummary, HostState, GmView, TableView, View, OutboundMessage,
} from './view/index.js';
