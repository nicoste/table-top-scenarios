// Which cell a click meant (R-87c). Pure, so testable — see the note at the top
// of `render/src/picking` for why this is not covered by R-23's exemption.

import { describe, it, expect } from 'vitest';
import { intendedCell } from '@tt/render';
import type { Campaign, MemberId, Placement, WorldCell } from '@tt/domain';
import {
  createCampaign, addPlace, createMember, emptyPlacement, withGroupAt, withMemberAt, scattered,
} from '@tt/domain';

const cell = (x: number, z: number): WorldCell => ({ cx: 15, cz: 15, x, z });

/** A campaign with one place at 5,5 and a two-person roster. */
function seeded(): Campaign {
  const base = createCampaign('Ashfall');
  const withSecond = { ...base, party: [...base.party, createMember(base.party)] };
  return { ...withSecond, places: addPlace(withSecond.places, cell(5, 5), 'Ashfall Keep') };
}

const placed = (at: WorldCell): Placement => withGroupAt(emptyPlacement(), at);

describe('nothing under the pointer but ground', () => {
  it('is the cell the ray found', () => {
    expect(intendedCell({ pawn: null, placeId: null, rayCell: cell(2, 2) }, seeded(), emptyPlacement()))
      .toEqual(cell(2, 2));
  });

  it('is nothing when the ray found nothing', () => {
    expect(intendedCell({ pawn: null, placeId: null, rayCell: null }, seeded(), emptyPlacement()))
      .toBeNull();
  });
});

describe('a marker does not block its own cell (D-163)', () => {
  it('reports the place cell, not the ground the ray reached behind it', () => {
    // This is the bug: a marker stands above its ground, so in an angled view
    // the ray passes over it and lands on the neighbour. Painting a marker's
    // cell would have painted the cell behind it.
    const campaign = seeded();
    const placeId = campaign.places[0]!.id;
    const behind = cell(6, 6);

    expect(intendedCell({ pawn: null, placeId, rayCell: behind }, campaign, emptyPlacement()))
      .toEqual(cell(5, 5));
  });

  it('falls back to the ray for a place id that is not in this campaign', () => {
    const behind = cell(6, 6);
    expect(intendedCell({ pawn: null, placeId: 'poi_ghost', rayCell: behind }, seeded(), emptyPlacement()))
      .toEqual(behind);
  });
});

describe('a pawn does not block its own cell either', () => {
  it('reports where the party is standing', () => {
    const campaign = seeded();
    const placement = placed(cell(9, 9));
    expect(intendedCell(
      { pawn: { memberId: null }, placeId: null, rayCell: cell(1, 1) },
      campaign,
      placement,
    )).toEqual(cell(9, 9));
  });

  it('reports the right member when the party is separated', () => {
    const campaign = seeded();
    const [first, second] = campaign.party;
    let placement = scattered(placed(cell(9, 9)), campaign.party);
    placement = withMemberAt(placement, second!.id as MemberId, cell(3, 4));

    expect(intendedCell(
      { pawn: { memberId: second!.id }, placeId: null, rayCell: cell(1, 1) },
      campaign,
      placement,
    )).toEqual(cell(3, 4));
    expect(intendedCell(
      { pawn: { memberId: first!.id }, placeId: null, rayCell: cell(1, 1) },
      campaign,
      placement,
    )).toEqual(cell(9, 9));
  });

  it('prefers the pawn when a pawn and a marker are both hit', () => {
    // The pawn is drawn on top, so it is the thing the pointer is on.
    const campaign = seeded();
    const placement = placed(cell(9, 9));
    expect(intendedCell(
      { pawn: { memberId: null }, placeId: campaign.places[0]!.id, rayCell: cell(1, 1) },
      campaign,
      placement,
    )).toEqual(cell(9, 9));
  });

  it('falls back to the ray when the party is not on the map', () => {
    expect(intendedCell(
      { pawn: { memberId: null }, placeId: null, rayCell: cell(1, 1) },
      seeded(),
      emptyPlacement(),
    )).toEqual(cell(1, 1));
  });
});

describe('no campaign open', () => {
  it('cannot resolve a marker, so it answers with the ray', () => {
    expect(intendedCell({ pawn: null, placeId: 'poi_x', rayCell: cell(7, 7) }, null, null))
      .toEqual(cell(7, 7));
  });
});
