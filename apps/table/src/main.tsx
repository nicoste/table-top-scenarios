// Composition root (R-66). Auto-connects to whatever host served this page (D-086).

import { createRoot } from 'react-dom/client';
import { StrictMode, useEffect, useState } from 'react';
import { connect } from '@tt/client-core';
import type { TableView, View } from '@tt/protocol';
import { App } from './shell/App.js';

function Root() {
  const [view, setView] = useState<View | null>(null);
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');

  useEffect(() => {
    const conn = connect('table', {
      onView: setView,
      onRole: () => undefined,
      onStatus: setStatus,
      onRejected: () => undefined,
    });
    return () => conn.close();
  }, []);

  const tableView = view?.role === 'table' ? (view as TableView) : null;
  return <App view={tableView} status={status} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><Root /></StrictMode>,
);
