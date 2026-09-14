// Points of interest. Authored content: a POI's *existence* lives in the
// campaign, while whether the party knows about it is play state (R-8, R-16).

import type { MarkerId, NoteId, PoiId, EncounterId } from '../ids/index.js';
import { freshId } from '../ids/index.js';
import { DEFAULT_MARKER, isKnownMarker } from '../markers/index.js';
import type { ChunkCoord, GlobalCell, WorldCell } from '../world/index.js';
import { toGlobal, fromGlobal, sameWorldCell, isValidWorldCell } from '../world/index.js';

/**
 * Where a POI sits: a chunk plus a cell inside it (R-50, exactly one cell).
 *
 * An alias of `WorldCell`, kept as a name because "the POI's cell" reads better
 * than "the POI's world cell" everywhere it is used.
 */
export type PoiCell = WorldCell;

export interface PoiNote {
  readonly id: NoteId;
  readonly text: string;
  /** false = stripped by viewFor; never leaves the host (R-85). */
  readonly visibleToParty: boolean;
}

/**
 * One encounter a place owns (D-175).
 *
 * For now a name and a visibility flag — the list the GM asked for. It is
 * deliberately a *record with an id* rather than a bare string, because the
 * encounter **map** attaches here later (O-009, R-49): a name in a list can grow
 * a grid, a string in an array cannot.
 */
export interface PoiEncounter {
  readonly id: EncounterId;
  readonly name: string;
  /** false = stripped by viewFor; never leaves the host (R-85). */
  readonly visibleToParty: boolean;
}

export interface Poi {
  readonly id: PoiId;
  readonly name: string;
  readonly cell: PoiCell;
  readonly markerId: MarkerId;
  /** ORDERED, the GM sorts them. A POI owns many maps (R-49). */
  readonly encounters: readonly PoiEncounter[];
  readonly notes: readonly PoiNote[];
}

export const MAX_POI_NAME = 60;
export const MAX_NOTE_TEXT = 2000;
export const MAX_ENCOUNTER_NAME = 80;

export const sameCell = sameWorldCell;

export function poiGlobal(poi: Poi): GlobalCell {
  return toGlobal({ cx: poi.cell.cx, cz: poi.cell.cz }, poi.cell.x, poi.cell.z);
}

export function poiCellFromGlobal(cell: GlobalCell): PoiCell {
  const { coord, x, z } = fromGlobal(cell);
  return { cx: coord.cx, cz: coord.cz, x, z };
}

export const isValidPoiCell = isValidWorldCell;

// -- lookups -----------------------------------------------------------------

export function poiAt(pois: readonly Poi[], cell: PoiCell): Poi | null {
  return pois.find((poi) => sameCell(poi.cell, cell)) ?? null;
}

export function poiById(pois: readonly Poi[], id: PoiId): Poi | null {
  return pois.find((poi) => poi.id === id) ?? null;
}

export function poisInChunk(pois: readonly Poi[], coord: ChunkCoord): readonly Poi[] {
  return pois.filter((poi) => poi.cell.cx === coord.cx && poi.cell.cz === coord.cz);
}

// -- editing -----------------------------------------------------------------

function cleanName(name: string | undefined, fallback: string): string {
  const trimmed = (name ?? '').trim().slice(0, MAX_POI_NAME);
  return trimmed || fallback;
}

/**
 * Adds a POI. Returns the list unchanged when the cell is already taken —
 * at most one POI per cell (R-119), or the tap gesture becomes ambiguous.
 */
export function addPoi(
  pois: readonly Poi[],
  cell: PoiCell,
  name?: string,
  markerId: MarkerId = DEFAULT_MARKER,
): readonly Poi[] {
  if (!isValidPoiCell(cell) || poiAt(pois, cell)) return pois;
  const poi: Poi = {
    id: freshId<'PoiId'>('poi'),
    name: cleanName(name, 'New place'),
    cell,
    markerId: isKnownMarker(markerId) ? markerId : DEFAULT_MARKER,
    encounters: [],
    notes: [],
  };
  return [...pois, poi];
}

function mapPoi(pois: readonly Poi[], id: PoiId, change: (poi: Poi) => Poi): readonly Poi[] {
  let touched = false;
  const next = pois.map((poi) => {
    if (poi.id !== id) return poi;
    const changed = change(poi);
    if (changed !== poi) touched = true;
    return changed;
  });
  return touched ? next : pois;
}

export function renamePoi(pois: readonly Poi[], id: PoiId, name: string): readonly Poi[] {
  return mapPoi(pois, id, (poi) => {
    const next = cleanName(name, poi.name);
    return next === poi.name ? poi : { ...poi, name: next };
  });
}

export function setPoiMarker(pois: readonly Poi[], id: PoiId, markerId: MarkerId): readonly Poi[] {
  if (!isKnownMarker(markerId)) return pois;
  return mapPoi(pois, id, (poi) => (poi.markerId === markerId ? poi : { ...poi, markerId }));
}

/** Moves a POI, unless the destination is invalid or already occupied. */
export function movePoi(pois: readonly Poi[], id: PoiId, cell: PoiCell): readonly Poi[] {
  if (!isValidPoiCell(cell)) return pois;
  const occupant = poiAt(pois, cell);
  if (occupant && occupant.id !== id) return pois;
  return mapPoi(pois, id, (poi) => (sameCell(poi.cell, cell) ? poi : { ...poi, cell }));
}

export function removePoi(pois: readonly Poi[], id: PoiId): readonly Poi[] {
  const next = pois.filter((poi) => poi.id !== id);
  return next.length === pois.length ? pois : next;
}

// -- notes -------------------------------------------------------------------

export function addNote(
  pois: readonly Poi[],
  id: PoiId,
  text: string,
  visibleToParty = false,
): readonly Poi[] {
  const clean = text.trim().slice(0, MAX_NOTE_TEXT);
  if (!clean) return pois;
  return mapPoi(pois, id, (poi) => ({
    ...poi,
    notes: [...poi.notes, { id: freshId<'NoteId'>('note'), text: clean, visibleToParty }],
  }));
}

function mapNote(poi: Poi, noteId: NoteId, change: (note: PoiNote) => PoiNote): Poi {
  let touched = false;
  const notes = poi.notes.map((note) => {
    if (note.id !== noteId) return note;
    const changed = change(note);
    if (changed !== note) touched = true;
    return changed;
  });
  return touched ? { ...poi, notes } : poi;
}

export function editNote(
  pois: readonly Poi[],
  id: PoiId,
  noteId: NoteId,
  text: string,
): readonly Poi[] {
  const clean = text.slice(0, MAX_NOTE_TEXT);
  return mapPoi(pois, id, (poi) =>
    mapNote(poi, noteId, (note) => (note.text === clean ? note : { ...note, text: clean })));
}

export function setNoteVisible(
  pois: readonly Poi[],
  id: PoiId,
  noteId: NoteId,
  visibleToParty: boolean,
): readonly Poi[] {
  return mapPoi(pois, id, (poi) =>
    mapNote(poi, noteId, (note) =>
      (note.visibleToParty === visibleToParty ? note : { ...note, visibleToParty })));
}

export function removeNote(pois: readonly Poi[], id: PoiId, noteId: NoteId): readonly Poi[] {
  return mapPoi(pois, id, (poi) => {
    const notes = poi.notes.filter((note) => note.id !== noteId);
    return notes.length === poi.notes.length ? poi : { ...poi, notes };
  });
}

/**
 * Moves one entry of an ordered list, clamped to its ends.
 *
 * Shared by notes and encounters. The index clamping and the splice dance are
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

/** Moves a note within its POI. Notes are ordered and the GM sorts them (R-85). */
export function moveNote(
  pois: readonly Poi[],
  id: PoiId,
  noteId: NoteId,
  delta: number,
): readonly Poi[] {
  return mapPoi(pois, id, (poi) => {
    const notes = moveWithin(poi.notes, noteId, delta);
    return notes === poi.notes ? poi : { ...poi, notes };
  });
}

/** What the table display may see: the visible notes, in the GM's order (R-85). */
export function partyVisibleNotes(poi: Poi): readonly PoiNote[] {
  return poi.notes.filter((note) => note.visibleToParty);
}

// -- encounters --------------------------------------------------------------
//
// The same shape as notes, and deliberately so: an ordered list the GM sorts,
// each entry individually visible or not. Nothing here knows about maps yet
// (O-009); an entry is a name the map will hang off later.

function mapEncounter(
  poi: Poi,
  encounterId: EncounterId,
  change: (encounter: PoiEncounter) => PoiEncounter,
): Poi {
  let touched = false;
  const encounters = poi.encounters.map((encounter) => {
    if (encounter.id !== encounterId) return encounter;
    const changed = change(encounter);
    if (changed !== encounter) touched = true;
    return changed;
  });
  return touched ? { ...poi, encounters } : poi;
}

export function addEncounter(
  pois: readonly Poi[],
  id: PoiId,
  name: string,
  visibleToParty = false,
): readonly Poi[] {
  const clean = name.trim().slice(0, MAX_ENCOUNTER_NAME);
  if (!clean) return pois;
  return mapPoi(pois, id, (poi) => ({
    ...poi,
    encounters: [
      ...poi.encounters,
      { id: freshId<'EncounterId'>('encounter'), name: clean, visibleToParty },
    ],
  }));
}

export function renameEncounter(
  pois: readonly Poi[],
  id: PoiId,
  encounterId: EncounterId,
  name: string,
): readonly Poi[] {
  const clean = name.trim().slice(0, MAX_ENCOUNTER_NAME);
  if (!clean) return pois;
  return mapPoi(pois, id, (poi) =>
    mapEncounter(poi, encounterId, (e) => (e.name === clean ? e : { ...e, name: clean })));
}

export function setEncounterVisible(
  pois: readonly Poi[],
  id: PoiId,
  encounterId: EncounterId,
  visibleToParty: boolean,
): readonly Poi[] {
  return mapPoi(pois, id, (poi) =>
    mapEncounter(poi, encounterId, (e) =>
      (e.visibleToParty === visibleToParty ? e : { ...e, visibleToParty })));
}

export function removeEncounter(
  pois: readonly Poi[],
  id: PoiId,
  encounterId: EncounterId,
): readonly Poi[] {
  return mapPoi(pois, id, (poi) => {
    const encounters = poi.encounters.filter((e) => e.id !== encounterId);
    return encounters.length === poi.encounters.length ? poi : { ...poi, encounters };
  });
}

export function moveEncounter(
  pois: readonly Poi[],
  id: PoiId,
  encounterId: EncounterId,
  delta: number,
): readonly Poi[] {
  return mapPoi(pois, id, (poi) => {
    const encounters = moveWithin(poi.encounters, encounterId, delta);
    return encounters === poi.encounters ? poi : { ...poi, encounters };
  });
}

/** What the table display may see: the visible encounters, in the GM's order. */
export function partyVisibleEncounters(poi: Poi): readonly PoiEncounter[] {
  return poi.encounters.filter((e) => e.visibleToParty);
}
