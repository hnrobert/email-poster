import { describe, it, expect } from 'vitest'
import { EmailPosterConfigSchema, PRESETS, resolveFieldMap } from '../../src/config'

describe('EmailPosterConfigSchema', () => {
  it('applies defaults', () => {
    const c = EmailPosterConfigSchema.parse({ postUrl: 'https://x.com' })
    expect(c.timeoutMs).toBe(15_000)
    expect(c.retry.maxAttempts).toBe(3)
    expect(c.retry.codes).toContain(503)
    expect(c.recipients.serialize).toBe('comma')
    expect(c.recipients.maxLength).toBe(50)
    expect(c.parseMessageId).toBe(true)
    expect(c.headers).toEqual({})
  })

  it('rejects missing postUrl', () => {
    expect(() => EmailPosterConfigSchema.parse({})).toThrow()
  })

  it('rejects body + bodyHtml both', () => {
    expect(() =>
      EmailPosterConfigSchema.parse({
        postUrl: 'https://x.com',
        fields: { body: 'b', bodyHtml: 'h' },
      }),
    ).toThrow()
  })

  it('accepts a custom field map without a preset', () => {
    const c = EmailPosterConfigSchema.parse({
      postUrl: 'https://x.com',
      fields: { to: 'recipient', subject: 'topic', body: 'message' },
    })
    expect(c.fields?.to).toBe('recipient')
  })
})

describe('resolveFieldMap', () => {
  it('defaults to smtogo when no preset/fields', () => {
    const c = EmailPosterConfigSchema.parse({ postUrl: 'https://x.com' })
    expect(resolveFieldMap(c)).toEqual(PRESETS.smtogo)
  })

  it('merges fields over preset (preset keys retained)', () => {
    const c = EmailPosterConfigSchema.parse({
      postUrl: 'https://x.com',
      preset: 'smtogo',
      fields: { to: 'email' },
    })
    const fm = resolveFieldMap(c)
    expect(fm.to).toBe('email')
    expect(fm.from).toBe('from')
  })
})
