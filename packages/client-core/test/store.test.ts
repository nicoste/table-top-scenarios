// What survives from one view to the next (R-19a, D-270). Every message is
// parsed from text, so these build the next view the same way: a fresh copy,
// equal by value and new by identity, as it arrives off the socket.

import { describe, it, expect } from 'vitest';
import { keepUnchanged } from '@tt/client-core';

const fresh = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const view = {
  role: 'table',
  campaign: {
    id: 'campaign_a',
    places: [{
      id: 'place_a',
      pois: [{ id: 'poi_a', map: { size: { x: 96, z: 96 }, palette: ['material:stone'], runs: [0, 40, 1, 12] } }],
    }],
  },
  lighting: { angle: 35, sun: 1, ambience: { colour: '#ffffff', strength: 0.4 } },
  tokens: { member_a: { x: 4, y: 1, z: 7 } },
};

describe('an unchanged part of a view keeps its identity (R-19a)', () => {
  it('hands back the map the screen already holds when only the hour changed', () => {
    const next = fresh(view);
    next.lighting.angle = 36;
    const kept = keepUnchanged(view, next);
    // The map came back equal, so it is the same map: nothing rebuilds.
    expect(kept.campaign).toBe(view.campaign);
    expect(kept.campaign.places[0]?.pois[0]?.map).toBe(view.campaign.places[0]?.pois[0]?.map);
    expect(kept.tokens).toBe(view.tokens);
    // And the hour is the new one.
    expect(kept.lighting).not.toBe(view.lighting);
    expect(kept.lighting.angle).toBe(36);
  });

  it('makes a new object of everything above a change and of nothing beside it', () => {
    const next = fresh(view);
    next.tokens.member_a.x = 5;
    const kept = keepUnchanged(view, next);
    expect(kept).not.toBe(view);
    expect(kept.tokens).not.toBe(view.tokens);
    expect(kept.tokens.member_a).toEqual({ x: 5, y: 1, z: 7 });
    expect(kept.campaign).toBe(view.campaign);
    expect(kept.lighting).toBe(view.lighting);
  });

  it('keeps the whole view when nothing changed', () => {
    expect(keepUnchanged(view, fresh(view))).toBe(view);
  });

  it('counts a longer list or a new field as a change', () => {
    const longer = fresh(view);
    longer.campaign.places[0]?.pois[0]?.map.runs.push(2, 3);
    expect(keepUnchanged(view, longer).campaign).not.toBe(view.campaign);

    const wider = { ...fresh(view), extra: true };
    const kept = keepUnchanged(view, wider);
    expect(kept).not.toBe(view);
    expect(kept.campaign).toBe(view.campaign);
  });

  it('counts a missing field as a change', () => {
    const { tokens: _gone, ...without } = fresh(view);
    const kept = keepUnchanged(view, without);
    expect(kept).not.toBe(view);
    expect('tokens' in kept).toBe(false);
  });

  it('takes the first view as it comes, and changes neither', () => {
    const next = fresh(view);
    expect(keepUnchanged(null, next)).toBe(next);

    const before = fresh(view);
    const after = fresh(view);
    after.lighting.sun = 0;
    keepUnchanged(before, after);
    expect(before).toEqual(view);
    expect(after.lighting.sun).toBe(0);
  });
});
