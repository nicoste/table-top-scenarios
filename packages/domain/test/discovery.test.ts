import { describe, it, expect } from 'vitest';
import {
  emptyDiscovery, isChunkKnown, isPoiRevealed, setChunkKnown, setPoiRevealed,
  setPoisRevealed, isPoiOnTable, discoveryToJSON, discoveryFromJSON,
  createLiveSave, liveSaveId, pruneDiscovery,
  belongsTo, matchesCampaignVersion, withDiscovery, LIVE_LABEL,
  createCampaign, duplicateCampaign,
} from '@tt/domain';
import type { PoiId } from '@tt/domain';

const poi = (id: string, cx = 5, cz = 5) => ({ id: id as PoiId, cell: { cx, cz } });
const AT = '2026-01-01T00:00:00.000Z';

describe('discovery', () => {
  it('starts knowing nothing', () => {
    const d = emptyDiscovery();
    expect(isChunkKnown(d, { cx: 0, cz: 0 })).toBe(false);
    expect(isPoiRevealed(d, 'poi_x' as PoiId)).toBe(false);
  });

  it('marks and unmarks chunks', () => {
    let d = setChunkKnown(emptyDiscovery(), { cx: 3, cz: 4 }, true);
    expect(isChunkKnown(d, { cx: 3, cz: 4 })).toBe(true);
    expect(isChunkKnown(d, { cx: 4, cz: 3 })).toBe(false);
    d = setChunkKnown(d, { cx: 3, cz: 4 }, false);
    expect(isChunkKnown(d, { cx: 3, cz: 4 })).toBe(false);
  });

  it('does not confuse (3,4) with (4,3)', () => {
    const d = setChunkKnown(emptyDiscovery(), { cx: 3, cz: 4 }, true);
    expect(isChunkKnown(d, { cx: 4, cz: 3 })).toBe(false);
  });

  it('is identity-preserving when nothing changes', () => {
    const d = setChunkKnown(emptyDiscovery(), { cx: 1, cz: 1 }, true);
    expect(setChunkKnown(d, { cx: 1, cz: 1 }, true)).toBe(d);
    expect(setChunkKnown(d, { cx: 9, cz: 9 }, false)).toBe(d);
  });

  it('reveals several POIs at once', () => {
    const d = setPoisRevealed(emptyDiscovery(), ['a', 'b', 'c'] as PoiId[], true);
    expect(d.pois.size).toBe(3);
    expect(setPoisRevealed(d, ['a', 'b'] as PoiId[], false).pois.size).toBe(1);
  });

  it('round-trips through JSON', () => {
    let d = setChunkKnown(emptyDiscovery(), { cx: 2, cz: 7 }, true);
    d = setPoiRevealed(d, 'poi_1' as PoiId, true);
    const back = discoveryFromJSON(discoveryToJSON(d));
    expect(isChunkKnown(back, { cx: 2, cz: 7 })).toBe(true);
    expect(isPoiRevealed(back, 'poi_1' as PoiId)).toBe(true);
  });

  it('tolerates a JSON payload missing either field', () => {
    expect(discoveryFromJSON({}).chunks.size).toBe(0);
    expect(discoveryFromJSON({ chunks: ['1,1'] }).pois.size).toBe(0);
  });
});

describe('a POI reaches the table only when BOTH flags allow it (D-132)', () => {
  const inChunk = { cx: 5, cz: 5 };

  it('shows a revealed POI in a known chunk', () => {
    let d = setChunkKnown(emptyDiscovery(), inChunk, true);
    d = setPoiRevealed(d, 'p' as PoiId, true);
    expect(isPoiOnTable(d, poi('p'))).toBe(true);
  });

  it('hides a revealed POI whose chunk is still Unknown — the leak every critic found', () => {
    const d = setPoiRevealed(emptyDiscovery(), 'p' as PoiId, true);
    expect(isChunkKnown(d, inChunk)).toBe(false);
    expect(isPoiOnTable(d, poi('p'))).toBe(false);
  });

  it('hides an unrevealed POI in a known chunk', () => {
    const d = setChunkKnown(emptyDiscovery(), inChunk, true);
    expect(isPoiOnTable(d, poi('p'))).toBe(false);
  });

  it('hides one whose chunk was revealed and then hidden again', () => {
    let d = setChunkKnown(emptyDiscovery(), inChunk, true);
    d = setPoiRevealed(d, 'p' as PoiId, true);
    d = setChunkKnown(d, inChunk, false);
    expect(isPoiOnTable(d, poi('p'))).toBe(false);
  });
});

describe('saves', () => {
  const campaign = () => createCampaign('Ashfall');

  it('derives the save id from the campaign, so there is exactly one', () => {
    const c = campaign();
    const live = createLiveSave(c, AT);
    expect(live.id).toBe(liveSaveId(c.id));
    expect(live.label).toBe(LIVE_LABEL);
    expect(createLiveSave(c, '2027-01-01T00:00:00.000Z').id).toBe(live.id);
  });

  it('records which campaign and which campaign version it was made against', () => {
    const c = campaign();
    const live = createLiveSave(c, AT);
    expect(belongsTo(live, c)).toBe(true);
    expect(matchesCampaignVersion(live, c)).toBe(true);
    expect(matchesCampaignVersion(live, { ...c, schemaVersion: 99 })).toBe(false);
  });

  it('does not belong to a duplicate of its campaign', () => {
    const c = campaign();
    const live = createLiveSave(c, AT);
    // duplicateCampaign regenerates every id (D-109), so a save cannot follow it.
    expect(belongsTo(live, duplicateCampaign(c, 'Copy'))).toBe(false);
  });


  it('prunes discovery of POIs the GM has deleted', () => {
    const live = withDiscovery(
      createLiveSave(campaign(), AT),
      setPoisRevealed(emptyDiscovery(), ['keep', 'gone'] as PoiId[], true),
    );
    const pruned = pruneDiscovery(live, new Set(['keep'] as PoiId[]));
    expect([...pruned.discovery.pois]).toEqual(['keep']);
    expect(pruneDiscovery(pruned, new Set(['keep'] as PoiId[]))).toBe(pruned);
  });

});
