import { defineConfig, type Plugin } from 'vite'
// @ts-expect-error plain JavaScript module, shared with the standalone relay
import { attachRelay } from './server/coop-relay.mjs'

/** Co-op: in dev and preview the relay rides on the Vite server itself, at /coop. */
const coopRelay: Plugin = {
  name: 'glow-salon-coop-relay',
  configureServer(server) { if (server.httpServer) attachRelay(server.httpServer) },
  configurePreviewServer(server) { if (server.httpServer) attachRelay(server.httpServer) },
}

/**
 * `vite build --mode pages` builds for GitHub Pages at /glow-salon/. The base lives here, not on the
 * command line, because Git Bash rewrites a `--base /x/` argument into a Windows path.
 */
export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/glow-salon/' : '/',
  plugins: [coopRelay],
  // A full reload would drop a co-op session in every tab; pick up edits on a manual refresh.
  server: { hmr: false, allowedHosts: ['.trycloudflare.com'] },
  preview: { allowedHosts: ['.trycloudflare.com'] },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
}))
