// Wire shapes. Domain types hold a Map and branded ids; JSON holds neither, so
// the conversion lives here and nowhere else.

import { z } from 'zod';
import type { Campaign, Chunk, Column, World, PartyMember, TerrainId } from '@tt/domain';
import { CHUNK_SIZE, DEFAULT_METRES_PER_LEVEL, DEFAULT_TERRAIN, chunkKey, registryId } from '@tt/domain';

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

export const MemberWireSchema = z.object({
  id: z.string(),
  name: z.string(),
  colour: z.string(),
  visionRange: z.number().int().min(0),
});

export const WorldWireSchema = z.object({
  bounds: z.object({ x: z.number().int(), z: z.number().int() }),
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
  };
}

// -- decode ------------------------------------------------------------------

/** Turns a validated wire string back into a branded TerrainId. */
export function parseTerrainId(value: string): TerrainId {
  const [ns, ...rest] = value.split(':');
  return registryId<'TerrainId'>(ns ?? 'terrain', rest.join(':'));
}
const terrainId = parseTerrainId;

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
    pois: [],
  };
}
