// Pictures over HTTP (R-204). A real server on an ephemeral port, real
// requests, a real directory — no mocks (R-23a).

import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileImageStore } from '@tt/persistence';
import { serveImages } from '../src/images/index.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7]);

let server: Server | null = null;
let root: string | null = null;

afterEach(async () => {
  if (server) await new Promise<void>((done) => server!.close(() => done()));
  if (root) rmSync(root, { recursive: true, force: true });
  server = null;
  root = null;
});

async function host(): Promise<string> {
  root = mkdtempSync(join(tmpdir(), 'tt-host-images-'));
  const images = serveImages(fileImageStore(root));
  server = createServer((req, res) => {
    if (!images(req, res)) { res.writeHead(418); res.end(); }
  });
  await new Promise<void>((done) => server!.listen(0, done));
  return `http://localhost:${(server!.address() as AddressInfo).port}`;
}

describe('pictures over HTTP', () => {
  it('stores one and hands it back by the name it answers with', async () => {
    const base = await host();
    const stored = await fetch(`${base}/images`, {
      method: 'POST', headers: { 'Content-Type': 'image/png' }, body: PNG,
    });
    expect(stored.status).toBe(200);
    const { id } = await stored.json() as { id: string };
    expect(id).toMatch(/^[0-9a-f]{64}\.png$/);

    const fetched = await fetch(`${base}/images/${id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get('content-type')).toBe('image/png');
    expect(fetched.headers.get('x-content-type-options')).toBe('nosniff');
    // Named by content, so it may be kept for good.
    expect(fetched.headers.get('cache-control')).toContain('immutable');
    expect(new Uint8Array(await fetched.arrayBuffer())).toEqual(PNG);
  });

  it('refuses what is not a picture it takes', async () => {
    const base = await host();
    const page = await fetch(`${base}/images`, {
      method: 'POST', headers: { 'Content-Type': 'text/html' }, body: '<p>hi</p>',
    });
    expect(page.status).toBe(415);
  });

  it('stops reading a picture that is too large', async () => {
    const base = await host();
    const huge = new Uint8Array(fileImageStore(root!).maxBytes + 1024);
    huge.set(PNG);
    const response = await fetch(`${base}/images`, {
      method: 'POST', headers: { 'Content-Type': 'image/png' }, body: huge,
    }).catch(() => null);
    // Either the refusal arrives, or the connection is cut before it can —
    // both are the host declining to keep it.
    if (response) expect(response.status).toBe(413);
  });

  it('answers 404 for a name with nothing behind it, and for a path that is not a name', async () => {
    const base = await host();
    expect((await fetch(`${base}/images/${'b'.repeat(64)}.png`)).status).toBe(404);
    expect((await fetch(`${base}/images/..%2F..%2Fpackage.json`)).status).toBe(404);
  });

  it('leaves every other path to the next handler', async () => {
    const base = await host();
    expect((await fetch(`${base}/gm/`)).status).toBe(418);
    expect((await fetch(`${base}/imagesque`)).status).toBe(418);
  });
});
