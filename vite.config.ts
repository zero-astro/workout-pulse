import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['better-sqlite3']
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    input: './src/main/preload.ts',
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: 'src/renderer',
    server: {
      port: 5173,
      strictPort: true // Portua okupatuta badago errore eman, ez aldatu 5174-ra
    },
    plugins: [react()]
  }
})
