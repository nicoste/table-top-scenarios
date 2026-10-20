// The single path from state to a screen (R-19). Every field a client receives
// passes through viewFor, and there is no second route.

import type { Campaign, Cells, LevelRange, Place, Poi, Prefabs, Save, TokensLibrary } from '@tt/domain';
import {
  isPlaceOnTable, isPoiOnTable, isChunkKnown, belongsTo, placementToJSON, rangeFor, DAYLIGHT,
  OPEN_SKY, sunReaches, litBy, MAP_MAX_HEIGHT,
  tokensFor, onRoster, tokensInBand, tokensToJSON,
  exploredIn, partySight, seenPart, inRange, placeById, poiById, ON_FOOT,
  silverIn, silverShown, templateById, libraryToJSON, prefabToJSON, openedIn, sliceOf, sightShows,
  carriedLightToJSON, areasIn, areasToJSON,
} from '@tt/domain';
import type { CarriedLightJSON } from '@tt/domain';
import type {
  CampaignWire, SaveWire, PlacementWire, MapWire, LightingWire, TokensWire, CellsWire,
  TravellingWire, TokenTemplateWire, PrefabWire,
} from '../wire/index.js';
import {
  encodeCampaign, encodeSave, mapWire, cellsWire, travellingToWire,
} from '../wire/index.js';

export type Role = 'gm' | 'table' | 'spectator';

export interface CampaignSummary {
  readonly id: string;
  readonly name: string;
}

/**
 * Undo history for the open campaign (D-169).
 *
 * The *shape* is here because `HostState` is protocol's to define; the rules for
 * stepping through it are `sim`'s (R-100 runs domain → protocol → sim, so it
 * cannot be the other way round).
 *
 * Holds whole campaigns, which is affordable only because the domain is
 * immutable with identity-preserving edits (R-165) — and which is why it must
 * **never** be serialised into a view. The GM console gets two booleans.
 */
export interface History {
  /** Campaign states before each edit, oldest first. */
  readonly past: readonly Campaign[];
  /** States undone out of `past`, newest first, awaiting redo. */
  readonly future: readonly Campaign[];
  /** The gesture that produced the newest `past` entry, for coalescing. */
  readonly stroke: string | null;
}

/** What the host knows. `sim` transforms this and nothing else. */
export interface HostState {
  readonly campaigns: readonly CampaignSummary[];
  readonly active: Campaign | null;
  /** The live save for `active`, or null when no campaign is open. */
  readonly activeSave: Save | null;
  /**
   * Undo history for `active` (D-169).
   *
   * Holds whole campaigns, so it must **never** be serialised into a view — the
   * GM console gets two booleans and nothing else.
   */
  readonly history: History;
  /**
   * The Tokens Library (D-307): shared by every campaign, so held beside
   * them and loaded whether or not one is open. Never sent to the table —
   * a goblin's entry is no business of the players until a goblin is in
   * sight, and then it arrives as that goblin.
   */
  readonly library: TokensLibrary;
  /**
   * The Prefabs library (D-321): shared by every campaign like the Tokens
   * Library, held beside them, and never sent to the table.
   */
  readonly prefabs: Prefabs;
}

export interface GmView {
  readonly role: 'gm';
  readonly campaigns: readonly CampaignSummary[];
  readonly campaign: CampaignWire | null;
  readonly save: SaveWire | null;
  /** Whether cmd+z / cmd+shift+z have anywhere to go (D-169). */
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Addresses players connect to (R-93). */
  readonly connect: readonly string[];
  /**
   * What the party sees right now in the map they are in, or `null` when they
   * are out on the world (R-15).
   *
   * Not save data — the save carries what they *have* seen (`explored`) — but
   * the host works it out after every intent anyway, and the console needs it
   * to show the GM the table's picture (R-76) without working it out again.
   */
  readonly sight: CellsWire | null;
  /** The Tokens Library, whole (D-307). The GM's, and only the GM's. */
  readonly library: readonly TokenTemplateWire[];
  /** The Prefabs library, whole (D-321). The GM's, and only the GM's. */
  readonly prefabs: readonly PrefabWire[];
}

/**
 * The fog over the map the table is shown (R-45, D-273).
 *
 * The table holds no block the party has not seen — its body is cut to them
 * before it is sent (R-85) — so of the three states only two need saying, and
 * the third is absence.
 */
export interface TableFog {
  /**
   * The space the party has seen, inside the band: where the players may stand
   * somebody (D-275). Sent so the table can tell before it asks (R-138).
   */
  readonly seen: CellsWire;
  /** The blocks it was sent that the party sees now. Every other is explored. */
  readonly lit: CellsWire;
}

export interface TableView {
  readonly role: 'table';
  readonly campaign: CampaignWire | null;
  /**
   * Where the party stands.
   *
   * It has to be sent: they are the players' own pawns, and the players move
   * them (R-136). Discovery is not sent and must never be — knowing *which*
   * chunks are Known is itself the answer to what is hidden.
   */
  readonly placement: PlacementWire | null;
  /**
   * How the GM has lit the scene (R-181).
   *
   * The **second** piece of save data the table is ever sent, and sent as its
   * own field rather than by widening what `save` means — so adding it is one
   * auditable line in this filter rather than a quiet change of category
   * (R-85).
   *
   * It is not a secret. Discovery is the answer to what is hidden and ranges
   * are the answer to what has been cut away; the hour of the day tells a
   * player nothing they are not looking straight at (D-250).
   */
  readonly lighting: LightingWire;
  /**
   * Where the party stands in the map the table is shown (R-184), or `null`
   * when it is shown no map.
   *
   * The **third** piece of save data the table is sent, and named here for
   * the hour's reason: adding it is one auditable line in this filter rather
   * than a quiet widening of what `save` means (D-250, D-259). It is the
   * players' own pawns, as `placement` is (R-136).
   *
   * **Only the ones standing inside the band** (R-185), so the table is not
   * handed a token on a level it has not been shown — it would have to decide
   * not to draw it, and deciding is this filter's job (D-252).
   */
  readonly tokens: TokensWire | null;
  /**
   * What the party has seen of the map the table is shown, and which of the
   * blocks it was sent are in sight now (R-45, D-273), or `null` when it is
   * shown no map.
   *
   * The **fourth** piece of save data the table is sent, named here for the
   * hour's reason (D-250). Not a secret: it is what the party is looking at.
   * And only inside the band, like everything else about that map (R-185).
   */
  readonly fog: TableFog | null;
  /**
   * What the party travels by (R-200).
   *
   * The **fifth** piece of save data the table is sent, and named here for
   * the hour's reason once more (D-250, D-304). It is what the party owns,
   * which R-136 puts on the players' side of the line; the GM grants it, so
   * `setTravelling` is GM-only, but a horse is not a secret from the people
   * riding it.
   *
   * Sent because **the table draws the route too**, and a route costed by
   * different transport on each screen is two answers to one question (R-19).
   * Always present: a party with nothing is `ON_FOOT`, not `null`.
   */
  readonly travelling: TravellingWire;
  /**
   * Everyone not of the party whom the party can see **right now**, in the
   * map the table is shown (R-206), or `null` when it is shown no map.
   *
   * The **sixth** piece of save data the table is sent, and the first that
   * is the GM's rather than the players' — so it is the narrowest. A silver
   * token reaches the table only standing inside the band, in a cube the
   * party sees at this moment, and not hidden by the GM. *Explored* is not
   * enough: remembering a room says nothing about who is in it now. A token
   * that fails any of the three is not sent at all, rather than sent and not
   * drawn (R-85).
   *
   * Each arrives as the table needs it and no more: its name, its cube, and
   * the picture on its card. Not its library entry, not its tags, not
   * whether there are others.
   */
  readonly silver: readonly TableSilverWire[] | null;
  /**
   * The **seventh** piece of save data the table is sent (D-322): which of
   * the props it holds stand open, in the map it is shown — so it draws an
   * open door open, and walks through it (R-209). Only props the table was
   * sent, which are only those in rooms the party has seen; a door it does
   * not hold is not mentioned. `null` out on the world.
   */
  readonly opened: readonly string[] | null;
  /**
   * The **eighth** piece of save data the table is sent (D-335): the light
   * each party member carries, by member id — only for the members whose
   * tokens it was sent, so a torch never burns where the table has nobody.
   * The players' own, as their tokens are (R-136). `null` out on the world.
   */
  readonly carried: Readonly<Record<string, CarriedLightJSON>> | null;
  /**
   * The **ninth** piece of save data the table is sent (D-341): the areas
   * drawn on the map it is shown that the GM has not hidden, each where it is
   * now. One that follows somebody the table is not sent is not sent either:
   * where it is would say where they are (R-85). `null` out on the world.
   */
  readonly areas: readonly TableAreaWire[] | null;
}

/** One area as the table sees it (D-341): where it is now, and nothing about whom it follows. */
export interface TableAreaWire {
  readonly id: string;
  readonly shape: 'sphere' | 'cone' | 'line' | 'cube';
  readonly at: { readonly x: number; readonly y: number; readonly z: number };
  readonly aim: { readonly x: number; readonly y: number; readonly z: number };
  readonly size: number;
  readonly colour: string;
  readonly name: string;
  /** Drawn from the table, so the table may move it and take it away (D-344). */
  readonly byTable?: true;
}

/** One silver token as the table sees it (R-206). */
export interface TableSilverWire {
  readonly id: string;
  readonly name: string;
  readonly at: { readonly x: number; readonly y: number; readonly z: number };
  readonly image: string | null;
  /**
   * The light it carries (D-335), absent for none. Sent with the token and
   * only with it: a torch whose bearer the party cannot see is not sent.
   */
  readonly light?: CarriedLightJSON;
}

export type View = GmView | TableView;

export type OutboundMessage =
  | { readonly type: 'hello'; readonly role: Role }
  | { readonly type: 'view'; readonly view: View }
  | { readonly type: 'rejected'; readonly reason: string };

/**
 * The role filter.
 *
 * Everything a client is not entitled to is removed here and nowhere else. The
 * table display never receives the *save* — knowing which chunks are Known is
 * itself the answer to what is hidden — so the three pieces of play state it
 * does get, the party's position, the hour of the day and where the party
 * stands in the map it is in, are named one at a time and justified where they
 * are declared (R-85, D-250, D-259).
 */
export function viewFor(role: Role, state: HostState, connect: readonly string[] = []): View {
  if (role === 'gm') {
    return {
      role: 'gm',
      campaigns: state.campaigns,
      campaign: state.active ? encodeCampaign(state.active) : null,
      save: state.activeSave ? encodeSave(state.activeSave) : null,
      canUndo: state.history.past.length > 0,
      canRedo: state.history.future.length > 0,
      connect,
      sight: state.active && state.activeSave ? sightOf(state.active, state.activeSave) : null,
      library: libraryToJSON(state.library),
      prefabs: state.prefabs.map(prefabToJSON),
    };
  }
  const campaign = forTheTable(state.active, state.activeSave);
  return {
    role: 'table',
    campaign,
    // No campaign on the table means no pawns either, rather than pawns floating
    // over an empty screen.
    placement: campaign && state.activeSave ? placementToJSON(state.activeSave.placement) : null,
    /*
     * **Resolved here**, not sent as a table of every place's light (R-182).
     *
     * The table is lit by where the party is: the point of interest's own
     * ambience when they are inside one, the world's when they are not. Sending
     * the lot would tell the players that a cave they have not entered glows
     * green, which is the sort of thing R-85 exists to prevent — and would make
     * the table decide something the filter is the only place for (D-252).
     */
    lighting: litFor(state),
    tokens: campaign && state.active && state.activeSave
      ? tokensForTheTable(state.active, state.activeSave)
      : null,
    fog: campaign && state.active && state.activeSave
      ? fogForTheTable(state.active, state.activeSave)
      : null,
    /*
     * Sent whether or not a campaign is open, unlike everything above it: the
     * others are *about* a campaign and read as absent without one, and this
     * is a default the table can always route with. With no save it is on
     * foot, which is what a party nobody has equipped travels by.
     */
    travelling: travellingToWire(state.activeSave?.travelling ?? ON_FOOT),
    silver: campaign && state.active && state.activeSave
      ? silverForTheTable(state.active, state.activeSave, state.library)
      : null,
    opened: campaign && state.active && state.activeSave ? openedForTheTable(state.active, state.activeSave) : null,
    carried: campaign && state.active && state.activeSave ? carriedForTheTable(state.active, state.activeSave) : null,
    areas: campaign && state.active && state.activeSave
      ? areasForTheTable(state.active, state.activeSave, state.library)
      : null,
  };
}

/**
 * The areas the table may draw (D-341): not hidden, and — for one that
 * follows somebody — only while the table holds them, placed where they
 * stand. The same members `tokensForTheTable` sends and the same silver
 * tokens `silverForTheTable` does.
 */
function areasForTheTable(campaign: Campaign, save: Save, library: TokensLibrary): readonly TableAreaWire[] | null {
  const shown = shownMap(campaign, save);
  if (!shown) return null;
  const members = tokensInBand(onRoster(tokensFor(save, shown.poi.id), campaign.party), rangeFor(save, shown.poi.id));
  const silver = silverForTheTable(campaign, save, library) ?? [];
  const where = (id: string) => members.get(id as never) ?? silver.find((token) => token.id === id)?.at ?? null;
  const out: TableAreaWire[] = [];
  for (const area of areasToJSON(areasIn(save, shown.poi.id))) {
    if (area.hidden) continue;
    const at = area.follows ? where(area.follows) : area.at;
    if (!at) continue;
    out.push({
      id: area.id,
      shape: area.shape as TableAreaWire['shape'],
      at: { x: at.x, y: at.y, z: at.z },
      aim: area.aim,
      size: area.size,
      colour: area.colour,
      name: area.name,
      ...(area.byTable ? { byTable: true as const } : {}),
    });
  }
  return out;
}

/**
 * The lights the members the table holds carry (D-335): the same members
 * `tokensForTheTable` sends, and nobody else.
 */
function carriedForTheTable(campaign: Campaign, save: Save): Readonly<Record<string, CarriedLightJSON>> | null {
  const shown = shownMap(campaign, save);
  if (!shown) return null;
  const standing = tokensInBand(onRoster(tokensFor(save, shown.poi.id), campaign.party), rangeFor(save, shown.poi.id));
  const out: Record<string, CarriedLightJSON> = {};
  for (const id of [...standing.keys()].sort()) {
    const light = save.carried.get(id);
    if (light) out[id] = carriedLightToJSON(light);
  }
  return out;
}

/** Which props the table holds stand open (D-322): its body's props, nothing beyond. */
function openedForTheTable(campaign: Campaign, save: Save): readonly string[] | null {
  const shown = shownMap(campaign, save);
  if (!shown?.poi.map) return null;
  const open = openedIn(save, shown.poi.id);
  if (open.size === 0) return [];
  const held = sliceOf(seenPart(shown.poi.map, exploredIn(save, shown.poi.id)), rangeFor(save, shown.poi.id)).props;
  return held.filter((prop) => open.has(prop.id)).map((prop) => prop.id).sort();
}

/**
 * The silver tokens the party can see right now, in the map the table is
 * shown (R-206): inside the band, in a cube of the party's present sight,
 * and not hidden. The same `shownMap` as the body and the party's tokens,
 * so "the table gets this map" and "the table gets who is in it" cannot come
 * apart (D-252).
 */
function silverForTheTable(
  campaign: Campaign,
  save: Save,
  library: TokensLibrary,
): readonly TableSilverWire[] | null {
  const shown = shownMap(campaign, save);
  if (!shown?.poi.map) return null;
  const range = rangeFor(save, shown.poi.id);
  const sight = partySight(shown.poi.map, tokensFor(save, shown.poi.id), campaign.party, openedIn(save, shown.poi.id));
  // The rule the console's Party's view draws with, so the two cannot differ.
  return silverShown(silverIn(save, shown.poi.id), sight, range)
    .map((token) => ({
      id: token.id,
      name: token.name,
      at: { x: token.at.x, y: token.at.y, z: token.at.z },
      image: templateById(library, token.templateId)?.image ?? null,
      ...(token.light ? { light: carriedLightToJSON(token.light) } : {}),
    }));
}

/**
 * What the party sees now, in the map they are in (R-15) — for the console.
 *
 * The same call the host made after the last intent, with the same body,
 * tokens and roster, so it is the answer it already worked out rather than
 * the work again.
 */
function sightOf(campaign: Campaign, save: Save): CellsWire | null {
  const inside = save.inside;
  if (!inside) return null;
  const place = placeById(campaign.places, inside.placeId);
  const map = place ? poiById(place, inside.poiId)?.map : null;
  if (!map) return null;
  return cellsWire(partySight(map, tokensFor(save, inside.poiId), campaign.party, openedIn(save, inside.poiId)));
}

/**
 * The fog for the map the table is shown (D-273): where the party has looked,
 * and which of the blocks the table holds they see now — both inside the band,
 * because nothing about a level the GM has cut away reaches the table (R-185).
 */
function fogForTheTable(campaign: Campaign, save: Save): TableFog | null {
  const shown = shownMap(campaign, save);
  if (!shown?.poi.map) return null;
  const map = shown.poi.map;
  const range = rangeFor(save, shown.poi.id);
  const sight = partySight(map, tokensFor(save, shown.poi.id), campaign.party, openedIn(save, shown.poi.id));
  return {
    seen: inBand(exploredIn(save, shown.poi.id), range),
    // Blocks and props alike (D-332): a prop out of sight greys as a block does.
    lit: inBand(sightShows(map, sight), range),
  };
}

/**
 * A set of cubes cut to the band, packed — once per set and band, because the
 * table is sent its fog on every message and both change far less often than
 * messages arrive (D-219's reasoning).
 */
const banded = new WeakMap<Cells, Map<string, CellsWire>>();

function inBand(cells: Cells, range: LevelRange): CellsWire {
  const key = `${range.lower}:${range.upper}`;
  let byRange = banded.get(cells);
  if (!byRange) {
    byRange = new Map();
    banded.set(cells, byRange);
  }
  const already = byRange.get(key);
  if (already) return already;
  const kept = new Set([...cells].filter((cube) => inRange(range, Number(cube.split(',')[1]))));
  const made = cellsWire(kept);
  byRange.set(key, made);
  return made;
}

/**
 * The map the table is shown, if any (R-158).
 *
 * One answer for the body and for the people standing in it, so "the table
 * gets this map" and "the table gets the tokens in it" cannot come apart —
 * the shape of D-252's bug, two fields under one rule with only one written.
 *
 * The party has to be in it, and the party has to be able to see it: Revealed,
 * chunk Known, point of interest shown. The GM can hide a place while the
 * party stands inside, and then neither the room nor anybody in it is sent.
 */
function shownMap(campaign: Campaign, save: Save): { place: Place; poi: Poi } | null {
  const inside = save.inside;
  if (!inside) return null;
  const place = campaign.places.find((candidate) => candidate.id === inside.placeId);
  const poi = place?.pois.find((candidate) => candidate.id === inside.poiId);
  if (!place || !poi?.map) return null;
  if (!isPoiOnTable(save.discovery, place, poi)) return null;
  return { place, poi };
}

/**
 * Where the party stands, for the table: the map it is shown, the members still
 * on the roster, and only the ones inside the band (R-185).
 */
function tokensForTheTable(campaign: Campaign, save: Save): TokensWire | null {
  const shown = shownMap(campaign, save);
  if (!shown) return null;
  const standing = onRoster(tokensFor(save, shown.poi.id), campaign.party);
  return tokensToJSON(tokensInBand(standing, rangeFor(save, shown.poi.id)));
}

/**
 * Reduces a campaign to what the party has been shown.
 *
 * Three things this does **not** trust:
 *
 * 1. That a save belongs to the open campaign. It is checked here rather than
 *    relying on the host to maintain the pairing — a mismatched save would
 *    otherwise apply one campaign's discovery to another's contents, and the
 *    live save id is derived from the campaign id, so a near-miss is plausible.
 * 2. That a campaign is open with a save. No save means nothing is shown, which
 *    keeps the safe default D-121 established.
 * 3. That `Revealed` alone qualifies a place. A place reaches the table only when its
 *    chunk is Known **as well** (D-132) — the leak all three design critics found
 *    independently.
 */
/**
 * The body the table may have of one point of interest, or `null` (R-158).
 *
 * Three conditions, and the order is the argument:
 *
 * 1. **The party is in this map.** Not "the GM is looking at it" — the console
 *    can wander into a cellar to build while the party waits outside, and that
 *    must not put the cellar on the table.
 * 2. **Only the blocks inside the range.** A filter, not a flag: the levels the
 *    GM cut away are absent from the payload, because R-85's standard is that a
 *    secret is never sent rather than merely undrawn.
 * 2b. **Only the blocks the party has seen** (D-273), for the same standard
 *    one step finer: what lies beyond the last wall they looked over is not on
 *    the table, and the fog is its absence. Vision narrows the band and never
 *    widens it (D-200).
 * 3. **Everything else gets nothing.** A tavern the party has not entered is a
 *    name on the table and no geometry at all, which is the same answer this
 *    function has always given and the reason there was nothing to leak before.
 */
function bodyForTheTable(
  campaign: Campaign,
  save: Save,
  placeId: string,
  poiId: string,
): MapWire | null {
  const shown = shownMap(campaign, save);
  if (!shown || shown.place.id !== placeId || shown.poi.id !== poiId || !shown.poi.map) return null;
  // Through the same cache as the GM's copy, keyed on the map *and* the band:
  // an edit to another map must not cost the table a re-slice of this one
  // (D-219).
  return mapWire(seenPart(shown.poi.map, exploredIn(save, poiId)), rangeFor(save, poiId));
}

function forTheTable(campaign: Campaign | null, save: Save | null): CampaignWire | null {
  if (!campaign || !save) return null;
  if (!belongsTo(save, campaign)) return null;

  const wire = encodeCampaign(campaign);
  const known = wire.world.chunks.filter((chunk) => isChunkKnown(save.discovery, chunk));
  const unknown = wire.world.chunks
    .filter((chunk) => !isChunkKnown(save.discovery, chunk))
    .map((chunk) => ({ cx: chunk.cx, cz: chunk.cz }));

  return {
    ...wire,
    world: { ...wire.world, chunks: known, unknownChunks: unknown },
    places: wire.places
      .filter((place) => isPlaceOnTable(save.discovery, {
        id: place.id as Parameters<typeof isPlaceOnTable>[1]['id'],
        cell: place.cell,
      }))
      // A revealed place still keeps its private notes private (R-85).
      // Notes *and* pois are stripped here. A secret is not merely
      // unrendered on the table — it never leaves the host (R-85, D-175).
      .map((place) => ({
        ...place,
        notes: place.notes.filter((note) => note.visibleToParty),
        // A revealed point of interest reaches the table as a *name*, and gets
        // a body only when the party is standing in it — and then only the band
        // the GM has cut to (R-158, and D-184 finally answered).
        pois: place.pois
          .filter((e) => e.visibleToParty)
          .map((e) => ({
            ...e,
            map: bodyForTheTable(campaign, save, place.id, e.id),
            /*
             * Its light is stripped with its body (R-182).
             *
             * The table is lit by the *resolved* hour — this place's ambience
             * when the party is inside it, and the world's when they are not —
             * so sending every point of interest's own would say "that cave
             * glows green" to a party who has not found it. Caught by the test
             * that asserts exactly that, after the colour rode along inside
             * the campaign rather than the lighting field (D-252).
             */
            ambience: OPEN_SKY,
          })),
      })),
  };
}

/** The light the table should use: where the party is standing, not everywhere. */
function litFor(state: HostState): LightingWire {
  const save = state.activeSave;
  if (!save) return { ...DAYLIGHT, ambience: { ...DAYLIGHT.ambience } };
  const inside = save.inside;
  const poi = inside && state.active
    ? state.active.places
      .find((place) => place.id === inside.placeId)?.pois
      .find((it) => it.id === inside.poiId)
    : null;
  /*
   * Indoors when the band the table is being shown stops below the sun
   * (R-183). The table has no band of its own — it is sent a slice and never
   * the cut — so this is worked out here and arrives as a sun of zero.
   */
  const sunlit = !inside || sunReaches(rangeFor(save, inside.poiId), MAP_MAX_HEIGHT);
  const lit = litBy(save.lighting, poi?.ambience ?? save.lighting.ambience, sunlit);
  return {
    angle: lit.angle,
    sun: lit.sun,
    sunLevel: lit.sunLevel,
    ambience: { ...lit.ambience },
  };
}
