// Build-only ambient declaration for Nuxt's virtual `#imports` module, so the
// Nuxt adapter type-checks without Nuxt installed. Consumers resolve the real
// module (this file does not ship in dist/).
declare module '#imports' {
  export function useRuntimeConfig(): Record<string, unknown>
}
