/**
 * Optional rate-limiting utilities. NOT enabled by default — wire one into your
 * own send path (e.g. a beforeEach hook) if you need per-recipient throttling.
 */

export interface RateLimiter {
  /** Throw if over limit. */
  check(): void
  /** Non-throwing probe. Returns true if a slot was taken. */
  tryTake(): boolean
}

/** Fixed-window-into-sliding-window: tracks timestamps within `windowMs`. */
export function slidingWindow(opts: { windowMs: number; max: number }): RateLimiter {
  const { windowMs, max } = opts
  let timestamps: number[] = []
  return {
    check() {
      if (!this.tryTake()) {
        throw new Error(`Rate limit exceeded (${max} per ${windowMs}ms)`)
      }
    },
    tryTake() {
      const now = Date.now()
      timestamps = timestamps.filter((t) => now - t < windowMs)
      if (timestamps.length >= max) return false
      timestamps.push(now)
      return true
    },
  }
}

/** Classic token bucket: refills `refillPerSec` tokens/sec up to `capacity`. */
export function tokenBucket(opts: { capacity: number; refillPerSec: number }): RateLimiter {
  const { capacity, refillPerSec } = opts
  let tokens = capacity
  let last = Date.now()
  return {
    check() {
      if (!this.tryTake()) {
        throw new Error('Rate limit exceeded (token bucket empty)')
      }
    },
    tryTake() {
      const now = Date.now()
      const refill = ((now - last) / 1000) * refillPerSec
      tokens = Math.min(capacity, tokens + refill)
      last = now
      if (tokens < 1) return false
      tokens -= 1
      return true
    },
  }
}

// ---------------------------------------------------------------------------
// Email rate limiting — the transactional-email throttle used by consuming
// apps (per recipient address and per sender account), extracted from
// unnc-freshmen-verifier-gateway's server/utils/emailLimit.ts. Framework-free:
// it returns result objects; wrap `emailLimitErrorMessage` in your framework's
// HTTP error yourself.
// ---------------------------------------------------------------------------

/** Default per-target (recipient) caps: 1/minute, {@link DEFAULT_EMAIL_DAILY_LIMIT}/day. */
export const DEFAULT_EMAIL_DAILY_LIMIT = 10
const DEFAULT_TARGET_PER_MINUTE = 1
const DEFAULT_TARGET_WARN_AFTER = 5 // warn once the daily count exceeds this

/** Default per-account (sender) caps: 6/minute, 24/day. */
export const DEFAULT_ACCOUNT_PER_MINUTE = 6
export const DEFAULT_ACCOUNT_DAILY_LIMIT = 24
const DEFAULT_ACCOUNT_WARN_AT = 20 // warn once the daily count reaches this

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * 60 * 1000

/** Caps for {@link createEmailLimiter}; every field optional, verifier defaults. */
export interface EmailLimiterOptions {
  /** Per-target (recipient) sends per minute. Default 1. */
  targetPerMinute?: number
  /** Per-target sends per day. Default {@link DEFAULT_EMAIL_DAILY_LIMIT} (10). */
  targetPerDay?: number
  /** Warn in results once the per-target daily count exceeds this. Default 5. */
  targetWarnAfter?: number
  /** Per-account (sender) sends per minute, aggregated across flows. Default 6. */
  accountPerMinute?: number
  /** Per-account sends per day. Default 24. */
  accountPerDay?: number
  /** Warn in results once the per-account daily count reaches this. Default 20. */
  accountWarnAt?: number
}

/** One rate-limit decision. `warning` is set only when nearing the daily cap. */
export interface EmailLimitResult {
  allowed: boolean
  /** Which cap was hit, when not allowed. */
  reason?: 'minute' | 'day'
  /** Daily send count for this key (including this attempt when allowed). */
  dailyCount: number
  /** The daily cap this result was checked against (for error/warning wording). */
  dailyLimit: number
  /** Who the cap applies to — wording only. */
  scope: 'address' | 'account'
  /** Seconds until the per-minute cap resets (only when reason === 'minute'). */
  retryInSeconds?: number
  /** Warning string when approaching the daily cap; undefined otherwise. */
  warning?: string
}

/** An {@link EmailLimitResult} factory bound to caps; both dimensions share state. */
export interface EmailLimiter {
  /** Per-recipient cap for `flow` (e.g. 'code' | 'invite' | 'test'). */
  checkTarget(flow: string, email: string, now?: Date): EmailLimitResult
  /** Per-sender cap, aggregated across all flows. */
  checkAccount(userId: number | string, now?: Date): EmailLimitResult
  /** Forget all recorded sends (tests / deliberate reset). */
  reset(): void
}

/** Prune a bucket to timestamps still inside `windowMs` (and keep the map tight). */
function windowHits(bucket: Map<string, number[]>, key: string, windowMs: number, now: number): number[] {
  const arr = (bucket.get(key) ?? []).filter((t) => now - t < windowMs)
  bucket.set(key, arr)
  return arr
}

/** Sliding-window check that records the hit only when allowed. */
function slidingCheck(
  minuteBuckets: Map<string, number[]>,
  dayBuckets: Map<string, number[]>,
  key: string,
  perMinute: number,
  perDay: number,
  now: number,
): { allowed: boolean; reason?: 'minute' | 'day'; dailyCount: number; retryInSeconds?: number } {
  const day = windowHits(dayBuckets, key, DAY_MS, now)
  if (day.length >= perDay) return { allowed: false, reason: 'day', dailyCount: day.length }
  const minute = windowHits(minuteBuckets, key, MINUTE_MS, now)
  if (minute.length >= perMinute) {
    const first = minute[0] ?? now
    const retry = Math.max(1, Math.ceil((first + MINUTE_MS - now) / 1000))
    return { allowed: false, reason: 'minute', dailyCount: day.length, retryInSeconds: retry }
  }
  minute.push(now)
  day.push(now)
  return { allowed: true, dailyCount: day.length }
}

function withWording(
  r: ReturnType<typeof slidingCheck>,
  scope: 'address' | 'account',
  dailyLimit: number,
  warnWhen: (n: number) => boolean,
): EmailLimitResult {
  return {
    ...r,
    dailyLimit,
    scope,
    warning: warnWhen(r.dailyCount)
      ? `Heads up: this ${scope} is limited to ${dailyLimit} emails per day.`
      : undefined,
  }
}

/**
 * Transactional-email rate limiter with two independent dimensions:
 *
 *  • Per-target (recipient address), per flow: `targetPerMinute`/min,
 *    `targetPerDay`/day — so one address can't be spammed.
 *  • Per-account (the authenticated sender), aggregated across all flows:
 *    `accountPerMinute`/min, `accountPerDay`/day.
 *
 * In-memory, single-instance; counters are sliding windows of timestamps.
 */
export function createEmailLimiter(opts: EmailLimiterOptions = {}): EmailLimiter {
  const targetPerMinute = opts.targetPerMinute ?? DEFAULT_TARGET_PER_MINUTE
  const targetPerDay = opts.targetPerDay ?? DEFAULT_EMAIL_DAILY_LIMIT
  const targetWarnAfter = opts.targetWarnAfter ?? DEFAULT_TARGET_WARN_AFTER
  const accountPerMinute = opts.accountPerMinute ?? DEFAULT_ACCOUNT_PER_MINUTE
  const accountPerDay = opts.accountPerDay ?? DEFAULT_ACCOUNT_DAILY_LIMIT
  const accountWarnAt = opts.accountWarnAt ?? DEFAULT_ACCOUNT_WARN_AT

  const minuteBuckets = new Map<string, number[]>()
  const dayBuckets = new Map<string, number[]>()

  return {
    checkTarget(flow, email, now = new Date()) {
      const r = slidingCheck(
        minuteBuckets,
        dayBuckets,
        `target:${flow}:${email.toLowerCase()}`,
        targetPerMinute,
        targetPerDay,
        now.getTime(),
      )
      return withWording(r, 'address', targetPerDay, (n) => n > targetWarnAfter)
    },
    checkAccount(userId, now = new Date()) {
      const r = slidingCheck(minuteBuckets, dayBuckets, `account:${userId}`, accountPerMinute, accountPerDay, now.getTime())
      return withWording(r, 'account', accountPerDay, (n) => n >= accountWarnAt)
    },
    reset() {
      minuteBuckets.clear()
      dayBuckets.clear()
    },
  }
}

/** The ready-to-serve message for a blocked send (status 429 in HTTP apps). */
export function emailLimitErrorMessage(r: EmailLimitResult): string {
  return r.reason === 'minute'
    ? `Please wait ${r.retryInSeconds ?? 60}s before sending another email`
    : `Daily sending limit reached (${r.dailyLimit}/day for this ${r.scope})`
}
