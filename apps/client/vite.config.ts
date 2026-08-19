import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendUrl = `http://localhost:${process.env.BACKEND_PORT ?? '8080'}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': backendUrl,
      '/mcp': backendUrl,
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
