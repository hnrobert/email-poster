/**
 * Load a partial EmailPosterConfig from `EMAIL_POSTER_*` environment variables.
 * Functions (hooks, urlGuard.resolver) cannot be loaded from env and are omitted.
 * The result is validated by `EmailPosterConfigSchema` when fed to `new EmailPoster(...)`.
 */
export function loadEnvConfig(env: NodeJS.ProcessEnv = process.env): Record<string, unknown> {
  const cfg: Record<string, unknown> = {}

  if (env.EMAIL_POSTER_POST_URL) cfg.postUrl = env.EMAIL_POSTER_POST_URL
  if (env.EMAIL_POSTER_PRESET) cfg.preset = env.EMAIL_POSTER_PRESET
  if (env.EMAIL_POSTER_FROM_ADDRESS) cfg.fromAddress = env.EMAIL_POSTER_FROM_ADDRESS

  const headers = parseJson<Record<string, string>>(env.EMAIL_POSTER_HEADERS)
  if (headers) cfg.headers = headers
  const extra = parseJson<Record<string, unknown>>(env.EMAIL_POSTER_EXTRA)
  if (extra) cfg.extra = extra

  const successCodes = parseCsvNumbers(env.EMAIL_POSTER_SUCCESS_CODES)
  if (successCodes) cfg.successCodes = successCodes

  const timeoutMs = parseNumber(env.EMAIL_POSTER_TIMEOUT_MS)
  if (timeoutMs !== undefined) cfg.timeoutMs = timeoutMs

  if (env.EMAIL_POSTER_PARSE_MESSAGE_ID !== undefined) {
    cfg.parseMessageId = parseBool(env.EMAIL_POSTER_PARSE_MESSAGE_ID) ?? true
  }

  if (env.EMAIL_POSTER_LOG !== undefined) {
    cfg.log = parseBool(env.EMAIL_POSTER_LOG) ?? true
  }

  const retry: Record<string, unknown> = {}
  const codes = parseCsvNumbers(env.EMAIL_POSTER_RETRY_CODES)
  if (codes) retry.codes = codes
  const maxAttempts = parseNumber(env.EMAIL_POSTER_RETRY_MAX_ATTEMPTS)
  if (maxAttempts !== undefined) retry.maxAttempts = maxAttempts
  const baseDelayMs = parseNumber(env.EMAIL_POSTER_RETRY_BASE_DELAY_MS)
  if (baseDelayMs !== undefined) retry.baseDelayMs = baseDelayMs
  const maxDelayMs = parseNumber(env.EMAIL_POSTER_RETRY_MAX_DELAY_MS)
  if (maxDelayMs !== undefined) retry.maxDelayMs = maxDelayMs
  if (Object.keys(retry).length > 0) cfg.retry = retry

  return cfg
}

function parseNumber(v: string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function parseJson<T>(v: string | undefined): T | undefined {
  if (v === undefined || v === '') return undefined
  try {
    return JSON.parse(v) as T
  } catch {
    return undefined
  }
}

function parseCsvNumbers(v: string | undefined): number[] | undefined {
  if (!v) return undefined
  const out = v
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n))
  return out.length > 0 ? out : undefined
}

function parseBool(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined
  const s = v.toLowerCase()
  return s === '1' || s === 'true' || s === 'yes'
}
