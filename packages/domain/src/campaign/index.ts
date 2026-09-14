// A campaign is authored content (R-8): the world, the roster, the registries.
// Play state lives in a separate save that references it.

import type { CampaignId } from '../ids/index.js';
import { freshId } from '../ids/index.js';
import type { World, ChunkCoord } from '../world/index.js';
import { emptyWorld, addChunk, centreOfBounds, DEFAULT_WORLD_BOUNDS } from '../world/index.js';
import type { PartyMember } from '../party/index.js';
import type { Poi } from '../poi/index.js';
import { startingParty } from '../party/index.js';

// 3 turns a POI's `encounters` from bare ids into named, individually visible
// records (D-175). Nothing ever wrote a non-empty one, so reading an older
// campaign is lossless.
export const SCHEMA_VERSION = 3;

/**
 * Stamps a campaign read from disk with the current schema (R-137).
 *
 * Reading an older one is tolerated — v2 had bare-id encounters, and they
 * normalise to records on the way in. Writing it back still labelled v2 would
 * leave a file whose version does not describe its contents, and later code
 * will branch on that number. Same rule, same reason as `upgraded` for saves
 * (D-159).
 */
export function upgradedCampaign(campaign: Campaign): Campaign {
  return campaign.schemaVersion === SCHEMA_VERSION
    ? campaign
    : { ...campaign, schemaVersion: SCHEMA_VERSION };
}

export interface Campaign {
  readonly id: CampaignId;
  readonly schemaVersion: number;
  readonly name: string;
  readonly world: World;
  readonly party: readonly PartyMember[];
  readonly pois: readonly Poi[];
  // No terrain registry. The palette is code (DEFAULT_TERRAIN), not campaign
  // data — see D-107. Ids are stable and cells reference them (R-11), but
  // colours and difficulties are tuning values, and storing them per campaign
  // froze every world at the palette it was created with.
}

/**
 * Where a new campaign's first chunk goes: the middle of the default bounds, so
 * the world can grow in every direction. Derived rather than hardcoded — the
 * bounds are a per-campaign setting (D-010) and a fixed 10,10 would sit
 * off-centre the moment anyone changed them.
 */
export const DEFAULT_BOUNDS = DEFAULT_WORLD_BOUNDS;
export const ORIGIN: ChunkCoord = centreOfBounds(DEFAULT_BOUNDS);

/**
 * A name not already taken, for duplicating: "Ashfall (copy)", then
 * "Ashfall (copy 2)". Duplicates are for versioning, so several are expected.
 */
export function uniqueCampaignName(existing: readonly string[], base: string): string {
  const taken = new Set(existing.map((n) => n.trim().toLowerCase()));
  const root = base.trim() || 'Campaign';
  const first = `${root} (copy)`;
  if (!taken.has(first.toLowerCase())) return first;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${root} (copy ${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${root} (copy ${Date.now()})`;
}

/**
 * A duplicate is a **new campaign that shares nothing identifiable** with its
 * source (R-106).
 *
 * Every id in the graph is regenerated — the campaign, every party member, every
 * POI and every note. A shallow copy with only a fresh campaign id would leave
 * member and POI ids shared, and a save referencing them could then be read
 * against the wrong campaign.
 *
 * The world is shared by reference on purpose: `World`, `Chunk` and `Column` are
 * immutable and every edit is copy-on-write (`replaceChunk` returns a new World),
 * so there is nothing to deep-copy and no way for one campaign to alter the
 * other's terrain.
 */
export function duplicateCampaign(source: Campaign, name: string): Campaign {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('a campaign needs a name');

  return {
    id: freshId<'CampaignId'>('campaign'),
    schemaVersion: SCHEMA_VERSION,
    name: trimmed,
    world: source.world,
    party: source.party.map((member) => ({ ...member, id: freshId<'MemberId'>('member') })),
    pois: source.pois.map((poi) => ({
      ...poi,
      id: freshId<'PoiId'>('poi'),
      notes: poi.notes.map((note) => ({ ...note, id: freshId<'NoteId'>('note') })),
    })),
  };
}

/**
 * Creating a campaign asks for a name and nothing else (R-92). It arrives with
 * one water chunk at the origin and one party member named "player".
 */
export function createCampaign(name: string): Campaign {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('a campaign needs a name');
  return {
    id: freshId<'CampaignId'>('campaign'),
    schemaVersion: SCHEMA_VERSION,
    name: trimmed,
    world: addChunk(emptyWorld(DEFAULT_BOUNDS), ORIGIN),
    party: startingParty(),
    pois: [],
  };
}
