import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    // MapLibre is intentionally lazy-loaded as the map page's primary engine.
    chunkSizeWarningLimit: 1000,
  },
})
