// Branded ids (R-10 / D-014). PlaceId and PoiId are both strings; passing
// one where the other belongs must not compile.

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type CampaignId = Brand<string, 'CampaignId'>;
export type SaveId = Brand<string, 'SaveId'>;
export type MemberId = Brand<string, 'MemberId'>;
export type PlaceId = Brand<string, 'PlaceId'>;
export type NoteId = Brand<string, 'NoteId'>;
export type PoiId = Brand<string, 'PoiId'>;
export type PlaneId = Brand<string, 'PlaneId'>;
export type MarkerId = Brand<string, 'MarkerId'>;
export type MaterialId = Brand<string, 'MaterialId'>;
/** What stands on a world cell (D-280): `cover:trees`. */
export type CoverId = Brand<string, 'CoverId'>;
/**
 * A material in one of its shades (R-176) — `material:stone`, or
 * `material:stone/dark`. What a cube actually holds.
 *
 * Branded apart from `MaterialId` on purpose: every bare material id is a
 * valid swatch, and no swatch is reliably a material id, so the two must not
 * be interchangeable in either direction by accident.
 */
export type SwatchId = Brand<string, 'SwatchId'>;

/** An entry in the Tokens Library (D-307): *a goblin*, *the bartender*. */
export type TemplateId = Brand<string, 'TemplateId'>;
/** One silver token standing in a map: *goblin N7* (D-307). */
export type SilverId = Brand<string, 'SilverId'>;
/** A prop standing in a map (D-322): *the cellar door*. */
export type PropId = Brand<string, 'PropId'>;
/** A saved piece of map in the shared Prefabs library (D-321): *a watchtower*. */
export type PrefabId = Brand<string, 'PrefabId'>;
/** An area drawn on a map (D-341): *the fireball*, *Galion's aura*. */
export type AreaId = Brand<string, 'AreaId'>;

/** Registry ids are namespaced strings: `cover:trees`, never an index (R-11). */
const REGISTRY_ID = /^[a-z][a-z0-9]*:[a-z0-9]+(-[a-z0-9]+)*$/;

export function isRegistryId(value: string): boolean {
  return REGISTRY_ID.test(value);
}

/** Asserts the shape of a registry id, then brands it. */
export function registryId<B extends string>(namespace: string, value: string): Brand<string, B> {
  const id = `${namespace}:${value}`;
  if (!isRegistryId(id)) throw new Error(`malformed registry id: ${id}`);
  return id as Brand<string, B>;
}

/** Opaque ids for things the GM creates at runtime. */
export function freshId<B extends string>(prefix: string): Brand<string, B> {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rand}` as Brand<string, B>;
}
