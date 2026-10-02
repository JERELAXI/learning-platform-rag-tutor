import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Dev requests stay same-origin, so the browser sends no preflight at all.
      // The backend's CORS_ORIGINS covers the case where the SPA is served
      // from its own host instead.
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // No globals: every test imports what it uses, which keeps types honest.
    globals: false,
    restoreMocks: true,
  },
})
