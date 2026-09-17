// The authoritative simulation. Completely pure (R-97): no clock, no filesystem,
// no socket, no randomness reachable from here. Everything arrives as an
// argument and everything leaves as a return value.

import type { Campaign, ChunkCoord, WorldCell } from '@tt/domain';
import type { PartyMember, PlaceId, NoteId, PoiId, MemberId, MaterialId, Save, Place } from '@tt/domain';
import {
  createCampaign, duplicateCampaign, uniqueCampaignName, createMember, editMember, removeMember,
  addChunk, chunkAt, terrainById, isCreatableSlot, DEFAULT_TERRAIN,
  toGlobal, paintArea, setHeightArea, raiseArea,
  addPlace, renamePlace, setPlaceMarker, movePlace, removePlace, placeById, placeAt, isValidPlaceCell,
  addNote, editNote, setNoteVisible, removeNote, moveNote, isKnownMarker,
  addPoi, renamePoi, setPoiVisible, removePoi, movePoi,
  setMapBlock, clearMapBlock, fillPoiMaterial, growPoiMap, inMap, isKnownMaterial,
  poiById as poiOfPlace,
  createLiveSave, withDiscovery, withPlacement, touch, upgraded, upgradedCampaign, belongsTo,
  pruneDiscovery, pruneMembers,
  pawns, withGroupAt, withMemberAt, gathered, scattered,
  isValidWorldCell, chunkOf, isChunkKnown,
  setChunkKnown, setPlaceRevealed, setPlacesRevealed, isAuthored, placesInChunk,
} from '@tt/domain';
import type { HostState, Intent, Role } from '@tt/protocol';
import { parseTerrainId, parseMarkerId } from '@tt/protocol';
import { emptyHistory, remember, undone, redone } from '../history/index.js';

/** Side effects `sim` asks the host to perform. It performs none itself. */
export type Effect =
  | { readonly kind: 'saveCampaign'; readonly campaign: Campaign }
  | { readonly kind: 'loadCampaign'; readonly id: string }
  | { readonly kind: 'removeCampaign'; readonly id: string }
  | { readonly kind: 'saveSave'; readonly save: Save };

export interface Applied {
  readonly state: HostState;
  readonly effects: readonly Effect[];
  /** A reason, never silence (R-18). */
  readonly rejected?: string;
}

const reject = (state: HostState, reason: string): Applied => ({ state, effects: [], rejected: reason });
const ok = (state: HostState, effects: readonly Effect[] = []): Applied => ({ state, effects });

/**
 * Who may send what (R-136): **the party is the players', the world is the GM's**.
 *
 * Fail closed by construction — the last line is `false`, so a role nobody
 * thought about changes nothing, and an intent nobody classified is GM-only
 * (R-18a).
 *
 * A spectator holds no seat and moves nothing. That is not a technicality: the
 * party belongs to the *players*, so acting on it takes a player's screen. Since
 * the table seat is not exclusive (R-127), every real player screen has one.
 */
function permitted(role: Role, kind: Intent['kind']): boolean {
  if (role === 'gm') return true;
  if (role === 'table') return OPEN_TO_THE_TABLE.has(kind);
  return false;
}

/**
 * Intents the **table seat** may send as well as the GM.
 *
 * Deliberately an allow-list of the *open* intents rather than of the mutating
 * ones. An allow-list of mutations fails open: add an intent, forget to list it,
 * and it is silently permitted for the table display with nothing to notice.
 * This way a new intent is GM-only until someone decides otherwise (R-18a), and
 * a test enumerates `IntentSchema` to force the decision.
 *
 * These three are everything about the party's own pawns, and nothing else
 * (R-136).
 */
const OPEN_TO_THE_TABLE = new Set<Intent['kind']>([
  'moveParty', 'movePartyMember', 'setPartyTogether',
]);

/**
 * Applies one intent.
 *
 * `now` is an ISO timestamp the **host** supplies. `sim` has no clock (R-97), and
 * a save has to record when it was written, so the time arrives as an argument
 * like everything else.
 */
/**
 * The state that results from opening a campaign together with its live save.
 *
 * Pure, and deliberately here rather than in the host: choosing whether to reuse
 * a stored save, mint a fresh one, or prune stale place ids from it is a rule, and
 * rules do not live in `apps/host` (R-67). The host reads the files and hands
 * the results over.
 */
export function openedWith(
  state: HostState,
  stored: Campaign,
  storedSave: Save | null,
  savedAt: string,
  placeIds: ReadonlySet<PlaceId>,
): { readonly state: HostState; readonly toPersist: Save | null } {
  // Stamped on adoption so the next write does not claim an older schema than
  // the data it holds (R-137).
  const campaign = upgradedCampaign(stored);
  const usable = storedSave && belongsTo(storedSave, campaign) ? storedSave : null;
  const save = usable
    ? upgraded(pruneMembers(pruneDiscovery(usable, placeIds), new Set(campaign.party.map((m) => m.id))))
    : createLiveSave(campaign, savedAt);
  return {
    state: { ...state, active: campaign, activeSave: save },
    toPersist: save !== usable ? save : null,
  };
}

/**
 * Applies one intent, recording undo history around it.
 *
 * The snapshot is taken **here**, by comparing campaign identity before and
 * after, rather than inside each handler. Two reasons: immutable edits mean
 * identity changing *is* the definition of "the campaign was edited" (R-12), and
 * a hook nobody has to remember cannot be forgotten when the twenty-ninth intent
 * arrives (D-169, R-23b's lesson).
 */
export function apply(state: HostState, role: Role, intent: Intent, now: string): Applied {
  const result = applyIntent(state, role, intent, now);
  if (result.rejected) return result;

  // Undo and redo write their own history; the hook below would otherwise see
  // the campaign change and record stepping back as another edit.
  if (intent.kind === 'undo' || intent.kind === 'redo') return result;

  const before = state.active;
  const after = result.state.active;

  // A different campaign is open (created, opened, closed, duplicated, deleted):
  // history belongs to one campaign, so it starts again rather than letting
  // cmd+z reach back into a world the GM is no longer looking at.
  if (before?.id !== after?.id) {
    return { ...result, state: { ...result.state, history: emptyHistory() } };
  }
  if (!before || before === after) return result;

  const stroke = 'stroke' in intent ? intent.stroke ?? null : null;
  return {
    ...result,
    state: { ...result.state, history: remember(state.history, before, stroke) },
  };
}

function applyIntent(state: HostState, role: Role, intent: Intent, now: string): Applied {
  if (!permitted(role, intent.kind)) {
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
      // A campaign is never open without a live save: it is what discovery is
      // recorded in, and the table sees nothing at all until one exists.
      const live = createLiveSave(campaign, now);
      return ok(
        {
          ...state,
          campaigns: [...state.campaigns, { id: campaign.id, name: campaign.name }],
          active: campaign,
          activeSave: live,
        },
        [{ kind: 'saveCampaign', campaign }, { kind: 'saveSave', save: live }],
      );
    }

    case 'openCampaign': {
      if (!state.campaigns.some((c) => c.id === intent.id)) return reject(state, 'no such campaign');
      return ok(state, [{ kind: 'loadCampaign', id: intent.id }]);
    }

    case 'undo':
    case 'redo': {
      if (!state.active) return reject(state, 'no campaign is open');
      const stepped = intent.kind === 'undo'
        ? undone(state.history, state.active)
        : redone(state.history, state.active);
      if (!stepped) {
        return reject(state, intent.kind === 'undo' ? 'nothing to undo' : 'nothing to redo');
      }
      // The history is written here rather than by `apply`'s boundary hook,
      // which would otherwise see the campaign change and record the undo
      // itself as an edit.
      return ok(
        { ...state, active: stepped.campaign, history: stepped.history },
        [{ kind: 'saveCampaign', campaign: stepped.campaign }],
      );
    }

    case 'closeCampaign':
      return ok({ ...state, active: null, activeSave: null });

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
      // The copy gets its own fresh live save. Discovery is deliberately NOT
      // carried over: a duplicate is a new campaign with new ids (D-109), so the
      // party has not been anywhere in it.
      const copyLive = createLiveSave(copy, now);
      return ok(
        {
          ...state,
          campaigns: [...state.campaigns, { id: copy.id, name: copy.name }],
          active: null,
          activeSave: null,
        },
        [{ kind: 'saveCampaign', campaign: copy }, { kind: 'saveSave', save: copyLive }],
      );
    }

    case 'deleteCampaign': {
      if (!state.campaigns.some((c) => c.id === intent.id)) return reject(state, 'no such campaign');
      const closing = state.active?.id === intent.id;
      return ok(
        {
          ...state,
          campaigns: state.campaigns.filter((c) => c.id !== intent.id),
          // Deleting the open campaign closes it rather than leaving a ghost.
          active: closing ? null : state.active,
          activeSave: closing ? null : state.activeSave,
        },
        // The host trashes the campaign's saves alongside it; an orphaned save
        // would otherwise sit in the store forever pointing at nothing.
        [{ kind: 'removeCampaign', id: intent.id }],
      );
    }

    default:
      return applyToCampaign(state, intent, now);
  }
}

// -- everything below needs an open campaign ---------------------------------

function applyToCampaign(state: HostState, intent: Intent, now: string): Applied {
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
      return applyToPois(state, campaign, intent, commit, now);
  }
}

// -- points of interest ------------------------------------------------------

function applyToPois(
  state: HostState,
  campaign: Campaign,
  intent: Intent,
  commit: (next: Campaign) => Applied,
  now: string,
): Applied {
  const reject_ = (reason: string): Applied => reject(state, reason);
  const withPlaces = (places: Campaign['places']): Applied =>
    (places === campaign.places ? ok(state) : commit({ ...campaign, places }));

  /** Every place intent but `addPlace` names one, so resolve it once. */
  const target = (id: string): PlaceId | null => (placeById(campaign.places, id as PlaceId) ? (id as PlaceId) : null);

  switch (intent.kind) {
    case 'addPlace': {
      if (!isValidPlaceCell(intent.cell)) return reject_('that is not a cell in a chunk');
      if (!chunkAt(campaign.world, { cx: intent.cell.cx, cz: intent.cell.cz })) {
        return reject_('that chunk does not exist');
      }
      if (placeAt(campaign.places, intent.cell)) return reject_('there is already a place here');
      if (intent.markerId && !isKnownMarker(parseMarkerId(intent.markerId))) {
        return reject_(`unknown marker: ${intent.markerId}`);
      }
      const marker = intent.markerId ? parseMarkerId(intent.markerId) : undefined;
      return withPlaces(addPlace(campaign.places, intent.cell, intent.name, marker));
    }

    case 'renamePlace': {
      const id = target(intent.id);
      if (!id) return reject_('no such place');
      return withPlaces(renamePlace(campaign.places, id, intent.name));
    }

    case 'setPlaceMarker': {
      const id = target(intent.id);
      if (!id) return reject_('no such place');
      const marker = parseMarkerId(intent.markerId);
      if (!isKnownMarker(marker)) return reject_(`unknown marker: ${intent.markerId}`);
      return withPlaces(setPlaceMarker(campaign.places, id, marker));
    }

    case 'movePlace': {
      const id = target(intent.id);
      if (!id) return reject_('no such place');
      if (!isValidPlaceCell(intent.cell)) return reject_('that is not a cell in a chunk');
      if (!chunkAt(campaign.world, { cx: intent.cell.cx, cz: intent.cell.cz })) {
        return reject_('that chunk does not exist');
      }
      const occupant = placeAt(campaign.places, intent.cell);
      if (occupant && occupant.id !== id) return reject_('there is already a place there');
      return withPlaces(movePlace(campaign.places, id, intent.cell));
    }

    case 'removePlace': {
      const id = target(intent.id);
      if (!id) return reject_('no such place');
      return withPlaces(removePlace(campaign.places, id));
    }

    case 'addNote': {
      const id = target(intent.placeId);
      if (!id) return reject_('no such place');
      return withPlaces(addNote(campaign.places, id, intent.text, intent.visibleToParty ?? false));
    }

    case 'editNote':
    case 'setNoteVisible':
    case 'removeNote':
    case 'moveNote': {
      const id = target(intent.placeId);
      if (!id) return reject_('no such place');
      const place = placeById(campaign.places, id);
      if (!place?.notes.some((note) => note.id === intent.noteId)) return reject_('no such note');
      const noteId = intent.noteId as NoteId;
      switch (intent.kind) {
        case 'editNote': return withPlaces(editNote(campaign.places, id, noteId, intent.text));
        case 'setNoteVisible':
          return withPlaces(setNoteVisible(campaign.places, id, noteId, intent.visibleToParty));
        case 'removeNote': return withPlaces(removeNote(campaign.places, id, noteId));
        default: return withPlaces(moveNote(campaign.places, id, noteId, intent.delta));
      }
    }

    case 'addPoi': {
      const id = target(intent.placeId);
      if (!id) return reject_('no such place');
      return withPlaces(addPoi(campaign.places, id, intent.name, intent.visibleToParty ?? false));
    }

    case 'renamePoi':
    case 'setPoiVisible':
    case 'removePoi':
    case 'movePoi': {
      const id = target(intent.placeId);
      if (!id) return reject_('no such place');
      const place = placeById(campaign.places, id);
      if (!place?.pois.some((e) => e.id === intent.poiId)) {
        return reject_('no such poi');
      }
      const poiId = intent.poiId as PoiId;
      switch (intent.kind) {
        case 'renamePoi':
          return withPlaces(renamePoi(campaign.places, id, poiId, intent.name));
        case 'setPoiVisible':
          return withPlaces(setPoiVisible(campaign.places, id, poiId, intent.visibleToParty));
        case 'removePoi':
          return withPlaces(removePoi(campaign.places, id, poiId));
        default:
          return withPlaces(movePoi(campaign.places, id, poiId, intent.delta));
      }
    }

    case 'setBlock':
    case 'clearBlock':
    case 'fillMaterial':
    case 'growMap':
      return applyToMap(campaign, intent, withPlaces, reject_);

    default:
      return applyToDiscovery(state, campaign, intent, now);
  }
}

/**
 * The party may only stand in a Known chunk (R-131).
 *
 * Not a permission rule (R-136): the GM is refused too. The party has not been
 * there, and that is a fact about the party rather than about who is asking.
 *
 * One message for both refusals, though the distinction would leak nothing — the
 * table already receives `unknownChunks` as coordinates (D-140), so it can
 * already tell authored-but-unknown from unauthored.
 */
function reachable(state: HostState, campaign: Campaign, cell: WorldCell): string | null {
  if (!isValidWorldCell(cell)) return 'that is not a cell';
  const coord = chunkOf(cell);
  if (!isAuthored(campaign.world, coord)) return 'the party has not been there';
  if (!state.activeSave || !isChunkKnown(state.activeSave.discovery, coord)) {
    return 'the party has not been there';
  }
  return null;
}

/** Is any pawn standing in this chunk? Used to refuse un-Knowing it (R-131). */
function partyOccupies(state: HostState, campaign: Campaign, coord: ChunkCoord): boolean {
  if (!state.activeSave) return false;
  return pawns(state.activeSave.placement, campaign.party)
    .some((pawn) => pawn.cell.cx === coord.cx && pawn.cell.cz === coord.cz);
}

/**
 * A point of interest's map (D-183).
 *
 * Every one of these needs the same two lookups — is that place real, is that
 * point of interest on it — so they share a branch rather than repeating the
 * guard four times and getting it subtly different in one of them.
 */
function applyToMap(
  campaign: Campaign,
  intent: Extract<Intent, { kind: 'setBlock' | 'clearBlock' | 'fillMaterial' | 'growMap' }>,
  withPlaces: (places: readonly Place[]) => Applied,
  reject_: (reason: string) => Applied,
): Applied {
  const placeId = intent.placeId as PlaceId;
  const place = placeById(campaign.places, placeId);
  if (!place) return reject_('no such place');
  const poiId = intent.poiId as PoiId;
  const poi = poiOfPlace(place, poiId);
  if (!poi) return reject_('no such point of interest');

  // Unreachable on the host: a point of interest is created with its map and
  // anything read without one gains it at the open boundary (D-187). Kept
  // because `map` is still nullable in the type — the table is sent none
  // (D-184) — and a narrowing that throws would take the message handler with
  // it. If this ever fires, the boundary leaked, so say so (R-18).
  if (!poi.map) return reject_('that point of interest has no map');

  if (intent.kind === 'growMap') {
    return withPlaces(growPoiMap(campaign.places, placeId, poiId, intent.axis));
  }

  const at = { x: intent.x, y: intent.y, z: intent.z };
  if (!inMap(poi.map, at)) return reject_('that is outside the map');

  if (intent.kind === 'clearBlock') {
    return withPlaces(clearMapBlock(campaign.places, placeId, poiId, at));
  }
  const materialId = intent.materialId as MaterialId;
  if (!isKnownMaterial(materialId)) return reject_('unknown material');
  if (intent.kind === 'fillMaterial') {
    return withPlaces(fillPoiMaterial(campaign.places, placeId, poiId, at, materialId));
  }
  return withPlaces(setMapBlock(campaign.places, placeId, poiId, at, materialId));
}

// -- what the party knows ---------------------------------------------------

function applyToDiscovery(
  state: HostState,
  campaign: Campaign,
  intent: Intent,
  now: string,
): Applied {
  const save = state.activeSave;
  if (!save) return reject(state, 'no save is open');
  // The pairing is checked here as well as in viewFor: a save from another
  // campaign would apply one world's discovery to another's contents.
  if (save.campaignId !== campaign.id) return reject(state, 'that save belongs to another campaign');

  const commitSave = (next: Save): Applied => {
    if (next === save) return ok(state);
    const stamped = touch(next, now);
    return ok({ ...state, activeSave: stamped }, [{ kind: 'saveSave', save: stamped }]);
  };

  const commitDiscovery = (discovery: Save['discovery']): Applied =>
    commitSave(withDiscovery(save, discovery));

  switch (intent.kind) {
    case 'setChunkKnown': {
      const coord = { cx: intent.cx, cz: intent.cz };
      if (!isAuthored(campaign.world, coord)) return reject(state, 'that chunk does not exist');
      // R-131 has to stay true at all times, or movement is built on nothing.
      if (!intent.known && partyOccupies(state, campaign, coord)) {
        return reject(state, 'the party is standing there');
      }
      return commitDiscovery(setChunkKnown(save.discovery, coord, intent.known));
    }

    case 'setPlaceRevealed': {
      const id = intent.placeId as PlaceId;
      if (!placeById(campaign.places, id)) return reject(state, 'no such place');
      return commitDiscovery(setPlaceRevealed(save.discovery, id, intent.revealed));
    }

    case 'revealChunk': {
      const coord = { cx: intent.cx, cz: intent.cz };
      if (!isAuthored(campaign.world, coord)) return reject(state, 'that chunk does not exist');
      let discovery = setChunkKnown(save.discovery, coord, true);
      if (intent.withPlaces) {
        const ids = placesInChunk(campaign.places, coord).map((place) => place.id);
        discovery = setPlacesRevealed(discovery, ids, true);
      }
      return commitDiscovery(discovery);
    }

    case 'moveParty': {
      const why = reachable(state, campaign, intent.cell);
      if (why) return reject(state, why);
      return commitSave(withPlacement(save, withGroupAt(save.placement, intent.cell)));
    }

    case 'movePartyMember': {
      const id = intent.memberId as MemberId;
      if (!campaign.party.some((member) => member.id === id)) return reject(state, 'no such member');
      if (save.placement.together) return reject(state, 'the party is together — separate them first');
      const why = reachable(state, campaign, intent.cell);
      if (why) return reject(state, why);
      return commitSave(withPlacement(save, withMemberAt(save.placement, id, intent.cell)));
    }

    case 'setPartyTogether': {
      if (save.placement.together === intent.together) return ok(state);
      const next = intent.together
        ? gathered(save.placement, campaign.party)
        : scattered(save.placement, campaign.party);
      return commitSave(withPlacement(save, next));
    }

    default:
      return reject(state, `unhandled intent: ${(intent as { kind: string }).kind}`);
  }
}


