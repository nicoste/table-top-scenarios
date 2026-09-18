// The single path from state to a screen (R-19). Every field a client receives
// passes through viewFor, and there is no second route.

import type { Campaign, Save } from '@tt/domain';
import { isPlaceOnTable, isChunkKnown, belongsTo, placementToJSON, sliceOf, mapToJSON } from '@tt/domain';
import type { CampaignWire, SaveWire, PlacementWire, MapWire } from '../wire/index.js';
import { encodeCampaign, encodeSave } from '../wire/index.js';

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
 * immutable with identity-preserving edits (R-12) — and which is why it must
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
   * Where the party stands — the **only** save data the table ever receives.
   *
   * It has to: they are the players' own pawns, and the players move them
   * (R-136). Discovery is not sent and must never be: knowing *which* chunks are
   * Known is itself the answer to what is hidden.
   */
  readonly placement: PlacementWire | null;
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
 * table display never receives the save either — knowing *which* chunks are
 * Known is itself the answer to what is hidden.
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
  };
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
  const inside = save.inside;
  if (!inside || inside.placeId !== placeId || inside.poiId !== poiId) return null;
  const place = campaign.places.find((candidate) => candidate.id === placeId);
  const poi = place?.pois.find((candidate) => candidate.id === poiId);
  if (!poi?.map) return null;
  return mapToJSON(sliceOf(poi.map, inside.range));
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
          .map((e) => ({ ...e, map: bodyForTheTable(campaign, save, place.id, e.id) })),
      })),
  };
}
