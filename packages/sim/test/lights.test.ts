// Lights on the host (D-335): placed as props and lit or put out as doors are
// opened — building and play — carried by members and silver tokens as play,
// all of it the GM's; and the table told only of the lights it can draw.

import { describe, it, expect } from 'vitest';
import { apply, emptyHistory } from '@tt/sim';
import { viewFor } from '@tt/protocol';
import type { HostState, Intent, TableView } from '@tt/protocol';
import {
  createCampaign, createLiveSave, DEFAULT_MATERIALS, swatchOf, ORIGIN, EMPTY_LIBRARY, openedIn, silverIn, TORCH,
  pruneMembers,
} from '@tt/domain';
import type { BlockCoord, MemberId } from '@tt/domain';

const NOW = '2026-01-01T00:00:00.000Z';
const run = (s: HostState, i: Intent, role: 'gm' | 'table' = 'gm') => apply(s, role, i, NOW);
const cell = (x: number, z: number) => ({ cx: ORIGIN.cx, cz: ORIGIN.cz, x, z });
const cube = (x: number, y: number, z: number): BlockCoord => ({ x, y, z });
const STONE = swatchOf(DEFAULT_MATERIALS.find((m) => m.name === 'Mineral')!.id) as string;

/**
 * A tavern the party is in, Aldra at (2,1,2), a two-high wall across x = 8
 * she cannot see past, and a goblin in the library.
 */
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
const mapOf = (state: HostState) => state.active!.places[0]!.pois[0]!.map!;
const table = (state: HostState) => viewFor('table', state) as TableView;
const place = (t: Tavern, type: string, at: BlockCoord, facing = 0): Intent => ({
  kind: 'placeProp', placeId: t.placeId, poiId: t.poiId, type, at, facing,
});

describe('placed lights (D-335)', () => {
  it('hang on a wall, or say there is none to hang on', () => {
    const t = tavern();
    expect(run(t.state, place(t, 'torch', cube(4, 1, 4))).rejected).toBe('there is no wall behind it to hang on');
    // Against the wall at x = 8, its back toward +x: facing 1.
    const state = run(t.state, place(t, 'torch', cube(7, 2, 4), 1)).state;
    expect(mapOf(state).props[0]).toMatchObject({ type: 'torch', facing: 1, paint: 'material:mineral/iron', flame: 'fire' });
  });

  it('reach as far as the GM sets, as building — one undo step', () => {
    const t = tavern();
    let state = run(t.state, place(t, 'brazier', cube(4, 1, 4))).state;
    const id = mapOf(state).props[0]!.id as string;
    state = run(state, { kind: 'editProp', placeId: t.placeId, poiId: t.poiId, id, reach: 12 }).state;
    expect(mapOf(state).props[0]!.reach).toBe(12);
    expect(mapOf(run(state, { kind: 'undo' }).state).props[0]!.reach).toBeUndefined();
  });

  it('are put out and lit as a door is opened — play, the GM\'s, and over anybody standing there', () => {
    const t = tavern();
    let state = run(t.state, place(t, 'candles', cube(3, 1, 3))).state;
    const id = mapOf(state).props[0]!.id as string;
    const out: Intent = { kind: 'setPropOpen', placeId: t.placeId, poiId: t.poiId, id, open: true };
    expect(run(state, out, 'table').rejected).toBe('only the GM can do that');
    const history = state.history;
    state = run(state, out).state;
    expect(openedIn(state.activeSave!, t.poiId).has(id)).toBe(true);
    expect(state.history).toBe(history);
    // Aldra steps into the candles' cube (they stop nothing), and they are lit over her.
    state = run(state, { kind: 'moveToken', placeId: t.placeId, poiId: t.poiId, memberId: t.aldra, at: cube(3, 1, 3) }).state;
    const lit = run(state, { ...out, open: false } as Intent);
    expect(lit.rejected).toBeUndefined();
    expect(openedIn(lit.state.activeSave!, t.poiId).has(id)).toBe(false);
  });
});

describe('carried lights (D-335)', () => {
  it('a member carries one in every map, as play, the GM\'s; and leaves it behind with the roster', () => {
    const t = tavern();
    const carry: Intent = { kind: 'carryLight', id: t.aldra, light: { flame: 'cold', reach: 8 } };
    expect(run(t.state, carry, 'table').rejected).toBe('only the GM can do that');
    expect(run(t.state, { ...carry, id: 'member_nobody' } as Intent).rejected).toBe('no such party member');
    const history = t.state.history;
    let state = run(t.state, carry).state;
    expect(state.activeSave!.carried.get(t.aldra)).toEqual({ flame: 'cold', reach: 8 });
    expect(state.history).toBe(history);
    expect(pruneMembers(state.activeSave!, new Set<MemberId>()).carried.size).toBe(0);
    state = run(state, { kind: 'carryLight', id: t.aldra, light: null }).state;
    expect(state.activeSave!.carried.size).toBe(0);
  });

  it('a silver token carries one too', () => {
    const t = tavern();
    let state = run(t.state, { kind: 'spawnSilver', placeId: t.placeId, poiId: t.poiId, templateId: t.goblin, at: cube(5, 1, 5) }).state;
    const id = silverIn(state.activeSave!, t.poiId)[0]!.id as string;
    const light: Intent = { kind: 'lightSilver', placeId: t.placeId, poiId: t.poiId, id, light: TORCH };
    expect(run(state, light, 'table').rejected).toBe('only the GM can do that');
    state = run(state, light).state;
    expect(silverIn(state.activeSave!, t.poiId)[0]!.light).toEqual(TORCH);
    state = run(state, { ...light, light: null } as Intent).state;
    expect(silverIn(state.activeSave!, t.poiId)[0]!.light).toBeUndefined();
  });

  it('the table is told the lights of the members and tokens it holds, and of nobody else', () => {
    const t = tavern();
    let state = run(t.state, { kind: 'carryLight', id: t.aldra, light: TORCH }).state;
    expect(table(state).carried).toEqual({ [t.aldra]: { flame: 'fire', reach: 6 } });
    // A goblin she sees, with a torch: sent, torch and all.
    state = run(state, { kind: 'spawnSilver', placeId: t.placeId, poiId: t.poiId, templateId: t.goblin, at: cube(5, 1, 5) }).state;
    // And one behind the wall, with a torch: neither it nor its torch.
    state = run(state, { kind: 'spawnSilver', placeId: t.placeId, poiId: t.poiId, templateId: t.goblin, at: cube(12, 1, 5) }).state;
    const [seen, hidden] = silverIn(state.activeSave!, t.poiId);
    for (const token of [seen!, hidden!]) {
      state = run(state, { kind: 'lightSilver', placeId: t.placeId, poiId: t.poiId, id: token.id as string, light: TORCH }).state;
    }
    const silver = table(state).silver!;
    expect(silver.map((token) => token.id)).toEqual([seen!.id]);
    expect(silver[0]!.light).toEqual({ flame: 'fire', reach: 6 });
    expect(JSON.stringify(table(state))).not.toContain(hidden!.id);
    // Out on the world, nothing.
    state = run(state, { kind: 'leaveMap' }).state;
    expect(table(state).carried).toBeNull();
  });
});
