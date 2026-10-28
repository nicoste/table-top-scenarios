// Serves the two built browser apps. /gm and /table are SPA roots.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
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
    let path: string;
    // A malformed escape (`%E0%A4%A`) throws, and a throw here is the host.
    try { path = decodeURIComponent(url.pathname); } catch { res.writeHead(400); res.end('bad path'); return; }

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
    // With the separator: `dist-old` starts with `dist` too.
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403); res.end('no'); return; }

    // SPA fallback: an unknown path inside an app serves its index.
    const target = existsSync(file) && statSync(file).isFile() ? file : join(root, 'index.html');
    if (!existsSync(target)) {
      res.writeHead(503);
      res.end(`${which} app is not built yet — run: npm run build`);
      return;
    }

    res.writeHead(200, { 'Content-Type': MIME[extname(target)] ?? 'application/octet-stream' });
    // A file can go between the check and the read — a rebuild does exactly
    // that — and an unheard stream error is thrown.
    createReadStream(target).on('error', () => res.destroy()).pipe(res);
  };
}
