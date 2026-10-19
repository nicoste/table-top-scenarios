// Silver tokens and the Tokens Library on the host (D-307, R-206).
//
// The rules of placing them, and — the part that matters most — the trust
// boundary: the table is sent a silver token only while the party can see it,
// and then only its name, its cube and its picture.

import { describe, it, expect } from 'vitest';
import { apply, emptyHistory, openedWith } from '@tt/sim';
import { viewFor } from '@tt/protocol';
import type { GmView, HostState, Intent, TableView } from '@tt/protocol';
import {
  createCampaign, createLiveSave, DEFAULT_MATERIALS, swatchOf, ORIGIN, blockAt, EMPTY_LIBRARY,
  silverIn, withSilver, orderIn,
} from '@tt/domain';
import type { BlockCoord, ImageId, SilverToken } from '@tt/domain';

const NOW = '2026-01-01T00:00:00.000Z';
type Seat = 'gm' | 'table' | 'spectator';
const run = (s: HostState, i: Intent, role: Seat = 'gm') => apply(s, role, i, NOW);
const cell = (x: number, z: number) => ({ cx: ORIGIN.cx, cz: ORIGIN.cz, x, z });
const cube = (x: number, y: number, z: number): BlockCoord => ({ x, y, z });
const STONE = swatchOf(DEFAULT_MATERIALS.find((m) => m.name === 'Mineral')!.id) as string;
const PICTURE = `${'f'.repeat(64)}.webp` as ImageId;

/**
 * A tavern the party can see and is standing in, a cellar beside it, and a
 * library with a goblin (with a picture) and a bartender (without).
 */
function tavern() {
  const campaign = createCampaign('Ashfall');
  let state: HostState = {
    campaigns: [{ id: campaign.id, name: campaign.name }],
    active: campaign,
    activeSave: createLiveSave(campaign, NOW),
    history: emptyHistory(),
    library: EMPTY_LIBRARY, prefabs: [],
  };
  state = run(state, { kind: 'addTemplate', name: 'Goblin', tags: ['monster'], image: PICTURE }).state;
  state = run(state, { kind: 'addTemplate', name: 'Bartender', tags: ['npc'] }).state;
  state = run(state, { kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: true }).state;
  state = run(state, { kind: 'addPlace', cell: cell(5, 6), name: 'Casilda' }).state;
  const placeId = state.active!.places[0]!.id as string;
  state = run(state, { kind: 'setPlaceRevealed', placeId, revealed: true }).state;
  state = run(state, { kind: 'addPoi', placeId, name: 'The tavern', visibleToParty: true }).state;
  state = run(state, { kind: 'addPoi', placeId, name: 'The cellar', visibleToParty: true }).state;
  const [tavernPoi, cellarPoi] = state.active!.places[0]!.pois;
  const poiId = tavernPoi!.id as string;
  state = run(state, { kind: 'enterMap', placeId, poiId }).state;
  const aldra = state.active!.party[0]!.id as string;
  // Aldra stands near one end of the room and sees the rest of it.
  state = run(state, { kind: 'moveToken', placeId, poiId, memberId: aldra, at: cube(2, 1, 2) }).state;
  const [goblin, bartender] = state.library;
  return {
    state, placeId, poiId, cellarId: cellarPoi!.id as string, aldra,
    goblin: goblin!.id as string, bartender: bartender!.id as string,
  };
}
type Tavern = ReturnType<typeof tavern>;

const spawn = (t: Tavern, at: BlockCoord, templateId = t.goblin, poiId = t.poiId): Intent => ({
  kind: 'spawnSilver', placeId: t.placeId, poiId, templateId, at,
});
const silverOf = (state: HostState, poiId: string) => silverIn(state.activeSave!, poiId);
const tableSilver = (state: HostState) => (viewFor('table', state) as TableView).silver;
/** A two-cube wall across the tavern at x 8: Aldra, at x 2, cannot see past it. */
const wallAt8 = Array.from({ length: 16 }, (_, z) => [cube(8, 1, z), cube(8, 2, z)]).flat();

describe('the Tokens Library on the host (D-307)', () => {
  it('keeps entries with no campaign open, and asks the host to write them', () => {
    const empty: HostState = {
      campaigns: [], active: null, activeSave: null, history: emptyHistory(), library: EMPTY_LIBRARY, prefabs: [],
    };
    const result = run(empty, { kind: 'addTemplate', name: 'Ogre' });
    expect(result.rejected).toBeUndefined();
    expect(result.state.library.map((t) => t.name)).toEqual(['Ogre']);
    expect(result.effects.map((e) => e.kind)).toEqual(['saveLibrary']);
  });

  it('is under no campaign undo — it is not in a campaign', () => {
    const t = tavern();
    const before = (viewFor('gm', t.state) as GmView).canUndo;
    const after = run(t.state, { kind: 'editTemplate', id: t.goblin, name: 'Goblin archer' }).state;
    expect((viewFor('gm', after) as GmView).canUndo).toBe(before);
    expect(after.history).toBe(t.state.history);
  });

  it('is the GM\'s alone, and never sent to the table', () => {
    const t = tavern();
    expect(run(t.state, { kind: 'addTemplate', name: 'Dragon' }, 'table').rejected).toBe('only the GM can do that');
    expect((viewFor('gm', t.state) as GmView).library.map((e) => e.name)).toEqual(['Goblin', 'Bartender']);
    expect(JSON.stringify(viewFor('table', t.state))).not.toContain('Bartender');
  });
});

describe('placing silver tokens (R-206)', () => {
  it('places one on a floor, named for its entry, as play state', () => {
    const t = tavern();
    const result = run(t.state, spawn(t, cube(5, 1, 5)));
    expect(result.rejected).toBeUndefined();
    const [one] = silverOf(result.state, t.poiId);
    expect(one!.name).toMatch(/^Goblin [A-HJ-NP-Z]\d$/);
    expect(one!.at).toEqual(cube(5, 1, 5));
    expect(result.effects.map((e) => e.kind)).toEqual(['saveSave']);
    // Not an authored edit: nothing for undo to take back (R-140).
    expect(result.state.history).toBe(t.state.history);
  });

  it('places one in a map the party is not in — a cellar laid out before anyone goes down', () => {
    const t = tavern();
    const result = run(t.state, spawn(t, cube(4, 1, 4), t.goblin, t.cellarId));
    expect(result.rejected).toBeUndefined();
    expect(silverOf(result.state, t.cellarId)).toHaveLength(1);
  });

  it('refuses a member\'s cube, another token\'s cube, and an entry that is not in the library', () => {
    const t = tavern();
    expect(run(t.state, spawn(t, cube(2, 1, 2))).rejected).toBe('somebody is already standing there');
    const once = run(t.state, spawn(t, cube(5, 1, 5))).state;
    expect(run(once, spawn(t, cube(5, 1, 5), t.bartender)).rejected).toBe('somebody is already standing there');
    expect(run(t.state, spawn(t, cube(5, 1, 5), 'template_nobody')).rejected).toBe('no such token in the library');
  });

  it('moves, renames, hides and removes, and the table may do none of it', () => {
    const t = tavern();
    let state = run(t.state, spawn(t, cube(5, 1, 5))).state;
    const id = silverOf(state, t.poiId)[0]!.id as string;
    const where = { placeId: t.placeId, poiId: t.poiId, id };
    for (const intent of [
      { kind: 'moveSilver', ...where, at: cube(6, 1, 6) },
      { kind: 'renameSilver', ...where, name: 'Goblin boss' },
      { kind: 'hideSilver', ...where, hidden: true },
      { kind: 'removeSilver', ...where },
      spawn(t, cube(7, 1, 7)),
    ] as Intent[]) {
      expect(run(state, intent, 'table').rejected, intent.kind).toBe('only the GM can do that');
    }
    state = run(state, { kind: 'moveSilver', ...where, at: cube(6, 1, 6) }).state;
    state = run(state, { kind: 'renameSilver', ...where, name: 'Goblin boss' }).state;
    state = run(state, { kind: 'hideSilver', ...where, hidden: true }).state;
    expect(silverOf(state, t.poiId)[0]).toMatchObject({ at: cube(6, 1, 6), name: 'Goblin boss', hidden: true });
    state = run(state, { kind: 'removeSilver', ...where }).state;
    expect(silverOf(state, t.poiId)).toEqual([]);
  });

  it('keeps the party out of a goblin\'s cube, and a brush too (one to a cube, D-307)', () => {
    const t = tavern();
    const state = run(t.state, spawn(t, cube(5, 1, 5))).state;
    expect(run(state, { kind: 'moveToken', placeId: t.placeId, poiId: t.poiId, memberId: t.aldra, at: cube(5, 1, 5) }).rejected)
      .toBe('somebody is already standing there');
    const built = run(state, {
      kind: 'setBlock', placeId: t.placeId, poiId: t.poiId, cells: [cube(5, 1, 5), cube(6, 1, 5)], swatch: STONE,
    }).state;
    const map = built.active!.places[0]!.pois[0]!.map!;
    expect(blockAt(map, cube(5, 1, 5))).toBeNull();
    expect(blockAt(map, cube(6, 1, 5))).not.toBeNull();
  });

  it('survives a fresh start: that forgets what the party saw, not what the GM set out', () => {
    const t = tavern();
    let state = run(t.state, spawn(t, cube(5, 1, 5))).state;
    state = run(state, { kind: 'forgetMap', placeId: t.placeId, poiId: t.poiId }).state;
    expect(silverOf(state, t.poiId)).toHaveLength(1);
  });
});

describe('deleting a library entry takes its tokens (D-307)', () => {
  it('in the campaign that is open, at once', () => {
    const t = tavern();
    let state = run(t.state, spawn(t, cube(5, 1, 5))).state;
    state = run(state, spawn(t, cube(6, 1, 6), t.bartender)).state;
    state = run(state, spawn(t, cube(4, 1, 4), t.goblin, t.cellarId)).state;
    const result = run(state, { kind: 'removeTemplate', id: t.goblin });
    expect(result.effects.map((e) => e.kind).sort()).toEqual(['saveLibrary', 'saveSave']);
    expect(silverOf(result.state, t.poiId).map((s) => s.name)).toEqual([expect.stringMatching(/^Bartender/)]);
    expect(silverOf(result.state, t.cellarId)).toEqual([]);
  });

  it('in every other campaign, when it next opens', () => {
    const t = tavern();
    const state = run(t.state, spawn(t, cube(5, 1, 5))).state;
    const save = state.activeSave!;
    // The goblin is deleted while this campaign is closed.
    const without = { ...state, library: state.library.filter((e) => e.id !== t.goblin), active: null, activeSave: null };
    const opened = openedWith(without, state.active!, save, NOW, new Set(state.active!.places.map((p) => p.id)));
    expect(silverIn(opened.state.activeSave!, t.poiId)).toEqual([]);
    expect(opened.toPersist).not.toBeNull();
  });
});

describe('what the table is sent of silver tokens (R-206)', () => {
  it('a token the party can see: its name, its cube and its picture, and nothing more', () => {
    const t = tavern();
    const state = run(t.state, spawn(t, cube(5, 1, 5))).state;
    const [goblin] = silverOf(state, t.poiId) as SilverToken[];
    expect(tableSilver(state)).toEqual([{ id: goblin!.id, name: goblin!.name, at: cube(5, 1, 5), image: PICTURE }]);
    const wire = JSON.stringify(tableSilver(state));
    expect(wire).not.toContain(t.goblin);
    expect(wire).not.toContain('monster');
  });

  it('not one behind a wall — not sent, rather than sent and not drawn (R-85)', () => {
    const t = tavern();
    let state = run(t.state, { kind: 'setBlock', placeId: t.placeId, poiId: t.poiId, cells: wallAt8, swatch: STONE }).state;
    state = run(state, spawn(t, cube(10, 1, 4))).state;
    expect(silverOf(state, t.poiId)).toHaveLength(1);
    expect(tableSilver(state)).toEqual([]);
  });

  it('not one seen a moment ago: remembering a room says nothing about who is in it now', () => {
    const t = tavern();
    // Aldra looks into the far end, so it is explored; then a wall goes up.
    let state = run(t.state, spawn(t, cube(10, 1, 4))).state;
    expect(tableSilver(state)).toHaveLength(1);
    state = run(state, { kind: 'setBlock', placeId: t.placeId, poiId: t.poiId, cells: wallAt8, swatch: STONE }).state;
    expect(tableSilver(state)).toEqual([]);
  });

  it('not one the GM has hidden, even in plain sight', () => {
    const t = tavern();
    let state = run(t.state, spawn(t, cube(5, 1, 5))).state;
    const id = silverOf(state, t.poiId)[0]!.id as string;
    state = run(state, { kind: 'hideSilver', placeId: t.placeId, poiId: t.poiId, id, hidden: true }).state;
    expect(tableSilver(state)).toEqual([]);
    expect(JSON.stringify(viewFor('table', state))).not.toContain(id);
  });

  it('not one in a map the table is not shown', () => {
    const t = tavern();
    const state = run(t.state, spawn(t, cube(4, 1, 4), t.goblin, t.cellarId)).state;
    expect(tableSilver(state)).toEqual([]);
    expect(JSON.stringify(viewFor('table', state))).not.toContain(silverOf(state, t.cellarId)[0]!.id);
  });

  it('none while nobody in the party is standing anywhere to see', () => {
    const t = tavern();
    const state = run(t.state, spawn(t, cube(5, 1, 5))).state;
    const nobody = { ...state, activeSave: { ...state.activeSave!, tokens: new Map() } };
    expect(tableSilver(withSilverKept(nobody, state, t.poiId))).toEqual([]);
  });

  it('a picture-less token arrives with none, and the table draws it grey', () => {
    const t = tavern();
    const state = run(t.state, spawn(t, cube(5, 1, 5), t.bartender)).state;
    expect(tableSilver(state)![0]!.image).toBeNull();
  });
});

/** The same silver tokens on a state whose save was otherwise replaced. */
function withSilverKept(target: HostState, source: HostState, poiId: string): HostState {
  return { ...target, activeSave: withSilver(target.activeSave!, poiId, silverIn(source.activeSave!, poiId)) };
}

describe('notes and the order of who is on stage (R-208)', () => {
  it('keeps the GM\'s note on a token, and never sends it to the table', () => {
    const t = tavern();
    let state = run(t.state, spawn(t, cube(5, 1, 5))).state;
    const id = silverOf(state, t.poiId)[0]!.id as string;
    const note = { kind: 'noteSilver', placeId: t.placeId, poiId: t.poiId, id, note: 'wounded, fleeing' } as Intent;
    expect(run(state, note, 'table').rejected).toBe('only the GM can do that');
    state = run(state, note).state;
    expect(silverOf(state, t.poiId)[0]!.note).toBe('wounded, fleeing');
    expect(tableSilver(state)).toHaveLength(1);
    expect(JSON.stringify(viewFor('table', state))).not.toContain('fleeing');
  });

  it('numbers a member and a silver token, the GM\'s alone, and only who is on stage', () => {
    const t = tavern();
    let state = run(t.state, spawn(t, cube(5, 1, 5))).state;
    const goblin = silverOf(state, t.poiId)[0]!.id as string;
    const at = (id: string, order: number | null): Intent => ({ kind: 'setOrder', placeId: t.placeId, poiId: t.poiId, id, order });
    expect(run(state, at(goblin, 18), 'table').rejected).toBe('only the GM can do that');
    expect(run(state, at('silver_nobody', 3)).rejected).toBe('nobody by that id is on stage there');
    state = run(state, at(goblin, 18)).state;
    state = run(state, at(t.aldra, 12)).state;
    expect([...orderIn(state.activeSave!, t.poiId).entries()].sort()).toEqual([[goblin, 18], [t.aldra, 12]].sort());
    // Not under undo: play state (R-140).
    expect(state.history).toBe(t.state.history);
    // And not the table's business.
    expect(JSON.stringify(viewFor('table', state))).not.toContain('"order"');
  });

  it('forgets the number of a goblin taken away, on the way back in', () => {
    const t = tavern();
    let state = run(t.state, spawn(t, cube(5, 1, 5))).state;
    const goblin = silverOf(state, t.poiId)[0]!.id as string;
    state = run(state, { kind: 'setOrder', placeId: t.placeId, poiId: t.poiId, id: goblin, order: 9 }).state;
    state = run(state, { kind: 'removeSilver', placeId: t.placeId, poiId: t.poiId, id: goblin }).state;
    const reopened = openedWith(
      { ...state, active: null, activeSave: null }, state.active!, state.activeSave!, NOW,
      new Set(state.active!.places.map((p) => p.id)),
    );
    expect(orderIn(reopened.state.activeSave!, t.poiId).size).toBe(0);
  });
});

describe('notes on the party (D-315)', () => {
  const noteOf = (state: HostState, memberId: string) => state.activeSave!.memberNotes.get(memberId);

  it('keeps the GM\'s note on a member across every map, and never sends it to the table', () => {
    const t = tavern();
    const note: Intent = { kind: 'noteMember', id: t.aldra, note: 'owes the guild 50 gp' };
    expect(run(t.state, note, 'table').rejected).toBe('only the GM can do that');
    expect(run(t.state, { kind: 'noteMember', id: 'member_nobody', note: 'x' }).rejected).toBe('no such party member');
    let state = run(t.state, note).state;
    expect(noteOf(state, t.aldra)).toBe('owes the guild 50 gp');
    // One note for the member, not one per map: the cellar finds it too.
    state = run(state, { kind: 'enterMap', placeId: t.placeId, poiId: t.cellarId }).state;
    expect((viewFor('gm', state) as GmView).save!.memberNotes).toEqual({ [t.aldra]: 'owes the guild 50 gp' });
    expect(JSON.stringify(viewFor('table', state))).not.toContain('guild');
    // Not under undo: play state, like a silver token's note (R-140).
    expect(state.history).toBe(t.state.history);
    // An empty note clears it.
    state = run(state, { kind: 'noteMember', id: t.aldra, note: '  ' }).state;
    expect(noteOf(state, t.aldra)).toBeUndefined();
  });

  it('keeps a removed member\'s note until the campaign next opens, so undoing the removal brings it back', () => {
    const t = tavern();
    let state = run(t.state, { kind: 'addMember', name: 'Brannoc' }).state;
    const brannoc = state.active!.party[1]!.id as string;
    state = run(state, { kind: 'noteMember', id: brannoc, note: 'cursed' }).state;
    state = run(state, { kind: 'removeMember', id: brannoc }).state;
    expect(noteOf(run(state, { kind: 'undo' }).state, brannoc)).toBe('cursed');
    const reopened = openedWith(
      { ...state, active: null, activeSave: null }, state.active!, state.activeSave!, NOW,
      new Set(state.active!.places.map((p) => p.id)),
    );
    expect(noteOf(reopened.state, brannoc)).toBeUndefined();
  });
});

describe('a library entry\'s sheet link on the host (D-313)', () => {
  it('keeps a web address and refuses to keep anything that runs code', () => {
    const t = tavern();
    let state = run(t.state, { kind: 'editTemplate', id: t.goblin, url: 'dndbeyond.com/monsters/goblin' }).state;
    expect(state.library.find((e) => e.id === t.goblin)!.url).toBe('https://dndbeyond.com/monsters/goblin');
    state = run(state, { kind: 'editTemplate', id: t.goblin, url: 'javascript:alert(1)' }).state;
    expect(state.library.find((e) => e.id === t.goblin)!.url).toBeNull();
  });

  it('never reaches the table', () => {
    const t = tavern();
    let state = run(t.state, { kind: 'editTemplate', id: t.goblin, url: 'https://example.com/goblin-sheet' }).state;
    state = run(state, spawn(t, cube(5, 1, 5))).state;
    expect(tableSilver(state)).toHaveLength(1);
    expect(JSON.stringify(viewFor('table', state))).not.toContain('goblin-sheet');
  });
});

