// Moving the party. Two rules carry the weight: the party can only stand in a
// Known chunk (R-131), and that has to remain true no matter what the GM does
// next. The permission line is the other half (R-136).

import { describe, it, expect } from 'vitest';
import { apply } from '@tt/sim';
import { viewFor, IntentSchema } from '@tt/protocol';
import type { HostState, Intent, TableView } from '@tt/protocol';
import { createCampaign, createLiveSave, ORIGIN } from '@tt/domain';

const NOW = '2026-01-01T00:00:00.000Z';
const run = (s: HostState, i: Intent, role: 'gm' | 'table' | 'spectator' = 'gm') =>
  apply(s, role, i, NOW);
const at = (x: number, z: number) => ({ cx: ORIGIN.cx, cz: ORIGIN.cz, x, z });

function open(): HostState {
  const campaign = createCampaign('Ashfall');
  return {
    campaigns: [{ id: campaign.id, name: campaign.name }],
    active: campaign,
    activeSave: createLiveSave(campaign, NOW),
  };
}

/** The starting chunk revealed, which is the minimum for the party to exist anywhere. */
function revealed(): HostState {
  return run(open(), { kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: true }).state;
}

const placementOf = (state: HostState) => state.activeSave!.placement;

/**
 * Authors a run of chunks east of ORIGIN. A chunk may only be created beside an
 * existing one, so reaching the third means creating the first two.
 */
function eastward(state: HostState, count: number): HostState {
  let next = state;
  for (let i = 1; i <= count; i += 1) {
    next = run(next, { kind: 'addChunk', cx: ORIGIN.cx + i, cz: ORIGIN.cz }).state;
  }
  return next;
}
/** `viewFor` returns the union; only the table view carries placement. */
const tableView = (state: HostState) => viewFor('table', state) as TableView;
const east = (i: number) => ({ cx: ORIGIN.cx + i, cz: ORIGIN.cz });
const cellEast = (i: number, x = 0, z = 0) => ({ ...east(i), x, z });

describe('the party can only stand where the party has been (R-131)', () => {
  it('refuses to place the party before anything is revealed', () => {
    // A fresh campaign has an authored chunk that is not yet Known, so the very
    // first act has to be revealing it. There is no exemption for placement.
    const result = run(open(), { kind: 'moveParty', cell: at(4, 4) });
    expect(result.rejected).toBe('the party has not been there');
    expect(placementOf(result.state).at).toBeNull();
  });

  it('places the party once its chunk is Known', () => {
    const result = run(revealed(), { kind: 'moveParty', cell: at(4, 4) });
    expect(result.rejected).toBeUndefined();
    expect(placementOf(result.state).at).toEqual(at(4, 4));
  });

  it('refuses the GM exactly as it refuses a player', () => {
    // Not a permission rule: the party has not been there, and that is a fact
    // about the party rather than about who is asking (R-136).
    const state = revealed();
    const target = { cx: ORIGIN.cx + 1, cz: ORIGIN.cz, x: 0, z: 0 };
    expect(run(state, { kind: 'moveParty', cell: target }, 'gm').rejected)
      .toBe('the party has not been there');
    expect(run(state, { kind: 'moveParty', cell: target }, 'table').rejected)
      .toBe('the party has not been there');
  });

  it('gives the same reason for unauthored ground as for unknown ground', () => {
    const state = revealed();
    const unauthored = { cx: 0, cz: 0, x: 0, z: 0 };
    const authoredButUnknown = run(
      state,
      { kind: 'addChunk', cx: ORIGIN.cx + 1, cz: ORIGIN.cz },
    ).state;

    expect(run(state, { kind: 'moveParty', cell: unauthored }).rejected)
      .toBe('the party has not been there');
    expect(run(authoredButUnknown, {
      kind: 'moveParty',
      cell: { cx: ORIGIN.cx + 1, cz: ORIGIN.cz, x: 0, z: 0 },
    }).rejected).toBe('the party has not been there');
  });

  it('lets the party advance once the GM reveals the next chunk', () => {
    // The whole loop: reach the frontier, scout off-tool, GM reveals, then move.
    let state = eastward(revealed(), 1);
    state = run(state, { kind: 'moveParty', cell: at(0, 0) }).state;

    const blocked = run(state, { kind: 'moveParty', cell: cellEast(1, 5, 5) });
    expect(blocked.rejected).toBe('the party has not been there');

    state = run(state, { kind: 'setChunkKnown', ...east(1), known: true }).state;
    const allowed = run(state, { kind: 'moveParty', cell: cellEast(1, 5, 5) });
    expect(allowed.rejected).toBeUndefined();
    expect(placementOf(allowed.state).at).toEqual(cellEast(1, 5, 5));
  });

  it('lets the party hop over unexplored ground (D-151)', () => {
    // Known, Unknown, Known — and the party may go straight to the far one.
    // Refusing would block legitimate repositioning, and keeping the route
    // honest is the pathfinder's job (O-019), not a movement guard's.
    let state = eastward(revealed(), 2);
    state = run(state, { kind: 'setChunkKnown', ...east(2), known: true }).state;
    state = run(state, { kind: 'moveParty', cell: at(0, 0) }).state;

    // The chunk in between is deliberately left Unknown.
    expect(run(state, { kind: 'moveParty', cell: cellEast(1) }).rejected)
      .toBe('the party has not been there');
    expect(run(state, { kind: 'moveParty', cell: cellEast(2, 1, 1) }).rejected)
      .toBeUndefined();
  });

  it('rejects a cell index outside a chunk', () => {
    expect(run(revealed(), { kind: 'moveParty', cell: { cx: ORIGIN.cx, cz: ORIGIN.cz, x: 99, z: 0 } }).rejected)
      .toBeTruthy();
  });
});

describe('the invariant holds against the GM changing their mind', () => {
  it('refuses to un-Know a chunk the party is standing in', () => {
    let state = revealed();
    state = run(state, { kind: 'moveParty', cell: at(4, 4) }).state;

    const result = run(state, { kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: false });
    expect(result.rejected).toBe('the party is standing there');
    // Still Known, so the party is not left stranded in fog.
    expect(viewFor('table', result.state).campaign?.world.chunks).toHaveLength(1);
  });

  it('allows un-Knowing a chunk the party has left', () => {
    let state = eastward(revealed(), 1);
    state = run(state, { kind: 'setChunkKnown', ...east(1), known: true }).state;
    state = run(state, { kind: 'moveParty', cell: at(4, 4) }).state;
    state = run(state, { kind: 'moveParty', cell: cellEast(1) }).state;

    expect(run(state, { kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: false }).rejected)
      .toBeUndefined();
  });

  it('checks every pawn, not just the group', () => {
    let state = eastward(revealed(), 1);
    state = run(state, { kind: 'setChunkKnown', ...east(1), known: true }).state;
    state = run(state, { kind: 'moveParty', cell: at(4, 4) }).state;
    state = run(state, { kind: 'setPartyTogether', together: false }).state;

    const memberId = state.active!.party[0]!.id;
    state = run(state, { kind: 'movePartyMember', memberId, cell: cellEast(1, 1, 1) }).state;
    // One member is out there alone; that chunk is occupied all the same.
    expect(run(state, { kind: 'setChunkKnown', ...east(1), known: false }).rejected)
      .toBe('the party is standing there');
  });
});

describe('separating and gathering', () => {
  it('moves one member without moving the rest', () => {
    let state = revealed();
    state = run(state, { kind: 'moveParty', cell: at(4, 4) }).state;
    state = run(state, { kind: 'addMember' }).state;
    state = run(state, { kind: 'setPartyTogether', together: false }).state;

    const [first, second] = state.active!.party;
    state = run(state, { kind: 'movePartyMember', memberId: first!.id, cell: at(1, 1) }).state;

    expect(placementOf(state).members.get(first!.id)).toEqual(at(1, 1));
    expect(placementOf(state).members.get(second!.id)).toEqual(at(4, 4));
  });

  it('refuses to move one member while the party is together', () => {
    let state = revealed();
    state = run(state, { kind: 'moveParty', cell: at(4, 4) }).state;
    const memberId = state.active!.party[0]!.id;
    expect(run(state, { kind: 'movePartyMember', memberId, cell: at(1, 1) }).rejected)
      .toMatch(/together/);
  });

  it('rejects an unknown member', () => {
    const state = revealed();
    expect(run(state, { kind: 'movePartyMember', memberId: 'nobody', cell: at(1, 1) }).rejected)
      .toBe('no such member');
  });

  it('does not write a save when the toggle is already where it is asked to be', () => {
    const state = revealed();
    const result = run(state, { kind: 'setPartyTogether', together: true });
    expect(result.rejected).toBeUndefined();
    expect(result.effects).toEqual([]);
  });
});

describe('the permission line (R-136)', () => {
  it('lets the table seat move the party and its members', () => {
    let state = revealed();
    expect(run(state, { kind: 'moveParty', cell: at(4, 4) }, 'table').rejected).toBeUndefined();

    state = run(state, { kind: 'moveParty', cell: at(4, 4) }).state;
    state = run(state, { kind: 'setPartyTogether', together: false }, 'table').state;
    const memberId = state.active!.party[0]!.id;
    expect(run(state, { kind: 'movePartyMember', memberId, cell: at(2, 2) }, 'table').rejected)
      .toBeUndefined();
  });

  it('still refuses the table seat everything about the world', () => {
    const state = revealed();
    for (const intent of [
      { kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: false },
      { kind: 'paintTerrain', cx: ORIGIN.cx, cz: ORIGIN.cz, x: 0, z: 0, terrainId: 'terrain:rock' },
      { kind: 'addPoi', cell: at(1, 1), name: 'Theirs now' },
      { kind: 'addMember' },
    ] as Intent[]) {
      expect(run(state, intent, 'table').rejected).toBe('only the GM can do that');
    }
  });

  it('opens exactly the party intents and nothing else', () => {
    // Driven off the schema so a new intent has to be classified (R-18a). If this
    // fails, something was added without deciding which side of R-136 it is on.
    const open = new Set(['moveParty', 'movePartyMember', 'setPartyTogether']);
    const state = revealed();
    for (const option of IntentSchema.options) {
      const kind = option.shape.kind.value as Intent['kind'];
      if (open.has(kind)) continue;
      const rejection = run(state, { kind } as Intent, 'table').rejected;
      expect(rejection, `${kind} was not refused for the table seat`).toBe('only the GM can do that');
    }
  });
});

describe('what the table is told', () => {
  it('receives the party position, and only that, out of the save', () => {
    let state = revealed();
    state = run(state, { kind: 'moveParty', cell: at(4, 4) }).state;
    const view = tableView(state);

    expect(view.role).toBe('table');
    expect(Object.keys(view).sort()).toEqual(['campaign', 'placement', 'role']);
    expect(view.placement).toMatchObject({ together: true, at: at(4, 4) });
    // Discovery stays behind: which chunks are Known is itself the secret.
    expect(JSON.stringify(view)).not.toContain('discovery');
  });

  it('sends no pawns when no campaign is on the table', () => {
    expect(tableView({ campaigns: [], active: null, activeSave: null }).placement).toBeNull();
  });
});
