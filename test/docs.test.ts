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
