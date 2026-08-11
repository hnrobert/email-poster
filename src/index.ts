/**
 * email-poster
 * Schema-driven email sending over HTTP POST webhooks.
 * @license Apache-2.0
 */

// Core class & singleton
export { EmailPoster } from './poster'
export { configure, getDefaultPoster, resetDefaultPoster, send } from './singleton'

// Schemas & types
export {
  EmailPosterConfigSchema,
  FieldMapSchema,
  RetryConfigSchema,
  UrlGuardSchema,
  PRESETS,
  resolveFieldMap,
  type EmailPosterConfig,
  type EmailPosterConfigInput,
  type FieldMap,
  type RetryConfig,
  type UrlGuardConfig,
  type PresetName,
} from './config'
export {
  SendMailInputSchema,
  AttachmentSchema,
  EMAIL_RE,
  normalizeRecipients,
  type SendMailInput,
  type Attachment,
  type RecipientInput,
} from './input'

// Results & options
export type { SendOptions, SendResult } from './types'

// Building blocks
export { buildPayload } from './payload'
export { extractMessageId, synthMessageId } from './message-id'
export { isSuccessStatus, doPost } from './http'
export type { DoPostOptions, DoPostResult } from './http'
export { composeSignals, isAbortError } from './abort'
export { computeBackoff, isRetryableFailure } from './retry'
export type { RetryableFailure } from './retry'
export { checkUrl } from './url-guard'
export { slidingWindow, tokenBucket } from './rate-limit'
export type { RateLimiter } from './rate-limit'

// Hooks
export {
  runBeforeSend,
  runAfterSend,
  runOnError,
  type Hooks,
  type HookContext,
  type BeforeSendResult,
  type BeforeSendHook,
  type AfterSendContext,
  type AfterSendHook,
  type ErrorContext,
  type ErrorHook,
} from './hooks'

// Env loader
export { loadEnvConfig } from './env'

// Errors
export { EmailPosterError, ErrorCode, isEmailPosterError } from './errors'
