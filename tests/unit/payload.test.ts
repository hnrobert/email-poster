import { describe, it, expect } from 'vitest'
import { buildPayload } from '../../src/payload'
import { EmailPosterConfigSchema, type EmailPosterConfig } from '../../src/config'
import { SendMailInputSchema, type SendMailInput } from '../../src/input'

/** Parse through the schemas so defaults (type, recipients, retry, …) are applied. */
function makeConfig(p: Partial<EmailPosterConfig>): EmailPosterConfig {
  return EmailPosterConfigSchema.parse({ postUrl: 'https://x.com', ...p })
}
function makeInput(p: Partial<SendMailInput>): SendMailInput {
  return SendMailInputSchema.parse({ to: 'a@b.c', subject: 's', body: 'b', ...p })
}

describe('buildPayload', () => {
  it('smtogo preset → {from,to,subject,html}', () => {
    const out = buildPayload(
      makeInput({ to: 'a@b.c', subject: 'Hi', body: '<b>x</b>' }),
      makeConfig({ preset: 'smtogo', fromAddress: 'from@x.com' }),
    )
    expect(out).toEqual({ from: 'from@x.com', to: 'a@b.c', subject: 'Hi', html: '<b>x</b>' })
  })

  it('custom_example preset → {email,subject,content}', () => {
    const out = buildPayload(
      makeInput({ to: 'a@b.c', subject: 'Hi', body: 'b' }),
      makeConfig({ preset: 'custom_example' }),
    )
    expect(out).toEqual({ email: 'a@b.c', subject: 'Hi', content: 'b' })
  })

  it('generic preset emits html by default', () => {
    const out = buildPayload(
      makeInput({ body: '<b>x</b>' }),
      makeConfig({ preset: 'generic', fromAddress: 'f@x.com' }),
    )
    expect(out).toEqual({ from: 'f@x.com', to: 'a@b.c', subject: 's', html: '<b>x</b>' })
  })

  it('generic preset emits text when type:text', () => {
    const out = buildPayload(
      makeInput({ body: 'plain', type: 'text' }),
      makeConfig({ preset: 'generic', fromAddress: 'f@x.com' }),
    )
    expect(out).toEqual({ from: 'f@x.com', to: 'a@b.c', subject: 's', text: 'plain' })
  })

  it('smtogo + type:text throws (no text key)', () => {
    expect(() =>
      buildPayload(makeInput({ body: 'x', type: 'text' }), makeConfig({ preset: 'smtogo' })),
    ).toThrow(/text body key/)
  })

  it('input.from overrides config.fromAddress', () => {
    const out = buildPayload(
      makeInput({ from: 'override@x.com' }),
      makeConfig({ preset: 'smtogo', fromAddress: 'default@x.com' }),
    )
    expect(out.from).toBe('override@x.com')
  })

  it('from omitted when neither input.from nor config.fromAddress', () => {
    const out = buildPayload(makeInput({}), makeConfig({ preset: 'smtogo' }))
    expect(out).not.toHaveProperty('from')
  })

  it('extra merged, mapped fields win on collision', () => {
    const out = buildPayload(
      makeInput({ subject: 'real' }),
      makeConfig({ preset: 'smtogo', extra: { subject: 'extra', tag: 'x' } }),
    )
    expect(out.subject).toBe('real')
    expect(out.tag).toBe('x')
  })

  it('multi-recipient comma serialization', () => {
    const out = buildPayload(
      makeInput({ to: ['a@b.c', 'd@e.f'] }),
      makeConfig({ preset: 'smtogo' }),
    )
    expect(out.to).toBe('a@b.c, d@e.f')
  })

  it('multi-recipient array serialization', () => {
    const out = buildPayload(
      makeInput({ to: ['a@b.c', 'd@e.f'] }),
      makeConfig({ preset: 'smtogo', recipients: { serialize: 'array', maxLength: 50 } }),
    )
    expect(out.to).toEqual(['a@b.c', 'd@e.f'])
  })

  it('custom fields override preset keys', () => {
    const out = buildPayload(
      makeInput({ to: 'a@b.c', subject: 's', body: 'b' }),
      makeConfig({ preset: 'custom_example', fields: { to: 'recipient' } }),
    )
    expect(out.recipient).toBe('a@b.c')
    expect(out.email).toBeUndefined()
  })

  it('emits type discriminator when fields.type set', () => {
    const out = buildPayload(
      makeInput({ body: 'x', type: 'text' }),
      makeConfig({ preset: 'generic', fields: { type: 'contentType' } }),
    )
    expect(out.contentType).toBe('text')
  })
})
