// Points of interest. Authored content: a POI's *existence* lives in the
// campaign, while whether the party knows about it is play state (R-8, R-16).

import type { MarkerId, NoteId, PoiId, EncounterId } from '../ids/index.js';
import { freshId } from '../ids/index.js';
import { DEFAULT_MARKER, isKnownMarker } from '../markers/index.js';
import type { ChunkCoord, GlobalCell } from '../world/index.js';
import { CHUNK_SIZE, toGlobal, fromGlobal } from '../world/index.js';

/** Where a POI sits: a chunk plus a cell inside it (R-50, exactly one cell). */
export interface PoiCell {
  readonly cx: number;
  readonly cz: number;
  readonly x: number;
  readonly z: number;
}

export interface PoiNote {
  readonly id: NoteId;
  readonly text: string;
  /** false = stripped by viewFor; never leaves the host (R-85). */
  readonly visibleToParty: boolean;
}

export interface Poi {
  readonly id: PoiId;
  readonly name: string;
  readonly cell: PoiCell;
  readonly markerId: MarkerId;
  readonly encounters: readonly EncounterId[];
  readonly notes: readonly PoiNote[];
}

export const MAX_POI_NAME = 60;
export const MAX_NOTE_TEXT = 2000;

export function sameCell(a: PoiCell, b: PoiCell): boolean {
  return a.cx === b.cx && a.cz === b.cz && a.x === b.x && a.z === b.z;
}

export function poiGlobal(poi: Poi): GlobalCell {
  return toGlobal({ cx: poi.cell.cx, cz: poi.cell.cz }, poi.cell.x, poi.cell.z);
}

export function poiCellFromGlobal(cell: GlobalCell): PoiCell {
  const { coord, x, z } = fromGlobal(cell);
  return { cx: coord.cx, cz: coord.cz, x, z };
}

export function isValidPoiCell(cell: PoiCell): boolean {
  return Number.isInteger(cell.cx) && Number.isInteger(cell.cz)
    && Number.isInteger(cell.x) && Number.isInteger(cell.z)
    && cell.x >= 0 && cell.x < CHUNK_SIZE && cell.z >= 0 && cell.z < CHUNK_SIZE;
}

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

/** Moves a note within its POI. Notes are ordered and the GM sorts them (R-85). */
export function moveNote(
  pois: readonly Poi[],
  id: PoiId,
  noteId: NoteId,
  delta: number,
): readonly Poi[] {
  return mapPoi(pois, id, (poi) => {
    const from = poi.notes.findIndex((note) => note.id === noteId);
    if (from < 0) return poi;
    const to = Math.min(poi.notes.length - 1, Math.max(0, from + delta));
    if (to === from) return poi;
    const notes = [...poi.notes];
    const [moved] = notes.splice(from, 1);
    if (!moved) return poi;
    notes.splice(to, 0, moved);
    return { ...poi, notes };
  });
}

/** What the table display may see: the visible notes, in the GM's order (R-85). */
export function partyVisibleNotes(poi: Poi): readonly PoiNote[] {
  return poi.notes.filter((note) => note.visibleToParty);
}
