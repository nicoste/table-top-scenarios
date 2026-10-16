// Session: holds authoritative state, runs intents through sim, performs the
// effects sim asked for. The only place side effects meet the rules (R-67,
// R-98) — the host owns them, sim never sees them.

import type { CampaignStore, LibraryStore, SaveStore } from '@tt/persistence';
import type { HostState, Intent, Role, View } from '@tt/protocol';
import { viewFor, liveSaveId } from '@tt/protocol';
import { apply, openedWith, emptyHistory } from '@tt/sim';

/** Time is a port (R-98): `sim` has no clock, so the host supplies one. */
export interface Clock { nowIso(): string }

export const systemClock: Clock = { nowIso: () => new Date().toISOString() };

export interface Session {
  state(): HostState;
  handle(role: Role, intent: Intent): { ok: boolean; reason?: string };
  view(role: Role): View;
  refreshCampaigns(): void;
}

export function createSession(
  store: CampaignStore,
  saves: SaveStore,
  connect: () => readonly string[],
  clock: Clock = systemClock,
  /**
   * The Tokens Library (D-307). Optional so a host that has none — every
   * test that predates it — runs with an empty one rather than none at all.
   */
  library?: LibraryStore,
): Session {
  let state: HostState = {
    campaigns: store.list(),
    active: null,
    activeSave: null,
    history: emptyHistory(),
    library: library ? library.load() : [],
  };

  return {
    state: () => state,
    view: (role) => viewFor(role, state, connect()),
    refreshCampaigns() {
      state = { ...state, campaigns: store.list() };
    },

    handle(role, intent) {
      const result = apply(state, role, intent, clock.nowIso());
      if (result.rejected) return { ok: false, reason: result.rejected };
      state = result.state;

      for (const effect of result.effects) {
        switch (effect.kind) {
          case 'saveCampaign':
            store.save(effect.campaign);
            break;
          case 'removeCampaign':
            store.remove(effect.id);
            // A save whose campaign is gone points at nothing, so it goes too.
            saves.removeForCampaign(effect.id);
            break;
          case 'saveSave':
            saves.save(effect.save);
            break;
          case 'saveLibrary':
            library?.save(effect.library);
            break;

          case 'loadCampaign': {
            // sim cannot read the disk, so loading is an effect it asks us for.
            const campaign = store.load(effect.id);
            if (!campaign) return { ok: false, reason: 'that campaign could not be read' };
            // The host reads; `sim` decides what the state becomes.
            const opened = openedWith(
              state,
              campaign,
              saves.load(liveSaveId(campaign.id)),
              clock.nowIso(),
              new Set(campaign.places.map((place) => place.id)),
            );
            state = opened.state;
            if (opened.toPersist) saves.save(opened.toPersist);
            break;
          }


          default:
            break;
        }
      }
      return { ok: true };
    },
  };
}
