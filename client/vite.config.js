import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy used in standalone `npm run dev` mode only — routes /api/* requests
    // to the Express server running on localhost:3001.
    // When using `vercel dev`, Vercel Services rewrites handle /api/* → server
    // service at the edge, so this proxy is bypassed automatically.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom']
        }
      }
    }
  }
});
