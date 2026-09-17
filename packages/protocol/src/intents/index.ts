// Intents: the only way a client changes anything (R-3, R-99). Validated at the
// edge with Zod (R-17); trusted everywhere inside.

import { z } from 'zod';
import { CellIndex, TerrainIdSchema, MarkerIdSchema, PlaceCellSchema, WorldCellSchema } from '../wire/index.js';
import { MAX_HEIGHT, MAX_BRUSH } from '@tt/domain';

const cell = { cx: z.number().int(), cz: z.number().int(), x: CellIndex, z: CellIndex };
/** Brush footprint in cells per side. One intent per stroke, not one per cell. */
const size = z.number().int().min(1).max(MAX_BRUSH).optional();
/**
 * Ties the intents of one drag together so undo treats them as a single action
 * (D-170). Opaque to the host — it only ever compares it to the previous one.
 */
const stroke = z.string().min(1).max(64).optional();

export const IntentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('createCampaign'), name: z.string().min(1).max(80) }),
  z.object({ kind: z.literal('openCampaign'), id: z.string().min(1) }),
  z.object({ kind: z.literal('closeCampaign') }),
  z.object({ kind: z.literal('duplicateCampaign'), id: z.string().min(1), name: z.string().min(1).max(80).optional() }),
  z.object({ kind: z.literal('deleteCampaign'), id: z.string().min(1) }),

  z.object({ kind: z.literal('addChunk'), cx: z.number().int(), cz: z.number().int() }),
  z.object({ kind: z.literal('paintTerrain'), ...cell, terrainId: TerrainIdSchema, size, stroke }),
  z.object({ kind: z.literal('setHeight'), ...cell, height: z.number().int().min(0).max(MAX_HEIGHT), size, stroke }),
  z.object({ kind: z.literal('raiseHeight'), ...cell, delta: z.number().int().min(-MAX_HEIGHT).max(MAX_HEIGHT), size, stroke }),

  z.object({ kind: z.literal('addMember'), name: z.string().max(40).optional() }),
  z.object({
    kind: z.literal('editMember'),
    id: z.string().min(1),
    name: z.string().max(40).optional(),
    colour: z.string().max(32).optional(),
    visionRange: z.number().int().min(0).max(200).optional(),
  }),
  z.object({ kind: z.literal('removeMember'), id: z.string().min(1) }),

  // Points of interest
  z.object({ kind: z.literal('addPlace'), cell: PlaceCellSchema, name: z.string().max(60).optional(), markerId: MarkerIdSchema.optional() }),
  z.object({ kind: z.literal('renamePlace'), id: z.string().min(1), name: z.string().max(60) }),
  z.object({ kind: z.literal('setPlaceMarker'), id: z.string().min(1), markerId: MarkerIdSchema }),
  z.object({ kind: z.literal('movePlace'), id: z.string().min(1), cell: PlaceCellSchema }),
  z.object({ kind: z.literal('removePlace'), id: z.string().min(1) }),

  // Notes on a place
  z.object({ kind: z.literal('addNote'), placeId: z.string().min(1), text: z.string().min(1).max(2000), visibleToParty: z.boolean().optional() }),
  z.object({ kind: z.literal('editNote'), placeId: z.string().min(1), noteId: z.string().min(1), text: z.string().max(2000) }),
  z.object({ kind: z.literal('setNoteVisible'), placeId: z.string().min(1), noteId: z.string().min(1), visibleToParty: z.boolean() }),
  z.object({ kind: z.literal('removeNote'), placeId: z.string().min(1), noteId: z.string().min(1) }),
  z.object({ kind: z.literal('moveNote'), placeId: z.string().min(1), noteId: z.string().min(1), delta: z.number().int().min(-99).max(99) }),

  // Pois a place owns. Same shape as notes: ordered, individually visible
  // (D-175). GM only — this is authored content.
  z.object({ kind: z.literal('addPoi'), placeId: z.string().min(1), name: z.string().min(1).max(80), visibleToParty: z.boolean().optional() }),
  z.object({ kind: z.literal('renamePoi'), placeId: z.string().min(1), poiId: z.string().min(1), name: z.string().min(1).max(80) }),
  z.object({ kind: z.literal('setPoiVisible'), placeId: z.string().min(1), poiId: z.string().min(1), visibleToParty: z.boolean() }),
  z.object({ kind: z.literal('removePoi'), placeId: z.string().min(1), poiId: z.string().min(1) }),
  z.object({ kind: z.literal('movePoi'), placeId: z.string().min(1), poiId: z.string().min(1), delta: z.number().int().min(-99).max(99) }),

  // What the party knows. GM-granted; no geometry at world scale (R-16).
  z.object({ kind: z.literal('setChunkKnown'), cx: z.number().int(), cz: z.number().int(), known: z.boolean() }),
  z.object({ kind: z.literal('setPlaceRevealed'), placeId: z.string().min(1), revealed: z.boolean() }),
  z.object({ kind: z.literal('revealChunk'), cx: z.number().int(), cz: z.number().int(), withPlaces: z.boolean().optional() }),

  // Where the party stands. Open to both seats: the party is the players' and
  // the world is the GM's (R-136).
  z.object({ kind: z.literal('moveParty'), cell: WorldCellSchema }),
  z.object({ kind: z.literal('movePartyMember'), memberId: z.string().min(1), cell: WorldCellSchema }),
  z.object({ kind: z.literal('setPartyTogether'), together: z.boolean() }),

  // A point of interest's map (D-183). Authored content, so GM only. `stroke`
  // ties one drag into a single undo, exactly as it does for terrain (R-140b).
  z.object({ kind: z.literal('setBlock'), placeId: z.string().min(1), poiId: z.string().min(1), x: z.number().int(), y: z.number().int(), z: z.number().int(), materialId: z.string().min(1), stroke }),
  z.object({ kind: z.literal('clearBlock'), placeId: z.string().min(1), poiId: z.string().min(1), x: z.number().int(), y: z.number().int(), z: z.number().int(), stroke }),
  z.object({ kind: z.literal('fillMaterial'), placeId: z.string().min(1), poiId: z.string().min(1), x: z.number().int(), y: z.number().int(), z: z.number().int(), materialId: z.string().min(1) }),
  z.object({ kind: z.literal('growMap'), placeId: z.string().min(1), poiId: z.string().min(1), axis: z.enum(['x', 'z']) }),

  // Undo and redo over authored content (D-169). GM only: the campaign is the
  // GM's, and a shared history under one person's keyboard is a worse feature.
  z.object({ kind: z.literal('undo') }),
  z.object({ kind: z.literal('redo') }),

]);

export type Intent = z.infer<typeof IntentSchema>;
export type IntentKind = Intent['kind'];

export function parseIntent(value: unknown): { ok: true; intent: Intent } | { ok: false; reason: string } {
  const result = IntentSchema.safeParse(value);
  if (result.success) return { ok: true, intent: result.data };
  const first = result.error.issues[0];
  return { ok: false, reason: first ? `${first.path.join('.')}: ${first.message}` : 'malformed intent' };
}
