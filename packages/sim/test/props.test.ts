// Props through `sim` (D-322, D-328): placing and the rest are building, under
// undo; opening is play, not under it; all of it the GM's; and the table is
// told which of the props it holds stand open, and nothing about the rest.

import { describe, it, expect } from 'vitest';
import { apply, emptyHistory } from '@tt/sim';
import { viewFor, cellsFromWire } from '@tt/protocol';
import type { GmView, HostState, Intent, TableView } from '@tt/protocol';
import {
  createCampaign, createLiveSave, DEFAULT_MATERIALS, swatchOf, ORIGIN, EMPTY_LIBRARY, openedIn, blockAt,
} from '@tt/domain';

const NOW = '2026-01-01T00:00:00.000Z';
const run = (s: HostState, i: Intent, role: 'gm' | 'table' = 'gm') => apply(s, role, i, NOW);
const cell = (x: number, z: number) => ({ cx: ORIGIN.cx, cz: ORIGIN.cz, x, z });
const STONE = swatchOf(DEFAULT_MATERIALS.find((m) => m.name === 'Mineral')!.id) as string;

/** A tavern the party is in, Aldra standing at (2,1,2), with a wall two high across x = 5 and a doorway at z = 7. */
function tavern() {
  const campaign = createCampaign('Ashfall');
  let state: HostState = {
    campaigns: [{ id: campaign.id, name: campaign.name }],
    active: campaign,
    activeSave: createLiveSave(campaign, NOW),
    history: emptyHistory(), library: EMPTY_LIBRARY, prefabs: [],
  };
  state = run(state, { kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: true }).state;
  state = run(state, { kind: 'addPlace', cell: cell(5, 6), name: 'Casilda' }).state;
  const placeId = state.active!.places[0]!.id as string;
  state = run(state, { kind: 'setPlaceRevealed', placeId, revealed: true }).state;
  state = run(state, { kind: 'addPoi', placeId, name: 'The tavern', visibleToParty: true }).state;
  const poiId = state.active!.places[0]!.pois[0]!.id as string;
  const wall = [];
  for (let z = 0; z < 16; z += 1) if (z !== 7) wall.push({ x: 5, y: 1, z }, { x: 5, y: 2, z });
  for (let i = 0; i < wall.length; i += 25) {
    state = run(state, { kind: 'setBlock', placeId, poiId, cells: wall.slice(i, i + 25), swatch: STONE }).state;
  }
  state = run(state, { kind: 'enterMap', placeId, poiId }).state;
  const aldra = state.active!.party[0]!.id as string;
  state = run(state, { kind: 'moveToken', placeId, poiId, memberId: aldra, at: { x: 2, y: 1, z: 7 } }).state;
  return { state, placeId, poiId, aldra };
}
type Tavern = ReturnType<typeof tavern>;
const mapOf = (state: HostState) => state.active!.places[0]!.pois[0]!.map!;
const putDoor = (t: Tavern): Intent => ({ kind: 'placeProp', placeId: t.placeId, poiId: t.poiId, type: 'door', at: { x: 5, y: 1, z: 7 }, facing: 1 });

describe('placing props (D-322)', () => {
  it('is building: the GM\'s, and one undo step', () => {
    const t = tavern();
    expect(run(t.state, putDoor(t), 'table').rejected).toBe('only the GM can do that');
    const state = run(t.state, putDoor(t)).state;
    expect(mapOf(state).props).toHaveLength(1);
    expect(mapOf(run(state, { kind: 'undo' }).state).props).toHaveLength(0);
  });

  it('says why not, and keeps out of anybody\'s cube', () => {
    const t = tavern();
    expect(run(t.state, { ...putDoor(t), type: 'throne' } as Intent).rejected).toBe('no such prop');
    expect(run(t.state, { ...putDoor(t), at: { x: 5, y: 1, z: 6 } } as Intent).rejected).toBe('there is a block there');
    expect(run(t.state, { ...putDoor(t), type: 'chair', at: { x: 2, y: 1, z: 7 } } as Intent).rejected).toBe('something is already there');
    expect(run(t.state, { ...putDoor(t), type: 'chair', at: { x: 2, y: 4, z: 2 } } as Intent).rejected).toBe('there is nothing under it to stand on');
  });

  it('turns, refinishes and comes away, each a step of its own', () => {
    const t = tavern();
    let state = run(t.state, { kind: 'placeProp', placeId: t.placeId, poiId: t.poiId, type: 'table', at: { x: 3, y: 1, z: 3 }, facing: 0 }).state;
    const id = mapOf(state).props[0]!.id as string;
    state = run(state, { kind: 'editProp', placeId: t.placeId, poiId: t.poiId, id, facing: 2, finish: 'pale-wood' }).state;
    expect(mapOf(state).props[0]).toMatchObject({ facing: 2, finish: 'pale-wood' });
    state = run(state, { kind: 'removeProp', placeId: t.placeId, poiId: t.poiId, id }).state;
    expect(mapOf(state).props).toEqual([]);
    expect(run(state, { kind: 'removeProp', placeId: t.placeId, poiId: t.poiId, id }).rejected).toBe('no such prop in this map');
  });

  it('keeps blocks out of a prop\'s cube', () => {
    const t = tavern();
    const state = run(t.state, putDoor(t)).state;
    const build: Intent = { kind: 'setBlock', placeId: t.placeId, poiId: t.poiId, cells: [{ x: 5, y: 2, z: 7 }], swatch: STONE };
    expect(run(state, build).rejected).toBe('a prop is there');
    expect(blockAt(mapOf(state), { x: 5, y: 2, z: 7 })).toBeNull();
  });
});

describe('opening and closing (D-328)', () => {
  const open = (t: Tavern, id: string, isOpen: boolean): Intent => ({
    kind: 'setPropOpen', placeId: t.placeId, poiId: t.poiId, id, open: isOpen,
  });

  it('is the GM\'s alone, play rather than building, and lets the party through and see past', () => {
    const t = tavern();
    let state = run(t.state, putDoor(t)).state;
    const id = mapOf(state).props[0]!.id as string;
    const through: Intent = { kind: 'moveToken', placeId: t.placeId, poiId: t.poiId, memberId: t.aldra, at: { x: 5, y: 1, z: 7 } };
    expect(run(state, through).rejected).toBe('something is in the way there');
    // What the party sees now — explored is cumulative, and Aldra looked
    // through the empty doorway before the door was hung.
    const seesNow = (s: HostState) => cellsFromWire((viewFor('gm', s) as GmView).sight!);
    expect(seesNow(state).has('7,1,7')).toBe(false);

    expect(run(state, open(t, id, true), 'table').rejected).toBe('only the GM can do that');
    const history = state.history;
    state = run(state, open(t, id, true)).state;
    expect(openedIn(state.activeSave!, t.poiId).has(id)).toBe(true);
    expect(state.history).toBe(history);
    // The party looks round after every intent: the room beyond is in sight now.
    expect(seesNow(state).has('7,1,7')).toBe(true);
    state = run(state, through).state;
    expect(state.activeSave!.tokens.get(t.poiId)!.get(t.aldra as never)).toEqual({ x: 5, y: 1, z: 7 });
    // Not on somebody in the doorway.
    expect(run(state, open(t, id, false)).rejected).toBe('somebody is standing in the way');
  });

  it('refuses a prop that does not open', () => {
    const t = tavern();
    const state = run(t.state, { kind: 'placeProp', placeId: t.placeId, poiId: t.poiId, type: 'bars', at: { x: 3, y: 1, z: 3 }, facing: 0 }).state;
    const id = mapOf(state).props[0]!.id as string;
    expect(run(state, open(t, id, true)).rejected).toBe('that does not open');
  });

  it('tells the table which of the props it holds stand open, and nothing of a door it has not seen', () => {
    const t = tavern();
    let state = run(t.state, putDoor(t)).state;
    const id = mapOf(state).props[0]!.id as string;
    expect((viewFor('table', state) as TableView).opened).toEqual([]);
    state = run(state, open(t, id, true)).state;
    expect((viewFor('table', state) as TableView).opened).toEqual([id]);
    // A door in a corner nobody has looked at: placed, opened, never mentioned.
    state = run(state, { kind: 'placeProp', placeId: t.placeId, poiId: t.poiId, type: 'door', at: { x: 14, y: 1, z: 14 }, facing: 0 }).state;
    const far = mapOf(state).props[1]!.id as string;
    state = run(state, open(t, far, true)).state;
    expect((viewFor('table', state) as TableView).opened).not.toContain(far);
    expect(JSON.stringify((viewFor('table', state) as TableView).campaign)).not.toContain(far);
  });
});
