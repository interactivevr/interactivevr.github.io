import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  cacheDir: '.vite-cache',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  optimizeDeps: {
    holdUntilCrawlEnd: true,
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'three',
      '@react-three/fiber',
      '@react-three/xr',
      'trystero',
      'zustand',
      'qrcode.react',
    ],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
