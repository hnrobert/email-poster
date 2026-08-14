/**
 * `card` preset — the classic title + body + CTA email, themed.
 * Same layout as {@link renderEmailCard} but built on {@link EMAIL_SHELL}:
 * primary-color CTA, conditional logo, optional brand subtitle.
 * @license Apache-2.0
 */
import { renderTemplate, themedActionBlock, currentYear } from '../render'
import { composeShellTemplate, shellVars } from '../shell'
import { resolveTheme } from '../theme'
import type { EmailTheme } from '../theme'
import type { EmailCardContent } from '../types'

const CONTENT = `<h1 class="ink" style="margin: 0 0 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 22px; line-height: 1.3; color: #0a0a0a;">{{TITLE}}</h1>
                <div class="body-ink" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.65; color: #404040;">{{BODY}}</div>
                {{ACTION_BLOCK}}`

/** Full `card` document: {@link EMAIL_SHELL} with the card fragment spliced in. */
export const CARD_TEMPLATE = composeShellTemplate(CONTENT)

/** Render a `card` email. See {@link EmailCardContent} for the content model. */
export function renderCardEmail(
  c: EmailCardContent,
  theme: EmailTheme = {},
  template: string = CARD_TEMPLATE,
): string {
  const t = resolveTheme(theme, currentYear)
  const sv = shellVars(t)
  return renderTemplate(
    template,
    { ...sv.escaped, TITLE: c.title, PREHEADER: c.preheader ?? '' },
    {
      ...sv.raw,
      BODY: c.bodyHtml,
      ACTION_BLOCK: themedActionBlock(c.actionLabel ?? '', c.actionUrl ?? '', t.primaryColor),
    },
  )
}
