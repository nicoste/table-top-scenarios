import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: '/table/',
  plugins: [react()],
  resolve: {
    alias: {
      '@tt/domain': fileURLToPath(new URL('../../packages/domain/src/index.ts', import.meta.url)),
      '@tt/protocol': fileURLToPath(new URL('../../packages/protocol/src/index.ts', import.meta.url)),
      '@tt/geometry': fileURLToPath(new URL('../../packages/geometry/src/index.ts', import.meta.url)),
      '@tt/render': fileURLToPath(new URL('../../packages/render/src/index.ts', import.meta.url)),
      '@tt/ui': fileURLToPath(new URL('../../packages/ui/src/index.ts', import.meta.url)),
      '@tt/client-core': fileURLToPath(new URL('../../packages/client-core/src/index.ts', import.meta.url)),
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
