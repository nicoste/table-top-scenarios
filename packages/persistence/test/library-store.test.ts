// The Tokens Library on disk (D-307).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileLibraryStore } from '@tt/persistence';
import { addTemplate, EMPTY_LIBRARY } from '@tt/domain';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'tt-library-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('the Tokens Library on disk', () => {
  it('is empty before anything is written', () => {
    expect(fileLibraryStore(join(root, 'library.json')).load()).toEqual(EMPTY_LIBRARY);
  });

  it('reads back what it wrote', () => {
    const store = fileLibraryStore(join(root, 'library.json'));
    const library = addTemplate(EMPTY_LIBRARY, { name: 'Goblin', tags: ['monster'] });
    store.save(library);
    expect(fileLibraryStore(join(root, 'library.json')).load()).toEqual(library);
  });

  it('moves an unreadable file aside rather than writing over it', () => {
    const path = join(root, 'library.json');
    writeFileSync(path, '{ this is not json', 'utf8');
    expect(fileLibraryStore(path).load()).toEqual(EMPTY_LIBRARY);
    expect(readdirSync(root).some((name) => name.startsWith('library.json.unreadable-'))).toBe(true);
  });
});
