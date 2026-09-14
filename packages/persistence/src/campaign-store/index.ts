// A campaign is a directory, not a file (R-60), so editing one part rewrites one
// file. Structure is JSON; packed encodings are for poi voxel bodies (R-59).

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
          const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as
            { id?: string; name?: string; schemaVersion?: number };
          // Listing something that cannot be opened is worse than not listing
          // it: the GM clicks Open and gets an error for a row we offered them.
          // There is no migration below the current schema (R-144), so anything
          // older is not a campaign this build can read.
          if (typeof parsed.schemaVersion !== 'number' || parsed.schemaVersion < SCHEMA_VERSION) {
            continue;
          }
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
      // `null`, not a throw. This runs inside an intent, and a store that throws
      // takes the whole message handler with it; returning null becomes "that
      // campaign could not be read" and the GM keeps working (R-18, R-144).
      if (!parsed.success) return null;
      // An *older* schema must be refused explicitly, not merely left to fail
      // validation — it would not fail. Unknown keys are stripped and `places`
      // defaults to empty, so a pre-rename manifest parses cleanly into a
      // campaign with no places at all: silent loss wearing the face of success
      // (R-144).
      if (parsed.data.schemaVersion < SCHEMA_VERSION) return null;
      // A *newer* schema stays a loud error, deliberately: filling in a missing
      // field is a safe guess, discarding one written by a future version is
      // not (R-61).
      if (parsed.data.schemaVersion > SCHEMA_VERSION) {
        throw new Error(`campaign ${id} was written by a newer version (${parsed.data.schemaVersion})`);
      }
      return decodeCampaign(parsed.data);
    },

    save(campaign) {
      const wire: CampaignWire = encodeCampaign(campaign);
      // `world` goes to its own file (R-60). Every **registry** is dropped:
      // they are code, not campaign data, and storing them froze old campaigns
      // at whatever the registry looked like on the day (D-107). Destructure
      // each one by name so adding a registry without deciding this again is a
      // compile error rather than a silent leak into the manifest.
      const { world, terrain: _terrain, markers: _markers, ...manifest } = wire;
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
