import { fileURLToPath } from 'node:url'
import { coverageConfigDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  define: {
    __STYLEGUIDE__: 'false',
    __VIEWER_TEMPLATE__: JSON.stringify('')
  },
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL('./test/obsidian-stub.ts', import.meta.url))
    }
  },
  test: {
    include: ['src/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    coverage: {
      include: ['src/**/*.ts', 'packages/*/src/**/*.ts'],
      exclude: [
        'src/main.ts',
        'src/migration.ts',
        'src/views/**',
        'src/modals/**',
        'src/ui/**',
        'src/components/**',
        'src/settings.ts',
        ...coverageConfigDefaults.exclude
      ],
      provider: 'v8',
      thresholds: {
        branches: 0,
        functions: 0,
        lines: 0,
        statements: 0
      }
    },
    testTimeout: 30000
  }
})
