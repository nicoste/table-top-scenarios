// The playbook names real files and real test names. Both drift silently, and a
// playbook that lies is worse than no playbook — so both are checked.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('PLAYBOOK.md stays honest', () => {
  const playbook = read('docs/PLAYBOOK.md');

  it('every repo path it names exists', () => {
    const paths = [...playbook.matchAll(/`((?:packages|apps|test|tools)\/[A-Za-z0-9._/-]+)`/g)]
      .map((m) => m[1]!)
      .filter((p) => /\.[a-z]+$/.test(p)); // files only, not folders
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.filter((p) => !existsSync(join(ROOT, p)))).toEqual([]);
  });

  it('the reference test it quotes actually exists under that name', () => {
    const quoted = [...playbook.matchAll(/\*"([^"]+)"\*/g)].map((m) => m[1]!);
    const world = read('packages/domain/test/world.test.ts');
    for (const name of quoted) expect(world).toContain(name);
  });

  it('cites rules that are defined in ARCHITECTURE.md', () => {
    const architecture = read('docs/ARCHITECTURE.md');
    const defined = new Set(
      [...architecture.matchAll(/\*\*(R-\d+[a-z]?)\.\*\*/g)].map((m) => m[1]!),
    );
    const cited = new Set([...playbook.matchAll(/\b(R-\d+[a-z]?)\b/g)].map((m) => m[1]!));
    expect([...cited].filter((r) => !defined.has(r))).toEqual([]);
  });

  it('cites decisions that are recorded in DECISIONS.md', () => {
    const decisions = read('docs/DECISIONS.md');
    const recorded = new Set([...decisions.matchAll(/^### (D-\d+)/gm)].map((m) => m[1]!));
    const cited = new Set([...playbook.matchAll(/\b(D-\d+)\b/g)].map((m) => m[1]!));
    expect([...cited].filter((d) => !recorded.has(d))).toEqual([]);
  });
});

describe('MEASUREMENTS.md stays honest', () => {
  const measurements = read('docs/MEASUREMENTS.md');

  it('cites rules and decisions that exist', () => {
    // Same guard the playbook gets: a figure is only worth keeping if the
    // reasoning it points at can still be found.
    const architecture = read('docs/ARCHITECTURE.md');
    const decisions = read('docs/DECISIONS.md');
    const rules = new Set(
      [...architecture.matchAll(/\*\*(R-\d+[a-z]?)\.\*\*/g)].map((m) => m[1]!),
    );
    const recorded = new Set([...decisions.matchAll(/^### ([DO]-\d+)/gm)].map((m) => m[1]!));
    const citedRules = [...measurements.matchAll(/\b(R-\d+[a-z]?)\b/g)].map((m) => m[1]!);
    const citedCalls = [...measurements.matchAll(/\b([DO]-\d+)\b/g)].map((m) => m[1]!);
    expect(citedRules.filter((r) => !rules.has(r))).toEqual([]);
    expect(citedCalls.filter((d) => !recorded.has(d))).toEqual([]);
  });

  it('says which machine every section was measured on', () => {
    /*
     * The rule the file itself states: a number without its conditions is
     * noise. Two readings nearly misled us by coming from different machines,
     * so every table of timings names one.
     */
    expect(measurements).toContain("GM's Chrome");
    expect(measurements).toContain('Pane');
    expect(measurements).toContain('not comparable');
  });
});

describe('the rule set stays coherent', () => {
  const architecture = read('docs/ARCHITECTURE.md');

  it('defines no rule number twice', () => {
    const ids = [...architecture.matchAll(/\*\*(R-\d+[a-z]?)\.\*\*/g)].map((m) => m[1]!);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it('mentions Unity nowhere — rules stand on their own reasoning (D-053 era)', () => {
    expect(/unity|POV\.cs|FindAnyObjectByType/i.test(architecture)).toBe(false);
  });
});

describe('DESIGN_SYSTEM.md stays honest', () => {
  const designSystem = read('docs/DESIGN_SYSTEM.md');
  const tokens = read('packages/theme/tokens.css');
  const stylesheets = ['packages/theme/base.css', 'apps/gm/src/shell/shell.css', 'apps/table/src/shell/shell.css']
    .map(read).join('\n');

  it('cites rules and decisions that exist', () => {
    const architecture = read('docs/ARCHITECTURE.md');
    const decisions = read('docs/DECISIONS.md');
    const rules = new Set(
      [...architecture.matchAll(/\*\*(R-\d+[a-z]?)\.\*\*/g)].map((m) => m[1]!),
    );
    const recorded = new Set([...decisions.matchAll(/^### (D-\d+)/gm)].map((m) => m[1]!));
    const citedRules = [...designSystem.matchAll(/\b(R-\d+[a-z]?)\b/g)].map((m) => m[1]!);
    const citedCalls = [...designSystem.matchAll(/\b(D-\d+)\b/g)].map((m) => m[1]!);
    expect(citedRules.filter((r) => !rules.has(r))).toEqual([]);
    expect(citedCalls.filter((d) => !recorded.has(d))).toEqual([]);
  });

  it('names only tokens the theme defines', () => {
    // The page it replaced listed tokens nobody had defined (D-387).
    const named = new Set([...designSystem.matchAll(/`(--[a-z0-9-]+)`/g)].map((m) => m[1]!));
    expect(named.size).toBeGreaterThan(10);
    expect([...named].filter((name) => !new RegExp(`${name}\\s*:`).test(tokens))).toEqual([]);
  });

  it('names only classes a stylesheet styles', () => {
    // Selectors in backticks — `.card`, `.stage-list li`, `button.quiet` — not file names.
    const selectors = [...designSystem.matchAll(/`([a-z]*\.[a-z][\w.-]*(?: [a-z][\w.-]*)*)`/g)]
      .map((m) => m[1]!)
      .filter((sel) => !/\.(ts|tsx|css|html|md)$/.test(sel));
    const classes = new Set(selectors.flatMap((sel) => [...sel.matchAll(/\.([a-z][\w-]*)/g)].map((m) => m[1]!)));
    expect(classes.size).toBeGreaterThan(10);
    expect([...classes].filter((cls) => !new RegExp(`\\.${cls}(?![\\w-])`).test(stylesheets))).toEqual([]);
  });

  it('lists exactly the icons the registry draws', async () => {
    const { GLYPHS } = await import('@tt/ui');
    const section = designSystem.slice(designSystem.indexOf('## Icons'), designSystem.indexOf('## Components'));
    const listed = [...section.matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1]!);
    expect(listed.sort()).toEqual(Object.keys(GLYPHS).sort());
  });

  it('points at a gallery drawn from the registry and the screens\' own stylesheet', () => {
    expect(read('apps/gm/src/gallery/main.tsx')).toContain('GLYPHS');
    expect(read('apps/gm/gallery.html')).toContain('./src/shell/shell.css');
    expect(existsSync(join(ROOT, 'docs/ui-gallery.html'))).toBe(false);
  });
});

describe('each page says which browsers it needs', () => {
  it('names the floor the screens check for (D-386)', async () => {
    const { BROWSER_FLOOR } = await import('@tt/client-core');
    for (const page of ['apps/gm/index.html', 'apps/table/index.html']) {
      const html = read(page);
      expect(html, page).toContain('class="too-old"');
      expect(html, page).toContain(BROWSER_FLOOR);
    }
  });
});

