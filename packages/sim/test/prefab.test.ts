// Prefabs through `sim` (D-321): saving a box, placing it in one undo step,
// the library's own edits, and the boundary — the table is never sent it.

import { describe, it, expect } from 'vitest';
import { apply, emptyHistory } from '@tt/sim';
import { viewFor } from '@tt/protocol';
import type { GmView, HostState, Intent } from '@tt/protocol';
import {
  createCampaign, createLiveSave, DEFAULT_MATERIALS, swatchOf, ORIGIN, blockAt, EMPTY_LIBRARY,
} from '@tt/domain';

const NOW = '2026-01-01T00:00:00.000Z';
const run = (s: HostState, i: Intent, role: 'gm' | 'table' = 'gm') => apply(s, role, i, NOW);
const cell = (x: number, z: number) => ({ cx: ORIGIN.cx, cz: ORIGIN.cz, x, z });
const STONE = swatchOf(DEFAULT_MATERIALS.find((m) => m.name === 'Mineral')!.id) as string;

/** A place with one point of interest whose map holds a stone post two high at (2, 1–2, 2). */
function seeded() {
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
  state = run(state, { kind: 'addPoi', placeId, name: 'The tavern', visibleToParty: true }).state;
  const poiId = state.active!.places[0]!.pois[0]!.id as string;
  state = run(state, { kind: 'setBlock', placeId, poiId, cells: [{ x: 2, y: 1, z: 2 }, { x: 2, y: 2, z: 2 }], swatch: STONE }).state;
  return { state, placeId, poiId };
}

const mapOf = (state: HostState) => state.active!.places[0]!.pois[0]!.map!;
const save = (t: ReturnType<typeof seeded>, name = 'Post'): Intent => ({
  kind: 'savePrefab', placeId: t.placeId, poiId: t.poiId,
  from: { x: 2, y: 1, z: 2 }, to: { x: 2, y: 2, z: 2 }, name, tags: ['posts'],
});

describe('saving a prefab (D-321)', () => {
  it('reads the box into the library, asks the host to write it, and is the GM\'s alone', () => {
    const t = seeded();
    expect(run(t.state, save(t), 'table').rejected).toBe('only the GM can do that');
    const result = run(t.state, save(t));
    expect(result.state.prefabs).toHaveLength(1);
    expect(result.state.prefabs[0]!.size).toEqual({ x: 1, y: 2, z: 1 });
    expect(result.effects).toEqual([{ kind: 'savePrefab', prefab: result.state.prefabs[0] }]);
    // Not a campaign edit: undo has nothing to take back.
    expect(result.state.history).toBe(t.state.history);
  });

  it('says why a box cannot be saved', () => {
    const t = seeded();
    const empty: Intent = { ...save(t), from: { x: 9, y: 5, z: 9 }, to: { x: 10, y: 6, z: 10 } } as Intent;
    expect(run(t.state, empty).rejected).toBe('nothing is built in that box');
    expect(run(t.state, { ...save(t), poiId: 'poi_ghost' } as Intent).rejected).toBe('no such map');
  });
});

describe('placing a prefab', () => {
  const place = (t: ReturnType<typeof seeded>, id: string, at = { x: 8, y: 1, z: 8 }, clear = false): Intent => ({
    kind: 'placePrefab', placeId: t.placeId, poiId: t.poiId, id, at, facing: 0, mirrored: false, clear,
  });

  it('stamps it as one map edit — one undo step takes all of it back', () => {
    const t = seeded();
    let state = run(t.state, save(t)).state;
    const id = state.prefabs[0]!.id;
    expect(run(state, place(t, id), 'table').rejected).toBe('only the GM can do that');
    state = run(state, place(t, id)).state;
    expect(blockAt(mapOf(state), { x: 8, y: 1, z: 8 })).toBe(STONE);
    expect(blockAt(mapOf(state), { x: 8, y: 2, z: 8 })).toBe(STONE);
    const undone = run(state, { kind: 'undo' }).state;
    expect(blockAt(mapOf(undone), { x: 8, y: 1, z: 8 })).toBeNull();
    expect(blockAt(mapOf(undone), { x: 8, y: 2, z: 8 })).toBeNull();
  });

  it('refuses a prefab that is not in the library, and a placement that changes nothing', () => {
    const t = seeded();
    const state = run(t.state, save(t)).state;
    expect(run(state, place(t, 'prefab_ghost')).rejected).toBe('no such prefab');
    // On top of the post it was taken from: the same stone in the same cubes.
    expect(run(state, place(t, state.prefabs[0]!.id, { x: 2, y: 1, z: 2 })).rejected).toBe('that would change nothing');
  });

  it('is a stamp: removing the prefab leaves what was placed from it', () => {
    const t = seeded();
    let state = run(t.state, save(t)).state;
    const id = state.prefabs[0]!.id;
    state = run(state, place(t, id)).state;
    const removed = run(state, { kind: 'removePrefab', id });
    expect(removed.effects).toEqual([{ kind: 'removePrefab', id }]);
    expect(removed.state.prefabs).toEqual([]);
    expect(blockAt(mapOf(removed.state), { x: 8, y: 2, z: 8 })).toBe(STONE);
  });
});

describe('the library', () => {
  it('renames and retags without a campaign open, and writes the one prefab that changed', () => {
    const t = seeded();
    const saved = run(t.state, save(t)).state;
    const closed: HostState = { ...saved, active: null, activeSave: null };
    const id = saved.prefabs[0]!.id;
    const result = run(closed, { kind: 'editPrefab', id, name: 'Stone post', tags: ['ruins'] });
    expect(result.state.prefabs[0]!.name).toBe('Stone post');
    expect(result.effects).toEqual([{ kind: 'savePrefab', prefab: result.state.prefabs[0] }]);
    expect(run(closed, { kind: 'editPrefab', id: 'prefab_ghost', name: 'x' }).rejected).toBe('no such prefab');
  });

  it('is in the GM\'s view and never in the table\'s', () => {
    const t = seeded();
    const state = run(t.state, save(t, 'Watchtower')).state;
    expect((viewFor('gm', state) as GmView).prefabs.map((p) => p.name)).toEqual(['Watchtower']);
    expect(JSON.stringify(viewFor('table', state))).not.toContain('Watchtower');
  });
});
