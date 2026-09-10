// A save holds play state over an authored campaign (R-8, D-006).
//
// Every campaign has exactly **one** save, and it autosaves on every change the
// way the campaign already does, so a GM cannot lose discovery by forgetting.
// There is no second kind and no save/load verb anywhere in the UI (D-147).

import type { CampaignId, SaveId, PoiId } from '../ids/index.js';
import type { Discovery } from '../discovery/index.js';
import { emptyDiscovery } from '../discovery/index.js';
import type { Campaign } from '../campaign/index.js';

export const SAVE_SCHEMA_VERSION = 1;
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
  };
}

/** Does this save belong to this campaign, and was it written against it? */
export function belongsTo(save: Save, campaign: Campaign): boolean {
  return save.campaignId === campaign.id;
}

export function matchesCampaignVersion(save: Save, campaign: Campaign): boolean {
  return save.campaignSchemaVersion === campaign.schemaVersion;
}

export function touch(save: Save, savedAt: string): Save {
  return save.savedAt === savedAt ? save : { ...save, savedAt };
}

export function withDiscovery(save: Save, discovery: Discovery): Save {
  return save.discovery === discovery ? save : { ...save, discovery };
}

/**
 * Discovery can name a POI the GM has since deleted. That is tolerated rather
 * than an error — the same tolerance R-9 gives a stale overlay entry — but
 * opening the campaign is a good moment to drop them so the set does not grow
 * forever.
 */
export function pruneDiscovery(save: Save, livePoiIds: ReadonlySet<PoiId>): Save {
  const pois = new Set([...save.discovery.pois].filter((id) => livePoiIds.has(id)));
  if (pois.size === save.discovery.pois.size) return save;
  return withDiscovery(save, { chunks: save.discovery.chunks, pois });
}
