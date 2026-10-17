// Wire shapes. Domain types hold a Map and branded ids; JSON holds neither, so
// the conversion lives here and nowhere else.

import { z } from 'zod';
import type {
  Campaign, Chunk, Column, World, PartyMember, SwatchId, CoverId, Place, PlaceNote, MarkerId, Save,
  Placement, Inside, EncounterMap, LevelRange, Cells, Travelling, TravelModeId, ImageId,
} from '@tt/domain';
import {
  CHUNK_SIZE, DEFAULT_METRES_PER_LEVEL,
  chunkKey, registryId, discoveryToJSON, discoveryFromJSON, mapToJSON, mapFromJSON, sliceOf,
  packRuns, unpackRuns,
  placementToJSON, placementFromJSON, tokensToJSON, tokensFromJSON,
  DAYLIGHT, OPEN_SKY, clampLighting, clampAmbience, cellsToJSON, cellsFromJSON,
  GROUND_FROM_TERRAIN, OPEN_WATER, ON_FOOT, asFacing, isImageId, silverToJSON, silverFromJSON,
  orderToJSON, orderFromJSON,
} from '@tt/domain';

/** The light inside one place (R-182). */
export const AmbienceWireSchema = z.object({
  colour: z.string(),
  level: z.number(),
});
export type AmbienceWire = z.infer<typeof AmbienceWireSchema>;

/**
 * The GM's description of the light (R-181), as it travels.
 *
 * `fill` and `fillLevel` are the shape this had for one afternoon, before the
 * ambience was split off to belong to a place rather than to the hour (R-182).
 * Read, never written — a save from that afternoon keeps the colour its GM
 * chose rather than silently reverting to open sky (R-137a).
 */
export const LightingWireSchema = z.object({
  angle: z.number(),
  sun: z.string(),
  sunLevel: z.number(),
  ambience: AmbienceWireSchema.optional(),
  fill: z.string().optional(),
  fillLevel: z.number().optional(),
}).transform((wire) => ({
  angle: wire.angle,
  sun: wire.sun,
  sunLevel: wire.sunLevel,
  ambience: wire.ambience
    ?? (wire.fill !== undefined && wire.fillLevel !== undefined
      ? { colour: wire.fill, level: wire.fillLevel }
      : OPEN_SKY),
}));
export type LightingWire = z.infer<typeof LightingWireSchema>;

/**
 * What the party travels by, one conveyance per medium (R-200).
 *
 * `null` is a value and not an absence: no boat is the fact that makes a river
 * a wall, so it has to survive the round trip. An id nobody recognises is
 * tolerated rather than rejected — `waysOf` drops it, and the medium reads as
 * having nothing, which is what a conveyance from a registry this build does
 * not have amounts to (R-137a).
 */
export const TravellingWireSchema = z.object({
  land: z.string().nullable().default(null),
  water: z.string().nullable().default(null),
  air: z.string().nullable().default(null),
});
export type TravellingWire = z.infer<typeof TravellingWireSchema>;

export function travellingFromWire(wire: TravellingWire): Travelling {
  return {
    land: wire.land as TravelModeId | null,
    water: wire.water as TravelModeId | null,
    air: wire.air as TravelModeId | null,
  };
}

export function travellingToWire(travelling: Travelling): TravellingWire {
  return {
    land: travelling.land as string | null,
    water: travelling.water as string | null,
    air: travelling.air as string | null,
  };
}

/**
 * Still here, and still only for reading: a world written before D-280 holds
 * twelve of these, and `TerrainWireSchema` below is what an old campaign's
 * inline registry is measured against when it is stripped. Nothing is written
 * in this shape any more.
 */
export const TerrainIdSchema = z.string().regex(/^terrain:[a-z0-9]+(-[a-z0-9]+)*$/);

/**
 * What a world cell is made of, on the wire (R-176).
 *
 * A plain string, like a map body's palette, and for the same reason: the
 * registry is the authority on which swatches exist and a regex that repeated
 * it would be a second place to keep in step. A `terrain:*` entry is accepted
 * and mapped on the way in (R-137a).
 */
export const GroundSchema = z.string().regex(/^(material|terrain):[a-z0-9-]+(\/[a-z0-9-]+)?$/);
export const CellIndex = z.number().int().min(0).max(CHUNK_SIZE - 1);
export const ChunkCoordSchema = z.object({ cx: z.number().int(), cz: z.number().int() });

/**
 * A chunk on the wire: parallel arrays rather than 400 objects. Still plain
 * JSON, still stable string ids. Palette+RLE packing (R-59) is for poi
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
  /**
   * Terrain and heights, run-length encoded, with the terrain's values indexed
   * into `palette` (R-59, D-220).
   *
   * They were one entry per cell: 900 copies of strings like `terrain:grass`
   * per chunk, which came to 126 KiB of a 143 KiB world and went over the wire
   * on every accepted intent. The same world packs to 1.2 KiB, because a world
   * is overwhelmingly long stretches of the same thing — 135 runs of terrain
   * and 9 of height across 8,100 cells.
   *
   * The plain arrays are still **accepted** on the way in, because a campaign
   * written before packing is still a campaign (R-137a), and not defaulted,
   * because an empty array is truthy and the reader has to tell absence from
   * emptiness.
   */
  palette: z.array(GroundSchema).optional(),
  terrainRuns: z.array(z.number().int().nonnegative()).optional(),
  heightRuns: z.array(z.number().int().nonnegative()).optional(),
  heights: z.array(z.number().int().min(0)).optional(),
  terrain: z.array(GroundSchema).optional(),
  /**
   * What stands on each cell (R-193), packed the same way the ground is, with
   * the empty string for a bare cell — which is most of them, so a chunk of
   * forest is a handful of runs and a chunk of sea is one.
   *
   * **Both absent means no covers in this chunk**, which is the honest reading
   * and also what every chunk written before D-280 says. No schema bump: the
   * absence says what it means (D-187), and a world with nothing standing on
   * it sends nothing rather than 900 empty strings.
   */
  coverPalette: z.array(z.string()).optional(),
  coverRuns: z.array(z.number().int().nonnegative()).optional(),
});
export type ChunkWire = z.infer<typeof ChunkWireSchema>;

/*
 * Kept although nothing is sent in this shape any more (D-222): an older
 * campaign file still carries a registry inline, and these are what the
 * manifest's unknown keys are measured against when they are stripped on read.
 */
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

/** One world cell (D-156). `PlaceCellSchema` is the same shape under its own name. */
export const WorldCellSchema = z.object({
  cx: z.number().int(), cz: z.number().int(), x: CellIndex, z: CellIndex,
});
export const PlaceCellSchema = WorldCellSchema;

export const PlaceNoteWireSchema = z.object({
  id: z.string(),
  text: z.string(),
  visibleToParty: z.boolean(),
});

export const MapWireSchema = z.object({
  /** Absent in a map written before it could grow toward lower cells (R-150). */
  origin: z.object({ x: z.number().int(), z: z.number().int() }).optional(),
  size: z.object({ x: z.number().int().positive(), z: z.number().int().positive() }),
  /**
   * The body, packed: a palette of materials and a run-length encoding of the
   * cells, ordered y, then z, then x (R-59, D-217).
   *
   * `blocks` is the shape this replaced — one JSON entry per cube, which came
   * to 258 KiB for a church and went to disk and to both screens on every cube
   * placed. Still accepted on the way in, because a campaign written before
   * packing is still a campaign (R-137a).
   */
  /*
   * Optional and **not defaulted**, which matters: a default turns the absence
   * of a packed body into an empty one, and an empty array is truthy. A map
   * written before packing would then be read as a packed body with no runs —
   * which is to say, refused as corrupt. Absence has to stay absence for the
   * reader to tell the two shapes apart.
   */
  palette: z.array(z.string()).optional(),
  runs: z.array(z.number().int().nonnegative()).optional(),
  blocks: z.record(z.string(), z.string()).optional(),
  /**
   * The GM's named cuts (R-146). Sent to the table as well as the console: a
   * level called "cellar" is not itself a secret, what is in it is, and the
   * table needs the names to label the band it is being shown.
   */
  planes: z.array(z.object({
    id: z.string(),
    name: z.string(),
    y: z.number().int(),
  })).default([]),
});
export type MapWire = z.infer<typeof MapWireSchema>;

export const PoiWireSchema = z.object({
  id: z.string(),
  name: z.string(),
  visibleToParty: z.boolean(),
  map: MapWireSchema.nullable().default(null),
  /** The light inside it (R-182). Absent means open sky, as a new one is. */
  ambience: AmbienceWireSchema.default(OPEN_SKY),
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
const PoiFromWire = z.union([PoiWireSchema, z.string()]).transform(
  (entry) => (typeof entry === 'string'
    ? { id: entry, name: entry, visibleToParty: false, map: null, ambience: OPEN_SKY }
    : entry),
);

export const PlaceWireSchema = z.object({
  id: z.string(),
  name: z.string(),
  cell: PlaceCellSchema,
  markerId: MarkerIdSchema,
  /**
   * Quarter turns clockwise from above (R-203). Absent means as the marker is
   * written, which is how every place before this was drawn — no bump (D-187).
   * Any whole number is read and brought back into one turn rather than
   * refused: a campaign must not fail to open over which way a hut faces.
   */
  facing: z.number().int().default(0),
  pois: z.array(PoiFromWire).default([]),
  notes: z.array(PlaceNoteWireSchema),
});
export type PlaceWire = z.infer<typeof PlaceWireSchema>;

export const DiscoveryWireSchema = z.object({
  chunks: z.array(z.string()).default([]),
  places: z.array(z.string()).default([]),
});

export const PlacementWireSchema = z.object({
  together: z.boolean().default(true),
  at: WorldCellSchema.nullable().default(null),
  members: z.record(z.string(), WorldCellSchema).default({}),
});

export type PlacementWire = z.infer<typeof PlacementWireSchema>;

/** One cube of a map: where a token stands (R-184). */
export const CubeWireSchema = z.object({
  x: z.number().int(), y: z.number().int(), z: z.number().int(),
});

/** Where each placed member stands in one map, by member id (R-184). */
export const TokensWireSchema = z.record(z.string(), CubeWireSchema);
export type TokensWire = z.infer<typeof TokensWireSchema>;

/**
 * A set of cubes, packed (R-59): the box it fits in, and runs over it of
 * unseen then seen, y then z then x. What the party has seen of a map, or
 * sees now (R-45).
 */
export const CellsWireSchema = z.object({
  origin: z.object({ x: z.number().int(), y: z.number().int(), z: z.number().int() }),
  size: z.object({
    x: z.number().int().nonnegative(), y: z.number().int().nonnegative(), z: z.number().int().nonnegative(),
  }),
  runs: z.array(z.number().int().nonnegative()),
});
export type CellsWire = z.infer<typeof CellsWireSchema>;

/** One silver token on the wire and on disk (D-307). */
export const SilverTokenWireSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  name: z.string(),
  at: z.object({ x: z.number().int(), y: z.number().int(), z: z.number().int() }),
  hidden: z.boolean().optional(),
  /** The GM's note (R-208). In the GM's view and on disk; never the table's. */
  note: z.string().optional(),
});
export type SilverTokenWire = z.infer<typeof SilverTokenWireSchema>;

/**
 * The Tokens Library as the GM's console receives it (D-307). Read with the
 * domain's own lenient reader on disk; this is the shape it is sent in.
 */
export const TokenTemplateWireSchema = z.object({
  id: z.string(),
  name: z.string(),
  tags: z.array(z.string()),
  image: z.string().nullable(),
  /** Where its stats live (D-313). The GM's; the table never sees an entry. */
  url: z.string().nullable(),
});
export type TokenTemplateWire = z.infer<typeof TokenTemplateWireSchema>;

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
  /**
   * Absent in any save written before the party could go into a map, which
   * decodes as the party being out on the world — what that save meant. No
   * schema bump for the same reason as D-187: the absence says it itself.
   */
  inside: z.object({
    placeId: z.string(),
    poiId: z.string(),
  }).nullable().default(null),
  /**
   * The band each map is cut to, keyed by point of interest (R-146). Absent
   * means the whole body, so an uncut map needs no entry.
   */
  ranges: z.record(
    z.string(),
    z.object({ lower: z.number().int(), upper: z.number().int() }),
  ).default({}),
  /**
   * Where the party stands in each map, keyed by point of interest (R-184,
   * D-256). Absent in every save written before tokens existed, which is a
   * party nobody has placed — what those saves meant, so no bump (D-187).
   */
  tokens: z.record(z.string(), TokensWireSchema).default({}),
  /**
   * What the party has seen of each map, keyed by point of interest (R-45).
   * Absent in every save written before vision, which is a party that has
   * seen nothing yet — and the host looks around for them the moment the
   * campaign opens, so no bump (D-187).
   */
  explored: z.record(z.string(), CellsWireSchema).default({}),
  /**
   * How the scene is lit (R-181). Absent means daylight, which is what every
   * save written before there was a sun to set already meant — no bump, for
   * the same reason as the three absences above (D-187, R-144).
   */
  lighting: LightingWireSchema.default(DAYLIGHT),
  /**
   * What the party travels by (R-200). Absent means on foot and nothing else,
   * which is what every save written before a party could own a boat already
   * meant — the absence says it itself, so no bump (D-187, R-144).
   */
  travelling: TravellingWireSchema.default(travellingToWire(ON_FOOT)),
  /**
   * Everyone in each map who is not the party (D-307), by point of
   * interest. Absent in every save before the Tokens Library: nobody has been
   * placed, which is what those saves meant — no bump (D-187).
   */
  silver: z.record(z.string(), z.array(SilverTokenWireSchema)).default({}),
  /**
   * The GM's numbers for who is on stage, by point of interest and token id
   * (R-208). Absent before the ordered list: nobody numbered — no bump
   * (D-187). Read leniently by the domain's own reader.
   */
  order: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
});
export type SaveWire = z.infer<typeof SaveWireSchema>;

export const MemberWireSchema = z.object({
  id: z.string(),
  name: z.string(),
  colour: z.string(),
  visionRange: z.number().int().min(0),
  /**
   * The picture on their card (R-204). Absent means none — every member
   * before pictures — so no bump (D-187). Anything that is not a picture's
   * name reads as none rather than refusing the campaign: a hand-edited file
   * must not lock the GM out over one portrait (R-137a).
   */
  image: z.unknown().optional().transform((value) => (isImageId(value) ? value : null)),
});

/**
 * Where pictures are stored and fetched (R-204): `POST` the bytes here, and
 * `GET` one at `<IMAGE_PATH>/<name>`. Part of the contract between the host
 * and the screens, so it is said once, here.
 */
export const IMAGE_PATH = '/images';

/** The address of one picture, by its name. */
export function imageUrl(id: string): string {
  return `${IMAGE_PATH}/${id}`;
}

/** A picture's name at the edge, where intents are strict (R-17). */
export const ImageIdSchema = z.string().refine(isImageId, 'not a picture').transform((v) => v as ImageId);

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
  /** Like terrain, code rather than campaign data (D-107): never stored. */
  places: z.array(PlaceWireSchema).default([]),
});
export type CampaignWire = z.infer<typeof CampaignWireSchema>;

// -- encode ------------------------------------------------------------------

/**
 * The wire form of a chunk, built once per version of that chunk (D-220).
 *
 * The same cache as a map's, for the same reason and resting on the same rule
 * (R-165): painting one chunk leaves every other chunk's object untouched, so
 * an unchanged chunk simply *is* the one that was packed before. Packing costs
 * a walk of 900 cells, which is cheap once and silly nine times per keystroke.
 */
const packedChunks = new WeakMap<Chunk, ChunkWire>();

export function encodeChunk(chunk: Chunk): ChunkWire {
  const already = packedChunks.get(chunk);
  if (already) return already;
  const palette = [...new Set(chunk.columns.map((c) => c.ground as string))].sort();
  const indexOf = new Map(palette.map((id, i) => [id, i]));
  const made: ChunkWire = {
    cx: chunk.coord.cx,
    cz: chunk.coord.cz,
    size: CHUNK_SIZE,
    palette,
    terrainRuns: packRuns(chunk.columns.map((c) => indexOf.get(c.ground as string)!)),
    heightRuns: packRuns(chunk.columns.map((c) => c.height)),
  };
  // Only when there is something to say. A world with nothing growing on it —
  // which is every world until a GM plants one — sends no cover arrays at all.
  if (chunk.columns.some((c) => c.cover)) {
    const covers = [...new Set(chunk.columns.map((c) => (c.cover ?? '') as string))].sort();
    const coverIndex = new Map(covers.map((id, i) => [id, i]));
    made.coverPalette = covers;
    made.coverRuns = packRuns(
      chunk.columns.map((c) => coverIndex.get((c.cover ?? '') as string)!),
    );
  }
  packedChunks.set(chunk, made);
  return made;
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
      id: m.id, name: m.name, colour: m.colour, visionRange: m.visionRange, image: m.image,
    })),
    // Always the current palette, never whatever the file was written with.
    places: campaign.places.map(encodePoi),
  };
}

// -- decode ------------------------------------------------------------------

export function parseMarkerId(value: string): MarkerId {
  const [ns, ...rest] = value.split(':');
  return registryId<'MarkerId'>(ns ?? 'marker', rest.join(':'));
}

/**
 * A wire string as the swatch a column holds, mapping the twelve old terrain
 * ids through on the way (R-137a, D-281).
 *
 * Anything unreadable becomes open water rather than throwing: one bad cell in
 * a world should not cost the campaign, and water is what an unauthored one
 * already is (R-78).
 */
/** A wire string as a cover id, or null for a bare cell (R-193). */
export function parseCover(value: string | undefined): CoverId | null {
  if (!value || !value.startsWith('cover:')) return null;
  return value as CoverId;
}

export function parseGround(value: string): SwatchId {
  if (value.startsWith('terrain:')) return GROUND_FROM_TERRAIN[value] ?? OPEN_WATER;
  return value.startsWith('material:') ? (value as SwatchId) : OPEN_WATER;
}

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
    inside: save.inside
      ? { placeId: save.inside.placeId as string, poiId: save.inside.poiId as string }
      : null,
    ranges: Object.fromEntries(
      [...save.ranges].map(([poiId, range]) => [poiId, { lower: range.lower, upper: range.upper }]),
    ),
    tokens: Object.fromEntries(
      [...save.tokens.keys()].sort().map((poiId) => [poiId, tokensToJSON(save.tokens.get(poiId)!)]),
    ),
    explored: Object.fromEntries(
      [...save.explored.keys()].sort().map((poiId) => [poiId, cellsWire(save.explored.get(poiId)!)]),
    ),
    lighting: { ...save.lighting, ambience: { ...save.lighting.ambience } },
    travelling: travellingToWire(save.travelling),
    silver: Object.fromEntries(
      [...save.silver.keys()].sort().map((poiId) => [poiId, silverToJSON(save.silver.get(poiId)!)]),
    ),
    order: Object.fromEntries(
      [...save.order.keys()].sort().map((poiId) => [poiId, orderToJSON(save.order.get(poiId)!)]),
    ),
  };
}

/**
 * A set of cubes on the wire, packed once per set (D-219's reasoning).
 *
 * The console is sent the whole save on every message, and what the party has
 * seen of a map can run to thousands of cubes; packing it walks and sorts all
 * of them. A set is immutable and replaced when it grows (R-165), so an
 * unchanged one is the one packed last time.
 */
const packedCells = new WeakMap<Cells, CellsWire>();

export function cellsWire(cells: Cells): CellsWire {
  const already = packedCells.get(cells);
  if (already) return already;
  const made = cellsToJSON(cells);
  packedCells.set(cells, made);
  return made;
}

/**
 * The other way, once per wire object (D-270): a screen keeps an unchanged
 * part of a view as the object it already holds, so the same wire decodes to
 * the same set and what is built from it is not built again.
 */
const unpackedCells = new WeakMap<object, Cells>();

export function cellsFromWire(wire: CellsWire): Cells {
  const already = unpackedCells.get(wire);
  if (already) return already;
  const made = cellsFromJSON(wire);
  unpackedCells.set(wire, made);
  return made;
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
    inside: wire.inside
      ? {
        placeId: wire.inside.placeId as Inside['placeId'],
        poiId: wire.inside.poiId as Inside['poiId'],
      }
      : null,
    ranges: new Map(Object.entries(wire.ranges)),
    // A map whose record arrived empty is a map nobody stands in, and keeps no
    // entry — the same as one that never had any (`withTokens`).
    tokens: new Map(
      Object.entries(wire.tokens)
        .filter(([, tokens]) => Object.keys(tokens).length > 0)
        .map(([poiId, tokens]) => [poiId, tokensFromJSON(tokens)]),
    ),
    // The same for a map seen not at all (`withExplored`).
    explored: new Map(
      Object.entries(wire.explored)
        .map(([poiId, cells]) => [poiId, cellsFromWire(cells)] as const)
        .filter(([, cells]) => cells.size > 0),
    ),
    // Clamped on the way in: a save file is as much an input as a socket is.
    lighting: clampLighting(wire.lighting),
    travelling: travellingFromWire(wire.travelling),
    // A map whose list arrived empty is a map nobody stands in (`withSilver`).
    silver: new Map(
      Object.entries(wire.silver)
        .filter(([, silver]) => silver.length > 0)
        .map(([poiId, silver]) => [poiId, silverFromJSON(silver)]),
    ),
    order: new Map(
      Object.entries(wire.order)
        .map(([poiId, order]) => [poiId, orderFromJSON(order)] as const)
        .filter(([, order]) => order.size > 0),
    ),
  };
}

/**
 * The wire form of a map, computed once per version of that map (D-219).
 *
 * Packing a body walks every cube in it, and the GM's view carries *every* map
 * in the campaign because the GM may open any of them. So placing one cube
 * repacked every map the campaign owned — a cost proportional to how much the
 * GM had built rather than to what they had just edited, three times over:
 * once for the save and once per connected screen.
 *
 * The cache is keyed on the **map object**, which is exact and free because an
 * edit that changes nothing returns the same object and an edit to one map
 * leaves every other map's object untouched (R-165). Nothing has to declare
 * what it touched; an unchanged map simply *is* the one we packed before.
 *
 * A `WeakMap`, so a map that goes out of scope takes its entry with it — and
 * every edit replaces the object, so entries die as fast as they are made.
 *
 * **It is correct only while the domain stays immutable.** A map mutated in
 * place would be served from this cache with its old cubes, and that bug would
 * be a miserable one to find. R-165 is the thing holding it up.
 *
 * The returned object is shared between callers, which is safe for the one
 * thing anyone does with a wire value — serialise it — and would not be if
 * somebody started editing one.
 */
const packed = new WeakMap<EncounterMap, Map<string, MapWire>>();

export function mapWire(map: EncounterMap, range?: LevelRange): MapWire {
  // The band is part of the key: the table is sent a *slice*, and the same map
  // cut two ways is two different payloads (R-146).
  const key = range ? `${range.lower}:${range.upper}` : 'whole';
  let byRange = packed.get(map);
  if (!byRange) {
    byRange = new Map();
    packed.set(map, byRange);
  }
  const already = byRange.get(key);
  if (already) return already;
  const made = mapToJSON(range ? sliceOf(map, range) : map);
  byRange.set(key, made);
  return made;
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

export function encodePoi(place: Place): PlaceWire {
  return {
    id: place.id,
    name: place.name,
    cell: place.cell,
    markerId: place.markerId as string,
    facing: place.facing,
    pois: place.pois.map((e) => ({
      id: e.id as string,
      name: e.name,
      visibleToParty: e.visibleToParty,
      map: e.map ? mapWire(e.map) : null,
      ambience: { ...e.ambience },
    })),
    notes: place.notes.map((n) => ({ id: n.id, text: n.text, visibleToParty: n.visibleToParty })),
  };
}

export function decodePoi(wire: PlaceWire): Place {
  return {
    id: wire.id as Place['id'],
    name: wire.name,
    cell: wire.cell,
    markerId: parseMarkerId(wire.markerId),
    facing: asFacing(wire.facing),
    pois: wire.pois.map((e) => ({
      id: e.id as Place['pois'][number]['id'],
      name: e.name,
      visibleToParty: e.visibleToParty,
      map: mapFromJSON(e.map),
      ambience: clampAmbience(e.ambience),
    })),
    notes: wire.notes.map((n): PlaceNote => ({
      id: n.id as PlaceNote['id'], text: n.text, visibleToParty: n.visibleToParty,
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
  /*
   * Unpacked back into the flat arrays the re-lay below already understood, so
   * the one piece of arithmetic that can shear a world stayed untouched.
   *
   * A chunk whose runs do not add up is read as sea rather than refused. A map
   * refuses, because a body drawn one cube askew is indistinguishable from the
   * GM's own mistake; a chunk is *terrain*, every cell of it has a value, and
   * one unreadable chunk in a world should not cost the campaign.
   */
  const cells = stride * stride;
  const heights = wire.heightRuns
    ? unpackRuns(wire.heightRuns, cells) ?? []
    : wire.heights ?? [];
  const terrain = wire.terrainRuns
    ? (unpackRuns(wire.terrainRuns, cells) ?? []).map((i) => wire.palette?.[i] ?? '')
    : wire.terrain ?? [];
  const covers = wire.coverRuns
    ? (unpackRuns(wire.coverRuns, cells) ?? []).map((i) => wire.coverPalette?.[i] ?? '')
    : [];
  const columns: Column[] = [];
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const inside = x < stride && z < stride;
      const source = inside ? z * stride + x : -1;
      const cover = source >= 0 ? parseCover(covers[source]) : null;
      columns.push({
        height: source >= 0 ? (heights[source] ?? 0) : 0,
        ground: parseGround(source >= 0 ? (terrain[source] ?? '') : ''),
        // Spread rather than `cover: cover ?? undefined`: a bare cell has no
        // key at all, so it is one shape however it was written (R-137a).
        ...(cover ? { cover } : {}),
      });
    }
  }
  return { coord: { cx: wire.cx, cz: wire.cz }, columns };
}

/**
 * A world decoded once per wire object (D-270), so a screen handed the same
 * world again gets the same `World` back and the stage can see that nothing
 * about the terrain changed.
 *
 * The decode side of D-219's cache, and resting on the same thing from the
 * other end: a screen keeps the parts of a view that did not change as the
 * objects it already holds (R-19a), and nothing ever edits a wire value in
 * place. A map edit makes a new campaign, but the world inside it is the world
 * the screen already had, and rebuilding its terrain for a cube placed in a
 * cellar is what this avoids.
 */
const decodedWorlds = new WeakMap<object, World>();

export function decodeWorld(wire: z.infer<typeof WorldWireSchema>): World {
  const already = decodedWorlds.get(wire);
  if (already) return already;
  const chunks = new Map<string, Chunk>();
  for (const c of wire.chunks) {
    const chunk = decodeChunk(c);
    chunks.set(chunkKey(chunk.coord), chunk);
  }
  const world: World = {
    bounds: wire.bounds,
    metresPerCell: wire.metresPerCell,
    metresPerLevel: wire.metresPerLevel,
    chunks,
  };
  decodedWorlds.set(wire, world);
  return world;
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
      image: m.image,
    })),
    places: wire.places.map(decodePoi),
  };
}
