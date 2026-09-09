import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileCampaignStore, memoryCampaignStore } from '@tt/persistence';
import { createCampaign, addChunk, ORIGIN, chunkAt, columnAt, setHeight, replaceChunk } from '@tt/domain';
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
  it('does not persist the palette', () => {
    const store = fileCampaignStore(root);
    const campaign = createCampaign('Ashfall');
    store.save(campaign);
    const manifest = readFileSync(join(root, campaign.id, 'campaign.json'), 'utf8');
    expect(manifest).not.toContain('defaultDifficulty');
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
