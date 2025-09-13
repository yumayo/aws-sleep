import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [],

  // デフォルトだとprocess.envは見れないため修正。
  define: {
    'process.env': 'process.env'
  },
  build: {
    target: 'node22',
    rollupOptions: {
      input: {
        main: 'src/main.ts'
      },
      output: {
        entryFileNames: 'main.js',
        format: 'es'
      },
      external: (id) => {
        return !id.startsWith('.') && !id.startsWith('/') && !id.includes('src/');
      }
    }
  }
})