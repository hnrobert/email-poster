/**
 * EMAIL_SHELL — the full-document skeleton shared by the preset templates.
 *
 * Unlike the frozen {@link DEFAULT_TEMPLATE} (kept byte-identical for
 * back-compat), the shell fixes the old wart where a missing logo still
 * rendered an empty `<img src="">`: here the whole logo cell is the
 * {{LOGO_BLOCK}} token, inserted only when a logo is set.
 *
 * Tokens used by the shell itself (escaped: PREHEADER, TITLE, BRAND_TITLE;
 * raw/built: BRAND_SUBTITLE, LOGO_BLOCK, CONTENT, FOOTER_HTML, EXTRA_CSS):
 *   {{PREHEADER}}       hidden inbox preview text
 *   {{TITLE}}           <title> + preset heading text
 *   {{BRAND_TITLE}}     header brand name
 *   {{BRAND_SUBTITLE}}  optional muted line under the brand (a built <div>, or '')
 *   {{LOGO_BLOCK}}      optional header <td><img></td>, or ''
 *   {{CONTENT}}         the preset's content fragment (card body region)
 *   {{FOOTER_HTML}}     footer inner HTML
 *   {{EXTRA_CSS}}       caller CSS appended inside <style>
 * {@link shellVars} additionally provides {{PRIMARY_COLOR}} / {{PRIMARY_INK}}
 * (whitelisted hex + auto-contrast foreground) for custom shells that want
 * theme-colored chrome; the stock shell leaves them unused.
 *
 * Preset templates are produced by splicing their fragment into
 * {{CONTENT}} via {@link composeShellTemplate}. Light by default, dark via
 * prefers-color-scheme (same class strategy as DEFAULT_TEMPLATE).
 * @license Apache-2.0
 */
import { escapeHtml } from './render'
import type { ResolvedEmailTheme } from './theme'
import type { TemplateVars } from './types'

export const EMAIL_SHELL = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>{{TITLE}}</title>
    <style>
      /* Dark mode — neutral palette (light surface → near-black surface). */
      @media (prefers-color-scheme: dark) {
        .bg { background-color: #0a0a0a !important; color: #0a0a0a !important; }
        .surface { background-color: #171717 !important; border-color: #232323 !important; }
        .rule { border-color: #232323 !important; }
        .ink { color: #fafafa !important; }
        .body-ink { color: #d4d4d4 !important; }
        .muted { color: #a1a1a1 !important; }
        .well { background-color: #171717 !important; border-color: #262626 !important; }
        .alert { background-color: #171717 !important; }
      }
      /* Narrow screens: shrink the brand title instead of letting it wrap. */
      @media (max-width: 480px) {
        .brand-title { font-size: 12px !important; }
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
          <table role="presentation" class="surface" width="600" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 600px; background-color: #ffffff; border: 1px solid #e5e5e5; border-radius: 14px; overflow: hidden;">
            <!-- Brand header: logo + title in a 2-cell table so they stay locked
                 on one row (vertical-aligned) on narrow screens. -->
            <tr>
              <td class="rule" style="padding: 22px 28px; border-bottom: 1px solid #e5e5e5;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                  <tr>
                    {{LOGO_BLOCK}}<td style="vertical-align: middle; white-space: nowrap;">
                      <span class="ink brand-title" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 600; color: #0a0a0a;">{{BRAND_TITLE}}</span>
                      {{BRAND_SUBTITLE}}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <!-- Preset content -->
            <tr>
              <td style="padding: 28px;">{{CONTENT}}</td>
            </tr>
            <!-- Footer -->
            <tr>
              <td class="rule" style="padding: 20px 28px; border-top: 1px solid #e5e5e5;">
                <p class="muted" style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.5; color: #737373;">
                  {{FOOTER_HTML}}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`

/**
 * Splice a preset content fragment into {@link EMAIL_SHELL}'s {{CONTENT}}
 * slot, producing a full preset document template. (split/join, not
 * String.replace, so `$&`-style patterns in the fragment stay literal.)
 */
export function composeShellTemplate(content: string): string {
  return EMAIL_SHELL.split('{{CONTENT}}').join(content)
}

/**
 * Theme-derived token maps for {@link EMAIL_SHELL} (and any template composed
 * from it). Preset renderers merge these with their content tokens and run a
 * single {@link renderTemplate} pass over the full document.
 */
export function shellVars(theme: ResolvedEmailTheme): {
  escaped: TemplateVars
  raw: TemplateVars
} {
  return {
    escaped: { BRAND_TITLE: theme.brandTitle },
    raw: {
      BRAND_SUBTITLE: theme.brandSubtitle
        ? `<div class="muted" style="margin-top: 2px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.4; color: #737373;">${escapeHtml(theme.brandSubtitle)}</div>`
        : '',
      LOGO_BLOCK: theme.logo
        ? `<td style="vertical-align: middle; width: 32px; padding-right: 10px;"><img src="${escapeHtml(theme.logo)}" width="32" height="32" alt="" style="display: block; width: 32px; height: 32px; border-radius: 8px;" /></td>`
        : '',
      FOOTER_HTML: theme.footerHtml,
      PRIMARY_COLOR: theme.primaryColor,
      PRIMARY_INK: theme.primaryInk,
      EXTRA_CSS: theme.extraCss,
    },
  }
}
