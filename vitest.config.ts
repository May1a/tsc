import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['test/integration/**/*.test.ts'],
    pool: 'forks',
    // Keep compiler and TypeScript declaration caches warm across files in each worker.
    isolate: false,
    fileParallelism: true,
    maxWorkers: 4,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['test/**', 'dist/**'],
    },
  },
});
