import tailwindcss from '@tailwindcss/vite';

import { defineConfig } from 'vite';
import path from 'path';

import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@assets': path.resolve(__dirname, './src/assets'),
      '@api': path.resolve(__dirname, './src/api'),
      '@utils': path.resolve(__dirname, './src/utils'),
    },
  },
  server: {
    // Dev only: the Linkr server (npm run dev in /server) handles the API.
    proxy: {
      '/api': 'http://127.0.0.1:' + (process.env.BACKEND_PORT || '8080'),
      '/content': 'http://127.0.0.1:' + (process.env.BACKEND_PORT || '8080'),
    },
  },
});
