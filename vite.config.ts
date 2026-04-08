import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: []
  },
  preload: {
    plugins: []
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@': '/src/renderer'
      }
    }
  }
})
