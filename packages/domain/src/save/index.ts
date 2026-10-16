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
import type { Travelling } from '../travel/index.js';
import { ON_FOOT } from '../travel/index.js';
import type { SilverTokens } from '../silver/index.js';
import { NO_SILVER, onLibrary, settledSilver, silverCubes } from '../silver/index.js';
import type { Campaign } from '../campaign/index.js';
import type { CuttingPlane, LevelRange } from '../planes/index.js';
import { sameRange, settleRange } from '../planes/index.js';
import type { EncounterMap } from '../map/index.js';
import { MAP_MAX_HEIGHT, MAP_MIN_DEPTH, WHOLE_MAP } from '../map/index.js';
import type { Tokens, TokensJSON } from '../tokens/index.js';
import { NO_TOKENS, settled, tokensFromJSON } from '../tokens/index.js';
import type { Cells } from '../vision/index.js';
import { NO_CELLS, explore, partySight } from '../vision/index.js';
import { placeById, poiById } from '../place/index.js';

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
   * Where the party stands in each map, by point of interest (R-184).
   *
   * **Remembered per map** (D-256), the same shape as `ranges` and for a
   * reason of its own: opening a map the party can see walks them into it
   * (D-200), so a GM peeking at the cellar while the party stands in the
   * tavern moves them — and would have cost everyone their place in the room
   * they came from if leaving forgot it.
   *
   * Only the entry for the map the party is `inside` is *present*: drawn,
   * sent to the table, and in the way of a brush (R-186). The others are
   * where they stood when they left, repaired on the way back in.
   *
   * A map nobody has stood in carries no entry, so the record does not fill
   * with empty ones.
   */
  readonly tokens: ReadonlyMap<string, Tokens>;
  /**
   * The space the party has seen in each map, by point of interest (R-45).
   *
   * **Cumulative**: once seen, a cube stays known, which is what stops fog
   * strobing as tokens move. Play state, beside `tokens` and `ranges` and in
   * the same shape, as R-4's sketch always said it would be — and, like them,
   * remembered per map, so walking back into the tavern finds it as the party
   * left it.
   *
   * Grown by the host whenever what the party sees changes; never shrunk by
   * anything but a map's deletion. Undo is about the campaign and leaves it
   * alone (R-140). A map nobody has seen carries no entry.
   */
  readonly explored: ReadonlyMap<string, Cells>;
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
  /**
   * What the party can travel by, one conveyance per medium (R-200).
   *
   * **Play state, and the party's**, beside where they are standing. A horse
   * is not a property of the world and not a property of the campaign: it is
   * something this party has, this session, until they lose it.
   *
   * In the save rather than on the console for the hour's reason (D-250): the
   * GM sets it **for both screens**. A route is drawn on the table as well as
   * the console, and two screens costing the same journey by different
   * transport is worse than one screen costing it at all (D-304). It also
   * means a reload no longer puts the party's ship back in the harbour.
   *
   * The GM grants it — it is a question about fiction and resources (D-298) —
   * which is why `setTravelling` is not open to the table (R-136).
   */
  readonly travelling: Travelling;
  /**
   * Everyone in each map who is not the party, by point of interest (D-307).
   *
   * Play state, beside `tokens` and in the same shape — but **present in every
   * map**, not only the one the party is in: the GM sets out a cellar's
   * goblins while the party is still upstairs. A map with nobody in it
   * carries no entry.
   */
  readonly silver: ReadonlyMap<string, SilverTokens>;
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
    tokens: new Map(),
    explored: new Map(),
    lighting: DAYLIGHT,
    travelling: ON_FOOT,
    silver: new Map(),
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

/** Where the party stands in one map — nobody, unless they have stood there (R-184). */
export function tokensFor(save: Save, poiId: PoiId | string): Tokens {
  return save.tokens.get(poiId as string) ?? NO_TOKENS;
}

/**
 * One map's tokens, read straight from the record the wire carries.
 *
 * `tokensFor` for a caller holding no `Save`, which is every console — the
 * same reason `rangeIn` exists beside `rangeFor`: a map nobody has stood in
 * carries no entry, and a reader supplying that default for itself is a
 * reader that can supply it wrong (D-208).
 */
export function tokensIn(
  records: Readonly<Record<string, Readonly<TokensJSON>>>,
  poiId: PoiId | string,
): Tokens {
  return tokensFromJSON(records[poiId as string]);
}

/**
 * Replaces one map's tokens. Identity-preserving (R-165), and a map left with
 * nobody in it loses its entry rather than keeping an empty one.
 */
export function withTokens(save: Save, poiId: PoiId | string, tokens: Tokens): Save {
  if (tokensFor(save, poiId) === tokens) return save;
  const next = new Map(save.tokens);
  if (tokens.size === 0) next.delete(poiId as string);
  else next.set(poiId as string, tokens);
  return { ...save, tokens: next };
}

/**
 * Drops the positions in one map that can no longer be stood in (D-256).
 *
 * Run on the way into a map. A cube built over while the party was elsewhere
 * cannot hold a token, so that member is placed again — repaired at the
 * boundary from what the blocks say, R-157's instinct.
 */
export function settleTokens(save: Save, poiId: PoiId | string, map: EncounterMap): Save {
  // Silver first: a goblin built into a wall is gone, and then a member
  // remembered where a goblin now stands is placed again (D-307).
  const silver = settledSilver(map, silverIn(save, poiId));
  const kept = withSilver(save, poiId, silver);
  return withTokens(kept, poiId, settled(map, tokensFor(kept, poiId), silverCubes(silver)));
}

/**
 * Forgets the positions of members who have left the roster and of maps that
 * are gone. `pruneDiscovery`'s tolerance and its moment: a stale entry is not
 * an error, and opening the campaign is when to stop carrying it.
 */
export function pruneTokens(
  save: Save,
  livePoiIds: ReadonlySet<string>,
  liveMemberIds: ReadonlySet<MemberId>,
): Save {
  let touched = false;
  const next = new Map<string, Tokens>();
  for (const [poiId, tokens] of save.tokens) {
    if (!livePoiIds.has(poiId)) { touched = true; continue; }
    const keep = [...tokens].filter(([id]) => liveMemberIds.has(id));
    if (keep.length !== tokens.size) touched = true;
    if (keep.length === 0) continue;
    next.set(poiId, keep.length === tokens.size ? tokens : new Map(keep));
  }
  return touched ? { ...save, tokens: next } : save;
}

/** What the party has seen of one map: nothing, unless they have looked (R-45). */
export function exploredIn(save: Save, poiId: PoiId | string): Cells {
  return save.explored.get(poiId as string) ?? NO_CELLS;
}

/**
 * Replaces what the party has seen of one map. Identity-preserving (R-165),
 * and a map seen not at all carries no entry.
 */
export function withExplored(save: Save, poiId: PoiId | string, cells: Cells): Save {
  if (exploredIn(save, poiId) === cells) return save;
  const next = new Map(save.explored);
  if (cells.size === 0) next.delete(poiId as string);
  else next.set(poiId as string, cells);
  return { ...save, explored: next };
}

/**
 * What the party sees now, added to what they have seen of the map they are
 * in (R-15, R-45). The same save when that adds nothing (R-165), which is
 * almost always: most intents change nothing anybody can see.
 *
 * Sight is the host's to work out (R-15), and this is how: whenever something
 * it depends on may have changed — a step, a block, a range, the way in — the
 * party looks around. Nobody standing in the map sees nothing, so a party that
 * has just walked in has seen nothing until the GM stands them somewhere
 * (D-200's brief).
 */
export function lookAround(save: Save, campaign: Campaign): Save {
  const inside = save.inside;
  if (!inside) return save;
  const place = placeById(campaign.places, inside.placeId);
  const map = place ? poiById(place, inside.poiId)?.map : null;
  if (!map) return save;
  const seen = partySight(map, tokensFor(save, inside.poiId), campaign.party);
  return withExplored(save, inside.poiId, explore(exploredIn(save, inside.poiId), seen));
}

/**
 * A fresh start in one map (D-277): what the party has seen of it is
 * forgotten, and nobody is standing in it.
 *
 * Both, because forgetting alone would undo itself: the party looks around
 * after every intent (R-190), and anybody still standing there would see it
 * all again at once. The GM's case is the prepared scene — a token walked
 * round to check the walls and the levels, then everything wiped for play —
 * and the members are placed again where play begins.
 */
export function forgetMap(save: Save, poiId: PoiId | string): Save {
  return withTokens(withExplored(save, poiId, NO_CELLS), poiId, NO_TOKENS);
}

/** Forgets what was seen of a map that is gone, for `pruneDiscovery`'s reason. */
export function pruneExplored(save: Save, livePoiIds: ReadonlySet<string>): Save {
  const keep = [...save.explored].filter(([poiId]) => livePoiIds.has(poiId));
  if (keep.length === save.explored.size) return save;
  return { ...save, explored: new Map(keep) };
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

/**
 * What the party travels by (R-200). Identity-preserving (R-165), compared
 * field by field for `withLighting`'s reason: the console sends all three
 * every time one picker changes, and two of them are the same as before.
 */
export function withTravelling(save: Save, travelling: Travelling): Save {
  const now = save.travelling;
  const same = now.land === travelling.land
    && now.water === travelling.water
    && now.air === travelling.air;
  return same ? save : { ...save, travelling };
}

/** One map's silver tokens — nobody, unless the GM has placed some (D-307). */
export function silverIn(save: Save, poiId: PoiId | string): SilverTokens {
  return save.silver.get(poiId as string) ?? NO_SILVER;
}

/**
 * Replaces one map's silver tokens. Identity-preserving (R-165), and a map
 * left with nobody in it loses its entry rather than keeping an empty one.
 */
export function withSilver(save: Save, poiId: PoiId | string, silver: SilverTokens): Save {
  if (silverIn(save, poiId) === silver) return save;
  const next = new Map(save.silver);
  if (silver.length === 0) next.delete(poiId as string);
  else next.set(poiId as string, silver);
  return { ...save, silver: next };
}

/**
 * Drops silver tokens whose library entry is gone, and those of maps that
 * are gone. Deleting an entry takes its tokens in **every** campaign (D-307);
 * the ones that were not open are tidied here, when they next open — the
 * tolerance `pruneMembers` gives a member who left the roster.
 */
export function withoutStrays(
  save: Save,
  livePoiIds: ReadonlySet<string>,
  liveTemplates: ReadonlySet<string>,
): Save {
  let touched = false;
  const next = new Map<string, SilverTokens>();
  for (const [poiId, silver] of save.silver) {
    if (!livePoiIds.has(poiId)) { touched = true; continue; }
    const kept = onLibrary(silver, liveTemplates);
    if (kept !== silver) touched = true;
    if (kept.length > 0) next.set(poiId, kept);
  }
  return touched ? { ...save, silver: next } : save;
}

