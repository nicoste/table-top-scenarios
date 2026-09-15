// Maps through `sim` (D-183): the guards, the permission line, and the boundary.
//
// The boundary is the part that matters. A map may hold a cellar the party has
// not found, and until the cutting range exists there is no way to send part of
// a body — so none of it is sent (D-184).

import { describe, it, expect } from 'vitest';
import { apply, emptyHistory } from '@tt/sim';
import { viewFor } from '@tt/protocol';
import type { GmView, HostState, Intent, TableView } from '@tt/protocol';
import {
  createCampaign, createLiveSave, DEFAULT_MATERIALS, DEFAULT_FLOOR,
  MAP_PATCH, MAP_MAX_HEIGHT, ORIGIN,
} from '@tt/domain';

const NOW = '2026-01-01T00:00:00.000Z';
const run = (s: HostState, i: Intent, role: 'gm' | 'table' = 'gm') => apply(s, role, i, NOW);
const cell = (x: number, z: number) => ({ cx: ORIGIN.cx, cz: ORIGIN.cz, x, z });
const STONE = DEFAULT_MATERIALS.find((m) => m.name === 'Stone')!.id as string;

/** A revealed place with one revealed point of interest, in a Known chunk. */
function seeded() {
  const campaign = createCampaign('Ashfall');
  let state: HostState = {
    campaigns: [{ id: campaign.id, name: campaign.name }],
    active: campaign,
    activeSave: createLiveSave(campaign, NOW),
    history: emptyHistory(),
  };
  state = run(state, { kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: true }).state;
  state = run(state, { kind: 'addPlace', cell: cell(5, 6), name: 'Casilda' }).state;
  const placeId = state.active!.places[0]!.id;
  state = run(state, { kind: 'setPlaceRevealed', placeId, revealed: true }).state;
  state = run(state, { kind: 'addPoi', placeId, name: 'The tavern', visibleToParty: true }).state;
  const poiId = state.active!.places[0]!.pois[0]!.id;
  return { state, placeId, poiId };
}

const poiOf = (state: HostState) => state.active!.places[0]!.pois[0]!;

describe('creating a map', () => {
  it('starts as a floor, and only once', () => {
    const { state, placeId, poiId } = seeded();
    const made = run(state, { kind: 'addMap', placeId, poiId }).state;
    expect(poiOf(made).map?.blocks.size).toBe(MAP_PATCH * MAP_PATCH);

    // Asking twice must not wipe what is there.
    const again = run(made, { kind: 'addMap', placeId, poiId });
    expect(again.rejected).toBe('that point of interest already has a map');
  });

  it('rejects a place or point of interest that is not there', () => {
    const { state, placeId, poiId } = seeded();
    expect(run(state, { kind: 'addMap', placeId: 'place_ghost', poiId }).rejected)
      .toBe('no such place');
    expect(run(state, { kind: 'addMap', placeId, poiId: 'poi_ghost' }).rejected)
      .toBe('no such point of interest');
  });

  it('says so rather than going quiet when there is no map to edit (R-18)', () => {
    const { state, placeId, poiId } = seeded();
    expect(run(state, { kind: 'setBlock', placeId, poiId, x: 0, y: 1, z: 0, materialId: STONE }).rejected)
      .toBe('that point of interest has no map yet');
  });
});

describe('building', () => {
  function withMap() {
    const { state, placeId, poiId } = seeded();
    return { state: run(state, { kind: 'addMap', placeId, poiId }).state, placeId, poiId };
  }

  it('places and clears a block', () => {
    const { state, placeId, poiId } = withMap();
    const built = run(state, { kind: 'setBlock', placeId, poiId, x: 2, y: 1, z: 3, materialId: STONE }).state;
    expect(poiOf(built).map!.blocks.get('2,1,3')).toBe(STONE);

    const cleared = run(built, { kind: 'clearBlock', placeId, poiId, x: 2, y: 1, z: 3 }).state;
    expect(poiOf(cleared).map!.blocks.has('2,1,3')).toBe(false);
  });

  it('refuses a block outside the footprint or above the cap', () => {
    const { state, placeId, poiId } = withMap();
    for (const at of [
      { x: MAP_PATCH, y: 0, z: 0 },
      { x: 0, y: MAP_MAX_HEIGHT, z: 0 },
      { x: -1, y: 0, z: 0 },
    ]) {
      expect(run(state, { kind: 'setBlock', placeId, poiId, ...at, materialId: STONE }).rejected)
        .toBe('that is outside the map');
    }
  });

  it('refuses a material nobody registered', () => {
    const { state, placeId, poiId } = withMap();
    expect(run(state, {
      kind: 'setBlock', placeId, poiId, x: 0, y: 1, z: 0, materialId: 'material:unobtanium',
    }).rejected).toBe('unknown material');
  });

  it('grows the footprint and floors the new ground', () => {
    const { state, placeId, poiId } = withMap();
    const grown = run(state, { kind: 'growMap', placeId, poiId, axis: 'x' }).state;
    expect(poiOf(grown).map!.size).toEqual({ x: MAP_PATCH * 2, z: MAP_PATCH });
    expect(poiOf(grown).map!.blocks.get(`${MAP_PATCH},0,0`)).toBe(DEFAULT_FLOOR);
  });
});

describe('undo covers map edits for free (R-140a)', () => {
  it('takes back a block without the handler knowing about history', () => {
    // The snapshot is taken by comparing campaign identity across `apply`, so a
    // new intent is undoable the moment it edits the campaign — nothing had to
    // be registered anywhere.
    const { state, placeId, poiId } = seeded();
    let next = run(state, { kind: 'addMap', placeId, poiId }).state;
    next = run(next, { kind: 'setBlock', placeId, poiId, x: 1, y: 1, z: 1, materialId: STONE }).state;
    expect(poiOf(next).map!.blocks.has('1,1,1')).toBe(true);

    const undone = run(next, { kind: 'undo' }).state;
    expect(poiOf(undone).map!.blocks.has('1,1,1')).toBe(false);
    expect(poiOf(undone).map).not.toBeNull();
  });

  it('collapses a drag of blocks into one undo (R-140b)', () => {
    const { state, placeId, poiId } = seeded();
    let next = run(state, { kind: 'addMap', placeId, poiId }).state;
    for (let x = 0; x < 5; x += 1) {
      next = run(next, {
        kind: 'setBlock', placeId, poiId, x, y: 1, z: 0, materialId: STONE, stroke: 'wall1',
      }).state;
    }
    expect(poiOf(next).map!.blocks.has('4,1,0')).toBe(true);

    const undone = run(next, { kind: 'undo' }).state;
    for (let x = 0; x < 5; x += 1) {
      expect(poiOf(undone).map!.blocks.has(`${x},1,0`), `block ${x}`).toBe(false);
    }
  });
});

describe('the boundary (D-184)', () => {
  it('sends the party a point of interest by name, with no body', () => {
    const { state, placeId, poiId } = seeded();
    let next = run(state, { kind: 'addMap', placeId, poiId }).state;
    next = run(next, { kind: 'setBlock', placeId, poiId, x: 1, y: 1, z: 1, materialId: STONE }).state;

    const table = viewFor('table', next) as TableView;
    const poi = table.campaign!.places[0]!.pois[0]!;
    expect(poi.name).toBe('The tavern');
    expect(poi.map).toBeNull();
  });

  it('puts no block anywhere on the table wire', () => {
    // Not "the table does not draw it" — absent. A body may hold a cellar the
    // party has not found, and until the range exists there is no way to send
    // part of one (R-85).
    const { state, placeId, poiId } = seeded();
    let next = run(state, { kind: 'addMap', placeId, poiId }).state;
    next = run(next, { kind: 'setBlock', placeId, poiId, x: 7, y: 9, z: 7, materialId: STONE }).state;

    const payload = JSON.stringify(viewFor('table', next));
    expect(payload).not.toContain('"blocks"');
    expect(payload).not.toContain('7,9,7');
  });

  it('still gives the GM the whole body (D-182)', () => {
    const { state, placeId, poiId } = seeded();
    let next = run(state, { kind: 'addMap', placeId, poiId }).state;
    next = run(next, { kind: 'setBlock', placeId, poiId, x: 7, y: 9, z: 7, materialId: STONE }).state;

    const gm = viewFor('gm', next) as GmView;
    const poi = gm.campaign!.places[0]!.pois[0]!;
    expect(poi.map?.blocks['7,9,7']).toBe(STONE);
  });
});

describe('a map is authored content, so the table seat cannot touch it (R-136)', () => {
  it('refuses every map intent from the table', () => {
    const { state, placeId, poiId } = seeded();
    const withMap = run(state, { kind: 'addMap', placeId, poiId }).state;
    for (const intent of [
      { kind: 'addMap', placeId, poiId },
      { kind: 'setBlock', placeId, poiId, x: 0, y: 1, z: 0, materialId: STONE },
      { kind: 'clearBlock', placeId, poiId, x: 0, y: 0, z: 0 },
      { kind: 'growMap', placeId, poiId, axis: 'x' },
    ] as Intent[]) {
      expect(run(withMap, intent, 'table').rejected, intent.kind).toBe('only the GM can do that');
    }
  });
});
