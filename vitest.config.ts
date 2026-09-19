import { defineConfig } from 'vitest/config'

// The tests exercise pure functions only: no browser, no plugins, no database.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
})
