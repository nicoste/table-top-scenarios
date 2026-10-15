import { describe, it, expect } from 'vitest';
import {
  emptyDiscovery, isChunkKnown, isPlaceRevealed, setChunkKnown, setPlaceRevealed,
  setPlacesRevealed, isPlaceOnTable, discoveryToJSON, discoveryFromJSON,
  createLiveSave, liveSaveId, pruneDiscovery, allKnownIn,
  belongsTo, matchesCampaignVersion, withDiscovery, LIVE_LABEL,
  createCampaign, duplicateCampaign, ON_FOOT, withTravelling,
} from '@tt/domain';
import type { PlaceId, TravelModeId, World } from '@tt/domain';

const place = (id: string, cx = 5, cz = 5) => ({ id: id as PlaceId, cell: { cx, cz } });
const AT = '2026-01-01T00:00:00.000Z';

describe('discovery', () => {
  it('starts knowing nothing', () => {
    const d = emptyDiscovery();
    expect(isChunkKnown(d, { cx: 0, cz: 0 })).toBe(false);
    expect(isPlaceRevealed(d, 'poi_x' as PlaceId)).toBe(false);
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

  it('reveals several places at once', () => {
    const d = setPlacesRevealed(emptyDiscovery(), ['a', 'b', 'c'] as PlaceId[], true);
    expect(d.places.size).toBe(3);
    expect(setPlacesRevealed(d, ['a', 'b'] as PlaceId[], false).places.size).toBe(1);
  });

  it('round-trips through JSON', () => {
    let d = setChunkKnown(emptyDiscovery(), { cx: 2, cz: 7 }, true);
    d = setPlaceRevealed(d, 'poi_1' as PlaceId, true);
    const back = discoveryFromJSON(discoveryToJSON(d));
    expect(isChunkKnown(back, { cx: 2, cz: 7 })).toBe(true);
    expect(isPlaceRevealed(back, 'poi_1' as PlaceId)).toBe(true);
  });

  it('tolerates a JSON payload missing either field', () => {
    expect(discoveryFromJSON({}).chunks.size).toBe(0);
    expect(discoveryFromJSON({ chunks: ['1,1'] }).places.size).toBe(0);
  });
});

describe('a place reaches the table only when BOTH flags allow it (D-132)', () => {
  const inChunk = { cx: 5, cz: 5 };

  it('shows a revealed place in a known chunk', () => {
    let d = setChunkKnown(emptyDiscovery(), inChunk, true);
    d = setPlaceRevealed(d, 'p' as PlaceId, true);
    expect(isPlaceOnTable(d, place('p'))).toBe(true);
  });

  it('hides a revealed place whose chunk is still Unknown — the leak every critic found', () => {
    const d = setPlaceRevealed(emptyDiscovery(), 'p' as PlaceId, true);
    expect(isChunkKnown(d, inChunk)).toBe(false);
    expect(isPlaceOnTable(d, place('p'))).toBe(false);
  });

  it('hides an unrevealed place in a known chunk', () => {
    const d = setChunkKnown(emptyDiscovery(), inChunk, true);
    expect(isPlaceOnTable(d, place('p'))).toBe(false);
  });

  it('hides one whose chunk was revealed and then hidden again', () => {
    let d = setChunkKnown(emptyDiscovery(), inChunk, true);
    d = setPlaceRevealed(d, 'p' as PlaceId, true);
    d = setChunkKnown(d, inChunk, false);
    expect(isPlaceOnTable(d, place('p'))).toBe(false);
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


  it('prunes discovery of places the GM has deleted', () => {
    const live = withDiscovery(
      createLiveSave(createCampaign('Ashfall'), AT),
      setPlacesRevealed(emptyDiscovery(), ['keep', 'gone'] as PlaceId[], true),
    );
    const pruned = pruneDiscovery(live, new Set(['keep'] as PlaceId[]));
    expect([...pruned.discovery.places]).toEqual(['keep']);
    expect(pruneDiscovery(pruned, new Set(['keep'] as PlaceId[]))).toBe(pruned);
  });


  it('a world cut to the party is a world where everything is Known (D-304)', () => {
    // What the table display is handed: `viewFor` has already removed the
    // chunks the party has not found, so the chunks that remain are exactly
    // the Known ones and nothing has to be told to it.
    const world = {
      bounds: { x: 30, z: 30 },
      metresPerCell: 1500,
      metresPerLevel: 150,
      chunks: new Map([['4,4', {}], ['5,4', {}]]),
    } as unknown as World;
    const known = allKnownIn(world);

    expect(isChunkKnown(known, { cx: 4, cz: 4 })).toBe(true);
    expect(isChunkKnown(known, { cx: 5, cz: 4 })).toBe(true);
    // The chunk next door was never sent, so it is not Known either.
    expect(isChunkKnown(known, { cx: 6, cz: 4 })).toBe(false);
    // Nothing is claimed about places: a route reads chunks (R-197).
    expect(known.places.size).toBe(0);
  });

  it('a world with no chunks knows nothing, rather than everything', () => {
    const empty = { chunks: new Map() } as unknown as World;
    expect(allKnownIn(empty).chunks.size).toBe(0);
  });
});

describe('what the party travels by (R-200)', () => {
  const SHIP = 'travel:ship' as TravelModeId;

  it('starts on foot and nothing else', () => {
    const live = createLiveSave(createCampaign('Ashfall'), AT);
    expect(live.travelling).toEqual(ON_FOOT);
    expect(live.travelling.water).toBeNull();
  });

  it('keeps its identity when nothing changed (R-165)', () => {
    // The console sends all three media whenever one picker moves, so most
    // of what arrives is what is already stored — and a new save object would
    // rebuild the route on every one of them.
    const live = createLiveSave(createCampaign('Ashfall'), AT);
    expect(withTravelling(live, { ...live.travelling })).toBe(live);
    const sailing = withTravelling(live, { ...live.travelling, water: SHIP });
    expect(sailing).not.toBe(live);
    expect(sailing.travelling.water).toBe(SHIP);
    expect(withTravelling(sailing, { ...sailing.travelling })).toBe(sailing);
  });

  it('records losing a conveyance as well as gaining one', () => {
    // `null` is a value, not an absence: no boat is what makes a river a wall.
    const live = withTravelling(
      createLiveSave(createCampaign('Ashfall'), AT),
      { land: null, water: SHIP, air: null },
    );
    const sunk = withTravelling(live, { land: null, water: null, air: null });
    expect(sunk).not.toBe(live);
    expect(sunk.travelling.water).toBeNull();
  });
});
