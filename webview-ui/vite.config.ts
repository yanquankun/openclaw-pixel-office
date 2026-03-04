import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../dist/webview',
    emptyOutDir: true,
  },
  base: './',
  server: {
    proxy: {
      '/ws': {
        target: 'ws://localhost:3210',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:3210',
      },
    },
  },
})
