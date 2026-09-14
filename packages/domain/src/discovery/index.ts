// What the party knows about the world. Play state, so it lives in a save and
// never in the campaign (R-8, D-006).
//
// Chunk keys are strings, not ChunkCoord objects: a JS Set cannot dedupe objects
// by structural equality, so the `Set<ChunkCoord>` in the R-8 illustration would
// silently hold duplicates. Strings are also what World.chunks already keys on.

import type { PlaceId } from '../ids/index.js';
import type { ChunkCoord } from '../world/index.js';
import { chunkKey } from '../world/index.js';

export interface Discovery {
  /** Chunks the party has been shown, by `chunkKey`. Known in R-16's sense. */
  readonly chunks: ReadonlySet<string>;
  /** places the party has been shown. Revealed in R-16's sense. */
  readonly places: ReadonlySet<PlaceId>;
}

export function emptyDiscovery(): Discovery {
  return { chunks: new Set(), places: new Set() };
}

export function isChunkKnown(discovery: Discovery, coord: ChunkCoord): boolean {
  return discovery.chunks.has(chunkKey(coord));
}

export function isPlaceRevealed(discovery: Discovery, id: PlaceId): boolean {
  return discovery.places.has(id);
}

function withChunks(discovery: Discovery, chunks: ReadonlySet<string>): Discovery {
  return { chunks, places: discovery.places };
}

function withPlaces(discovery: Discovery, places: ReadonlySet<PlaceId>): Discovery {
  return { chunks: discovery.chunks, places };
}

export function setChunkKnown(discovery: Discovery, coord: ChunkCoord, known: boolean): Discovery {
  const key = chunkKey(coord);
  if (discovery.chunks.has(key) === known) return discovery;
  const chunks = new Set(discovery.chunks);
  if (known) chunks.add(key); else chunks.delete(key);
  return withChunks(discovery, chunks);
}

export function setPlaceRevealed(discovery: Discovery, id: PlaceId, revealed: boolean): Discovery {
  if (discovery.places.has(id) === revealed) return discovery;
  const places = new Set(discovery.places);
  if (revealed) places.add(id); else places.delete(id);
  return withPlaces(discovery, places);
}

/** Reveals or hides several places at once — the GM revealing a chunk's contents. */
export function setPlacesRevealed(
  discovery: Discovery,
  ids: readonly PlaceId[],
  revealed: boolean,
): Discovery {
  let next = discovery;
  for (const id of ids) next = setPlaceRevealed(next, id, revealed);
  return next;
}

/**
 * A place is on the table's screen only when its place is Revealed **and** its chunk
 * is Known.
 *
 * Both, never either. R-16 makes the two flags independent, which reads as "a
 * known chunk can still hold secrets" — but the same independence allows a
 * Revealed place inside an Unknown chunk, and sending that would put a place, its
 * name and its position on screen inside a region the party has never seen
 * (D-132).
 */
export function isPlaceOnTable(
  discovery: Discovery,
  place: { readonly id: PlaceId; readonly cell: { readonly cx: number; readonly cz: number } },
): boolean {
  return isPlaceRevealed(discovery, place.id)
    && isChunkKnown(discovery, { cx: place.cell.cx, cz: place.cell.cz });
}

export function discoveryToJSON(discovery: Discovery): { chunks: string[]; places: string[] } {
  return { chunks: [...discovery.chunks].sort(), places: [...discovery.places].sort() };
}

export function discoveryFromJSON(json: { chunks?: string[]; places?: string[] }): Discovery {
  return {
    chunks: new Set(json.chunks ?? []),
    places: new Set((json.places ?? []) as PlaceId[]),
  };
}
