/**
 * email-poster/template — HTML email template rendering (optional subpath).
 * Import via `import { renderCodeEmail } from 'email-poster/template'`.
 * @license Apache-2.0
 */

export { escapeHtml, renderTemplate, actionBlock, themedActionBlock, renderEmailCard, currentYear } from './render'
export { DEFAULT_TEMPLATE } from './default-template'
export { EMAIL_SHELL, composeShellTemplate, shellVars } from './shell'
export {
  DEFAULT_PRIMARY_COLOR,
  DARK_INK,
  LIGHT_INK,
  readableForeground,
  safeColor,
  resolveTheme,
} from './theme'
export { renderCardEmail, CARD_TEMPLATE } from './presets/card'
export { renderCodeEmail, CODE_TEMPLATE } from './presets/code'
export type { CodeEmailContent } from './presets/code'
export { renderWelcomeEmail, WELCOME_TEMPLATE } from './presets/welcome'
export type { WelcomeEmailContent } from './presets/welcome'
export { renderReceiptEmail, RECEIPT_TEMPLATE } from './presets/receipt'
export type { ReceiptEmailContent, ReceiptRow } from './presets/receipt'
export { renderAlertEmail, ALERT_TEMPLATE, ALERT_PALETTES } from './presets/alert'
export type { AlertEmailContent, AlertLevel } from './presets/alert'
export { renderPlainEmail, PLAIN_TEMPLATE } from './presets/plain'
export type { PlainEmailContent } from './presets/plain'
export { EMAIL_TEMPLATES, renderEmail } from './registry'
export type { EmailPresetName } from './registry'
export type {
  TemplateVars,
  EmailCardContent,
  RenderEmailCardOptions,
} from './types'
export type { EmailTheme, ResolvedEmailTheme } from './theme'
