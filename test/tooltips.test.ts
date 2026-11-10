// R-110: a control that needs explaining carries a Tooltip, never a native
// `title` — slow to appear, unstyled, invisible on touch and to the keyboard
// (R-112). Six were left after D-390; this reads the screens' source so none
// comes back (D-391).
import { describe, it, expect } from 'vitest';
import { relative } from 'node:path';
import { ROOT, jsxAttributes, parse, screenSources } from './tsx-source.js';

/**
 * Components whose own prop is called `title` and is not an element's: a crop
 * dialog's heading, a gallery section's.
 */
const OWN_TITLE = new Set(['PictureCrop', 'Section']);

const nativeTitles = (path: string, text?: string) =>
  jsxAttributes(parse(path, text)).filter((attribute) => attribute.name === 'title' && !OWN_TITLE.has(attribute.tag));

describe('R-110: a tooltip is a Tooltip, never a native title', () => {
  it('reads a title on an element or one passed through, and not a heading', () => {
    const titled = (text: string) => nativeTitles('x.tsx', text).map((attribute) => attribute.tag);
    expect(titled('const a = <button onClick={() => go()} title="Go">Go</button>;')).toEqual(['button']);
    expect(titled('const a = <DraftInput value={v} title={`Its ${size}`} />;')).toEqual(['DraftInput']);
    expect(titled('const a = <input accept="image/*" />; const b = <a title="x" />;')).toEqual(['a']);
    expect(titled('const a = <PictureCrop title={name} />;')).toEqual([]);
    expect(titled('const a = <svg><title>Compass</title></svg>;')).toEqual([]);
  });

  it('finds none on either screen or in @tt/ui', () => {
    const files = screenSources();
    expect(files.length).toBeGreaterThan(30);
    const found = files.flatMap((path) => nativeTitles(path)
      .map((attribute) => `${relative(ROOT, path)}:${attribute.line}: <${attribute.tag} title=…>`));
    expect(found).toEqual([]);
  });
});
