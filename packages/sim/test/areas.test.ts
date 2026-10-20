// Areas on the host (D-341): play, the GM's in this round, and the table sent
// the ones not hidden — and none that follows somebody it cannot see.

import { describe, it, expect } from 'vitest';
import { apply, emptyHistory } from '@tt/sim';
import { viewFor } from '@tt/protocol';
import type { HostState, Intent, TableView } from '@tt/protocol';
import { createCampaign, createLiveSave, DEFAULT_MATERIALS, swatchOf, ORIGIN, EMPTY_LIBRARY, areasIn, silverIn } from '@tt/domain';
import type { BlockCoord } from '@tt/domain';

const NOW = '2026-01-01T00:00:00.000Z';
const run = (s: HostState, i: Intent, role: 'gm' | 'table' = 'gm') => apply(s, role, i, NOW);
const cell = (x: number, z: number) => ({ cx: ORIGIN.cx, cz: ORIGIN.cz, x, z });
const cube = (x: number, y: number, z: number): BlockCoord => ({ x, y, z });
const STONE = swatchOf(DEFAULT_MATERIALS.find((m) => m.name === 'Mineral')!.id) as string;

/** A tavern the party is in, Aldra at (2,1,2), a two-high wall at x = 8 she cannot see past, and a goblin in the library. */
function tavern() {
  const campaign = createCampaign('Ashfall');
  let state: HostState = {
    campaigns: [{ id: campaign.id, name: campaign.name }],
    active: campaign,
    activeSave: createLiveSave(campaign, NOW),
    history: emptyHistory(), library: EMPTY_LIBRARY, prefabs: [],
  };
  state = run(state, { kind: 'addTemplate', name: 'Goblin', tags: [] }).state;
  state = run(state, { kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: true }).state;
  state = run(state, { kind: 'addPlace', cell: cell(5, 6), name: 'Casilda' }).state;
  const placeId = state.active!.places[0]!.id as string;
  state = run(state, { kind: 'setPlaceRevealed', placeId, revealed: true }).state;
  state = run(state, { kind: 'addPoi', placeId, name: 'The tavern', visibleToParty: true }).state;
  const poiId = state.active!.places[0]!.pois[0]!.id as string;
  const wall = Array.from({ length: 16 }, (_, z) => [cube(8, 1, z), cube(8, 2, z)]).flat();
  for (let i = 0; i < wall.length; i += 25) {
    state = run(state, { kind: 'setBlock', placeId, poiId, cells: wall.slice(i, i + 25), swatch: STONE }).state;
  }
  state = run(state, { kind: 'enterMap', placeId, poiId }).state;
  const aldra = state.active!.party[0]!.id as string;
  state = run(state, { kind: 'moveToken', placeId, poiId, memberId: aldra, at: cube(2, 1, 2) }).state;
  return { state, placeId, poiId, aldra, goblin: state.library[0]!.id as string };
}
type Tavern = ReturnType<typeof tavern>;
const areasOf = (t: Tavern, state: HostState) => areasIn(state.activeSave!, t.poiId);
const table = (state: HostState) => viewFor('table', state) as TableView;
const fireball = (t: Tavern, at = cube(4, 1, 4)): Intent => ({
  kind: 'placeArea', placeId: t.placeId, poiId: t.poiId, shape: 'sphere', at, aim: { x: 0, y: 0, z: 0 }, size: 3, colour: 'orange',
});

describe('areas on the host (D-341)', () => {
  it('are drawn, changed and taken away as play, and never undone', () => {
    const t = tavern();
    const history = t.state.history;
    let state = run(t.state, fireball(t)).state;
    expect(state.history).toBe(history);
    const [area] = areasOf(t, state);
    expect(area).toMatchObject({ shape: 'sphere', at: cube(4, 1, 4), size: 3, colour: 'orange', name: 'Sphere 1', hidden: false });
    state = run(state, { kind: 'editArea', placeId: t.placeId, poiId: t.poiId, id: area!.id, size: 5, name: 'Fireball' }).state;
    expect(areasOf(t, state)[0]).toMatchObject({ size: 5, name: 'Fireball' });
    expect(run(state, { ...fireball(t), at: cube(40, 1, 4) } as Intent).rejected).toBe('that is outside the map');
    state = run(state, { kind: 'removeArea', placeId: t.placeId, poiId: t.poiId, id: area!.id }).state;
    expect(areasOf(t, state)).toEqual([]);
    expect(run(state, { kind: 'removeArea', placeId: t.placeId, poiId: t.poiId, id: area!.id }).rejected).toBe('no such area in this map');
  });

  it('follows somebody standing there, and let go of, stays where they stood', () => {
    const t = tavern();
    let state = run(t.state, fireball(t)).state;
    const id = areasOf(t, state)[0]!.id as string;
    const follow = (who: string | null): Intent => ({ kind: 'editArea', placeId: t.placeId, poiId: t.poiId, id, follows: who });
    expect(run(state, follow('member_nobody')).rejected).toBe('nobody by that id stands in this map');
    state = run(state, follow(t.aldra)).state;
    expect(table(state).areas![0]!.at).toEqual(cube(2, 1, 2));
    state = run(state, { kind: 'moveToken', placeId: t.placeId, poiId: t.poiId, memberId: t.aldra, at: cube(3, 1, 3) }).state;
    expect(table(state).areas![0]!.at).toEqual(cube(3, 1, 3));
    state = run(state, follow(null)).state;
    expect(areasOf(t, state)[0]).toMatchObject({ at: cube(3, 1, 3) });
    expect(areasOf(t, state)[0]!.follows).toBeUndefined();
  });

  it('the table is sent the areas not hidden, and none that follows somebody it cannot see', () => {
    const t = tavern();
    let state = run(t.state, fireball(t)).state;
    state = run(state, fireball(t, cube(5, 1, 5))).state;
    const [shown, hidden] = areasOf(t, state);
    state = run(state, { kind: 'editArea', placeId: t.placeId, poiId: t.poiId, id: hidden!.id, hidden: true }).state;
    expect(table(state).areas!.map((area) => area.id)).toEqual([shown!.id]);
    expect(JSON.stringify(table(state))).not.toContain(hidden!.id);
    // A goblin behind the wall, and an aura following it: neither reaches the table.
    state = run(state, { kind: 'spawnSilver', placeId: t.placeId, poiId: t.poiId, templateId: t.goblin, at: cube(12, 1, 5) }).state;
    const goblin = silverIn(state.activeSave!, t.poiId)[0]!;
    state = run(state, { kind: 'editArea', placeId: t.placeId, poiId: t.poiId, id: shown!.id, follows: goblin.id as string }).state;
    expect(table(state).areas).toEqual([]);
    expect(JSON.stringify(table(state))).not.toContain(goblin.id);
    // Out on the world, nothing.
    state = run(state, { kind: 'leaveMap' }).state;
    expect(table(state).areas).toBeNull();
  });

  it('the table is sent none on a level the band cuts away (D-348)', () => {
    const t = tavern();
    let state = run(t.state, fireball(t)).state;
    // Down in the rock under the floor: a cellar's level.
    state = run(state, fireball(t, cube(4, -3, 4))).state;
    const [above, below] = areasOf(t, state);
    expect(table(state).areas!.map((area) => area.id).sort()).toEqual([above!.id, below!.id].sort());
    state = run(state, { kind: 'setRange', placeId: t.placeId, poiId: t.poiId, lower: 0, upper: 32 }).state;
    expect(table(state).areas!.map((area) => area.id)).toEqual([above!.id]);
    expect(JSON.stringify(table(state))).not.toContain(below!.id);
  });
});

describe('the players\' own areas (D-344)', () => {
  it('are drawn from the table on what the party has seen, and marked as theirs', () => {
    const t = tavern();
    // Behind the wall at x = 8: never seen.
    expect(run(t.state, fireball(t, cube(12, 1, 4)), 'table').rejected).toBe('the party has not seen that');
    const state = run(t.state, fireball(t), 'table').state;
    expect(areasOf(t, state)[0]).toMatchObject({ byTable: true, name: 'Sphere 1' });
    expect(table(state).areas![0]).toMatchObject({ byTable: true });
  });

  it('may be changed from the table as the GM changes any — all but hidden — and taken away (D-347)', () => {
    const t = tavern();
    let state = run(t.state, fireball(t), 'table').state;
    const id = areasOf(t, state)[0]!.id as string;
    const edit = (patch: object): Intent => ({ kind: 'editArea', placeId: t.placeId, poiId: t.poiId, id, ...patch } as Intent);
    state = run(state, edit({ at: cube(3, 1, 5) }), 'table').state;
    expect(areasOf(t, state)[0]!.at).toEqual(cube(3, 1, 5));
    expect(run(state, edit({ at: cube(12, 1, 5) }), 'table').rejected).toBe('the party has not seen that');
    state = run(state, edit({ size: 6, name: 'Our fireball', colour: 'blue' }), 'table').state;
    expect(areasOf(t, state)[0]).toMatchObject({ size: 6, name: 'Our fireball', colour: 'blue', byTable: true });
    expect(run(state, edit({ hidden: true }), 'table').rejected).toBe('only the GM can do that');
    // It follows one of the party, and nobody else on stage.
    state = run(state, edit({ follows: t.aldra }), 'table').state;
    expect(table(state).areas![0]).toMatchObject({ follows: t.aldra, at: cube(2, 1, 2) });
    state = run(state, { kind: 'spawnSilver', placeId: t.placeId, poiId: t.poiId, templateId: t.goblin, at: cube(5, 1, 5) }).state;
    const goblin = silverIn(state.activeSave!, t.poiId)[0]!.id as string;
    expect(run(state, edit({ follows: goblin }), 'table').rejected).toBe('an area can only follow one of the party');
    // The GM may do anything to it, hiding included.
    state = run(state, edit({ size: 9 })).state;
    expect(areasOf(t, state)[0]).toMatchObject({ size: 9, byTable: true });
    state = run(state, { kind: 'removeArea', placeId: t.placeId, poiId: t.poiId, id }, 'table').state;
    expect(areasOf(t, state)).toEqual([]);
  });

  it('leave the GM\'s areas alone, and know nothing of a hidden one', () => {
    const t = tavern();
    let state = run(t.state, fireball(t)).state;
    const gms = areasOf(t, state)[0]!.id as string;
    const move: Intent = { kind: 'editArea', placeId: t.placeId, poiId: t.poiId, id: gms, at: cube(3, 1, 3) };
    expect(run(state, move, 'table').rejected).toBe('no such area in this map');
    expect(run(state, { kind: 'removeArea', placeId: t.placeId, poiId: t.poiId, id: gms }, 'table').rejected)
      .toBe('no such area in this map');
    // Their own, hidden by the GM: gone from their reach as well as their screen.
    state = run(state, fireball(t, cube(5, 1, 5)), 'table').state;
    const theirs = areasOf(t, state)[1]!.id as string;
    state = run(state, { kind: 'editArea', placeId: t.placeId, poiId: t.poiId, id: theirs, hidden: true }).state;
    expect(run(state, { kind: 'removeArea', placeId: t.placeId, poiId: t.poiId, id: theirs }, 'table').rejected)
      .toBe('no such area in this map');
  });

  it('are drawn only in the map the party is in', () => {
    const t = tavern();
    const state = run(t.state, { kind: 'leaveMap' }).state;
    expect(run(state, fireball(t), 'table').rejected).toBe('the party is not in that map');
  });
});
