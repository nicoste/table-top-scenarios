import { describe, it, expect } from 'vitest';
import { apply, emptyHistory } from '@tt/sim';
import { parseIntent, viewFor, IntentSchema } from '@tt/protocol';
import type { HostState, Intent } from '@tt/protocol';
import { chunkAt, columnAt, createCampaign, createLiveSave, liveSaveId, ORIGIN } from '@tt/domain';

const NOW = '2026-01-01T00:00:00.000Z';
const empty: HostState = { campaigns: [], active: null, activeSave: null, history: emptyHistory() };

function withCampaign(): HostState {
  const campaign = createCampaign('Ashfall');
  const live = createLiveSave(campaign, NOW);
  return {
    campaigns: [{ id: campaign.id, name: campaign.name }],
    active: campaign,
    activeSave: live,
    history: emptyHistory(),
  };
}
const run = (state: HostState, intent: Intent, role: 'gm' | 'table' = 'gm') => apply(state, role, intent, NOW);

describe('permissions (R-3, R-4)', () => {
  const mutations: Intent[] = [
    { kind: 'createCampaign', name: 'x' },
    { kind: 'addChunk', cx: 10, cz: 11 },
    { kind: 'paintGround', cx: 10, cz: 10, x: 1, z: 1, ground: 'material:grass' },
    { kind: 'setHeight', cx: 10, cz: 10, x: 1, z: 1, height: 3 },
    { kind: 'addMember' },
    { kind: 'removeMember', id: 'whatever' },
  ];

  it('rejects every mutation from the table display, with a reason (R-18)', () => {
    const state = withCampaign();
    for (const intent of mutations) {
      const result = run(state, intent, 'table');
      expect(result.rejected, intent.kind).toBeTruthy();
      expect(result.state).toBe(state);
      expect(result.effects).toEqual([]);
    }
  });
});

describe('purity (R-97)', () => {
  it('never mutates the state it was given', () => {
    const state = withCampaign();
    const before = JSON.stringify([...(state.active?.world.chunks.keys() ?? [])]);
    run(state, { kind: 'setHeight', cx: ORIGIN.cx, cz: ORIGIN.cz, x: 2, z: 2, height: 5 });
    expect(columnAt(chunkAt(state.active!.world, ORIGIN)!, 2, 2)?.height).toBe(0);
    expect(JSON.stringify([...state.active!.world.chunks.keys()])).toBe(before);
  });

  it('is deterministic for the same input', () => {
    const state = withCampaign();
    const intent: Intent = { kind: 'paintGround', cx: ORIGIN.cx, cz: ORIGIN.cz, x: 4, z: 4, ground: 'material:grass' };
    const a = run(state, intent);
    const b = run(state, intent);
    expect(JSON.stringify(viewFor('table', a.state))).toBe(JSON.stringify(viewFor('table', b.state)));
  });
});

describe('campaigns', () => {
  it('creates one and opens it, asking the host to save it', () => {
    const result = run(empty, { kind: 'createCampaign', name: 'Ashfall' });
    expect(result.rejected).toBeUndefined();
    expect(result.state.active?.name).toBe('Ashfall');
    expect(result.state.campaigns).toHaveLength(1);
    // A campaign is never created without its save (D-147).
    expect(result.effects.map((e) => e.kind)).toEqual(['saveCampaign', 'saveSave']);
    expect(result.state.activeSave?.campaignId).toBe(result.state.active?.id);
    expect(result.state.activeSave?.id).toBe(liveSaveId(result.state.active!.id));
  });

  it('refuses a blank name', () => {
    expect(run(empty, { kind: 'createCampaign', name: '   ' }).rejected).toBeTruthy();
  });

  it('asks the host to load rather than loading itself (R-98)', () => {
    const state = withCampaign();
    const id = state.campaigns[0]!.id;
    const result = run({ ...state, active: null }, { kind: 'openCampaign', id });
    expect(result.effects).toEqual([{ kind: 'loadCampaign', id }]);
  });

  it('rejects opening a campaign it does not know', () => {
    expect(run(empty, { kind: 'openCampaign', id: 'nope' }).rejected).toBeTruthy();
  });

  it('rejects world edits when nothing is open', () => {
    expect(run(empty, { kind: 'addChunk', cx: 0, cz: 0 }).rejected).toBe('no campaign is open');
  });
});

describe('the two tools (R-88, R-89)', () => {
  it('paints the ground and asks for a save', () => {
    const state = withCampaign();
    const result = run(state, { kind: 'paintGround', cx: ORIGIN.cx, cz: ORIGIN.cz, x: 3, z: 3, ground: 'material:grass' });
    expect(result.rejected).toBeUndefined();
    expect(columnAt(chunkAt(result.state.active!.world, ORIGIN)!, 3, 3)?.ground).toBe('material:grass');
    expect(result.effects).toHaveLength(1);
  });

  it('rejects a ground that is not in the registry', () => {
    const state = withCampaign();
    const result = run(state, { kind: 'paintGround', cx: ORIGIN.cx, cz: ORIGIN.cz, x: 3, z: 3, ground: 'material:unobtanium' });
    expect(result.rejected).toMatch(/unknown ground/);
  });

  it('raises and lowers, clamping at sea level', () => {
    let state = withCampaign();
    state = run(state, { kind: 'raiseHeight', cx: ORIGIN.cx, cz: ORIGIN.cz, x: 1, z: 1, delta: 3 }).state;
    expect(columnAt(chunkAt(state.active!.world, ORIGIN)!, 1, 1)?.height).toBe(3);
    state = run(state, { kind: 'raiseHeight', cx: ORIGIN.cx, cz: ORIGIN.cz, x: 1, z: 1, delta: -10 }).state;
    expect(columnAt(chunkAt(state.active!.world, ORIGIN)!, 1, 1)?.height).toBe(0);
  });

  it('does not ask for a save when nothing changed', () => {
    const state = withCampaign();
    const result = run(state, { kind: 'setHeight', cx: ORIGIN.cx, cz: ORIGIN.cz, x: 1, z: 1, height: 0 });
    expect(result.effects).toEqual([]);
    expect(result.state).toBe(state);
  });

  it('rejects edits to a chunk that does not exist', () => {
    const state = withCampaign();
    expect(run(state, { kind: 'setHeight', cx: 0, cz: 0, x: 1, z: 1, height: 2 }).rejected).toBeTruthy();
  });
});

describe('creating chunks (R-79)', () => {
  it('accepts a slot touching an existing chunk', () => {
    const state = withCampaign();
    const result = run(state, { kind: 'addChunk', cx: ORIGIN.cx + 1, cz: ORIGIN.cz });
    expect(result.rejected).toBeUndefined();
    expect(result.state.active!.world.chunks.size).toBe(2);
  });

  it('accepts a diagonal slot', () => {
    const state = withCampaign();
    const result = run(state, { kind: 'addChunk', cx: ORIGIN.cx + 1, cz: ORIGIN.cz + 1 });
    expect(result.rejected).toBeUndefined();
    expect(result.state.active!.world.chunks.size).toBe(2);
  });

  it('refuses a floating chunk', () => {
    const state = withCampaign();
    expect(run(state, { kind: 'addChunk', cx: ORIGIN.cx + 5, cz: ORIGIN.cz }).rejected).toMatch(/touch/);
  });

  it('refuses a slot that is already occupied', () => {
    const state = withCampaign();
    expect(run(state, { kind: 'addChunk', cx: ORIGIN.cx, cz: ORIGIN.cz }).rejected).toBeTruthy();
  });
});

describe('the party roster', () => {
  it('adds and edits members', () => {
    let state = withCampaign();
    state = run(state, { kind: 'addMember', name: 'Vex' }).state;
    expect(state.active!.party).toHaveLength(2);
    const id = state.active!.party[1]!.id;
    state = run(state, { kind: 'editMember', id, visionRange: 20 }).state;
    expect(state.active!.party[1]?.visionRange).toBe(20);
  });

  it('refuses to empty the roster', () => {
    const state = withCampaign();
    const id = state.active!.party[0]!.id;
    expect(run(state, { kind: 'removeMember', id }).rejected).toMatch(/cannot be empty/);
  });

  it('rejects an unknown member id', () => {
    const state = withCampaign();
    expect(run(state, { kind: 'editMember', id: 'ghost', name: 'x' }).rejected).toBeTruthy();
  });
});

describe('the wire boundary (R-17)', () => {
  it('rejects malformed intents before they reach sim', () => {
    expect(parseIntent({ kind: 'nope' }).ok).toBe(false);
    expect(parseIntent({ kind: 'setHeight', cx: 0, cz: 0, x: 99, z: 0, height: 1 }).ok).toBe(false);
    expect(parseIntent({ kind: 'paintGround', cx: 0, cz: 0, x: 0, z: 0, ground: 'NOT VALID' }).ok).toBe(false);
    expect(parseIntent({ kind: 'createCampaign', name: '' }).ok).toBe(false);
  });

  it('accepts a well-formed intent', () => {
    const parsed = parseIntent({ kind: 'raiseHeight', cx: 1, cz: 2, x: 3, z: 4, delta: -1 });
    expect(parsed.ok).toBe(true);
  });
});

describe('the role filter is the only path to a screen (R-19)', () => {
  it('gives the GM the campaign list and connect addresses', () => {
    const view = viewFor('gm', withCampaign(), ['http://192.168.1.5:8080/table']);
    expect(view.role).toBe('gm');
    expect(view).toHaveProperty('campaigns');
    expect(view).toHaveProperty('connect');
  });

  it('gives the table display no campaign list and no connect addresses (R-94)', () => {
    const view = viewFor('table', withCampaign(), ['http://192.168.1.5:8080/table']);
    expect(view.role).toBe('table');
    expect(view).not.toHaveProperty('campaigns');
    expect(view).not.toHaveProperty('connect');
    expect(JSON.stringify(view)).not.toContain('192.168');
  });
});

describe('duplicating and deleting campaigns', () => {
  it('refuses to duplicate a campaign that is not open (R-97)', () => {
    const state = withCampaign();
    expect(run({ ...state, active: null }, { kind: 'duplicateCampaign', id: state.campaigns[0]!.id }).rejected)
      .toMatch(/open the campaign/);
  });

  it('duplicates the open campaign and returns to the list', () => {
    const state = withCampaign();
    const result = run(state, { kind: 'duplicateCampaign', id: state.active!.id });
    expect(result.rejected).toBeUndefined();
    expect(result.state.campaigns).toHaveLength(2);
    expect(result.state.campaigns[1]?.name).toBe('Ashfall (copy)');
    expect(result.state.active).toBeNull();
    expect(result.state.activeSave).toBeNull();
    // The copy gets its own fresh live save, with no discovery carried over.
    expect(result.effects.map((e) => e.kind)).toEqual(['saveCampaign', 'saveSave']);
  });

  it('never lets a copy share an id with its source', () => {
    const state = withCampaign();
    const saved = run(state, { kind: 'duplicateCampaign', id: state.active!.id }).effects[0];
    if (saved?.kind !== 'saveCampaign') throw new Error('expected a save');
    expect(saved.campaign.id).not.toBe(state.active!.id);
    for (const m of saved.campaign.party) {
      expect(state.active!.party.map((x) => x.id)).not.toContain(m.id);
    }
  });

  it('deletes a campaign and asks the host to remove it', () => {
    const state = withCampaign();
    const id = state.campaigns[0]!.id;
    const result = run(state, { kind: 'deleteCampaign', id });
    expect(result.state.campaigns).toEqual([]);
    expect(result.effects).toEqual([{ kind: 'removeCampaign', id }]);
  });

  it('closes the campaign it just deleted rather than leaving a ghost', () => {
    const state = withCampaign();
    const result = run(state, { kind: 'deleteCampaign', id: state.active!.id });
    expect(result.state.active).toBeNull();
  });

  it('leaves a different open campaign alone when deleting', () => {
    const state = withCampaign();
    const other = { ...state, campaigns: [...state.campaigns, { id: 'other', name: 'Other' }] };
    const result = run(other, { kind: 'deleteCampaign', id: 'other' });
    expect(result.state.active).toBe(other.active);
  });

  it('rejects deleting something that does not exist', () => {
    expect(run(withCampaign(), { kind: 'deleteCampaign', id: 'ghost' }).rejected).toBeTruthy();
  });

  it('refuses both from the table display', () => {
    const state = withCampaign();
    expect(run(state, { kind: 'deleteCampaign', id: state.active!.id }, 'table').rejected).toBeTruthy();
    expect(run(state, { kind: 'duplicateCampaign', id: state.active!.id }, 'table').rejected).toBeTruthy();
  });
});

describe('permissions fail closed (R-18a)', () => {
  /**
   * Enumerated from the protocol itself, so a newly added intent fails this test
   * until somebody decides whether the table display may send it. An allow-list
   * of mutations would instead permit it silently.
   */
  const everyIntentKind = (): string[] => {
    const options = (IntentSchema as unknown as { options: { shape: { kind: { value: string } } }[] }).options;
    return options.map((o) => o.shape.kind.value);
  };

  it('covers every intent the protocol defines', () => {
    expect(everyIntentKind().length).toBeGreaterThanOrEqual(22);
  });

  it('lets the table seat past the gate for the party, and nothing else', () => {
    // The whole list, written out rather than derived, because this is the thing
    // a reviewer checks against R-136: the party is the players', the world is
    // the GM's. Every entry here needs an argument. The fourth, `moveToken`,
    // has one: it is where each member stands inside the map the party is in,
    // which is the party's own pawn one surface down (D-259).
    const state = withCampaign();
    const past: string[] = [];
    for (const kind of everyIntentKind()) {
      // A deliberately under-specified payload: we are testing the permission
      // gate, which runs before any field is read.
      const result = apply(state, 'table', { kind } as unknown as Intent, NOW);
      if (result.rejected !== 'only the GM can do that') past.push(kind);
    }
    expect(past.sort())
      .toEqual(['movePartyMember', 'moveParty', 'setPartyTogether', 'moveToken'].sort());
  });

  it('rejects every intent from a spectator, including the party ones', () => {
    // A spectator holds no seat. The party belongs to the players, so moving it
    // takes a player's screen — and the table seat is not exclusive (R-127), so
    // every real player screen has one.
    const state = withCampaign();
    for (const kind of everyIntentKind()) {
      const result = apply(state, 'spectator', { kind } as unknown as Intent, NOW);
      expect(result.rejected, kind).toBe('only the GM can do that');
    }
  });
});
