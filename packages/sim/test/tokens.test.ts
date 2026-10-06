// Where the party stands inside a map (R-184 to R-186, D-256, D-259).
//
// Two kinds of test, and the second kind is the one that matters most. The
// first is the rules of standing: footing, one to a cube, the map the party is
// actually in. The second is the trust boundary: what the table is sent of
// those positions, and what a refusal is allowed to say — because a refusal is
// something sent too.

import { describe, it, expect } from 'vitest';
import { apply, emptyHistory, openedWith } from '@tt/sim';
import { viewFor } from '@tt/protocol';
import type { GmView, HostState, Intent, TableView } from '@tt/protocol';
import {
  createCampaign, createLiveSave, tokensFor, DEFAULT_MATERIALS, swatchOf, ORIGIN, blockAt,
} from '@tt/domain';
import type { BlockCoord } from '@tt/domain';

const NOW = '2026-01-01T00:00:00.000Z';
type Seat = 'gm' | 'table' | 'spectator';
const run = (s: HostState, i: Intent, role: Seat = 'gm') => apply(s, role, i, NOW);
const cell = (x: number, z: number) => ({ cx: ORIGIN.cx, cz: ORIGIN.cz, x, z });
const cube = (x: number, y: number, z: number): BlockCoord => ({ x, y, z });
const STONE = swatchOf(DEFAULT_MATERIALS.find((m) => m.name === 'Mineral')!.id) as string;

/**
 * A tavern the party can see, with two members on the roster: Known chunk,
 * revealed place, two visible points of interest. The new map's floor is at
 * y0, so the first cube anyone can stand in is y1.
 */
function tavern() {
  const campaign = createCampaign('Ashfall');
  let state: HostState = {
    campaigns: [{ id: campaign.id, name: campaign.name }],
    active: campaign,
    activeSave: createLiveSave(campaign, NOW),
    history: emptyHistory(),
  };
  state = run(state, { kind: 'addMember', name: 'Brann' }).state;
  state = run(state, { kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: true }).state;
  state = run(state, { kind: 'addPlace', cell: cell(5, 6), name: 'Casilda' }).state;
  const placeId = state.active!.places[0]!.id;
  state = run(state, { kind: 'setPlaceRevealed', placeId, revealed: true }).state;
  state = run(state, { kind: 'addPoi', placeId, name: 'The tavern', visibleToParty: true }).state;
  state = run(state, { kind: 'addPoi', placeId, name: 'The cellar', visibleToParty: true }).state;
  const [tavernPoi, cellarPoi] = state.active!.places[0]!.pois;
  const [aldra, brann] = state.active!.party;
  return {
    state,
    placeId,
    poiId: tavernPoi!.id as string,
    cellarId: cellarPoi!.id as string,
    aldra: aldra!.id as string,
    brann: brann!.id as string,
  };
}

/** The tavern with the party already in it. */
function inTavern() {
  const t = tavern();
  return { ...t, state: run(t.state, { kind: 'enterMap', placeId: t.placeId, poiId: t.poiId }).state };
}

const move = (
  t: { placeId: string; poiId: string },
  memberId: string,
  at: BlockCoord,
  poiId = t.poiId,
): Intent => ({ kind: 'moveToken', placeId: t.placeId, poiId, memberId, at });

const standingIn = (state: HostState, poiId: string) => tokensFor(state.activeSave!, poiId);
const tableTokens = (state: HostState) => (viewFor('table', state) as TableView).tokens;

describe('placing the party in a map (R-184)', () => {
  it('stands a member on the floor of the map the party is in, and writes it', () => {
    const t = inTavern();
    const result = run(t.state, move(t, t.aldra, cube(3, 1, 3)));
    expect(result.rejected).toBeUndefined();
    expect(standingIn(result.state, t.poiId).get(t.aldra as never)).toEqual(cube(3, 1, 3));
    expect(result.effects.map((e) => e.kind)).toEqual(['saveSave']);
  });

  it('moves them with the same intent that placed them (D-150)', () => {
    const t = inTavern();
    let state = run(t.state, move(t, t.aldra, cube(3, 1, 3))).state;
    state = run(state, move(t, t.aldra, cube(7, 1, 2))).state;
    expect(standingIn(state, t.poiId).get(t.aldra as never)).toEqual(cube(7, 1, 2));
  });

  it('refuses a map the party is not in — a move cannot land in another room', () => {
    const t = inTavern();
    expect(run(t.state, move(t, t.aldra, cube(3, 1, 3), t.cellarId)).rejected)
      .toBe('the party is not in that map');
    const out = run(t.state, { kind: 'leaveMap' }).state;
    expect(run(out, move(t, t.aldra, cube(3, 1, 3))).rejected).toBe('the party is not in that map');
  });

  it('refuses somebody who is not on the roster', () => {
    const t = inTavern();
    expect(run(t.state, move(t, 'member_ghost', cube(3, 1, 3))).rejected).toBe('no such party member');
  });

  it('says why a cube cannot be stood in', () => {
    const t = inTavern();
    let state = run(t.state, {
      kind: 'setBlock', placeId: t.placeId, poiId: t.poiId, cells: [cube(4, 1, 4)], swatch: STONE,
    }).state;
    state = run(state, move(t, t.brann, cube(6, 1, 6))).state;

    expect(run(state, move(t, t.aldra, cube(4, 1, 4))).rejected).toBe('there is a block there');
    expect(run(state, move(t, t.aldra, cube(3, 3, 3))).rejected).toBe('there is nothing there to stand on');
    expect(run(state, move(t, t.aldra, cube(40, 1, 3))).rejected).toBe('that is outside the map');
    expect(run(state, move(t, t.aldra, cube(6, 1, 6))).rejected).toBe('somebody is already standing there');
    // On top of the block is a floor like any other.
    expect(run(state, move(t, t.aldra, cube(4, 2, 4))).rejected).toBeUndefined();
  });

  it('is play state: a move is not an undo step (R-140)', () => {
    // The history is untouched — not merely the same length — because the
    // campaign did not change, and that is the whole of how undo decides
    // (R-140a).
    const t = inTavern();
    const result = run(t.state, move(t, t.aldra, cube(3, 1, 3)));
    expect(result.state.active).toBe(t.state.active);
    expect(result.state.history).toBe(t.state.history);
  });
});

describe('the table seat moves the party too (R-136, R-185)', () => {
  it('may stand a member wherever the GM may, inside the band', () => {
    const t = inTavern();
    expect(run(t.state, move(t, t.aldra, cube(3, 1, 3)), 'table').rejected).toBeUndefined();
  });

  it('is refused a cube outside the band before anything about the cube is said (R-85)', () => {
    // A ceiling at y4 the table is never sent: cut the band to [0, 4).
    const t = inTavern();
    let state = run(t.state, {
      kind: 'setBlock', placeId: t.placeId, poiId: t.poiId, cells: [cube(3, 3, 3)], swatch: STONE,
    }).state;
    state = run(state, {
      kind: 'setBlock', placeId: t.placeId, poiId: t.poiId, cells: [cube(3, 4, 3)], swatch: STONE,
    }).state;
    state = run(state, { kind: 'addPlane', placeId: t.placeId, poiId: t.poiId, name: 'Upstairs', y: 4 }).state;
    state = run(state, { kind: 'setRange', placeId: t.placeId, poiId: t.poiId, lower: 0, upper: 4 }).state;

    // Standing on the block at 3 puts the cube at 4 — the ceiling's level, and
    // a block is there. Saying so would tell the table about a cube it was
    // never sent; the refusal names the band instead.
    const refusal = run(state, move(t, t.aldra, cube(3, 4, 3)), 'table').rejected;
    expect(refusal).toBe('that is outside the levels being shown');
    // The GM is told the truth about the cube, because the GM holds all of it.
    expect(run(state, move(t, t.aldra, cube(3, 4, 3))).rejected).toBe('there is a block there');
  });

  it('lets the GM stand somebody outside the band — the table is simply not sent them', () => {
    const t = inTavern();
    let state = run(t.state, {
      kind: 'setBlock', placeId: t.placeId, poiId: t.poiId, cells: [cube(2, 4, 2)], swatch: STONE,
    }).state;
    state = run(state, { kind: 'addPlane', placeId: t.placeId, poiId: t.poiId, name: 'Upstairs', y: 4 }).state;
    state = run(state, { kind: 'setRange', placeId: t.placeId, poiId: t.poiId, lower: 0, upper: 4 }).state;
    state = run(state, move(t, t.aldra, cube(2, 5, 2))).state;
    state = run(state, move(t, t.brann, cube(6, 1, 6))).state;

    expect(Object.keys(tableTokens(state)!)).toEqual([t.brann]);
  });

  it('still refuses a spectator, who holds no seat', () => {
    const t = inTavern();
    expect(run(t.state, move(t, t.aldra, cube(3, 1, 3)), 'spectator').rejected)
      .toBe('only the GM can do that');
  });
});

describe('positions are remembered per map (D-256)', () => {
  it('puts them back where they stood after leaving and coming back', () => {
    const t = inTavern();
    let state = run(t.state, move(t, t.aldra, cube(3, 1, 3))).state;
    state = run(state, { kind: 'leaveMap' }).state;
    state = run(state, { kind: 'enterMap', placeId: t.placeId, poiId: t.poiId }).state;
    expect(standingIn(state, t.poiId).get(t.aldra as never)).toEqual(cube(3, 1, 3));
  });

  it('survives the GM peeking into another map the party can see', () => {
    // Opening a visible map walks the party into it (D-200). Without memory
    // that peek would cost everyone their place in the tavern.
    const t = inTavern();
    let state = run(t.state, move(t, t.aldra, cube(3, 1, 3))).state;
    state = run(state, { kind: 'enterMap', placeId: t.placeId, poiId: t.cellarId }).state;
    state = run(state, move(t, t.aldra, cube(9, 1, 9), t.cellarId)).state;
    state = run(state, { kind: 'enterMap', placeId: t.placeId, poiId: t.poiId }).state;

    expect(standingIn(state, t.poiId).get(t.aldra as never)).toEqual(cube(3, 1, 3));
    expect(standingIn(state, t.cellarId).get(t.aldra as never)).toEqual(cube(9, 1, 9));
  });

  it('places again a member whose cube was built over while they were away', () => {
    const t = inTavern();
    let state = run(t.state, move(t, t.aldra, cube(3, 1, 3))).state;
    state = run(state, move(t, t.brann, cube(6, 1, 6))).state;
    state = run(state, { kind: 'leaveMap' }).state;
    // Nobody is present, so nothing keeps the brush out of their old cube.
    state = run(state, {
      kind: 'setBlock', placeId: t.placeId, poiId: t.poiId, cells: [cube(3, 1, 3)], swatch: STONE,
    }).state;
    expect(blockAt(state.active!.places[0]!.pois[0]!.map!, cube(3, 1, 3))).not.toBeNull();

    state = run(state, { kind: 'enterMap', placeId: t.placeId, poiId: t.poiId }).state;
    expect([...standingIn(state, t.poiId).keys()]).toEqual([t.brann]);
  });
});

describe('edits never move a token (R-186)', () => {
  it('builds a brush around somebody standing in its patch', () => {
    const t = inTavern();
    let state = run(t.state, move(t, t.aldra, cube(3, 1, 3))).state;
    state = run(state, {
      kind: 'setBlock', placeId: t.placeId, poiId: t.poiId,
      cells: [cube(2, 1, 3), cube(3, 1, 3), cube(4, 1, 3)], swatch: STONE,
    }).state;
    const map = state.active!.places[0]!.pois[0]!.map!;
    expect(blockAt(map, cube(2, 1, 3))).not.toBeNull();
    expect(blockAt(map, cube(3, 1, 3))).toBeNull();
    expect(blockAt(map, cube(4, 1, 3))).not.toBeNull();
    expect(standingIn(state, t.poiId).get(t.aldra as never)).toEqual(cube(3, 1, 3));
  });

  it('refuses a build whose only cube is somebody\'s', () => {
    const t = inTavern();
    const state = run(t.state, move(t, t.aldra, cube(3, 1, 3))).state;
    expect(run(state, {
      kind: 'setBlock', placeId: t.placeId, poiId: t.poiId, cells: [cube(3, 1, 3)], swatch: STONE,
    }).rejected).toBe('somebody is standing there');
  });

  it('leaves somebody where they stand when the floor under them is erased', () => {
    // A trapdoor is the GM's move to make; the token is not moved for them.
    const t = inTavern();
    let state = run(t.state, move(t, t.aldra, cube(3, 1, 3))).state;
    const erased = run(state, {
      kind: 'clearBlock', placeId: t.placeId, poiId: t.poiId, cells: [cube(3, 0, 3)],
    });
    expect(erased.rejected).toBeUndefined();
    state = erased.state;
    expect(standingIn(state, t.poiId).get(t.aldra as never)).toEqual(cube(3, 1, 3));
  });
});

describe('what the table is told (R-185, D-259)', () => {
  it('nothing until the party is in a map', () => {
    expect(tableTokens(tavern().state)).toBeNull();
  });

  it('nobody, once they are in and before anyone is placed', () => {
    expect(tableTokens(inTavern().state)).toEqual({});
  });

  it('where each member stands', () => {
    const t = inTavern();
    let state = run(t.state, move(t, t.aldra, cube(3, 1, 3))).state;
    state = run(state, move(t, t.brann, cube(6, 1, 6))).state;
    expect(tableTokens(state)).toEqual({
      [t.aldra]: { x: 3, y: 1, z: 3 },
      [t.brann]: { x: 6, y: 1, z: 6 },
    });
  });

  it('a token on a level the GM has cut away is absent from the payload (R-85)', () => {
    const t = inTavern();
    let state = run(t.state, {
      kind: 'setBlock', placeId: t.placeId, poiId: t.poiId, cells: [cube(2, 4, 2)], swatch: STONE,
    }).state;
    state = run(state, { kind: 'addPlane', placeId: t.placeId, poiId: t.poiId, name: 'Upstairs', y: 4 }).state;
    state = run(state, move(t, t.aldra, cube(2, 5, 2))).state;
    state = run(state, move(t, t.brann, cube(6, 1, 6))).state;
    state = run(state, { kind: 'setRange', placeId: t.placeId, poiId: t.poiId, lower: 0, upper: 4 }).state;

    // Absent, not merely undrawable: the cube is nowhere in what the table gets.
    const wire = JSON.stringify(viewFor('table', state));
    expect(Object.keys(tableTokens(state)!)).toEqual([t.brann]);
    expect(wire).not.toContain('"x":2,"y":5,"z":2');
  });

  it('nobody, and no room, once the GM hides the place they are standing in', () => {
    const t = inTavern();
    let state = run(t.state, move(t, t.aldra, cube(3, 1, 3))).state;
    state = run(state, { kind: 'setPoiVisible', placeId: t.placeId, poiId: t.poiId, visibleToParty: false }).state;
    expect(tableTokens(state)).toBeNull();
  });

  it('does not send somebody who has left the roster', () => {
    const t = inTavern();
    let state = run(t.state, move(t, t.aldra, cube(3, 1, 3))).state;
    state = run(state, move(t, t.brann, cube(6, 1, 6))).state;
    state = run(state, { kind: 'removeMember', id: t.brann }).state;
    expect(Object.keys(tableTokens(state)!)).toEqual([t.aldra]);
  });

  it('gives the GM every position in every map, out of the save', () => {
    const t = inTavern();
    let state = run(t.state, move(t, t.aldra, cube(3, 1, 3))).state;
    state = run(state, { kind: 'enterMap', placeId: t.placeId, poiId: t.cellarId }).state;
    state = run(state, move(t, t.aldra, cube(9, 1, 9), t.cellarId)).state;
    const gm = viewFor('gm', state) as GmView;
    expect(gm.save!.tokens).toEqual({
      [t.poiId]: { [t.aldra]: { x: 3, y: 1, z: 3 } },
      [t.cellarId]: { [t.aldra]: { x: 9, y: 1, z: 9 } },
    });
  });
});

describe('opening the campaign tidies what is remembered (R-184)', () => {
  it('forgets members who left and maps that are gone', () => {
    const t = inTavern();
    let state = run(t.state, move(t, t.aldra, cube(3, 1, 3))).state;
    state = run(state, move(t, t.brann, cube(6, 1, 6))).state;
    state = run(state, { kind: 'enterMap', placeId: t.placeId, poiId: t.cellarId }).state;
    state = run(state, move(t, t.aldra, cube(9, 1, 9), t.cellarId)).state;
    state = run(state, { kind: 'removeMember', id: t.brann }).state;
    state = run(state, { kind: 'removePoi', placeId: t.placeId, poiId: t.cellarId }).state;

    const reopened = openedWith(
      { campaigns: [], active: null, activeSave: null, history: emptyHistory() },
      state.active!,
      state.activeSave!,
      NOW,
      new Set([t.placeId as never]),
    ).state.activeSave!;
    expect([...reopened.tokens.keys()]).toEqual([t.poiId]);
    expect([...tokensFor(reopened, t.poiId).keys()]).toEqual([t.aldra]);
  });
});
