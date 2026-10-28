// Packing a map once per version of that map (R-165, D-219).
//
// The property under test is not "the cache works" but "an edit to one map
// costs nothing for the others" — which is what made placing a cube scale with
// how much the GM owned rather than with what they had just changed.

import { describe, it, expect } from 'vitest';
import {
  createCampaign, addPlace, addPoi, setMapBlocks, blockAt, mapFromJSON,
  DEFAULT_MATERIALS, ORIGIN, swatchOf, createLiveSave, DAYLIGHT,
} from '@tt/domain';
import type { Campaign } from '@tt/domain';
import {
  encodeCampaign, mapWire, encodeSave, decodeSave, SaveWireSchema,
} from '@tt/protocol';

const STONE = swatchOf(DEFAULT_MATERIALS.find((m) => m.name === 'Mineral')!.id);

/** A campaign with two places, each with a point of interest and a map. */
function twoMaps(): Campaign {
  const campaign = createCampaign('Ashfall');
  let places = addPlace(campaign.places, { ...ORIGIN, x: 1, z: 1 }, 'Fisherton');
  places = addPoi(places, places[0]!.id, 'The church', true);
  places = addPlace(places, { ...ORIGIN, x: 5, z: 5 }, 'Mixchifuz');
  const second = places.find((p) => p.name === 'Mixchifuz')!;
  places = addPoi(places, second.id, 'Grassland', true);
  return { ...campaign, places };
}
const mapsOf = (c: Campaign) => c.places.flatMap((p) => p.pois.map((q) => q.map!));

describe('mapWire', () => {
  it('hands back the very same wire object for the very same map', () => {
    const map = mapsOf(twoMaps())[0]!;
    expect(mapWire(map)).toBe(mapWire(map));
  });

  it('packs a different object with the same content independently', () => {
    // Identity is the key, not content: two maps that happen to match are two
    // entries. Equal results, which is all correctness asks for.
    const map = mapsOf(twoMaps())[0]!;
    const twin = { ...map, blocks: new Map(map.blocks) };
    expect(mapWire(twin)).not.toBe(mapWire(map));
    expect(mapWire(twin)).toEqual(mapWire(map));
  });

  it('never serves the old cubes after an edit', () => {
    // The failure the cache could cause, and the one R-165 rules out: an edit
    // builds a new object, so there is nothing stale to serve.
    const campaign = twoMaps();
    const place = campaign.places[0]!;
    const poi = place.pois[0]!;
    const before = mapWire(poi.map!);
    const edited = setMapBlocks(campaign.places, place.id, poi.id, [{ x: 2, y: 9, z: 2 }], STONE);
    const after = mapWire(edited[0]!.pois[0]!.map!);
    expect(after).not.toBe(before);
    expect(blockAt(mapFromJSON(after)!, { x: 2, y: 9, z: 2 })).toBe(STONE);
    expect(blockAt(mapFromJSON(before)!, { x: 2, y: 9, z: 2 })).toBeNull();
  });

  it('treats a band as part of what was asked for', () => {
    // The table is sent a slice, so the same map cut two ways is two payloads
    // and must not be answered from one entry (R-146).
    const campaign = twoMaps();
    const place = campaign.places[0]!;
    const poi = place.pois[0]!;
    const tall = setMapBlocks(campaign.places, place.id, poi.id, [{ x: 2, y: 9, z: 2 }], STONE);
    const map = tall[0]!.pois[0]!.map!;

    const whole = mapWire(map);
    const low = mapWire(map, { lower: 0, upper: 4 });
    expect(low).not.toBe(whole);
    expect(blockAt(mapFromJSON(whole)!, { x: 2, y: 9, z: 2 })).toBe(STONE);
    // Cut away, so absent from the payload rather than merely undrawn (R-85).
    expect(blockAt(mapFromJSON(low)!, { x: 2, y: 9, z: 2 })).toBeNull();
    expect(mapWire(map, { lower: 0, upper: 4 })).toBe(low);
  });
});

describe('an edit to one map costs nothing for the others (D-219)', () => {
  it('leaves every untouched map wire form exactly where it was', () => {
    /*
     * The whole point, and the reason the cost stopped scaling with how many
     * maps a campaign owns. Identity of the *wire* object is the evidence: an
     * untouched map is not repacked, it is handed back.
     */
    const campaign = twoMaps();
    const first = encodeCampaign(campaign);
    const place = campaign.places[0]!;
    const edited: Campaign = {
      ...campaign,
      places: setMapBlocks(campaign.places, place.id, place.pois[0]!.id,
        [{ x: 3, y: 3, z: 3 }], STONE),
    };
    const second = encodeCampaign(edited);

    const church = (w: typeof first) => w.places.find((p) => p.name === 'Fisherton')!.pois[0]!.map;
    const grass = (w: typeof first) => w.places.find((p) => p.name === 'Mixchifuz')!.pois[0]!.map;
    // The map that changed was packed again.
    expect(church(second)).not.toBe(church(first));
    // The one that did not was not.
    expect(grass(second)).toBe(grass(first));
  });

  it('packs a body once even though the manifest then throws it away', () => {
    // The store asks for the same body it has just encoded, so going through
    // the cache is what stops it being packed twice per cube placed.
    const campaign = twoMaps();
    const wire = encodeCampaign(campaign);
    const fromWire = wire.places.find((p) => p.name === 'Fisherton')!.pois[0]!.map;
    expect(mapWire(campaign.places[0]!.pois[0]!.map!)).toBe(fromWire);
  });
});

describe('lighting travels, and a save written before it reads as daylight (R-181)', () => {
  const dusk = {
    angle: 165, sun: '#ff9a52', sunLevel: 2.2, ambience: { colour: '#4a5f8f', level: 0.18 },
  };

  it('round-trips an hour the GM set', () => {
    const save = { ...createLiveSave(createCampaign('Lit'), '2026-10-05T00:00:00.000Z'), lighting: dusk };
    expect(decodeSave(SaveWireSchema.parse(encodeSave(save))).lighting).toEqual(dusk);
  });

  it('reads a save with no lighting at all as daylight', () => {
    // Every save written before there was a sun to set meant this, which is why
    // it needed no schema bump (D-187, D-250).
    const save = createLiveSave(createCampaign('Old'), '2026-10-05T00:00:00.000Z');
    const wire = encodeSave(save) as Record<string, unknown>;
    delete wire.lighting;

    expect(decodeSave(SaveWireSchema.parse(wire)).lighting).toEqual(DAYLIGHT);
  });

  it('clamps a file that has been edited by hand', () => {
    const save = createLiveSave(createCampaign('Bent'), '2026-10-05T00:00:00.000Z');
    const wire = { ...encodeSave(save), lighting: { ...DAYLIGHT, angle: -40, sunLevel: 400 } };

    const back = decodeSave(SaveWireSchema.parse(wire));
    expect(back.lighting.angle).toBe(10);
    expect(back.lighting.sunLevel).toBe(3);
  });
});
