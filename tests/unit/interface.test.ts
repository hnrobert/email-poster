import { describe, it, expect } from 'vitest'
import {
  EmailPosterConfigSchema,
  resolveFieldMap,
  type EmailPosterConfigInput,
} from '../../src/config'
import {
  exportInterface,
  importInterface,
  detectInterface,
  exportPayloadSchema,
  InterfaceDefSchema,
  INTERFACE_DEF_VERSION,
} from '../../src/interface'

/** Parse a partial into a full config, then re-resolve its effective field map. */
function effectiveMap(partial: Partial<EmailPosterConfigInput>): ReturnType<typeof resolveFieldMap> {
  const parsed = EmailPosterConfigSchema.parse({ ...partial, postUrl: 'https://x.com' })
  return resolveFieldMap(parsed)
}

/**
 * The round-trip invariant: exporting a config and re-importing it reproduces
 * the exact same effective field map. (Holds for any config whose resolved map
 * satisfies the body XOR rule — i.e. all well-formed configs.)
 */
function expectRoundTrip(partial: Partial<EmailPosterConfigInput>): void {
  const expected = effectiveMap(partial)
  const parsed = EmailPosterConfigSchema.parse({ ...partial, postUrl: 'https://x.com' })
  const reimported = importInterface(exportInterface(parsed))
  const reparsed = EmailPosterConfigSchema.parse({ ...reimported, postUrl: 'https://x.com' })
  expect(resolveFieldMap(reparsed)).toEqual(expected)
}

describe('exportInterface / importInterface round-trip', () => {
  it('presets round-trip losslessly', () => {
    expectRoundTrip({ preset: 'smtogo' })
    expectRoundTrip({ preset: 'generic' })
    expectRoundTrip({ preset: 'custom_example' })
  })

  it('explicit none + custom map round-trips', () => {
    expectRoundTrip({ preset: 'none', fields: { to: 'rcpt', subject: 'subj', body: 'msg' } })
  })

  it('preset + non-conflicting overrides round-trip', () => {
    // Override recipient/sender keys but leave smtogo's bodyHtml intact (no body XOR clash).
    expectRoundTrip({
      preset: 'smtogo',
      fields: { to: 'recipient', from: 'sender', subject: 'topic' },
    })
  })

  it('exportInterface forces preset:"none" and stores the full effective map', () => {
    const parsed = EmailPosterConfigSchema.parse({ postUrl: 'https://x.com', preset: 'smtogo' })
    const def = exportInterface(parsed)
    expect(def.version).toBe(INTERFACE_DEF_VERSION)
    expect(def.preset).toBe('none')
    expect(def.fields).toEqual({
      from: 'from',
      to: 'to',
      subject: 'subject',
      bodyHtml: 'html',
    })
  })

  it('exportInterface carries fromAddress / extra / recipients.serialize', () => {
    const parsed = EmailPosterConfigSchema.parse({
      postUrl: 'https://x.com',
      preset: 'smtogo',
      fromAddress: 'noreply@x.com',
      extra: { source: 'app' },
      recipients: { serialize: 'array' },
    })
    const def = exportInterface(parsed)
    expect(def.fromAddress).toBe('noreply@x.com')
    expect(def.extra).toEqual({ source: 'app' })
    expect(def.recipients?.serialize).toBe('array')
  })

  it('exportInterface accepts a partial (input) config', () => {
    const def = exportInterface({ preset: 'custom_example' })
    expect(def.fields).toEqual({ to: 'email', subject: 'subject', body: 'content' })
  })

  it('importInterface reconstructs fromAddress/extra/recipients', () => {
    const parsed = EmailPosterConfigSchema.parse({
      postUrl: 'https://x.com',
      preset: 'none',
      fields: { to: 'rcpt', subject: 'subj', body: 'msg' },
      fromAddress: 'a@b',
      extra: { k: 1 },
      recipients: { serialize: 'array' },
    })
    const reimported = importInterface(exportInterface(parsed))
    expect(reimported.fromAddress).toBe('a@b')
    expect(reimported.extra).toEqual({ k: 1 })
    expect(reimported.recipients?.serialize).toBe('array')
  })
})

describe('importInterface accepts a standard JSON Schema', () => {
  it('routes a JSON Schema through detectInterface', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: { email: {}, subject: {}, content: {} },
      required: ['email', 'subject', 'content'],
    }
    const out = importInterface(schema)
    expect(out.preset).toBe('none')
    expect(out.fields).toEqual({ to: 'email', subject: 'subject', body: 'content' })
  })

  it('a plain InterfaceDef is NOT mistaken for a JSON Schema', () => {
    const def = exportInterface({ preset: 'smtogo' })
    // Round-trips through the InterfaceDef path (fields preserved exactly).
    expect(importInterface(def).fields).toEqual(def.fields)
  })
})

describe('detectInterface', () => {
  it('splits html+text when both present', () => {
    const def = detectInterface({
      from: 'a@b',
      to: 'c@d',
      subject: 'S',
      html: '<b>x</b>',
      text: 'x',
    })
    expect(def.fields).toEqual({
      from: 'from',
      to: 'to',
      subject: 'subject',
      bodyHtml: 'html',
      bodyText: 'text',
    })
  })

  it('detects the custom_example / Power Automate shape', () => {
    const def = detectInterface({ email: 'c@d', subject: 'S', content: 'x' })
    expect(def.fields).toEqual({ to: 'email', subject: 'subject', body: 'content' })
  })

  it('falls back to a single body key', () => {
    const def = detectInterface({ to: 'r', subject: 's', body: 'b' })
    expect(def.fields).toEqual({ to: 'to', subject: 'subject', body: 'body' })
  })

  it('reads keys from .properties in schema mode', () => {
    const def = detectInterface(
      { type: 'object', properties: { from: {}, to: {}, subject: {}, html: {} } },
      { mode: 'schema' },
    )
    expect(def.fields).toEqual({
      from: 'from',
      to: 'to',
      subject: 'subject',
      bodyHtml: 'html',
    })
  })

  it('returns an empty map for non-object input', () => {
    expect(detectInterface(null).fields).toEqual({})
    expect(detectInterface('hello').fields).toEqual({})
    expect(detectInterface(undefined).fields).toEqual({})
  })

  it('produces a valid (body-XOR) map for a split sample', () => {
    // Result must parse as a FieldMap (superRefine body XOR passes).
    expect(() =>
      InterfaceDefSchema.parse(detectInterface({ to: 'r', subject: 's', html: 'h', text: 't' })),
    ).not.toThrow()
  })
})

describe('exportPayloadSchema', () => {
  it('describes the downstream payload with required to/subject/body', () => {
    const def = exportInterface({ preset: 'smtogo' })
    const schema = exportPayloadSchema(def)
    expect(schema['$schema']).toBe('http://json-schema.org/draft-07/schema#')
    expect(schema['type']).toBe('object')
    const props = schema['properties'] as Record<string, unknown>
    expect(props['from']).toEqual({ type: 'string' })
    expect(props['html']).toEqual({ type: 'string' })
    expect(schema['required']).toEqual(['to', 'subject', 'html'])
  })

  it('attachments → array, headers → object', () => {
    const schema = exportPayloadSchema({
      $schema: '',
      version: INTERFACE_DEF_VERSION,
      preset: 'none',
      fields: { to: 'to', subject: 'subject', body: 'body', attachments: 'files', headers: 'h' },
    })
    const props = schema['properties'] as Record<string, unknown>
    expect(props['files']).toEqual({ type: 'array', items: { type: 'object' } })
    expect(props['h']).toEqual({ type: 'object' })
  })

  it('accepts a parsed config directly (resolves its preset)', () => {
    const parsed = EmailPosterConfigSchema.parse({ postUrl: 'https://x.com', preset: 'generic' })
    const schema = exportPayloadSchema(parsed)
    const props = schema['properties'] as Record<string, unknown>
    expect(props['html']).toEqual({ type: 'string' })
    expect(props['text']).toEqual({ type: 'string' })
  })
})

describe('InterfaceDefSchema', () => {
  it('enforces the body XOR rule on import', () => {
    expect(() =>
      InterfaceDefSchema.parse({
        version: 1,
        preset: 'none',
        fields: { body: 'b', bodyHtml: 'h' },
      }),
    ).toThrow()
  })

  it('applies default version/preset when omitted', () => {
    const def = InterfaceDefSchema.parse({ fields: { to: 'to', subject: 's', body: 'b' } })
    expect(def.version).toBe(INTERFACE_DEF_VERSION)
    expect(def.preset).toBe('none')
  })
})
