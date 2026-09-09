// WebSocket transport and role seats. Knows nothing about rules.

import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import type { Server } from 'node:http';
import type { Role } from '@tt/protocol';
import { parseIntent } from '@tt/protocol';
import type { Session } from '../session/index.js';

export interface Transport { close(): void }

/**
 * One GM seat, one table seat, everyone else a spectator. Seats are exclusive so
 * two GMs cannot fight over the same campaign.
 */
export function serveSockets(server: Server, session: Session): Transport {
  const wss = new WebSocketServer({ server });
  const seats = new Map<WebSocket, Role>();

  const taken = (role: Role) => [...seats.values()].includes(role);

  const send = (ws: WebSocket, message: unknown) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  };

  const broadcast = () => {
    for (const [ws, role] of seats) send(ws, { type: 'view', view: session.view(role) });
  };

  wss.on('connection', (ws, request) => {
    const wanted = new URL(request.url ?? '/', 'http://localhost').searchParams.get('role');
    const role: Role = wanted === 'gm' && !taken('gm') ? 'gm'
      : wanted === 'table' && !taken('table') ? 'table'
      : 'spectator';

    seats.set(ws, role);
    send(ws, { type: 'hello', role });
    send(ws, { type: 'view', view: session.view(role) });

    ws.on('message', (raw) => {
      let payload: unknown;
      try { payload = JSON.parse(String(raw)); } catch { return; }
      const parsed = parseIntent(payload);
      if (!parsed.ok) {
        send(ws, { type: 'rejected', reason: parsed.reason });
        return;
      }
      const result = session.handle(role, parsed.intent);
      if (!result.ok) {
        send(ws, { type: 'rejected', reason: result.reason ?? 'rejected' });
        return;
      }
      broadcast();
    });

    ws.on('close', () => { seats.delete(ws); });
  });

  return { close: () => wss.close() };
}
