// A campaign is a directory, not a file (R-60), so editing one part rewrites one
// file. Structure is JSON; packed encodings are for encounter voxel bodies (R-59).

import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { Campaign } from '@tt/domain';
import { SCHEMA_VERSION } from '@tt/domain';
import type { CampaignSummary, CampaignWire } from '@tt/protocol';
import { CampaignWireSchema, encodeCampaign, decodeCampaign } from '@tt/protocol';

export interface CampaignStore {
  list(): readonly CampaignSummary[];
  load(id: string): Campaign | null;
  save(campaign: Campaign): void;
  remove(id: string): boolean;
}

const MANIFEST = 'campaign.json';
const WORLD = 'world.json';

/** Filesystem-backed store. The only adapter that touches the disk. */
export function fileCampaignStore(root: string): CampaignStore {
  mkdirSync(root, { recursive: true });

  const dir = (id: string) => join(root, id);

  function writeAtomic(path: string, text: string): void {
    // A half-written campaign is worse than a missing one.
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, text, 'utf8');
    renameSync(tmp, path);
  }

  return {
    list() {
      const out: CampaignSummary[] = [];
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        // Trashed campaigns are hidden, not listed (D-108).
        if (entry.name.startsWith('.')) continue;
        const manifest = join(dir(entry.name), MANIFEST);
        if (!existsSync(manifest)) continue;
        try {
          const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { id?: string; name?: string };
          if (typeof parsed.id === 'string' && typeof parsed.name === 'string') {
            out.push({ id: parsed.id, name: parsed.name });
          }
        } catch {
          // A corrupt campaign is skipped, not fatal: the GM keeps their others.
        }
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },

    load(id) {
      const base = dir(id);
      const manifestPath = join(base, MANIFEST);
      const worldPath = join(base, WORLD);
      if (!existsSync(manifestPath) || !existsSync(worldPath)) return null;
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
      const world = JSON.parse(readFileSync(worldPath, 'utf8')) as unknown;
      const wire: unknown = { ...manifest, world };
      const parsed = CampaignWireSchema.safeParse(wire);
      if (!parsed.success) throw new Error(`campaign ${id} failed validation: ${parsed.error.issues[0]?.message}`);
      if (parsed.data.schemaVersion > SCHEMA_VERSION) {
        throw new Error(`campaign ${id} was written by a newer version (${parsed.data.schemaVersion})`);
      }
      return decodeCampaign(parsed.data);
    },

    save(campaign) {
      const wire: CampaignWire = encodeCampaign(campaign);
      // `world` goes to its own file (R-60). `terrain` is dropped entirely: the
      // palette is code, and storing it froze old campaigns at a stale one
      // (D-107).
      const { world, terrain: _palette, ...manifest } = wire;
      const base = dir(campaign.id);
      mkdirSync(base, { recursive: true });
      writeAtomic(join(base, MANIFEST), JSON.stringify(manifest, null, 1));
      writeAtomic(join(base, WORLD), JSON.stringify(world));
    },

    /**
     * Moves the campaign aside rather than unlinking it (D-108). A GM who
     * mis-clicks has lost hours of hand-built world, and a rename costs nothing
     * while leaving a way back through the filesystem.
     */
    remove(id) {
      const base = dir(id);
      if (!existsSync(base)) return false;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      renameSync(base, join(root, `.trash-${stamp}-${id}`));
      return true;
    },
  };
}

/** In-memory store, for tests and for a host started with no disk. */
export function memoryCampaignStore(): CampaignStore {
  const held = new Map<string, CampaignWire>();
  return {
    list: () => [...held.values()].map((c) => ({ id: c.id, name: c.name })),
    load: (id) => {
      const wire = held.get(id);
      return wire ? decodeCampaign(wire) : null;
    },
    save: (campaign) => { held.set(campaign.id, encodeCampaign(campaign)); },
    remove: (id) => held.delete(id),
  };
}
