import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileSaveStore, memorySaveStore } from '@tt/persistence';
import type { Save } from '@tt/domain';
import {
  createCampaign, createLiveSave, liveSaveId, withDiscovery,
  emptyDiscovery, setChunkKnown, isChunkKnown, withTokens, tokensFor, withExplored, exploredIn,
} from '@tt/domain';
import type { MemberId } from '@tt/domain';

const NOW = '2026-01-01T00:00:00.000Z';
let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'tt-saves-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const seeded = () => {
  const campaign = createCampaign('Ashfall');
  const live = withDiscovery(
    createLiveSave(campaign, NOW),
    setChunkKnown(emptyDiscovery(), { cx: 4, cz: 7 }, true),
  );
  return { campaign, live };
};

/**
 * A save for this campaign under some other id — what a file left over from the
 * snapshot era looks like. Nothing writes these any more (D-147); the store
 * still has to be able to sweep them up.
 */
const stray = (live: Save, id: string): Save => ({ ...live, id: id as Save['id'] });

describe('saves are separate files beside the campaign (R-60)', () => {
  it('writes one file per save', () => {
    const store = fileSaveStore(root);
    const { live } = seeded();
    store.save(live);
    expect(readdirSync(root)).toEqual([`${live.id}.json`]);
  });

  it('round-trips discovery', () => {
    const store = fileSaveStore(root);
    const { live } = seeded();
    store.save(live);
    const back = store.load(live.id);
    expect(isChunkKnown(back!.discovery, { cx: 4, cz: 7 })).toBe(true);
    expect(isChunkKnown(back!.discovery, { cx: 7, cz: 4 })).toBe(false);
  });

  it('keeps where the party stood in each map (R-184, D-256)', () => {
    const store = fileSaveStore(root);
    const { live } = seeded();
    const aldra = 'member_aldra' as MemberId;
    const placed = withTokens(
      withTokens(live, 'poi_tavern', new Map([[aldra, { x: 3, y: 1, z: 3 }]])),
      'poi_cellar',
      new Map([[aldra, { x: 9, y: -3, z: 9 }]]),
    );
    store.save(placed);
    const back = store.load(live.id)!;
    expect(tokensFor(back, 'poi_tavern').get(aldra)).toEqual({ x: 3, y: 1, z: 3 });
    expect(tokensFor(back, 'poi_cellar').get(aldra)).toEqual({ x: 9, y: -3, z: 9 });
  });

  it('reads a save written before tokens as a party nobody has placed — no bump (D-259)', () => {
    const store = fileSaveStore(root);
    const { live } = seeded();
    store.save(live);
    const path = join(root, `${live.id}.json`);
    const json = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    delete json.tokens;
    writeFileSync(path, JSON.stringify(json));
    const back = store.load(live.id)!;
    expect(back.tokens.size).toBe(0);
    expect(back.schemaVersion).toBe(live.schemaVersion);
  });

  it('keeps what the party has seen of each map (R-45, D-273)', () => {
    const store = fileSaveStore(root);
    const { live } = seeded();
    const hall = new Set(['3,1,3', '4,1,3', '5,1,3', '3,2,3', '-7,-3,40']);
    const cellar = new Set(['9,-3,9']);
    store.save(withExplored(withExplored(live, 'poi_tavern', hall), 'poi_cellar', cellar));
    const back = store.load(live.id)!;
    expect(exploredIn(back, 'poi_tavern')).toEqual(hall);
    expect(exploredIn(back, 'poi_cellar')).toEqual(cellar);
    // Packed, not a list of cubes (R-59).
    const json = readFileSync(join(root, `${live.id}.json`), 'utf8');
    expect(json).not.toContain('3,1,3');
  });

  it('reads a save written before vision as a party that has seen nothing — no bump (D-273)', () => {
    const store = fileSaveStore(root);
    const { live } = seeded();
    store.save(withExplored(live, 'poi_tavern', new Set(['3,1,3'])));
    const path = join(root, `${live.id}.json`);
    const json = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    delete json.explored;
    writeFileSync(path, JSON.stringify(json));
    const back = store.load(live.id)!;
    expect(back.explored.size).toBe(0);
    expect(back.schemaVersion).toBe(live.schemaVersion);
  });

  it('leaves no .tmp files behind', () => {
    const store = fileSaveStore(root);
    store.save(seeded().live);
    expect(readdirSync(root).some((n) => n.includes('.tmp'))).toBe(false);
  });

  it('behaves the same in memory as on disk', () => {
    const { campaign, live } = seeded();
    for (const store of [fileSaveStore(root), memorySaveStore()]) {
      store.save(live);
      expect(store.load(live.id)?.campaignId).toBe(live.campaignId);
      expect(store.removeForCampaign(campaign.id)).toBe(1);
    }
  });
});

describe('reading', () => {
  it('returns null for a save that is not there', () => {
    expect(fileSaveStore(root).load('missing')).toBeNull();
  });

  it('moves an unreadable save aside, so the fresh one cannot write over it', () => {
    // Null makes the host start a new save under the same name (D-147).
    const store = fileSaveStore(root);
    const { live } = seeded();
    const path = join(root, `${live.id}.json`);
    writeFileSync(path, '{ not json', 'utf8');
    expect(store.load(live.id)).toBeNull();
    store.save(live);
    const aside = readdirSync(root).find((name) => name.startsWith(`${live.id}.json.unreadable-`));
    expect(aside).toBeDefined();
    expect(readFileSync(join(root, aside!), 'utf8')).toBe('{ not json');
  });

  it('moves aside a save of the wrong shape too', () => {
    const store = fileSaveStore(root);
    const { live } = seeded();
    writeFileSync(join(root, `${live.id}.json`), JSON.stringify({ hello: 'world' }), 'utf8');
    expect(store.load(live.id)).toBeNull();
    expect(readdirSync(root).some((name) => name.startsWith(`${live.id}.json.unreadable-`))).toBe(true);
  });

  it('refuses a save written by a newer schema (R-61)', () => {
    const store = fileSaveStore(root);
    const { live } = seeded();
    store.save(live);
    const path = join(root, `${live.id}.json`);
    const wire = JSON.parse(readFileSync(path, 'utf8'));
    writeFileSync(path, JSON.stringify({ ...wire, schemaVersion: 99 }), 'utf8');
    expect(() => store.load(live.id)).toThrow(/newer version/);
  });
});

describe('deleting', () => {
  it('hides a save but leaves it recoverable (D-108)', () => {
    const store = fileSaveStore(root);
    const { live } = seeded();
    store.save(live);
    expect(store.remove(live.id)).toBe(true);
    expect(store.load(live.id)).toBeNull();
    expect(readdirSync(root).some((n) => n.startsWith('.trash-'))).toBe(true);
  });

  it('reports false for a save that was never there', () => {
    expect(fileSaveStore(root).remove('ghost')).toBe(false);
  });

  it('sweeps up every save of a campaign, including strays, and spares the rest', () => {
    const store = fileSaveStore(root);
    const { campaign, live } = seeded();
    const other = createCampaign('Elsewhere');
    const leftover = stray(live, 'save_from_the_snapshot_era');
    store.save(live);
    store.save(leftover);
    store.save(createLiveSave(other, NOW));

    expect(store.removeForCampaign(campaign.id)).toBe(2);
    expect(store.load(live.id)).toBeNull();
    expect(store.load(leftover.id)).toBeNull();
    expect(store.load(liveSaveId(other.id))).not.toBeNull();
  });

  it('sweeps up despite a corrupt file rather than giving up', () => {
    const store = fileSaveStore(root);
    const { campaign, live } = seeded();
    store.save(live);
    writeFileSync(join(root, 'broken.json'), '{ not json', 'utf8');
    expect(store.removeForCampaign(campaign.id)).toBe(1);
    expect(store.load(live.id)).toBeNull();
  });
});

describe('the live save is derived, not random', () => {
  it('is found without listing, and is stable across writes', () => {
    const store = fileSaveStore(root);
    const { campaign, live } = seeded();
    store.save(live);
    expect(store.load(liveSaveId(campaign.id))?.id).toBe(live.id);
    store.save(createLiveSave(campaign, '2027-01-01T00:00:00.000Z'));
    expect(readdirSync(root).filter((n) => n.endsWith('.json'))).toHaveLength(1);
  });
});
