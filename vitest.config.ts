import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

const alias = { '@': path.resolve(__dirname, './src') }
const setup = ['./src/tests/setup.ts']

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    globals: true,
    projects: [
      {
        // Node environment: server actions, pure helpers
        test: {
          name: 'node',
          globals: true,
          environment: 'node',
          include: ['src/tests/unit/**/*.test.ts'],
          setupFiles: setup,
        },
        resolve: { alias },
      },
      {
        // Browser-like environment: React components
        plugins: [react()],
        test: {
          name: 'jsdom',
          globals: true,
          environment: 'jsdom',
          include: ['src/tests/unit/**/*.test.tsx'],
          setupFiles: setup,
        },
        resolve: { alias },
      },
      {
        // Integration: real local Supabase (no global mock setup)
        test: {
          name: 'rls',
          globals: true,
          environment: 'node',
          include: ['src/tests/rls/**/*.test.ts'],
          testTimeout: 20_000,
          hookTimeout: 20_000,
        },
        resolve: { alias },
      },
    ],
  },
})
