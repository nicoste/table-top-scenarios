// R-217a: one concept, one icon, drawn from GLYPHS. The arrows and marks that
// stood in for icons — ↑ ↓ to reorder, ✎ to edit, ← to go back, ✓ to confirm —
// were characters, each in the font of wherever it sat (D-390). This reads what
// the screens draw for them, so a character cannot come back as an icon.
import { describe, it, expect } from 'vitest';
import { relative } from 'node:path';
import { ROOT, drawnText, parse, screenSources } from './tsx-source.js';

// Arrows, the edit pencil, ticks and the old map mark. Not × and ✕: those are
// a delete's trigger and a cost's "impassable", typography rather than icons.
const STAND_INS = /[←↑→↓↺↻▲▼▣✎✏✓✔⬆⬇]/u;

describe('R-217a: no icon is drawn as a character', () => {
  it('reads what is drawn, not what a comment says', () => {
    const file = parse('x.tsx', '// ← went (D-390)\nconst a = <button>{"↑"}</button>;\nconst b = <i>✎</i>;\n');
    expect(drawnText(file).filter((part) => STAND_INS.test(part.text)).map((part) => part.line)).toEqual([2, 3]);
  });

  it('finds none of the old stand-ins in either screen or in @tt/ui', () => {
    const files = screenSources();
    expect(files.length).toBeGreaterThan(30);
    const found = files.flatMap((path) => drawnText(parse(path))
      .filter((part) => STAND_INS.test(part.text))
      .map((part) => `${relative(ROOT, path)}:${part.line}: ${part.text.trim()}`));
    expect(found).toEqual([]);
  });
});
