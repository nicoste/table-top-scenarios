// Places on the world map. Authored content: a place's *existence* lives in the
// campaign, while whether the party knows about it is play state (R-8, R-16).

import type { MarkerId, NoteId, PlaceId, PoiId } from '../ids/index.js';
import { freshId } from '../ids/index.js';
import { DEFAULT_MARKER, isKnownMarker } from '../markers/index.js';
import type { EncounterMap } from '../map/index.js';
import { createMap, setBlock, clearBlock, growMap, fillMaterial } from '../map/index.js';
import type { Expand } from '../map/index.js';
import type { PlaneId } from '../ids/index.js';
import { addPlane, renamePlane, movePlane, removePlane } from '../planes/index.js';
import { MAP_MAX_HEIGHT, MAP_MIN_DEPTH } from '../map/index.js';
import type { BlockCoord } from '../map/index.js';
import type { MaterialId } from '../ids/index.js';
import type { ChunkCoord, GlobalCell, WorldCell } from '../world/index.js';
import { toGlobal, fromGlobal, sameWorldCell, isValidWorldCell } from '../world/index.js';

/**
 * Where a place sits: a chunk plus a cell inside it (R-50, exactly one cell).
 *
 * An alias of `WorldCell`, kept as a name because "the place's cell" reads better
 * than "the place's world cell" everywhere it is used.
 */
export type PlaceCell = WorldCell;

export interface PlaceNote {
  readonly id: NoteId;
  readonly text: string;
  /** false = stripped by viewFor; never leaves the host (R-85). */
  readonly visibleToParty: boolean;
}

/**
 * One poi a place owns (D-175).
 *
 * For now a name and a visibility flag — the list the GM asked for. It is
 * deliberately a *record with an id* rather than a bare string, because the
 * poi **map** attaches here later (O-009, R-49): a name in a list can grow
 * a grid, a string in an array cannot.
 */
export interface Poi {
  readonly id: PoiId;
  readonly name: string;
  /** false = stripped by viewFor; never leaves the host (R-85). */
  readonly visibleToParty: boolean;
  /**
   * Its map. Exactly one, created with the point of interest (R-145, D-187).
   *
   * A building's floors are levels of that one body rather than separate maps
   * (D-178) — which is what lets stairs be geometry and keeps R-49's refusal to
   * model map-to-map connectors intact.
   *
   * Nullable for one reason only: `null` means *this side was not told*. The
   * table receives every visible point of interest with its body stripped
   * (D-184), and a receiver must not invent geometry it was denied. On the host
   * an authored point of interest always has one.
   */
  readonly map: EncounterMap | null;
}

export interface Place {
  readonly id: PlaceId;
  readonly name: string;
  readonly cell: PlaceCell;
  readonly markerId: MarkerId;
  /** ORDERED, the GM sorts them. A place owns many maps (R-49). */
  readonly pois: readonly Poi[];
  readonly notes: readonly PlaceNote[];
}

export const MAX_PLACE_NAME = 60;
export const MAX_NOTE_TEXT = 2000;
export const MAX_POI_NAME = 80;

export const sameCell = sameWorldCell;

export function placeGlobal(place: Place): GlobalCell {
  return toGlobal({ cx: place.cell.cx, cz: place.cell.cz }, place.cell.x, place.cell.z);
}

export function placeCellFromGlobal(cell: GlobalCell): PlaceCell {
  const { coord, x, z } = fromGlobal(cell);
  return { cx: coord.cx, cz: coord.cz, x, z };
}

export const isValidPlaceCell = isValidWorldCell;

// -- lookups -----------------------------------------------------------------

export function placeAt(places: readonly Place[], cell: PlaceCell): Place | null {
  return places.find((place) => sameCell(place.cell, cell)) ?? null;
}

export function placeById(places: readonly Place[], id: PlaceId): Place | null {
  return places.find((place) => place.id === id) ?? null;
}

export function placesInChunk(places: readonly Place[], coord: ChunkCoord): readonly Place[] {
  return places.filter((place) => place.cell.cx === coord.cx && place.cell.cz === coord.cz);
}

// -- editing -----------------------------------------------------------------

function cleanName(name: string | undefined, fallback: string): string {
  const trimmed = (name ?? '').trim().slice(0, MAX_PLACE_NAME);
  return trimmed || fallback;
}

/**
 * Adds a place. Returns the list unchanged when the cell is already taken —
 * at most one place per cell (R-119), or the tap gesture becomes ambiguous.
 */
export function addPlace(
  places: readonly Place[],
  cell: PlaceCell,
  name?: string,
  markerId: MarkerId = DEFAULT_MARKER,
): readonly Place[] {
  if (!isValidPlaceCell(cell) || placeAt(places, cell)) return places;
  const place: Place = {
    id: freshId<'PlaceId'>('place'),
    name: cleanName(name, 'New place'),
    cell,
    markerId: isKnownMarker(markerId) ? markerId : DEFAULT_MARKER,
    pois: [],
    notes: [],
  };
  return [...places, place];
}

function mapPlace(places: readonly Place[], id: PlaceId, change: (place: Place) => Place): readonly Place[] {
  let touched = false;
  const next = places.map((place) => {
    if (place.id !== id) return place;
    const changed = change(place);
    if (changed !== place) touched = true;
    return changed;
  });
  return touched ? next : places;
}

export function renamePlace(places: readonly Place[], id: PlaceId, name: string): readonly Place[] {
  return mapPlace(places, id, (place) => {
    const next = cleanName(name, place.name);
    return next === place.name ? place : { ...place, name: next };
  });
}

export function setPlaceMarker(places: readonly Place[], id: PlaceId, markerId: MarkerId): readonly Place[] {
  if (!isKnownMarker(markerId)) return places;
  return mapPlace(places, id, (place) => (place.markerId === markerId ? place : { ...place, markerId }));
}

/** Moves a place, unless the destination is invalid or already occupied. */
export function movePlace(places: readonly Place[], id: PlaceId, cell: PlaceCell): readonly Place[] {
  if (!isValidPlaceCell(cell)) return places;
  const occupant = placeAt(places, cell);
  if (occupant && occupant.id !== id) return places;
  return mapPlace(places, id, (place) => (sameCell(place.cell, cell) ? place : { ...place, cell }));
}

export function removePlace(places: readonly Place[], id: PlaceId): readonly Place[] {
  const next = places.filter((place) => place.id !== id);
  return next.length === places.length ? places : next;
}

// -- notes -------------------------------------------------------------------

export function addNote(
  places: readonly Place[],
  id: PlaceId,
  text: string,
  visibleToParty = false,
): readonly Place[] {
  const clean = text.trim().slice(0, MAX_NOTE_TEXT);
  if (!clean) return places;
  return mapPlace(places, id, (place) => ({
    ...place,
    notes: [...place.notes, { id: freshId<'NoteId'>('note'), text: clean, visibleToParty }],
  }));
}

function mapNote(place: Place, noteId: NoteId, change: (note: PlaceNote) => PlaceNote): Place {
  let touched = false;
  const notes = place.notes.map((note) => {
    if (note.id !== noteId) return note;
    const changed = change(note);
    if (changed !== note) touched = true;
    return changed;
  });
  return touched ? { ...place, notes } : place;
}

export function editNote(
  places: readonly Place[],
  id: PlaceId,
  noteId: NoteId,
  text: string,
): readonly Place[] {
  const clean = text.slice(0, MAX_NOTE_TEXT);
  return mapPlace(places, id, (place) =>
    mapNote(place, noteId, (note) => (note.text === clean ? note : { ...note, text: clean })));
}

export function setNoteVisible(
  places: readonly Place[],
  id: PlaceId,
  noteId: NoteId,
  visibleToParty: boolean,
): readonly Place[] {
  return mapPlace(places, id, (place) =>
    mapNote(place, noteId, (note) =>
      (note.visibleToParty === visibleToParty ? note : { ...note, visibleToParty })));
}

export function removeNote(places: readonly Place[], id: PlaceId, noteId: NoteId): readonly Place[] {
  return mapPlace(places, id, (place) => {
    const notes = place.notes.filter((note) => note.id !== noteId);
    return notes.length === place.notes.length ? place : { ...place, notes };
  });
}

/**
 * Moves one entry of an ordered list, clamped to its ends.
 *
 * Shared by notes and pois. The index clamping and the splice dance are
 * the only fiddly part of either, and two copies is how they drift apart.
 * Returns the same array when nothing moves, so identity survives (R-12).
 */
export function moveWithin<T extends { readonly id: string }>(
  list: readonly T[],
  entryId: string,
  delta: number,
): readonly T[] {
  const from = list.findIndex((entry) => entry.id === entryId);
  if (from < 0) return list;
  const to = Math.min(list.length - 1, Math.max(0, from + delta));
  if (to === from) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  if (!moved) return list;
  next.splice(to, 0, moved);
  return next;
}

/** Moves a note within its place. Notes are ordered and the GM sorts them (R-85). */
export function moveNote(
  places: readonly Place[],
  id: PlaceId,
  noteId: NoteId,
  delta: number,
): readonly Place[] {
  return mapPlace(places, id, (place) => {
    const notes = moveWithin(place.notes, noteId, delta);
    return notes === place.notes ? place : { ...place, notes };
  });
}

/** What the table display may see: the visible notes, in the GM's order (R-85). */
export function partyVisibleNotes(place: Place): readonly PlaceNote[] {
  return place.notes.filter((note) => note.visibleToParty);
}

// -- pois --------------------------------------------------------------
//
// The same shape as notes, and deliberately so: an ordered list the GM sorts,
// each entry individually visible or not. Unlike a note, each one owns a map
// from the moment it exists (D-187).

function mapPoi(
  place: Place,
  poiId: PoiId,
  change: (poi: Poi) => Poi,
): Place {
  let touched = false;
  const pois = place.pois.map((poi) => {
    if (poi.id !== poiId) return poi;
    const changed = change(poi);
    if (changed !== poi) touched = true;
    return changed;
  });
  return touched ? { ...place, pois } : place;
}

export function addPoi(
  places: readonly Place[],
  id: PlaceId,
  name: string,
  visibleToParty = false,
): readonly Place[] {
  const clean = name.trim().slice(0, MAX_POI_NAME);
  if (!clean) return places;
  return mapPlace(places, id, (place) => ({
    ...place,
    pois: [
      ...place.pois,
      // Born with its floor. A point of interest is a *place you can enter*;
      // one without a body is a label, and the GM would only ever answer the
      // same question again with a second click (D-187).
      { id: freshId<'PoiId'>('poi'), name: clean, visibleToParty, map: createMap() },
    ],
  }));
}

export function renamePoi(
  places: readonly Place[],
  id: PlaceId,
  poiId: PoiId,
  name: string,
): readonly Place[] {
  const clean = name.trim().slice(0, MAX_POI_NAME);
  if (!clean) return places;
  return mapPlace(places, id, (place) =>
    mapPoi(place, poiId, (e) => (e.name === clean ? e : { ...e, name: clean })));
}

export function setPoiVisible(
  places: readonly Place[],
  id: PlaceId,
  poiId: PoiId,
  visibleToParty: boolean,
): readonly Place[] {
  return mapPlace(places, id, (place) =>
    mapPoi(place, poiId, (e) =>
      (e.visibleToParty === visibleToParty ? e : { ...e, visibleToParty })));
}

export function removePoi(
  places: readonly Place[],
  id: PlaceId,
  poiId: PoiId,
): readonly Place[] {
  return mapPlace(places, id, (place) => {
    const pois = place.pois.filter((e) => e.id !== poiId);
    return pois.length === place.pois.length ? place : { ...place, pois };
  });
}

export function movePoi(
  places: readonly Place[],
  id: PlaceId,
  poiId: PoiId,
  delta: number,
): readonly Place[] {
  return mapPlace(places, id, (place) => {
    const pois = moveWithin(place.pois, poiId, delta);
    return pois === place.pois ? place : { ...place, pois };
  });
}

/** What the table display may see: the visible pois, in the GM's order. */
export function partyVisiblePois(place: Place): readonly Poi[] {
  return place.pois.filter((e) => e.visibleToParty);
}

// -- a point of interest's map -----------------------------------------------

function mapOfPoi(
  places: readonly Place[],
  placeId: PlaceId,
  poiId: PoiId,
  change: (map: EncounterMap) => EncounterMap,
): readonly Place[] {
  return mapPlace(places, placeId, (place) =>
    mapPoi(place, poiId, (poi) => {
      if (!poi.map) return poi;
      const next = change(poi.map);
      return next === poi.map ? poi : { ...poi, map: next };
    }));
}

export function setMapBlock(
  places: readonly Place[],
  placeId: PlaceId,
  poiId: PoiId,
  at: BlockCoord,
  material: MaterialId,
): readonly Place[] {
  return mapOfPoi(places, placeId, poiId, (map) => setBlock(map, at, material));
}

export function clearMapBlock(
  places: readonly Place[],
  placeId: PlaceId,
  poiId: PoiId,
  at: BlockCoord,
): readonly Place[] {
  return mapOfPoi(places, placeId, poiId, (map) => clearBlock(map, at));
}

/** Repaints a connected same-material region of a point of interest's map (R-154). */
export function fillPoiMaterial(
  places: readonly Place[],
  placeId: PlaceId,
  poiId: PoiId,
  at: BlockCoord,
  material: MaterialId,
): readonly Place[] {
  return mapOfPoi(places, placeId, poiId, (map) => fillMaterial(map, at, material));
}

export function growPoiMap(
  places: readonly Place[],
  placeId: PlaceId,
  poiId: PoiId,
  towards: Expand,
): readonly Place[] {
  return mapOfPoi(places, placeId, poiId, (map) => growMap(map, towards));
}

/**
 * Gives a body to any point of interest read without one (D-187).
 *
 * The tolerance R-137a asks for, at the boundary rather than carried inward: a
 * campaign written before a map came with the name holds `map: null`, and the
 * rest of the code is now entitled to assume otherwise. No schema bump goes
 * with it, because a version number exists so code can branch on what the data
 * cannot tell you — and a missing map says so itself.
 *
 * A floor is not an invention. There was no body to lose; this is the same
 * empty patch the GM would have got from the `+ Map` button that used to be
 * there. Identity-preserving, so a campaign that needs nothing is untouched.
 */
export function withPoiMaps(places: readonly Place[]): readonly Place[] {
  let touched = false;
  const next = places.map((place) => {
    if (place.pois.every((poi) => poi.map)) return place;
    touched = true;
    return {
      ...place,
      pois: place.pois.map((poi) => (poi.map ? poi : { ...poi, map: createMap() })),
    };
  });
  return touched ? next : places;
}

// -- a map's cutting planes (R-146) -------------------------------------------
//
// Four wrappers over the same `mapOfPoi` the block edits use, so a plane edit is
// identity-preserving and undoable for exactly the same reason they are.

export function addPoiPlane(
  places: readonly Place[],
  placeId: PlaceId,
  poiId: PoiId,
  name: string,
  y: number,
): readonly Place[] {
  return mapOfPoi(places, placeId, poiId, (map) => {
    const planes = addPlane(map.planes, name, y, MAP_MAX_HEIGHT, MAP_MIN_DEPTH);
    return planes === map.planes ? map : { ...map, planes };
  });
}

export function renamePoiPlane(
  places: readonly Place[],
  placeId: PlaceId,
  poiId: PoiId,
  planeId: PlaneId,
  name: string,
): readonly Place[] {
  return mapOfPoi(places, placeId, poiId, (map) => {
    const planes = renamePlane(map.planes, planeId, name);
    return planes === map.planes ? map : { ...map, planes };
  });
}

export function movePoiPlane(
  places: readonly Place[],
  placeId: PlaceId,
  poiId: PoiId,
  planeId: PlaneId,
  y: number,
): readonly Place[] {
  return mapOfPoi(places, placeId, poiId, (map) => {
    const planes = movePlane(map.planes, planeId, y, MAP_MAX_HEIGHT, MAP_MIN_DEPTH);
    return planes === map.planes ? map : { ...map, planes };
  });
}

export function removePoiPlane(
  places: readonly Place[],
  placeId: PlaceId,
  poiId: PoiId,
  planeId: PlaneId,
): readonly Place[] {
  return mapOfPoi(places, placeId, poiId, (map) => {
    const planes = removePlane(map.planes, planeId);
    return planes === map.planes ? map : { ...map, planes };
  });
}

export function poiById(place: Place, poiId: PoiId): Poi | null {
  return place.pois.find((poi) => poi.id === poiId) ?? null;
}
