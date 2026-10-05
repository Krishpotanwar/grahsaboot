/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true },
  test: {
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts', 'tests/db/**/*.test.ts', 'worker/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
  },
})
