// The composition root (R-66). The only place anything is wired together.

import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fileCampaignStore, fileImageStore, fileSaveStore } from '@tt/persistence';
import { createSession } from './session/index.js';
import { serveSockets } from './transport/index.js';
import { serveStatic } from './static/index.js';
import { serveImages } from './images/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const PORT = Number(process.env.PORT) || 8080;
const DATA = process.env.TT_DATA ?? join(ROOT, 'data');

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

const store = fileCampaignStore(join(DATA, 'campaigns'));
const saves = fileSaveStore(join(DATA, 'saves'));
const session = createSession(store, saves, () => lanUrls(PORT));

// Pictures beside the campaigns, not in one: the Tokens Library is shared
// across campaigns (D-307), and a portrait is the same kind of thing (R-204).
const images = serveImages(fileImageStore(join(DATA, 'images')));
const apps = serveStatic({
  gm: join(ROOT, 'apps', 'gm', 'dist'),
  table: join(ROOT, 'apps', 'table', 'dist'),
});
const server = createServer((req, res) => {
  if (!images(req, res)) apps(req, res);
});

serveSockets(server, session);

server.listen(PORT, () => {
  const urls = lanUrls(PORT);
  console.log('\n  Table Top Scenarios');
  console.log(`  data in  ${DATA}`);
  console.log(`  GM      http://localhost:${PORT}/gm/`);
  console.log(`  Table   http://localhost:${PORT}/table/`);
  for (const url of urls) console.log(`  LAN     ${url}`);
  console.log('');
});
