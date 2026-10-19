// The party going into a map, and what the table is then sent (R-158).
//
// This file is the answer to D-184, which withheld every map body from the table
// because there was no way to withhold *part* of one. The range is that way, so
// the tests that matter here are the negative ones: a map the party has not
// entered, and a level the GM has cut away, must be **absent** from the payload
// rather than present and undrawn (R-85).

import { describe, it, expect } from 'vitest';
import { apply, emptyHistory, openedWith } from '@tt/sim';
import { viewFor } from '@tt/protocol';
import type { GmView, HostState, Intent, TableView } from '@tt/protocol';
import {
  createCampaign, createLiveSave, rangeFor, planeSteps, DEFAULT_MATERIALS, swatchOf,
  MAP_MAX_HEIGHT, MAP_MIN_DEPTH, WHOLE_MAP, ORIGIN, blockAt, mapFromJSON,
  EMPTY_LIBRARY,
} from '@tt/domain';

const NOW = '2026-01-01T00:00:00.000Z';
const run = (s: HostState, i: Intent, role: 'gm' | 'table' = 'gm') => apply(s, role, i, NOW);
const cell = (x: number, z: number) => ({ cx: ORIGIN.cx, cz: ORIGIN.cz, x, z });
const STONE = swatchOf(DEFAULT_MATERIALS.find((m) => m.name === 'Mineral')!.id) as string;

/**
 * A tavern the party can see: Known chunk, revealed place, visible point of
 * interest, with a block on three different levels and planes between them.
 */
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
  const placeId = state.active!.places[0]!.id;
  state = run(state, { kind: 'setPlaceRevealed', placeId, revealed: true }).state;
  state = run(state, { kind: 'addPoi', placeId, name: 'The tavern', visibleToParty: true }).state;
  const poiId = state.active!.places[0]!.pois[0]!.id;

  for (const [y, tag] of [[1, 'cellar'], [5, 'ground'], [9, 'upstairs']] as const) {
    state = run(state, {
      kind: 'setBlock', placeId, poiId, cells: [{ x: 2, y, z: 2 }], swatch: STONE,
    }).state;
    void tag;
  }
  for (const [name, y] of [['Ground floor', 4], ['Upstairs', 8]] as const) {
    state = run(state, { kind: 'addPlane', placeId, poiId, name, y }).state;
  }
  return { state, placeId, poiId };
}

/**
 * Stands the roster's first member on the floor in the middle of the tavern,
 * where twelve cubes take in all three floating blocks and most of the floor:
 * the table is shown what the party sees (D-273), so a test about what the
 * table is sent has somebody looking first.
 */
const looking = (state: HostState, placeId: string, poiId: string) => run(state, {
  kind: 'moveToken', placeId, poiId, memberId: state.active!.party[0]!.id, at: { x: 5, y: 1, z: 5 },
}).state;

const tableMap = (state: HostState) =>
  (viewFor('table', state) as TableView).campaign!.places[0]!.pois[0]!.map;

/**
 * What the table could actually get out of its payload, at one cell.
 *
 * **Decoded, not inspected.** The body is packed now (D-217), but that is not
 * why: R-85's question was never "is there a key" — it is whether a table can
 * reconstruct a cube the GM cut away. Asking the decoded payload is asking
 * exactly what a table does with it.
 */
const tableBlock = (state: HostState, x: number, y: number, z: number) => {
  const wire = tableMap(state);
  return wire ? blockAt(mapFromJSON(wire)!, { x, y, z }) : null;
};

describe('taking the party in (R-158)', () => {
  it('records where they are, and writes it', () => {
    const { state, placeId, poiId } = tavern();
    const entered = run(state, { kind: 'enterMap', placeId, poiId });
    expect(entered.state.activeSave!.inside).toEqual({ placeId, poiId });
    // A save change that is not written is a save change that is lost.
    expect(entered.effects.some((e) => e.kind === 'saveSave')).toBe(true);
  });

  it('refuses a point of interest the party cannot see', () => {
    // The same condition the boundary uses to decide whether the table gets it
    // at all. Walking them into a room they cannot see would leave the table
    // pointed at nothing — or leak, if it sent it anyway.
    const { state, placeId, poiId } = tavern();
    const hidden = run(state, {
      kind: 'setPoiVisible', placeId, poiId, visibleToParty: false,
    }).state;
    expect(run(hidden, { kind: 'enterMap', placeId, poiId }).rejected)
      .toBe('the party cannot see that point of interest yet');
  });

  it('refuses when the place is revealed but its chunk is not Known (D-132)', () => {
    const { state, placeId, poiId } = tavern();
    const dark = run(state, {
      kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: false,
    }).state;
    expect(run(dark, { kind: 'enterMap', placeId, poiId }).rejected)
      .toBe('the party cannot see that point of interest yet');
  });

  it('says which thing is missing', () => {
    const { state, placeId, poiId } = tavern();
    expect(run(state, { kind: 'enterMap', placeId: 'place_ghost', poiId }).rejected)
      .toBe('no such place');
    expect(run(state, { kind: 'enterMap', placeId, poiId: 'poi_ghost' }).rejected)
      .toBe('no such point of interest');
  });

  // Renamed with D-256: this used to add "and remembers nothing about where they
  // were", which stopped being true once positions were remembered per map.
  // What it asserts is unchanged — they are back on the world.
  it('brings them back out to the world', () => {
    const { state, placeId, poiId } = tavern();
    const inside = run(state, { kind: 'enterMap', placeId, poiId }).state;
    const out = run(inside, { kind: 'leaveMap' }).state;
    expect(out.activeSave!.inside).toBeNull();
  });

  it('is remembered across a reopen — "once they are in, we should keep them"', () => {
    const { state, placeId, poiId } = tavern();
    const inside = run(state, { kind: 'enterMap', placeId, poiId }).state;
    const reopened = openedWith(
      { campaigns: [], active: null, activeSave: null, history: emptyHistory(), library: EMPTY_LIBRARY, prefabs: [] },
      inside.active!,
      inside.activeSave!,
      NOW,
      new Set([placeId as never]),
    );
    expect(reopened.state.activeSave!.inside?.poiId).toBe(poiId);
  });

  it('puts them back on the world when the map they were in is gone', () => {
    // Otherwise the table is pointed at nothing, with no way back short of the
    // GM noticing.
    const { state, placeId, poiId } = tavern();
    const inside = run(state, { kind: 'enterMap', placeId, poiId }).state;
    const deleted = run(inside, { kind: 'removePoi', placeId, poiId }).state;
    const reopened = openedWith(
      { campaigns: [], active: null, activeSave: null, history: emptyHistory(), library: EMPTY_LIBRARY, prefabs: [] },
      deleted.active!,
      deleted.activeSave!,
      NOW,
      new Set([placeId as never]),
    );
    expect(reopened.state.activeSave!.inside).toBeNull();
  });
});

describe('what the table is sent (R-158, D-184 answered)', () => {
  it('nothing at all until the party goes in', () => {
    // The guarantee this round had to preserve. A tavern the party has not
    // entered is a name on the table and no geometry.
    const { state } = tavern();
    expect(tableMap(state)).toBeNull();
  });

  it('a map with nothing in it until somebody stands there to see (D-200, D-273)', () => {
    const { state, placeId, poiId } = tavern();
    const inside = run(state, { kind: 'enterMap', placeId, poiId }).state;
    expect(tableMap(inside)).not.toBeNull();
    expect(mapFromJSON(tableMap(inside)!)!.blocks.size).toBe(0);
  });

  it('everything the party sees once they are in and nothing is cut', () => {
    const { state, placeId, poiId } = tavern();
    const inside = looking(run(state, { kind: 'enterMap', placeId, poiId }).state, placeId, poiId);
    expect(tableBlock(inside, 2, 1, 2)).toBe(STONE);
    expect(tableBlock(inside, 2, 5, 2)).toBe(STONE);
    expect(tableBlock(inside, 2, 9, 2)).toBe(STONE);
    // And the floor out past the member's twelve cubes is not theirs to see.
    expect(tableBlock(inside, 5, 0, 5)).not.toBeNull();
    expect(tableBlock(inside, 15, 0, 15)).toBeNull();
  });

  it('never a block the party has not seen (R-85, D-273)', () => {
    // A box of stone two cubes high round a crate at 12,1,12; the member
    // stands outside it.
    const { state, placeId, poiId } = tavern();
    const box: { x: number; y: number; z: number }[] = [];
    for (let x = 10; x <= 14; x += 1) {
      for (let z = 10; z <= 14; z += 1) {
        if (x === 10 || x === 14 || z === 10 || z === 14) box.push({ x, y: 1, z }, { x, y: 2, z });
      }
    }
    let next = run(state, { kind: 'setBlock', placeId, poiId, cells: box, swatch: STONE }).state;
    next = run(next, { kind: 'setBlock', placeId, poiId, cells: [{ x: 12, y: 1, z: 12 }], swatch: STONE }).state;
    next = looking(run(next, { kind: 'enterMap', placeId, poiId }).state, placeId, poiId);

    expect(tableBlock(next, 10, 1, 12)).toBe(STONE);
    expect(tableBlock(next, 12, 1, 12)).toBeNull();
    // Not cut from the map — the GM still has it.
    const gm = viewFor('gm', next) as GmView;
    const theirs = mapFromJSON(gm.campaign!.places[0]!.pois[0]!.map!)!;
    expect(theirs.blocks.has('12,1,12')).toBe(true);
  });

  it('only the band, once the GM cuts to one', () => {
    const { state, placeId, poiId } = tavern();
    let inside = looking(run(state, { kind: 'enterMap', placeId, poiId }).state, placeId, poiId);
    inside = run(inside, { kind: 'setRange', placeId, poiId, lower: 4, upper: 8 }).state;

    expect(tableBlock(inside, 2, 5, 2)).toBe(STONE);
    // Not merely unkeyed — not recoverable from the payload at all (R-85).
    expect(tableBlock(inside, 2, 1, 2)).toBeNull();
    expect(tableBlock(inside, 2, 9, 2)).toBeNull();
  });

  it('a cut level is absent from the payload, not merely undrawn (R-85)', () => {
    const { state, placeId, poiId } = tavern();
    let inside = looking(run(state, { kind: 'enterMap', placeId, poiId }).state, placeId, poiId);
    inside = run(inside, { kind: 'setRange', placeId, poiId, lower: 4, upper: 8 }).state;

    /*
     * This read the payload's bytes and grepped for the coordinate keys, which
     * was the right question asked of a shape that no longer exists: a packed
     * body contains no coordinate strings at all, so the grep would now pass
     * for a payload carrying every level (D-217).
     *
     * Decoding asks the thing R-85 actually cares about — whether a table can
     * reconstruct the cube — and it is what a table does with the payload
     * anyway.
     */
    expect(tableBlock(inside, 2, 5, 2)).toBe(STONE);
    expect(tableBlock(inside, 2, 1, 2)).toBeNull();
    expect(tableBlock(inside, 2, 9, 2)).toBeNull();
    // And the payload is not merely hiding them behind a second copy of the
    // body: there is one, and it decodes to one level.
    const levels = new Set(
      [...mapFromJSON(tableMap(inside)!)!.blocks.keys()].map((k) => Number(k.split(',')[1])),
    );
    expect([...levels]).toEqual([5]);
  });

  it('gives a second point of interest nothing, even while the first is open', () => {
    // Being in the tavern is not permission to see the church.
    const { state, placeId, poiId } = tavern();
    let next = run(state, { kind: 'addPoi', placeId, name: 'The church', visibleToParty: true }).state;
    const churchId = next.active!.places[0]!.pois[1]!.id;
    next = run(next, {
      kind: 'setBlock', placeId, poiId: churchId, cells: [{ x: 1, y: 1, z: 1 }], swatch: STONE,
    }).state;
    next = run(next, { kind: 'enterMap', placeId, poiId }).state;

    const pois = (viewFor('table', next) as TableView).campaign!.places[0]!.pois;
    expect(pois.find((p) => p.id === poiId)!.map).not.toBeNull();
    expect(pois.find((p) => p.id === churchId)!.map).toBeNull();
  });

  it('loses the body the moment they leave', () => {
    const { state, placeId, poiId } = tavern();
    const inside = run(state, { kind: 'enterMap', placeId, poiId }).state;
    const out = run(inside, { kind: 'leaveMap' }).state;
    expect(tableMap(out)).toBeNull();
  });

  it('still gives the GM the whole body, cut or not (D-182)', () => {
    // The console draws everything and fades what is out of range, so the GM
    // can peek into the cellar while the party is upstairs.
    const { state, placeId, poiId } = tavern();
    let inside = run(state, { kind: 'enterMap', placeId, poiId }).state;
    inside = run(inside, { kind: 'setRange', placeId, poiId, lower: 4, upper: 8 }).state;

    const gm = mapFromJSON((viewFor('gm', inside) as GmView).campaign!.places[0]!.pois[0]!.map)!;
    expect(blockAt(gm, { x: 2, y: 1, z: 2 })).toBe(STONE);
    expect(blockAt(gm, { x: 2, y: 9, z: 2 })).toBe(STONE);
  });

  it('sends the plane names but not what is behind them', () => {
    const { state, placeId, poiId } = tavern();
    let inside = run(state, { kind: 'enterMap', placeId, poiId }).state;
    inside = run(inside, { kind: 'setRange', placeId, poiId, lower: 4, upper: 8 }).state;
    const map = tableMap(inside)!;
    // Water level comes with every new map (R-161); the other two are the
    // fixture's own.
    expect(map.planes?.map((p) => p.name)).toEqual(['Water level', 'Ground floor', 'Upstairs']);
  });
});

describe('the range (R-146)', () => {
  it('takes the console at its word, within the bounds', () => {
    // Not snapped to a step. The ladder sends both bounds on every change, so
    // pulling them onto steps meant moving a handle the GM had not touched
    // (R-161) — and a band between two levels is a perfectly good band.
    const { state, placeId, poiId } = tavern();
    const inside = run(state, { kind: 'enterMap', placeId, poiId }).state;
    const ranged = run(inside, { kind: 'setRange', placeId, poiId, lower: 5, upper: 7 }).state;
    expect(rangeFor(ranged.activeSave!, poiId)).toEqual({ lower: 5, upper: 7 });
  });

  it('still refuses to let a band leave the map or select nothing', () => {
    const { state, placeId, poiId } = tavern();
    const inside = run(state, { kind: 'enterMap', placeId, poiId }).state;
    const wild = run(inside, {
      kind: 'setRange', placeId, poiId, lower: -900, upper: 900,
    }).state;
    expect(rangeFor(wild.activeSave!, poiId)).toEqual({ lower: MAP_MIN_DEPTH, upper: MAP_MAX_HEIGHT });

    const pinched = run(inside, { kind: 'setRange', placeId, poiId, lower: 8, upper: 8 }).state;
    const band = rangeFor(pinched.activeSave!, poiId);
    expect(band.lower).toBeLessThan(band.upper);
  });

  it('cuts a map the party is nowhere near — that is how one gets built (D-201)', () => {
    // The bug this replaces: the range lived inside the party's location, so
    // the only control for it was dead until somebody was standing there.
    const { state, placeId, poiId } = tavern();
    expect(state.activeSave!.inside).toBeNull();
    const cut = run(state, { kind: 'setRange', placeId, poiId, lower: 0, upper: 4 }).state;
    expect(rangeFor(cut.activeSave!, poiId)).toEqual({ lower: 0, upper: 4 });
  });

  it('is what the party walks into, later', () => {
    const { state, placeId, poiId } = tavern();
    let next = run(state, { kind: 'setRange', placeId, poiId, lower: 4, upper: 8 }).state;
    next = looking(run(next, { kind: 'enterMap', placeId, poiId }).state, placeId, poiId);
    const levels = new Set(
      [...mapFromJSON(tableMap(next)!)!.blocks.keys()].map((k) => Number(k.split(',')[1])),
    );
    expect([...levels].sort((a, b) => a - b)).toEqual([5]);
  });

  it('an uncut map carries no entry, so the record does not fill with defaults', () => {
    const { state, placeId, poiId } = tavern();
    let next = run(state, { kind: 'setRange', placeId, poiId, lower: 4, upper: 8 }).state;
    expect(next.activeSave!.ranges.size).toBe(1);
    next = run(next, {
      kind: 'setRange', placeId, poiId, lower: MAP_MIN_DEPTH, upper: MAP_MAX_HEIGHT,
    }).state;
    expect(next.activeSave!.ranges.size).toBe(0);
  });

  it('forgets the band of a map the GM deleted', () => {
    const { state, placeId, poiId } = tavern();
    let next = run(state, { kind: 'setRange', placeId, poiId, lower: 4, upper: 8 }).state;
    next = run(next, { kind: 'removePoi', placeId, poiId }).state;
    const reopened = openedWith(
      { campaigns: [], active: null, activeSave: null, history: emptyHistory(), library: EMPTY_LIBRARY, prefabs: [] },
      next.active!,
      next.activeSave!,
      NOW,
      new Set([placeId as never]),
    );
    expect(reopened.state.activeSave!.ranges.size).toBe(0);
  });
});

describe('planes are authored content (R-136)', () => {
  it('refuses every new intent from the table seat', () => {
    const { state, placeId, poiId } = tavern();
    const planeId = state.active!.places[0]!.pois[0]!.map!.planes[0]!.id;
    for (const intent of [
      { kind: 'addPlane', placeId, poiId, name: 'Attic', y: 16 },
      { kind: 'renamePlane', placeId, poiId, planeId, name: 'Attic' },
      { kind: 'movePlane', placeId, poiId, planeId, y: 16 },
      { kind: 'removePlane', placeId, poiId, planeId },
      { kind: 'enterMap', placeId, poiId },
      { kind: 'leaveMap' },
      { kind: 'setRange', placeId, poiId, lower: 0, upper: 4 },
    ] as Intent[]) {
      expect(run(state, intent, 'table').rejected, intent.kind).toBe('only the GM can do that');
    }
  });

  it('refuses a plane at either bound, and a second at one height', () => {
    const { state, placeId, poiId } = tavern();
    expect(run(state, { kind: 'addPlane', placeId, poiId, name: 'x', y: MAP_MAX_HEIGHT }).rejected)
      .toBe('a plane sits between the floor and the ceiling');
    expect(run(state, { kind: 'addPlane', placeId, poiId, name: 'x', y: MAP_MIN_DEPTH }).rejected)
      .toBe('a plane sits between the floor and the ceiling');
    expect(run(state, { kind: 'addPlane', placeId, poiId, name: 'x', y: 4 }).rejected)
      .toBe('there is already a plane there');
    // Zero is occupied by the water level a new map comes with, not forbidden.
    expect(run(state, { kind: 'addPlane', placeId, poiId, name: 'x', y: 0 }).rejected)
      .toBe('there is already a plane there');
  });

  it('lets the GM delete the water level it started with', () => {
    const { state, placeId, poiId } = tavern();
    const water = state.active!.places[0]!.pois[0]!.map!.planes.find((p) => p.y === 0)!;
    const without = run(state, {
      kind: 'removePlane', placeId, poiId, planeId: water.id,
    }).state;
    expect(without.active!.places[0]!.pois[0]!.map!.planes.some((p) => p.y === 0)).toBe(false);
  });

  it('names the plane that is not there', () => {
    const { state, placeId, poiId } = tavern();
    expect(run(state, { kind: 'removePlane', placeId, poiId, planeId: 'plane_ghost' }).rejected)
      .toBe('no such plane');
  });

  it('is undoable, like every other authored edit (R-140a)', () => {
    const { state, placeId, poiId } = tavern();
    const before = state.active!.places[0]!.pois[0]!.map!.planes.length;
    const added = run(state, { kind: 'addPlane', placeId, poiId, name: 'Attic', y: 16 }).state;
    expect(added.active!.places[0]!.pois[0]!.map!.planes).toHaveLength(before + 1);
    const undone = run(added, { kind: 'undo' }).state;
    expect(undone.active!.places[0]!.pois[0]!.map!.planes).toHaveLength(before);
  });
});

describe('a band always rests on a level (R-161, D-206)', () => {
  it('comes to rest when the level it was on is deleted', () => {
    // The bug this prevents: a band left between levels made the ladder draw
    // one handle instead of two, because a handle is drawn on the row it rests
    // at and there was no such row.
    const { state, placeId, poiId } = tavern();
    let next = run(state, { kind: 'setRange', placeId, poiId, lower: 4, upper: 8 }).state;
    const ground = next.active!.places[0]!.pois[0]!.map!.planes.find((p) => p.y === 4)!;
    next = run(next, { kind: 'removePlane', placeId, poiId, planeId: ground.id }).state;

    const band = rangeFor(next.activeSave!, poiId);
    const stops = planeSteps(
      next.active!.places[0]!.pois[0]!.map!.planes, MAP_MAX_HEIGHT, MAP_MIN_DEPTH,
    );
    expect(stops).toContain(band.lower);
    expect(stops).toContain(band.upper);
  });

  it('comes to rest when the level it was on is moved', () => {
    const { state, placeId, poiId } = tavern();
    let next = run(state, { kind: 'setRange', placeId, poiId, lower: 4, upper: 8 }).state;
    const ground = next.active!.places[0]!.pois[0]!.map!.planes.find((p) => p.y === 4)!;
    next = run(next, { kind: 'movePlane', placeId, poiId, planeId: ground.id, y: 6 }).state;

    const band = rangeFor(next.activeSave!, poiId);
    const stops = planeSteps(
      next.active!.places[0]!.pois[0]!.map!.planes, MAP_MAX_HEIGHT, MAP_MIN_DEPTH,
    );
    expect(stops).toContain(band.lower);
    expect(stops).toContain(band.upper);
  });

  it('writes the settled band, or it is lost on reload', () => {
    const { state, placeId, poiId } = tavern();
    const banded = run(state, { kind: 'setRange', placeId, poiId, lower: 4, upper: 8 }).state;
    const ground = banded.active!.places[0]!.pois[0]!.map!.planes.find((p) => p.y === 4)!;
    const removed = run(banded, { kind: 'removePlane', placeId, poiId, planeId: ground.id });
    expect(removed.effects.some((e) => e.kind === 'saveSave')).toBe(true);
  });

  it('settles a band stored before the rule existed, on the way in', () => {
    // Such a band is real: one was found in a live campaign, resting at a
    // height left behind by an earlier change (R-137a).
    const { state, placeId, poiId } = tavern();
    const stranded: HostState = {
      ...state,
      activeSave: { ...state.activeSave!, ranges: new Map([[poiId as string, { lower: -2, upper: 1 }]]) },
    };
    const reopened = openedWith(
      { campaigns: [], active: null, activeSave: null, history: emptyHistory(), library: EMPTY_LIBRARY, prefabs: [] },
      stranded.active!,
      stranded.activeSave!,
      NOW,
      new Set([placeId as never]),
    );
    const band = rangeFor(reopened.state.activeSave!, poiId);
    const stops = planeSteps(
      reopened.state.active!.places[0]!.pois[0]!.map!.planes, MAP_MAX_HEIGHT, MAP_MIN_DEPTH,
    );
    expect(stops).toContain(band.lower);
    expect(stops).toContain(band.upper);
  });
});

describe('an uncut map carries no band, and everyone must agree what that means (D-208)', () => {
  it('stores nothing once the band reaches both bounds', () => {
    const { state, placeId, poiId } = tavern();
    const cut = run(state, { kind: 'setRange', placeId, poiId, lower: 0, upper: 4 }).state;
    expect(cut.activeSave!.ranges.has(poiId)).toBe(true);

    const whole = run(cut, {
      kind: 'setRange', placeId, poiId, lower: MAP_MIN_DEPTH, upper: MAP_MAX_HEIGHT,
    }).state;
    expect(whole.activeSave!.ranges.has(poiId)).toBe(false);
  });

  it('reads that absence back as floor to sky, not as zero to sky', () => {
    /*
     * The GM dragged the bottom handle down to Bedrock and watched it land at
     * the water line instead. Nothing had gone wrong with the drag: the band
     * reached the floor, which made it the whole map, which stored no entry at
     * all — and the console read "no entry" as zero to sky, a default left over
     * from before a map could be dug below zero (R-160).
     *
     * So the assertion is about the *bottom*. Absence must mean the deepest a
     * map goes, because that is what the host wrote when it deleted the entry.
     */
    const { state, placeId, poiId } = tavern();
    const whole = run(state, {
      kind: 'setRange', placeId, poiId, lower: MAP_MIN_DEPTH, upper: MAP_MAX_HEIGHT,
    }).state;
    expect(rangeFor(whole.activeSave!, poiId)).toEqual({ lower: MAP_MIN_DEPTH, upper: MAP_MAX_HEIGHT });
    expect(WHOLE_MAP).toEqual({ lower: MAP_MIN_DEPTH, upper: MAP_MAX_HEIGHT });
  });

  it('leaves the console nothing on the wire to read it from', () => {
    // Where the two answers actually met: the console has no band to draw, so
    // it supplies one. It must supply the same one.
    const { state, placeId, poiId } = tavern();
    const whole = run(state, {
      kind: 'setRange', placeId, poiId, lower: MAP_MIN_DEPTH, upper: MAP_MAX_HEIGHT,
    }).state;
    const wire = (viewFor('gm', whole) as GmView).save!;
    expect(wire.ranges[poiId as string]).toBeUndefined();
  });

  it('still stores a band that reaches the floor but not the sky', () => {
    // The cellar alone, which is a real band and not an uncut map.
    const { state, placeId, poiId } = tavern();
    const cellar = run(state, {
      kind: 'setRange', placeId, poiId, lower: MAP_MIN_DEPTH, upper: 4,
    }).state;
    expect(cellar.activeSave!.ranges.has(poiId)).toBe(true);
    expect(rangeFor(cellar.activeSave!, poiId)).toEqual({ lower: MAP_MIN_DEPTH, upper: 4 });
  });
});

const tableView = (state: HostState) => viewFor('table', state) as TableView;

describe('cutting one place’s band does not darken anywhere else (R-183)', () => {
  it('takes the sun out of the place being cut, and only that one', () => {
    // The GM's clarification, as a test rather than a promise: the band is a
    // property of one point of interest, so the rule it drives has to be too.
    const { state, placeId, poiId } = tavern();
    let next = run(state, { kind: 'addPoi', placeId, name: 'The yard', visibleToParty: true }).state;
    const otherId = next.active!.places[0]!.pois[1]!.id;

    // Out on the world, with nobody inside anything: full daylight.
    const outside = tableView(next).lighting.sunLevel;
    expect(outside).toBeGreaterThan(0);

    // Cut the tavern's band below the sky, and walk the party into it.
    next = run(next, {
      kind: 'setRange', placeId, poiId, lower: MAP_MIN_DEPTH, upper: 6,
    }).state;
    next = run(next, { kind: 'enterMap', placeId, poiId }).state;
    expect(tableView(next).lighting.sunLevel).toBe(0);

    // The yard, whose band nobody touched, still has its sun.
    next = run(next, { kind: 'leaveMap' }).state;
    next = run(next, { kind: 'enterMap', placeId, poiId: otherId }).state;
    expect(tableView(next).lighting.sunLevel).toBe(outside);

    // And so does the world they came back out to.
    next = run(next, { kind: 'leaveMap' }).state;
    expect(tableView(next).lighting.sunLevel).toBe(outside);
  });

  it('keeps the GM’s own setting, so raising the band gives it back', () => {
    const { state, placeId, poiId } = tavern();
    let next = run(state, {
      kind: 'setRange', placeId, poiId, lower: MAP_MIN_DEPTH, upper: 6,
    }).state;
    next = run(next, { kind: 'enterMap', placeId, poiId }).state;
    expect(tableView(next).lighting.sunLevel).toBe(0);
    // Nothing was written away: the save still holds what the GM chose.
    expect(next.activeSave!.lighting.sunLevel).toBeGreaterThan(0);

    next = run(next, {
      kind: 'setRange', placeId, poiId, lower: MAP_MIN_DEPTH, upper: MAP_MAX_HEIGHT,
    }).state;
    expect(tableView(next).lighting.sunLevel).toBe(next.activeSave!.lighting.sunLevel);
  });
});
