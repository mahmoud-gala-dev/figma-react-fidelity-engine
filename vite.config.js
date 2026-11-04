import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { attachLocalApi } from './src/integrations/figma/local-api.mjs';

function localApiPlugin() {
  return {
    name: 'figma-fidelity-local-api',
    configureServer(server) {
      attachLocalApi(server.middlewares, { cwd: process.cwd() });
    }
  };
}

export default defineConfig({
  plugins: [react(), localApiPlugin()],
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
    watch: {
      ignored: [
        '**/*.zip',
        '**/*.fig',
        '**/*.tmp',
        '**/out/**',
        '**/.git/**',
        '**/.browser-profile/**',
        '**/.browser-profile-figma-reader/**',
        '**/storybook-static/**',
        '**/dist/**',
        '**/input/.connector/**',
        '**/input/.figma-reader-cache/**',
        '**/input/.figma-snapshots/**',
        '**/input/sync-history/**',
        '**/input/figma-exports/**',
        '**/input/downloads/**',
        '**/downloads/**'
      ]
    }
  }
});
