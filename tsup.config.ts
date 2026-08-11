import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    template: 'src/template/index.ts',
    'adapters/nuxt': 'adapters/nuxt.ts',
    'adapters/nestjs': 'adapters/nestjs.ts',
    'adapters/hono': 'adapters/hono.ts',
    cli: 'cli/cli.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node18',
  platform: 'node',
  // The adapters/cli import the core (../src) which tsup bundles; zod stays external.
  external: ['zod'],
})
