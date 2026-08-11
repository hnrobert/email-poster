import { EmailPoster } from './poster'
import type { EmailPosterConfigInput } from './config'
import { loadEnvConfig } from './env'
import type { SendMailInput } from './input'
import type { SendOptions, SendResult } from './types'
import { EmailPosterError, ErrorCode } from './errors'

let _default: EmailPoster | null = null

/**
 * Install a process-wide default poster. Accepts a config or a function
 * that receives the env-derived partial config and returns a config.
 * Explicit `configure()` always wins over env auto-loading.
 */
export function configure(
  config: EmailPosterConfigInput | ((env: Record<string, unknown>) => EmailPosterConfigInput),
): void {
  const resolved = typeof config === 'function' ? config(loadEnvConfig()) : config
  _default = new EmailPoster(resolved)
}

/** The process-wide default poster. Lazily built from env if not configured. */
export function getDefaultPoster(): EmailPoster {
  if (_default) return _default
  const env = loadEnvConfig()
  if (!env.postUrl) {
    throw new EmailPosterError(
      'No default poster configured. Call configure({...}) or set EMAIL_POSTER_POST_URL.',
      { code: ErrorCode.CONFIG_INVALID },
    )
  }
  _default = new EmailPoster(env)
  return _default
}

/** Reset the default poster (primarily for tests). */
export function resetDefaultPoster(): void {
  _default = null
}

/** Send via the default poster (configure() or EMAIL_POSTER_* env). */
export async function send(input: SendMailInput, opts?: SendOptions): Promise<SendResult> {
  return getDefaultPoster().send(input, opts)
}
