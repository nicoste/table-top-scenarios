// R-217a: one concept, one icon, drawn from GLYPHS. The arrows and marks that
// stood in for icons — ↑ ↓ to reorder, ✎ to edit, ← to go back, ✓ to confirm —
// were characters, each in the font of wherever it sat (D-390). This reads the
// screens' source for them, so a character cannot come back as an icon.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, relative } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** The code, without its comments: a comment may name a character to say why it went. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// Arrows, the edit pencil, ticks and the old map mark. Not × and ✕: those are
// a delete's trigger and a cost's "impassable", typography rather than icons.
const STAND_INS = /[←↑→↓↺↻▲▼▣✎✏✓✔⬆⬇]/u;

describe('R-217a: no icon is drawn as a character', () => {
  it('finds none of the old stand-ins in either screen or in @tt/ui', () => {
    const files = ['apps/gm/src', 'apps/table/src', 'packages/ui/src'].flatMap((dir) => sources(join(ROOT, dir)));
    expect(files.length).toBeGreaterThan(30);
    const found = files.flatMap((file) => code(readFileSync(file, 'utf8')).split('\n')
      .filter((line) => STAND_INS.test(line))
      .map((line) => `${relative(ROOT, file)}: ${line.trim()}`));
    expect(found).toEqual([]);
  });
});
