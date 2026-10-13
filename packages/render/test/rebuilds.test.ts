// What has to be rebuilt when the world changes, and what does not (R-69).
//
// Twice in one round the stage threw away something it could have kept, for
// the same reason both times: it asked *"did the world change"* when the
// question was *"did what I draw change"* (D-290, D-292). Neither failure
// looks wrong on screen — the markers and the trees come back identical — so
// nothing would have caught them but the cost, and the caption that blinked.
//
// The builders need three.js and R-23 exempts them, so the rule is extracted
// to a pure signature and tested here instead (R-23b).

import { describe, it, expect } from 'vitest';
import {
  createCampaign, ORIGIN, chunkAt, replaceChunk, addPlace, registryId,
  paintGround, paintCover, setHeight,
} from '@tt/domain';
import type { Campaign, CoverId, MarkerId, SwatchId } from '@tt/domain';
import { coverSignature, markerSignature } from '@tt/render';

const TREES = 'cover:trees' as CoverId;
const PINES = 'cover:pines' as CoverId;
const ROCK = 'material:mineral' as SwatchId;
const VILLAGE = registryId<'MarkerId'>('marker', 'village') as MarkerId;

/** A campaign with one place and two covered cells, away from each other. */
function built(): Campaign {
  const campaign = createCampaign('Ashfall');
  let chunk = chunkAt(campaign.world, ORIGIN)!;
  chunk = paintCover(chunk, 4, 4, TREES);
  chunk = paintCover(chunk, 20, 20, PINES);
  return {
    ...campaign,
    world: replaceChunk(campaign.world, chunk),
    places: addPlace(campaign.places, { ...ORIGIN, x: 10, z: 10 }, 'Toll', VILLAGE),
  };
}

const withChunk = (campaign: Campaign, next: NonNullable<ReturnType<typeof chunkAt>>): Campaign =>
  ({ ...campaign, world: replaceChunk(campaign.world, next) });

describe('a painted coast moves no tree (D-292)', () => {
  it('keeps the signature when only the ground changed', () => {
    const campaign = built();
    const before = coverSignature(campaign.world);
    // Far from either cover, which is the GM's own observation: the distance
    // never mattered, because the rebuild was never about distance.
    const painted = withChunk(campaign, paintGround(chunkAt(campaign.world, ORIGIN)!, 25, 3, ROCK));
    expect(coverSignature(painted.world)).toBe(before);
    // And right underneath one, which also changes nothing a cover is drawn from.
    const under = withChunk(campaign, paintGround(chunkAt(campaign.world, ORIGIN)!, 4, 4, ROCK));
    expect(coverSignature(under.world)).toBe(before);
  });

  it('changes when a cover is planted, moved or cleared', () => {
    const campaign = built();
    const before = coverSignature(campaign.world);
    const planted = withChunk(campaign, paintCover(chunkAt(campaign.world, ORIGIN)!, 7, 7, TREES));
    expect(coverSignature(planted.world)).not.toBe(before);
    const cleared = withChunk(campaign, paintCover(chunkAt(campaign.world, ORIGIN)!, 4, 4, null));
    expect(coverSignature(cleared.world)).not.toBe(before);
    const swapped = withChunk(campaign, paintCover(chunkAt(campaign.world, ORIGIN)!, 4, 4, PINES));
    expect(coverSignature(swapped.world)).not.toBe(before);
  });

  it('changes when the ground under a cover is raised, because it stands on it', () => {
    const campaign = built();
    const before = coverSignature(campaign.world);
    const raised = withChunk(campaign, setHeight(chunkAt(campaign.world, ORIGIN)!, 4, 4, 6));
    expect(coverSignature(raised.world)).not.toBe(before);
    // A height change where nothing is growing is still nothing to redraw.
    const elsewhere = withChunk(campaign, setHeight(chunkAt(campaign.world, ORIGIN)!, 25, 3, 6));
    expect(coverSignature(elsewhere.world)).toBe(before);
  });
});

describe('a painted coast moves no marker either (D-290)', () => {
  it('keeps the signature when only the ground changed', () => {
    const campaign = built();
    const before = markerSignature(campaign);
    const painted = withChunk(campaign, paintGround(chunkAt(campaign.world, ORIGIN)!, 25, 3, ROCK));
    expect(markerSignature(painted)).toBe(before);
  });

  it('changes when the ground under the place is raised', () => {
    // A marker stands on the land: raise it and the marker comes up with it.
    const campaign = built();
    const before = markerSignature(campaign);
    const raised = withChunk(campaign, setHeight(chunkAt(campaign.world, ORIGIN)!, 10, 10, 9));
    expect(markerSignature(raised)).not.toBe(before);
  });

  it('changes when a place is added', () => {
    const campaign = built();
    const before = markerSignature(campaign);
    const more = {
      ...campaign,
      places: addPlace(campaign.places, { ...ORIGIN, x: 2, z: 2 }, 'Ford', VILLAGE),
    };
    expect(markerSignature(more)).not.toBe(before);
  });
});
