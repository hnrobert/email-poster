import type { SendMailInput } from './input'
import type { EmailPosterConfig } from './config'
import type { SendResult } from './types'

export interface HookContext {
  input: SendMailInput
  payload: Record<string, unknown>
  headers: Record<string, string>
  config: EmailPosterConfig
}

export interface BeforeSendResult {
  payload: Record<string, unknown>
  headers: Record<string, string>
}

export interface AfterSendContext {
  result: SendResult
}

export interface ErrorContext {
  error: Error
  input: SendMailInput
  payload: Record<string, unknown>
  headers: Record<string, string>
}

export type BeforeSendHook = (
  ctx: HookContext,
) => Promise<BeforeSendResult | void> | BeforeSendResult | void
export type AfterSendHook = (ctx: AfterSendContext) => Promise<void> | void
export type ErrorHook = (ctx: ErrorContext) => Promise<void> | void

export interface Hooks {
  beforeSend?: BeforeSendHook
  afterSend?: AfterSendHook
  onError?: ErrorHook
}

/** Run beforeSend; apply returned {payload,headers} or keep originals. Hook errors are swallowed. */
export async function runBeforeSend(
  hook: BeforeSendHook,
  ctx: HookContext,
): Promise<BeforeSendResult> {
  try {
    const r = await hook(ctx)
    if (r && (r.payload !== undefined || r.headers !== undefined)) {
      return { payload: r.payload ?? ctx.payload, headers: r.headers ?? ctx.headers }
    }
    return { payload: ctx.payload, headers: ctx.headers }
  } catch (e) {
    console.warn('[email-poster] beforeSend hook threw:', e)
    return { payload: ctx.payload, headers: ctx.headers }
  }
}

export async function runAfterSend(hook: AfterSendHook, ctx: AfterSendContext): Promise<void> {
  try {
    await hook(ctx)
  } catch (e) {
    console.warn('[email-poster] afterSend hook threw:', e)
  }
}

export async function runOnError(hook: ErrorHook, ctx: ErrorContext): Promise<void> {
  try {
    await hook(ctx)
  } catch (e) {
    console.warn('[email-poster] onError hook threw:', e)
  }
}
