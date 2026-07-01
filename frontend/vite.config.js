import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  // Public base path. Set VITE_BASE_PATH=/paperlock/ at build time to serve the
  // app under https://lpl-exp.ucsd.edu/paperlock/. Defaults to "/" for local dev.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Proxy API calls to the backend so the frontend can use a relative
    // "/api" base in dev — same as production behind nginx (no CORS needed).
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_TARGET || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
