import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// The Vue composable (vue/useMailInterfaceEditor.ts) imports logic from the
// package name 'email-poster/pure' so the shipped source resolves correctly for
// consumers. In-repo, alias those self-imports to source so the composable
// tests resolve without a prior build. `$` = exact match, which also keeps the
// broader 'email-poster' alias from shadowing 'email-poster/pure'.
const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  resolve: {
    // Array form, first-match-wins: the more specific `email-poster/pure`
    // must come before `email-poster` so the latter can't shadow it.
    alias: [
      { find: 'email-poster/pure', replacement: here('./src/pure.ts') },
      { find: 'email-poster', replacement: here('./src/index.ts') },
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
    },
  },
})
