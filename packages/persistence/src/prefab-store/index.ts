// The Prefabs library on disk (D-321): one file per prefab, in a folder beside
// the campaigns because it belongs to all of them — the Tokens Library's
// reason (D-307). Stores and loads; decides nothing.
//
// A file each rather than one file for all, unlike the Tokens Library: a
// prefab is a body of blocks, not a line of text, and saving one should not
// rewrite every other.

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Prefab, Prefabs } from '@tt/domain';
import { NO_PREFABS, prefabFromJSON, prefabToJSON } from '@tt/domain';

export interface PrefabStore {
  load(): Prefabs;
  save(prefab: Prefab): void;
  /** Moves it aside rather than deleting it (D-108). */
  remove(id: string): void;
}

/** What a prefab's id must look like before it becomes part of a path. */
const SAFE_ID = /^prefab_[a-z0-9]+$/;

export function filePrefabStore(dir: string): PrefabStore {
  const fileOf = (id: string) => {
    if (!SAFE_ID.test(id)) throw new Error(`not a prefab id: ${id}`);
    return join(dir, `${id}.json`);
  };
  return {
    /**
     * Every prefab in the folder, oldest first (an id carries the time it was
     * made). A file that cannot be read is **moved aside**, not skipped in
     * place and not overwritten — the library store's habit — so whatever it
     * held is still there to recover, and it stops being read every start.
     */
    load() {
      if (!existsSync(dir)) return NO_PREFABS;
      const out: Prefab[] = [];
      for (const name of readdirSync(dir).filter((file) => file.endsWith('.json') && !file.startsWith('.')).sort()) {
        const path = join(dir, name);
        let prefab: Prefab | null = null;
        try {
          prefab = prefabFromJSON(JSON.parse(readFileSync(path, 'utf8')));
        } catch {
          prefab = null;
        }
        if (!prefab) {
          renameSync(path, `${path}.unreadable-${Date.now()}`);
          continue;
        }
        if (!out.some((one) => one.id === prefab.id)) out.push(prefab);
      }
      return out;
    },
    save(prefab) {
      mkdirSync(dir, { recursive: true });
      const path = fileOf(prefab.id);
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, JSON.stringify(prefabToJSON(prefab)), 'utf8');
      renameSync(tmp, path);
    },
    remove(id) {
      const path = fileOf(id);
      if (!existsSync(path)) return;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      renameSync(path, join(dir, `.trash-${stamp}-${id}.json`));
    },
  };
}
