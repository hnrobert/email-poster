import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderTestEmail, runTest, TEST_SUBJECT } from '../../cli/test'
import { buildPoster } from '../../cli/send'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('renderTestEmail', () => {
  const html = renderTestEmail('a@b.c', 'custom_example')

  it('renders the verifier-style card: brand header, title, CTA, footer', () => {
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('>email-poster<')
    expect(html).toContain('>Test email<')
    expect(html).toContain('>email-poster on GitHub<')
    expect(html).toContain('Sent via email-poster')
  })

  it('is monochrome: ink-black CTA with auto-contrast label', () => {
    expect(html).toContain('bgcolor="#0a0a0a"')
    expect(html).toContain('color: #fafafa')
  })

  it('distinguishes light and dark via prefers-color-scheme', () => {
    expect(html).toContain('color-scheme" content="light dark"')
    expect(html).toContain('@media (prefers-color-scheme: dark)')
  })

  it('echoes the recipient (escaped) and field map in the meta line', () => {
    expect(html).toContain('sent to a@b.c')
    expect(html).toContain('<code>custom_example</code> field map')
    const evil = renderTestEmail(`x'<&">@b.c`, 'smtogo')
    expect(evil).not.toContain("x'&lt;")
  })

  it('leaves no unreplaced tokens', () => {
    expect(renderTestEmail('a@b.c', 'smtogo')).not.toMatch(/\{\{[A-Z_]+\}\}/)
  })
})

describe('runTest', () => {
  it('--dry-run prints the rendered HTML without any network', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const code = await runTest({
      to: 'a@b.c',
      url: 'http://mock.test/hook',
      headers: {},
      dryRun: true,
      json: false,
      verbose: false,
    })

    expect(code).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0]![0])).toContain('<!DOCTYPE html>')
  })

  it('--dry-run works with no resolvable config at all', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const code = await runTest({ to: 'a@b.c', headers: {}, dryRun: true, json: false, verbose: false })
    expect(code).toBe(0)
    expect(String(log.mock.calls[0]![0])).toContain('Test email')
  })

  it('sends with the fixed subject and prints one success line', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"messageId":"m-9"}', { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})

    const code = await runTest({
      to: 'a@b.c',
      url: 'http://mock.test/hook',
      preset: 'custom_example',
      headers: {},
      dryRun: false,
      json: false,
      verbose: false,
    })

    expect(code).toBe(0)
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0]![0])).toMatch(/^✓ Test email sent to a@b\.c \(status 200\) in \d+ms\. messageId=m-9$/)
    expect(err).not.toHaveBeenCalled()

    // The custom_example field map shapes the POSTed payload.
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as Record<string, unknown>
    expect(body).toMatchObject({ email: 'a@b.c', subject: TEST_SUBJECT })
    expect(String(body.content)).toContain('<!DOCTYPE html>')
  })

  it('prints the library-style error and exits 1 when the webhook rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 500 })),
    )
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})

    const code = await runTest({
      to: 'a@b.c',
      url: 'http://mock.test/hook',
      headers: {},
      dryRun: false,
      json: false,
      verbose: false,
      timeoutMs: 5_000,
    })

    expect(code).toBe(1)
    expect(err).toHaveBeenCalledTimes(1)
    expect(String(err.mock.calls[0]![0])).toMatch(/^error: /)
  })

  it('--json emits a machine-readable result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"messageId":"m-1"}', { status: 202, headers: { 'content-type': 'application/json' } }),
      ),
    )
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const code = await runTest({
      to: 'a@b.c',
      url: 'http://mock.test/hook',
      headers: {},
      dryRun: false,
      json: true,
      verbose: false,
    })

    expect(code).toBe(0)
    const out = JSON.parse(String(log.mock.calls[0]![0])) as Record<string, unknown>
    expect(out).toMatchObject({ ok: true, messageId: 'm-1', status: 202 })
  })
})

describe('buildPoster (shared connection layer)', () => {
  it('silences the library per-send logging for the CLI', async () => {
    const mail = await buildPoster({ url: 'http://mock.test/hook', headers: {} })
    expect(mail.config.log).toBe(false)
  })
})
