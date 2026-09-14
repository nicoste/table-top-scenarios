// Wire shapes. Domain types hold a Map and branded ids; JSON holds neither, so
// the conversion lives here and nowhere else.

import { z } from 'zod';
import type {
  Campaign, Chunk, Column, World, PartyMember, TerrainId, Poi, PoiNote, MarkerId, Save, Placement,
} from '@tt/domain';
import {
  CHUNK_SIZE, DEFAULT_METRES_PER_LEVEL, DEFAULT_TERRAIN, DEFAULT_MARKERS,
  chunkKey, registryId, discoveryToJSON, discoveryFromJSON,
  placementToJSON, placementFromJSON,
} from '@tt/domain';

export const TerrainIdSchema = z.string().regex(/^terrain:[a-z0-9]+(-[a-z0-9]+)*$/);
export const CellIndex = z.number().int().min(0).max(CHUNK_SIZE - 1);
export const ChunkCoordSchema = z.object({ cx: z.number().int(), cz: z.number().int() });

/**
 * A chunk on the wire: parallel arrays rather than 400 objects. Still plain
 * JSON, still stable string ids. Palette+RLE packing (R-59) is for encounter
 * voxel bodies; a chunk is 400 columns and does not need it.
 */
export const ChunkWireSchema = z.object({
  cx: z.number().int(),
  cz: z.number().int(),
  /**
   * The stride these arrays were written with. Recording it is what makes
   * CHUNK_SIZE changeable: decode re-lays any stride into the current one
   * (R-61). Schema 1 had no field and was always 20.
   */
  size: z.number().int().min(1).max(512).default(20),
  heights: z.array(z.number().int().min(0)),
  terrain: z.array(TerrainIdSchema),
});
export type ChunkWire = z.infer<typeof ChunkWireSchema>;

export const TerrainWireSchema = z.object({
  id: TerrainIdSchema,
  name: z.string(),
  colour: z.string(),
  defaultDifficulty: z.union([z.number(), z.literal('impassable')]),
});

export const MarkerIdSchema = z.string().regex(/^marker:[a-z0-9]+(-[a-z0-9]+)*$/);

const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const MarkerWireSchema = z.object({
  id: MarkerIdSchema,
  name: z.string(),
  parts: z.array(z.object({
    shape: z.enum(['box', 'cone', 'cylinder']),
    at: Vec3Schema,
    size: Vec3Schema,
    colour: z.string(),
  })),
});

/** One world cell (D-156). `PoiCellSchema` is the same shape under its own name. */
export const WorldCellSchema = z.object({
  cx: z.number().int(), cz: z.number().int(), x: CellIndex, z: CellIndex,
});
export const PoiCellSchema = WorldCellSchema;

export const PoiNoteWireSchema = z.object({
  id: z.string(),
  text: z.string(),
  visibleToParty: z.boolean(),
});

export const EncounterWireSchema = z.object({
  id: z.string(),
  name: z.string(),
  visibleToParty: z.boolean(),
});

/**
 * Accepts the pre-D-175 shape — a bare id string — and **normalises it away**.
 *
 * The tolerance belongs here and nowhere else. Leaving a `string | record`
 * union in the wire type pushed a `typeof` check into the filter, both apps and
 * the tests; parsing to one shape keeps the compatibility in the one place that
 * knows about it (R-17, R-137). No campaign ever had a non-empty list, so this
 * is theory rather than rescue, but it is the cheap kind.
 */
const EncounterFromWire = z.union([EncounterWireSchema, z.string()]).transform(
  (entry) => (typeof entry === 'string'
    ? { id: entry, name: entry, visibleToParty: false }
    : entry),
);

export const PoiWireSchema = z.object({
  id: z.string(),
  name: z.string(),
  cell: PoiCellSchema,
  markerId: MarkerIdSchema,
  encounters: z.array(EncounterFromWire).default([]),
  notes: z.array(PoiNoteWireSchema),
});
export type PoiWire = z.infer<typeof PoiWireSchema>;

export const DiscoveryWireSchema = z.object({
  chunks: z.array(z.string()).default([]),
  pois: z.array(z.string()).default([]),
});

export const PlacementWireSchema = z.object({
  together: z.boolean().default(true),
  at: WorldCellSchema.nullable().default(null),
  members: z.record(z.string(), WorldCellSchema).default({}),
});

export type PlacementWire = z.infer<typeof PlacementWireSchema>;

export const SaveWireSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  campaignSchemaVersion: z.number().int(),
  schemaVersion: z.number().int(),
  label: z.string(),
  savedAt: z.string(),
  discovery: DiscoveryWireSchema,
  // Absent in a schema-version-1 save, which decodes with the party unplaced.
  placement: PlacementWireSchema.default({ together: true, at: null, members: {} }),
});
export type SaveWire = z.infer<typeof SaveWireSchema>;

export const MemberWireSchema = z.object({
  id: z.string(),
  name: z.string(),
  colour: z.string(),
  visionRange: z.number().int().min(0),
});

export const WorldWireSchema = z.object({
  bounds: z.object({ x: z.number().int(), z: z.number().int() }),
  /**
   * Chunks that exist but whose terrain the party has not been shown: the
   * featureless placeholders of R-16. Coordinates only — deliberately a separate
   * list rather than a `known` flag on each Chunk, so an Unknown chunk has no
   * field that *could* carry terrain.
   */
  unknownChunks: z.array(ChunkCoordSchema).default([]),
  metresPerCell: z.number(),
  // Older campaigns predate the horizontal/vertical split (D-099); default
  // rather than reject, since the value they implied is the one we now name.
  metresPerLevel: z.number().default(DEFAULT_METRES_PER_LEVEL),
  chunks: z.array(ChunkWireSchema),
});

export const CampaignWireSchema = z.object({
  id: z.string(),
  schemaVersion: z.number().int(),
  name: z.string(),
  world: WorldWireSchema,
  party: z.array(MemberWireSchema),
  /**
   * Sent so the apps can draw names and colours, but **not** authoritative and
   * not stored (D-107): decode discards it and encode always emits the current
   * palette. Optional so files written before this change still load.
   */
  terrain: z.array(TerrainWireSchema).default([]),
  /** Like terrain, code rather than campaign data (D-107): never stored. */
  markers: z.array(MarkerWireSchema).default([]),
  pois: z.array(PoiWireSchema).default([]),
});
export type CampaignWire = z.infer<typeof CampaignWireSchema>;

// -- encode ------------------------------------------------------------------

export function encodeChunk(chunk: Chunk): ChunkWire {
  return {
    cx: chunk.coord.cx,
    cz: chunk.coord.cz,
    size: CHUNK_SIZE,
    heights: chunk.columns.map((c) => c.height),
    terrain: chunk.columns.map((c) => c.terrainId as string),
  };
}

export function encodeWorld(world: World): z.infer<typeof WorldWireSchema> {
  return {
    bounds: { x: world.bounds.x, z: world.bounds.z },
    unknownChunks: [],
    metresPerCell: world.metresPerCell,
    metresPerLevel: world.metresPerLevel,
    chunks: [...world.chunks.values()].map(encodeChunk),
  };
}

export function encodeCampaign(campaign: Campaign): CampaignWire {
  return {
    id: campaign.id,
    schemaVersion: campaign.schemaVersion,
    name: campaign.name,
    world: encodeWorld(campaign.world),
    party: campaign.party.map((m) => ({
      id: m.id, name: m.name, colour: m.colour, visionRange: m.visionRange,
    })),
    // Always the current palette, never whatever the file was written with.
    terrain: DEFAULT_TERRAIN.map((t) => ({
      id: t.id as string, name: t.name, colour: t.colour, defaultDifficulty: t.defaultDifficulty,
    })),
    markers: DEFAULT_MARKERS.map((m) => ({
      id: m.id as string,
      name: m.name,
      parts: m.parts.map((part) => ({
        shape: part.shape,
        at: [part.at[0], part.at[1], part.at[2]] as [number, number, number],
        size: [part.size[0], part.size[1], part.size[2]] as [number, number, number],
        colour: part.colour,
      })),
    })),
    pois: campaign.pois.map(encodePoi),
  };
}

// -- decode ------------------------------------------------------------------

/** Turns a validated wire string back into a branded TerrainId. */
export function parseMarkerId(value: string): MarkerId {
  const [ns, ...rest] = value.split(':');
  return registryId<'MarkerId'>(ns ?? 'marker', rest.join(':'));
}

export function parseTerrainId(value: string): TerrainId {
  const [ns, ...rest] = value.split(':');
  return registryId<'TerrainId'>(ns ?? 'terrain', rest.join(':'));
}
const terrainId = parseTerrainId;

export function encodeSave(save: Save): SaveWire {
  return {
    id: save.id,
    campaignId: save.campaignId,
    campaignSchemaVersion: save.campaignSchemaVersion,
    schemaVersion: save.schemaVersion,
    label: save.label,
    savedAt: save.savedAt,
    discovery: discoveryToJSON(save.discovery),
    placement: placementToJSON(save.placement),
  };
}

export function decodeSave(wire: SaveWire): Save {
  return {
    id: wire.id as Save['id'],
    campaignId: wire.campaignId as Save['campaignId'],
    campaignSchemaVersion: wire.campaignSchemaVersion,
    schemaVersion: wire.schemaVersion,
    label: wire.label,
    savedAt: wire.savedAt,
    discovery: discoveryFromJSON(wire.discovery),
    placement: placementFromJSON(wire.placement),
  };
}

/**
 * Symmetry with `decodeCampaign`: an app reads the wire through `protocol` and
 * gets domain types back, rather than reaching into `domain` for a JSON helper.
 */
export function encodePlacement(placement: Placement): PlacementWire {
  return placementToJSON(placement);
}

export function decodePlacement(wire: PlacementWire | null): Placement {
  return placementFromJSON(wire ?? undefined);
}

export function encodePoi(poi: Poi): PoiWire {
  return {
    id: poi.id,
    name: poi.name,
    cell: poi.cell,
    markerId: poi.markerId as string,
    encounters: poi.encounters.map((e) => ({ id: e.id as string, name: e.name, visibleToParty: e.visibleToParty })),
    notes: poi.notes.map((n) => ({ id: n.id, text: n.text, visibleToParty: n.visibleToParty })),
  };
}

export function decodePoi(wire: PoiWire): Poi {
  return {
    id: wire.id as Poi['id'],
    name: wire.name,
    cell: wire.cell,
    markerId: parseMarkerId(wire.markerId),
    encounters: wire.encounters.map((e) => ({
      id: e.id as Poi['encounters'][number]['id'],
      name: e.name,
      visibleToParty: e.visibleToParty,
    })),
    notes: wire.notes.map((n): PoiNote => ({
      id: n.id as PoiNote['id'], text: n.text, visibleToParty: n.visibleToParty,
    })),
  };
}

/**
 * Re-lays the stored grid into the current CHUNK_SIZE. A chunk written smaller
 * keeps its shape in the corner and the remainder is sea; a chunk written larger
 * is cropped. Row-major, so this must go through (x, z) rather than a flat index
 * — copying the flat array straight across would shear the map.
 */
export function decodeChunk(wire: ChunkWire): Chunk {
  const stride = wire.size;
  const columns: Column[] = [];
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const inside = x < stride && z < stride;
      const source = inside ? z * stride + x : -1;
      columns.push({
        height: source >= 0 ? (wire.heights[source] ?? 0) : 0,
        terrainId: terrainId(source >= 0 ? (wire.terrain[source] ?? 'terrain:water') : 'terrain:water'),
      });
    }
  }
  return { coord: { cx: wire.cx, cz: wire.cz }, columns };
}

export function decodeWorld(wire: z.infer<typeof WorldWireSchema>): World {
  const chunks = new Map<string, Chunk>();
  for (const c of wire.chunks) {
    const chunk = decodeChunk(c);
    chunks.set(chunkKey(chunk.coord), chunk);
  }
  return {
    bounds: wire.bounds,
    metresPerCell: wire.metresPerCell,
    metresPerLevel: wire.metresPerLevel,
    chunks,
  };
}

export function decodeCampaign(wire: CampaignWire): Campaign {
  return {
    id: wire.id as Campaign['id'],
    schemaVersion: wire.schemaVersion,
    name: wire.name,
    world: decodeWorld(wire.world),
    party: wire.party.map((m) => ({
      id: m.id as PartyMember['id'],
      name: m.name,
      colour: m.colour,
      visionRange: m.visionRange,
    })),
    pois: wire.pois.map(decodePoi),
  };
}
