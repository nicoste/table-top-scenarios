// WebSocket transport and role seats. Knows nothing about rules.

import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import type { Server } from 'node:http';
import type { Role } from '@tt/protocol';
import { parseIntent } from '@tt/protocol';
import type { Session } from '../session/index.js';

export interface Transport { close(): void }

export interface SeatOptions {
  /** How often a socket is asked to prove it is still there. */
  readonly heartbeatMs?: number;
}

const HEARTBEAT_MS = 15_000;

/**
 * Seats.
 *
 * **One GM seat, and the newest claim wins it** (R-127). Any earlier holder is
 * demoted to a viewer in place — not disconnected — and told so.
 *
 * The seat used to be defended against every later claim, which sounds right and
 * is exactly backwards for this tool. There is one GM in the room (R-39); the
 * claimant is not a rival, it is the same person's browser after a reload. A
 * defended seat means the GM reloads their console and silently becomes a
 * spectator, with every action rejected, until the host is restarted.
 *
 * `table` is not exclusive at all. A table display and a spectator receive the
 * identical view, so there is nothing for a second screen to take.
 */
export function serveSockets(
  server: Server,
  session: Session,
  { heartbeatMs = HEARTBEAT_MS }: SeatOptions = {},
): Transport {
  const wss = new WebSocketServer({ server });
  const seats = new Map<WebSocket, Role>();
  const alive = new Set<WebSocket>();

  const send = (ws: WebSocket, message: unknown) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  };

  /** Tells one socket what it is and what it may see. Used on join and on demotion. */
  const greet = (ws: WebSocket, role: Role) => {
    send(ws, { type: 'hello', role });
    send(ws, { type: 'view', view: session.view(role) });
  };

  const broadcast = () => {
    for (const [ws, role] of seats) send(ws, { type: 'view', view: session.view(role) });
  };

  /**
   * A socket claiming the GM seat gets it. Whoever held it becomes a spectator
   * and is greeted again so its console can stop presenting GM controls (R-129).
   */
  const claim = (ws: WebSocket, wanted: string | null): Role => {
    if (wanted === 'gm') {
      for (const [other, role] of seats) {
        if (other !== ws && role === 'gm') {
          seats.set(other, 'spectator');
          greet(other, 'spectator');
        }
      }
      return 'gm';
    }
    return wanted === 'table' ? 'table' : 'spectator';
  };

  /**
   * Without this, a socket the client abandoned stays ESTABLISHED and keeps its
   * seat forever: a browser that navigates away, a laptop that sleeps, a LAN
   * that drops. TCP alone never notices, so the GM seat leaks to a socket with
   * nobody behind it (R-128).
   */
  const heartbeat = setInterval(() => {
    for (const ws of [...seats.keys()]) {
      if (!alive.has(ws)) {
        seats.delete(ws);
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, heartbeatMs);
  heartbeat.unref?.();

  wss.on('connection', (ws, request) => {
    const wanted = new URL(request.url ?? '/', 'http://localhost').searchParams.get('role');
    const role = claim(ws, wanted);

    seats.set(ws, role);
    alive.add(ws);
    greet(ws, role);

    ws.on('pong', () => { alive.add(ws); });

    ws.on('message', (raw) => {
      // Read the seat from the map, never from a variable captured on connect: a
      // demoted socket must be judged by the seat it holds now.
      const seat = seats.get(ws);
      if (!seat) return;

      let payload: unknown;
      try { payload = JSON.parse(String(raw)); } catch { return; }
      const parsed = parseIntent(payload);
      if (!parsed.ok) {
        send(ws, { type: 'rejected', reason: parsed.reason });
        return;
      }
      // Anything that throws past the session is a bug, and one bad intent
      // must not end the evening for everyone at the table. `sim` is pure, so
      // a throw from it has changed nothing.
      try {
        const result = session.handle(seat, parsed.intent);
        if (!result.ok) {
          send(ws, { type: 'rejected', reason: result.reason ?? 'rejected' });
          return;
        }
        broadcast();
        // It happened, so everyone sees it; the sender also hears that it is
        // not on disk yet.
        if (result.unsaved) send(ws, { type: 'rejected', reason: result.unsaved });
      } catch (error) {
        console.error(`  ${parsed.intent.kind} failed:`, error);
        send(ws, { type: 'rejected', reason: 'the host hit an error; see its console' });
      }
    });

    // A malformed frame is an 'error' on the socket, and an 'error' nobody
    // listens for is thrown — by any device on the LAN. `ws` closes the socket
    // after it; the seat goes with the close.
    ws.on('error', (error) => { console.warn(`  A socket failed: ${error.message}`); });
    ws.on('close', () => { seats.delete(ws); alive.delete(ws); });
  });

  return {
    close: () => {
      clearInterval(heartbeat);
      wss.close();
    },
  };
}
