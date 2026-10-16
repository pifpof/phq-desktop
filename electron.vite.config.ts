import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = resolve(__dirname, 'src/shared')

// The strict CSP lives in index.html. Vite's dev server needs inline scripts and a websocket for HMR,
// so the policy is relaxed in dev only. Packaged builds keep the strict one.
const devCsp = {
  name: 'phq-dev-csp',
  apply: 'serve' as const,
  transformIndexHtml: (html: string) =>
    html.replace(
      /(http-equiv="Content-Security-Policy"\s+content=")[^"]*"/,
      `$1default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self' ws://localhost:* http://localhost:*"`
    )
}

export default defineConfig({
  main: { resolve: { alias: { '@shared': shared } } },
  // A sandboxed preload can only require('electron'), so everything else is bundled in.
  preload: {
    resolve: { alias: { '@shared': shared } },
    build: { externalizeDeps: false }
  },
  renderer: {
    resolve: { alias: { '@': resolve(__dirname, 'src/renderer/src'), '@shared': shared } },
    plugins: [react(), tailwindcss(), devCsp]
  }
})
