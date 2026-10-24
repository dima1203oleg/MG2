import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const buildMetadata = {
  sha: 'a000b3cc07a9',
  branch: 'codex/guidance-progress-pr19-20261023',
  dirty: false,
  builtAt: new Date().toISOString(),
};

export default defineConfig(() => {
  return {
    define: { __MARSHGO_BUILD_METADATA__: JSON.stringify(buildMetadata) },
    base: process.env.CAPACITOR_BUILD === 'true' ? './' : '/',
    build: { chunkSizeWarningLimit: 1200 },
    optimizeDeps: {
      entries: ['index.html'],
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      allowedHosts: true as const,
    },
  };
});
