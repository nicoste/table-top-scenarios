// The single path from state to a screen (R-19). Every field a client receives
// passes through viewFor, and there is no second route.

import type { Campaign, Save } from '@tt/domain';
import { isPoiOnTable, isChunkKnown, belongsTo, placementToJSON } from '@tt/domain';
import type { CampaignWire, SaveWire, PlacementWire } from '../wire/index.js';
import { encodeCampaign, encodeSave } from '../wire/index.js';

export type Role = 'gm' | 'table' | 'spectator';

export interface CampaignSummary {
  readonly id: string;
  readonly name: string;
}

/** What the host knows. `sim` transforms this and nothing else. */
export interface HostState {
  readonly campaigns: readonly CampaignSummary[];
  readonly active: Campaign | null;
  /** The live save for `active`, or null when no campaign is open. */
  readonly activeSave: Save | null;
}

export interface GmView {
  readonly role: 'gm';
  readonly campaigns: readonly CampaignSummary[];
  readonly campaign: CampaignWire | null;
  readonly save: SaveWire | null;
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
 * 3. That `Revealed` alone qualifies a POI. A POI reaches the table only when its
 *    chunk is Known **as well** (D-132) — the leak all three design critics found
 *    independently.
 */
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
    pois: wire.pois
      .filter((poi) => isPoiOnTable(save.discovery, {
        id: poi.id as Parameters<typeof isPoiOnTable>[1]['id'],
        cell: poi.cell,
      }))
      // A revealed place still keeps its private notes private (R-85).
      .map((poi) => ({ ...poi, notes: poi.notes.filter((note) => note.visibleToParty) })),
  };
}
