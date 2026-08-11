import { describe, it, expect } from 'vitest'
import { extractMessageId, synthMessageId } from '../../src/message-id'

describe('message-id', () => {
  it('synth format', () => {
    expect(synthMessageId()).toMatch(/^<post-[0-9a-f]{16}@webhook>$/)
  })

  it('parses id from json', async () => {
    const res = new Response(JSON.stringify({ id: 'abc-123' }), {
      headers: { 'content-type': 'application/json' },
    })
    expect(await extractMessageId(res, true)).toBe('abc-123')
  })

  it('parses messageId alt key', async () => {
    const res = new Response(JSON.stringify({ messageId: 'm1' }), {
      headers: { 'content-type': 'application/json' },
    })
    expect(await extractMessageId(res, true)).toBe('m1')
  })

  it('falls back to synth on non-json', async () => {
    const res = new Response('plain', { headers: { 'content-type': 'text/plain' } })
    expect(await extractMessageId(res, true)).toMatch(/^<post-/)
  })

  it('falls back to synth when disabled', async () => {
    const res = new Response(JSON.stringify({ id: 'x' }), {
      headers: { 'content-type': 'application/json' },
    })
    expect(await extractMessageId(res, false)).toMatch(/^<post-/)
  })

  it('falls back to synth when id missing', async () => {
    const res = new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
    })
    expect(await extractMessageId(res, true)).toMatch(/^<post-/)
  })
})
