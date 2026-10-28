// The host stays up when something under it fails: a write the disk refuses, a
// bug that throws, a frame or a path no browser would send. A real http server,
// real sockets, real requests — no mocks (R-23a); the one stand-in is a store
// whose writes fail, because a full disk is not something a test can arrange.

import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { fileImageStore, memoryCampaignStore, memorySaveStore, type CampaignStore } from '@tt/persistence';
import type { OutboundMessage } from '@tt/protocol';
import { createSession, type Session } from '../src/session/index.js';
import { serveSockets } from '../src/transport/index.js';
import { serveStatic } from '../src/static/index.js';
import { serveImages } from '../src/images/index.js';

const clock = { nowIso: () => '2026-01-01T00:00:00.000Z' };

/** A campaign store on a disk that has filled up. */
const fullDisk = (): CampaignStore => ({
  ...memoryCampaignStore(),
  save: () => { throw new Error('ENOSPC: no space left on device'); },
});

let closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers) await close();
  closers = [];
});

async function listen(server: Server): Promise<number> {
  await new Promise<void>((done) => server.listen(0, () => done()));
  closers.push(() => new Promise<void>((done) => server.close(() => done())));
  return (server.address() as AddressInfo).port;
}

async function sockets(session: Session): Promise<number> {
  const server = createServer();
  const transport = serveSockets(server, session);
  closers.push(async () => transport.close());
  return listen(server);
}

/** Opens a socket and collects what it is sent. */
async function connectAs(port: number, role: string): Promise<{ socket: WebSocket; seen: OutboundMessage[] }> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/?role=${role}`);
  const seen: OutboundMessage[] = [];
  socket.on('message', (raw) => { seen.push(JSON.parse(String(raw)) as OutboundMessage); });
  await new Promise<void>((open) => socket.once('open', () => open()));
  closers.unshift(async () => { socket.terminate(); });
  return { socket, seen };
}

const settle = async () => {
  for (let i = 0; i < 40; i += 1) await new Promise((tick) => setImmediate(tick));
};

const rejections = (seen: OutboundMessage[]) =>
  seen.flatMap((m) => (m.type === 'rejected' ? [m.reason] : []));

describe('a write the disk refuses', () => {
  it('keeps the change and says it is not on disk, rather than throwing', () => {
    const session = createSession(fullDisk(), memorySaveStore(), () => [], clock);
    const result = session.handle('gm', { kind: 'createCampaign', name: 'Ashfall' });
    expect(result.ok).toBe(true);
    expect(result.unsaved).toMatch(/ENOSPC/);
    expect(session.state().active?.name).toBe('Ashfall');
  });

  it('shows the change on every screen and tells the sender', async () => {
    const port = await sockets(createSession(fullDisk(), memorySaveStore(), () => [], clock));
    const gm = await connectAs(port, 'gm');
    await settle();
    gm.socket.send(JSON.stringify({ kind: 'createCampaign', name: 'Ashfall' }));
    await settle();
    expect(rejections(gm.seen)).toEqual([expect.stringMatching(/^Not saved to disk/)]);
    const last = gm.seen.filter((m) => m.type === 'view').at(-1);
    expect(JSON.stringify(last)).toContain('Ashfall');
  });
});

describe('the socket', () => {
  it('answers an intent that throws with a rejection, and keeps serving', async () => {
    const real = createSession(memoryCampaignStore(), memorySaveStore(), () => [], clock);
    const port = await sockets({ ...real, handle: () => { throw new Error('a bug'); } });
    const gm = await connectAs(port, 'gm');
    gm.socket.send(JSON.stringify({ kind: 'createCampaign', name: 'Ashfall' }));
    await settle();
    expect(rejections(gm.seen)).toHaveLength(1);
    const later = await connectAs(port, 'table');
    await settle();
    expect(later.seen.some((m) => m.type === 'hello')).toBe(true);
  });

  it('survives a malformed frame', async () => {
    const port = await sockets(createSession(memoryCampaignStore(), memorySaveStore(), () => [], clock));
    const bad = await connectAs(port, 'table');
    // A client frame must be masked; this one is not, which no browser sends.
    (bad.socket as unknown as { _socket: { write(b: Buffer): void } })._socket.write(Buffer.from([0x81, 0x01, 0x41]));
    await new Promise<void>((closed) => bad.socket.once('close', () => closed()));
    const later = await connectAs(port, 'table');
    await settle();
    expect(later.seen.some((m) => m.type === 'hello')).toBe(true);
  });
});

describe('a path no browser would send', () => {
  it('is a 400 from the apps, not a thrown URIError', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tt-host-static-'));
    closers.push(async () => rmSync(root, { recursive: true, force: true }));
    const port = await listen(createServer(serveStatic({ gm: root, table: root })));
    expect((await fetch(`http://localhost:${port}/gm/%E0%A4%A`)).status).toBe(400);
    expect((await fetch(`http://localhost:${port}/gm/`)).status).toBe(503);
  });

  it('is a 404 from the pictures, not a thrown URIError', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tt-host-images-'));
    closers.push(async () => rmSync(root, { recursive: true, force: true }));
    const images = serveImages(fileImageStore(root));
    const port = await listen(createServer((req, res) => {
      if (!images(req, res)) { res.writeHead(418); res.end(); }
    }));
    expect((await fetch(`http://localhost:${port}/images/%E0%A4%A`)).status).toBe(404);
  });
});
