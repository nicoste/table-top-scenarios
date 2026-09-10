import { describe, it, expect } from 'vitest';
import {
  addPoi, renamePoi, setPoiMarker, movePoi, removePoi, poiAt, poiById, poisInChunk,
  addNote, editNote, setNoteVisible, removeNote, moveNote, partyVisibleNotes,
  poiGlobal, poiCellFromGlobal, isValidPoiCell, sameCell,
  DEFAULT_MARKERS, DEFAULT_MARKER, markerById, isKnownMarker,
  CHUNK_SIZE, MAX_POI_NAME, registryId,
} from '@tt/domain';
import type { MarkerId, Poi, PoiCell } from '@tt/domain';

const cell = (cx: number, cz: number, x: number, z: number): PoiCell => ({ cx, cz, x, z });
const one = (name = 'Ash Village') => addPoi([], cell(3, 4, 5, 6), name);
const idOf = (pois: readonly Poi[], i = 0) => pois[i]!.id;

describe('placing POIs', () => {
  it('places one at a cell with a default marker', () => {
    const pois = one();
    expect(pois).toHaveLength(1);
    expect(pois[0]?.name).toBe('Ash Village');
    expect(pois[0]?.markerId).toBe(DEFAULT_MARKER);
    expect(pois[0]?.encounters).toEqual([]);
    expect(pois[0]?.notes).toEqual([]);
  });

  it('refuses a second POI on the same cell (R-119)', () => {
    const pois = one();
    expect(addPoi(pois, cell(3, 4, 5, 6), 'Interloper')).toBe(pois);
  });

  it('allows a POI on the same cell index of a different chunk', () => {
    const pois = addPoi(one(), cell(9, 9, 5, 6), 'Elsewhere');
    expect(pois).toHaveLength(2);
  });

  it('rejects cells outside a chunk', () => {
    for (const bad of [cell(0, 0, -1, 0), cell(0, 0, 0, CHUNK_SIZE), cell(0, 0, 1.5, 0)]) {
      expect(isValidPoiCell(bad)).toBe(false);
      expect(addPoi([], bad)).toEqual([]);
    }
  });

  it('names an unnamed POI rather than leaving it blank', () => {
    expect(addPoi([], cell(0, 0, 0, 0), '   ')[0]?.name).toBeTruthy();
  });

  it('caps absurd names', () => {
    expect(addPoi([], cell(0, 0, 0, 0), 'x'.repeat(500))[0]?.name.length).toBe(MAX_POI_NAME);
  });

  it('falls back to the default for an unknown marker', () => {
    const bogus = registryId<'MarkerId'>('marker', 'dragon-lair') as MarkerId;
    expect(addPoi([], cell(0, 0, 0, 0), 'x', bogus)[0]?.markerId).toBe(DEFAULT_MARKER);
  });
});

describe('finding POIs', () => {
  it('finds by cell, by id, and by chunk', () => {
    const pois = addPoi(one(), cell(3, 4, 9, 9), 'Second');
    expect(poiAt(pois, cell(3, 4, 5, 6))?.name).toBe('Ash Village');
    expect(poiAt(pois, cell(3, 4, 1, 1))).toBeNull();
    expect(poiById(pois, idOf(pois))?.name).toBe('Ash Village');
    expect(poisInChunk(pois, { cx: 3, cz: 4 })).toHaveLength(2);
    expect(poisInChunk(pois, { cx: 0, cz: 0 })).toHaveLength(0);
  });

  it('round-trips a cell through global coordinates', () => {
    const pois = one();
    expect(poiCellFromGlobal(poiGlobal(pois[0]!))).toEqual(pois[0]!.cell);
  });
});

describe('editing POIs', () => {
  it('renames, and keeps the old name for a blank one', () => {
    const pois = one();
    expect(renamePoi(pois, idOf(pois), 'Ashfall')[0]?.name).toBe('Ashfall');
    expect(renamePoi(pois, idOf(pois), '  ')[0]?.name).toBe('Ash Village');
  });

  it('changes the marker, ignoring unknown ones', () => {
    const pois = one();
    const castle = DEFAULT_MARKERS.find((m) => m.id === 'marker:castle')!.id;
    expect(setPoiMarker(pois, idOf(pois), castle)[0]?.markerId).toBe(castle);
    const bogus = registryId<'MarkerId'>('marker', 'nope') as MarkerId;
    expect(setPoiMarker(pois, idOf(pois), bogus)).toBe(pois);
  });

  it('moves to a free cell but not onto another POI', () => {
    let pois = addPoi(one(), cell(3, 4, 1, 1), 'Second');
    pois = movePoi(pois, idOf(pois), cell(3, 4, 2, 2));
    expect(sameCell(pois[0]!.cell, cell(3, 4, 2, 2))).toBe(true);
    expect(movePoi(pois, idOf(pois), cell(3, 4, 1, 1))).toBe(pois);
  });

  it('lets a POI "move" to where it already is', () => {
    const pois = one();
    expect(movePoi(pois, idOf(pois), cell(3, 4, 5, 6))).toBe(pois);
  });

  it('removes, and is a no-op for an unknown id', () => {
    const pois = one();
    expect(removePoi(pois, idOf(pois))).toEqual([]);
    expect(removePoi(pois, 'poi_ghost' as never)).toBe(pois);
  });

  it('returns the same list when nothing would change', () => {
    const pois = one();
    expect(renamePoi(pois, idOf(pois), 'Ash Village')).toBe(pois);
    expect(setPoiMarker(pois, idOf(pois), DEFAULT_MARKER)).toBe(pois);
  });
});

describe('notes', () => {
  const withNotes = () => {
    let pois = one();
    const id = idOf(pois);
    pois = addNote(pois, id, 'Smells of ash', true);
    pois = addNote(pois, id, 'The elder is a spy');
    pois = addNote(pois, id, 'Well is poisoned');
    return { pois, id };
  };

  it('adds notes in order, hidden by default', () => {
    const { pois } = withNotes();
    expect(pois[0]?.notes.map((n) => n.text)).toEqual(['Smells of ash', 'The elder is a spy', 'Well is poisoned']);
    expect(pois[0]?.notes.map((n) => n.visibleToParty)).toEqual([true, false, false]);
  });

  it('hides new notes by default, so a secret is never leaked by omission', () => {
    const pois = addNote(one(), idOf(one()), 'x');
    expect(pois[0]?.notes[0]?.visibleToParty ?? false).toBe(false);
  });

  it('ignores an empty note', () => {
    const pois = one();
    expect(addNote(pois, idOf(pois), '   ')).toBe(pois);
  });

  it('gives every note a distinct id', () => {
    const { pois } = withNotes();
    expect(new Set(pois[0]!.notes.map((n) => n.id)).size).toBe(3);
  });

  it('edits, toggles and removes', () => {
    const { pois: p0, id } = withNotes();
    let pois = p0;
    const noteId = pois[0]!.notes[1]!.id;
    pois = editNote(pois, id, noteId, 'The elder is loyal');
    expect(pois[0]?.notes[1]?.text).toBe('The elder is loyal');
    pois = setNoteVisible(pois, id, noteId, true);
    expect(pois[0]?.notes[1]?.visibleToParty).toBe(true);
    pois = removeNote(pois, id, noteId);
    expect(pois[0]?.notes).toHaveLength(2);
  });

  it('reorders, clamping at both ends', () => {
    const { pois: p0, id } = withNotes();
    let pois = p0;
    const first = pois[0]!.notes[0]!.id;
    pois = moveNote(pois, id, first, 2);
    expect(pois[0]?.notes.map((n) => n.text)).toEqual(['The elder is a spy', 'Well is poisoned', 'Smells of ash']);
    pois = moveNote(pois, id, first, -99);
    expect(pois[0]?.notes[0]?.text).toBe('Smells of ash');
    expect(moveNote(pois, id, first, -1)).toBe(pois);
  });

  it('exposes only visible notes to the party, in the GM order (R-85)', () => {
    const { pois: p0, id } = withNotes();
    let pois = p0;
    pois = setNoteVisible(pois, id, pois[0]!.notes[2]!.id, true);
    expect(partyVisibleNotes(pois[0]!).map((n) => n.text)).toEqual(['Smells of ash', 'Well is poisoned']);
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
