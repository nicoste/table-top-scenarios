// The authoritative simulation. Completely pure (R-97): no clock, no filesystem,
// no socket, no randomness reachable from here. Everything arrives as an
// argument and everything leaves as a return value.

import type { Campaign, ChunkCoord } from '@tt/domain';
import type { PartyMember } from '@tt/domain';
import {
  createCampaign, duplicateCampaign, uniqueCampaignName, createMember, editMember, removeMember,
  addChunk, chunkAt, terrainById, isCreatableSlot, DEFAULT_TERRAIN,
  toGlobal, paintArea, setHeightArea, raiseArea,
} from '@tt/domain';
import type { HostState, Intent, Role } from '@tt/protocol';
import { parseTerrainId } from '@tt/protocol';

/** Side effects `sim` asks the host to perform. It performs none itself. */
export type Effect =
  | { readonly kind: 'saveCampaign'; readonly campaign: Campaign }
  | { readonly kind: 'loadCampaign'; readonly id: string }
  | { readonly kind: 'removeCampaign'; readonly id: string };

export interface Applied {
  readonly state: HostState;
  readonly effects: readonly Effect[];
  /** A reason, never silence (R-18). */
  readonly rejected?: string;
}

const reject = (state: HostState, reason: string): Applied => ({ state, effects: [], rejected: reason });
const ok = (state: HostState, effects: readonly Effect[] = []): Applied => ({ state, effects });

/** Only the GM changes anything. The table display is a viewer (R-3, R-4). */
function mayEdit(role: Role): boolean {
  return role === 'gm';
}

const MUTATIONS = new Set<Intent['kind']>([
  'createCampaign', 'openCampaign', 'closeCampaign', 'duplicateCampaign', 'deleteCampaign',
  'addChunk', 'paintTerrain', 'setHeight', 'raiseHeight',
  'addMember', 'editMember', 'removeMember',
]);

export function apply(state: HostState, role: Role, intent: Intent): Applied {
  if (MUTATIONS.has(intent.kind) && !mayEdit(role)) {
    return reject(state, 'only the GM can do that');
  }

  switch (intent.kind) {
    case 'createCampaign': {
      let campaign: Campaign;
      try {
        campaign = createCampaign(intent.name);
      } catch (error) {
        return reject(state, error instanceof Error ? error.message : 'could not create campaign');
      }
      return ok(
        {
          campaigns: [...state.campaigns, { id: campaign.id, name: campaign.name }],
          active: campaign,
        },
        [{ kind: 'saveCampaign', campaign }],
      );
    }

    case 'openCampaign': {
      if (!state.campaigns.some((c) => c.id === intent.id)) return reject(state, 'no such campaign');
      return ok(state, [{ kind: 'loadCampaign', id: intent.id }]);
    }

    case 'closeCampaign':
      return ok({ ...state, active: null });

    case 'duplicateCampaign': {
      // Only the open campaign can be duplicated: sim cannot read the disk
      // (R-97), so the source has to be in hand already.
      if (!state.active || state.active.id !== intent.id) {
        return reject(state, 'open the campaign you want to duplicate first');
      }
      const name = intent.name ?? uniqueCampaignName(state.campaigns.map((c) => c.name), state.active.name);
      let copy: Campaign;
      try {
        copy = duplicateCampaign(state.active, name);
      } catch (error) {
        return reject(state, error instanceof Error ? error.message : 'could not duplicate');
      }
      // Return to the list, where both campaigns are visible. That is the
      // confirmation, and it costs no extra protocol surface (D-109).
      return ok(
        { campaigns: [...state.campaigns, { id: copy.id, name: copy.name }], active: null },
        [{ kind: 'saveCampaign', campaign: copy }],
      );
    }

    case 'deleteCampaign': {
      if (!state.campaigns.some((c) => c.id === intent.id)) return reject(state, 'no such campaign');
      return ok(
        {
          campaigns: state.campaigns.filter((c) => c.id !== intent.id),
          // Deleting the open campaign closes it rather than leaving a ghost.
          active: state.active?.id === intent.id ? null : state.active,
        },
        [{ kind: 'removeCampaign', id: intent.id }],
      );
    }

    default:
      return applyToCampaign(state, intent);
  }
}

// -- everything below needs an open campaign ---------------------------------

function applyToCampaign(state: HostState, intent: Intent): Applied {
  const campaign = state.active;
  if (!campaign) return reject(state, 'no campaign is open');

  const commit = (next: Campaign): Applied =>
    next === campaign
      ? ok(state)
      : ok({ ...state, active: next }, [{ kind: 'saveCampaign', campaign: next }]);

  // World edits go through here so an unchanged world stays the same object and
  // costs no save and no broadcast.
  const commitWorld = (world: Campaign['world']): Applied =>
    world === campaign.world ? ok(state) : commit({ ...campaign, world });

  switch (intent.kind) {
    case 'addChunk': {
      const coord: ChunkCoord = { cx: intent.cx, cz: intent.cz };
      if (!isCreatableSlot(campaign.world, coord)) {
        return reject(state, 'that chunk must touch an existing one');
      }
      const world = addChunk(campaign.world, coord);
      if (world === campaign.world) return reject(state, 'cannot create a chunk there');
      return commitWorld(world);
    }

    case 'paintTerrain': {
      const anchorChunk = { cx: intent.cx, cz: intent.cz };
      if (!chunkAt(campaign.world, anchorChunk)) return reject(state, 'that chunk does not exist');
      const terrain = parseTerrainId(intent.terrainId);
      if (!terrainById(DEFAULT_TERRAIN, terrain)) {
        return reject(state, `unknown terrain: ${intent.terrainId}`);
      }
      // A brush wider than one cell can cross into neighbouring chunks; cells in
      // chunks that do not exist are skipped, never created.
      const at = toGlobal(anchorChunk, intent.x, intent.z);
      return commitWorld(paintArea(campaign.world, at, intent.size ?? 1, terrain));
    }

    case 'setHeight':
    case 'raiseHeight': {
      const anchorChunk = { cx: intent.cx, cz: intent.cz };
      if (!chunkAt(campaign.world, anchorChunk)) return reject(state, 'that chunk does not exist');
      const at = toGlobal(anchorChunk, intent.x, intent.z);
      const size = intent.size ?? 1;
      return commitWorld(intent.kind === 'setHeight'
        ? setHeightArea(campaign.world, at, size, intent.height)
        : raiseArea(campaign.world, at, size, intent.delta));
    }

    case 'addMember':
      return commit({ ...campaign, party: [...campaign.party, createMember(campaign.party, intent.name)] });

    case 'editMember': {
      const id = intent.id as PartyMember['id'];
      if (!campaign.party.some((m) => m.id === id)) return reject(state, 'no such party member');
      const patch: { -readonly [K in keyof Omit<PartyMember, 'id'>]?: PartyMember[K] } = {};
      if (intent.name !== undefined) patch.name = intent.name;
      if (intent.colour !== undefined) patch.colour = intent.colour;
      if (intent.visionRange !== undefined) patch.visionRange = intent.visionRange;
      return commit({ ...campaign, party: editMember(campaign.party, id, patch) });
    }

    case 'removeMember': {
      const id = intent.id as PartyMember['id'];
      if (!campaign.party.some((m) => m.id === id)) return reject(state, 'no such party member');
      const party = removeMember(campaign.party, id);
      if (party === campaign.party) return reject(state, 'the party cannot be empty');
      return commit({ ...campaign, party });
    }

    default:
      return reject(state, `unhandled intent: ${(intent as { kind: string }).kind}`);
  }
}

