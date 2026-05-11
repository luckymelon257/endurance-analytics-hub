import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const VITE_PORT = 5173

export default defineConfig({
  plugins: [react()],

  // Tell Vite our source root so module URLs in dev are stable.
  root: __dirname,

  // Nest's `useStaticAssets(public)` already serves the public folder; we
  // don't want Vite to also copy public/* into the build output.
  publicDir: false,

  build: {
    manifest: true,
    outDir: resolve(__dirname, 'public/dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/client/main.ts'),
    },
  },

  server: {
    port: VITE_PORT,
    strictPort: true,
    // Public origin used when generating asset URLs in dev (Nest serves HTML
    // from :3000 and references scripts hosted on the Vite dev server).
    origin: `http://localhost:${VITE_PORT}`,
    cors: true,
  },
})
