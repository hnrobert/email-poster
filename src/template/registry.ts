/**
 * Registry of the preset HTML email templates.
 *
 * NOTE on terminology: these are **email body templates** (what the recipient
 * sees). They are unrelated to the webhook *post-schema presets* (`PRESETS`
 * in the main package), which describe the downstream JSON payload shape.
 * @license Apache-2.0
 */
import { renderCardEmail, CARD_TEMPLATE } from './presets/card'
import { renderCodeEmail, CODE_TEMPLATE } from './presets/code'
import { renderWelcomeEmail, WELCOME_TEMPLATE } from './presets/welcome'
import { renderReceiptEmail, RECEIPT_TEMPLATE } from './presets/receipt'
import { renderAlertEmail, ALERT_TEMPLATE } from './presets/alert'
import { renderPlainEmail, PLAIN_TEMPLATE } from './presets/plain'
import type { EmailTheme } from './theme'
import type { EmailCardContent } from './types'
import type { CodeEmailContent } from './presets/code'
import type { WelcomeEmailContent } from './presets/welcome'
import type { ReceiptEmailContent } from './presets/receipt'
import type { AlertEmailContent } from './presets/alert'
import type { PlainEmailContent } from './presets/plain'

/** Names of the preset HTML email templates. */
export type EmailPresetName = 'card' | 'code' | 'welcome' | 'receipt' | 'alert' | 'plain'

/** The preset templates, keyed by name (for listing / custom shells). */
export const EMAIL_TEMPLATES: Record<EmailPresetName, string> = {
  card: CARD_TEMPLATE,
  code: CODE_TEMPLATE,
  welcome: WELCOME_TEMPLATE,
  receipt: RECEIPT_TEMPLATE,
  alert: ALERT_TEMPLATE,
  plain: PLAIN_TEMPLATE,
}

/**
 * Render a preset email by name. Content type is inferred per name:
 * `card` → {@link EmailCardContent}, `code` → {@link CodeEmailContent},
 * `welcome` → {@link WelcomeEmailContent}, `receipt` → {@link ReceiptEmailContent},
 * `alert` → {@link AlertEmailContent}, `plain` → {@link PlainEmailContent}.
 * Throws `TypeError` for an unknown name.
 */
export function renderEmail(
  name: 'card',
  c: EmailCardContent,
  theme?: EmailTheme,
): string
export function renderEmail(name: 'code', c: CodeEmailContent, theme?: EmailTheme): string
export function renderEmail(name: 'welcome', c: WelcomeEmailContent, theme?: EmailTheme): string
export function renderEmail(name: 'receipt', c: ReceiptEmailContent, theme?: EmailTheme): string
export function renderEmail(name: 'alert', c: AlertEmailContent, theme?: EmailTheme): string
export function renderEmail(name: 'plain', c: PlainEmailContent, theme?: EmailTheme): string
export function renderEmail(name: string, c: unknown, theme?: EmailTheme): string {
  switch (name) {
    case 'card':
      return renderCardEmail(c as EmailCardContent, theme)
    case 'code':
      return renderCodeEmail(c as CodeEmailContent, theme)
    case 'welcome':
      return renderWelcomeEmail(c as WelcomeEmailContent, theme)
    case 'receipt':
      return renderReceiptEmail(c as ReceiptEmailContent, theme)
    case 'alert':
      return renderAlertEmail(c as AlertEmailContent, theme)
    case 'plain':
      return renderPlainEmail(c as PlainEmailContent, theme)
    default:
      throw new TypeError(
        `Unknown email template preset "${String(name)}". Expected one of: card, code, welcome, receipt, alert, plain.`,
      )
  }
}
