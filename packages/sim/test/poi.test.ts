import { describe, it, expect } from 'vitest';
import { apply } from '@tt/sim';
import { viewFor, encodeCampaign } from '@tt/protocol';
import type { HostState, Intent } from '@tt/protocol';
import { createCampaign, ORIGIN } from '@tt/domain';

function open(): HostState {
  const campaign = createCampaign('Ashfall');
  return { campaigns: [{ id: campaign.id, name: campaign.name }], active: campaign };
}
const run = (s: HostState, i: Intent, role: 'gm' | 'table' = 'gm') => apply(s, role, i);
const at = (x: number, z: number) => ({ cx: ORIGIN.cx, cz: ORIGIN.cz, x, z });

function withPoi(name = 'Ash Village') {
  const state = open();
  const result = run(state, { kind: 'addPoi', cell: at(5, 6), name });
  return { state: result.state, id: result.state.active!.pois[0]!.id };
}

describe('placing a POI', () => {
  it('adds one in an existing chunk', () => {
    const { state } = withPoi();
    expect(state.active!.pois).toHaveLength(1);
    expect(state.active!.pois[0]?.name).toBe('Ash Village');
  });

  it('refuses a chunk that has not been created', () => {
    expect(run(open(), { kind: 'addPoi', cell: { cx: 0, cz: 0, x: 1, z: 1 } }).rejected)
      .toMatch(/chunk does not exist/);
  });

  it('refuses a second POI on the same cell (R-119)', () => {
    const { state } = withPoi();
    expect(run(state, { kind: 'addPoi', cell: at(5, 6) }).rejected).toMatch(/already a place/);
  });

  it('refuses an unknown marker rather than silently defaulting', () => {
    expect(run(open(), { kind: 'addPoi', cell: at(1, 1), markerId: 'marker:dragon' }).rejected)
      .toMatch(/unknown marker/);
  });

  it('asks the host to save', () => {
    const result = run(open(), { kind: 'addPoi', cell: at(2, 2) });
    expect(result.effects.map((e) => e.kind)).toEqual(['saveCampaign']);
  });
});

describe('editing a POI', () => {
  it('renames, re-markers and moves', () => {
    const start = withPoi();
    const { id } = start;
    let state = start.state;
    state = run(state, { kind: 'renamePoi', id, name: 'Ashfall' }).state;
    expect(state.active!.pois[0]?.name).toBe('Ashfall');
    state = run(state, { kind: 'setPoiMarker', id, markerId: 'marker:castle' }).state;
    expect(state.active!.pois[0]?.markerId).toBe('marker:castle');
    state = run(state, { kind: 'movePoi', id, cell: at(9, 9) }).state;
    expect(state.active!.pois[0]?.cell).toMatchObject({ x: 9, z: 9 });
  });

  it('refuses to move onto another POI', () => {
    const start = withPoi();
    const { id } = start;
    let state = start.state;
    state = run(state, { kind: 'addPoi', cell: at(1, 1), name: 'Other' }).state;
    expect(run(state, { kind: 'movePoi', id, cell: at(1, 1) }).rejected).toMatch(/already a place/);
  });

  it('rejects an unknown POI id with a reason (R-18)', () => {
    const { state } = withPoi();
    for (const intent of [
      { kind: 'renamePoi', id: 'ghost', name: 'x' },
      { kind: 'setPoiMarker', id: 'ghost', markerId: 'marker:cave' },
      { kind: 'removePoi', id: 'ghost' },
      { kind: 'addNote', poiId: 'ghost', text: 'x' },
    ] as Intent[]) {
      expect(run(state, intent).rejected, intent.kind).toMatch(/no such place/);
    }
  });

  it('removes', () => {
    const { state, id } = withPoi();
    expect(run(state, { kind: 'removePoi', id }).state.active!.pois).toEqual([]);
  });

  it('does not ask for a save when nothing changed', () => {
    const { state, id } = withPoi();
    const result = run(state, { kind: 'renamePoi', id, name: 'Ash Village' });
    expect(result.effects).toEqual([]);
    expect(result.state).toBe(state);
  });
});

describe('notes', () => {
  function withNotes() {
    const start = withPoi();
    const { id } = start;
    let state = start.state;
    state = run(state, { kind: 'addNote', poiId: id, text: 'Public thing', visibleToParty: true }).state;
    state = run(state, { kind: 'addNote', poiId: id, text: 'Secret thing' }).state;
    return { state, id, notes: () => state.active!.pois[0]!.notes };
  }

  it('adds notes hidden unless told otherwise', () => {
    const { notes } = withNotes();
    expect(notes().map((n) => n.visibleToParty)).toEqual([true, false]);
  });

  it('edits, toggles, reorders and removes', () => {
    const start = withNotes();
    const { id } = start;
    let state = start.state;
    const secret = state.active!.pois[0]!.notes[1]!.id;
    state = run(state, { kind: 'editNote', poiId: id, noteId: secret, text: 'Less secret' }).state;
    expect(state.active!.pois[0]?.notes[1]?.text).toBe('Less secret');
    state = run(state, { kind: 'moveNote', poiId: id, noteId: secret, delta: -1 }).state;
    expect(state.active!.pois[0]?.notes[0]?.text).toBe('Less secret');
    state = run(state, { kind: 'setNoteVisible', poiId: id, noteId: secret, visibleToParty: true }).state;
    expect(state.active!.pois[0]?.notes[0]?.visibleToParty).toBe(true);
    state = run(state, { kind: 'removeNote', poiId: id, noteId: secret }).state;
    expect(state.active!.pois[0]?.notes).toHaveLength(1);
  });

  it('rejects an unknown note id', () => {
    const { state, id } = withNotes();
    expect(run(state, { kind: 'removeNote', poiId: id, noteId: 'ghost' }).rejected).toMatch(/no such note/);
  });
});

describe('the table display and POIs (D-121)', () => {
  it('receives none of them while Revealed does not exist', () => {
    const { state } = withPoi();
    const view = viewFor('table', state);
    expect(view.campaign?.pois).toEqual([]);
  });

  it('never carries a GM note in its payload, by any route', () => {
    const start = withPoi();
    const { id } = start;
    let state = start.state;
    state = run(state, { kind: 'addNote', poiId: id, text: 'The elder is a spy' }).state;
    state = run(state, { kind: 'addNote', poiId: id, text: 'Also public', visibleToParty: true }).state;
    const payload = JSON.stringify(viewFor('table', state));
    expect(payload).not.toContain('The elder is a spy');
    expect(payload).not.toContain('Also public');
    expect(payload).not.toContain('Ash Village');
    // and the GM does get them
    expect(JSON.stringify(viewFor('gm', state))).toContain('The elder is a spy');
  });

  it('refuses every POI intent from the table display', () => {
    const { state, id } = withPoi();
    for (const intent of [
      { kind: 'addPoi', cell: at(1, 1) },
      { kind: 'renamePoi', id, name: 'x' },
      { kind: 'removePoi', id },
      { kind: 'addNote', poiId: id, text: 'x' },
    ] as Intent[]) {
      expect(run(state, intent, 'table').rejected, intent.kind).toBeTruthy();
    }
  });
});

describe('POIs survive a round trip', () => {
  it('keeps name, cell, marker and notes through encode and decode', async () => {
    const { state, id } = withPoi('Ashfall');
    const withNote = run(state, { kind: 'addNote', poiId: id, text: 'Note', visibleToParty: true }).state;
    const { decodeCampaign } = await import('@tt/protocol');
    const back = decodeCampaign(encodeCampaign(withNote.active!));
    expect(back.pois).toHaveLength(1);
    expect(back.pois[0]?.name).toBe('Ashfall');
    expect(back.pois[0]?.cell).toMatchObject({ x: 5, z: 6 });
    expect(back.pois[0]?.markerId).toBe('marker:village');
    expect(back.pois[0]?.notes[0]).toMatchObject({ text: 'Note', visibleToParty: true });
  });
});
