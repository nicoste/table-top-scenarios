// The composition root (R-66). The only place anything is wired together.

import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fileCampaignStore } from '@tt/persistence';
import { createSession } from './session/index.js';
import { serveSockets } from './transport/index.js';
import { serveStatic } from './static/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const PORT = Number(process.env.PORT) || 8080;
const DATA = process.env.TT_DATA ?? join(ROOT, 'data', 'campaigns');

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

const store = fileCampaignStore(DATA);
const session = createSession(store, () => lanUrls(PORT));

const server = createServer(serveStatic({
  gm: join(ROOT, 'apps', 'gm', 'dist'),
  table: join(ROOT, 'apps', 'table', 'dist'),
}));

serveSockets(server, session);

server.listen(PORT, () => {
  const urls = lanUrls(PORT);
  console.log('\n  Table Top Scenarios');
  console.log(`  campaigns in  ${DATA}`);
  console.log(`  GM      http://localhost:${PORT}/gm/`);
  console.log(`  Table   http://localhost:${PORT}/table/`);
  for (const url of urls) console.log(`  LAN     ${url}`);
  console.log('');
});
