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
  createCampaign, createLiveSave, rangeFor, DEFAULT_MATERIALS,
  MAP_MAX_HEIGHT, MAP_MIN_DEPTH, ORIGIN,
} from '@tt/domain';

const NOW = '2026-01-01T00:00:00.000Z';
const run = (s: HostState, i: Intent, role: 'gm' | 'table' = 'gm') => apply(s, role, i, NOW);
const cell = (x: number, z: number) => ({ cx: ORIGIN.cx, cz: ORIGIN.cz, x, z });
const STONE = DEFAULT_MATERIALS.find((m) => m.name === 'Stone')!.id as string;

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
    history: emptyHistory(),
  };
  state = run(state, { kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: true }).state;
  state = run(state, { kind: 'addPlace', cell: cell(5, 6), name: 'Casilda' }).state;
  const placeId = state.active!.places[0]!.id;
  state = run(state, { kind: 'setPlaceRevealed', placeId, revealed: true }).state;
  state = run(state, { kind: 'addPoi', placeId, name: 'The tavern', visibleToParty: true }).state;
  const poiId = state.active!.places[0]!.pois[0]!.id;

  for (const [y, tag] of [[1, 'cellar'], [5, 'ground'], [9, 'upstairs']] as const) {
    state = run(state, {
      kind: 'setBlock', placeId, poiId, x: 2, y, z: 2, materialId: STONE,
    }).state;
    void tag;
  }
  for (const [name, y] of [['Ground floor', 4], ['Upstairs', 8]] as const) {
    state = run(state, { kind: 'addPlane', placeId, poiId, name, y }).state;
  }
  return { state, placeId, poiId };
}

const tableMap = (state: HostState) =>
  (viewFor('table', state) as TableView).campaign!.places[0]!.pois[0]!.map;

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

  it('brings them back out, and remembers nothing about where they were', () => {
    const { state, placeId, poiId } = tavern();
    const inside = run(state, { kind: 'enterMap', placeId, poiId }).state;
    const out = run(inside, { kind: 'leaveMap' }).state;
    expect(out.activeSave!.inside).toBeNull();
  });

  it('is remembered across a reopen — "once they are in, we should keep them"', () => {
    const { state, placeId, poiId } = tavern();
    const inside = run(state, { kind: 'enterMap', placeId, poiId }).state;
    const reopened = openedWith(
      { campaigns: [], active: null, activeSave: null, history: emptyHistory() },
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
      { campaigns: [], active: null, activeSave: null, history: emptyHistory() },
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

  it('the whole body once they are in and nothing is cut', () => {
    const { state, placeId, poiId } = tavern();
    const inside = run(state, { kind: 'enterMap', placeId, poiId }).state;
    const map = tableMap(inside);
    expect(map).not.toBeNull();
    expect(map!.blocks['2,1,2']).toBe(STONE);
    expect(map!.blocks['2,5,2']).toBe(STONE);
    expect(map!.blocks['2,9,2']).toBe(STONE);
  });

  it('only the band, once the GM cuts to one', () => {
    const { state, placeId, poiId } = tavern();
    let inside = run(state, { kind: 'enterMap', placeId, poiId }).state;
    inside = run(inside, { kind: 'setRange', placeId, poiId, lower: 4, upper: 8 }).state;

    const map = tableMap(inside)!;
    expect(map.blocks['2,5,2']).toBe(STONE);
    expect(map.blocks['2,1,2']).toBeUndefined();
    expect(map.blocks['2,9,2']).toBeUndefined();
  });

  it('a cut level is absent from the payload, not merely undrawn (R-85)', () => {
    const { state, placeId, poiId } = tavern();
    let inside = run(state, { kind: 'enterMap', placeId, poiId }).state;
    inside = run(inside, { kind: 'setRange', placeId, poiId, lower: 4, upper: 8 }).state;

    const payload = JSON.stringify(viewFor('table', inside));
    expect(payload).not.toContain('2,1,2');
    expect(payload).not.toContain('2,9,2');
    expect(payload).toContain('2,5,2');
  });

  it('gives a second point of interest nothing, even while the first is open', () => {
    // Being in the tavern is not permission to see the church.
    const { state, placeId, poiId } = tavern();
    let next = run(state, { kind: 'addPoi', placeId, name: 'The church', visibleToParty: true }).state;
    const churchId = next.active!.places[0]!.pois[1]!.id;
    next = run(next, {
      kind: 'setBlock', placeId, poiId: churchId, x: 1, y: 1, z: 1, materialId: STONE,
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

    const gm = (viewFor('gm', inside) as GmView).campaign!.places[0]!.pois[0]!;
    expect(gm.map!.blocks['2,1,2']).toBe(STONE);
    expect(gm.map!.blocks['2,9,2']).toBe(STONE);
  });

  it('sends the plane names but not what is behind them', () => {
    const { state, placeId, poiId } = tavern();
    let inside = run(state, { kind: 'enterMap', placeId, poiId }).state;
    inside = run(inside, { kind: 'setRange', placeId, poiId, lower: 4, upper: 8 }).state;
    const map = tableMap(inside)!;
    expect(map.planes?.map((p) => p.name)).toEqual(['Ground floor', 'Upstairs']);
  });
});

describe('the range (R-146)', () => {
  it('snaps to the steps rather than trusting the console', () => {
    // The steps are a fact about the map's planes, and a console can be a
    // repaint behind.
    const { state, placeId, poiId } = tavern();
    const inside = run(state, { kind: 'enterMap', placeId, poiId }).state;
    const ranged = run(inside, { kind: 'setRange', placeId, poiId, lower: 5, upper: 7 }).state;
    expect(rangeFor(ranged.activeSave!, poiId)).toEqual({ lower: 4, upper: 8 });
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
    next = run(next, { kind: 'enterMap', placeId, poiId }).state;
    const levels = new Set(Object.keys(tableMap(next)!.blocks).map((k) => Number(k.split(',')[1])));
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
      { campaigns: [], active: null, activeSave: null, history: emptyHistory() },
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

  it('refuses a plane at the floor or the ceiling, and a second at one height', () => {
    const { state, placeId, poiId } = tavern();
    expect(run(state, { kind: 'addPlane', placeId, poiId, name: 'x', y: 0 }).rejected)
      .toBe('a plane sits between the floor and the ceiling');
    expect(run(state, { kind: 'addPlane', placeId, poiId, name: 'x', y: MAP_MAX_HEIGHT }).rejected)
      .toBe('a plane sits between the floor and the ceiling');
    expect(run(state, { kind: 'addPlane', placeId, poiId, name: 'x', y: 4 }).rejected)
      .toBe('there is already a plane there');
  });

  it('names the plane that is not there', () => {
    const { state, placeId, poiId } = tavern();
    expect(run(state, { kind: 'removePlane', placeId, poiId, planeId: 'plane_ghost' }).rejected)
      .toBe('no such plane');
  });

  it('is undoable, like every other authored edit (R-140a)', () => {
    const { state, placeId, poiId } = tavern();
    const added = run(state, { kind: 'addPlane', placeId, poiId, name: 'Attic', y: 16 }).state;
    expect(added.active!.places[0]!.pois[0]!.map!.planes).toHaveLength(3);
    const undone = run(added, { kind: 'undo' }).state;
    expect(undone.active!.places[0]!.pois[0]!.map!.planes).toHaveLength(2);
  });
});
