// Builds the reference scene MEASUREMENTS.md is anchored to (R-179).
//
// **Code, not data.** The last reference scene was hand-built in the console and
// existed only as files on one machine; when the registry was reorganised and
// that campaign was deleted, every figure in MEASUREMENTS.md lost the thing it
// was a measurement *of* (D-245). A scene that can be rebuilt from a command
// cannot be lost that way, can be rebuilt after a registry change, and can be
// diffed when it moves.
//
// **Deterministic, with no clock and no randomness in the layout.** Two runs on
// two machines produce the same cubes in the same cells, which is the whole
// point: a number taken here is comparable with a number taken there. Ids are
// the exception — they are minted fresh per run, because nothing in a
// measurement depends on them.
//
//   npm run seed
//
// It refuses to overwrite a campaign of the same name unless told to, because
// the one thing worse than no reference scene is two of them.
//
// **The save is part of the scene** (R-184). It used to be an empty one, which
// was right while nothing measured play state. Tokens are drawn now, and vision
// will be computed from them, so the party is in the Tollkeep, standing on four
// levels — and in daylight with nothing cut, so that a reading is of the whole
// scene rather than of whatever band somebody left it at.

import { join } from 'node:path';
import {
  createCampaign, createLiveSave, addPlace, addPoi, createMap, createMember,
  setBlocks, paintBlocks, growMap, MAP_PATCH, DEFAULT_MATERIALS, swatchFor, materialById,
  paintTerrain, chunkAt, chunkKey, ORIGIN, DEFAULT_TERRAIN,
  withDiscovery, setChunkKnown, setPlaceRevealed, enteringMap, withTokens,
  NO_TOKENS, placeToken, whyNotStand, withPlacement, withGroupAt, emptyPlacement,
} from '@tt/domain';
import type {
  BlockCoord, Campaign, EncounterMap, MaterialId, PartyMember, PlaceCell, PlaceId, PoiId, Save,
  SwatchId, TerrainId, Tokens,
} from '@tt/domain';
import { fileCampaignStore, fileSaveStore } from '@tt/persistence';

const NAME = 'The Reference';
const POI = 'Tollkeep';

/** Six, so every pawn colour is in the scene — the families' reason, for tokens. */
const PARTY = ['Aldra', 'Brann', 'Cass', 'Dov', 'Esk', 'Fen'] as const;

/** 96 × 96, the footprint the old reference scene had, so magnitudes compare. */
const PATCHES = 6;
const SPAN = MAP_PATCH * PATCHES;
const MID = SPAN / 2;

/** How far the island reaches from the middle; beyond it is sea. */
const SHORE = 30;
/** The keep: a square hall, its walls, its cellar and its roof. */
const HALL = 10;
const EAVES = 8;
const CELLAR = -4;

/** A swatch by family and cut, so a typo here fails loudly rather than drawing magenta. */
function swatch(family: string, cut: string): SwatchId {
  const material = materialById(DEFAULT_MATERIALS, `material:${family}` as MaterialId);
  if (!material) throw new Error(`no such family: ${family}`);
  if (!material.cuts.some((c) => c.id === cut)) {
    throw new Error(`${material.name} has no cut '${cut}' — it has ${material.cuts.map((c) => c.id).join(', ')}`);
  }
  return swatchFor(material, cut);
}

/*
 * Deterministic variation: the same hash the renderer uses for grain, so the
 * scene's scatter is reproducible on any machine and in any language that
 * implements 32-bit integer multiply the same way.
 */
function hash(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 0x1b873593) ^ Math.imul(y | 0, 0x85ebca6b) ^ Math.imul(z | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 0xffffffff;
}

const at = (x: number, y: number, z: number): BlockCoord => ({ x, y, z });
const away = (x: number, z: number) => Math.hypot(x - MID, z - MID);

/** Everything of one swatch at once, so a storey is one call rather than ten thousand. */
function raise(map: EncounterMap, cells: readonly BlockCoord[], fill: SwatchId): EncounterMap {
  return cells.length ? setBlocks(map, cells, fill) : map;
}

/**
 * The ground is **repainted, not placed**.
 *
 * A new map is floored across its whole footprint and so is every patch it
 * grows into (R-149), and `setBlocks` never overwrites (R-159) — so building
 * the island with `setBlocks` silently placed nothing at all and left a map of
 * undifferentiated dirt. The rule worked exactly as written; the seed was
 * asking the wrong one.
 */
function repaint(map: EncounterMap, cells: readonly BlockCoord[], fill: SwatchId): EncounterMap {
  return cells.length ? paintBlocks(map, cells, fill) : map;
}

function buildBody(): EncounterMap {
  let map = createMap();
  for (let i = 0; i < PATCHES - 1; i += 1) map = growMap(map, 'southeast');
  for (let i = 0; i < PATCHES - 1; i += 1) map = growMap(map, 'southwest');

  // -- the ground: an island in a sea, one level of it ----------------------
  const sea: BlockCoord[] = [];
  const beach: BlockCoord[] = [];
  const turf: BlockCoord[] = [];
  for (let x = 0; x < SPAN; x += 1) {
    for (let z = 0; z < SPAN; z += 1) {
      const d = away(x, z) + (hash(x, 0, z) - 0.5) * 3;
      if (d > SHORE) sea.push(at(x, 0, z));
      else if (d > SHORE - 3) beach.push(at(x, 0, z));
      else turf.push(at(x, 0, z));
    }
  }
  map = repaint(map, sea, swatch('liquid', 'water'));
  map = repaint(map, beach, swatch('soil', 'sand'));
  map = repaint(map, turf, swatch('grass', 'grass'));

  // -- the keep: a cellar, two storeys, a roof ------------------------------
  const lo = MID - HALL;
  const hi = MID + HALL;
  const onWall = (x: number, z: number) => x === lo || x === hi || z === lo || z === hi;
  const inHall = (x: number, z: number) => x >= lo && x <= hi && z >= lo && z <= hi;

  const foundation: BlockCoord[] = [];
  const cellarFloor: BlockCoord[] = [];
  const pit: BlockCoord[] = [];
  for (let x = lo; x <= hi; x += 1) {
    for (let z = lo; z <= hi; z += 1) {
      for (let y = CELLAR; y < 0; y += 1) {
        if (onWall(x, z)) foundation.push(at(x, y, z));
      }
      cellarFloor.push(at(x, CELLAR, z));
      // A fire pit, so something in the scene glows.
      if (Math.abs(x - MID) <= 2 && Math.abs(z - MID) <= 2) pit.push(at(x, CELLAR + 1, z));
    }
  }
  map = raise(map, foundation, swatch('mineral', 'dark-rock'));
  map = raise(map, cellarFloor, swatch('mineral', 'grey-rock'));
  map = raise(map, pit, swatch('glowing', 'lava'));

  const walls: BlockCoord[] = [];
  const windows: BlockCoord[] = [];
  for (let y = 1; y <= EAVES; y += 1) {
    for (let x = lo; x <= hi; x += 1) {
      for (let z = lo; z <= hi; z += 1) {
        if (!onWall(x, z)) continue;
        // A window every fourth course, at two heights. Glass, so the
        // transparent pass is in the scene rather than assumed.
        const slit = (y === 3 || y === 6) && (x + z) % 4 === 0;
        (slit ? windows : walls).push(at(x, y, z));
      }
    }
  }
  map = raise(map, walls, swatch('brick', 'clay'));
  map = raise(map, windows, swatch('glass', 'glass'));

  const boards: BlockCoord[] = [];
  const roof: BlockCoord[] = [];
  for (let x = lo + 1; x < hi; x += 1) {
    for (let z = lo + 1; z < hi; z += 1) {
      boards.push(at(x, 4, z));
      roof.push(at(x, EAVES + 1, z));
    }
  }
  map = raise(map, boards, swatch('wood', 'oak'));
  map = raise(map, roof, swatch('wood', 'dark-oak'));

  // -- a stand of trees, for the one family nothing else uses ---------------
  const trunks: BlockCoord[] = [];
  const canopy: BlockCoord[] = [];
  for (let x = 2; x < SPAN - 2; x += 7) {
    for (let z = 2; z < SPAN - 2; z += 7) {
      if (inHall(x, z) || away(x, z) > SHORE - 6) continue;
      if (hash(x, 7, z) < 0.55) continue;
      for (let y = 1; y <= 3; y += 1) trunks.push(at(x, y, z));
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          canopy.push(at(x + dx, 4, z + dz));
          if (dx === 0 && dz === 0) canopy.push(at(x, 5, z));
        }
      }
    }
  }
  map = raise(map, trunks, swatch('wood', 'birch'));
  map = raise(map, canopy, swatch('vegetation', 'leaves'));

  return map;
}

function buildWorld(campaign: Campaign): Campaign {
  // Three terrains in a fixed pattern, so "the world beside it" is a stated
  // quantity rather than whatever the default happened to be.
  const chunk = chunkAt(campaign.world, ORIGIN);
  if (!chunk) return campaign;
  const spread: readonly TerrainId[] = DEFAULT_TERRAIN.slice(0, 3).map((t) => t.id);
  let painted = chunk;
  for (let x = 0; x < 30; x += 1) {
    for (let z = 0; z < 30; z += 1) {
      const pick = spread[Math.floor(hash(x, 1, z) * spread.length)];
      if (pick) painted = paintTerrain(painted, x, z, pick);
    }
  }
  const chunks = new Map(campaign.world.chunks);
  chunks.set(chunkKey(ORIGIN), painted);
  return { ...campaign, world: { ...campaign.world, chunks } };
}

/**
 * Where the party stands (R-184): two in the hall, one upstairs on the boards,
 * one in the cellar, two out on the grass. Four levels, inside and out — the
 * spread vision will want to be measured on.
 */
const STANDING: Record<(typeof PARTY)[number], BlockCoord> = {
  Aldra: at(MID - 4, 1, MID - 4),
  Brann: at(MID + 3, 1, MID + 2),
  Cass: at(MID, 5, MID + 5),
  Dov: at(MID - 6, CELLAR + 1, MID + 6),
  Esk: at(MID, 1, MID + HALL + 8),
  Fen: at(MID + HALL + 9, 1, MID - 3),
};

/**
 * Stands each member where `STANDING` says, through the same rule the host
 * uses — so a cube that cannot be stood in fails the seed loudly instead of
 * leaving somebody silently unplaced (D-247's lesson).
 */
function standParty(body: EncounterMap, party: readonly PartyMember[]): Tokens {
  let tokens = NO_TOKENS;
  for (const member of party) {
    const cube = STANDING[member.name as (typeof PARTY)[number]];
    const why = whyNotStand(body, tokens, member.id, cube);
    if (why) throw new Error(`${member.name} cannot stand at ${cube.x},${cube.y},${cube.z}: ${why}`);
    tokens = placeToken(body, tokens, member.id, cube);
  }
  return tokens;
}

/**
 * The party as if they had played their way in: the chunk Known, the place
 * Revealed, their pawn on it out on the world, and inside the Tollkeep
 * standing — in daylight, uncut.
 */
function playedSave(
  campaign: Campaign,
  placeId: PlaceId,
  poiId: PoiId,
  cell: PlaceCell,
  body: EncounterMap,
): Save {
  let save = createLiveSave(campaign, new Date(0).toISOString());
  save = withDiscovery(
    save,
    setPlaceRevealed(setChunkKnown(save.discovery, ORIGIN, true), placeId, true),
  );
  save = withPlacement(save, withGroupAt(emptyPlacement(), cell));
  save = enteringMap(save, placeId, poiId);
  return withTokens(save, poiId, standParty(body, campaign.party));
}

function describe(map: EncounterMap): string {
  const byLevel = new Set<number>();
  const families = new Set<string>();
  const cuts = new Set<string>();
  for (const [key, value] of map.blocks) {
    byLevel.add(Number(key.split(',')[1]));
    const mark = value.indexOf('/');
    families.add(mark < 0 ? value : value.slice(0, mark));
    cuts.add(value);
  }
  const levels = [...byLevel].sort((a, b) => a - b);
  return [
    `cubes            ${map.blocks.size.toLocaleString()}`,
    `footprint        ${map.size.x} × ${map.size.z}`,
    `levels used      ${levels.length}, from ${levels[0]} to ${levels[levels.length - 1]}`,
    `families         ${families.size} of ${DEFAULT_MATERIALS.length}`,
    `distinct swatches ${cuts.size}`,
    `faces as cubes   ${(map.blocks.size * 6).toLocaleString()}`,
  ].join('\n  ');
}

function main(): void {
  const root = join(process.cwd(), 'data');
  const campaigns = fileCampaignStore(join(root, 'campaigns'));
  const saves = fileSaveStore(join(root, 'saves'));

  const existing = campaigns.list().find((c) => c.name === NAME);
  if (existing && !process.argv.includes('--force')) {
    console.error(`"${NAME}" already exists (${existing.id}). Pass --force to replace it.`);
    process.exitCode = 1;
    return;
  }
  if (existing) {
    campaigns.remove(existing.id);
    saves.removeForCampaign(existing.id);
  }

  const created = createCampaign(NAME);
  let party: readonly PartyMember[] = [];
  for (const name of PARTY) party = [...party, createMember(party, name)];
  const base = { ...created, party };
  const cell: PlaceCell = { cx: ORIGIN.cx, cz: ORIGIN.cz, x: 15, z: 15 };
  const withPlace = { ...base, places: addPlace(base.places, cell, 'Toll Crossing') };
  const placeId = withPlace.places[0]!.id;
  const withPoi = { ...withPlace, places: addPoi(withPlace.places, placeId, POI, true) };
  const poiId = withPoi.places[0]!.pois[0]!.id;

  const body = buildBody();
  const campaign = buildWorld({
    ...withPoi,
    places: withPoi.places.map((place) => (place.id !== placeId ? place : {
      ...place,
      pois: place.pois.map((poi) => (poi.id !== poiId ? poi : { ...poi, map: body })),
    })),
  });

  const save = playedSave(campaign, placeId, poiId, cell, body);
  campaigns.save(campaign);
  saves.save(save);

  console.log(`Seeded "${NAME}" — ${campaign.id}`);
  console.log(`  place            ${placeId}`);
  console.log(`  point of interest ${poiId} (${POI})`);
  console.log(`  ${describe(body)}`);
  console.log(`  party            ${campaign.party.length}, inside, standing at:`);
  for (const member of campaign.party) {
    const cube = save.tokens.get(poiId)?.get(member.id);
    console.log(`    ${member.name.padEnd(6)} ${cube ? `${cube.x},${cube.y},${cube.z}` : '—'}`);
  }
}

main();
