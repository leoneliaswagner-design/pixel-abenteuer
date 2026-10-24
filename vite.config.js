import { defineConfig } from 'vite';

// Der Client liegt in client/, Grafiken und Karten in inhalte/. inhalte/ ist
// publicDir, damit Tiled die Pfade in der Karte (../grafik/…) genauso
// auflöst wie der Browser (/grafik/…).
export default defineConfig({
  root: 'client',
  // Relative Pfade: die Vorschau-Seite liegt nicht an der Wurzel ihres
  // Servers. Mit /assets/… fand sie ihr Skript nicht, und „Losspielen" tat
  // nichts. Der eigene Server kommt mit ./ genauso zurecht.
  base: './',
  publicDir: '../inhalte',
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    host: true,
    proxy: { '/ws': { target: 'ws://localhost:3001', ws: true } },
  },
});
