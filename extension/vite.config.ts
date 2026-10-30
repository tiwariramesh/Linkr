import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Builds the unpacked extension into dist/: the popup page, and the background service worker at a
// fixed name (manifest.json points at it). public/ (manifest, icons) is copied as is.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, '../web/src') },
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome116',
    // Extension pages may not run inline scripts.
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: path.resolve(import.meta.dirname, 'popup.html'),
        background: path.resolve(import.meta.dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
});
