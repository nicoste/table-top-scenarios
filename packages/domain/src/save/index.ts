// A save holds play state over an authored campaign (R-8, D-006).
//
// Every campaign has exactly **one** save, and it autosaves on every change the
// way the campaign already does, so a GM cannot lose discovery by forgetting.
// There is no second kind and no save/load verb anywhere in the UI (D-147).

import type { CampaignId, SaveId, PlaceId, MemberId } from '../ids/index.js';
import type { Discovery } from '../discovery/index.js';
import { emptyDiscovery } from '../discovery/index.js';
import type { Placement } from '../placement/index.js';
import { emptyPlacement, prunePlacement } from '../placement/index.js';
import type { Campaign } from '../campaign/index.js';

// 3 renames discovery's `pois` to `places`, following the campaign (D-176).
// Like the campaign, there is no migration: the same field name meant a
// different thing before, and guessing which is worse than starting clean.
export const SAVE_SCHEMA_VERSION = 3;
export const LIVE_LABEL = 'Live';

export interface Save {
  readonly id: SaveId;
  readonly campaignId: CampaignId;
  /** The campaign schema this play state was recorded against (R-8, R-61). */
  readonly campaignSchemaVersion: number;
  /** This save's own format version. */
  readonly schemaVersion: number;
  readonly label: string;
  /** ISO-8601. Supplied by the host: `domain` and `sim` have no clock (R-97). */
  readonly savedAt: string;
  readonly discovery: Discovery;
  /** Where the party is standing (D-155). */
  readonly placement: Placement;
}

/**
 * A save's id is **derived from the campaign**, not random.
 *
 * That makes "one save per campaign" structural rather than an invariant
 * something has to remember to check, and it means the host can look for a
 * campaign's save without listing anything.
 */
export function liveSaveId(campaignId: CampaignId): SaveId {
  return `save_live_${campaignId}` as SaveId;
}

export function createLiveSave(campaign: Campaign, savedAt: string): Save {
  return {
    id: liveSaveId(campaign.id),
    campaignId: campaign.id,
    campaignSchemaVersion: campaign.schemaVersion,
    schemaVersion: SAVE_SCHEMA_VERSION,
    label: LIVE_LABEL,
    savedAt,
    discovery: emptyDiscovery(),
    placement: emptyPlacement(),
  };
}

/** Does this save belong to this campaign, and was it written against it? */
export function belongsTo(save: Save, campaign: Campaign): boolean {
  return save.campaignId === campaign.id;
}

export function matchesCampaignVersion(save: Save, campaign: Campaign): boolean {
  return save.campaignSchemaVersion === campaign.schemaVersion;
}

/**
 * Brings a save read from disk up to the current schema.
 *
 * Reading tolerates an older file — a version-1 save has no `placement` and
 * decodes with the party unplaced. But it must not then be *written back* still
 * claiming to be version 1: it now carries version-2 data, and a version field
 * that does not describe its contents is worse than no version field, because
 * later code will branch on it.
 *
 * Called where a stored save is adopted, so the next autosave persists the
 * upgrade (R-61).
 */
export function upgraded(save: Save): Save {
  return save.schemaVersion === SAVE_SCHEMA_VERSION
    ? save
    : { ...save, schemaVersion: SAVE_SCHEMA_VERSION };
}

export function touch(save: Save, savedAt: string): Save {
  return save.savedAt === savedAt ? save : { ...save, savedAt };
}

export function withDiscovery(save: Save, discovery: Discovery): Save {
  return save.discovery === discovery ? save : { ...save, discovery };
}

export function withPlacement(save: Save, placement: Placement): Save {
  return save.placement === placement ? save : { ...save, placement };
}

/**
 * Discovery can name a place the GM has since deleted. That is tolerated rather
 * than an error — the same tolerance R-9 gives a stale overlay entry — but
 * opening the campaign is a good moment to drop them so the set does not grow
 * forever.
 */
export function pruneDiscovery(save: Save, livePlaceIds: ReadonlySet<PlaceId>): Save {
  const places = new Set([...save.discovery.places].filter((id) => livePlaceIds.has(id)));
  if (places.size === save.discovery.places.size) return save;
  return withDiscovery(save, { chunks: save.discovery.chunks, places });
}

/** The same tolerance for a member who has left the roster (D-155). */
export function pruneMembers(save: Save, liveMemberIds: ReadonlySet<MemberId>): Save {
  return withPlacement(save, prunePlacement(save.placement, liveMemberIds));
}
