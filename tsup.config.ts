import { defineConfig } from 'tsup'

export default defineConfig([
  {
    // Library: consumed by importers, ship dual ESM + CJS + types.
    entry: {
      index: 'src/index.ts',
      // Browser-safe, node-free subset (interface I/O, payload building, presets).
      // Importing `EmailPoster`/transport from the root pulls node:net/crypto/fs;
      // this entry excludes them so it bundles for the client without polyfills.
      pure: 'src/pure.ts',
      template: 'src/template/index.ts',
      'adapters/nuxt': 'adapters/nuxt.ts',
      'adapters/nestjs': 'adapters/nestjs.ts',
      'adapters/hono': 'adapters/hono.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'node18',
    platform: 'node',
    // The adapters bundle the core (../src); zod stays external.
    external: ['zod'],
  },
  {
    // CLI: a `bin` run under "type": "module", so ESM only. Building it CJS
    // would emit "import.meta is not available with the cjs output format"
    // warnings (cli uses import.meta.url for the auto-run guard and for
    // resolving the shipped skill path) and produce an unused, broken cli.cjs.
    entry: { cli: 'cli/cli.ts' },
    format: ['esm'],
    sourcemap: true,
    target: 'node18',
    platform: 'node',
    external: ['zod'],
  },
])
