// The single path from state to a screen (R-19). Every field a client receives
// passes through viewFor, and there is no second route.

import type { Campaign } from '@tt/domain';
import type { CampaignWire } from '../wire/index.js';
import { encodeCampaign } from '../wire/index.js';

export type Role = 'gm' | 'table' | 'spectator';

export interface CampaignSummary {
  readonly id: string;
  readonly name: string;
}

/** What the host knows. `sim` transforms this and nothing else. */
export interface HostState {
  readonly campaigns: readonly CampaignSummary[];
  readonly active: Campaign | null;
}

export interface GmView {
  readonly role: 'gm';
  readonly campaigns: readonly CampaignSummary[];
  readonly campaign: CampaignWire | null;
  /** Addresses players connect to (R-93). */
  readonly connect: readonly string[];
}

export interface TableView {
  readonly role: 'table';
  readonly campaign: CampaignWire | null;
}

export type View = GmView | TableView;

export interface Outbound {
  readonly type: 'view' | 'hello' | 'rejected';
}

export type OutboundMessage =
  | { readonly type: 'hello'; readonly role: Role }
  | { readonly type: 'view'; readonly view: View }
  | { readonly type: 'rejected'; readonly reason: string };

/**
 * The role filter. The table display gets no campaign list — the GM chooses and
 * the table follows (R-94) — and, once POIs and notes exist, this is where
 * `visibleToParty: false` is stripped (R-85).
 */
export function viewFor(role: Role, state: HostState, connect: readonly string[] = []): View {
  const campaign = state.active ? encodeCampaign(state.active) : null;
  if (role === 'gm') {
    return { role: 'gm', campaigns: state.campaigns, campaign, connect };
  }
  return { role: 'table', campaign: campaign ? forTheTable(campaign) : null };
}

/**
 * Everything the table display may not see, removed here and nowhere else
 * (R-19).
 *
 * **POIs are withheld entirely for now.** Whether the party knows a place exists
 * is `Revealed`, which is play state and lives in a save (R-8, R-16) — and saves
 * do not exist yet. Sending POIs before that flag exists would put every secret
 * the GM has written straight onto the players' screen. Withholding is the safe
 * default until the visibility round; see D-121.
 */
function forTheTable(campaign: CampaignWire): CampaignWire {
  return {
    ...campaign,
    pois: [],
  };
}
