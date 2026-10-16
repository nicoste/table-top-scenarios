// The only module that opens a socket (R-65). Features dispatch intents; they
// never touch the network.

import type { Intent, OutboundMessage, Role, View } from '@tt/protocol';
import { IMAGE_PATH } from '@tt/protocol';
import type { ImageId } from '@tt/domain';
import { isImageId } from '@tt/domain';
import { keepUnchanged } from '../store/index.js';

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
  /**
   * The last view handed on, so the next one can keep whatever did not change
   * (R-19a). Kept across reconnects: a map that comes back the same after a
   * dropped socket is still the map on screen.
   */
  let last: View | null = null;

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
      else if (message.type === 'view') {
        last = keepUnchanged(last, message.view);
        handlers.onView(last);
      }
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

/**
 * Stores a picture on the host and answers its name (R-204).
 *
 * Over HTTP rather than the socket, because a picture is bytes and the socket
 * carries JSON. It changes nothing on any screen by itself: the intent that
 * names it — `editMember` with an `image` — is what puts it on a card, and
 * that still goes the one way every change goes (R-3).
 */
export async function uploadPicture(picture: Blob): Promise<ImageId> {
  const response = await fetch(IMAGE_PATH, {
    method: 'POST',
    headers: { 'Content-Type': picture.type || 'image/webp' },
    body: picture,
  });
  if (!response.ok) throw new Error(`the host refused the picture (${response.status})`);
  const { id } = await response.json() as { id: unknown };
  if (!isImageId(id)) throw new Error('the host answered with something that is not a picture');
  return id;
}

