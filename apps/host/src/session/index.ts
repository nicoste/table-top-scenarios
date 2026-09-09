// Session: holds authoritative state, runs intents through sim, performs the
// effects sim asked for. This is the only place side effects meet the rules
// (R-67, R-98) — the host owns them, sim never sees them.

import type { CampaignStore } from '@tt/persistence';
import type { HostState, Intent, Role, View } from '@tt/protocol';
import { viewFor } from '@tt/protocol';
import { apply } from '@tt/sim';

export interface Clock { now(): number }

export interface Session {
  state(): HostState;
  handle(role: Role, intent: Intent): { ok: boolean; reason?: string };
  view(role: Role): View;
  refreshCampaigns(): void;
}

export function createSession(store: CampaignStore, connect: () => readonly string[]): Session {
  let state: HostState = { campaigns: store.list(), active: null };

  return {
    state: () => state,
    view: (role) => viewFor(role, state, connect()),
    refreshCampaigns() {
      state = { ...state, campaigns: store.list() };
    },

    handle(role, intent) {
      const result = apply(state, role, intent);
      if (result.rejected) return { ok: false, reason: result.rejected };
      state = result.state;

      for (const effect of result.effects) {
        if (effect.kind === 'saveCampaign') {
          store.save(effect.campaign);
          continue;
        }
        if (effect.kind === 'removeCampaign') {
          store.remove(effect.id);
          continue;
        }
        // sim cannot read the disk, so loading is an effect it asks us for.
        const loaded = store.load(effect.id);
        if (!loaded) return { ok: false, reason: 'that campaign could not be read' };
        state = { ...state, active: loaded };
      }
      return { ok: true };
    },
  };
}
