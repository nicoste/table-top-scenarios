// A campaign is a directory, not a file (R-60), so editing one part rewrites one
// file. Structure is JSON; voxel bodies are packed (R-59).
//
// Both of those were the stated design for a long time and neither was true:
// every map lived inside the manifest as one JSON entry per cube, and `save`
// wrote the manifest *and* the world on every accepted intent. Placing one cube
// in a 9,714-block church rewrote 497 KiB, including the terrain it had not
// touched and a second map in a different village (D-217).
//
// Now each map is its own file and only what changed is written. "Changed" is a
// reference comparison, which costs nothing and is exact because the domain
// preserves identity on an edit that changes nothing (R-12) — the rule was
// already there, waiting to be used for this.

import {
  mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, renameSync, rmSync,
} from 'node:fs';
import { join } from 'node:path';
import type { Campaign, EncounterMap } from '@tt/domain';
import { SCHEMA_VERSION, mapToJSON } from '@tt/domain';
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
/** One packed body per point of interest (R-60). */
const BODIES = 'pois';

/** What the last save put on disk, so the next one can write only the rest. */
interface LastSaved {
  readonly manifest: string;
  readonly world: unknown;
  readonly maps: ReadonlyMap<string, EncounterMap>;
}

/** Filesystem-backed store. The only adapter that touches the disk. */
export function fileCampaignStore(root: string): CampaignStore {
  mkdirSync(root, { recursive: true });

  const dir = (id: string) => join(root, id);
  const bodyDir = (id: string) => join(dir(id), BODIES);
  /*
   * Deliberately not populated on load. A campaign read from disk has just
   * been decoded into fresh objects, so there is nothing to compare against
   * and the first save writes everything once — which is also what performs
   * the migration from the old layout.
   */
  const lastSaved = new Map<string, LastSaved>();

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
      /*
       * Each map comes from its own file (R-60). A manifest that still carries
       * its maps inline was written before the split and is read exactly as it
       * is — the next save moves it (R-137a). No schema bump: a map in the
       * manifest and a map in a file are the same map, and the absence of one
       * says where to look for the other (D-187's reasoning).
       */
      const bodies = bodyDir(id);
      type WirePoi = { id?: unknown; map?: unknown };
      type WirePlace = { pois?: unknown };
      const places = Array.isArray(manifest.places)
        ? (manifest.places as WirePlace[]).map((place) => ({
          ...place,
          pois: Array.isArray(place.pois)
            ? (place.pois as WirePoi[]).map((poi) => {
              if (poi?.map) return poi;
              const file = join(bodies, `${String(poi?.id)}.json`);
              if (!existsSync(file)) return poi;
              return { ...poi, map: JSON.parse(readFileSync(file, 'utf8')) as unknown };
            })
            : place.pois,
        }))
        : manifest.places;
      const wire: unknown = { ...manifest, places, world };
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
      const { world, terrain: _terrain, markers: _markers, ...rest } = wire;
      const base = dir(campaign.id);
      const bodies = bodyDir(campaign.id);
      mkdirSync(bodies, { recursive: true });
      const before = lastSaved.get(campaign.id);

      // One body per point of interest, and only the ones that moved. The
      // comparison is by reference: an edit that changed nothing returns the
      // same object (R-12), and an edit to one map leaves every other map's
      // object untouched, so this is exact rather than a heuristic.
      const maps = new Map<string, EncounterMap>();
      for (const place of campaign.places) {
        for (const poi of place.pois) {
          if (!poi.map) continue;
          maps.set(poi.id as string, poi.map);
          if (before?.maps.get(poi.id as string) === poi.map) continue;
          writeAtomic(join(bodies, `${poi.id}.json`), JSON.stringify(mapToJSON(poi.map)));
        }
      }

      /*
       * A body whose point of interest is gone. Removed rather than left,
       * because an id is never reused so the file can only ever be clutter —
       * and the deletion that orphaned it was confirmed by the GM (R-151) and
       * is still undoable, since undo restores the map and the next save
       * writes the file again.
       *
       * Keyed on the points of interest that exist, not on the ones with a
       * body, so a map that is momentarily absent is never mistaken for one
       * that was deleted.
       */
      const alive = new Set(campaign.places.flatMap((p) => p.pois.map((poi) => poi.id as string)));
      for (const entry of readdirSync(bodies)) {
        if (!entry.endsWith('.json')) continue;
        if (!alive.has(entry.slice(0, -'.json'.length))) rmSync(join(bodies, entry));
      }

      // The manifest keeps the structure and none of the bodies.
      const manifest = {
        ...rest,
        places: rest.places.map((place) => ({
          ...place,
          pois: place.pois.map((poi) => ({ ...poi, map: null })),
        })),
      };
      const text = JSON.stringify(manifest, null, 1);
      if (text !== before?.manifest) writeAtomic(join(base, MANIFEST), text);
      // The world is untouched by every map edit, and map edits are nearly all
      // of them.
      if (before?.world !== campaign.world) writeAtomic(join(base, WORLD), JSON.stringify(world));

      lastSaved.set(campaign.id, { manifest: text, world: campaign.world, maps });
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
      // Forget what was on disk: a campaign restored from the trash by hand
      // must be written whole again, not diffed against a memory of the one
      // that was moved aside.
      lastSaved.delete(id);
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
