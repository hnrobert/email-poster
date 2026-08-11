import { describe, it, expect } from 'vitest'
import { composeSignals } from '../../src/abort'

describe('composeSignals', () => {
  it('returns the only defined signal', () => {
    const a = new AbortController().signal
    expect(composeSignals(a, undefined)).toBe(a)
    expect(composeSignals(undefined, a)).toBe(a)
    expect(composeSignals(undefined, undefined)).toBeUndefined()
  })

  it('aborts when either input aborts', () => {
    const a = new AbortController()
    const b = new AbortController()
    const composed = composeSignals(a.signal, b.signal)!
    expect(composed.aborted).toBe(false)
    a.abort()
    expect(composed.aborted).toBe(true)
  })

  it('pre-aborted propagates immediately', () => {
    const a = new AbortController()
    a.abort()
    const composed = composeSignals(a.signal, new AbortController().signal)!
    expect(composed.aborted).toBe(true)
  })
})
