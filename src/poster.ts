import { pathToFileURL } from 'node:url'
import { readFile } from 'node:fs/promises'
import { EmailPosterConfigSchema, type EmailPosterConfig } from './config'
import { SendMailInputSchema, type SendMailInput } from './input'
import { validateInput } from './validate'
import { buildPayload } from './payload'
import { doPost } from './http'
import { checkUrl } from './url-guard'
import { extractMessageId } from './message-id'
import { EmailPosterError, ErrorCode } from './errors'
import {
  type Hooks,
  type HookContext,
  type ErrorContext,
  runBeforeSend,
  runAfterSend,
  runOnError,
} from './hooks'
import { loadEnvConfig } from './env'
import type { SendOptions, SendResult } from './types'

interface ZodIssueLike {
  path: (string | number)[]
  message: string
}

function formatZodError(issues: ZodIssueLike[]): string {
  return issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
}

/**
 * The main entry point. Construct with a validated config, then call `send()`.
 *
 * @example
 *   const mail = new EmailPoster({
 *     postUrl: process.env.MAIL_WEBHOOK_URL!,
 *     preset: 'smtogo',
 *     headers: { Authorization: `Bearer ${process.env.MAIL_TOKEN}` },
 *   })
 *   await mail.send({ to: 'a@b.c', subject: 'Hi', body: '<b>Hi</b>' })
 */
export class EmailPoster {
  readonly config: EmailPosterConfig

  constructor(config: unknown) {
    const parsed = EmailPosterConfigSchema.safeParse(config)
    if (!parsed.success) {
      throw new EmailPosterError('Invalid email-poster config', {
        code: ErrorCode.CONFIG_INVALID,
        detail: formatZodError(parsed.error.issues),
      })
    }
    this.config = parsed.data
  }

  /** Apply the opt-in URL guard (no-op unless `config.urlGuard` is set). */
  async ensureUrlSafe(): Promise<void> {
    if (this.config.urlGuard) await checkUrl(this.config.postUrl, this.config.urlGuard)
  }

  /** Validate input without sending. Throws EmailPosterError(VALIDATION_FAILED). */
  validate(input: SendMailInput): void {
    const parsed = SendMailInputSchema.safeParse(input)
    if (!parsed.success) {
      throw new EmailPosterError('Invalid email input', {
        code: ErrorCode.VALIDATION_FAILED,
        detail: formatZodError(parsed.error.issues),
      })
    }
    validateInput(parsed.data, this.config)
  }

  async send(input: SendMailInput, opts: SendOptions = {}): Promise<SendResult> {
    const parsed = SendMailInputSchema.safeParse(input)
    if (!parsed.success) {
      throw new EmailPosterError('Invalid email input', {
        code: ErrorCode.VALIDATION_FAILED,
        detail: formatZodError(parsed.error.issues),
      })
    }
    const validInput = parsed.data
    validateInput(validInput, this.config)

    await this.ensureUrlSafe()

    let payload = buildPayload(validInput, this.config)
    let headers: Record<string, string> = {
      ...this.config.headers,
      'Content-Type': 'application/json',
    }

    const hooks = this.config.hooks as Hooks | undefined
    if (hooks?.beforeSend) {
      const ctx: HookContext = { input: validInput, payload, headers, config: this.config }
      const r = await runBeforeSend(hooks.beforeSend, ctx)
      payload = r.payload
      headers = { ...r.headers, 'Content-Type': 'application/json' }
    }

    const timeoutMs = opts.timeoutMs ?? this.config.timeoutMs
    let httpResult
    try {
      httpResult = await doPost(this.config.postUrl, payload, headers, {
        timeoutMs,
        signal: opts.signal,
        retry: this.config.retry,
        successCodes: this.config.successCodes,
        onAttempt: opts.onAttempt,
      })
    } catch (e) {
      const err =
        e instanceof EmailPosterError
          ? e
          : new EmailPosterError('Send failed', { code: ErrorCode.REQUEST_FAILED, cause: e })
      if (hooks?.onError) {
        const ectx: ErrorContext = { error: err, input: validInput, payload, headers }
        await runOnError(hooks.onError, ectx)
      }
      throw err
    }

    const messageId = await extractMessageId(httpResult.response, this.config.parseMessageId)
    const sendResult: SendResult = {
      messageId,
      status: httpResult.status,
      response: httpResult.response,
      requestId: httpResult.requestId || undefined,
    }

    if (hooks?.afterSend) await runAfterSend(hooks.afterSend, { result: sendResult })

    return sendResult
  }

  /** Build an instance purely from `EMAIL_POSTER_*` environment variables. */
  static fromEnv(): EmailPoster {
    return new EmailPoster(loadEnvConfig())
  }

  /** Load config from a `.json` file or a `.js`/`.mjs` module (default export). */
  static async fromConfigFile(path: string): Promise<EmailPoster> {
    let data: unknown
    if (path.endsWith('.json')) {
      data = JSON.parse(await readFile(path, 'utf8'))
    } else {
      const mod = (await import(pathToFileURL(path).href)) as { default?: unknown }
      data = mod.default ?? mod
    }
    return new EmailPoster(data)
  }
}
