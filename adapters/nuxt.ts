/**
 * email-poster/adapters/nuxt — read `runtimeConfig.emailPoster` inside Nuxt.
 * @license Apache-2.0
 *
 * No top-level Nuxt import, so this module is safe to bundle/import outside a
 * Nuxt app. {@link useEmailPoster} resolves `#imports` lazily at call time.
 */
import { EmailPoster } from '../src/poster'
import type { EmailPosterConfigInput } from '../src/config'

const CACHE = new Map<string, EmailPoster>()

/** Identity helper for typing a `runtimeConfig.emailPoster` default in nuxt.config. */
export function defineEmailPosterConfig(config: EmailPosterConfigInput): EmailPosterConfigInput {
  return config
}

/** Lazily read Nuxt's runtime config; throws if called outside a Nuxt app. */
async function getNuxtRuntimeConfig(): Promise<Record<string, unknown>> {
  try {
    const mod = (await import('#imports')) as {
      useRuntimeConfig?: () => Record<string, unknown>
    }
    if (!mod.useRuntimeConfig) {
      throw new Error('useRuntimeConfig not found — not running inside Nuxt')
    }
    return mod.useRuntimeConfig()
  } catch (e) {
    throw new Error(
      `useEmailPoster() must be called inside a Nuxt app (${e instanceof Error ? e.message : String(e)})`,
    )
  }
}

/**
 * Build (and cache by `postUrl`) an {@link EmailPoster} from
 * `runtimeConfig.emailPoster`. Pass an explicit `runtimeConfig` to use it outside
 * Nuxt (handy for tests).
 */
export async function useEmailPoster(
  runtimeConfig?: Record<string, unknown>,
): Promise<EmailPoster> {
  const rc = runtimeConfig ?? (await getNuxtRuntimeConfig())
  const cfg = (rc.emailPoster ?? {}) as Partial<EmailPosterConfigInput>
  if (!cfg.postUrl) {
    throw new Error('runtimeConfig.emailPoster.postUrl is required')
  }
  let poster = CACHE.get(cfg.postUrl)
  if (!poster) {
    poster = new EmailPoster(cfg)
    CACHE.set(cfg.postUrl, poster)
  }
  return poster
}

/** Reset the poster cache (primarily for tests). */
export function resetNuxtCache(): void {
  CACHE.clear()
}
