// The Tokens Library on disk (D-307): one file beside the campaigns, because
// it belongs to all of them. Stores and loads; decides nothing.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { TokensLibrary } from '@tt/domain';
import { EMPTY_LIBRARY, libraryFromJSON, libraryToJSON } from '@tt/domain';

export interface LibraryStore {
  load(): TokensLibrary;
  save(library: TokensLibrary): void;
}

export function fileLibraryStore(path: string): LibraryStore {
  return {
    /**
     * An unreadable file is an empty library rather than a host that will
     * not start — and it is **moved aside**, not overwritten, so the next
     * save cannot destroy whatever the GM had (D-108's habit).
     */
    load() {
      if (!existsSync(path)) return EMPTY_LIBRARY;
      try {
        return libraryFromJSON(JSON.parse(readFileSync(path, 'utf8')));
      } catch {
        renameSync(path, `${path}.unreadable-${Date.now()}`);
        return EMPTY_LIBRARY;
      }
    },
    save(library) {
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, JSON.stringify(libraryToJSON(library), null, 1), 'utf8');
      renameSync(tmp, path);
    },
  };
}
