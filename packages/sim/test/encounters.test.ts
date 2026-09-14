// Encounters on a place (D-175): an ordered list, each entry visible or not.
//
// Same shape as notes and therefore the same trust boundary, which is the part
// that matters: an encounter the GM has not revealed is a spoiler, so it must
// never leave the host — not merely go unrendered.

import { describe, it, expect } from 'vitest';
import { apply, emptyHistory, openedWith } from '@tt/sim';
import { viewFor } from '@tt/protocol';
import type { HostState, Intent, TableView } from '@tt/protocol';
import { createCampaign, createLiveSave, upgradedCampaign, SCHEMA_VERSION, ORIGIN } from '@tt/domain';

const NOW = '2026-01-01T00:00:00.000Z';
const run = (s: HostState, i: Intent, role: 'gm' | 'table' = 'gm') => apply(s, role, i, NOW);
const at = (x: number, z: number) => ({ cx: ORIGIN.cx, cz: ORIGIN.cz, x, z });

/** A revealed place in a Known chunk, with one public and one secret encounter. */
function seeded() {
  const campaign = createCampaign('Ashfall');
  let state: HostState = {
    campaigns: [{ id: campaign.id, name: campaign.name }],
    active: campaign,
    activeSave: createLiveSave(campaign, NOW),
    history: emptyHistory(),
  };
  state = run(state, { kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: true }).state;
  state = run(state, { kind: 'addPoi', cell: at(5, 6), name: 'Ashfall Keep' }).state;
  const poiId = state.active!.pois[0]!.id;
  state = run(state, { kind: 'setPoiRevealed', poiId, revealed: true }).state;
  state = run(state, { kind: 'addEncounter', poiId, name: 'Gate skirmish', visibleToParty: true }).state;
  state = run(state, { kind: 'addEncounter', poiId, name: 'The baron’s study' }).state;
  return { state, poiId };
}

const encountersOf = (state: HostState) => state.active!.pois[0]!.encounters;
const onTable = (state: HostState) => {
  const view = viewFor('table', state) as TableView;
  return view.campaign?.pois[0]?.encounters ?? [];
};

describe('the list', () => {
  it('keeps the GM\'s order, newest last', () => {
    const { state } = seeded();
    expect(encountersOf(state).map((e) => e.name)).toEqual(['Gate skirmish', 'The baron’s study']);
  });

  it('hides a new encounter by default, like a note (D-125)', () => {
    const { state, poiId } = seeded();
    const added = run(state, { kind: 'addEncounter', poiId, name: 'Unspecified' }).state;
    expect(encountersOf(added).at(-1)?.visibleToParty).toBe(false);
  });

  it('refuses a blank name rather than creating an unnamed row', () => {
    const { state, poiId } = seeded();
    const before = encountersOf(state).length;
    // Zod rejects an empty string at the edge, so this is the whitespace case.
    expect(encountersOf(run(state, { kind: 'addEncounter', poiId, name: '   ' }).state))
      .toHaveLength(before);
  });

  it('renames, reveals, reorders and removes', () => {
    const { state, poiId } = seeded();
    const first = encountersOf(state)[0]!.id;

    let next = run(state, { kind: 'renameEncounter', poiId, encounterId: first, name: 'Gate ambush' }).state;
    expect(encountersOf(next)[0]!.name).toBe('Gate ambush');

    next = run(next, { kind: 'moveEncounter', poiId, encounterId: first, delta: 1 }).state;
    expect(encountersOf(next).map((e) => e.name)).toEqual(['The baron’s study', 'Gate ambush']);

    next = run(next, { kind: 'setEncounterVisible', poiId, encounterId: first, visibleToParty: false }).state;
    expect(encountersOf(next).find((e) => e.id === first)?.visibleToParty).toBe(false);

    next = run(next, { kind: 'removeEncounter', poiId, encounterId: first }).state;
    expect(encountersOf(next).map((e) => e.name)).toEqual(['The baron’s study']);
  });

  it('clamps a reorder at the ends instead of wrapping', () => {
    const { state, poiId } = seeded();
    const first = encountersOf(state)[0]!.id;
    const stay = run(state, { kind: 'moveEncounter', poiId, encounterId: first, delta: -5 }).state;
    expect(encountersOf(stay)[0]!.id).toBe(first);
  });

  it('rejects an encounter that is not on that place', () => {
    const { state, poiId } = seeded();
    expect(run(state, { kind: 'removeEncounter', poiId, encounterId: 'encounter_ghost' }).rejected)
      .toBe('no such encounter');
  });
});

describe('the trust boundary', () => {
  it('sends the party only what the GM revealed', () => {
    const { state } = seeded();
    expect(onTable(state).map((e) => e.name)).toEqual(['Gate skirmish']);
  });

  it('never puts a hidden encounter on the wire at all', () => {
    // Not "unrendered": absent. The name of an unrevealed encounter is a
    // spoiler, and a client cannot leak what it was never sent (R-85).
    const { state } = seeded();
    expect(JSON.stringify(viewFor('table', state))).not.toContain('baron');
  });

  it('withdraws one the GM hides again', () => {
    const { state, poiId } = seeded();
    const first = encountersOf(state)[0]!.id;
    const hidden = run(state, { kind: 'setEncounterVisible', poiId, encounterId: first, visibleToParty: false }).state;
    expect(onTable(hidden)).toEqual([]);
    expect(JSON.stringify(viewFor('table', hidden))).not.toContain('Gate skirmish');
  });

  it('sends none of them while the place itself is hidden', () => {
    const { state, poiId } = seeded();
    const unrevealed = run(state, { kind: 'setPoiRevealed', poiId, revealed: false }).state;
    const view = viewFor('table', unrevealed) as TableView;
    expect(view.campaign?.pois).toEqual([]);
    expect(JSON.stringify(view)).not.toContain('Gate skirmish');
  });

  it('is authored content, so the table seat cannot touch it (R-136)', () => {
    const { state, poiId } = seeded();
    const first = encountersOf(state)[0]!.id;
    for (const intent of [
      { kind: 'addEncounter', poiId, name: 'Mine now' },
      { kind: 'renameEncounter', poiId, encounterId: first, name: 'Mine now' },
      { kind: 'setEncounterVisible', poiId, encounterId: first, visibleToParty: true },
      { kind: 'removeEncounter', poiId, encounterId: first },
      { kind: 'moveEncounter', poiId, encounterId: first, delta: 1 },
    ] as Intent[]) {
      expect(run(state, intent, 'table').rejected, intent.kind).toBe('only the GM can do that');
    }
  });
});

describe('undo covers them, being authored content (R-140)', () => {
  it('takes back an added encounter', () => {
    const { state, poiId } = seeded();
    const added = run(state, { kind: 'addEncounter', poiId, name: 'Rooftop chase' }).state;
    expect(encountersOf(added)).toHaveLength(3);
    expect(encountersOf(run(added, { kind: 'undo' }).state)).toHaveLength(2);
  });
});

describe('an older campaign (R-137)', () => {
  it('is stamped with the current schema when opened, not written back stale', () => {
    // v2 stored encounters as bare ids; they normalise to records on the way in.
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

  it('leaves a current campaign untouched, identity included (R-12)', () => {
    const campaign = createCampaign('Ashfall');
    expect(upgradedCampaign(campaign)).toBe(campaign);
  });
});
