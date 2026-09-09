// Serves the two built browser apps. /gm and /table are SPA roots.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

export interface StaticRoots { gm: string; table: string }

export function serveStatic(roots: StaticRoots) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = decodeURIComponent(url.pathname);

    if (path === '/' ) {
      res.writeHead(302, { Location: '/gm/' });
      res.end();
      return;
    }

    const which = path.startsWith('/table') ? 'table' : path.startsWith('/gm') ? 'gm' : null;
    if (!which) { res.writeHead(404); res.end('not found'); return; }

    const root = roots[which];
    let rel = path.slice(which.length + 1) || '/';
    if (rel === '/' || rel === '') rel = '/index.html';

    const file = join(root, normalize(rel));
    if (!file.startsWith(root)) { res.writeHead(403); res.end('no'); return; }

    // SPA fallback: an unknown path inside an app serves its index.
    const target = existsSync(file) && statSync(file).isFile() ? file : join(root, 'index.html');
    if (!existsSync(target)) {
      res.writeHead(503);
      res.end(`${which} app is not built yet — run: npm run build`);
      return;
    }

    res.writeHead(200, { 'Content-Type': MIME[extname(target)] ?? 'application/octet-stream' });
    createReadStream(target).pipe(res);
  };
}
