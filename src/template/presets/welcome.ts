/**
 * `welcome` preset — onboarding / announcement: centered badge pill, optional
 * title icon, heading, hero image, body, and CTA.
 * @license Apache-2.0
 */
import { escapeHtml, renderTemplate, themedActionBlock, currentYear } from '../render'
import { composeShellTemplate, shellVars } from '../shell'
import { resolveTheme } from '../theme'
import type { EmailTheme } from '../theme'

/** Content for a `welcome` email. */
export interface WelcomeEmailContent {
  /** Centered heading (escaped). Defaults to `'Welcome'`. */
  title?: string
  /** Small pill above the heading, filled with the primary color (escaped). */
  badgeText?: string
  /** Small icon above the heading (URL, attribute-escaped). */
  titleIconUrl?: string
  /** Wide image under the heading (URL, attribute-escaped). */
  heroImageUrl?: string
  /** Main body (raw, trusted HTML). */
  bodyHtml: string
  /** Optional CTA button; rendered only when both label and url are present. */
  actionLabel?: string
  actionUrl?: string
  /** Hidden inbox preview text (escaped). */
  preheader?: string
}

const CONTENT = `<div style="text-align: center;">
                  {{BADGE_BLOCK}}
                  {{TITLE_ICON_BLOCK}}
                  <h1 class="ink" style="margin: 12px 0 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 24px; line-height: 1.3; color: #0a0a0a;">{{TITLE}}</h1>
                  {{HERO_IMAGE_BLOCK}}
                </div>
                <div class="body-ink" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.65; color: #404040;">{{BODY}}</div>
                <div align="center">{{ACTION_BLOCK}}</div>`

/** Full `welcome` document: {@link EMAIL_SHELL} with the welcome fragment spliced in. */
export const WELCOME_TEMPLATE = composeShellTemplate(CONTENT)

/** Render a `welcome` email. See {@link WelcomeEmailContent} for the content model. */
export function renderWelcomeEmail(
  c: WelcomeEmailContent,
  theme: EmailTheme = {},
  template: string = WELCOME_TEMPLATE,
): string {
  const t = resolveTheme(theme, currentYear)
  const sv = shellVars(t)
  return renderTemplate(
    template,
    { ...sv.escaped, TITLE: c.title ?? 'Welcome', PREHEADER: c.preheader ?? '' },
    {
      ...sv.raw,
      BODY: c.bodyHtml,
      BADGE_BLOCK: c.badgeText
        ? `<div style="margin-bottom: 4px;"><span style="display: inline-block; padding: 4px 12px; background-color: ${t.primaryColor}; color: ${t.primaryInk}; border-radius: 999px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 600; letter-spacing: 0.4px;">${escapeHtml(c.badgeText)}</span></div>`
        : '',
      TITLE_ICON_BLOCK: c.titleIconUrl
        ? `<img src="${escapeHtml(c.titleIconUrl)}" width="48" height="48" alt="" style="display: inline-block; width: 48px; height: 48px;" />`
        : '',
      HERO_IMAGE_BLOCK: c.heroImageUrl
        ? `<img src="${escapeHtml(c.heroImageUrl)}" width="480" alt="" style="display: block; width: 100%; max-width: 480px; height: auto; margin: 0 auto; border-radius: 10px;" />`
        : '',
      ACTION_BLOCK: themedActionBlock(c.actionLabel ?? '', c.actionUrl ?? '', t.primaryColor),
    },
  )
}
