// A campaign is authored content (R-8): the world, the roster, the registries.
// Play state lives in a separate save that references it.

import type { CampaignId } from '../ids/index.js';
import { freshId } from '../ids/index.js';
import type { World, ChunkCoord } from '../world/index.js';
import { emptyWorld, addChunk, centreOfBounds, DEFAULT_WORLD_BOUNDS } from '../world/index.js';
import type { PartyMember } from '../party/index.js';
import type { Place } from '../place/index.js';
import { withPoiMaps } from '../place/index.js';
import { startingParty } from '../party/index.js';

/**
 * 4 renames the stored shape to match the vocabulary (D-176): the world map
 * holds `places`, and each place holds `pois` — a church, a market, an arena.
 *
 * **No migration.** Earlier files used `pois` for what is now `places`, so a
 * tolerant reader would have to guess which meaning a field had from its
 * neighbours. The GM chose a clean break over that guesswork, so a
 * pre-4 campaign simply does not load and is skipped (R-144).
 */
export const SCHEMA_VERSION = 4;

/**
 * Brings a campaign read from disk up to what the code now assumes (R-137).
 *
 * Two jobs, and the version check covers only the first.
 *
 * *Stamping.* Reading an older file is tolerated — v2 had bare-id pois, and
 * they normalise to records on the way in. Writing it back still labelled v2
 * would leave a file whose version does not describe its contents, and later
 * code will branch on that number. Same rule, same reason as `upgraded` for
 * saves (D-159).
 *
 * *Shape the version cannot express.* A point of interest now always owns a map
 * (D-187), and a v4 file may hold one that does not. That is normalised
 * unconditionally rather than behind a version gate, because the file is
 * already stamped v4 and gating would leave the very campaigns that need it
 * untouched. Identity-preserving both ways (R-12).
 */
export function upgradedCampaign(campaign: Campaign): Campaign {
  const places = withPoiMaps(campaign.places);
  if (campaign.schemaVersion === SCHEMA_VERSION && places === campaign.places) return campaign;
  return { ...campaign, schemaVersion: SCHEMA_VERSION, places };
}

export interface Campaign {
  readonly id: CampaignId;
  readonly schemaVersion: number;
  readonly name: string;
  readonly world: World;
  readonly party: readonly PartyMember[];
  readonly places: readonly Place[];
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
 * place and every note. A shallow copy with only a fresh campaign id would leave
 * member and place ids shared, and a save referencing them could then be read
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
    places: source.places.map((place) => ({
      ...place,
      id: freshId<'PlaceId'>('place'),
      notes: place.notes.map((note) => ({ ...note, id: freshId<'NoteId'>('note') })),
      // Points of interest were left sharing their source's ids when they were
      // added — the copy's map is carried over by reference, which is safe
      // because a map is immutable (R-12), but an id is identity (R-106).
      pois: place.pois.map((poi) => ({ ...poi, id: freshId<'PoiId'>('poi') })),
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
    places: [],
  };
}
