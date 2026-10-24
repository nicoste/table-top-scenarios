// The world's pawns are kept while nothing they draw has changed (D-366), as
// the place markers are (D-290): a rule about when to rebuild, so testable
// under R-23b, though what a pawn looks like is not.

import { describe, it, expect } from 'vitest';
import type { Campaign, Placement, WorldCell } from '@tt/domain';
import {
  createCampaign, addPlace, createMember, emptyPlacement, withGroupAt, withMemberAt, scattered,
  setHeightArea, toGlobal,
} from '@tt/domain';
import { pawnSignature } from '../src/pawns/index.js';

const cell = (x: number, z: number): WorldCell => ({ cx: 15, cz: 15, x, z });

/** Two of the party, standing apart at 4,4 and 9,9. */
function seeded(): { campaign: Campaign; placement: Placement } {
  const base = createCampaign('Ashfall');
  const campaign = { ...base, party: [...base.party, createMember(base.party)] };
  const [a, b] = campaign.party;
  let placement = scattered(withGroupAt(emptyPlacement(), cell(4, 4)), campaign.party);
  placement = withMemberAt(withMemberAt(placement, a!.id, cell(4, 4)), b!.id, cell(9, 9));
  return { campaign, placement };
}

const raised = (campaign: Campaign, at: WorldCell, height: number): Campaign => ({
  ...campaign, world: setHeightArea(campaign.world, toGlobal({ cx: at.cx, cz: at.cz }, at.x, at.z), 1, height),
});

describe('pawns kept while nothing they draw has changed (D-366)', () => {
  it('a fresh copy of the same campaign and placement draws the same pawns', () => {
    const { campaign, placement } = seeded();
    const copy = { ...campaign, party: campaign.party.map((m) => ({ ...m })) };
    expect(pawnSignature(copy, { ...placement, members: new Map(placement.members) })).toBe(pawnSignature(campaign, placement));
  });

  it('nor does anything they do not draw: a place, the ground away from them', () => {
    const { campaign, placement } = seeded();
    const before = pawnSignature(campaign, placement);
    expect(pawnSignature({ ...campaign, places: addPlace(campaign.places, cell(12, 12), 'Keep') }, placement)).toBe(before);
    expect(pawnSignature(raised(campaign, cell(20, 20), 3), placement)).toBe(before);
  });

  it('but a name, a move, or the ground under one of them does', () => {
    const { campaign, placement } = seeded();
    const before = pawnSignature(campaign, placement);
    const renamed = { ...campaign, party: campaign.party.map((m, i) => (i === 0 ? { ...m, name: 'Aldra' } : m)) };
    expect(pawnSignature(renamed, placement)).not.toBe(before);
    expect(pawnSignature(campaign, withMemberAt(placement, campaign.party[0]!.id, cell(5, 4)))).not.toBe(before);
    const under = raised(campaign, cell(9, 9), 3);
    expect(pawnSignature(under, placement), 'the ground was raised under a pawn').not.toBe(before);
  });
});
