import { readFile } from 'node:fs/promises'
import { EmailPoster } from '../src/poster'
import { resolveFieldMap } from '../src/config'
import { buildPayload } from '../src/payload'
import { isEmailPosterError } from '../src/errors'
import type { SendMailInput } from '../src/input'
import { loadBaseConfig, deepMerge } from './config-loader'
import { createDebug, redactHeaders } from './log'
import type { AttemptInfo } from '../src/types'

export interface SendFlags {
  to: string[]
  cc: string[]
  bcc: string[]
  replyTo?: string
  from?: string
  subject?: string
  body?: string
  bodyFile?: string
  bodyStdin: boolean
  type?: 'html' | 'text'
  attach: string[]
  header: string[]
  tag?: string
  preset?: string
  config?: string
  url?: string
  timeoutMs?: number
  dryRun: boolean
  json: boolean
  verbose: boolean
}

/** Connection flags shared by every sending command (`send`, `test`). */
export interface CommonMailFlags {
  preset?: string
  config?: string
  url?: string
  timeoutMs?: number
  headers: Record<string, string>
}

/**
 * Build the sending EmailPoster from the shared flag set. Config layer:
 * rc < env < --config file < flags. `log: false` is forced — the CLI prints
 * its own result lines, so the library's default per-send logging is silenced.
 */
export async function buildPoster(flags: CommonMailFlags): Promise<EmailPoster> {
  const base = await loadBaseConfig({ configPath: flags.config })
  const flagCfg: Record<string, unknown> = {}
  if (flags.preset) flagCfg.preset = flags.preset
  if (flags.url) flagCfg.postUrl = flags.url
  if (flags.timeoutMs !== undefined) flagCfg.timeoutMs = flags.timeoutMs
  if (Object.keys(flags.headers).length) flagCfg.headers = flags.headers
  flagCfg.log = false
  return new EmailPoster(deepMerge(base, flagCfg))
}

/** `email-poster send` — build input + config, then send (or print payload). Exit code. */
export async function runSend(flags: SendFlags): Promise<number> {
  if (flags.to.length === 0) return fail('--to is required')
  if (!flags.subject) return fail('--subject is required')

  let body: string
  try {
    body = await resolveBody(flags)
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e))
  }

  const headers = parseHeaders(flags.header)
  const attachments = await parseAttachments(flags.attach)

  const input: SendMailInput = {
    to: flags.to,
    subject: flags.subject,
    body,
    type: flags.type ?? 'html',
  }
  if (flags.cc.length) input.cc = flags.cc
  if (flags.bcc.length) input.bcc = flags.bcc
  if (flags.replyTo) input.replyTo = flags.replyTo
  if (flags.from) input.from = flags.from
  if (flags.tag) input.tagName = flags.tag
  if (attachments.length) input.attachments = attachments

  // Config layer: rc < env < --config file < flags (buildPoster forces log:false —
  // the CLI prints its own result lines).
  let mail: EmailPoster
  try {
    mail = await buildPoster({ preset: flags.preset, config: flags.config, url: flags.url, timeoutMs: flags.timeoutMs, headers })
  } catch (e) {
    return fail(isEmailPosterError(e) ? `${e.message} (${e.detail ?? e.code})` : String(e))
  }

  const debug = createDebug(flags.verbose)
  const fieldMap = resolveFieldMap(mail.config)

  if (flags.verbose) {
    const cfg = mail.config
    debug(`target url: ${cfg.postUrl}`)
    debug(`preset: ${cfg.preset}`)
    debug(
      `retry: maxAttempts=${cfg.retry.maxAttempts} baseDelayMs=${cfg.retry.baseDelayMs} maxDelayMs=${cfg.retry.maxDelayMs} codes=[${cfg.retry.codes.join(',')}]`,
    )
    debug(`timeout: ${cfg.timeoutMs}ms`)
    debug(`field map: ${JSON.stringify(fieldMap)}`)
    debug(`headers: ${JSON.stringify(redactHeaders({ ...cfg.headers, 'Content-Type': 'application/json' }))}`)
    // For actual sends (not --dry-run, which already prints the payload to stdout),
    // show the assembled payload pre-hook.
    if (!flags.dryRun) debug(`payload: ${JSON.stringify(buildPayload(input, mail.config))}`)
  }

  if (flags.dryRun) {
    const payload = buildPayload(input, mail.config)
    if (flags.json) {
      console.log(JSON.stringify({ fieldMap, payload }, null, 2))
    } else {
      console.log('Field map:')
      console.log(JSON.stringify(fieldMap, null, 2))
      console.log('\nPayload:')
      console.log(JSON.stringify(payload, null, 2))
    }
    return 0
  }

  const t0 = Date.now()
  try {
    const res = await mail.send(input, {
      onAttempt: (i) => debug(formatAttempt(i)),
    })
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
      let line = `✓ Sent (status ${res.status}) in ${elapsedMs}ms. messageId=${res.messageId}`
      if (flags.verbose && res.requestId) line += ` requestId=${res.requestId}`
      console.log(line)
    }
    return 0
  } catch (e) {
    const elapsedMs = Date.now() - t0
    if (isEmailPosterError(e)) {
      if (flags.verbose) {
        debug(`elapsed: ${elapsedMs}ms`)
        debug(`error: ${JSON.stringify(e.toJSON())}`)
      }
      if (flags.json) {
        console.error(JSON.stringify({ ok: false, error: e.toJSON(), elapsedMs }))
        return 1
      }
      let line = `${e.message}${e.status ? ` (status ${e.status})` : ''}${e.detail ? ` — ${e.detail}` : ''}`
      if (e.requestId) line += ` requestId=${e.requestId}`
      if (flags.verbose) line += ` (after ${elapsedMs}ms)`
      return fail(line)
    }
    const msg = e instanceof Error ? e.message : String(e)
    if (flags.verbose) debug(`error: ${e instanceof Error ? e.stack ?? msg : msg}`)
    if (flags.json) {
      console.error(JSON.stringify({ ok: false, error: { message: msg }, elapsedMs }))
      return 1
    }
    return fail(msg)
  }
}

/** Render an AttemptInfo snapshot as a single verbose log line. */
export function formatAttempt(i: AttemptInfo): string {
  const tag = `attempt ${i.attempt}/${i.maxAttempts}`
  if (i.ok) return `${tag} → ${i.status} OK`
  const what = i.status !== undefined ? `${i.errorKind ?? 'error'} ${i.status}` : (i.errorKind ?? 'error')
  const msg = i.message ? ` (${i.message})` : ''
  if (i.retryable && i.backoffMs !== undefined) return `${tag} → ${what}${msg}; retry in ${i.backoffMs}ms`
  return `${tag} → ${what}${msg}`
}

/** Resolve the message body from --body, --body-file, or --body-stdin. */
async function resolveBody(flags: SendFlags): Promise<string> {
  if (flags.body !== undefined) return flags.body
  if (flags.bodyFile) return await readFile(flags.bodyFile, 'utf8')
  if (flags.bodyStdin) return await readStdin()
  throw new Error('one of --body, --body-file, or --body-stdin is required')
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => (data += chunk))
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', reject)
  })
}

/** Parse repeated `--header "K: V"` into a header map (HTTP/auth headers). */
export function parseHeaders(specs: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const spec of specs) {
    const idx = spec.indexOf(':')
    if (idx < 0) throw new Error(`Invalid --header "${spec}": expected "Key: Value"`)
    const key = spec.slice(0, idx).trim()
    const val = spec.slice(idx + 1).trim()
    if (!key) throw new Error(`Invalid --header "${spec}": empty key`)
    out[key] = val
  }
  return out
}

/** Parse repeated `--attach filename=path` into base64 attachments. */
export async function parseAttachments(
  specs: string[],
): Promise<{ filename: string; content: string }[]> {
  const out: { filename: string; content: string }[] = []
  for (const spec of specs) {
    const idx = spec.indexOf('=')
    if (idx < 0) throw new Error(`Invalid --attach "${spec}": expected "filename=path"`)
    const filename = spec.slice(0, idx).trim()
    const path = spec.slice(idx + 1).trim()
    if (!filename) throw new Error(`Invalid --attach "${spec}": empty filename`)
    const buf = await readFile(path)
    out.push({ filename, content: buf.toString('base64') })
  }
  return out
}

function fail(message: string): number {
  console.error(`error: ${message}`)
  return 1
}
