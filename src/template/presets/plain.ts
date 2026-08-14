/**
 * `plain` preset — no card, no header, no footer: just the body on the page
 * background (transactional footgun-free fallback / text-heavy mail).
 * @license Apache-2.0
 */
import { renderTemplate, currentYear } from '../render'
import { resolveTheme } from '../theme'
import type { EmailTheme } from '../theme'

/** Content for a `plain` email. */
export interface PlainEmailContent {
  /** The whole visible body (raw, trusted HTML). */
  bodyHtml: string
  /** Hidden inbox preview text (escaped). */
  preheader?: string
}

/** Standalone minimal document (not composed from {@link EMAIL_SHELL}). */
export const PLAIN_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>{{TITLE}}</title>
    <style>
      @media (prefers-color-scheme: dark) {
        .bg { background-color: #0a0a0a !important; color: #0a0a0a !important; }
        .body-ink { color: #d4d4d4 !important; }
      }
      {{EXTRA_CSS}}
    </style>
  </head>
  <body class="bg" style="margin: 0; padding: 0; background-color: #fafafa; color: #fafafa;">
    <!-- preheader (hidden preview text) -->
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0">{{PREHEADER}}</div>

    <table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" style="background-color: #fafafa;">
      <tr>
        <td align="center" style="padding: 32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 600px;">
            <tr>
              <td class="body-ink" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.65; color: #404040;">{{BODY}}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`

/** Render a `plain` email. See {@link PlainEmailContent} for the content model. */
export function renderPlainEmail(
  c: PlainEmailContent,
  theme: EmailTheme = {},
  template: string = PLAIN_TEMPLATE,
): string {
  const t = resolveTheme(theme, currentYear)
  return renderTemplate(
    template,
    { TITLE: t.brandTitle, PREHEADER: c.preheader ?? '' },
    { BODY: c.bodyHtml, EXTRA_CSS: t.extraCss },
  )
}
