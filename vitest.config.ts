import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@tt/client-core': fileURLToPath(new URL('packages/client-core/src/index.ts', import.meta.url)),
      '@tt/domain': fileURLToPath(new URL('packages/domain/src/index.ts', import.meta.url)),
      '@tt/geometry': fileURLToPath(new URL('packages/geometry/src/index.ts', import.meta.url)),
      '@tt/gm': fileURLToPath(new URL('apps/gm/src/index.ts', import.meta.url)),
      '@tt/host': fileURLToPath(new URL('apps/host/src/index.ts', import.meta.url)),
      '@tt/persistence': fileURLToPath(new URL('packages/persistence/src/index.ts', import.meta.url)),
      '@tt/protocol': fileURLToPath(new URL('packages/protocol/src/index.ts', import.meta.url)),
      '@tt/render': fileURLToPath(new URL('packages/render/src/index.ts', import.meta.url)),
      '@tt/sim': fileURLToPath(new URL('packages/sim/src/index.ts', import.meta.url)),
      '@tt/table': fileURLToPath(new URL('apps/table/src/index.ts', import.meta.url)),
      '@tt/ui': fileURLToPath(new URL('packages/ui/src/index.ts', import.meta.url)),
    },
  },
  test: {
    // R-22: the pure packages are the ones that must be tested. The host is
    // included too — its seat arbitration is a rule, and it is testable against
    // a real socket with no mocks (R-23a).
    include: ['packages/*/test/**/*.test.ts', 'apps/host/test/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    passWithNoTests: true,
  },
});
