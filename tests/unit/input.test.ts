import { describe, it, expect } from 'vitest'
import { normalizeRecipients, SendMailInputSchema } from '../../src/input'

describe('normalizeRecipients', () => {
  it('single string', () => {
    expect(normalizeRecipients('a@b.c')).toEqual(['a@b.c'])
  })
  it('array dedup (case-insensitive) + trim + drop empty', () => {
    expect(normalizeRecipients([' a@b.c ', 'A@B.C', '', 'd@e.f'])).toEqual(['a@b.c', 'd@e.f'])
  })
  it('undefined → []', () => {
    expect(normalizeRecipients(undefined)).toEqual([])
  })
})

describe('SendMailInputSchema', () => {
  it('defaults type to html', () => {
    expect(
      SendMailInputSchema.parse({ to: 'a@b.c', subject: 's', body: 'b' }).type,
    ).toBe('html')
  })
  it('accepts array to', () => {
    expect(
      SendMailInputSchema.parse({ to: ['a@b.c'], subject: 's', body: 'b' }).to,
    ).toEqual(['a@b.c'])
  })
  it('rejects empty subject', () => {
    expect(() =>
      SendMailInputSchema.parse({ to: 'a@b.c', subject: '', body: 'b' }),
    ).toThrow()
  })
})
