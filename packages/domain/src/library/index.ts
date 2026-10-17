// The Tokens Library (D-307): everyone who is not the party, made once from a
// menu and placed on maps as many times as the GM likes.
//
// **Shared across campaigns** — the GM's call: a goblin made for one campaign
// is there for the next, and for a random encounter in this one. So it lives
// beside the campaigns rather than in one, and campaign undo cannot reach it
// (D-169) — which the GM did not want anyway: *"it's menu construction."*
//
// "Bestiary" was the first word and the wrong one. A bartender and a gate
// guard belong here as readily as a goblin, and they are not beasts.

import type { TemplateId } from '../ids/index.js';
import { freshId } from '../ids/index.js';
import type { ImageId } from '../images/index.js';
import { isImageId } from '../images/index.js';

/** One entry: *a goblin*. What every goblin placed from it shares. */
export interface TokenTemplate {
  readonly id: TemplateId;
  /** "Goblin" — and every token placed from it is "Goblin N7" (D-307). */
  readonly name: string;
  /**
   * Free words for finding it again: `npc`, `undead`, `saltmarsh` (D-307).
   * Lower case, no spaces, no repeats, in the order the GM gave them.
   */
  readonly tags: readonly string[];
  /** The picture on its card; without one the card is plain grey (R-204). */
  readonly image: ImageId | null;
  /**
   * Where its stats live — an online sheet the GM opens for a quick look
   * (D-313), or `null`. A web address and nothing else: it is opened from
   * the console, so a `javascript:` link must never get in (`cleanSheetUrl`).
   */
  readonly url: string | null;
}

/** In the order entries were made; screens sort for themselves. */
export type TokensLibrary = readonly TokenTemplate[];

export const EMPTY_LIBRARY: TokensLibrary = [];

export const MAX_TEMPLATE_NAME = 40;
export const MAX_TAG = 24;
export const MAX_TAGS = 12;
export const MAX_SHEET_URL = 500;

/**
 * A sheet's address as kept: a web address, or `null`.
 *
 * Typed by hand, so forgiving about the scheme — `dndbeyond.com/monsters/x`
 * becomes `https://dndbeyond.com/monsters/x` — and strict about everything
 * else: only `http:` and `https:` survive. It is opened as a link, and a link
 * that runs code when clicked is not a sheet.
 */
export function cleanSheetUrl(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim();
  if (!text || text.length > MAX_SHEET_URL) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost') return null;
  return parsed.href;
}

function cleanName(name: string | undefined, fallback: string): string {
  const trimmed = (name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEMPLATE_NAME);
  return trimmed || fallback;
}

/**
 * Tags as they are kept: lower case, inner spaces as dashes, nothing empty,
 * no repeats, within the limits — in the order given. `"Saltmarsh  NPC, npc"`
 * split by the caller becomes `["saltmarsh", "npc"]`.
 */
export function cleanTags(tags: readonly string[]): readonly string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, '-').slice(0, MAX_TAG);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}

/** Tags typed as one line: split on commas and spaces (D-307). */
export function tagsFromText(text: string): readonly string[] {
  return cleanTags(text.split(/[,\s]+/));
}

export function templateById(library: TokensLibrary, id: TemplateId | string): TokenTemplate | null {
  return library.find((template) => template.id === id) ?? null;
}

/** Adds an entry. Its name defaults rather than refuses: a blank one is fixable. */
export function addTemplate(
  library: TokensLibrary,
  fields: {
    readonly name?: string;
    readonly tags?: readonly string[];
    readonly image?: ImageId | null;
    readonly url?: string | null;
  },
): TokensLibrary {
  const template: TokenTemplate = {
    id: freshId<'TemplateId'>('template'),
    name: cleanName(fields.name, 'New token'),
    tags: cleanTags(fields.tags ?? []),
    image: fields.image ?? null,
    url: cleanSheetUrl(fields.url),
  };
  return [...library, template];
}

/** Edits one entry. Identity-preserving when nothing changes (R-165). */
export function editTemplate(
  library: TokensLibrary,
  id: TemplateId | string,
  patch: {
    readonly name?: string;
    readonly tags?: readonly string[];
    readonly image?: ImageId | null;
    readonly url?: string | null;
  },
): TokensLibrary {
  let touched = false;
  const next = library.map((template) => {
    if (template.id !== id) return template;
    const name = patch.name === undefined ? template.name : cleanName(patch.name, template.name);
    const tags = patch.tags === undefined ? template.tags : cleanTags(patch.tags);
    const image = patch.image === undefined ? template.image : patch.image;
    const url = patch.url === undefined ? template.url : cleanSheetUrl(patch.url);
    const same = name === template.name && image === template.image && url === template.url
      && tags.length === template.tags.length && tags.every((tag, i) => tag === template.tags[i]);
    if (same) return template;
    touched = true;
    return { ...template, name, tags, image, url };
  });
  return touched ? next : library;
}

/**
 * Takes an entry out of the library. **Every token placed from it goes too**
 * (D-307) — that is the caller's to do for the campaign that is open, and
 * every other campaign does it on opening (`withoutStrays`).
 */
export function removeTemplate(library: TokensLibrary, id: TemplateId | string): TokensLibrary {
  const next = library.filter((template) => template.id !== id);
  return next.length === library.length ? library : next;
}

/**
 * The entries a search finds, by name.
 *
 * **Every word must match** — the name, or one of the tags — so typing more
 * narrows: `npc saltmarsh` finds what is both, which is how the GM finds
 * *the NPCs of this campaign* in a library shared by all of them (D-307). A
 * word matches anywhere inside a name or a tag, so `gob` finds a goblin. An
 * empty search finds everything.
 */
export function searchLibrary(library: TokensLibrary, query: string): readonly TokenTemplate[] {
  const words = query.toLowerCase().split(/[,\s]+/).filter(Boolean);
  return library
    .filter((template) => words.every((word) =>
      template.name.toLowerCase().includes(word) || template.tags.some((tag) => tag.includes(word))))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export interface TokenTemplateJSON {
  id: string;
  name: string;
  tags: string[];
  image: string | null;
  url: string | null;
}

export function libraryToJSON(library: TokensLibrary): TokenTemplateJSON[] {
  return library.map((template) => ({
    id: template.id, name: template.name, tags: [...template.tags], image: template.image, url: template.url,
  }));
}

/**
 * Read leniently (R-137a): an entry without an id is dropped — nothing could
 * refer to it — and anything else odd is repaired rather than refused, so
 * one bad line in a hand-edited file does not empty the GM's library.
 */
export function libraryFromJSON(json: unknown): TokensLibrary {
  if (!Array.isArray(json)) return EMPTY_LIBRARY;
  const out: TokenTemplate[] = [];
  for (const raw of json as unknown[]) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    if (typeof entry.id !== 'string' || !entry.id) continue;
    if (out.some((template) => template.id === entry.id)) continue;
    out.push({
      id: entry.id as TemplateId,
      name: cleanName(typeof entry.name === 'string' ? entry.name : undefined, 'New token'),
      tags: cleanTags(Array.isArray(entry.tags) ? entry.tags.filter((t): t is string => typeof t === 'string') : []),
      image: isImageId(entry.image) ? entry.image : null,
      // Cleaned on the way in too: a hand-edited file is an input like any other.
      url: typeof entry.url === 'string' ? cleanSheetUrl(entry.url) : null,
    });
  }
  return out;
}
