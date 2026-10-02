// Pois on a place (D-175): an ordered list, each entry visible or not.
//
// Same shape as notes and therefore the same trust boundary, which is the part
// that matters: an poi the GM has not revealed is a spoiler, so it must
// never leave the host — not merely go unrendered.

import { describe, it, expect } from 'vitest';
import { apply, emptyHistory, openedWith } from '@tt/sim';
import { viewFor } from '@tt/protocol';
import type { HostState, Intent, TableView } from '@tt/protocol';
import { createCampaign, createLiveSave, upgradedCampaign, SCHEMA_VERSION, ORIGIN } from '@tt/domain';

const NOW = '2026-01-01T00:00:00.000Z';
const run = (s: HostState, i: Intent, role: 'gm' | 'table' = 'gm') => apply(s, role, i, NOW);
const at = (x: number, z: number) => ({ cx: ORIGIN.cx, cz: ORIGIN.cz, x, z });

/** A revealed place in a Known chunk, with one public and one secret poi. */
function seeded() {
  const campaign = createCampaign('Ashfall');
  let state: HostState = {
    campaigns: [{ id: campaign.id, name: campaign.name }],
    active: campaign,
    activeSave: createLiveSave(campaign, NOW),
    history: emptyHistory(),
  };
  state = run(state, { kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: true }).state;
  state = run(state, { kind: 'addPlace', cell: at(5, 6), name: 'Ashfall Keep' }).state;
  const placeId = state.active!.places[0]!.id;
  state = run(state, { kind: 'setPlaceRevealed', placeId, revealed: true }).state;
  state = run(state, { kind: 'addPoi', placeId, name: 'Gate skirmish', visibleToParty: true }).state;
  state = run(state, { kind: 'addPoi', placeId, name: 'The baron’s study' }).state;
  return { state, placeId };
}

const poisOf = (state: HostState) => state.active!.places[0]!.pois;
const onTable = (state: HostState) => {
  const view = viewFor('table', state) as TableView;
  return view.campaign?.places[0]?.pois ?? [];
};

describe('the list', () => {
  it('keeps the GM\'s order, newest last', () => {
    const { state } = seeded();
    expect(poisOf(state).map((e) => e.name)).toEqual(['Gate skirmish', 'The baron’s study']);
  });

  it('hides a new poi by default, like a note (D-125)', () => {
    const { state, placeId } = seeded();
    const added = run(state, { kind: 'addPoi', placeId, name: 'Unspecified' }).state;
    expect(poisOf(added).at(-1)?.visibleToParty).toBe(false);
  });

  it('refuses a blank name rather than creating an unnamed row', () => {
    const { state, placeId } = seeded();
    const before = poisOf(state).length;
    // Zod rejects an empty string at the edge, so this is the whitespace case.
    expect(poisOf(run(state, { kind: 'addPoi', placeId, name: '   ' }).state))
      .toHaveLength(before);
  });

  it('renames, reveals, reorders and removes', () => {
    const { state, placeId } = seeded();
    const first = poisOf(state)[0]!.id;

    let next = run(state, { kind: 'renamePoi', placeId, poiId: first, name: 'Gate ambush' }).state;
    expect(poisOf(next)[0]!.name).toBe('Gate ambush');

    next = run(next, { kind: 'movePoi', placeId, poiId: first, delta: 1 }).state;
    expect(poisOf(next).map((e) => e.name)).toEqual(['The baron’s study', 'Gate ambush']);

    next = run(next, { kind: 'setPoiVisible', placeId, poiId: first, visibleToParty: false }).state;
    expect(poisOf(next).find((e) => e.id === first)?.visibleToParty).toBe(false);

    next = run(next, { kind: 'removePoi', placeId, poiId: first }).state;
    expect(poisOf(next).map((e) => e.name)).toEqual(['The baron’s study']);
  });

  it('clamps a reorder at the ends instead of wrapping', () => {
    const { state, placeId } = seeded();
    const first = poisOf(state)[0]!.id;
    const stay = run(state, { kind: 'movePoi', placeId, poiId: first, delta: -5 }).state;
    expect(poisOf(stay)[0]!.id).toBe(first);
  });

  it('rejects an poi that is not on that place', () => {
    const { state, placeId } = seeded();
    expect(run(state, { kind: 'removePoi', placeId, poiId: 'poi_ghost' }).rejected)
      .toBe('no such poi');
  });
});

describe('the trust boundary', () => {
  it('sends the party only what the GM revealed', () => {
    const { state } = seeded();
    expect(onTable(state).map((e) => e.name)).toEqual(['Gate skirmish']);
  });

  it('never puts a hidden poi on the wire at all', () => {
    // Not "unrendered": absent. The name of an unrevealed poi is a
    // spoiler, and a client cannot leak what it was never sent (R-85).
    const { state } = seeded();
    expect(JSON.stringify(viewFor('table', state))).not.toContain('baron');
  });

  it('withdraws one the GM hides again', () => {
    const { state, placeId } = seeded();
    const first = poisOf(state)[0]!.id;
    const hidden = run(state, { kind: 'setPoiVisible', placeId, poiId: first, visibleToParty: false }).state;
    expect(onTable(hidden)).toEqual([]);
    expect(JSON.stringify(viewFor('table', hidden))).not.toContain('Gate skirmish');
  });

  it('sends none of them while the place itself is hidden', () => {
    const { state, placeId } = seeded();
    const unrevealed = run(state, { kind: 'setPlaceRevealed', placeId, revealed: false }).state;
    const view = viewFor('table', unrevealed) as TableView;
    expect(view.campaign?.places).toEqual([]);
    expect(JSON.stringify(view)).not.toContain('Gate skirmish');
  });

  it('is authored content, so the table seat cannot touch it (R-136)', () => {
    const { state, placeId } = seeded();
    const first = poisOf(state)[0]!.id;
    for (const intent of [
      { kind: 'addPoi', placeId, name: 'Mine now' },
      { kind: 'renamePoi', placeId, poiId: first, name: 'Mine now' },
      { kind: 'setPoiVisible', placeId, poiId: first, visibleToParty: true },
      { kind: 'removePoi', placeId, poiId: first },
      { kind: 'movePoi', placeId, poiId: first, delta: 1 },
    ] as Intent[]) {
      expect(run(state, intent, 'table').rejected, intent.kind).toBe('only the GM can do that');
    }
  });
});

describe('undo covers them, being authored content (R-140)', () => {
  it('takes back an added poi', () => {
    const { state, placeId } = seeded();
    const added = run(state, { kind: 'addPoi', placeId, name: 'Rooftop chase' }).state;
    expect(poisOf(added)).toHaveLength(3);
    expect(poisOf(run(added, { kind: 'undo' }).state)).toHaveLength(2);
  });
});

describe('an older campaign (R-137)', () => {
  it('is stamped with the current schema when opened, not written back stale', () => {
    // v2 stored pois as bare ids; they normalise to records on the way in.
    // Writing the file back still labelled v2 would leave a version field that
    // does not describe its contents, which is worse than none (D-159).
    const campaign = createCampaign('Ashfall');
    const stale = { ...campaign, schemaVersion: 2 };
    const opened = openedWith(
      { campaigns: [], active: null, activeSave: null, history: emptyHistory() },
      stale,
      null,
      NOW,
      new Set(),
    );
    expect(opened.state.active!.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('leaves a current campaign untouched, identity included (R-165)', () => {
    const campaign = createCampaign('Ashfall');
    expect(upgradedCampaign(campaign)).toBe(campaign);
  });
});
