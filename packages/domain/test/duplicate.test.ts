import { describe, it, expect } from 'vitest';
import {
  createCampaign, duplicateCampaign, uniqueCampaignName,
  chunkAt, columnAt, setHeight, paintTerrain, replaceChunk, registryId, ORIGIN,
  addPlace, addNote, addPoi, setMapBlock, blockAt, DEFAULT_FLOOR,
} from '@tt/domain';
import type { Campaign, TerrainId } from '@tt/domain';

const grass = registryId<'TerrainId'>('terrain', 'grass') as TerrainId;

/**
 * Every identifier anywhere in a campaign.
 *
 * It said that before it listed poi ids, and the omission is exactly how
 * `duplicateCampaign` came to leave them alone. Anything added to the graph
 * belongs here.
 */
function allIds(c: Campaign): string[] {
  return [
    c.id as string,
    ...c.party.map((m) => m.id as string),
    ...c.places.flatMap((p) => [
      p.id as string,
      ...p.notes.map((n) => n.id as string),
      ...p.pois.map((e) => e.id as string),
    ]),
  ];
}

/**
 * A campaign with something in every part of the graph.
 *
 * The place, its note and its point of interest are here because a fixture that
 * skips them makes `allIds` vacuously true: for a long while this file asserted
 * that no id is shared while testing a campaign that had no places at all, and
 * `duplicateCampaign` really was leaving poi ids alone the whole time.
 */
function built(): Campaign {
  let c = createCampaign('Ashfall');
  let chunk = chunkAt(c.world, ORIGIN)!;
  chunk = paintTerrain(chunk, 4, 5, grass);
  chunk = setHeight(chunk, 4, 5, 6);
  c = { ...c, world: replaceChunk(c.world, chunk) };
  let places = addPlace([], { cx: ORIGIN.cx, cz: ORIGIN.cz, x: 4, z: 5 }, 'Casilda');
  const placeId = places[0]!.id;
  places = addNote(places, placeId, 'The elder is a spy');
  places = addPoi(places, placeId, 'The tavern');
  places = setMapBlock(
    places, placeId, places[0]!.pois[0]!.id, { x: 2, y: 1, z: 3 }, DEFAULT_FLOOR,
  );
  return {
    ...c,
    places,
    party: [...c.party, { ...c.party[0]!, id: 'member_second' as never, name: 'Vex' }],
  };
}

describe('a duplicate shares nothing identifiable (R-106)', () => {
  it('regenerates every id in the graph', () => {
    const source = built();
    const copy = duplicateCampaign(source, 'Ashfall v2');
    const overlap = allIds(copy).filter((id) => allIds(source).includes(id));
    expect(overlap).toEqual([]);
  });

  it('gives the campaign itself a new id', () => {
    const source = built();
    expect(duplicateCampaign(source, 'x').id).not.toBe(source.id);
  });

  it('gives every party member a new id — the shallow-copy trap', () => {
    const source = built();
    const copy = duplicateCampaign(source, 'x');
    expect(copy.party).toHaveLength(source.party.length);
    for (const member of copy.party) {
      expect(source.party.map((m) => m.id)).not.toContain(member.id);
    }
  });

  it('keeps everything that is not an identity', () => {
    const source = built();
    const copy = duplicateCampaign(source, 'Ashfall v2');
    expect(copy.name).toBe('Ashfall v2');
    expect(copy.party.map((m) => m.name)).toEqual(source.party.map((m) => m.name));
    expect(copy.party.map((m) => m.colour)).toEqual(source.party.map((m) => m.colour));
    expect(copy.party.map((m) => m.visionRange)).toEqual(source.party.map((m) => m.visionRange));
  });

  it('carries a place, its note and its point of interest — body and all', () => {
    const copy = duplicateCampaign(built(), 'x');
    const place = copy.places[0]!;
    expect(place.name).toBe('Casilda');
    expect(place.notes[0]!.text).toBe('The elder is a spy');
    expect(place.pois[0]!.name).toBe('The tavern');
    // A map comes over by reference: it is immutable, so there is nothing to
    // share (R-12). Only the id had to be renewed (R-106).
    expect(blockAt(place.pois[0]!.map!, { x: 2, y: 1, z: 3 })).toBe(DEFAULT_FLOOR);
  });

  it('carries the terrain across', () => {
    const copy = duplicateCampaign(built(), 'x');
    const column = columnAt(chunkAt(copy.world, ORIGIN)!, 4, 5);
    expect(column?.height).toBe(6);
    expect(column?.terrainId).toBe(grass);
  });

  it('cannot have one campaign edit the other, despite sharing the world', () => {
    const source = built();
    const copy = duplicateCampaign(source, 'x');
    // The world is shared by reference on purpose: it is immutable and every
    // edit is copy-on-write, so editing one produces a new World for that one.
    expect(copy.world).toBe(source.world);
    const edited = replaceChunk(copy.world, setHeight(chunkAt(copy.world, ORIGIN)!, 9, 9, 12));
    expect(columnAt(chunkAt(edited, ORIGIN)!, 9, 9)?.height).toBe(12);
    expect(columnAt(chunkAt(source.world, ORIGIN)!, 9, 9)?.height).toBe(0);
  });

  it('refuses a blank name', () => {
    expect(() => duplicateCampaign(built(), '  ')).toThrow();
  });

  it('is stamped with the current schema version', () => {
    const stale = { ...built(), schemaVersion: 1 };
    expect(duplicateCampaign(stale, 'x').schemaVersion).toBeGreaterThan(1);
  });
});

describe('naming a duplicate', () => {
  it('adds "(copy)" first', () => {
    expect(uniqueCampaignName(['Ashfall'], 'Ashfall')).toBe('Ashfall (copy)');
  });

  it('counts upward so versioning works', () => {
    expect(uniqueCampaignName(['Ashfall', 'Ashfall (copy)'], 'Ashfall')).toBe('Ashfall (copy 2)');
    expect(uniqueCampaignName(['Ashfall', 'Ashfall (copy)', 'Ashfall (copy 2)'], 'Ashfall'))
      .toBe('Ashfall (copy 3)');
  });

  it('ignores case and surrounding space when checking for collisions', () => {
    expect(uniqueCampaignName(['  ashfall (COPY) '], 'Ashfall')).toBe('Ashfall (copy 2)');
  });
});
