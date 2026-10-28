// Pictures over HTTP (R-204): stored by POST, served by GET. Knows nothing
// about rules — which member a picture belongs to is an intent's business
// (R-3), and this only keeps bytes and hands them back.
//
// HTTP rather than the socket because a picture is bytes, and every message
// on the socket is a JSON view or a JSON intent. Storing one changes nothing
// any screen shows until an intent names it, so it needs no seat — and the
// GM seat is open to any claimant by design (R-127), so a seat check here
// would guard nothing the socket does not already leave open.

import { createReadStream } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ImageStore } from '@tt/persistence';
import { IMAGE_PATH } from '@tt/protocol';

const PREFIX = IMAGE_PATH;

/**
 * Handles `/images` and answers `true`, or answers `false` for anything else
 * so the next handler can have it.
 */
export function serveImages(store: ImageStore) {
  return (req: IncomingMessage, res: ServerResponse): boolean => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path !== PREFIX && !path.startsWith(`${PREFIX}/`)) return false;

    if (req.method === 'POST' && path === PREFIX) {
      receive(req, res, store);
      return true;
    }

    if (req.method === 'GET' && path.startsWith(`${PREFIX}/`)) {
      let name: string;
      // A malformed escape (`%E0%A4%A`) throws, and a throw here is the host.
      try { name = decodeURIComponent(path.slice(PREFIX.length + 1)); } catch { name = ''; }
      const found = store.find(name);
      if (!found) { res.writeHead(404); res.end('no such picture'); return true; }
      res.writeHead(200, {
        'Content-Type': found.type,
        // Named by content, so a name never comes to mean another picture:
        // a screen may keep it for as long as it likes.
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      });
      createReadStream(found.file).on('error', () => res.destroy()).pipe(res);
      return true;
    }

    res.writeHead(405, { Allow: 'GET, POST' });
    res.end();
    return true;
  };
}

/** Reads one picture, stopping as soon as it is too large to keep. */
function receive(req: IncomingMessage, res: ServerResponse, store: ImageStore): void {
  const chunks: Buffer[] = [];
  let size = 0;
  let refused = false;
  // A client that hangs up mid-upload is an 'error' on the request, and an
  // unheard one is thrown.
  req.on('error', () => { refused = true; });
  req.on('data', (chunk: Buffer) => {
    if (refused) return;
    size += chunk.length;
    if (size > store.maxBytes) {
      refused = true;
      res.writeHead(413, { Connection: 'close' });
      res.end('too large');
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (refused) return;
    let id;
    try {
      id = store.put(new Uint8Array(Buffer.concat(chunks)), req.headers['content-type'] ?? '');
    } catch (error) {
      res.writeHead(507);
      res.end(`could not keep it: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (!id) {
      res.writeHead(415);
      res.end('not a picture this takes');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id }));
  });
}
