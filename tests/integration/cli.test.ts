import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { main } from '../../cli/cli'
import { parseHeaders, parseAttachments, formatAttempt } from '../../cli/send'

function jsonRes(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

describe('cli arg helpers', () => {
  it('parseHeaders splits "K: V"', () => {
    expect(parseHeaders(['Authorization: Bearer t', 'X-Foo:bar'])).toEqual({
      Authorization: 'Bearer t',
      'X-Foo': 'bar',
    })
  })
  it('parseHeaders rejects missing colon', () => {
    expect(() => parseHeaders(['nope'])).toThrow(/expected "Key: Value"/)
  })
  it('parseAttachments base64-encodes file content', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ep-'))
    const path = join(dir, 'a.txt')
    await writeFile(path, 'hello')
    try {
      const out = await parseAttachments([`report=${path}`])
      expect(out).toHaveLength(1)
      expect(out[0]!.filename).toBe('report')
      expect(out[0]!.content).toBe(Buffer.from('hello').toString('base64'))
    } finally {
      await rm(dir, { recursive: true })
    }
  })
})

describe('formatAttempt (verbose attempt formatting)', () => {
  it('renders a success', () => {
    expect(formatAttempt({ attempt: 1, maxAttempts: 3, ok: true, retryable: false, status: 200 })).toBe(
      'attempt 1/3 → 200 OK',
    )
  })
  it('renders a retryable status with backoff', () => {
    expect(
      formatAttempt({
        attempt: 1,
        maxAttempts: 3,
        ok: false,
        retryable: true,
        status: 503,
        backoffMs: 412,
        errorKind: 'status',
        message: 'Webhook returned 503',
      }),
    ).toBe('attempt 1/3 → status 503 (Webhook returned 503); retry in 412ms')
  })
  it('renders a terminal (non-retryable) status', () => {
    expect(
      formatAttempt({
        attempt: 1,
        maxAttempts: 3,
        ok: false,
        retryable: false,
        status: 400,
        errorKind: 'status',
        message: 'Webhook returned 400',
      }),
    ).toBe('attempt 1/3 → status 400 (Webhook returned 400)')
  })
  it('renders a network error without a status', () => {
    expect(
      formatAttempt({
        attempt: 2,
        maxAttempts: 3,
        ok: false,
        retryable: true,
        backoffMs: 0,
        errorKind: 'network',
        message: 'Network error during send',
      }),
    ).toBe('attempt 2/3 → network (Network error during send); retry in 0ms')
  })
})

describe('cli main()', () => {
  type FetchMock = ReturnType<typeof vi.fn>
  let logSpy: ReturnType<typeof vi.spyOn>
  let errSpy: ReturnType<typeof vi.spyOn>
  let stderrSpy: MockInstance
  let fetchMock: FetchMock

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    fetchMock = vi.spyOn(globalThis, 'fetch') as unknown as FetchMock
  })
  afterEach(() => {
    vi.restoreAllMocks()
    process.exitCode = 0
  })

  it('--help prints usage and exits 0', async () => {
    const code = await main(['--help'])
    expect(code).toBe(0)
    expect(logSpy.mock.calls.flat().join('\n')).toContain('USAGE')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('unknown command exits 1', async () => {
    const code = await main(['frobnicate'])
    expect(code).toBe(1)
    expect(errSpy.mock.calls.flat().join('\n')).toContain('unknown command')
  })

  it('send --dry-run --json shows resolved field map + payload (no network)', async () => {
    const code = await main([
      'send', '--dry-run', '--json',
      '--preset', 'custom_example',
      '--url', 'https://x.com',
      '--to', 'a@b.c',
      '--subject', 'Hi',
      '--body', 'Hello',
    ])
    expect(code).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
    const printed = JSON.parse(logSpy.mock.calls[0]![0] as string)
    expect(printed.fieldMap).toEqual({ to: 'email', subject: 'subject', body: 'content' })
    expect(printed.payload).toEqual({ email: 'a@b.c', subject: 'Hi', content: 'Hello' })
  })

  it('send success parses messageId and prints json', async () => {
    fetchMock.mockResolvedValue(jsonRes({ id: 'msg-9' }))
    const code = await main([
      'send', '--json',
      '--preset', 'smtogo',
      '--url', 'https://x.com',
      '--from', 'f@x.com',
      '--header', 'Authorization: Bearer t',
      '--to', 'a@b.c', '--subject', 's', '--body', 'b',
    ])
    expect(code).toBe(0)
    const printed = JSON.parse(logSpy.mock.calls[0]![0] as string)
    expect(printed).toMatchObject({ ok: true, messageId: 'msg-9', status: 200 })
    expect(typeof printed.elapsedMs).toBe('number')
    // auth header reached the fetch call
    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer t')
  })

  it('-v / --verbose writes debug lines to stderr (headers redacted) and still succeeds', async () => {
    fetchMock.mockResolvedValue(jsonRes({ id: 'v1' }))
    const code = await main([
      'send', '-v',
      '--preset', 'smtogo',
      '--url', 'https://x.com',
      '--header', 'Authorization: Bearer secret-token',
      '--to', 'a@b.c', '--subject', 's', '--body', 'b',
    ])
    expect(code).toBe(0)
    const stderr = stderrSpy.mock.calls.map((c) => String(c[0])).join('')
    // verbose config + attempt lines present
    expect(stderr).toContain('[debug] target url: https://x.com')
    expect(stderr).toContain('[debug] preset: smtogo')
    expect(stderr).toContain('[debug] attempt 1/3 → 200 OK')
    // the Authorization header is redacted, never leaked
    expect(stderr).toContain('"Authorization":"***')
    expect(stderr).not.toContain('secret-token')
    // result line still lands on stdout
    expect(logSpy.mock.calls[0]![0]).toMatch(/✓ Sent \(status 200\) in \d+ms/)
  })

  it('send --json failure prints a JSON error object to stderr and exits 1', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 400 }))
    const code = await main([
      'send', '--json',
      '--preset', 'smtogo',
      '--url', 'https://x.com',
      '--to', 'a@b.c', '--subject', 's', '--body', 'b',
    ])
    expect(code).toBe(1)
    // 400 is non-retryable → exactly one attempt
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // stdout is untouched; the error JSON goes to stderr
    expect(logSpy).not.toHaveBeenCalled()
    const errJson = JSON.parse(errSpy.mock.calls[0]![0] as string)
    expect(errJson).toMatchObject({ ok: false })
    expect(errJson.error).toMatchObject({ code: 'REQUEST_FAILED', status: 400 })
    expect(typeof errJson.elapsedMs).toBe('number')
  })

  it('send with invalid input exits 1 (validation)', async () => {
    const code = await main([
      'send', '--url', 'https://x.com', '--preset', 'smtogo',
      '--to', 'not-an-email', '--subject', 's', '--body', 'b',
    ])
    expect(code).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(errSpy.mock.calls.flat().join('\n')).toContain('error:')
  })

  it('send requires --to and --subject', async () => {
    const code = await main(['send', '--url', 'https://x.com', '--body', 'b'])
    expect(code).toBe(1)
    const msg = errSpy.mock.calls.flat().join('\n')
    expect(msg).toMatch(/--to is required|--subject is required/)
  })

  it('flags override config file; config file fills the rest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ep-'))
    const cfgPath = join(dir, 'mail.json')
    await writeFile(cfgPath, JSON.stringify({
      postUrl: 'https://from-file.example',
      preset: 'smtogo',
      fromAddress: 'file@x.com',
    }))
    try {
      // --url flag should override the file's postUrl; --dry-run to avoid network
      const code = await main([
        'send', '--dry-run', '--json',
        '--config', cfgPath,
        '--url', 'https://flag-url.example',
        '--to', 'a@b.c', '--subject', 's', '--body', 'b',
      ])
      expect(code).toBe(0)
      const printed = JSON.parse(logSpy.mock.calls[0]![0] as string)
      expect(printed.payload).toEqual({
        from: 'file@x.com',
        to: 'a@b.c',
        subject: 's',
        html: 'b',
      })
    } finally {
      await rm(dir, { recursive: true })
    }
  })

  it('validate accepts a valid config (exit 0) and rejects invalid (exit 1)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ep-'))
    const good = join(dir, 'good.json')
    const bad = join(dir, 'bad.json')
    await writeFile(good, JSON.stringify({ postUrl: 'https://x.com', preset: 'smtogo' }))
    await writeFile(bad, JSON.stringify({ preset: 'smtogo' })) // missing postUrl
    try {
      expect(await main(['validate', '--config', good])).toBe(0)
      expect(await main(['validate', '--config', bad])).toBe(1)
    } finally {
      await rm(dir, { recursive: true })
    }
  })

  it('export-interface prints the InterfaceDef; --json-schema switches format', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ep-'))
    const cfgPath = join(dir, 'mail.json')
    await writeFile(cfgPath, JSON.stringify({ postUrl: 'https://x.com', preset: 'smtogo' }))
    try {
      const code = await main(['export-interface', '--config', cfgPath])
      expect(code).toBe(0)
      const def = JSON.parse(logSpy.mock.calls[0]![0] as string)
      expect(def.preset).toBe('none')
      expect(def.fields).toEqual({ from: 'from', to: 'to', subject: 'subject', bodyHtml: 'html' })

      const code2 = await main(['export-interface', '--config', cfgPath, '--json-schema'])
      expect(code2).toBe(0)
      const schema = JSON.parse(logSpy.mock.calls[1]![0] as string)
      expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#')
      expect(schema.properties.html).toEqual({ type: 'string' })
    } finally {
      await rm(dir, { recursive: true })
    }
  })

  it('export-interface requires --config', async () => {
    const code = await main(['export-interface'])
    expect(code).toBe(1)
    expect(errSpy.mock.calls.flat().join('\n')).toContain('--config')
  })

  it('detect-interface infers a map from a sample instance', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ep-'))
    const samplePath = join(dir, 'sample.json')
    await writeFile(samplePath, JSON.stringify({ email: 'c@d', subject: 'S', content: 'x' }))
    try {
      const code = await main(['detect-interface', '--input', samplePath])
      expect(code).toBe(0)
      const def = JSON.parse(logSpy.mock.calls[0]![0] as string)
      expect(def.fields).toEqual({ to: 'email', subject: 'subject', body: 'content' })
    } finally {
      await rm(dir, { recursive: true })
    }
  })

  it('detect-interface requires --input', async () => {
    const code = await main(['detect-interface'])
    expect(code).toBe(1)
    expect(errSpy.mock.calls.flat().join('\n')).toContain('--input')
  })
})
