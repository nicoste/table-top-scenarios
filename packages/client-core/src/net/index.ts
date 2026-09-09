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

    ws.onopen = () => handlers.onStatus('open');
    ws.onmessage = (event) => {
      let message: OutboundMessage;
      try { message = JSON.parse(String(event.data)) as OutboundMessage; } catch { return; }
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
