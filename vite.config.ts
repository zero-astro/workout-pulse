import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: './src/main/index.ts',
        formats: ['cjs']
      },
      rollupOptions: {
        external: ['electron']
      }
    },
    plugins: []
  },
  preload: {
    build: {
      lib: {
        entry: './src/main/preload.ts',
        formats: ['cjs']
      },
      rollupOptions: {
        external: ['electron']
      }
    },
    plugins: []
  },
  renderer: {
    build: {
      outDir: 'dist/renderer'
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': '/src/renderer'
      }
    }
  }
})
