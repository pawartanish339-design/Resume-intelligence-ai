import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/security/**/*.test.ts',
    ],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporters: 'default',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      // The marker package throws unless the bundler resolves the `react-server`
      // condition. Vitest does not, and these suites intentionally exercise
      // server-only modules, so the marker is aliased to a no-op stub.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
});
