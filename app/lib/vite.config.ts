import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index'
    },
    rollupOptions: {
      external: (id) => {
        return !id.startsWith('.') && !id.startsWith('/') && !id.includes('src/')
      }
    },
    outDir: 'dist'
  }
})