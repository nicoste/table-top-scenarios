// The Tokens Library (D-307): entries made once, found again by name and tag.

import { describe, it, expect } from 'vitest';
import {
  EMPTY_LIBRARY, addTemplate, editTemplate, removeTemplate, templateById, searchLibrary,
  cleanTags, tagsFromText, libraryToJSON, libraryFromJSON, MAX_TAGS, cleanSheetUrl,
} from '@tt/domain';
import type { ImageId, TokensLibrary } from '@tt/domain';

const PICTURE = `${'e'.repeat(64)}.webp` as ImageId;

function library(): TokensLibrary {
  let lib = EMPTY_LIBRARY;
  lib = addTemplate(lib, { name: 'Goblin', tags: ['monster', 'goblinoid'] });
  lib = addTemplate(lib, { name: 'Hobgoblin', tags: ['monster', 'goblinoid'] });
  lib = addTemplate(lib, { name: 'Bartender', tags: ['npc', 'saltmarsh'] });
  lib = addTemplate(lib, { name: 'Gate guard', tags: ['npc', 'phandalin'] });
  return lib;
}

describe('the Tokens Library', () => {
  it('makes an entry with a name, tags and no picture by default', () => {
    const [goblin] = addTemplate(EMPTY_LIBRARY, { name: '  Goblin  ' });
    expect(goblin).toMatchObject({ name: 'Goblin', tags: [], image: null });
    expect(goblin!.id).toMatch(/^template_/);
  });

  it('names a blank entry rather than refusing it', () => {
    expect(addTemplate(EMPTY_LIBRARY, { name: '   ' })[0]!.name).toBe('New token');
  });

  it('keeps tags lower case, dashed, unrepeated and in order', () => {
    expect(cleanTags(['Saltmarsh', 'NPC', 'npc', ' town guard ', ''])).toEqual(['saltmarsh', 'npc', 'town-guard']);
    expect(tagsFromText('npc, Saltmarsh  undead')).toEqual(['npc', 'saltmarsh', 'undead']);
    expect(cleanTags(Array.from({ length: 30 }, (_, i) => `t${i}`))).toHaveLength(MAX_TAGS);
  });

  it('edits an entry, and is the same library when nothing changed (R-165)', () => {
    const lib = library();
    const id = lib[0]!.id;
    expect(editTemplate(lib, id, { name: 'Goblin', tags: ['monster', 'goblinoid'] })).toBe(lib);
    const pictured = editTemplate(lib, id, { image: PICTURE });
    expect(templateById(pictured, id)!.image).toBe(PICTURE);
    expect(templateById(editTemplate(pictured, id, { image: null }), id)!.image).toBeNull();
  });

  it('removes an entry, and is the same library for one it does not have', () => {
    const lib = library();
    expect(removeTemplate(lib, lib[1]!.id)).toHaveLength(3);
    expect(removeTemplate(lib, 'template_nobody')).toBe(lib);
  });
});

describe('finding an entry (D-307)', () => {
  const names = (query: string) => searchLibrary(library(), query).map((t) => t.name);

  it('finds everything, by name, for an empty search', () => {
    expect(names('')).toEqual(['Bartender', 'Gate guard', 'Goblin', 'Hobgoblin']);
  });

  it('matches inside names and tags, without case', () => {
    expect(names('GOB')).toEqual(['Goblin', 'Hobgoblin']);
    expect(names('npc')).toEqual(['Bartender', 'Gate guard']);
  });

  it('narrows with every word: the NPCs of one campaign', () => {
    // The GM's Owlbear habit: shared NPCs tagged by campaign as well as kind.
    expect(names('npc saltmarsh')).toEqual(['Bartender']);
    expect(names('npc, phandalin')).toEqual(['Gate guard']);
    expect(names('npc goblinoid')).toEqual([]);
  });
});

describe('the library on disk', () => {
  it('round-trips', () => {
    const lib = editTemplate(library(), library()[0]!.id, {});
    expect(libraryFromJSON(JSON.parse(JSON.stringify(libraryToJSON(lib))))).toEqual(lib);
  });

  it('reads a damaged file as much as it can, rather than losing the library', () => {
    const read = libraryFromJSON([
      { id: 'template_a', name: 'Goblin', tags: ['Monster'], image: '../../x.png' },
      { name: 'no id at all' },
      'not even an object',
      { id: 'template_a', name: 'a repeat' },
      { id: 'template_b', tags: 'not a list' },
    ]);
    expect(read.map((t) => t.id)).toEqual(['template_a', 'template_b']);
    expect(read[0]).toMatchObject({ name: 'Goblin', tags: ['monster'], image: null });
    expect(read[1]).toMatchObject({ name: 'New token', tags: [] });
    expect(libraryFromJSON({ not: 'a list' })).toEqual([]);
  });
});

describe('a sheet link (D-313)', () => {
  it('keeps a web address', () => {
    expect(cleanSheetUrl('https://www.dndbeyond.com/monsters/goblin')).toBe('https://www.dndbeyond.com/monsters/goblin');
    expect(cleanSheetUrl('http://example.com/sheet?id=7')).toBe('http://example.com/sheet?id=7');
  });

  it('adds the scheme a GM leaves off', () => {
    expect(cleanSheetUrl('  dndbeyond.com/monsters/goblin  ')).toBe('https://dndbeyond.com/monsters/goblin');
  });

  it('keeps nothing that would run code or is not on the web', () => {
    // Opened as a link from the console: a link that runs code is not a sheet.
    for (const bad of [
      'javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<script>x</script>',
      'file:///etc/passwd', 'ftp://example.com/x', 'vbscript:msgbox', 'not a link', 'goblin', '',
    ]) {
      expect(cleanSheetUrl(bad), bad).toBeNull();
    }
    expect(cleanSheetUrl(null)).toBeNull();
    expect(cleanSheetUrl(`https://example.com/${'x'.repeat(600)}`)).toBeNull();
  });

  it('is kept on an entry, cleaned on the way in, and the same entry when nothing changed', () => {
    const [entry] = addTemplate(EMPTY_LIBRARY, { name: 'Goblin', url: 'dndbeyond.com/monsters/goblin' });
    expect(entry!.url).toBe('https://dndbeyond.com/monsters/goblin');
    const lib = [entry!];
    expect(editTemplate(lib, entry!.id, { url: 'https://dndbeyond.com/monsters/goblin' })).toBe(lib);
    expect(templateById(editTemplate(lib, entry!.id, { url: 'javascript:alert(1)' }), entry!.id)!.url).toBeNull();
    expect(templateById(editTemplate(lib, entry!.id, { url: null }), entry!.id)!.url).toBeNull();
  });

  it('is cleaned when read from a hand-edited file too', () => {
    const [read] = libraryFromJSON([{ id: 'template_a', name: 'Goblin', tags: [], image: null, url: 'javascript:alert(1)' }]);
    expect(read!.url).toBeNull();
  });
});

