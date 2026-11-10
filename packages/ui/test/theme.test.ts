// A fallback here is the theme's own value (R-111).
//
// Every component reads `var(--token, fallback)`. With a shell around it the
// fallback is never used, so a wrong one is invisible until something renders
// the component without one — which is how five different greys came to stand
// for the same border. THEME holds one fallback per token; this holds each of
// them against what `@tt/theme`'s tokens.css works out for that token.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEME } from '@tt/ui';

const HERE = dirname(fileURLToPath(import.meta.url));
const tokensCss = readFileSync(join(HERE, '../../theme/tokens.css'), 'utf8');
const defined = new Map(
  [...tokensCss.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
);

type Rgba = readonly [number, number, number, number];

/** The top-level arguments of a CSS function, split on the commas between them. */
function args(inside: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < inside.length; i++) {
    if (inside[i] === '(') depth++;
    else if (inside[i] === ')') depth--;
    else if (inside[i] === ',' && depth === 0) { out.push(inside.slice(start, i).trim()); start = i + 1; }
  }
  return [...out, inside.slice(start).trim()];
}

/** A colour as tokens.css writes one: a hex, a keyword, a var() or a color-mix() in srgb. */
function colour(value: string): Rgba {
  const v = value.trim();
  if (v === 'transparent') return [0, 0, 0, 0];
  if (v === 'black') return [0, 0, 0, 1];
  if (v === 'white') return [255, 255, 255, 1];
  const ref = /^var\((--[a-z0-9-]+)\)$/.exec(v);
  if (ref) return colour(defined.get(ref[1]!)!);
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(v);
  if (hex) {
    const n = Number.parseInt(hex[1]!, 16);
    return [n >> 16, (n >> 8) & 255, n & 255, hex[2] ? Number.parseInt(hex[2], 16) / 255 : 1];
  }
  const mix = /^color-mix\(in srgb,(.*)\)$/s.exec(v);
  if (!mix) throw new Error(`not a colour this test reads: ${v}`);
  const [a, b] = args(mix[1]!).map((part) => {
    const m = /^(.*?)(?:\s+(\d+(?:\.\d+)?)%)?$/s.exec(part)!;
    return { c: colour(m[1]!), p: m[2] === undefined ? null : Number(m[2]) / 100 };
  });
  const p = a!.p ?? (b!.p === null ? 0.5 : 1 - b!.p);
  // srgb mixing works on premultiplied alpha, so a mix with transparent keeps
  // the colour and only thins it.
  const alpha = a!.c[3] * p + b!.c[3] * (1 - p);
  const ch = (i: number) => (alpha === 0 ? 0 : (a!.c[i]! * a!.c[3] * p + b!.c[i]! * b!.c[3] * (1 - p)) / alpha);
  return [ch(0), ch(1), ch(2), alpha];
}

const entries = Object.entries(THEME).map(([key, read]) => {
  const m = /^var\((--[a-z0-9-]+), (.*)\)$/s.exec(read);
  return { key, name: m![1]!, fallback: m![2]! };
});

describe('THEME, the one place this package reads the theme', () => {
  it('reads only tokens the theme defines', () => {
    expect(entries.filter((entry) => !defined.has(entry.name)).map((entry) => entry.name)).toEqual([]);
  });

  it('falls back to the colour the theme works out for each token', () => {
    for (const { name, fallback } of entries) {
      if (!fallback.startsWith('#')) continue;
      const want = colour(defined.get(name)!), got = colour(fallback);
      for (let i = 0; i < 3; i++) expect(Math.abs(got[i]! - want[i]!), `${name} channel ${i}`).toBeLessThanOrEqual(1);
      expect(Math.abs(got[3] - want[3]), `${name} alpha`).toBeLessThanOrEqual(0.01);
    }
  });

  it("falls back to the theme's own sizes and font", () => {
    for (const { name, fallback } of entries) {
      if (fallback.startsWith('#') || fallback.includes('inset')) continue;
      expect(fallback, name).toBe(defined.get(name));
    }
  });
});
