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
  it('are drawn, changed and taken away as play — the GM\'s in this round, and never undone', () => {
    const t = tavern();
    expect(run(t.state, fireball(t), 'table').rejected).toBe('only the GM can do that');
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
});
