// The composition root (R-66). The only place anything is wired together.

import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  backUpData, fileCampaignStore, fileImageStore, fileLibraryStore, filePrefabStore, fileSaveStore,
} from '@tt/persistence';
import { createSession } from './session/index.js';
import { serveSockets } from './transport/index.js';
import { serveStatic } from './static/index.js';
import { serveImages } from './images/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const PORT = Number(process.env.PORT) || 8080;
const DATA = process.env.TT_DATA ?? join(ROOT, 'data');
/** How many start-up backups to keep; the oldest go first (D-320). */
const BACKUPS_KEPT = 20;

/** LAN addresses the table display can be reached at (R-93). */
function lanUrls(port: number): readonly string[] {
  const out: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) out.push(`http://${entry.address}:${port}/table/`);
    }
  }
  return out;
}

/*
 * A copy of the data before anything reads it (D-320), so a session that goes
 * wrong is one folder away from where it started. Never a reason not to
 * start: a host that cannot back up says so and serves the table anyway.
 */
let backup: string | null = null;
try {
  backup = backUpData(DATA, new Date(), BACKUPS_KEPT);
} catch (error) {
  console.warn(`  Could not back up the data: ${error instanceof Error ? error.message : String(error)}`);
}

const store = fileCampaignStore(join(DATA, 'campaigns'));
const saves = fileSaveStore(join(DATA, 'saves'));
// The Tokens Library is one file beside the campaigns: it belongs to all of
// them (D-307).
const library = fileLibraryStore(join(DATA, 'library.json'));
// Prefabs beside it, a file each, for the same reason (D-321).
const prefabs = filePrefabStore(join(DATA, 'prefabs'));
const session = createSession(store, saves, () => lanUrls(PORT), undefined, library, prefabs);

// Pictures beside the campaigns, not in one: the Tokens Library is shared
// across campaigns (D-307), and a portrait is the same kind of thing (R-204).
const images = serveImages(fileImageStore(join(DATA, 'images')));
const apps = serveStatic({
  gm: join(ROOT, 'apps', 'gm', 'dist'),
  table: join(ROOT, 'apps', 'table', 'dist'),
});
const server = createServer((req, res) => {
  // The last word on a request gone wrong: it fails, the host does not.
  try {
    if (!images(req, res)) apps(req, res);
  } catch (error) {
    console.error(`  ${req.method} ${req.url} failed:`, error);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});

serveSockets(server, session);

server.listen(PORT, () => {
  const urls = lanUrls(PORT);
  console.log('\n  Table Top Scenarios');
  console.log(`  data in  ${DATA}`);
  if (backup) console.log(`  backup   ${backup}`);
  console.log(`  GM      http://localhost:${PORT}/gm/`);
  console.log(`  Table   http://localhost:${PORT}/table/`);
  for (const url of urls) console.log(`  LAN     ${url}`);
  console.log('');
});
