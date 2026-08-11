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
