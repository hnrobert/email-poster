import { EmailPoster } from '../src/poster'
import { renderCardEmail, escapeHtml } from '../src/template'
import { buildPoster } from './send'
import { isEmailPosterError } from '../src/errors'
import { createDebug } from './log'

export interface TestFlags {
  to: string
  preset?: string
  config?: string
  url?: string
  timeoutMs?: number
  headers: Record<string, string>
  dryRun: boolean
  json: boolean
  verbose: boolean
}

export const TEST_SUBJECT = 'email-poster · Test email'

/**
 * The quick-test email: verifier-style card (brand header, title, body, CTA,
 * footer) in a monochrome palette — ink-black primary (#0a0a0a) with an
 * auto-contrast near-white button label — and dark mode via the shell's
 * `prefers-color-scheme` media query, same as the site-themed presets.
 */
export function renderTestEmail(to: string, presetName: string): string {
  const P =
    "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;"
  return renderCardEmail(
    {
      title: 'Test email',
      bodyHtml:
        `<p style="${P}font-size:15px;line-height:1.65;color:#404040;margin:0 0 12px;">` +
        'This is a quick test from the <strong>email-poster</strong> CLI — receiving it means the webhook URL, ' +
        'field map, and authentication are all wired correctly.</p>' +
        `<p style="${P}font-size:13px;line-height:1.6;color:#737373;margin:0;">` +
        `sent to ${escapeHtml(to)} · <code>${escapeHtml(presetName)}</code> field map · dark mode follows your mail client</p>`,
      actionLabel: 'email-poster on GitHub',
      actionUrl: 'https://github.com/hnrobert/email-poster',
      preheader: 'email-poster test email',
    },
    {
      brandTitle: 'email-poster',
      primaryColor: '#0a0a0a',
    },
  )
}

/** `email-poster test` — send the themed test email with one command. Exit code. */
export async function runTest(flags: TestFlags): Promise<number> {
  // Preview first: --dry-run prints the exact HTML that would be POSTed and
  // needs no reachable webhook — fall back to a placeholder config so the
  // template can be inspected before any wiring exists.
  if (flags.dryRun) {
    let presetName = flags.preset ?? 'smtogo'
    try {
      presetName = (await buildPoster(flags)).config.preset ?? presetName
    } catch {
      // no resolvable config — the flag/env default is enough for a preview
    }
    const html = renderTestEmail(flags.to, presetName)
    if (flags.json) console.log(JSON.stringify({ subject: TEST_SUBJECT, to: flags.to, html }))
    else console.log(html)
    return 0
  }

  let mail: EmailPoster
  try {
    mail = await buildPoster(flags)
  } catch (e) {
    return fail(isEmailPosterError(e) ? `${e.message} (${e.detail ?? e.code})` : String(e))
  }

  const presetName = mail.config.preset ?? 'smtogo'
  const html = renderTestEmail(flags.to, presetName)

  const debug = createDebug(flags.verbose)
  if (flags.verbose) {
    debug(`target url: ${mail.config.postUrl}`)
    debug(`preset: ${presetName}`)
  }

  const t0 = Date.now()
  try {
    const res = await mail.send({ to: flags.to, subject: TEST_SUBJECT, body: html, type: 'html' })
    const elapsedMs = Date.now() - t0
    if (flags.json) {
      console.log(
        JSON.stringify({
          ok: true,
          messageId: res.messageId,
          status: res.status,
          elapsedMs,
          ...(res.requestId ? { requestId: res.requestId } : {}),
        }),
      )
    } else {
      let line = `✓ Test email sent to ${flags.to} (status ${res.status}) in ${elapsedMs}ms. messageId=${res.messageId}`
      if (flags.verbose && res.requestId) line += ` requestId=${res.requestId}`
      console.log(line)
    }
    return 0
  } catch (e) {
    if (isEmailPosterError(e)) {
      if (flags.verbose) debug(`error: ${JSON.stringify(e.toJSON())}`)
      let line = `${e.message}${e.status ? ` (status ${e.status})` : ''}${e.detail ? ` — ${e.detail}` : ''}`
      if (e.requestId) line += ` requestId=${e.requestId}`
      return fail(line)
    }
    return fail(e instanceof Error ? e.message : String(e))
  }
}

function fail(message: string): number {
  console.error(`error: ${message}`)
  return 1
}
