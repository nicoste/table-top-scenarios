// Undo over authored content (D-169, D-170).
//
// Driven through `apply` rather than against the history helpers alone, because
// the interesting part is the boundary hook: what counts as an edit, what resets
// the history, and what a drag collapses into.

import { describe, it, expect } from 'vitest';
import { apply, emptyHistory, MAX_HISTORY } from '@tt/sim';
import { viewFor } from '@tt/protocol';
import type { GmView, HostState, Intent } from '@tt/protocol';
import { createCampaign, createLiveSave, columnAt, chunkAt, ORIGIN } from '@tt/domain';

const NOW = '2026-01-01T00:00:00.000Z';
const run = (s: HostState, i: Intent, role: 'gm' | 'table' = 'gm') => apply(s, role, i, NOW);
const at = (x: number, z: number) => ({ cx: ORIGIN.cx, cz: ORIGIN.cz, x, z });

function open(): HostState {
  const campaign = createCampaign('Ashfall');
  return {
    campaigns: [{ id: campaign.id, name: campaign.name }],
    active: campaign,
    activeSave: createLiveSave(campaign, NOW),
    history: emptyHistory(),
  };
}

const terrainAt = (state: HostState, x: number, z: number) => {
  const chunk = chunkAt(state.active!.world, ORIGIN)!;
  return columnAt(chunk, x, z)!.terrainId as string;
};
const gm = (state: HostState) => viewFor('gm', state) as GmView;

describe('an edit can be taken back', () => {
  it('restores the terrain a paint replaced', () => {
    const start = open();
    const before = terrainAt(start, 4, 4);
    const painted = run(start, { kind: 'paintTerrain', ...at(4, 4), terrainId: 'terrain:rock' }).state;
    expect(terrainAt(painted, 4, 4)).toBe('terrain:rock');

    const undoneState = run(painted, { kind: 'undo' }).state;
    expect(terrainAt(undoneState, 4, 4)).toBe(before);
  });

  it('asks the host to persist the result, so undo survives a reload', () => {
    const painted = run(open(), { kind: 'paintTerrain', ...at(4, 4), terrainId: 'terrain:rock' }).state;
    expect(run(painted, { kind: 'undo' }).effects.map((e) => e.kind)).toEqual(['saveCampaign']);
  });

  it('redoes what it undid', () => {
    const painted = run(open(), { kind: 'paintTerrain', ...at(4, 4), terrainId: 'terrain:rock' }).state;
    const back = run(painted, { kind: 'undo' }).state;
    const forward = run(back, { kind: 'redo' }).state;
    expect(terrainAt(forward, 4, 4)).toBe('terrain:rock');
  });

  it('refuses with a reason rather than silently doing nothing (R-18)', () => {
    expect(run(open(), { kind: 'undo' }).rejected).toBe('nothing to undo');
    expect(run(open(), { kind: 'redo' }).rejected).toBe('nothing to redo');
  });

  it('drops the redo branch once you edit again', () => {
    let state = run(open(), { kind: 'paintTerrain', ...at(4, 4), terrainId: 'terrain:rock' }).state;
    state = run(state, { kind: 'undo' }).state;
    state = run(state, { kind: 'paintTerrain', ...at(9, 9), terrainId: 'terrain:snow' }).state;
    // Diverged: the abandoned branch is not reachable any more.
    expect(run(state, { kind: 'redo' }).rejected).toBe('nothing to redo');
  });
});

describe('a drag is one action (D-170)', () => {
  const strokePaint = (x: number, z: number, stroke?: string): Intent => ({
    kind: 'paintTerrain', ...at(x, z), terrainId: 'terrain:rock', ...(stroke ? { stroke } : {}),
  });

  it('collapses every cell of one stroke into a single undo', () => {
    const start = open();
    let state = start;
    for (let x = 0; x < 6; x += 1) state = run(state, strokePaint(x, 0, 's1')).state;
    for (let x = 0; x < 6; x += 1) expect(terrainAt(state, x, 0)).toBe('terrain:rock');

    state = run(state, { kind: 'undo' }).state;
    // One press, the whole stroke gone — not one cell at a time.
    for (let x = 0; x < 6; x += 1) expect(terrainAt(state, x, 0)).toBe(terrainAt(start, x, 0));
    expect(gm(state).canUndo).toBe(false);
  });

  it('keeps separate strokes separate', () => {
    let state = open();
    state = run(state, strokePaint(0, 0, 's1')).state;
    state = run(state, strokePaint(1, 1, 's2')).state;

    state = run(state, { kind: 'undo' }).state;
    expect(terrainAt(state, 1, 1)).not.toBe('terrain:rock');
    expect(terrainAt(state, 0, 0)).toBe('terrain:rock');
  });

  it('does not collapse two untagged edits into one', () => {
    // The trap: both carry `stroke: undefined`, and a naive equality check would
    // treat consecutive single clicks as one gesture.
    let state = open();
    state = run(state, strokePaint(0, 0)).state;
    state = run(state, strokePaint(1, 1)).state;

    state = run(state, { kind: 'undo' }).state;
    expect(terrainAt(state, 1, 1)).not.toBe('terrain:rock');
    expect(terrainAt(state, 0, 0)).toBe('terrain:rock');
  });

  it('cannot coalesce across an undo', () => {
    let state = open();
    state = run(state, strokePaint(0, 0, 's1')).state;
    state = run(state, { kind: 'undo' }).state;
    // Same stroke id arriving again must record history, or this edit would be
    // unrecoverable.
    state = run(state, strokePaint(5, 5, 's1')).state;
    expect(gm(state).canUndo).toBe(true);
    expect(terrainAt(run(state, { kind: 'undo' }).state, 5, 5)).not.toBe('terrain:rock');
  });
});

describe('what counts as an edit', () => {
  it('records a place, its notes, and roster changes — not just terrain', () => {
    let state = open();
    state = run(state, { kind: 'addPlace', cell: at(3, 3), name: 'Keep' }).state;
    expect(state.active!.places).toHaveLength(1);

    state = run(state, { kind: 'undo' }).state;
    expect(state.active!.places).toHaveLength(0);

    state = run(state, { kind: 'addMember' }).state;
    const party = state.active!.party.length;
    expect(run(state, { kind: 'undo' }).state.active!.party).toHaveLength(party - 1);
  });

  it('ignores an intent that changed nothing', () => {
    // paint the same terrain twice: identity-preserving edits mean the second
    // returns the same campaign, so there is nothing to take back (R-165).
    let state = run(open(), { kind: 'paintTerrain', ...at(4, 4), terrainId: 'terrain:rock' }).state;
    state = run(state, { kind: 'paintTerrain', ...at(4, 4), terrainId: 'terrain:rock' }).state;
    state = run(state, { kind: 'undo' }).state;
    expect(terrainAt(state, 4, 4)).not.toBe('terrain:rock');
    expect(gm(state).canUndo).toBe(false);
  });

  it('leaves play state alone — discovery is not undoable (D-147)', () => {
    const state = run(open(), { kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: true }).state;
    expect(state.activeSave!.discovery.chunks.size).toBe(1);
    // Nothing authored changed, so there is nothing on the stack at all.
    expect(run(state, { kind: 'undo' }).rejected).toBe('nothing to undo');
  });

  it('is refused for the table seat', () => {
    const painted = run(open(), { kind: 'paintTerrain', ...at(4, 4), terrainId: 'terrain:rock' }).state;
    expect(run(painted, { kind: 'undo' }, 'table').rejected).toBe('only the GM can do that');
  });
});

describe('history belongs to one campaign', () => {
  it('starts again when a different campaign is opened', () => {
    let state = run(open(), { kind: 'paintTerrain', ...at(4, 4), terrainId: 'terrain:rock' }).state;
    expect(gm(state).canUndo).toBe(true);

    state = run(state, { kind: 'closeCampaign' }).state;
    // cmd+z must not reach back into a world the GM is no longer looking at.
    expect(gm(state).canUndo).toBe(false);
    expect(state.history.past).toHaveLength(0);
  });

  it('starts again on create, which opens a different campaign', () => {
    let state = run(open(), { kind: 'paintTerrain', ...at(4, 4), terrainId: 'terrain:rock' }).state;
    state = run(state, { kind: 'createCampaign', name: 'Elsewhere' }).state;
    expect(gm(state).canUndo).toBe(false);
  });
});

describe('what the GM console is told', () => {
  it('gets two booleans and never the history itself', () => {
    // It holds whole campaigns; serialising it would put a world on the wire per
    // entry, fifty times over.
    const painted = run(open(), { kind: 'paintTerrain', ...at(4, 4), terrainId: 'terrain:rock' }).state;
    const view = gm(painted);
    expect(view.canUndo).toBe(true);
    expect(view.canRedo).toBe(false);
    expect(Object.keys(view)).not.toContain('history');
    expect(JSON.stringify(view)).not.toContain('"past"');
  });
});

describe('the stack is bounded', () => {
  it('forgets the oldest rather than growing forever', () => {
    let state = open();
    // Alternating terrain on one cell, so every intent is a real change. Cycling
    // cells instead would repaint what is already painted, and those are
    // correctly no-ops that record nothing — which is how this test first failed.
    for (let i = 0; i < MAX_HISTORY + 10; i += 1) {
      const terrainId = i % 2 === 0 ? 'terrain:rock' : 'terrain:snow';
      state = run(state, { kind: 'paintTerrain', ...at(4, 4), terrainId }).state;
    }
    expect(state.history.past).toHaveLength(MAX_HISTORY);
  });
});
