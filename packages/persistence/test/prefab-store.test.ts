// The Prefabs library on disk (D-321).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BlockCoord, Prefab, SwatchId } from '@tt/domain';
import { capturePrefab, createMap, setBlocks } from '@tt/domain';
import { filePrefabStore } from '@tt/persistence';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'tt-prefabs-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const cube = (x: number, y: number, z: number): BlockCoord => ({ x, y, z });
const post = (name: string): Prefab => capturePrefab(
  setBlocks(createMap(), [cube(2, 1, 2), cube(2, 2, 2)], 'material:wood' as SwatchId), cube(2, 1, 2), cube(2, 2, 2), { name },
) as Prefab;

describe('the Prefabs library on disk', () => {
  it('is empty before anything is written', () => {
    expect(filePrefabStore(join(root, 'prefabs')).load()).toEqual([]);
  });

  it('reads back what it wrote, one file each', () => {
    const store = filePrefabStore(join(root, 'prefabs'));
    const a = post('Post');
    const b = post('Other post');
    store.save(a);
    store.save(b);
    expect(readdirSync(join(root, 'prefabs')).sort()).toEqual([`${a.id}.json`, `${b.id}.json`].sort());
    const read = filePrefabStore(join(root, 'prefabs')).load();
    expect(read.map((one) => one.name).sort()).toEqual(['Other post', 'Post']);
    expect(read.find((one) => one.id === a.id)).toEqual(a);
  });

  it('moves a removed one aside rather than deleting it (D-108)', () => {
    const store = filePrefabStore(join(root, 'prefabs'));
    const a = post('Post');
    store.save(a);
    store.remove(a.id);
    expect(store.load()).toEqual([]);
    expect(readdirSync(join(root, 'prefabs')).some((name) => name.startsWith('.trash-') && name.includes(a.id))).toBe(true);
  });

  it('moves an unreadable file aside, and still reads the rest', () => {
    const dir = join(root, 'prefabs');
    mkdirSync(dir);
    writeFileSync(join(dir, 'prefab_broken.json'), '{ not json', 'utf8');
    const store = filePrefabStore(dir);
    store.save(post('Post'));
    expect(store.load().map((one) => one.name)).toEqual(['Post']);
    expect(existsSync(join(dir, 'prefab_broken.json'))).toBe(false);
    expect(readdirSync(dir).some((name) => name.startsWith('prefab_broken.json.unreadable-'))).toBe(true);
  });

  it('will not turn an id that is not one into a path', () => {
    const store = filePrefabStore(join(root, 'prefabs'));
    expect(() => store.remove('../campaigns')).toThrow();
  });
});
