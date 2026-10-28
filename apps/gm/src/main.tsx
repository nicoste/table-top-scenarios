// Composition root (R-66): the only place things are wired together.

import { createRoot } from 'react-dom/client';
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { connect, recordTraffic } from '@tt/client-core';
import type { Connection } from '@tt/client-core';
import type { GmView, Intent, View } from '@tt/protocol';
import { App } from './shell/App.js';

function Root() {
  const [view, setView] = useState<View | null>(null);
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [rejection, setRejection] = useState<string | null>(null);
  const connection = useRef<Connection | null>(null);

  useEffect(() => {
    const conn = connect('gm', {
      onView: setView,
      onRole: () => undefined,
      onStatus: setStatus,
      // Diagnostic only, and read by the cost overlay (R-166).
      onTraffic: recordTraffic,
      onRejected: (reason) => {
        setRejection(reason);
        setTimeout(() => setRejection(null), 2600);
      },
    });
    connection.current = conn;
    return () => conn.close();
  }, []);

  const dispatch = useMemo(
    () => (intent: Intent) => connection.current?.dispatch(intent),
    [],
  );

  const gmView = view?.role === 'gm' ? (view as GmView) : null;
  // A view arrived, but not a GM one: another console claimed the seat (R-127).
  // The difference from "no view yet" matters — see R-129.
  const seat = view === null ? 'unknown' : view.role === 'gm' ? 'gm' : 'viewer';
  return <App view={gmView} status={status} seat={seat} rejection={rejection} dispatch={dispatch} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><Root /></StrictMode>,
);
