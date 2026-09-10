// What the party knows about the world. Play state, so it lives in a save and
// never in the campaign (R-8, D-006).
//
// Chunk keys are strings, not ChunkCoord objects: a JS Set cannot dedupe objects
// by structural equality, so the `Set<ChunkCoord>` in the R-8 illustration would
// silently hold duplicates. Strings are also what World.chunks already keys on.

import type { PoiId } from '../ids/index.js';
import type { ChunkCoord } from '../world/index.js';
import { chunkKey } from '../world/index.js';

export interface Discovery {
  /** Chunks the party has been shown, by `chunkKey`. Known in R-16's sense. */
  readonly chunks: ReadonlySet<string>;
  /** POIs the party has been shown. Revealed in R-16's sense. */
  readonly pois: ReadonlySet<PoiId>;
}

export function emptyDiscovery(): Discovery {
  return { chunks: new Set(), pois: new Set() };
}

export function isChunkKnown(discovery: Discovery, coord: ChunkCoord): boolean {
  return discovery.chunks.has(chunkKey(coord));
}

export function isPoiRevealed(discovery: Discovery, id: PoiId): boolean {
  return discovery.pois.has(id);
}

function withChunks(discovery: Discovery, chunks: ReadonlySet<string>): Discovery {
  return { chunks, pois: discovery.pois };
}

function withPois(discovery: Discovery, pois: ReadonlySet<PoiId>): Discovery {
  return { chunks: discovery.chunks, pois };
}

export function setChunkKnown(discovery: Discovery, coord: ChunkCoord, known: boolean): Discovery {
  const key = chunkKey(coord);
  if (discovery.chunks.has(key) === known) return discovery;
  const chunks = new Set(discovery.chunks);
  if (known) chunks.add(key); else chunks.delete(key);
  return withChunks(discovery, chunks);
}

export function setPoiRevealed(discovery: Discovery, id: PoiId, revealed: boolean): Discovery {
  if (discovery.pois.has(id) === revealed) return discovery;
  const pois = new Set(discovery.pois);
  if (revealed) pois.add(id); else pois.delete(id);
  return withPois(discovery, pois);
}

/** Reveals or hides several POIs at once — the GM revealing a chunk's contents. */
export function setPoisRevealed(
  discovery: Discovery,
  ids: readonly PoiId[],
  revealed: boolean,
): Discovery {
  let next = discovery;
  for (const id of ids) next = setPoiRevealed(next, id, revealed);
  return next;
}

/**
 * A POI is on the table's screen only when its POI is Revealed **and** its chunk
 * is Known.
 *
 * Both, never either. R-16 makes the two flags independent, which reads as "a
 * known chunk can still hold secrets" — but the same independence allows a
 * Revealed POI inside an Unknown chunk, and sending that would put a place, its
 * name and its position on screen inside a region the party has never seen
 * (D-132).
 */
export function isPoiOnTable(
  discovery: Discovery,
  poi: { readonly id: PoiId; readonly cell: { readonly cx: number; readonly cz: number } },
): boolean {
  return isPoiRevealed(discovery, poi.id)
    && isChunkKnown(discovery, { cx: poi.cell.cx, cz: poi.cell.cz });
}

export function discoveryToJSON(discovery: Discovery): { chunks: string[]; pois: string[] } {
  return { chunks: [...discovery.chunks].sort(), pois: [...discovery.pois].sort() };
}

export function discoveryFromJSON(json: { chunks?: string[]; pois?: string[] }): Discovery {
  return {
    chunks: new Set(json.chunks ?? []),
    pois: new Set((json.pois ?? []) as PoiId[]),
  };
}
