// What the stylesheets promise about layout, held to them (D-392). Two things
// went wrong unseen: a row's button centred what it held, because every button
// does (base.css) and the row never said otherwise; and a list scrolled inside
// a dock that scrolls.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const SHEETS = ['packages/theme/base.css', 'apps/gm/src/shell/shell.css', 'apps/table/src/shell/shell.css'];

/** Each rule of a sheet: its selector and its declarations, comments out. */
function rules(path: string): { selector: string; body: string }[] {
  const css = readFileSync(join(ROOT, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1]!.trim(), body: m[2]! }));
}

const all = SHEETS.flatMap((path) => rules(path).map((rule) => ({ ...rule, path })));

describe('a button that reads from the left says so (D-392)', () => {
  it('base.css centres what a button holds, which is why', () => {
    const button = all.find((rule) => rule.path.endsWith('base.css') && rule.selector === 'button');
    expect(button?.body).toMatch(/justify-content:\s*center/);
  });

  it('gives every flex rule that aligns its text left a justify-content of its own', () => {
    const silent = all
      .filter((rule) => /display:\s*(inline-)?flex/.test(rule.body) && /text-align:\s*left/.test(rule.body))
      .filter((rule) => !/justify-content:/.test(rule.body))
      .map((rule) => `${rule.path}: ${rule.selector}`);
    expect(silent).toEqual([]);
  });
});

describe('nothing scrolls inside a dock but a catalogue (D-392)', () => {
  it('scrolls only the docks, the crop dialog, and the searched lists of tokens and prefabs', () => {
    const scrolling = all
      .filter((rule) => /overflow(-y)?:\s*(auto|scroll)/.test(rule.body))
      .map((rule) => rule.selector);
    expect(scrolling.sort()).toEqual(['.crop-dialog', '.dock', '.library-list'].sort());
  });
});

/**
 * Where a size is typed on purpose, and why (D-394): a glyph sized to the box
 * it fills, and the sentence for a browser too old to draw either screen.
 */
const TYPED_SIZES = new Set(['.picture-card .picture-busy', '.picture-clear', '.too-old']);

/** Components whose lettering is part of a drawing: the brand's wordmark, the compass's dial. */
const LETTERED = ['packages/ui/src/brand-logo/index.tsx', 'packages/ui/src/compass/index.tsx'];

function sources(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(ROOT, path)).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('every font size is a token (R-217, D-394)', () => {
  it('types no font size in a stylesheet but the named few', () => {
    const typed = all
      .filter((rule) => /font-size:\s*[0-9.]+(px|rem|em)|font:[^;]*\b[0-9.]+(px|rem)\b/.test(rule.body))
      .map((rule) => rule.selector)
      .filter((selector) => !TYPED_SIZES.has(selector));
    expect(typed).toEqual([]);
  });

  it('types none in a component or a screen either, but the lettering of a drawing', () => {
    const files = ['packages/ui/src', 'apps/gm/src', 'apps/table/src'].flatMap(sources)
      .filter((path) => !LETTERED.includes(path));
    const typed = files.filter((path) => /fontSize:\s*[0-9]|font:\s*['"`][^'"`]*\b[0-9.]+px/.test(readFileSync(join(ROOT, path), 'utf8')));
    expect(typed).toEqual([]);
  });
});
