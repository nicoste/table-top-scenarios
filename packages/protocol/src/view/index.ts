// The single path from state to a screen (R-19). Every field a client receives
// passes through viewFor, and there is no second route.

import type { Campaign, Place, Poi, Save } from '@tt/domain';
import {
  isPlaceOnTable, isPoiOnTable, isChunkKnown, belongsTo, placementToJSON, rangeFor, DAYLIGHT,
  OPEN_SKY, sunReaches, litBy, MAP_MAX_HEIGHT,
  tokensFor, onRoster, tokensInBand, tokensToJSON,
} from '@tt/domain';
import type {
  CampaignWire, SaveWire, PlacementWire, MapWire, LightingWire, TokensWire,
} from '../wire/index.js';
import { encodeCampaign, encodeSave, mapWire } from '../wire/index.js';

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
  };
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
  return mapWire(shown.poi.map, rangeFor(save, poiId));
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
