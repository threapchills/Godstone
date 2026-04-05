import { defineConfig } from 'vite'

export default defineConfig({
  // GitHub Pages serves from /Godstone/ — this must match the repo name exactly.
  base: '/Godstone/',
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Phaser is large; a single chunk is fine for now.
    // Revisit if load time becomes a concern in Phase 3+.
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
})
