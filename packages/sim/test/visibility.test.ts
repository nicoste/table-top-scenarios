// The trust boundary for discovery. A bug here spoils a campaign, so these tests
// assert on the actual wire payload rather than on intermediate objects.

import { describe, it, expect } from 'vitest';
import { apply, emptyHistory } from '@tt/sim';
import { viewFor } from '@tt/protocol';
import type { HostState, Intent } from '@tt/protocol';
import { createCampaign, createLiveSave, ORIGIN } from '@tt/domain';

const NOW = '2026-01-01T00:00:00.000Z';
const run = (s: HostState, i: Intent, role: 'gm' | 'table' = 'gm') => apply(s, role, i, NOW);
const at = (x: number, z: number) => ({ cx: ORIGIN.cx, cz: ORIGIN.cz, x, z });

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

/** A campaign with a place carrying one public and one private note. */
function seeded() {
  let state = open();
  state = run(state, { kind: 'addPlace', cell: at(5, 6), name: 'Ashfall Keep' }).state;
  const placeId = state.active!.places[0]!.id;
  state = run(state, { kind: 'addNote', placeId, text: 'Gate unbarred at dusk', visibleToParty: true }).state;
  state = run(state, { kind: 'addNote', placeId, text: 'The baron is already dead' }).state;
  return { state, placeId };
}

const tableJson = (state: HostState) => JSON.stringify(viewFor('table', state));
const tableWorld = (state: HostState) => {
  const view = viewFor('table', state);
  return view.campaign?.world ?? null;
};

describe('nothing reaches the table until the GM says so', () => {
  it('shows no chunk terrain at all before anything is revealed', () => {
    const { state } = seeded();
    const world = tableWorld(state);
    expect(world?.chunks).toEqual([]);
    expect(world?.unknownChunks).toHaveLength(1);
    expect(world?.unknownChunks[0]).toEqual({ cx: ORIGIN.cx, cz: ORIGIN.cz });
  });

  it('sends an unknown chunk as coordinates only, with no terrain field to carry data', () => {
    const { state } = seeded();
    const world = tableWorld(state);
    const placeholder = world!.unknownChunks[0] as Record<string, unknown>;
    expect(Object.keys(placeholder).sort()).toEqual(['cx', 'cz']);
    expect(placeholder).not.toHaveProperty('heights');
    expect(placeholder).not.toHaveProperty('terrain');
  });

  it('sends the chunk in full once it is Known', () => {
    let state = seeded().state;
    state = run(state, { kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: true }).state;
    const world = tableWorld(state);
    expect(world?.chunks).toHaveLength(1);
    expect(world?.unknownChunks).toEqual([]);
    expect(world?.chunks[0]?.heights.length).toBeGreaterThan(0);
  });

  it('takes a chunk away again when the GM un-reveals it', () => {
    let state = seeded().state;
    state = run(state, { kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: true }).state;
    state = run(state, { kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: false }).state;
    expect(tableWorld(state)?.chunks).toEqual([]);
  });
});

describe('a place needs BOTH flags (D-132)', () => {
  it('withholds a Revealed place while its chunk is still Unknown', () => {
    const start = seeded();
    const { placeId } = start;
    let state = start.state;
    state = run(state, { kind: 'setPlaceRevealed', placeId, revealed: true }).state;
    // Revealed, but the chunk is not Known — this is the leak all three design
    // critics found independently.
    expect(viewFor('table', state).campaign?.places).toEqual([]);
    expect(tableJson(state)).not.toContain('Ashfall Keep');
  });

  it('withholds an unrevealed place in a Known chunk', () => {
    let state = seeded().state;
    state = run(state, { kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: true }).state;
    expect(viewFor('table', state).campaign?.places).toEqual([]);
    expect(tableJson(state)).not.toContain('Ashfall Keep');
  });

  it('shows it only when both are set', () => {
    const start = seeded();
    const { placeId } = start;
    let state = start.state;
    state = run(state, { kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: true }).state;
    state = run(state, { kind: 'setPlaceRevealed', placeId, revealed: true }).state;
    expect(viewFor('table', state).campaign?.places).toHaveLength(1);
    expect(tableJson(state)).toContain('Ashfall Keep');
  });

  it('hides it again the moment the chunk is hidden, even though the place stays Revealed', () => {
    let state = seeded().state;
    state = run(state, { kind: 'revealChunk', cx: ORIGIN.cx, cz: ORIGIN.cz, withPlaces: true }).state;
    expect(viewFor('table', state).campaign?.places).toHaveLength(1);
    state = run(state, { kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: false }).state;
    expect(viewFor('table', state).campaign?.places).toEqual([]);
  });
});

describe('notes are filtered even on a fully revealed place (R-85)', () => {
  it('sends the public note and not the private one', () => {
    const start = seeded();
    const { placeId } = start;
    let state = start.state;
    state = run(state, { kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: true }).state;
    state = run(state, { kind: 'setPlaceRevealed', placeId, revealed: true }).state;

    const payload = tableJson(state);
    expect(payload).toContain('Gate unbarred at dusk');
    expect(payload).not.toContain('The baron is already dead');
    expect(viewFor('table', state).campaign?.places[0]?.notes).toHaveLength(1);
  });

  it('drops the note the instant the GM hides it again', () => {
    const start = seeded();
    const { placeId } = start;
    let state = start.state;
    state = run(state, { kind: 'revealChunk', cx: ORIGIN.cx, cz: ORIGIN.cz, withPlaces: true }).state;
    const noteId = state.active!.places[0]!.notes[0]!.id;
    expect(tableJson(state)).toContain('Gate unbarred at dusk');
    state = run(state, { kind: 'setNoteVisible', placeId, noteId, visibleToParty: false }).state;
    expect(tableJson(state)).not.toContain('Gate unbarred at dusk');
  });

  it('gives the GM every note regardless', () => {
    const { state } = seeded();
    const gm = JSON.stringify(viewFor('gm', state));
    expect(gm).toContain('Gate unbarred at dusk');
    expect(gm).toContain('The baron is already dead');
  });
});

describe('the table is never told what it cannot see', () => {
  it('receives no discovery data of its own', () => {
    let state = seeded().state;
    state = run(state, { kind: 'revealChunk', cx: ORIGIN.cx, cz: ORIGIN.cz, withPlaces: true }).state;
    const view = viewFor('table', state);
    // Knowing WHICH chunks are Known is itself the answer to what is hidden.
    expect(view).not.toHaveProperty('save');
    expect(view).not.toHaveProperty('saves');
    expect(view).not.toHaveProperty('campaigns');
    expect(JSON.stringify(view)).not.toContain('discovery');
  });

  it('gets nothing at all when no save is open', () => {
    const { state } = seeded();
    expect(viewFor('table', { ...state, activeSave: null }).campaign).toBeNull();
  });

  it('gets nothing when the save belongs to another campaign', () => {
    const { state } = seeded();
    const other = createCampaign('Elsewhere');
    const foreign = createLiveSave(other, NOW);
    // viewFor checks the pairing itself rather than trusting the host to hold it.
    expect(viewFor('table', { ...state, activeSave: foreign }).campaign).toBeNull();
  });
});

describe('discovery is guarded like everything else', () => {
  it('refuses every discovery intent from the table display', () => {
    const { state, placeId } = seeded();
    const intents: Intent[] = [
      { kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: true },
      { kind: 'setPlaceRevealed', placeId, revealed: true },
      { kind: 'revealChunk', cx: ORIGIN.cx, cz: ORIGIN.cz },
    ];
    for (const intent of intents) {
      expect(run(state, intent, 'table').rejected, intent.kind).toBeTruthy();
    }
  });

  it('refuses to reveal a chunk that does not exist', () => {
    const { state } = seeded();
    expect(run(state, { kind: 'setChunkKnown', cx: 0, cz: 0, known: true }).rejected)
      .toMatch(/does not exist/);
  });

  it('refuses to reveal a place that does not exist', () => {
    const { state } = seeded();
    expect(run(state, { kind: 'setPlaceRevealed', placeId: 'ghost', revealed: true }).rejected)
      .toMatch(/no such place/);
  });

  it('refuses discovery edits with no save open', () => {
    const { state } = seeded();
    expect(run({ ...state, activeSave: null }, { kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: true }).rejected)
      .toMatch(/no save/);
  });

  it('asks the host to persist the save on every change', () => {
    const { state } = seeded();
    const result = run(state, { kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: true });
    expect(result.effects.map((e) => e.kind)).toEqual(['saveSave']);
  });

  it('asks for nothing when the change is a no-op', () => {
    const { state } = seeded();
    const result = run(state, { kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: false });
    expect(result.effects).toEqual([]);
    expect(result.state).toBe(state);
  });
});

