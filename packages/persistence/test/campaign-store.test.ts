import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileCampaignStore, memoryCampaignStore } from '@tt/persistence';
import {
  createCampaign, addChunk, ORIGIN, chunkAt, columnAt, setHeight, replaceChunk,
  addPlace, addPoi, setMapBlock, blockAt, DEFAULT_FLOOR,
} from '@tt/domain';
import { encodeCampaign } from '@tt/protocol';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'tt-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('a campaign is a directory (R-60)', () => {
  it('writes a manifest and a separate world file', () => {
    const store = fileCampaignStore(root);
    const campaign = createCampaign('Ashfall');
    store.save(campaign);
    expect(existsSync(join(root, campaign.id, 'campaign.json'))).toBe(true);
    expect(existsSync(join(root, campaign.id, 'world.json'))).toBe(true);
  });

  it('keeps the world out of the manifest, so editing terrain rewrites one file', () => {
    const store = fileCampaignStore(root);
    const campaign = createCampaign('Ashfall');
    store.save(campaign);
    const manifest = JSON.parse(readFileSync(join(root, campaign.id, 'campaign.json'), 'utf8'));
    expect(manifest).not.toHaveProperty('world');
    expect(manifest).toHaveProperty('party');
  });

  it('leaves no .tmp files behind', () => {
    const store = fileCampaignStore(root);
    store.save(createCampaign('Ashfall'));
    const stray = JSON.stringify(readdirSync(root, { recursive: true }));
    expect(stray).not.toContain('.tmp');
  });
});

describe('round trips', () => {
  it('survives save and load with terrain and heights intact', () => {
    const store = fileCampaignStore(root);
    let campaign = createCampaign('Ashfall');
    const chunk = setHeight(chunkAt(campaign.world, ORIGIN)!, 4, 6, 7);
    campaign = { ...campaign, world: replaceChunk(campaign.world, chunk) };
    campaign = { ...campaign, world: addChunk(campaign.world, { cx: ORIGIN.cx + 1, cz: ORIGIN.cz }) };
    store.save(campaign);

    const loaded = store.load(campaign.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe('Ashfall');
    expect(loaded!.world.chunks.size).toBe(2);
    expect(columnAt(chunkAt(loaded!.world, ORIGIN)!, 4, 6)?.height).toBe(7);
    expect(loaded!.party).toHaveLength(1);

  });

  it('behaves the same in memory as on disk', () => {
    const campaign = createCampaign('Ashfall');
    for (const store of [fileCampaignStore(root), memoryCampaignStore()]) {
      store.save(campaign);
      expect(store.load(campaign.id)?.name).toBe('Ashfall');
      expect(store.list().map((c) => c.name)).toEqual(['Ashfall']);
    }
  });
});

describe('the terrain palette is code, not campaign data (D-107)', () => {
  it('persists no registry at all', () => {
    const store = fileCampaignStore(root);
    const campaign = createCampaign('Ashfall');
    store.save(campaign);
    const manifest = JSON.parse(readFileSync(join(root, campaign.id, 'campaign.json'), 'utf8'));
    // Every registry, not just the one that existed when this rule was written.
    for (const registry of ['terrain', 'markers']) {
      expect(Object.keys(manifest), registry).not.toContain(registry);
    }
    expect(JSON.stringify(manifest)).not.toContain('defaultDifficulty');
  });

  it('serves the current marker set to a campaign written with an older one', () => {
    const store = fileCampaignStore(root);
    const campaign = createCampaign('Legacy');
    store.save(campaign);
    const path = join(root, campaign.id, 'campaign.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    manifest.markers = [{ id: 'marker:hut', name: 'Hut', parts: [] }];
    writeFileSync(path, JSON.stringify(manifest), 'utf8');
    const wire = encodeCampaign(store.load(campaign.id)!);
    expect(wire.markers.map((m) => m.id)).toContain('marker:castle');
    expect(wire.markers.map((m) => m.id)).not.toContain('marker:hut');
  });

  it('serves the current palette to a campaign written with an older one', () => {
    const store = fileCampaignStore(root);
    const campaign = createCampaign('Legacy');
    store.save(campaign);
    // Fake a manifest carrying a stale palette, as schema 1 files do.
    const path = join(root, campaign.id, 'campaign.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    manifest.terrain = [{ id: 'terrain:swamp', name: 'Bog', colour: '#000000', defaultDifficulty: 99 }];
    writeFileSync(path, JSON.stringify(manifest), 'utf8');

    const wire = encodeCampaign(store.load(campaign.id)!);
    const swamp = wire.terrain.find((t) => t.id === 'terrain:swamp');
    expect(swamp?.name).toBe('Swamp');
    expect(swamp?.defaultDifficulty).toBe(2);
    expect(wire.terrain.map((t) => t.id)).toContain('terrain:jungle');
  });
});

describe('listing is defensive', () => {
  it('is empty for a fresh root', () => {
    expect(fileCampaignStore(root).list()).toEqual([]);
  });

  it('skips a corrupt campaign rather than failing the whole list', () => {
    const store = fileCampaignStore(root);
    store.save(createCampaign('Good'));
    mkdirSync(join(root, 'broken'), { recursive: true });
    writeFileSync(join(root, 'broken', 'campaign.json'), '{ not json', 'utf8');
    expect(store.list().map((c) => c.name)).toEqual(['Good']);
  });

  it('returns null for a campaign that is not there', () => {
    expect(fileCampaignStore(root).load('missing')).toBeNull();
  });

  it('refuses a campaign written by a newer schema (R-61)', () => {
    const store = fileCampaignStore(root);
    const campaign = createCampaign('Future');
    store.save(campaign);
    const path = join(root, campaign.id, 'campaign.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    writeFileSync(path, JSON.stringify({ ...manifest, schemaVersion: 99 }), 'utf8');
    expect(() => store.load(campaign.id)).toThrow(/newer version/);
  });
});

describe('a chunk written at a different stride migrates (R-61)', () => {
  it('re-lays a schema-1 20-stride chunk without shearing the map', () => {
    const store = fileCampaignStore(root);
    const campaign = createCampaign('Legacy');
    store.save(campaign);

    // Rewrite world.json the way schema 1 wrote it: stride 20, no `size` field.
    // A diagonal stripe makes shearing obvious — a flat-array copy would bend it.
    const worldPath = join(root, campaign.id, 'world.json');
    const world = JSON.parse(readFileSync(worldPath, 'utf8'));
    const heights = new Array(400).fill(0);
    const terrain = new Array(400).fill('terrain:water');
    for (let i = 0; i < 20; i++) {
      heights[i * 20 + i] = 5;
      terrain[i * 20 + i] = 'terrain:rock';
    }
    world.chunks = [{ cx: world.chunks[0].cx, cz: world.chunks[0].cz, heights, terrain }];
    writeFileSync(worldPath, JSON.stringify(world), 'utf8');

    const loaded = store.load(campaign.id);
    const chunk = chunkAt(loaded!.world, ORIGIN)!;

    // The diagonal must still be a diagonal at the new stride.
    for (let i = 0; i < 20; i++) {
      expect(columnAt(chunk, i, i)?.height, `cell ${i},${i}`).toBe(5);
      expect(columnAt(chunk, i, i)?.terrainId).toBe('terrain:rock');
    }
    // Everything the old chunk never covered is sea.
    expect(columnAt(chunk, 25, 25)?.height).toBe(0);
    expect(columnAt(chunk, 25, 25)?.terrainId).toBe('terrain:water');
    // And a cell just off the diagonal is untouched.
    expect(columnAt(chunk, 5, 6)?.height).toBe(0);
  });
});

describe('deleting moves aside rather than unlinking (D-108)', () => {
  it('hides the campaign from the list', () => {
    const store = fileCampaignStore(root);
    const campaign = createCampaign('Doomed');
    store.save(campaign);
    expect(store.list()).toHaveLength(1);
    expect(store.remove(campaign.id)).toBe(true);
    expect(store.list()).toEqual([]);
    expect(store.load(campaign.id)).toBeNull();
  });

  it('leaves the data recoverable on disk', () => {
    const store = fileCampaignStore(root);
    const campaign = createCampaign('Doomed');
    store.save(campaign);
    store.remove(campaign.id);
    const trashed = readdirSync(root).filter((n) => n.startsWith('.trash-'));
    expect(trashed).toHaveLength(1);
    expect(existsSync(join(root, trashed[0]!, 'world.json'))).toBe(true);
  });

  it('reports false for a campaign that was never there', () => {
    expect(fileCampaignStore(root).remove('ghost')).toBe(false);
  });

  it('can delete twice without colliding', () => {
    const store = fileCampaignStore(root);
    for (const name of ['A', 'B']) {
      const c = createCampaign(name);
      store.save(c);
      expect(store.remove(c.id)).toBe(true);
    }
    expect(readdirSync(root).filter((n) => n.startsWith('.trash-'))).toHaveLength(2);
    expect(store.list()).toEqual([]);
  });
});

describe('a campaign this build cannot read (R-144)', () => {
  /** The pre-rename shape: `pois` meant places, each holding `encounters`. */
  const legacyManifest = (id: string) => ({
    id,
    schemaVersion: 3,
    name: 'Old Galia',
    party: [],
    pois: [{ id: 'poi_1', name: 'Casilda', cell: { cx: 15, cz: 15, x: 1, z: 1 }, markerId: 'marker:town', encounters: [], notes: [] }],
  });

  function writeLegacy(root: string, id: string): void {
    const dir = join(root, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'campaign.json'), JSON.stringify(legacyManifest(id)), 'utf8');
    writeFileSync(join(dir, 'world.json'), JSON.stringify({ bounds: { x: 30, z: 30 }, metresPerCell: 1500, metresPerLevel: 150, chunks: [] }), 'utf8');
  }

  it('is not listed, because a row you cannot open is worse than no row', () => {
    const store = fileCampaignStore(root);
    writeLegacy(root, 'campaign_old');
    expect(store.list().map((c) => c.id)).not.toContain('campaign_old');
  });

  it('returns null rather than throwing, since this runs inside an intent', () => {
    // A store that throws takes the message handler with it. Null becomes a
    // rejection the GM can read.
    const store = fileCampaignStore(root);
    writeLegacy(root, 'campaign_old');
    expect(store.load('campaign_old')).toBeNull();
  });

  it('still lists and loads a current one alongside it', () => {
    const store = fileCampaignStore(root);
    writeLegacy(root, 'campaign_old');
    const fresh = createCampaign('Fresh');
    store.save(fresh);
    expect(store.list().map((c) => c.name)).toEqual(['Fresh']);
    expect(store.load(fresh.id)?.name).toBe('Fresh');
  });
});

describe('each map is its own file, and only what changed is written (R-59, R-60, D-217)', () => {
  /** A campaign with one place and one point of interest, which owns a map. */
  const built = () => {
    const campaign = createCampaign('Ashfall');
    const placed = addPlace(campaign.places, { ...ORIGIN, x: 2, z: 2 }, 'Casilda');
    return { ...campaign, places: addPoi(placed, placed[0]!.id, 'The tavern', true) };
  };
  type Built = ReturnType<typeof built>;
  const poiOf = (c: Built) => c.places[0]!.pois[0]!;
  const body = (c: Built) => join(root, c.id, 'pois', `${poiOf(c).id}.json`);

  it('puts the body beside the manifest, not inside it', () => {
    const store = fileCampaignStore(root);
    const campaign = built();
    store.save(campaign);
    expect(existsSync(body(campaign))).toBe(true);
    const manifest = readFileSync(join(root, campaign.id, 'campaign.json'), 'utf8');
    // The manifest keeps the point of interest and none of its cubes.
    expect(manifest).toContain('The tavern');
    expect(JSON.parse(manifest).places[0].pois[0].map).toBeNull();
  });

  it('writes the body packed, not one entry per cube', () => {
    const store = fileCampaignStore(root);
    const campaign = built();
    store.save(campaign);
    const written = JSON.parse(readFileSync(body(campaign), 'utf8'));
    expect(written).toHaveProperty('runs');
    expect(written).not.toHaveProperty('blocks');
    // A 16×16 floor is one run of air, one of floor, and one of air again.
    expect(written.runs.length).toBeLessThan(20);
  });

  it('leaves the world alone when a map changes', () => {
    /*
     * The whole point, and tested by scribbling rather than by timing: a
     * sentinel written into world.json survives a map edit if and only if
     * that save did not rewrite the world. Placing one cube used to rewrite
     * 143 KiB of terrain nobody had touched.
     */
    const store = fileCampaignStore(root);
    const campaign = built();
    store.save(campaign);
    const worldPath = join(root, campaign.id, 'world.json');
    const sentinel = `${readFileSync(worldPath, 'utf8')}\n`;
    writeFileSync(worldPath, sentinel, 'utf8');

    const poi = poiOf(campaign);
    const edited = {
      ...campaign,
      places: setMapBlock(campaign.places, campaign.places[0]!.id, poi.id, { x: 1, y: 1, z: 1 },
        DEFAULT_FLOOR),
    };
    store.save(edited);
    expect(readFileSync(worldPath, 'utf8')).toBe(sentinel);
  });

  it('leaves a map alone when the terrain changes', () => {
    // And the other way round, which is the half that makes the split worth
    // having at all rather than just tidier.
    const store = fileCampaignStore(root);
    const campaign = built();
    store.save(campaign);
    const sentinel = `${readFileSync(body(campaign), 'utf8')}\n`;
    writeFileSync(body(campaign), sentinel, 'utf8');

    const chunk = chunkAt(campaign.world, ORIGIN)!;
    const raised = replaceChunk(campaign.world, setHeight(chunk, 0, 0, 5));
    store.save({ ...campaign, world: raised });
    expect(readFileSync(body(campaign), 'utf8')).toBe(sentinel);
  });

  it('survives the round trip with the body intact', () => {
    const store = fileCampaignStore(root);
    const campaign = built();
    const poi = poiOf(campaign);
    const edited = {
      ...campaign,
      places: setMapBlock(campaign.places, campaign.places[0]!.id, poi.id, { x: 3, y: 7, z: 3 },
        DEFAULT_FLOOR),
    };
    store.save(edited);
    const back = store.load(campaign.id)!;
    expect(back).not.toBeNull();
    const backMap = back.places[0]!.pois[0]!.map!;
    expect(blockAt(backMap, { x: 3, y: 7, z: 3 })).toBe(DEFAULT_FLOOR);
    expect(backMap.blocks.size).toBe(edited.places[0]!.pois[0]!.map!.blocks.size);
  });

  it('still reads a campaign written before the split (R-137a)', () => {
    /*
     * The migration, and the reason the GM's church still opens: maps inline
     * in the manifest, one JSON entry per cube, no bodies directory at all.
     * Read as it is, and moved on the next save.
     */
    const store = fileCampaignStore(root);
    const campaign = built();
    store.save(campaign);
    const base = join(root, campaign.id);
    const manifest = JSON.parse(readFileSync(join(base, 'campaign.json'), 'utf8'));
    manifest.places[0].pois[0].map = {
      origin: { x: 0, z: 0 },
      size: { x: 16, z: 16 },
      blocks: { '4,2,4': DEFAULT_FLOOR as string },
      planes: [],
    };
    writeFileSync(join(base, 'campaign.json'), JSON.stringify(manifest), 'utf8');
    rmSync(join(base, 'pois'), { recursive: true, force: true });

    const back = fileCampaignStore(root).load(campaign.id)!;
    expect(back).not.toBeNull();
    expect(blockAt(back.places[0]!.pois[0]!.map!, { x: 4, y: 2, z: 4 })).toBe(DEFAULT_FLOOR);

    // And saving it moves the body out of the manifest, packed.
    fileCampaignStore(root).save(back);
    expect(existsSync(body(campaign))).toBe(true);
    expect(JSON.parse(readFileSync(join(base, 'campaign.json'), 'utf8'))
      .places[0].pois[0].map).toBeNull();
  });

  it('clears away the body of a point of interest that is gone', () => {
    const store = fileCampaignStore(root);
    const campaign = built();
    store.save(campaign);
    expect(existsSync(body(campaign))).toBe(true);
    const emptied = {
      ...campaign,
      places: campaign.places.map((p) => ({ ...p, pois: [] })),
    };
    store.save(emptied);
    expect(existsSync(body(campaign))).toBe(false);
  });
});
