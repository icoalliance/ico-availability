import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        manualChunks: {
          'data-mat':    ['./src/matMap.js'],
          'data-coords': ['./src/coordsMap.js'],
          'data-dealer': ['./src/dealerMap.js'],
          'data-logo':   ['./src/kbbLogo.js'],
          'data-market': ['./src/marketData.js'],
          'data-offers': ['./src/offerMap.js'],
          'vendor':      ['react', 'react-dom', 'xlsx'],
        }
      }
    }
  }
})
