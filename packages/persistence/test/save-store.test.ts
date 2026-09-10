import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileSaveStore, memorySaveStore } from '@tt/persistence';
import type { Save } from '@tt/domain';
import {
  createCampaign, createLiveSave, liveSaveId, withDiscovery,
  emptyDiscovery, setChunkKnown, isChunkKnown,
} from '@tt/domain';

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

  it('leaves no .tmp files behind', () => {
    const store = fileSaveStore(root);
    store.save(seeded().live);
    expect(readdirSync(root).some((n) => n.includes('.tmp'))).toBe(false);
  });

  it('behaves the same in memory as on disk', () => {
    const { campaign, live } = seeded();
    for (const store of [fileSaveStore(root), memorySaveStore()]) {
      store.save(live);
      expect(store.load(live.id)?.label).toBe(live.label);
      expect(store.removeForCampaign(campaign.id)).toBe(1);
    }
  });
});

describe('reading', () => {
  it('returns null for a save that is not there', () => {
    expect(fileSaveStore(root).load('missing')).toBeNull();
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
