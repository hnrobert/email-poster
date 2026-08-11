import type { EmailPosterConfig, FieldMap } from './config'
import { resolveFieldMap } from './config'
import type { SendMailInput } from './input'
import { normalizeRecipients } from './input'
import { EmailPosterError, ErrorCode } from './errors'

type RecipientMode = 'comma' | 'array'

function serializeRecipients(
  v: string | string[] | undefined,
  mode: RecipientMode,
): string | string[] | undefined {
  const arr = normalizeRecipients(v)
  if (arr.length === 0) return undefined
  return mode === 'comma' ? arr.join(', ') : arr
}

/**
 * Build the downstream JSON payload from a logical input + resolved field map.
 * The declarative core that generalizes the three projects' `sendViaPost`.
 */
export function buildPayload(
  input: SendMailInput,
  config: EmailPosterConfig,
): Record<string, unknown> {
  const fm: FieldMap = resolveFieldMap(config)
  const mode = config.recipients.serialize
  // `type` defaults to 'html' once parsed; tolerate direct callers that omit it.
  const type = input.type ?? 'html'

  // Start from static `extra`; mapped fields override on collision.
  const payload: Record<string, unknown> = { ...(config.extra ?? {}) }

  const from = input.from ?? config.fromAddress
  if (fm.from && from) payload[fm.from] = from

  const placeRecipients = (key: string | undefined, value: string | string[] | undefined): void => {
    if (key && value !== undefined) payload[key] = value
  }
  placeRecipients(fm.to, serializeRecipients(input.to, mode))
  placeRecipients(fm.cc, serializeRecipients(input.cc, mode))
  placeRecipients(fm.bcc, serializeRecipients(input.bcc, mode))

  if (fm.replyTo && input.replyTo) payload[fm.replyTo] = input.replyTo
  if (fm.subject) payload[fm.subject] = input.subject
  if (fm.tagName && input.tagName) payload[fm.tagName] = input.tagName
  if (fm.headers && input.headers) payload[fm.headers] = input.headers

  // Body resolution.
  if (fm.body) {
    payload[fm.body] = input.body
    if (fm.type) payload[fm.type] = type
  } else if (fm.bodyHtml || fm.bodyText) {
    const key = type === 'html' ? fm.bodyHtml : fm.bodyText
    if (!key) {
      throw new EmailPosterError(
        `No ${type} body key configured for this field map`,
        {
          code: ErrorCode.VALIDATION_FAILED,
          detail: `type=${type} but the field map has no body${type === 'html' ? 'Html' : 'Text'} key`,
        },
      )
    }
    payload[key] = input.body
    if (fm.type) payload[fm.type] = type
  } else {
    throw new EmailPosterError('Field map has no body/bodyHtml/bodyText key', {
      code: ErrorCode.CONFIG_INVALID,
      detail: 'cannot place email body — configure fields.body or fields.bodyHtml/bodyText',
    })
  }

  // Attachments: opaque pass-through (content already base64).
  if (fm.attachments && input.attachments && input.attachments.length > 0) {
    payload[fm.attachments] = input.attachments
  }

  return payload
}
