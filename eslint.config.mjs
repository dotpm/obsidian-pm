import tsparser from '@typescript-eslint/parser'
import { defineConfig } from 'eslint/config'
import obsidianmd from 'eslint-plugin-obsidianmd'

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    ignores: [
      '**/*.test.ts',
      'packages/*/test/**',
      'packages/*/dist/**',
      'packages/ui/src/dom-shim.ts',
      'packages/ui/src/dom-platform.ts',
      'packages/viewer/**'
    ]
  },
  {
    files: ['src/**/*.ts', 'packages/*/src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: './tsconfig.json' },
      globals: { __STYLEGUIDE__: 'readonly', __VIEWER_TEMPLATE__: 'readonly' }
    }
  },
  {
    files: ['src/views/table/**/*.ts'],
    rules: {
      'obsidianmd/no-static-styles-assignment': 'off'
    }
  },
  {
    files: ['src/**/*.ts', 'packages/*/src/**/*.ts'],
    rules: {
      'obsidianmd/ui/sentence-case': ['error', { ignoreWords: ['TaskNotes'] }]
    }
  }
])
