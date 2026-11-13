// The design gallery's page (D-387): mounts `Gallery`, which lives in its own
// module so a test can draw it without a browser (D-394).

import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { browserIsEnough } from '@tt/client-core';
import { Gallery } from './gallery.js';

// The page scrolls, unlike the screens.
document.body.style.overflow = 'auto';
if (browserIsEnough((condition) => CSS.supports(condition))) {
  createRoot(document.getElementById('root')!).render(<StrictMode><Gallery /></StrictMode>);
}
