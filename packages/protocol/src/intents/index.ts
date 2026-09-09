// Intents: the only way a client changes anything (R-3, R-99). Validated at the
// edge with Zod (R-17); trusted everywhere inside.

import { z } from 'zod';
import { CellIndex, TerrainIdSchema } from '../wire/index.js';
import { MAX_HEIGHT, MAX_BRUSH } from '@tt/domain';

const cell = { cx: z.number().int(), cz: z.number().int(), x: CellIndex, z: CellIndex };
/** Brush footprint in cells per side. One intent per stroke, not one per cell. */
const size = z.number().int().min(1).max(MAX_BRUSH).optional();

export const IntentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('createCampaign'), name: z.string().min(1).max(80) }),
  z.object({ kind: z.literal('openCampaign'), id: z.string().min(1) }),
  z.object({ kind: z.literal('closeCampaign') }),
  z.object({ kind: z.literal('duplicateCampaign'), id: z.string().min(1), name: z.string().min(1).max(80).optional() }),
  z.object({ kind: z.literal('deleteCampaign'), id: z.string().min(1) }),

  z.object({ kind: z.literal('addChunk'), cx: z.number().int(), cz: z.number().int() }),
  z.object({ kind: z.literal('paintTerrain'), ...cell, terrainId: TerrainIdSchema, size }),
  z.object({ kind: z.literal('setHeight'), ...cell, height: z.number().int().min(0).max(MAX_HEIGHT), size }),
  z.object({ kind: z.literal('raiseHeight'), ...cell, delta: z.number().int().min(-MAX_HEIGHT).max(MAX_HEIGHT), size }),

  z.object({ kind: z.literal('addMember'), name: z.string().max(40).optional() }),
  z.object({
    kind: z.literal('editMember'),
    id: z.string().min(1),
    name: z.string().max(40).optional(),
    colour: z.string().max(32).optional(),
    visionRange: z.number().int().min(0).max(200).optional(),
  }),
  z.object({ kind: z.literal('removeMember'), id: z.string().min(1) }),
]);

export type Intent = z.infer<typeof IntentSchema>;
export type IntentKind = Intent['kind'];

export function parseIntent(value: unknown): { ok: true; intent: Intent } | { ok: false; reason: string } {
  const result = IntentSchema.safeParse(value);
  if (result.success) return { ok: true, intent: result.data };
  const first = result.error.issues[0];
  return { ok: false, reason: first ? `${first.path.join('.')}: ${first.message}` : 'malformed intent' };
}
