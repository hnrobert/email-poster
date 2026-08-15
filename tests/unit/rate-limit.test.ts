import { describe, it, expect } from 'vitest'
import { slidingWindow, tokenBucket } from '../../src/rate-limit'

describe('slidingWindow', () => {
  it('limits within max then rejects', () => {
    const rl = slidingWindow({ windowMs: 1_000, max: 2 })
    expect(rl.tryTake()).toBe(true)
    expect(rl.tryTake()).toBe(true)
    expect(rl.tryTake()).toBe(false)
    expect(() => rl.check()).toThrow(/Rate limit/)
  })
})

describe('tokenBucket', () => {
  it('drains capacity with no refill', () => {
    const rl = tokenBucket({ capacity: 2, refillPerSec: 0 })
    expect(rl.tryTake()).toBe(true)
    expect(rl.tryTake()).toBe(true)
    expect(rl.tryTake()).toBe(false)
  })
})

import {
  createEmailLimiter,
  emailLimitErrorMessage,
  DEFAULT_EMAIL_DAILY_LIMIT,
  type EmailLimiter,
} from '../../src/rate-limit'

const MINUTE = 60_000
const DAY = 24 * 60 * 60_000

// Deterministic clock helper: start at a fixed epoch, advance manually.
function clock(startMs = 0): { now: () => Date; advance: (ms: number) => void } {
  let t = startMs
  return { now: () => new Date(t), advance: (ms) => (t += ms) }
}

describe('createEmailLimiter · per-target', () => {
  it('allows the first send and blocks the second within a minute', () => {
    const rl = createEmailLimiter()
    const c = clock()
    const a = rl.checkTarget('code', 'a@x.test', c.now())
    expect(a.allowed).toBe(true)
    expect(a.dailyCount).toBe(1)
    expect(a.scope).toBe('address')
    expect(a.dailyLimit).toBe(DEFAULT_EMAIL_DAILY_LIMIT)

    const b = rl.checkTarget('code', 'a@x.test', c.now())
    expect(b.allowed).toBe(false)
    expect(b.reason).toBe('minute')
    expect(b.retryInSeconds).toBe(60)
  })

  it('retryInSeconds counts down as the window slides', () => {
    const rl = createEmailLimiter()
    const c = clock()
    rl.checkTarget('code', 'a@x.test', c.now())
    c.advance(20_000)
    expect(rl.checkTarget('code', 'a@x.test', c.now()).retryInSeconds).toBe(40)
  })

  it('keyes flows and recipients independently (emails lowercased)', () => {
    const rl = createEmailLimiter()
    const c = clock()
    expect(rl.checkTarget('code', 'a@x.test', c.now()).allowed).toBe(true)
    expect(rl.checkTarget('invite', 'a@x.test', c.now()).allowed).toBe(true)
    expect(rl.checkTarget('code', 'A@X.test', c.now()).allowed).toBe(false)
  })

  it('blocks at the daily cap even across minutes', () => {
    const rl = createEmailLimiter({ targetPerDay: 3 })
    const c = clock()
    for (let i = 0; i < 3; i++) {
      expect(rl.checkTarget('code', 'a@x.test', c.now()).allowed).toBe(true)
      c.advance(MINUTE)
    }
    const blocked = rl.checkTarget('code', 'a@x.test', c.now())
    expect(blocked.allowed).toBe(false)
    expect(blocked.reason).toBe('day')
    expect(blocked.dailyCount).toBe(3)
  })

  it('frees the minute slot after a full minute passes', () => {
    const rl = createEmailLimiter()
    const c = clock()
    rl.checkTarget('code', 'a@x.test', c.now())
    c.advance(60_001)
    expect(rl.checkTarget('code', 'a@x.test', c.now()).allowed).toBe(true)
  })

  it('daily window slides — a 24h-old send stops counting', () => {
    const rl = createEmailLimiter({ targetPerDay: 1 })
    const c = clock()
    expect(rl.checkTarget('code', 'a@x.test', c.now()).allowed).toBe(true)
    c.advance(DAY + 1)
    expect(rl.checkTarget('code', 'a@x.test', c.now()).allowed).toBe(true)
  })

  it('warns once the per-target daily count exceeds the threshold (default >5)', () => {
    const rl = createEmailLimiter()
    const c = clock()
    for (let i = 0; i < 5; i++) {
      const r = rl.checkTarget('code', 'a@x.test', c.now())
      expect(r.warning).toBeUndefined()
      c.advance(MINUTE)
    }
    const sixth = rl.checkTarget('code', 'a@x.test', c.now())
    expect(sixth.dailyCount).toBe(6)
    expect(sixth.warning).toBe(
      'Heads up: this address is limited to 10 emails per day.',
    )
  })
})

describe('createEmailLimiter · per-account', () => {
  it('aggregates across flows and users independently', () => {
    const rl = createEmailLimiter()
    const c = clock()
    for (let i = 0; i < 6; i++) expect(rl.checkAccount(7, c.now()).allowed).toBe(true)
    expect(rl.checkAccount(7, c.now()).reason).toBe('minute')
    expect(rl.checkAccount(8, c.now()).allowed).toBe(true)
    // Target checks don't consume the account bucket.
    expect(rl.checkTarget('code', 'z@x.test', c.now()).allowed).toBe(true)
  })

  it('blocks at the account daily cap (default 24) and warns at ≥20', () => {
    const rl = createEmailLimiter({ accountPerDay: 3, accountWarnAt: 2 })
    const c = clock()
    expect(rl.checkAccount(1, c.now()).warning).toBeUndefined()
    expect(rl.checkAccount(1, c.now()).warning).toBe(
      'Heads up: this account is limited to 3 emails per day.',
    )
    expect(rl.checkAccount(1, c.now()).allowed).toBe(true)
    expect(rl.checkAccount(1, c.now()).reason).toBe('day')
  })
})

describe('createEmailLimiter · misc', () => {
  it('reset() forgets everything', () => {
    const rl = createEmailLimiter()
    const c = clock()
    rl.checkTarget('code', 'a@x.test', c.now())
    rl.checkAccount(1, c.now())
    rl.reset()
    expect(rl.checkTarget('code', 'a@x.test', c.now()).allowed).toBe(true)
  })

  it('separate instances keep separate state', () => {
    const a: EmailLimiter = createEmailLimiter()
    const b = createEmailLimiter()
    const c = clock()
    a.checkTarget('code', 'x@x.test', c.now())
    expect(a.checkTarget('code', 'x@x.test', c.now()).allowed).toBe(false)
    expect(b.checkTarget('code', 'x@x.test', c.now()).allowed).toBe(true)
  })
})

describe('emailLimitErrorMessage', () => {
  it('words minute blocks with the retry seconds', () => {
    expect(
      emailLimitErrorMessage({ allowed: false, reason: 'minute', dailyCount: 1, dailyLimit: 10, scope: 'address', retryInSeconds: 37 }),
    ).toBe('Please wait 37s before sending another email')
  })

  it('words daily blocks with limit and scope, defaulting retry to 60', () => {
    expect(
      emailLimitErrorMessage({ allowed: false, reason: 'minute', dailyCount: 2, dailyLimit: 10, scope: 'address' }),
    ).toBe('Please wait 60s before sending another email')
    expect(
      emailLimitErrorMessage({ allowed: false, reason: 'day', dailyCount: 10, dailyLimit: 10, scope: 'account' }),
    ).toBe('Daily sending limit reached (10/day for this account)')
  })
})
