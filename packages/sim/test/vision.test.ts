// The host keeps what the party sees current (R-15, R-45, D-273): after any
// intent that went through, the party looks around, and what it sees is added
// to what it has seen.

import { describe, it, expect } from 'vitest';
import { apply, emptyHistory, openedWith } from '@tt/sim';
import { viewFor } from '@tt/protocol';
import type { HostState, Intent, TableView } from '@tt/protocol';
import {
  createCampaign, createLiveSave, exploredIn, withExplored, blockKey, DEFAULT_MATERIALS, swatchOf, ORIGIN,
  NO_CELLS, tokensFor, mapFromJSON,
  EMPTY_LIBRARY,
} from '@tt/domain';
import type { BlockCoord, PlaceId } from '@tt/domain';

const NOW = '2026-01-01T00:00:00.000Z';
const run = (s: HostState, i: Intent, role: 'gm' | 'table' = 'gm') => apply(s, role, i, NOW);
const cell = (x: number, z: number) => ({ cx: ORIGIN.cx, cz: ORIGIN.cz, x, z });
const cube = (x: number, y: number, z: number): BlockCoord => ({ x, y, z });
const STONE = swatchOf(DEFAULT_MATERIALS.find((m) => m.name === 'Mineral')!.id) as string;

/** A tavern the party can see and has walked into, two on the roster, nobody placed. */
function inTavern() {
  const campaign = createCampaign('Ashfall');
  let state: HostState = {
    campaigns: [{ id: campaign.id, name: campaign.name }],
    active: campaign,
    activeSave: createLiveSave(campaign, NOW),
    history: emptyHistory(), library: EMPTY_LIBRARY,
  };
  state = run(state, { kind: 'addMember', name: 'Brann' }).state;
  state = run(state, { kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: true }).state;
  state = run(state, { kind: 'addPlace', cell: cell(5, 6), name: 'Casilda' }).state;
  const placeId = state.active!.places[0]!.id as string;
  state = run(state, { kind: 'setPlaceRevealed', placeId, revealed: true }).state;
  state = run(state, { kind: 'addPoi', placeId, name: 'The tavern', visibleToParty: true }).state;
  const poiId = state.active!.places[0]!.pois[0]!.id as string;
  state = run(state, { kind: 'enterMap', placeId, poiId }).state;
  const [aldra, brann] = state.active!.party;
  return { state, placeId, poiId, aldra: aldra!.id as string, brann: brann!.id as string };
}

type Tavern = ReturnType<typeof inTavern>;

const move = (t: Tavern, memberId: string, at: BlockCoord): Intent => ({
  kind: 'moveToken', placeId: t.placeId, poiId: t.poiId, memberId, at,
});
const build = (t: Tavern, cells: BlockCoord[]): Intent => ({
  kind: 'setBlock', placeId: t.placeId, poiId: t.poiId, cells, swatch: STONE,
});
const seen = (state: HostState, t: Tavern) => exploredIn(state.activeSave!, t.poiId);
const k = (x: number, y: number, z: number) => blockKey({ x, y, z });

/** A two-cube wall across the tavern at x 8. */
const wallAt8 = Array.from({ length: 16 }, (_, z) => [cube(8, 1, z), cube(8, 2, z)]).flat();

describe('the party sees once somebody stands in the map (R-15, D-200)', () => {
  it('has seen nothing on walking in, with nobody standing anywhere', () => {
    const t = inTavern();
    expect(seen(t.state, t)).toBe(NO_CELLS);
  });

  it('sees around a member the moment the GM stands them there', () => {
    const t = inTavern();
    const state = run(t.state, move(t, t.aldra, cube(3, 1, 3))).state;
    expect(seen(state, t).has(k(3, 1, 3))).toBe(true);
    expect(seen(state, t).has(k(9, 1, 9))).toBe(true);
  });
});

describe('what was seen stays seen (R-45)', () => {
  it('keeps the room they left behind when they walk on', () => {
    const t = inTavern();
    let state = run(t.state, build(t, wallAt8)).state;
    // A doorway in the wall at z 5.
    state = run(state, { kind: 'clearBlock', placeId: t.placeId, poiId: t.poiId, cells: [cube(8, 1, 5), cube(8, 2, 5)] }).state;
    state = run(state, move(t, t.aldra, cube(3, 1, 5))).state;
    expect(seen(state, t).has(k(2, 1, 2))).toBe(true);
    expect(seen(state, t).has(k(14, 1, 12))).toBe(false);

    state = run(state, move(t, t.aldra, cube(12, 1, 5))).state;
    expect(seen(state, t).has(k(14, 1, 12))).toBe(true);
    // Behind them now, and still known.
    expect(seen(state, t).has(k(2, 1, 2))).toBe(true);
  });

  it('is not taken back by undo, which is about the campaign (R-140)', () => {
    const t = inTavern();
    let state = run(t.state, build(t, wallAt8)).state;
    state = run(state, move(t, t.aldra, cube(3, 1, 5))).state;
    expect(seen(state, t).has(k(12, 1, 5))).toBe(false);
    // The wall comes down: what was behind it is seen at once, though nobody
    // moved.
    state = run(state, { kind: 'undo' }).state;
    expect(seen(state, t).has(k(12, 1, 5))).toBe(true);
    // And the wall back up hides it from sight but not from memory.
    state = run(state, { kind: 'redo' }).state;
    expect(seen(state, t).has(k(12, 1, 5))).toBe(true);
  });
});

describe('sight follows whatever it depends on (D-273)', () => {
  it('grows when the GM widens a member\'s range', () => {
    const t = inTavern();
    let state = run(t.state, { kind: 'editMember', id: t.aldra, visionRange: 2 }).state;
    state = run(state, move(t, t.aldra, cube(3, 1, 3))).state;
    expect(seen(state, t).has(k(10, 1, 3))).toBe(false);
    state = run(state, { kind: 'editMember', id: t.aldra, visionRange: 12 }).state;
    expect(seen(state, t).has(k(10, 1, 3))).toBe(true);
  });

  it('writes the save once for an intent, however it grew', () => {
    const t = inTavern();
    const result = run(t.state, move(t, t.aldra, cube(3, 1, 3)));
    expect(result.effects.filter((effect) => effect.kind === 'saveSave')).toHaveLength(1);
    const written = result.effects.find((effect) => effect.kind === 'saveSave');
    expect(written && 'save' in written && exploredIn(written.save, t.poiId).size).toBeGreaterThan(0);
  });

  it('writes nothing for an intent that changes nothing anybody sees', () => {
    const t = inTavern();
    const state = run(t.state, move(t, t.aldra, cube(3, 1, 3))).state;
    const result = run(state, { kind: 'renamePlace', id: t.placeId, name: 'Casilda Vieja' });
    expect(result.effects.some((effect) => effect.kind === 'saveSave')).toBe(false);
    expect(result.state.activeSave).toBe(state.activeSave);
  });
});

describe('opening a campaign (D-273)', () => {
  it('looks around for a party standing in a map, in a save from before vision', () => {
    const t = inTavern();
    const state = run(t.state, move(t, t.aldra, cube(3, 1, 3))).state;
    // The same save with nothing seen, as a save written before vision reads.
    const before = withExplored(state.activeSave!, t.poiId, NO_CELLS);
    const opened = openedWith(t.state, state.active!, before, NOW, new Set([t.placeId as PlaceId]));
    expect(exploredIn(opened.state.activeSave!, t.poiId).has(k(3, 1, 3))).toBe(true);
    expect(opened.toPersist).not.toBeNull();
  });

  it('forgets what was seen of a map that is gone', () => {
    const t = inTavern();
    const state = run(t.state, move(t, t.aldra, cube(3, 1, 3))).state;
    const stale = withExplored(state.activeSave!, 'poi_gone', new Set([k(1, 1, 1)]));
    const opened = openedWith(t.state, state.active!, stale, NOW, new Set([t.placeId as PlaceId]));
    expect(opened.state.activeSave!.explored.has('poi_gone')).toBe(false);
  });
});

describe('a fresh start in a map (D-277)', () => {
  const forget = (t: Tavern): Intent => ({ kind: 'forgetMap', placeId: t.placeId, poiId: t.poiId });

  it('forgets what the party has seen and takes them off the map', () => {
    const t = inTavern();
    let state = run(t.state, move(t, t.aldra, cube(3, 1, 3))).state;
    state = run(state, move(t, t.brann, cube(12, 1, 12))).state;
    expect(seen(state, t).size).toBeGreaterThan(0);

    state = run(state, forget(t)).state;
    expect(seen(state, t)).toBe(NO_CELLS);
    expect(tokensFor(state.activeSave!, t.poiId).size).toBe(0);
    // And so the table is shown nothing of it until somebody stands there.
    const table = viewFor('table', state) as TableView;
    const body = table.campaign!.places[0]!.pois[0]!.map!;
    expect(mapFromJSON(body)!.blocks.size).toBe(0);
  });

  it('starts seeing again the moment the GM stands somebody there', () => {
    const t = inTavern();
    let state = run(t.state, move(t, t.aldra, cube(3, 1, 3))).state;
    state = run(state, forget(t)).state;
    state = run(state, move(t, t.aldra, cube(12, 1, 12))).state;
    expect(seen(state, t).has(k(12, 1, 12))).toBe(true);
    // Only from where they stand now: the walk before the fresh start is gone.
    expect(seen(state, t).has(k(0, 1, 0))).toBe(false);
  });

  it('is the GM\'s alone', () => {
    const t = inTavern();
    const state = run(t.state, move(t, t.aldra, cube(3, 1, 3))).state;
    expect(run(state, forget(t), 'table').rejected).toBe('only the GM can do that');
  });

  it('writes the save once, and is not undone by undo (R-140)', () => {
    const t = inTavern();
    let state = run(t.state, build(t, wallAt8)).state;
    state = run(state, move(t, t.aldra, cube(3, 1, 3))).state;
    const result = run(state, forget(t));
    expect(result.effects.filter((effect) => effect.kind === 'saveSave')).toHaveLength(1);
    state = run(result.state, { kind: 'undo' }).state;
    expect(seen(state, t)).toBe(NO_CELLS);
  });
});
