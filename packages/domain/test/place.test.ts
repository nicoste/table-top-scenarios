import { describe, it, expect } from 'vitest';
import {
  addPlace, renamePlace, setPlaceMarker, movePlace, removePlace, placeAt, placeById, placesInChunk,
  addNote, editNote, setNoteVisible, removeNote, moveNote, partyVisibleNotes,
  placeGlobal, placeCellFromGlobal, isValidPlaceCell, sameCell,
  DEFAULT_MARKERS, DEFAULT_MARKER, markerById, isKnownMarker,
  CHUNK_SIZE, MAX_PLACE_NAME, registryId,
} from '@tt/domain';
import type { MarkerId, Place, PlaceCell } from '@tt/domain';

const cell = (cx: number, cz: number, x: number, z: number): PlaceCell => ({ cx, cz, x, z });
const one = (name = 'Ash Village') => addPlace([], cell(3, 4, 5, 6), name);
const idOf = (places: readonly Place[], i = 0) => places[i]!.id;

describe('placing places', () => {
  it('places one at a cell with a default marker', () => {
    const places = one();
    expect(places).toHaveLength(1);
    expect(places[0]?.name).toBe('Ash Village');
    expect(places[0]?.markerId).toBe(DEFAULT_MARKER);
    expect(places[0]?.pois).toEqual([]);
    expect(places[0]?.notes).toEqual([]);
  });

  it('refuses a second place on the same cell (R-119)', () => {
    const places = one();
    expect(addPlace(places, cell(3, 4, 5, 6), 'Interloper')).toBe(places);
  });

  it('allows a place on the same cell index of a different chunk', () => {
    const places = addPlace(one(), cell(9, 9, 5, 6), 'Elsewhere');
    expect(places).toHaveLength(2);
  });

  it('rejects cells outside a chunk', () => {
    for (const bad of [cell(0, 0, -1, 0), cell(0, 0, 0, CHUNK_SIZE), cell(0, 0, 1.5, 0)]) {
      expect(isValidPlaceCell(bad)).toBe(false);
      expect(addPlace([], bad)).toEqual([]);
    }
  });

  it('names an unnamed place rather than leaving it blank', () => {
    expect(addPlace([], cell(0, 0, 0, 0), '   ')[0]?.name).toBeTruthy();
  });

  it('caps absurd names', () => {
    expect(addPlace([], cell(0, 0, 0, 0), 'x'.repeat(500))[0]?.name.length).toBe(MAX_PLACE_NAME);
  });

  it('falls back to the default for an unknown marker', () => {
    const bogus = registryId<'MarkerId'>('marker', 'dragon-lair') as MarkerId;
    expect(addPlace([], cell(0, 0, 0, 0), 'x', bogus)[0]?.markerId).toBe(DEFAULT_MARKER);
  });
});

describe('finding places', () => {
  it('finds by cell, by id, and by chunk', () => {
    const places = addPlace(one(), cell(3, 4, 9, 9), 'Second');
    expect(placeAt(places, cell(3, 4, 5, 6))?.name).toBe('Ash Village');
    expect(placeAt(places, cell(3, 4, 1, 1))).toBeNull();
    expect(placeById(places, idOf(places))?.name).toBe('Ash Village');
    expect(placesInChunk(places, { cx: 3, cz: 4 })).toHaveLength(2);
    expect(placesInChunk(places, { cx: 0, cz: 0 })).toHaveLength(0);
  });

  it('round-trips a cell through global coordinates', () => {
    const places = one();
    expect(placeCellFromGlobal(placeGlobal(places[0]!))).toEqual(places[0]!.cell);
  });
});

describe('editing places', () => {
  it('renames, and keeps the old name for a blank one', () => {
    const places = one();
    expect(renamePlace(places, idOf(places), 'Ashfall')[0]?.name).toBe('Ashfall');
    expect(renamePlace(places, idOf(places), '  ')[0]?.name).toBe('Ash Village');
  });

  it('changes the marker, ignoring unknown ones', () => {
    const places = one();
    const castle = DEFAULT_MARKERS.find((m) => m.id === 'marker:castle')!.id;
    expect(setPlaceMarker(places, idOf(places), castle)[0]?.markerId).toBe(castle);
    const bogus = registryId<'MarkerId'>('marker', 'nope') as MarkerId;
    expect(setPlaceMarker(places, idOf(places), bogus)).toBe(places);
  });

  it('moves to a free cell but not onto another place', () => {
    let places = addPlace(one(), cell(3, 4, 1, 1), 'Second');
    places = movePlace(places, idOf(places), cell(3, 4, 2, 2));
    expect(sameCell(places[0]!.cell, cell(3, 4, 2, 2))).toBe(true);
    expect(movePlace(places, idOf(places), cell(3, 4, 1, 1))).toBe(places);
  });

  it('lets a place "move" to where it already is', () => {
    const places = one();
    expect(movePlace(places, idOf(places), cell(3, 4, 5, 6))).toBe(places);
  });

  it('starts facing the way its marker is written, unless told otherwise (R-203)', () => {
    expect(one()[0]!.facing).toBe(0);
    expect(addPlace([], cell(0, 0, 0, 0), 'Gate', undefined, 3)[0]!.facing).toBe(3);
  });

  it('turns on its own cell, which is a move to where it already is', () => {
    const places = one();
    const turnedPlace = movePlace(places, idOf(places), cell(3, 4, 5, 6), 1);
    expect(turnedPlace).not.toBe(places);
    expect(turnedPlace[0]!.facing).toBe(1);
    expect(sameCell(turnedPlace[0]!.cell, cell(3, 4, 5, 6))).toBe(true);
  });

  it('moves and turns in one edit, keeping everything else about it', () => {
    const places = one();
    const before = places[0]!;
    const after = movePlace(places, idOf(places), cell(3, 4, 9, 9), 2)[0]!;
    expect(after.facing).toBe(2);
    expect(sameCell(after.cell, cell(3, 4, 9, 9))).toBe(true);
    // The same place on a new cell: same id, same name, same everything.
    expect({ ...after, cell: before.cell, facing: before.facing }).toEqual(before);
  });

  it('keeps its facing when moved without one', () => {
    const start = one();
    const places = movePlace(start, idOf(start), cell(3, 4, 5, 6), 3);
    expect(movePlace(places, idOf(places), cell(3, 4, 1, 1))[0]!.facing).toBe(3);
  });

  it('is the same list when moved to where it is, facing the way it faces', () => {
    const start = one();
    const places = movePlace(start, idOf(start), cell(3, 4, 5, 6), 2);
    expect(movePlace(places, idOf(places), cell(3, 4, 5, 6), 2)).toBe(places);
  });

  it('removes, and is a no-op for an unknown id', () => {
    const places = one();
    expect(removePlace(places, idOf(places))).toEqual([]);
    expect(removePlace(places, 'poi_ghost' as never)).toBe(places);
  });

  it('returns the same list when nothing would change', () => {
    const places = one();
    expect(renamePlace(places, idOf(places), 'Ash Village')).toBe(places);
    expect(setPlaceMarker(places, idOf(places), DEFAULT_MARKER)).toBe(places);
  });
});

describe('notes', () => {
  const withNotes = () => {
    let places = one();
    const id = idOf(places);
    places = addNote(places, id, 'Smells of ash', true);
    places = addNote(places, id, 'The elder is a spy');
    places = addNote(places, id, 'Well is poisoned');
    return { places, id };
  };

  it('adds notes in order, hidden by default', () => {
    const { places } = withNotes();
    expect(places[0]?.notes.map((n) => n.text)).toEqual(['Smells of ash', 'The elder is a spy', 'Well is poisoned']);
    expect(places[0]?.notes.map((n) => n.visibleToParty)).toEqual([true, false, false]);
  });

  it('hides new notes by default, so a secret is never leaked by omission', () => {
    const places = addNote(one(), idOf(one()), 'x');
    expect(places[0]?.notes[0]?.visibleToParty ?? false).toBe(false);
  });

  it('ignores an empty note', () => {
    const places = one();
    expect(addNote(places, idOf(places), '   ')).toBe(places);
  });

  it('gives every note a distinct id', () => {
    const { places } = withNotes();
    expect(new Set(places[0]!.notes.map((n) => n.id)).size).toBe(3);
  });

  it('edits, toggles and removes', () => {
    const { places: p0, id } = withNotes();
    let places = p0;
    const noteId = places[0]!.notes[1]!.id;
    places = editNote(places, id, noteId, 'The elder is loyal');
    expect(places[0]?.notes[1]?.text).toBe('The elder is loyal');
    places = setNoteVisible(places, id, noteId, true);
    expect(places[0]?.notes[1]?.visibleToParty).toBe(true);
    places = removeNote(places, id, noteId);
    expect(places[0]?.notes).toHaveLength(2);
  });

  it('reorders, clamping at both ends', () => {
    const { places: p0, id } = withNotes();
    let places = p0;
    const first = places[0]!.notes[0]!.id;
    places = moveNote(places, id, first, 2);
    expect(places[0]?.notes.map((n) => n.text)).toEqual(['The elder is a spy', 'Well is poisoned', 'Smells of ash']);
    places = moveNote(places, id, first, -99);
    expect(places[0]?.notes[0]?.text).toBe('Smells of ash');
    expect(moveNote(places, id, first, -1)).toBe(places);
  });

  it('exposes only visible notes to the party, in the GM order (R-85)', () => {
    const { places: p0, id } = withNotes();
    let places = p0;
    places = setNoteVisible(places, id, places[0]!.notes[2]!.id, true);
    expect(partyVisibleNotes(places[0]!).map((n) => n.text)).toEqual(['Smells of ash', 'Well is poisoned']);
  });
});

describe('the marker registry', () => {
  it('addresses every marker by a namespaced string id (R-11)', () => {
    expect(DEFAULT_MARKERS.every((m) => /^marker:[a-z0-9-]+$/.test(m.id))).toBe(true);
    expect(new Set(DEFAULT_MARKERS.map((m) => m.id)).size).toBe(DEFAULT_MARKERS.length);
  });

  it('has a default that exists', () => {
    expect(isKnownMarker(DEFAULT_MARKER)).toBe(true);
    expect(markerById(DEFAULT_MARKERS, DEFAULT_MARKER)).not.toBeNull();
  });

  it('describes every marker as buildable primitives, not a model file', () => {
    for (const m of DEFAULT_MARKERS) {
      expect(m.parts.length, m.id).toBeGreaterThan(0);
      for (const part of m.parts) {
        expect(['box', 'cone', 'cylinder']).toContain(part.shape);
        expect(part.at).toHaveLength(3);
        expect(part.size).toHaveLength(3);
        expect(part.colour).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('keeps every marker inside its own cell and at a legible height', () => {
    for (const m of DEFAULT_MARKERS) {
      for (const part of m.parts) {
        const [x, y, z] = part.at;
        const [w, h, d] = part.size;
        expect(Math.abs(x!) + w! / 2, `${m.id} x`).toBeLessThanOrEqual(0.5);
        expect(Math.abs(z!) + d! / 2, `${m.id} z`).toBeLessThanOrEqual(0.5);
        expect(y! - h! / 2, `${m.id} sits on the ground`).toBeGreaterThanOrEqual(-0.001);
        expect(y! + h! / 2, `${m.id} height`).toBeLessThanOrEqual(2);
      }
    }
  });
});
