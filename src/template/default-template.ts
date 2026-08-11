/**
 * The default themed HTML email template. Ported from
 * unnc-freshmen-verifier-gateway/email/template.html, generalized so it is not
 * branded to one site: {{BRAND_TITLE}} and {{FOOTER_HTML}} are caller-supplied.
 *
 * Tokens: {{PREHEADER}} {{TITLE}} {{BODY}} {{ACTION_BLOCK}} {{YEAR}} {{LOGO}}
 *         {{BRAND_TITLE}} {{FOOTER_HTML}}
 * Light by default, dark via prefers-color-scheme (neutral palette).
 */
export const DEFAULT_TEMPLATE = `<!DOCTYPE html>
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
      }
      /* Narrow screens: shrink the brand title instead of letting it wrap. */
      @media (max-width: 480px) {
        .brand-title { font-size: 12px !important; }
      }
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
                    <td style="vertical-align: middle; width: 32px;">
                      <img src="{{LOGO}}" width="32" height="32" alt="" style="display: block; width: 32px; height: 32px; border-radius: 8px;" />
                    </td>
                    <td style="vertical-align: middle; padding-left: 10px; white-space: nowrap;">
                      <span class="ink brand-title" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 600; color: #0a0a0a;">{{BRAND_TITLE}}</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <!-- Content -->
            <tr>
              <td style="padding: 28px;">
                <h1 class="ink" style="margin: 0 0 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 22px; line-height: 1.3; color: #0a0a0a;">{{TITLE}}</h1>
                <div class="body-ink" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.65; color: #404040;">{{BODY}}</div>
                {{ACTION_BLOCK}}
              </td>
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
