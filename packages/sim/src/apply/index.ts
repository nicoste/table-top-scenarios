// The authoritative simulation. Completely pure (R-97): no clock, no filesystem,
// no socket, no randomness reachable from here. Everything arrives as an
// argument and everything leaves as a return value.

import type { Campaign, ChunkCoord, WorldCell } from '@tt/domain';
import type {
  PartyMember, PlaceId, NoteId, PoiId, PlaneId, MemberId, SwatchId, Save, Place, Footing, Tokens,
  TokensLibrary, ImageId, Prefab, Prefabs, Facing, BlockCoord,
} from '@tt/domain';
import {
  createCampaign, duplicateCampaign, uniqueCampaignName, createMember, editMember, removeMember,
  addChunk, chunkAt, isCreatableSlot, isKnownCover,
  toGlobal, paintArea, coverArea, setHeightArea, raiseArea,
  addPlace, renamePlace, setPlaceMarker, movePlace, removePlace, placeById, placeAt, isValidPlaceCell,
  asFacing,
  addNote, editNote, setNoteVisible, removeNote, moveNote, isKnownMarker,
  addPoi, renamePoi, setPoiVisible, removePoi, movePoi,
  setMapBlocks, paintMapBlocks, clearMapBlocks, fillPoiMaterial, growPoiMap,
  inMap, blockAt, isKnownSwatch,
  MAP_MAX_HEIGHT, MAP_MIN_DEPTH,
  addPoiPlane, renamePoiPlane, movePoiPlane, removePoiPlane,
  validPlaneY, planeAt, planeById, clampRange, settleRange, rangeFor, isPoiOnTable,
  poiById as poiOfPlace,
  createLiveSave, withDiscovery, withPlacement, touch, upgraded, upgradedCampaign, belongsTo,
  pruneDiscovery, pruneMembers, enteringMap, leavingMap, withRange, pruneInside, pruneRanges,
  withLighting, withTravelling, withPoiAmbience,
  settleRanges,
  pawns, withGroupAt, withMemberAt, gathered, scattered,
  isValidWorldCell, chunkOf, isChunkKnown,
  setChunkKnown, setPlaceRevealed, setPlacesRevealed, isAuthored, placesInChunk,
  NO_TOKENS, tokensFor, withTokens, settleTokens, pruneTokens, onRoster, whyNotStand, placeToken,
  standsInBand, clearOfTokens,
  exploredIn, pruneExplored, lookAround, blockKey, forgetMap,
  addTemplate, editTemplate, removeTemplate, templateById,
  silverIn, withSilver, withoutStrays, onLibrary, silverCubes, whyNotPlace,
  spawnSilver, moveSilver, renameSilver, hideSilver, removeSilver, noteSilver, lightSilver,
  withStageOrder, tidyOrder, withNoteOn, withLightOn, openedIn,
  capturePrefab, prefabById, addPrefab, editPrefab, removePrefab, stampPrefab, editPoiMap,
  propType, propById, propCubes, whyNotPut, putProp, editProp, removeProp, propRules, withOpen, tidyOpened,
  areasIn, withAreas, drawArea, editArea, removeArea, areaAt, tidyAreas,
} from '@tt/domain';
import type { HostState, Intent, Role } from '@tt/protocol';
import { parseGround, parseCover, parseMarkerId, travellingFromWire } from '@tt/protocol';
import { emptyHistory, remember, undone, redone } from '../history/index.js';

/** Side effects `sim` asks the host to perform. It performs none itself. */
export type Effect =
  | { readonly kind: 'saveCampaign'; readonly campaign: Campaign }
  | { readonly kind: 'loadCampaign'; readonly id: string }
  | { readonly kind: 'removeCampaign'; readonly id: string }
  | { readonly kind: 'saveSave'; readonly save: Save }
  /** The Tokens Library changed (D-307). It lives beside the campaigns. */
  | { readonly kind: 'saveLibrary'; readonly library: TokensLibrary }
  /** A prefab was saved or renamed (D-321). One file each, beside the campaigns. */
  | { readonly kind: 'savePrefab'; readonly prefab: Prefab }
  /** A prefab left the library. Nothing placed from it changes: a stamp, not a link. */
  | { readonly kind: 'removePrefab'; readonly id: string };

export interface Applied {
  readonly state: HostState;
  readonly effects: readonly Effect[];
  /** A reason, never silence (R-18). */
  readonly rejected?: string;
}

const reject = (state: HostState, reason: string): Applied => ({ state, effects: [], rejected: reason });
const ok = (state: HostState, effects: readonly Effect[] = []): Applied => ({ state, effects });

/**
 * Adopts an edited save: stamps it and emits the write.
 *
 * Module-level rather than a closure inside one handler, because a branch that
 * changes the save and forgets the effect looks like it worked and loses the
 * change on the next reload. It was a closure, and the second caller for it
 * nearly shipped without one.
 */
function commitSave(state: HostState, previous: Save, next: Save, now: string): Applied {
  if (next === previous) return ok(state);
  const stamped = touch(next, now);
  return ok({ ...state, activeSave: stamped }, [{ kind: 'saveSave', save: stamped }]);
}

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
 * Four are everything about the party's own pawns (R-136): where they stand
 * on the world, whether they stand together, and where each stands inside the
 * map they are in (R-184). The other three are the players' own **areas**
 * (D-322, D-344) — the first thing the table may make that is not a pawn —
 * drawn, moved and taken away in the map the party is in, on what they have
 * seen; the GM's areas and anything hidden stay out of reach (`applyToAreas`).
 */
const OPEN_TO_THE_TABLE = new Set<Intent['kind']>([
  'moveParty', 'movePartyMember', 'setPartyTogether', 'moveToken',
  'placeArea', 'editArea', 'removeArea',
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
  const memberIds = new Set(campaign.party.map((m) => m.id));
  // Every point of interest still in the campaign; a band or a position
  // belonging to one the GM deleted is dropped here rather than kept forever
  // (R-9's tolerance, `pruneDiscovery`'s reason).
  const poiIds = new Set(campaign.places.flatMap((place) => place.pois.map((poi) => poi.id as string)));
  const save = usable
    ? upgraded(pruneTokens(settleRanges(pruneRanges(
      pruneInside(
        pruneMembers(pruneDiscovery(usable, placeIds), memberIds),
        (placeId, poiId) => {
          const place = placeById(campaign.places, placeId);
          return !!place && !!poiOfPlace(place, poiId);
        },
      ),
      poiIds,
    ),
    // A band stored when one could sit between levels comes to rest on a
    // level here, once, on the way in (R-161).
    (poiId) => campaign.places
      .flatMap((place) => place.pois)
      .find((poi) => (poi.id as string) === poiId)?.map?.planes ?? null),
    // Where removed members stood, and positions in maps that are gone
    // (R-184). Read through the roster until now, so this is tidying, not
    // a correction (`onRoster`).
    poiIds, memberIds))
    : createLiveSave(campaign, savedAt);
  /*
   * Silver tokens of library entries deleted while this campaign was closed,
   * and of maps that are gone (D-307): deleting an entry takes its tokens in
   * every campaign, and this is where the ones not open at the time catch up.
   */
  const live = new Set(state.library.map((template) => template.id as string));
  // Then the numbers of anybody no longer on stage there (R-208).
  const ordered = tidyOrder(withoutStrays(save, poiIds, live), poiIds, memberIds as ReadonlySet<string>);
  // And what was open of props that are gone, or of maps that are (D-322).
  const propsOf = new Map(campaign.places.flatMap((place) => place.pois)
    .map((poi) => [poi.id as string, new Set((poi.map?.props ?? []).map((prop) => prop.id as string))] as const));
  // And the areas of maps that are gone (D-341).
  const tidied = tidyAreas(tidyOpened(ordered, (poiId) => propsOf.get(poiId) ?? null), poiIds as ReadonlySet<string>);
  // What was seen of maps that are gone, and then a look around: a save from
  // before vision has seen nothing, and the party standing in a map should
  // see it the moment the campaign opens (D-273).
  const seen = lookAround(pruneExplored(tidied, poiIds), campaign);
  return {
    state: { ...state, active: campaign, activeSave: seen },
    toPersist: seen !== usable ? seen : null,
  };
}

/**
 * Applies one intent, recording undo history around it.
 *
 * The snapshot is taken **here**, by comparing campaign identity before and
 * after, rather than inside each handler. Two reasons: immutable edits mean
 * identity changing *is* the definition of "the campaign was edited" (R-165), and
 * a hook nobody has to remember cannot be forgotten when the twenty-ninth intent
 * arrives (D-169, R-23b's lesson).
 */
export function apply(state: HostState, role: Role, intent: Intent, now: string): Applied {
  const result = recorded(state, role, intent, now);
  return result.rejected ? result : lookingAround(result, now);
}

/**
 * The party looks around after anything that went through (R-15, D-273).
 *
 * Here rather than in the handlers, for the reason the undo hook below is: a
 * hook nobody has to remember cannot be forgotten. What the party sees depends
 * on where they stand, the blocks, the roster's ranges and which map they are
 * in, and nearly every kind of intent can change one of those — undo included.
 * Asking costs a lookup when none of them changed, because sight is kept per
 * body, tokens and roster.
 *
 * A save it grows replaces any write the intent already asked for, so one
 * intent is one write.
 */
function lookingAround(result: Applied, now: string): Applied {
  const { active, activeSave } = result.state;
  if (!active || !activeSave) return result;
  const seen = lookAround(activeSave, active);
  if (seen === activeSave) return result;
  const stamped = touch(seen, now);
  return {
    ...result,
    state: { ...result.state, activeSave: stamped },
    effects: [...result.effects.filter((effect) => effect.kind !== 'saveSave'), { kind: 'saveSave', save: stamped }],
  };
}

function recorded(state: HostState, role: Role, intent: Intent, now: string): Applied {
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

    case 'addTemplate':
    case 'editTemplate':
    case 'removeTemplate':
      return applyToLibrary(state, intent, now);

    case 'editPrefab':
    case 'removePrefab':
      return applyToPrefabs(state, intent);

    default:
      return applyToCampaign(state, role, intent, now);
  }
}

// -- the Tokens Library -------------------------------------------------------

/**
 * The library shared by every campaign (D-307). Needs no campaign open, and
 * writes no campaign history: campaign undo cannot reach something that is
 * not in the campaign, and the GM did not want undo for menu construction.
 *
 * **Removing an entry removes every token placed from it** (D-307): here for
 * the campaign that is open, and on opening for the rest (`withoutStrays`).
 */
function applyToLibrary(
  state: HostState,
  intent: Extract<Intent, { kind: 'addTemplate' | 'editTemplate' | 'removeTemplate' }>,
  now: string,
): Applied {
  const library = state.library;
  const commitLibrary = (next: TokensLibrary, also: readonly Effect[] = []): Applied => (next === library
    ? ok(state)
    : ok({ ...state, library: next }, [{ kind: 'saveLibrary', library: next }, ...also]));

  switch (intent.kind) {
    case 'addTemplate':
      return commitLibrary(addTemplate(library, {
        ...(intent.name !== undefined ? { name: intent.name } : {}),
        ...(intent.tags !== undefined ? { tags: intent.tags } : {}),
        ...(intent.image !== undefined ? { image: intent.image as ImageId | null } : {}),
        ...(intent.url !== undefined ? { url: intent.url } : {}),
      }));

    case 'editTemplate': {
      if (!templateById(library, intent.id)) return reject(state, 'no such token in the library');
      return commitLibrary(editTemplate(library, intent.id, {
        ...(intent.name !== undefined ? { name: intent.name } : {}),
        ...(intent.tags !== undefined ? { tags: intent.tags } : {}),
        ...(intent.image !== undefined ? { image: intent.image as ImageId | null } : {}),
        ...(intent.url !== undefined ? { url: intent.url } : {}),
      }));
    }

    case 'removeTemplate': {
      if (!templateById(library, intent.id)) return reject(state, 'no such token in the library');
      const next = removeTemplate(library, intent.id);
      const save = state.activeSave;
      if (!save) return commitLibrary(next);
      // The open campaign's tokens go now; the others' when they next open.
      const live = new Set(next.map((template) => template.id as string));
      let swept = save;
      for (const [poiId, silver] of save.silver) swept = withSilver(swept, poiId, onLibrary(silver, live));
      if (swept === save) return commitLibrary(next);
      const stamped = touch(swept, now);
      return ok(
        { ...state, library: next, activeSave: stamped },
        [{ kind: 'saveLibrary', library: next }, { kind: 'saveSave', save: stamped }],
      );
    }

    default:
      return ok(state);
  }
}

// -- the Prefabs library ----------------------------------------------------

/**
 * Renaming, retagging and removing a prefab (D-321). Needs no campaign open
 * and writes no campaign history, for the Tokens Library's reason: it is not
 * in the campaign. Removing one changes nothing placed from it.
 */
function applyToPrefabs(
  state: HostState,
  intent: Extract<Intent, { kind: 'editPrefab' | 'removePrefab' }>,
): Applied {
  if (!prefabById(state.prefabs, intent.id)) return reject(state, 'no such prefab');
  if (intent.kind === 'removePrefab') {
    return ok({ ...state, prefabs: removePrefab(state.prefabs, intent.id) }, [{ kind: 'removePrefab', id: intent.id }]);
  }
  const next = editPrefab(state.prefabs, intent.id, {
    ...(intent.name !== undefined ? { name: intent.name } : {}),
    ...(intent.tags !== undefined ? { tags: intent.tags } : {}),
  });
  if (next === state.prefabs) return ok(state);
  return ok({ ...state, prefabs: next }, [{ kind: 'savePrefab', prefab: prefabById(next, intent.id)! }]);
}

/** A new prefab into the library, and onto the disk. */
function savedPrefab(state: HostState, prefabs: Prefabs, prefab: Prefab): Applied {
  return ok({ ...state, prefabs: addPrefab(prefabs, prefab) }, [{ kind: 'savePrefab', prefab }]);
}

// -- everything below needs an open campaign ---------------------------------

function applyToCampaign(state: HostState, role: Role, intent: Intent, now: string): Applied {
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

    case 'paintGround': {
      const anchorChunk = { cx: intent.cx, cz: intent.cz };
      if (!chunkAt(campaign.world, anchorChunk)) return reject(state, 'that chunk does not exist');
      // The same guard a cube gets (R-176): a swatch the registry does not
      // know is refused rather than painted and discovered later.
      const ground = parseGround(intent.ground);
      if (!isKnownSwatch(ground)) {
        return reject(state, `unknown ground: ${intent.ground}`);
      }
      // A brush wider than one cell can cross into neighbouring chunks; cells in
      // chunks that do not exist are skipped, never created.
      const at = toGlobal(anchorChunk, intent.x, intent.z);
      return commitWorld(paintArea(campaign.world, at, intent.size ?? 1, ground));
    }

    case 'paintCover': {
      const anchorChunk = { cx: intent.cx, cz: intent.cz };
      if (!chunkAt(campaign.world, anchorChunk)) return reject(state, 'that chunk does not exist');
      // Null is the eraser and is always allowed; anything else has to be in
      // the registry, the same guard a ground gets (R-193).
      const cover = intent.cover === null ? null : parseCover(intent.cover);
      if (intent.cover !== null && (!cover || !isKnownCover(cover))) {
        return reject(state, `unknown cover: ${intent.cover}`);
      }
      const at = toGlobal(anchorChunk, intent.x, intent.z);
      return commitWorld(coverArea(campaign.world, at, intent.size ?? 1, cover));
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
      // Not checked against the store: `sim` has no I/O (R-97), and a name
      // with no picture behind it draws as the colour, which is the answer
      // the GM would get anyway.
      if (intent.image !== undefined) patch.image = intent.image;
      return commit({ ...campaign, party: editMember(campaign.party, id, patch) });
    }

    case 'removeMember': {
      const id = intent.id as PartyMember['id'];
      if (!campaign.party.some((m) => m.id === id)) return reject(state, 'no such party member');
      const party = removeMember(campaign.party, id);
      if (party === campaign.party) return reject(state, 'the party cannot be empty');
      return commit({ ...campaign, party });
    }

    case 'noteMember': {
      // Play state, not the campaign: not undoable, like a silver token's
      // note (R-140). The note stays when its member is removed and goes
      // when the campaign next opens, so undoing a removal brings it back.
      const save = state.activeSave;
      if (!save) return reject(state, 'no save is open');
      if (!campaign.party.some((m) => m.id === intent.id)) return reject(state, 'no such party member');
      return commitSave(state, save, withNoteOn(save, intent.id, intent.note), now);
    }

    case 'carryLight': {
      // Play state, as the note is (R-140): a torch lit is not a building
      // edit to take back. Kept when its member is removed, for the note's
      // reason, and dropped when the campaign next opens (D-335).
      const save = state.activeSave;
      if (!save) return reject(state, 'no save is open');
      if (!campaign.party.some((m) => m.id === intent.id)) return reject(state, 'no such party member');
      return commitSave(state, save, withLightOn(save, intent.id, intent.light), now);
    }

    case 'moveToken':
      return applyToTokens(state, campaign, role, intent, now);

    case 'spawnSilver':
    case 'moveSilver':
    case 'renameSilver':
    case 'hideSilver':
    case 'removeSilver':
    case 'noteSilver':
    case 'lightSilver':
      return applyToSilver(state, campaign, intent, now);

    case 'placeArea':
    case 'editArea':
    case 'removeArea':
      return applyToAreas(state, campaign, role, intent, now);

    case 'setOrder': {
      // Anybody on stage in that map: a member of the roster, or one of its
      // silver tokens (R-208). Any map — the GM may line a fight up early.
      const save = state.activeSave;
      if (!save) return reject(state, 'no save is open');
      const place = placeById(campaign.places, intent.placeId as PlaceId);
      if (!place) return reject(state, 'no such place');
      const poi = poiOfPlace(place, intent.poiId as PoiId);
      if (!poi) return reject(state, 'no such point of interest');
      const known = campaign.party.some((member) => member.id === intent.id)
        || silverIn(save, poi.id).some((token) => token.id === intent.id);
      if (!known) return reject(state, 'nobody by that id is on stage there');
      return commitSave(state, save, withStageOrder(save, poi.id, intent.id, intent.order), now);
    }

    case 'forgetMap': {
      // A fresh start (D-277). Not undoable, like everything else about play
      // state (R-140): the console asks first instead (R-151).
      const save = state.activeSave;
      if (!save) return reject(state, 'no save is open');
      const place = placeById(campaign.places, intent.placeId as PlaceId);
      if (!place) return reject(state, 'no such place');
      const poi = poiOfPlace(place, intent.poiId as PoiId);
      if (!poi) return reject(state, 'no such point of interest');
      return commitSave(state, save, forgetMap(save, poi.id), now);
    }

    default:
      return applyToPois(state, campaign, intent, commit, now);
  }
}

// -- areas --------------------------------------------------------------------

/**
 * Areas on a map (D-341): drawn, changed and taken away as play, in the save,
 * which undo leaves alone (R-140). One may follow anybody standing in that
 * map, gold or silver.
 */
function applyToAreas(
  state: HostState,
  campaign: Campaign,
  role: Role,
  intent: Extract<Intent, { kind: 'placeArea' | 'editArea' | 'removeArea' }>,
  now: string,
): Applied {
  const save = state.activeSave;
  if (!save) return reject(state, 'no save is open');
  const place = placeById(campaign.places, intent.placeId as PlaceId);
  if (!place) return reject(state, 'no such place');
  const poi = poiOfPlace(place, intent.poiId as PoiId);
  if (!poi) return reject(state, 'no such point of interest');
  if (!poi.map) return reject(state, 'that point of interest has no map');
  const map = poi.map;
  const areas = areasIn(save, poi.id);
  const commitAreas = (next: typeof areas): Applied => commitSave(state, save, withAreas(save, poi.id, next), now);
  const standing = (id: string) =>
    tokensFor(save, poi.id).get(id as PartyMember['id']) ?? silverIn(save, poi.id).find((token) => token.id === id)?.at ?? null;
  /*
   * The table (D-344): only in the map the party is in, only on what it was
   * sent — inside the band, on ground the party has seen, the checks a token's
   * move makes and for its reason (R-85) — and only its own areas. One the GM
   * drew, or hid, is "no such area": the table was never told of a hidden one.
   */
  const byTable = role === 'table';
  if (byTable && (save.inside?.placeId !== place.id || save.inside?.poiId !== poi.id)) {
    return reject(state, 'the party is not in that map');
  }
  const seenFromTable = (at: BlockCoord): string | null => {
    if (!standsInBand(rangeFor(save, poi.id), at)) return 'that is outside the levels being shown';
    if (!exploredIn(save, poi.id).has(blockKey(at))) return 'the party has not seen that';
    return null;
  };

  if (intent.kind === 'placeArea') {
    if (!inMap(map, intent.at)) return reject(state, 'that is outside the map');
    const unseen = byTable ? seenFromTable(intent.at) : null;
    if (unseen) return reject(state, unseen);
    return commitAreas(drawArea(areas, { ...intent, byTable }));
  }
  const area = areas.find((one) => one.id === intent.id && (!byTable || (one.byTable && !one.hidden)));
  if (!area) return reject(state, 'no such area in this map');
  if (intent.kind === 'removeArea') return commitAreas(removeArea(areas, area.id));
  /*
   * The table does with its own areas what the GM does (D-347) — moves,
   * renames, recolours, resizes them, and has them follow somebody — except
   * hide one, which would hide it from the players themselves; and it follows
   * only one of the party, never somebody else on stage.
   */
  if (byTable && intent.hidden !== undefined) return reject(state, 'only the GM can do that');
  if (byTable && intent.follows && !campaign.party.some((member) => member.id === intent.follows)) {
    return reject(state, 'an area can only follow one of the party');
  }
  if (byTable && intent.at) {
    const unseen = seenFromTable(intent.at);
    if (unseen) return reject(state, unseen);
  }

  if (intent.at && !inMap(map, intent.at)) return reject(state, 'that is outside the map');
  if (intent.follows && !standing(intent.follows)) return reject(state, 'nobody by that id stands in this map');
  // Let go of, it stays where they stood rather than going back to where it was put.
  const at = intent.at ?? (intent.follows === null && area.follows ? areaAt(area, standing) : undefined);
  return commitAreas(editArea(areas, area.id, {
    ...(at ? { at } : {}),
    ...(intent.aim ? { aim: intent.aim } : {}),
    ...(intent.size !== undefined ? { size: intent.size } : {}),
    ...(intent.colour !== undefined ? { colour: intent.colour } : {}),
    ...(intent.name !== undefined ? { name: intent.name } : {}),
    ...(intent.hidden !== undefined ? { hidden: intent.hidden } : {}),
    ...(intent.follows !== undefined ? { follows: intent.follows } : {}),
  }));
}

// -- props --------------------------------------------------------------------

/** Why a prop cannot stand there, in the words a refusal uses (R-18). */
const PROP_FOOTING = {
  outside: 'that is outside the map',
  solid: 'there is a block there',
  taken: 'something is already there',
  unsupported: 'there is nothing under it to stand on',
  unhung: 'there is no wall behind it to hang on',
} as const;

/**
 * Props in a map (D-322): placed, turned, refinished and removed as building
 * — a campaign edit, so one undo step each — and opened and closed as play,
 * in the save, which undo leaves alone (R-140). All the GM's (D-328).
 *
 * A prop keeps out of every cube somebody stands in, gold or silver, the way
 * a block does (R-186); and a door is not shut on somebody in the doorway.
 */
function applyToProps(
  state: HostState,
  campaign: Campaign,
  intent: Extract<Intent, { kind: 'placeProp' | 'editProp' | 'removeProp' | 'setPropOpen' }>,
  withPlaces: (places: readonly Place[]) => Applied,
  reject_: (reason: string) => Applied,
  now: string,
): Applied {
  const place = placeById(campaign.places, intent.placeId as PlaceId);
  const poi = place ? poiOfPlace(place, intent.poiId as PoiId) : null;
  if (!place || !poi?.map) return reject_('no such map');
  const map = poi.map;
  const standing = new Set<string>([
    ...[...presentIn(state, campaign, intent.placeId, intent.poiId).values()].map(blockKey),
    ...(state.activeSave ? silverCubes(silverIn(state.activeSave, intent.poiId)) : []),
  ]);
  const edited = (change: (m: typeof map) => typeof map) => withPlaces(editPoiMap(campaign.places, place.id, poi.id, change));

  if (intent.kind === 'placeProp') {
    const type = propType(intent.type);
    if (!type) return reject_('no such prop');
    const candidate = { type: type.id, at: intent.at, facing: intent.facing as Facing };
    const why = whyNotPut(map, candidate, standing);
    if (why) return reject_(PROP_FOOTING[why]);
    if (intent.paint !== undefined && !isKnownSwatch(intent.paint as SwatchId)) return reject_('unknown material');
    return edited((m) => putProp(m, {
      ...candidate,
      ...(intent.paint !== undefined ? { paint: intent.paint } : {}),
      ...(intent.flame !== undefined ? { flame: intent.flame } : {}),
    }, standing));
  }

  const prop = propById(map.props, intent.id);
  if (!prop) return reject_('no such prop in this map');

  if (intent.kind === 'removeProp') return edited((m) => removeProp(m, prop.id));

  if (intent.kind === 'editProp') {
    if (intent.facing !== undefined) {
      const why = whyNotPut(map, { ...prop, facing: intent.facing as Facing }, standing, prop.id);
      if (why) return reject_(PROP_FOOTING[why]);
    }
    // Painted with what a block is made of (D-352): one the registry knows.
    if (intent.paint !== undefined && !isKnownSwatch(intent.paint as SwatchId)) return reject_('unknown material');
    return edited((m) => editProp(m, prop.id, {
      ...(intent.facing !== undefined ? { facing: intent.facing as Facing } : {}),
      ...(intent.paint !== undefined ? { paint: intent.paint } : {}),
      ...(intent.flame !== undefined ? { flame: intent.flame } : {}),
      ...(intent.reach !== undefined ? { reach: intent.reach } : {}),
    }, standing));
  }

  // Opening and closing, lighting and putting out: play, not building (R-140).
  const save = state.activeSave;
  if (!save) return reject_('no save is open');
  const type = propType(prop.type);
  if (!type?.opens) return reject_('that does not open');
  // A door is not shut on somebody in the doorway; a torch is lit over anybody.
  if (!intent.open && type.closed.blocksWalking && propCubes(prop).some((cube) => standing.has(blockKey(cube)))) {
    return reject_('somebody is standing in the way');
  }
  return commitSave(state, save, withOpen(save, poi.id, prop.id, intent.open), now);
}

// -- where the party stands inside a map ------------------------------------

/** Why a member cannot stand there, in the words a refusal uses (R-18). */
const FOOTING: Record<Footing, string> = {
  outside: 'that is outside the map',
  solid: 'there is a block there',
  unsupported: 'there is nothing there to stand on',
  taken: 'somebody is already standing there',
  blocked: 'something is in the way there',
};

/**
 * Where a member stands inside the map the party is in (R-184).
 *
 * The party's own, so the table seat may send it (R-136) — into the map the
 * party is actually in, and from the table only inside the band it is shown
 * (R-185), since a token it put outside would stand where its own screen
 * cannot draw it.
 *
 * **The band is checked before the footing, for the table.** Every footing
 * reason describes a cube, and a cube outside the band is one the table was
 * never sent: "there is a block there" about a cube behind the cut would
 * report the very thing the cut is withholding (R-85). Inside the band, the
 * table already holds everything a refusal could mention.
 *
 * **And so is sight** (D-275): the table may only stand somebody in a cube
 * the party has seen. Any block in a cube seen, and the floor under it, is
 * one the table was sent — so past this check, a footing reason is about
 * something on the players' screen, and before it the only answer is one that
 * says nothing about what is there. The GM stands anybody anywhere (R-39).
 */
function applyToTokens(
  state: HostState,
  campaign: Campaign,
  role: Role,
  intent: Extract<Intent, { kind: 'moveToken' }>,
  now: string,
): Applied {
  const save = state.activeSave;
  if (!save) return reject(state, 'no save is open');
  const place = placeById(campaign.places, intent.placeId as PlaceId);
  if (!place) return reject(state, 'no such place');
  const poi = poiOfPlace(place, intent.poiId as PoiId);
  if (!poi) return reject(state, 'no such point of interest');
  if (!poi.map) return reject(state, 'that point of interest has no map');
  // Named by the intent and checked against where the party is, so a move
  // aimed at a room they have since left is refused rather than replayed into
  // the one they are in now.
  if (save.inside?.placeId !== place.id || save.inside?.poiId !== poi.id) {
    return reject(state, 'the party is not in that map');
  }
  const memberId = intent.memberId as MemberId;
  if (!campaign.party.some((member) => member.id === memberId)) {
    return reject(state, 'no such party member');
  }

  if (role === 'table' && !standsInBand(rangeFor(save, poi.id), intent.at)) {
    return reject(state, 'that is outside the levels being shown');
  }
  if (role === 'table' && !exploredIn(save, poi.id).has(blockKey(intent.at))) {
    return reject(state, 'the party has not seen that');
  }
  // Through the roster: a member who has left it stands nowhere, and must not
  // stand in anybody's way either (`onRoster`).
  const standing = onRoster(tokensFor(save, poi.id), campaign.party);
  /*
   * One to a cube, gold or silver (D-307). From the table this can refuse a
   * cube where a goblin the party cannot see is standing — which tells them
   * something is there. Accepted on purpose: bumping into something in the
   * dark is the fiction.
   */
  const others = silverCubes(silverIn(save, poi.id));
  // An open door is a doorway; a shut one is in the way (D-322).
  const opened = openedIn(save, poi.id);
  const why = whyNotStand(poi.map, standing, memberId, intent.at, others, opened);
  if (why) return reject(state, FOOTING[why]);
  return commitSave(
    state, save, withTokens(save, poi.id, placeToken(poi.map, standing, memberId, intent.at, others, opened)), now,
  );
}

/**
 * Everyone in a map who is not the party (R-206): placed from the Tokens
 * Library, moved, renamed, kept off the table, and taken away. All GM-only —
 * they are the world's (R-136) — and all play state, so none of it is under
 * undo (R-140).
 *
 * **Any map, not only the party's.** The GM lays out a cellar while the party
 * is upstairs. What stands in the way of a silver token is the party *present*
 * in the map (a member remembered in a map they left is nobody's obstacle,
 * and is placed again if a goblin takes the cube — D-256) and the other
 * silver tokens.
 */
function applyToSilver(
  state: HostState,
  campaign: Campaign,
  intent: Extract<Intent, {
    kind: 'spawnSilver' | 'moveSilver' | 'renameSilver' | 'hideSilver' | 'removeSilver' | 'noteSilver' | 'lightSilver';
  }>,
  now: string,
): Applied {
  const save = state.activeSave;
  if (!save) return reject(state, 'no save is open');
  const place = placeById(campaign.places, intent.placeId as PlaceId);
  if (!place) return reject(state, 'no such place');
  const poi = poiOfPlace(place, intent.poiId as PoiId);
  if (!poi) return reject(state, 'no such point of interest');
  if (!poi.map) return reject(state, 'that point of interest has no map');
  const map = poi.map;
  const silver = silverIn(save, poi.id);
  const party = presentIn(state, campaign, place.id, poi.id);
  const opened = openedIn(save, poi.id);
  const commitSilver = (next: typeof silver): Applied =>
    commitSave(state, save, withSilver(save, poi.id, next), now);

  if (intent.kind === 'spawnSilver') {
    const template = templateById(state.library, intent.templateId);
    if (!template) return reject(state, 'no such token in the library');
    const why = whyNotPlace(map, party, silver, intent.at, undefined, opened);
    if (why) return reject(state, FOOTING[why]);
    return commitSilver(spawnSilver(map, party, silver, template, intent.at, undefined, opened));
  }

  if (!silver.some((token) => token.id === intent.id)) return reject(state, 'no such token in this map');
  switch (intent.kind) {
    case 'moveSilver': {
      const why = whyNotPlace(map, party, silver, intent.at, intent.id, opened);
      if (why) return reject(state, FOOTING[why]);
      return commitSilver(moveSilver(map, party, silver, intent.id, intent.at, opened));
    }
    case 'renameSilver':
      return commitSilver(renameSilver(silver, intent.id, intent.name));
    case 'hideSilver':
      return commitSilver(hideSilver(silver, intent.id, intent.hidden));
    case 'noteSilver':
      return commitSilver(noteSilver(silver, intent.id, intent.note));
    case 'lightSilver':
      return commitSilver(lightSilver(silver, intent.id, intent.light));
    default:
      return commitSilver(removeSilver(silver, intent.id));
  }
}

/**
 * The party's tokens in this map, if they are standing in it — the only ones
 * a brush has to keep out of (R-186).
 *
 * Positions in a map the party has left are a memory, not a presence: nothing
 * draws them and nothing should be refused on their account. If one is built
 * over meanwhile, the way back in repairs it (D-256).
 */
function presentIn(state: HostState, campaign: Campaign, placeId: string, poiId: string): Tokens {
  const save = state.activeSave;
  if (!save || save.inside?.placeId !== placeId || save.inside?.poiId !== poiId) return NO_TOKENS;
  return onRoster(tokensFor(save, poiId), campaign.party);
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
      return withPlaces(addPlace(
        campaign.places, intent.cell, intent.name, marker, asFacing(intent.facing ?? 0),
      ));
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
      return withPlaces(movePlace(
        campaign.places, id, intent.cell,
        intent.facing === undefined ? undefined : asFacing(intent.facing),
      ));
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

    case 'placeProp':
    case 'editProp':
    case 'removeProp':
    case 'setPropOpen':
      return applyToProps(state, campaign, intent, withPlaces, reject_, now);

    case 'savePrefab': {
      // Reads a box of a map into the library (D-321). Not a campaign edit:
      // nothing in the campaign changes, so undo has nothing to take back.
      const place = placeById(campaign.places, intent.placeId as PlaceId);
      const map = place ? poiOfPlace(place, intent.poiId as PoiId)?.map : null;
      if (!map) return reject_('no such map');
      const captured = capturePrefab(map, intent.from, intent.to, {
        ...(intent.name !== undefined ? { name: intent.name } : {}),
        ...(intent.tags !== undefined ? { tags: intent.tags } : {}),
      });
      if (typeof captured === 'string') return reject_(captured);
      return savedPrefab(state, state.prefabs, captured);
    }

    case 'placePrefab': {
      /*
       * One placement, one map edit, one undo step (D-321) — however many
       * cubes it puts down, the way a brush is one (R-162). Its blocks win
       * over what is there; it keeps out of every cube somebody stands in,
       * gold or silver, as a brush does (R-186).
       */
      const place = placeById(campaign.places, intent.placeId as PlaceId);
      const poi = place ? poiOfPlace(place, intent.poiId as PoiId) : null;
      if (!place || !poi?.map) return reject_('no such map');
      const prefab = prefabById(state.prefabs, intent.id);
      if (!prefab) return reject_('no such prefab');
      const keep = new Set<string>([
        ...[...presentIn(state, campaign, intent.placeId, intent.poiId).values()].map(blockKey),
        ...(state.activeSave ? silverCubes(silverIn(state.activeSave, intent.poiId)) : []),
        // A prefab's blocks win over blocks, not over a door (D-322).
        ...(poi.map.props.length > 0 ? propRules(poi.map.props).occupied : []),
      ]);
      const places = editPoiMap(campaign.places, place.id, poi.id, (map) => stampPrefab(map, prefab, intent.at, {
        facing: intent.facing as Facing, mirrored: intent.mirrored, clear: intent.clear,
      }, keep));
      if (places === campaign.places) return reject_('that would change nothing');
      return withPlaces(places);
    }

    case 'setBlock':
    case 'paintBlock':
    case 'clearBlock':
    case 'fillMaterial':
    case 'growMap':
      return applyToMap(
        campaign, intent, withPlaces, reject_,
        presentIn(state, campaign, intent.placeId, intent.poiId),
        state.activeSave ? silverCubes(silverIn(state.activeSave, intent.poiId)) : new Set(),
      );

    case 'addPlane':
    case 'renamePlane':
    case 'movePlane':
    case 'removePlane':
      return applyToPlanes(campaign, intent, withPlaces, reject_, now);

    case 'enterMap': {
      if (!state.activeSave) return reject_('no save');
      const placeId = intent.placeId as PlaceId;
      const place = placeById(campaign.places, placeId);
      if (!place) return reject_('no such place');
      const poi = poiOfPlace(place, intent.poiId as PoiId);
      if (!poi) return reject_('no such point of interest');
      // The same condition the boundary uses to decide whether the table gets
      // this point of interest at all (R-158). Walking the party into a room
      // they cannot see would leave the table pointed at nothing, and would be
      // a leak if it did send it.
      if (!isPoiOnTable(state.activeSave.discovery, place, poi)) {
        return reject_('the party cannot see that point of interest yet');
      }
      const entered = enteringMap(state.activeSave, placeId, poi.id);
      // The way back in repairs where they stood: a cube built over while they
      // were elsewhere cannot hold a token, so that member is placed again
      // (D-256). Everyone else is where they left off.
      const settled = poi.map ? settleTokens(entered, poi.id, poi.map) : entered;
      return commitSave(state, state.activeSave, settled, now);
    }

    case 'leaveMap': {
      if (!state.activeSave) return reject_('no save');
      return commitSave(state, state.activeSave, leavingMap(state.activeSave), now);
    }

    case 'setLighting': {
      const save = state.activeSave;
      if (!save) return reject_('no save');
      // Clamped here and not trusted from the client (R-18a) — the console
      // clamps too, and the console is not the authority (R-3).
      return commitSave(state, save, withLighting(save, intent.lighting), now);
    }

    case 'setTravelling': {
      const save = state.activeSave;
      if (!save) return reject_('no save');
      /*
       * An id nobody recognises is **not** refused. It is read where it is
       * used — `waysOf` drops a mode this build has no entry for — and that
       * reads as the party having nothing for that medium, which is what an
       * unknown conveyance amounts to. Refusing here would make a registry
       * this host has not been rebuilt with into a hard error on a dropdown
       * (R-137a).
       */
      return commitSave(state, save, withTravelling(save, travellingFromWire(intent.travelling)), now);
    }

    case 'setPoiAmbience': {
      const place = placeById(campaign.places, intent.placeId as PlaceId);
      if (!place) return reject_('no such place');
      if (!poiOfPlace(place, intent.poiId as PoiId)) return reject_('no such point of interest');
      // An authored edit, so it lands in the campaign and under undo — unlike
      // the world's hour, which is play state in the save (D-252).
      return withPlaces(withPoiAmbience(campaign.places, place.id, intent.poiId as PoiId, intent.ambience));
    }

    case 'setRange': {
      const save = state.activeSave;
      if (!save) return reject_('no save');
      // Named by the intent rather than taken from where the party is: the GM
      // cuts a map to build it, long before anyone stands in it (D-201).
      const place = placeById(campaign.places, intent.placeId as PlaceId);
      if (!place) return reject_('no such place');
      const poi = poiOfPlace(place, intent.poiId as PoiId);
      if (!poi) return reject_('no such point of interest');
      if (!poi.map) return reject_('that point of interest has no map');
      // Made legal here rather than trusted from the client, but never pulled
      // onto a step: the ladder sends both bounds every time, and moving one
      // must not quietly move the other (R-161).
      const range = clampRange(
        poi.map.planes,
        { lower: intent.lower, upper: intent.upper },
        MAP_MAX_HEIGHT,
        // Fixed bounds, not the deepest block: the three reference steps hold
        // still so a saved band stays valid when blocks come and go (R-161).
        MAP_MIN_DEPTH,
      );
      return commitSave(state, save, withRange(save, poi.id, range), now);
    }

    default:
      return applyToDiscovery(state, campaign, intent, now);
  }
}

/**
 * A map's cutting planes (R-146).
 *
 * Authored content, so it shares `applyToMap`'s guards and its reasons: one
 * place lookup, one point-of-interest lookup, and a map that has to exist.
 */
function applyToPlanes(
  campaign: Campaign,
  intent: Extract<Intent, { kind: 'addPlane' | 'renamePlane' | 'movePlane' | 'removePlane' }>,
  withPlaces: (places: readonly Place[]) => Applied,
  reject_: (reason: string) => Applied,
  now: string,
): Applied {
  const placeId = intent.placeId as PlaceId;
  const place = placeById(campaign.places, placeId);
  if (!place) return reject_('no such place');
  const poiId = intent.poiId as PoiId;
  const poi = poiOfPlace(place, poiId);
  if (!poi) return reject_('no such point of interest');
  if (!poi.map) return reject_('that point of interest has no map');

  const floor = MAP_MIN_DEPTH;
  /**
   * Applies the edit, then brings the band to rest on a stop (R-161).
   *
   * Changing the levels changes what the band may rest on, so a band left on a
   * level that is gone has to move. Here, at the moment of the edit, where the
   * GM can see it — not silently, later, from an unrelated click.
   */
  const settled = (places: readonly Place[]): Applied => {
    const applied = withPlaces(places);
    const save = applied.state.activeSave;
    if (applied.rejected || !save) return applied;
    const nextPoi = poiOfPlace(placeById(places, placeId)!, poiId);
    if (!nextPoi?.map) return applied;
    const rested = settleRange(
      nextPoi.map.planes,
      rangeFor(save, poiId),
      MAP_MAX_HEIGHT,
      MAP_MIN_DEPTH,
    );
    const withBand = withRange(save, poiId, rested);
    if (withBand === save) return applied;
    const stamped = touch(withBand, now);
    return {
      ...applied,
      state: { ...applied.state, activeSave: stamped },
      effects: [...applied.effects, { kind: 'saveSave', save: stamped }],
    };
  };

  if (intent.kind === 'addPlane') {
    if (!validPlaneY(intent.y, MAP_MAX_HEIGHT, floor)) {
      return reject_('a plane sits between the floor and the ceiling');
    }
    if (planeAt(poi.map.planes, intent.y)) return reject_('there is already a plane there');
    return settled(addPoiPlane(campaign.places, placeId, poiId, intent.name, intent.y));
  }

  const planeId = intent.planeId as PlaneId;
  if (!planeById(poi.map.planes, planeId)) return reject_('no such plane');

  switch (intent.kind) {
    case 'renamePlane':
      return withPlaces(renamePoiPlane(campaign.places, placeId, poiId, planeId, intent.name));
    case 'removePlane':
      return settled(removePoiPlane(campaign.places, placeId, poiId, planeId));
    default:
      if (!validPlaneY(intent.y, MAP_MAX_HEIGHT, floor)) {
        return reject_('a plane sits between the floor and the ceiling');
      }
      if (planeAt(poi.map.planes, intent.y)) return reject_('there is already a plane there');
      return settled(movePoiPlane(campaign.places, placeId, poiId, planeId, intent.y));
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
  intent: Extract<Intent, {
    kind: 'setBlock' | 'paintBlock' | 'clearBlock' | 'fillMaterial' | 'growMap';
  }>,
  withPlaces: (places: readonly Place[]) => Applied,
  reject_: (reason: string) => Applied,
  /** The party, if they are standing in this map — a brush keeps out of their cubes (R-186). */
  present: Tokens,
  /** Silver tokens' cubes, in any map — a brush keeps out of those too (D-307). */
  silverAt: ReadonlySet<string>,
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
    return withPlaces(growPoiMap(campaign.places, placeId, poiId, intent.towards));
  }

  if (intent.kind === 'fillMaterial') {
    const at = { x: intent.x, y: intent.y, z: intent.z };
    if (!inMap(poi.map, at)) return reject_('that is outside the map');
    const swatch = intent.swatch as SwatchId;
    if (!isKnownSwatch(swatch)) return reject_('unknown material');
    return withPlaces(fillPoiMaterial(campaign.places, placeId, poiId, at, swatch));
  }

  /*
   * A brush arrives as the cells it touches, up to twenty-five of them (R-162).
   *
   * Every cell is still checked here, one at a time, against the footprint and
   * against what is standing in it — the same checks each cell passed when it
   * used to arrive in an intent of its own. The list buys one undo step, one
   * write and one broadcast per click; it buys no trust.
   *
   * The refusals are worded for the whole gesture, and they fire only when
   * there is nothing at all to do. A brush that laps over the edge of the map,
   * or over a cube already built, lands where it can and leaves the rest —
   * refusing all twenty-five because one was occupied would make a wide brush
   * useless anywhere near something already standing.
   */
  const { cells } = intent;
  const map = poi.map;
  if (!cells.some((at) => inMap(map, at))) return reject_('that is outside the map');
  const standing = cells.some((at) => inMap(map, at) && !!blockAt(map, at));

  if (intent.kind === 'clearBlock') {
    if (!standing) return reject_('there is nothing there to erase');
    return withPlaces(clearMapBlocks(campaign.places, placeId, poiId, cells));
  }

  const swatch = intent.swatch as SwatchId;
  if (!isKnownSwatch(swatch)) return reject_('unknown material');

  /*
   * Placing and repainting are different operations and are refused for
   * opposite reasons (R-159).
   *
   * Build will not overwrite and paint will not conjure. While every block was
   * on screen the difference never showed: a face you can see has empty space
   * in front of it. Hiding levels breaks that — the GM clicks what looks like
   * bare floor and lands on a block one level down that they cannot see — so
   * the two are distinct intents, each saying no rather than doing the other's
   * job, and each backed by a domain function that skips the cells that are not
   * its business.
   */
  if (intent.kind === 'setBlock') {
    const empty = (at: (typeof cells)[number]) => inMap(map, at) && !blockAt(map, at);
    if (!cells.some(empty)) return reject_('there is already a block there');
    // Never into a prop's cube (D-322): a brush clips round a door the way it
    // clips round the party, and refuses only when a prop was all it had left.
    const propped = map.props.length > 0 ? propRules(map.props).occupied : null;
    const unpropped = propped ? cells.filter((at) => !propped.has(blockKey(at))) : cells;
    if (!unpropped.some(empty)) return reject_('a prop is there');
    /*
     * Never into somebody's cube (R-186). A brush clips around the party the
     * way it clips around blocks already standing (R-162) — it lands where it
     * can — and refuses only when a standing token's cube was all it had left.
     */
    const unsilvered = silverAt.size === 0 ? unpropped : unpropped.filter((at) => !silverAt.has(blockKey(at)));
    const clear = clearOfTokens(unsilvered, present);
    if (!clear.some(empty)) return reject_('somebody is standing there');
    return withPlaces(setMapBlocks(campaign.places, placeId, poiId, clear, swatch));
  }
  if (!standing) return reject_('there is nothing there to paint');
  return withPlaces(paintMapBlocks(campaign.places, placeId, poiId, cells, swatch));
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

  const commitPlay = (next: Save): Applied => commitSave(state, save, next, now);

  const commitDiscovery = (discovery: Save['discovery']): Applied =>
    commitPlay(withDiscovery(save, discovery));

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
      return commitPlay(withPlacement(save, withGroupAt(save.placement, intent.cell)));
    }

    case 'movePartyMember': {
      const id = intent.memberId as MemberId;
      if (!campaign.party.some((member) => member.id === id)) return reject(state, 'no such member');
      if (save.placement.together) return reject(state, 'the party is together — separate them first');
      const why = reachable(state, campaign, intent.cell);
      if (why) return reject(state, why);
      return commitPlay(withPlacement(save, withMemberAt(save.placement, id, intent.cell)));
    }

    case 'setPartyTogether': {
      if (save.placement.together === intent.together) return ok(state);
      const next = intent.together
        ? gathered(save.placement, campaign.party)
        : scattered(save.placement, campaign.party);
      return commitPlay(withPlacement(save, next));
    }

    default:
      return reject(state, `unhandled intent: ${(intent as { kind: string }).kind}`);
  }
}


