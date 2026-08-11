import { readFile } from 'node:fs/promises'
import { EmailPoster } from '../src/poster'
import { resolveFieldMap } from '../src/config'
import { buildPayload } from '../src/payload'
import { isEmailPosterError } from '../src/errors'
import type { SendMailInput } from '../src/input'
import { loadBaseConfig, deepMerge } from './config-loader'

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

  // Config layer: rc < env < --config file < flags.
  const base = await loadBaseConfig({ configPath: flags.config })
  const flagCfg: Record<string, unknown> = {}
  if (flags.preset) flagCfg.preset = flags.preset
  if (flags.url) flagCfg.postUrl = flags.url
  if (flags.timeoutMs !== undefined) flagCfg.timeoutMs = flags.timeoutMs
  if (Object.keys(headers).length) flagCfg.headers = headers

  let mail: EmailPoster
  try {
    mail = new EmailPoster(deepMerge(base, flagCfg))
  } catch (e) {
    return fail(isEmailPosterError(e) ? `${e.message} (${e.detail ?? e.code})` : String(e))
  }

  if (flags.dryRun) {
    const fm = resolveFieldMap(mail.config)
    const payload = buildPayload(input, mail.config)
    if (flags.json) {
      console.log(JSON.stringify({ fieldMap: fm, payload }, null, 2))
    } else {
      console.log('Field map:')
      console.log(JSON.stringify(fm, null, 2))
      console.log('\nPayload:')
      console.log(JSON.stringify(payload, null, 2))
    }
    return 0
  }

  try {
    const res = await mail.send(input)
    if (flags.json) {
      console.log(JSON.stringify({ ok: true, messageId: res.messageId, status: res.status }))
    } else {
      console.log(`✓ Sent (status ${res.status}). messageId=${res.messageId}`)
    }
    return 0
  } catch (e) {
    if (isEmailPosterError(e)) {
      return fail(`${e.message}${e.status ? ` (status ${e.status})` : ''}${e.detail ? ` — ${e.detail}` : ''}`)
    }
    return fail(e instanceof Error ? e.message : String(e))
  }
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
