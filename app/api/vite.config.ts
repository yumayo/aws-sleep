import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [],
  build: {
    rollupOptions: {
      input: {
        main: 'src/main.ts'
      },
      output: {
        entryFileNames: 'main.js'
      }
    },
    lib: {
      entry: 'src/main.ts',
      formats: ['cjs']
    }
  }
})