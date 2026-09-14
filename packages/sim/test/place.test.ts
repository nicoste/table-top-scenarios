import { describe, it, expect } from 'vitest';
import { apply, emptyHistory } from '@tt/sim';
import { viewFor, encodeCampaign } from '@tt/protocol';
import type { HostState, Intent } from '@tt/protocol';
import { createCampaign, createLiveSave, ORIGIN } from '@tt/domain';

const NOW = '2026-01-01T00:00:00.000Z';
function open(): HostState {
  const campaign = createCampaign('Ashfall');
  const live = createLiveSave(campaign, NOW);
  return {
    campaigns: [{ id: campaign.id, name: campaign.name }],
    active: campaign,
    activeSave: live,
    history: emptyHistory(),
  };
}
const run = (s: HostState, i: Intent, role: 'gm' | 'table' = 'gm') => apply(s, role, i, NOW);
const at = (x: number, z: number) => ({ cx: ORIGIN.cx, cz: ORIGIN.cz, x, z });

function withPlace(name = 'Ash Village') {
  const state = open();
  const result = run(state, { kind: 'addPlace', cell: at(5, 6), name });
  return { state: result.state, id: result.state.active!.places[0]!.id };
}

describe('placing a place', () => {
  it('adds one in an existing chunk', () => {
    const { state } = withPlace();
    expect(state.active!.places).toHaveLength(1);
    expect(state.active!.places[0]?.name).toBe('Ash Village');
  });

  it('refuses a chunk that has not been created', () => {
    expect(run(open(), { kind: 'addPlace', cell: { cx: 0, cz: 0, x: 1, z: 1 } }).rejected)
      .toMatch(/chunk does not exist/);
  });

  it('refuses a second place on the same cell (R-119)', () => {
    const { state } = withPlace();
    expect(run(state, { kind: 'addPlace', cell: at(5, 6) }).rejected).toMatch(/already a place/);
  });

  it('refuses an unknown marker rather than silently defaulting', () => {
    expect(run(open(), { kind: 'addPlace', cell: at(1, 1), markerId: 'marker:dragon' }).rejected)
      .toMatch(/unknown marker/);
  });

  it('asks the host to save', () => {
    const result = run(open(), { kind: 'addPlace', cell: at(2, 2) });
    expect(result.effects.map((e) => e.kind)).toEqual(['saveCampaign']);
  });
});

describe('editing a place', () => {
  it('renames, re-markers and moves', () => {
    const start = withPlace();
    const { id } = start;
    let state = start.state;
    state = run(state, { kind: 'renamePlace', id, name: 'Ashfall' }).state;
    expect(state.active!.places[0]?.name).toBe('Ashfall');
    state = run(state, { kind: 'setPlaceMarker', id, markerId: 'marker:castle' }).state;
    expect(state.active!.places[0]?.markerId).toBe('marker:castle');
    state = run(state, { kind: 'movePlace', id, cell: at(9, 9) }).state;
    expect(state.active!.places[0]?.cell).toMatchObject({ x: 9, z: 9 });
  });

  it('refuses to move onto another place', () => {
    const start = withPlace();
    const { id } = start;
    let state = start.state;
    state = run(state, { kind: 'addPlace', cell: at(1, 1), name: 'Other' }).state;
    expect(run(state, { kind: 'movePlace', id, cell: at(1, 1) }).rejected).toMatch(/already a place/);
  });

  it('rejects an unknown place id with a reason (R-18)', () => {
    const { state } = withPlace();
    for (const intent of [
      { kind: 'renamePlace', id: 'ghost', name: 'x' },
      { kind: 'setPlaceMarker', id: 'ghost', markerId: 'marker:cave' },
      { kind: 'removePlace', id: 'ghost' },
      { kind: 'addNote', placeId: 'ghost', text: 'x' },
    ] as Intent[]) {
      expect(run(state, intent).rejected, intent.kind).toMatch(/no such place/);
    }
  });

  it('removes', () => {
    const { state, id } = withPlace();
    expect(run(state, { kind: 'removePlace', id }).state.active!.places).toEqual([]);
  });

  it('does not ask for a save when nothing changed', () => {
    const { state, id } = withPlace();
    const result = run(state, { kind: 'renamePlace', id, name: 'Ash Village' });
    expect(result.effects).toEqual([]);
    expect(result.state).toBe(state);
  });
});

describe('notes', () => {
  function withNotes() {
    const start = withPlace();
    const { id } = start;
    let state = start.state;
    state = run(state, { kind: 'addNote', placeId: id, text: 'Public thing', visibleToParty: true }).state;
    state = run(state, { kind: 'addNote', placeId: id, text: 'Secret thing' }).state;
    return { state, id, notes: () => state.active!.places[0]!.notes };
  }

  it('adds notes hidden unless told otherwise', () => {
    const { notes } = withNotes();
    expect(notes().map((n) => n.visibleToParty)).toEqual([true, false]);
  });

  it('edits, toggles, reorders and removes', () => {
    const start = withNotes();
    const { id } = start;
    let state = start.state;
    const secret = state.active!.places[0]!.notes[1]!.id;
    state = run(state, { kind: 'editNote', placeId: id, noteId: secret, text: 'Less secret' }).state;
    expect(state.active!.places[0]?.notes[1]?.text).toBe('Less secret');
    state = run(state, { kind: 'moveNote', placeId: id, noteId: secret, delta: -1 }).state;
    expect(state.active!.places[0]?.notes[0]?.text).toBe('Less secret');
    state = run(state, { kind: 'setNoteVisible', placeId: id, noteId: secret, visibleToParty: true }).state;
    expect(state.active!.places[0]?.notes[0]?.visibleToParty).toBe(true);
    state = run(state, { kind: 'removeNote', placeId: id, noteId: secret }).state;
    expect(state.active!.places[0]?.notes).toHaveLength(1);
  });

  it('rejects an unknown note id', () => {
    const { state, id } = withNotes();
    expect(run(state, { kind: 'removeNote', placeId: id, noteId: 'ghost' }).rejected).toMatch(/no such note/);
  });
});

describe('the table display and places (D-121)', () => {
  it('receives none of them while Revealed does not exist', () => {
    const { state } = withPlace();
    const view = viewFor('table', state);
    expect(view.campaign?.places).toEqual([]);
  });

  it('never carries a GM note in its payload, by any route', () => {
    const start = withPlace();
    const { id } = start;
    let state = start.state;
    state = run(state, { kind: 'addNote', placeId: id, text: 'The elder is a spy' }).state;
    state = run(state, { kind: 'addNote', placeId: id, text: 'Also public', visibleToParty: true }).state;
    const payload = JSON.stringify(viewFor('table', state));
    expect(payload).not.toContain('The elder is a spy');
    expect(payload).not.toContain('Also public');
    expect(payload).not.toContain('Ash Village');
    // and the GM does get them
    expect(JSON.stringify(viewFor('gm', state))).toContain('The elder is a spy');
  });

  it('refuses every place intent from the table display', () => {
    const { state, id } = withPlace();
    for (const intent of [
      { kind: 'addPlace', cell: at(1, 1) },
      { kind: 'renamePlace', id, name: 'x' },
      { kind: 'removePlace', id },
      { kind: 'addNote', placeId: id, text: 'x' },
    ] as Intent[]) {
      expect(run(state, intent, 'table').rejected, intent.kind).toBeTruthy();
    }
  });
});

describe('places survive a round trip', () => {
  it('keeps name, cell, marker and notes through encode and decode', async () => {
    const { state, id } = withPlace('Ashfall');
    const withNote = run(state, { kind: 'addNote', placeId: id, text: 'Note', visibleToParty: true }).state;
    const { decodeCampaign } = await import('@tt/protocol');
    const back = decodeCampaign(encodeCampaign(withNote.active!));
    expect(back.places).toHaveLength(1);
    expect(back.places[0]?.name).toBe('Ashfall');
    expect(back.places[0]?.cell).toMatchObject({ x: 5, z: 6 });
    expect(back.places[0]?.markerId).toBe('marker:village');
    expect(back.places[0]?.notes[0]).toMatchObject({ text: 'Note', visibleToParty: true });
  });
});
