import { EMAIL_RE, normalizeRecipients, type SendMailInput } from './input'
import type { EmailPosterConfig } from './config'
import { EmailPosterError, ErrorCode } from './errors'

/**
 * Semantic validation beyond the Zod shape: recipient format, length caps,
 * and total recipient count. `to` must have at least one address. Length
 * caps are opt-in — unset limits (`undefined`, the default) are unlimited.
 */
export function validateInput(input: SendMailInput, config: EmailPosterConfig): void {
  const errors: string[] = []

  const to = normalizeRecipients(input.to)
  const cc = normalizeRecipients(input.cc)
  const bcc = normalizeRecipients(input.bcc)
  const all = [...to, ...cc, ...bcc]

  if (to.length === 0) errors.push('at least one recipient (to) is required')
  if (all.length > config.recipients.maxLength) {
    errors.push(`too many recipients (${all.length} > max ${config.recipients.maxLength})`)
  }
  for (const addr of all) {
    if (!EMAIL_RE.test(addr)) errors.push(`invalid recipient email: ${addr}`)
    const maxAddr = config.limits.maxLenRecipientEmail
    if (maxAddr !== undefined && addr.length > maxAddr) {
      errors.push(`recipient email too long (${addr.length} > ${maxAddr})`)
    }
  }
  const maxSubject = config.limits.maxLenSubject
  if (maxSubject !== undefined && input.subject.length > maxSubject) {
    errors.push(`subject too long (${input.subject.length} > ${maxSubject})`)
  }
  const maxBody = config.limits.maxLenBody
  if (maxBody !== undefined && input.body.length > maxBody) {
    errors.push(`body too long (${input.body.length} > ${maxBody})`)
  }

  if (errors.length > 0) {
    throw new EmailPosterError('Validation failed', {
      code: ErrorCode.VALIDATION_FAILED,
      detail: errors.join('; '),
    })
  }
}
