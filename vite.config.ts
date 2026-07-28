import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  // GitHub Pages publishes this project below the repository path.
  base: mode === 'github-pages' ? '/node-canvas-prototype/' : '/',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 4173,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/testSetup.ts',
  },
}))
