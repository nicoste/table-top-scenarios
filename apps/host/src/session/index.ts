// Session: holds authoritative state, runs intents through sim, performs the
// effects sim asked for. The only place side effects meet the rules (R-67,
// R-98) — the host owns them, sim never sees them.

import type { CampaignStore, LibraryStore, PrefabStore, SaveStore } from '@tt/persistence';
import type { HostState, Intent, Role, View } from '@tt/protocol';
import { viewFor, liveSaveId } from '@tt/protocol';
import { apply, openedWith, emptyHistory } from '@tt/sim';

/** Time is a port (R-98): `sim` has no clock, so the host supplies one. */
export interface Clock { nowIso(): string }

export const systemClock: Clock = { nowIso: () => new Date().toISOString() };

export interface Session {
  state(): HostState;
  /**
   * `unsaved` says the change happened but a write behind it failed: it is on
   * every screen and not yet on disk.
   */
  handle(role: Role, intent: Intent): { ok: boolean; reason?: string; unsaved?: string };
  view(role: Role): View;
  refreshCampaigns(): void;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

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
  /** The Prefabs library (D-321), optional for the same reason. */
  prefabs?: PrefabStore,
): Session {
  let state: HostState = {
    campaigns: store.list(),
    active: null,
    activeSave: null,
    history: emptyHistory(),
    library: library ? library.load() : [],
    prefabs: prefabs ? prefabs.load() : [],
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

      /*
       * A write that fails — a full disk, a locked file — must not take the
       * host down with it. The change stays: it is already what every screen
       * is about to show, and campaigns, saves and the library are written
       * whole or by difference from their last write that succeeded, so the
       * next write carries it to disk too. The GM is told, and the host's
       * console says why.
       */
      const failed: string[] = [];
      const write = (what: () => void): void => {
        try {
          what();
        } catch (error) {
          failed.push(messageOf(error));
        }
      };

      for (const effect of result.effects) {
        switch (effect.kind) {
          case 'saveCampaign':
            write(() => store.save(effect.campaign));
            break;
          case 'removeCampaign':
            write(() => store.remove(effect.id));
            // A save whose campaign is gone points at nothing, so it goes too.
            write(() => saves.removeForCampaign(effect.id));
            break;
          case 'saveSave':
            write(() => saves.save(effect.save));
            break;
          case 'saveLibrary':
            write(() => library?.save(effect.library));
            break;
          case 'savePrefab':
            write(() => prefabs?.save(effect.prefab));
            break;
          case 'removePrefab':
            write(() => prefabs?.remove(effect.id));
            break;

          case 'loadCampaign': {
            // sim cannot read the disk, so loading is an effect it asks us for.
            // A file from a newer version throws rather than reading as null
            // (R-61); either way nothing has changed yet, so it is a refusal.
            let campaign;
            let save;
            try {
              campaign = store.load(effect.id);
              save = campaign ? saves.load(liveSaveId(campaign.id)) : null;
            } catch (error) {
              return { ok: false, reason: `that campaign could not be read: ${messageOf(error)}` };
            }
            if (!campaign) return { ok: false, reason: 'that campaign could not be read' };
            // The host reads; `sim` decides what the state becomes.
            const opened = openedWith(
              state,
              campaign,
              save,
              clock.nowIso(),
              new Set(campaign.places.map((place) => place.id)),
            );
            state = opened.state;
            const toPersist = opened.toPersist;
            if (toPersist) write(() => saves.save(toPersist));
            break;
          }


          default:
            break;
        }
      }
      if (failed.length > 0) {
        console.error(`  Could not write to disk: ${failed.join('; ')}`);
        return { ok: true, unsaved: `Not saved to disk: ${failed[0]}` };
      }
      return { ok: true };
    },
  };
}
