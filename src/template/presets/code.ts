/**
 * `code` preset — verification / OTP codes: a large monospace hero code,
 * optional lead + hint, optional CTA (magic link / reset button).
 * @license Apache-2.0
 */
import { renderTemplate, themedActionBlock, currentYear } from '../render'
import { composeShellTemplate, shellVars } from '../shell'
import { resolveTheme } from '../theme'
import type { EmailTheme } from '../theme'

/** Content for a `code` email. */
export interface CodeEmailContent {
  /** The code itself (escaped, rendered letter-spaced). */
  code: string
  /** Heading above the code (escaped). Defaults to `'Your verification code'`. */
  title?: string
  /** Optional paragraph between heading and code (raw, trusted HTML). */
  leadHtml?: string
  /** Optional paragraph after the code, e.g. expiry note (raw, trusted HTML). */
  hintHtml?: string
  /** Optional CTA button; rendered only when both label and url are present. */
  actionLabel?: string
  actionUrl?: string
  /** Hidden inbox preview text (escaped). */
  preheader?: string
}

const CONTENT = `<h1 class="ink" style="margin: 0 0 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 22px; line-height: 1.3; color: #0a0a0a;">{{TITLE}}</h1>
                {{LEAD_HTML}}
                <div class="well" style="margin: 24px 0; padding: 24px 12px 20px; text-align: center; background-color: #fafafa; border: 1px solid #e5e5e5; border-radius: 10px;">
                  <span class="ink" style="font-family: 'SF Mono', SFMono-Regular, ui-monospace, 'DejaVu Sans Mono', Menlo, Consolas, monospace; font-size: 36px; font-weight: 700; letter-spacing: 10px; color: #0a0a0a;">{{CODE}}</span>
                </div>
                {{HINT_HTML}}
                {{ACTION_BLOCK}}`

/** Full `code` document: {@link EMAIL_SHELL} with the code fragment spliced in. */
export const CODE_TEMPLATE = composeShellTemplate(CONTENT)

/** Render a `code` email. See {@link CodeEmailContent} for the content model. */
export function renderCodeEmail(
  c: CodeEmailContent,
  theme: EmailTheme = {},
  template: string = CODE_TEMPLATE,
): string {
  const t = resolveTheme(theme, currentYear)
  const sv = shellVars(t)
  return renderTemplate(
    template,
    {
      ...sv.escaped,
      TITLE: c.title ?? 'Your verification code',
      CODE: c.code,
      PREHEADER: c.preheader ?? '',
    },
    {
      ...sv.raw,
      LEAD_HTML: c.leadHtml ?? '',
      HINT_HTML: c.hintHtml ?? '',
      ACTION_BLOCK: themedActionBlock(c.actionLabel ?? '', c.actionUrl ?? '', t.primaryColor),
    },
  )
}
