// Seat arbitration (R-127, R-128). A real http server, a real `ws` client, an
// ephemeral port — no mocks (R-23a). What is being tested is a rule, and the
// rule is about what happens over an actual socket.

import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { memoryCampaignStore, memorySaveStore } from '@tt/persistence';
import type { OutboundMessage, Role } from '@tt/protocol';
import { createSession } from '../src/session/index.js';
import { serveSockets } from '../src/transport/index.js';

const clock = { nowIso: () => '2026-01-01T00:00:00.000Z' };

interface Rig {
  readonly port: number;
  readonly sockets: WebSocket[];
}

let rigs: Array<{ server: Server; close(): void; sockets: WebSocket[] }> = [];

afterEach(async () => {
  for (const rig of rigs) {
    for (const socket of rig.sockets) socket.close();
    rig.close();
    await new Promise<void>((done) => rig.server.close(() => done()));
  }
  rigs = [];
});

async function serve(heartbeatMs?: number): Promise<Rig> {
  const session = createSession(memoryCampaignStore(), memorySaveStore(), () => [], clock);
  const server = createServer();
  const transport = serveSockets(server, session, heartbeatMs === undefined ? {} : { heartbeatMs });
  await new Promise<void>((listening) => server.listen(0, () => listening()));
  const { port } = server.address() as AddressInfo;
  const rig: Rig = { port, sockets: [] };
  rigs.push({ server, close: () => transport.close(), sockets: rig.sockets });
  return rig;
}

/** A client that records every message it is sent, in order. */
class Client {
  readonly seen: OutboundMessage[] = [];
  private readonly socket: WebSocket;

  constructor(rig: Rig, role: string) {
    this.socket = new WebSocket(`ws://127.0.0.1:${rig.port}/?role=${role}`);
    rig.sockets.push(this.socket);
    this.socket.on('message', (raw) => {
      this.seen.push(JSON.parse(String(raw)) as OutboundMessage);
    });
  }

  async ready(): Promise<this> {
    if (this.socket.readyState !== WebSocket.OPEN) {
      await new Promise<void>((open) => this.socket.once('open', () => open()));
    }
    await this.settle();
    return this;
  }

  /** Waits for the greeting (or any pending demotion) to arrive. */
  async settle(): Promise<void> {
    for (let i = 0; i < 20; i += 1) await new Promise((tick) => setImmediate(tick));
  }

  /** The most recent seat this client was told it holds. */
  get seat(): Role | null {
    const hellos = this.seen.filter((m) => m.type === 'hello');
    const last = hellos.at(-1);
    return last && last.type === 'hello' ? last.role : null;
  }

  get rejections(): string[] {
    return this.seen.flatMap((m) => (m.type === 'rejected' ? [m.reason] : []));
  }

  send(intent: unknown): void {
    this.socket.send(JSON.stringify(intent));
  }

  kill(): void {
    this.socket.terminate();
  }

  /**
   * Goes silent without closing: the socket stops reading, so it never sees a
   * ping and never pongs, while TCP stays ESTABLISHED. This is the browser that
   * navigated away, the laptop that slept, the LAN that dropped — and it is the
   * case that actually leaked the GM seat in the shipped build.
   */
  vanish(): void {
    (this.socket as unknown as { _socket: { pause(): void } })._socket.pause();
  }
}

describe('seats', () => {
  it('gives the GM seat to whoever asks first', async () => {
    const rig = await serve();
    const gm = await new Client(rig, 'gm').ready();
    expect(gm.seat).toBe('gm');
  });

  it('hands the GM seat to a later claim and demotes the holder', async () => {
    const rig = await serve();
    const first = await new Client(rig, 'gm').ready();
    expect(first.seat).toBe('gm');

    const second = await new Client(rig, 'gm').ready();
    await first.settle();

    expect(second.seat).toBe('gm');
    // The point of demoting in place: the old console is told, so it can stop
    // presenting controls it no longer has (R-129).
    expect(first.seat).toBe('spectator');
  });

  it('lets the demoted console keep watching rather than dropping it', async () => {
    const rig = await serve();
    const first = await new Client(rig, 'gm').ready();
    await new Client(rig, 'gm').ready();
    await first.settle();

    // A fresh view accompanies the demotion, so the tab is not left showing a
    // GM view it is no longer entitled to.
    const afterDemotion = first.seen.slice(first.seen.findLastIndex((m) => m.type === 'hello'));
    expect(afterDemotion.some((m) => m.type === 'view')).toBe(true);
  });

  it('judges an intent by the seat held now, not the one held on connect', async () => {
    const rig = await serve();
    const first = await new Client(rig, 'gm').ready();
    const second = await new Client(rig, 'gm').ready();
    await first.settle();

    first.send({ kind: 'createCampaign', name: 'From the demoted tab' });
    second.send({ kind: 'createCampaign', name: 'From the seated tab' });
    await first.settle();
    await second.settle();

    expect(first.rejections).toContain('only the GM can do that');
    expect(second.rejections).toEqual([]);
  });

  it('gives the seat back to a GM whose socket closed cleanly', async () => {
    const rig = await serve();
    const first = await new Client(rig, 'gm').ready();
    first.kill();
    await first.settle();

    const again = await new Client(rig, 'gm').ready();
    expect(again.seat).toBe('gm');

    again.send({ kind: 'createCampaign', name: 'Back in the seat' });
    await again.settle();
    expect(again.rejections).toEqual([]);
  });

  it('reaps a socket that went silent without closing', async () => {
    const rig = await serve(20);
    const zombie = await new Client(rig, 'gm').ready();
    expect(zombie.seat).toBe('gm');

    zombie.vanish();
    // Two beats: the first pings and hears nothing back, the second reaps.
    await new Promise((wait) => setTimeout(wait, 120));

    // The seat is free even though no close event ever arrived. Without the
    // heartbeat this socket held it until the host was restarted (R-128).
    const fresh = await new Client(rig, 'gm').ready();
    expect(fresh.seat).toBe('gm');
    fresh.send({ kind: 'createCampaign', name: 'After the reaping' });
    await fresh.settle();
    expect(fresh.rejections).toEqual([]);
  });

  it('does not make the table seat exclusive', async () => {
    const rig = await serve();
    const one = await new Client(rig, 'table').ready();
    const two = await new Client(rig, 'table').ready();

    // A table display and a spectator receive the identical view, so there is
    // nothing for a second screen to take.
    expect(one.seat).toBe('table');
    expect(two.seat).toBe('table');
  });

  it('never grants edit rights to a table or spectator seat', async () => {
    const rig = await serve();
    const table = await new Client(rig, 'table').ready();
    const spectator = await new Client(rig, 'whatever').ready();

    expect(spectator.seat).toBe('spectator');

    table.send({ kind: 'createCampaign', name: 'From the table' });
    spectator.send({ kind: 'createCampaign', name: 'From a spectator' });
    await table.settle();
    await spectator.settle();

    expect(table.rejections).toContain('only the GM can do that');
    expect(spectator.rejections).toContain('only the GM can do that');
  });
});
