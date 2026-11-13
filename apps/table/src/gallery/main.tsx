// The table's gallery page (D-394): mounts `TableGallery`, which lives in its
// own module so a test can draw it without a browser.

import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { browserIsEnough } from '@tt/client-core';
import { TableGallery } from './gallery.js';

if (browserIsEnough((condition) => CSS.supports(condition))) {
  createRoot(document.getElementById('root')!).render(<StrictMode><TableGallery /></StrictMode>);
}
