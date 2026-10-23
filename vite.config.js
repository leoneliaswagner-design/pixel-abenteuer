import { defineConfig } from 'vite';

// Der Client liegt in client/, Grafiken und Karten in inhalte/. inhalte/ ist
// publicDir, damit Tiled die Pfade in der Karte (../grafik/…) genauso
// auflöst wie der Browser (/grafik/…).
export default defineConfig({
  root: 'client',
  publicDir: '../inhalte',
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    host: true,
    proxy: { '/ws': { target: 'ws://localhost:3001', ws: true } },
  },
});
