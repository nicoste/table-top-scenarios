// Composition root (R-66). Auto-connects to whatever host served this page (D-086).

import { createRoot } from 'react-dom/client';
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { connect, recordTraffic } from '@tt/client-core';
import type { Connection } from '@tt/client-core';
import type { Intent, TableView, View } from '@tt/protocol';
import { App } from './shell/App.js';

function Root() {
  const [view, setView] = useState<View | null>(null);
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [rejection, setRejection] = useState<string | null>(null);
  const connection = useRef<Connection | null>(null);

  useEffect(() => {
    const conn = connect('table', {
      onView: setView,
      onRole: () => undefined,
      onStatus: setStatus,
      // Diagnostic only, and read by the cost overlay (R-166).
      onTraffic: recordTraffic,
      // The table can be refused now that it can ask for something — moving the
      // party into ground the party has not seen (R-131). Never silently (R-18).
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

  const tableView = view?.role === 'table' ? (view as TableView) : null;
  return <App view={tableView} status={status} rejection={rejection} dispatch={dispatch} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><Root /></StrictMode>,
);
