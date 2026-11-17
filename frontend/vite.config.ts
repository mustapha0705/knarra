import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The render backend (backend/src/server.js) listens on 3001.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
