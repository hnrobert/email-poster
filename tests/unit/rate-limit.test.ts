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
