// Branded ids (R-10 / D-014). PoiId and EncounterId are both strings; passing
// one where the other belongs must not compile.

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type CampaignId = Brand<string, 'CampaignId'>;
export type SaveId = Brand<string, 'SaveId'>;
export type MemberId = Brand<string, 'MemberId'>;
export type TerrainId = Brand<string, 'TerrainId'>;
export type PoiId = Brand<string, 'PoiId'>;
export type NoteId = Brand<string, 'NoteId'>;
export type EncounterId = Brand<string, 'EncounterId'>;
export type MarkerId = Brand<string, 'MarkerId'>;

/** Registry ids are namespaced strings: `terrain:swamp`, never an index (R-11). */
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
