// A save holds play state over an authored campaign (R-8, D-006).
//
// Every campaign has exactly **one** save, and it autosaves on every change the
// way the campaign already does, so a GM cannot lose discovery by forgetting.
// There is no second kind and no save/load verb anywhere in the UI (D-147).

import type { CampaignId, SaveId, PlaceId, PoiId, MemberId } from '../ids/index.js';
import type { Lighting } from '../light/index.js';
import { DAYLIGHT, clampLighting } from '../light/index.js';
import type { Discovery } from '../discovery/index.js';
import { emptyDiscovery } from '../discovery/index.js';
import type { Placement } from '../placement/index.js';
import { emptyPlacement, prunePlacement } from '../placement/index.js';
import type { Campaign } from '../campaign/index.js';
import type { CuttingPlane, LevelRange } from '../planes/index.js';
import { sameRange, settleRange } from '../planes/index.js';
import { MAP_MAX_HEIGHT, MAP_MIN_DEPTH, WHOLE_MAP } from '../map/index.js';

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
  /** Where the party is standing on the world map (D-155). */
  readonly placement: Placement;
  /**
   * The map the party has gone into, or `null` for out on the world (R-158).
   *
   * Play state, and the reason the open map stopped being the console's private
   * business (D-185 said this round would take it): the table has to follow the
   * GM into a tavern, and two screens cannot agree on which one from view state.
   *
   * It is **remembered**, so a reload puts the party back in the room they were
   * in rather than out on the grass. The GM's words: *"once they are in, we
   * should keep them."*
   */
  readonly inside: Inside | null;
  /**
   * The band each map is cut to, by point of interest (R-146).
   *
   * **Not** nested inside `inside`, which is where it started and which was
   * wrong: the console fades by this range, so a GM cutting a tavern to its
   * ground floor *to build it* needs the cut whether or not anyone is standing
   * there. Tying it to the party made the only control for it dead exactly when
   * a builder reaches for it (D-201).
   *
   * Absent means the whole body, so a map nobody has cut needs no entry.
   */
  readonly ranges: ReadonlyMap<string, LevelRange>;
  /**
   * How the scene is lit (R-181).
   *
   * **Play state, not authored.** A keep is a keep at every hour; what time it
   * is belongs to the session, beside where the party is standing and which
   * band the table is shown. A dungeon that is *always* dark would be a
   * property of the place, and is a different field on a different object.
   *
   * In the save rather than on the console because the GM sets it **for the
   * table** — "it is dusk" is scene-setting for the players, and a sun only
   * one screen can see is worse than no sun (D-250).
   *
   * Its `ambience` is the **world's**. A point of interest carries its own and
   * does not inherit this one, because a cave is not lit by the afternoon
   * (R-182).
   */
  readonly lighting: Lighting;
}

/** Which map the party has gone into. Where they are, and nothing else. */
export interface Inside {
  readonly placeId: PlaceId;
  readonly poiId: PoiId;
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
    inside: null,
    ranges: new Map(),
    lighting: DAYLIGHT,
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
 * Takes the party into a map (R-158).
 *
 * Whatever band that map was already cut to is what they walk into, because the
 * GM cut it for a reason — most likely while building the place.
 */
export function enteringMap(save: Save, placeId: PlaceId, poiId: PoiId): Save {
  if (save.inside && save.inside.placeId === placeId && save.inside.poiId === poiId) return save;
  return { ...save, inside: { placeId, poiId } };
}

/** Brings them back out to the world map. */
export function leavingMap(save: Save): Save {
  return save.inside === null ? save : { ...save, inside: null };
}

/** The band a map is cut to: the whole body unless the GM said otherwise. */
export function rangeFor(save: Save, poiId: PoiId | string): LevelRange {
  return save.ranges.get(poiId as string) ?? WHOLE_MAP;
}

/**
 * The band for one map, read straight from the record the wire carries.
 *
 * `rangeFor` for a caller holding no `Save` — which is every console, since
 * what crosses the wire is a plain object. It exists because `WHOLE_MAP` alone
 * was not enough: an uncut map stores no entry, so every reader has to supply
 * the default, and a reader that supplies it by hand can supply the wrong one.
 * One did, for as long as maps have had a below-zero (D-208). Here there is
 * nowhere to put the mistake.
 */
export function rangeIn(
  ranges: Readonly<Record<string, LevelRange>>,
  poiId: PoiId | string,
): LevelRange {
  return ranges[poiId as string] ?? WHOLE_MAP;
}

/** Cuts one map to a band. Independent of where the party is (D-201). */
export function withRange(save: Save, poiId: PoiId | string, range: LevelRange): Save {
  if (sameRange(rangeFor(save, poiId), range)) return save;
  const ranges = new Map(save.ranges);
  // An uncut map carries no entry, so the record does not grow with defaults.
  if (sameRange(range, WHOLE_MAP)) ranges.delete(poiId as string);
  else ranges.set(poiId as string, range);
  return { ...save, ranges };
}

/**
 * Drops `inside` when the map it names is gone.
 *
 * A point of interest the GM deleted while the party stood in it would
 * otherwise leave the table pointed at nothing, with no way back to the world
 * short of the GM noticing. Same tolerance, same reason, as `pruneDiscovery`.
 */
/**
 * Brings every band to rest on one of its map's levels (R-161).
 *
 * A repair at the read boundary, for bands stored when the rules let one sit
 * between levels. The ladder draws a handle on the level it rests at, so a band
 * off every level rendered with one end missing — which is what it looked like.
 *
 * Same shape as `pruneDiscovery`: old play state brought up to what the code
 * now assumes, once, on the way in (R-137a).
 */
export function settleRanges(
  save: Save,
  planesOf: (poiId: string) => readonly CuttingPlane[] | null,
): Save {
  let touched = false;
  const ranges = new Map(save.ranges);
  for (const [poiId, range] of save.ranges) {
    const planes = planesOf(poiId);
    if (!planes) continue;
    const rested = settleRange(planes, range, MAP_MAX_HEIGHT, MAP_MIN_DEPTH);
    if (sameRange(rested, range)) continue;
    touched = true;
    if (sameRange(rested, WHOLE_MAP)) ranges.delete(poiId);
    else ranges.set(poiId, rested);
  }
  return touched ? { ...save, ranges } : save;
}

/** Forgets the band of a map that is gone, for `pruneDiscovery`'s reason. */
export function pruneRanges(save: Save, livePoiIds: ReadonlySet<string>): Save {
  const keep = [...save.ranges].filter(([poiId]) => livePoiIds.has(poiId));
  if (keep.length === save.ranges.size) return save;
  return { ...save, ranges: new Map(keep) };
}

export function pruneInside(
  save: Save,
  live: (placeId: PlaceId, poiId: PoiId) => boolean,
): Save {
  if (!save.inside) return save;
  return live(save.inside.placeId, save.inside.poiId) ? save : { ...save, inside: null };
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

/**
 * The scene's lighting, clamped (R-181). Identity-preserving (R-165).
 *
 * Compared field by field rather than by reference, because the console sends
 * the whole description on every drag of a slider and most of those are the
 * same values it already holds.
 */
export function withLighting(save: Save, lighting: Lighting): Save {
  const next = clampLighting(lighting);
  const now = save.lighting;
  const same = now.angle === next.angle
    && now.sun === next.sun && now.sunLevel === next.sunLevel
    && now.ambience.colour === next.ambience.colour
    && now.ambience.level === next.ambience.level;
  return same ? save : { ...save, lighting: next };
}
