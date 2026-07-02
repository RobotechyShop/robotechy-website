import path from 'node:path';
import { readFileSync } from 'node:fs';

import react from '@vitejs/plugin-react-swc';
import { defineConfig, configDefaults } from 'vitest/config';

// The site version shown in the footer. Single source of truth is package.json's
// `version` field — the release process bumps it and tags the same commit
// `v<version>` (see docs/DEPLOYMENT.adoc), so what the footer shows always
// matches the deployed tag.
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: '::',
    port: 8080,
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react()],
  optimizeDeps: {
    include: ['style-to-js'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    // The order-service has its own node:test suite (run via `node --test` in
    // order-service/) that Vitest can't run; exclude that subtree while leaving
    // Vitest's default test discovery intact.
    exclude: [...configDefaults.exclude, 'order-service/**'],
    setupFiles: './src/test/setup.ts',
    onConsoleLog(log) {
      return !log.includes('React Router Future Flag Warning');
    },
    env: {
      DEBUG_PRINT_LIMIT: '0', // Suppress DOM output that exceeds AI context windows
    },
    coverage: {
      provider: 'v8',
      // json-summary feeds the CI coverage gate (total.lines.pct); text prints a
      // human-readable table to the log. See .github/workflows/coverage.yml.
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/test/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
}));
