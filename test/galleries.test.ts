// The galleries draw what DESIGN_SYSTEM.md names (D-394). The page says every
// part it describes is drawn there, by the real components; this draws both
// galleries without a browser and holds that to the page. It also catches a
// gallery that no longer draws at all, which nothing else would: no screen
// imports them, and a broken one shows only the sentence for an old browser.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { GLYPHS } from '@tt/ui';
import { Gallery } from '../apps/gm/src/gallery/gallery.js';
import { TableGallery } from '../apps/table/src/gallery/gallery.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const designSystem = readFileSync(join(ROOT, 'docs/DESIGN_SYSTEM.md'), 'utf8');
const section = (from: string, to: string) => designSystem.slice(designSystem.indexOf(from), designSystem.indexOf(to));

const consoleHtml = renderToString(createElement(Gallery));
const table = ['map', 'world'].map((start) => renderToString(createElement(TableGallery, { start: start as 'map' | 'world' })))
  .join('\n');

/** Every class a rendered page puts on an element. */
const classesIn = (html: string) => new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1]!.split(/\s+/)));

describe('the galleries draw what DESIGN_SYSTEM.md names (D-394)', () => {
  it('draws every class the page names, on one gallery or the other', () => {
    const named = new Set([...designSystem.matchAll(/`([a-z]*\.[a-z][\w.-]*(?: [a-z][\w.-]*)*)`/g)]
      .map((m) => m[1]!)
      .filter((sel) => !/\.(ts|tsx|css|html|md)$/.test(sel))
      .flatMap((sel) => [...sel.matchAll(/\.([a-z][\w-]*)/g)].map((m) => m[1]!)));
    const drawn = new Set([...classesIn(consoleHtml), ...classesIn(table)]);
    expect(named.size).toBeGreaterThan(10);
    expect([...named].filter((cls) => !drawn.has(cls))).toEqual([]);
  });

  it('shows every colour and text size the page names', () => {
    const tokens = [...section('## Colour', '## Sizes').matchAll(/`(--[a-z0-9-]+)`/g), ...section('## Text', '## Icons').matchAll(/`(--ui-text-[a-z0-9-]+)`/g)]
      .map((m) => m[1]!)
      // The families mixed for panels and slots are shown by the panels and slots themselves.
      .filter((token) => !/^--ui-(panel|slot)-/.test(token));
    expect(tokens.length).toBeGreaterThan(10);
    expect([...new Set(tokens)].filter((token) => !consoleHtml.includes(token))).toEqual([]);
  });

  it('draws every icon in the registry', () => {
    const missing = Object.keys(GLYPHS).filter((name) => !consoleHtml.includes(`>${name}<`));
    expect(missing).toEqual([]);
  });

  it('draws the table’s own parts with the table: its tools, its areas, a place’s card', () => {
    const drawn = classesIn(table);
    for (const cls of ['tools-card', 'area-list', 'area-row', 'area-follow', 'notes-read', 'hints']) {
      expect(drawn.has(cls), cls).toBe(true);
    }
  });
});
