// The only module that opens a socket (R-65). Features dispatch intents; they
// never touch the network.

import type { Intent, OutboundMessage, Role, View } from '@tt/protocol';

export interface Connection {
  dispatch(intent: Intent): void;
  close(): void;
}

export interface Handlers {
  onView(view: View): void;
  onRole(role: Role): void;
  onRejected(reason: string): void;
  onStatus(status: 'connecting' | 'open' | 'closed'): void;
  /**
   * How large each arriving message was, for the cost overlay (R-166).
   *
   * Optional, because it is a diagnostic and nothing else should have to care.
   * Counted in characters rather than bytes: the payload is ASCII JSON but for
   * the odd name, so the two differ by well under a percent and measuring
   * properly would mean encoding every message twice.
   */
  onTraffic?(chars: number): void;
}

/**
 * Connects to whatever host served this page (R-94, D-086). There is no address
 * to ask for: reaching this page already required knowing it.
 */
export function connect(role: 'gm' | 'table', handlers: Handlers): Connection {
  let socket: WebSocket | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | null = null;

  const url = () => {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${scheme}://${location.host}/?role=${role}`;
  };

  function open(): void {
    if (closed) return;
    handlers.onStatus('connecting');
    const ws = new WebSocket(url());
    socket = ws;

    ws.onopen = () => {
      // Abandoned before the handshake finished. Calling `close()` while the
      // socket was still CONNECTING is not dependable: if the upgrade already
      // completed on the host, the socket opens anyway, claims a seat, and then
      // answers pings forever — alive enough that the heartbeat never reaps it
      // (R-130). A guard, not a fix for anything observed.
      if (closed) { ws.close(); return; }
      handlers.onStatus('open');
    };
    ws.onmessage = (event) => {
      const raw = String(event.data);
      handlers.onTraffic?.(raw.length);
      let message: OutboundMessage;
      try { message = JSON.parse(raw) as OutboundMessage; } catch { return; }
      if (message.type === 'hello') handlers.onRole(message.role);
      else if (message.type === 'view') handlers.onView(message.view);
      else if (message.type === 'rejected') handlers.onRejected(message.reason);
    };
    ws.onclose = () => {
      handlers.onStatus('closed');
      if (!closed) retry = setTimeout(open, 1200);
    };
    ws.onerror = () => ws.close();
  }

  open();

  return {
    dispatch(intent) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(intent));
    },
    close() {
      closed = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    },
  };
}
