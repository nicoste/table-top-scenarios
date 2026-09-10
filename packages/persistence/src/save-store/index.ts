// Saves live beside campaigns, not inside them (R-60, D-006): one flat file each,
// so writing play state never rewrites authored content.

import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { Save } from '@tt/domain';
import { SAVE_SCHEMA_VERSION } from '@tt/domain';
import { SaveWireSchema, encodeSave, decodeSave } from '@tt/protocol';

export interface SaveStore {
  load(id: string): Save | null;
  save(save: Save): void;
  remove(id: string): boolean;
  /** Trashes every save for a campaign — used when the campaign itself goes. */
  removeForCampaign(campaignId: string): number;
}

export function fileSaveStore(root: string): SaveStore {
  mkdirSync(root, { recursive: true });
  const fileFor = (id: string) => join(root, `${id}.json`);

  function writeAtomic(path: string, text: string): void {
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, text, 'utf8');
    renameSync(tmp, path);
  }

  function readOne(id: string): Save | null {
    const path = fileFor(id);
    if (!existsSync(path)) return null;
    let parsed;
    try {
      parsed = SaveWireSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
    } catch {
      return null;
    }
    if (!parsed.success) return null;
    if (parsed.data.schemaVersion > SAVE_SCHEMA_VERSION) {
      throw new Error(`save ${id} was written by a newer version (${parsed.data.schemaVersion})`);
    }
    return decodeSave(parsed.data);
  }

  /**
   * Every save file belonging to one campaign. A campaign has exactly one save
   * (D-147), so this exists only to sweep up: files left behind by the snapshot
   * era, or by an id scheme that changed.
   */
  function forCampaign(campaignId: string): readonly Save[] {
    const out: Save[] = [];
    if (!existsSync(root)) return out;
    for (const name of readdirSync(root)) {
      if (!name.endsWith('.json') || name.startsWith('.')) continue;
      // A corrupt save is skipped, not fatal: the GM keeps the others.
      const save = readOne(name.slice(0, -5));
      if (save && save.campaignId === campaignId) out.push(save);
    }
    return out;
  }

  return {
    load: (id) => readOne(id),
    save: (save) => writeAtomic(fileFor(save.id), JSON.stringify(encodeSave(save), null, 1)),

    /** Moved aside rather than unlinked, for the same reason as campaigns (D-108). */
    remove(id) {
      const path = fileFor(id);
      if (!existsSync(path)) return false;
      renameSync(path, join(root, `.trash-${id}.json`));
      return true;
    },

    removeForCampaign(campaignId) {
      let removed = 0;
      for (const save of forCampaign(campaignId)) if (this.remove(save.id)) removed++;
      return removed;
    },
  };
}

export function memorySaveStore(): SaveStore {
  const held = new Map<string, Save>();
  return {
    load: (id) => held.get(id) ?? null,
    save: (save) => { held.set(save.id, save); },
    remove: (id) => held.delete(id),
    removeForCampaign(campaignId) {
      let removed = 0;
      for (const save of [...held.values()]) {
        if (save.campaignId === campaignId && this.remove(save.id)) removed++;
      }
      return removed;
    },
  };
}
