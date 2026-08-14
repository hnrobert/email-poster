import { describe, it, expect } from 'vitest'
import {
  readableForeground,
  safeColor,
  DEFAULT_PRIMARY_COLOR,
  renderCardEmail,
  renderCodeEmail,
  renderWelcomeEmail,
  renderReceiptEmail,
  renderAlertEmail,
  renderPlainEmail,
  renderEmail,
  EMAIL_TEMPLATES,
  CARD_TEMPLATE,
  CODE_TEMPLATE,
  WELCOME_TEMPLATE,
  RECEIPT_TEMPLATE,
  ALERT_TEMPLATE,
  PLAIN_TEMPLATE,
  EMAIL_SHELL,
} from '../../src/template'

describe('readableForeground', () => {
  it('picks dark ink for light backgrounds and light ink for dark ones', () => {
    expect(readableForeground('#F7D447')).toBe('#1c1917') // house yellow → dark
    expect(readableForeground('#0a0a0a')).toBe('#fafafa')
    expect(readableForeground('#ffffff')).toBe('#1c1917')
    expect(readableForeground('#2563eb')).toBe('#fafafa') // saturated blue → light
  })
  it('supports 3-digit hex and 8-digit hex (alpha ignored)', () => {
    expect(readableForeground('#fff')).toBe('#1c1917')
    expect(readableForeground('#000')).toBe('#fafafa')
    expect(readableForeground('#F7D447CC')).toBe('#1c1917')
  })
  it('falls back to dark ink on garbage input', () => {
    expect(readableForeground('javascript:alert(1)')).toBe('#1c1917')
    expect(readableForeground('')).toBe('#1c1917')
    expect(readableForeground('#zzz')).toBe('#1c1917')
  })
})

describe('safeColor', () => {
  it('passes whitelisted hex forms through (case-insensitive)', () => {
    expect(safeColor('#F7D447')).toBe('#F7D447')
    expect(safeColor('#fff')).toBe('#fff')
    expect(safeColor('#2563EB')).toBe('#2563EB')
    expect(safeColor('#2563eb80')).toBe('#2563eb80')
  })
  it('rejects everything else, falling back to the default primary', () => {
    expect(safeColor('red')).toBe(DEFAULT_PRIMARY_COLOR)
    expect(safeColor('rgb(1,2,3)')).toBe(DEFAULT_PRIMARY_COLOR)
    expect(safeColor('#F7D447; } body { display:none')).toBe(DEFAULT_PRIMARY_COLOR)
    expect(safeColor(undefined)).toBe(DEFAULT_PRIMARY_COLOR)
  })
})

describe('shell composition (cross-cutting)', () => {
  const templates: [string, string][] = [
    ['card', CARD_TEMPLATE],
    ['code', CODE_TEMPLATE],
    ['welcome', WELCOME_TEMPLATE],
    ['receipt', RECEIPT_TEMPLATE],
    ['alert', ALERT_TEMPLATE],
  ]
  it.each(templates)('%s template is a full document derived from EMAIL_SHELL', (_name, tpl) => {
    expect(tpl).toContain('<!DOCTYPE html>')
    expect(tpl).toContain('color-scheme')
    expect(tpl).toContain('prefers-color-scheme: dark')
    expect(tpl).toContain('{{EXTRA_CSS}}')
    expect(tpl).not.toContain('{{CONTENT}}') // spliced, not left behind
  })
  it('plain template is a standalone minimal document', () => {
    expect(PLAIN_TEMPLATE).toContain('<!DOCTYPE html>')
    expect(PLAIN_TEMPLATE).toContain('prefers-color-scheme: dark')
    expect(PLAIN_TEMPLATE).not.toContain('{{CONTENT}}')
  })
  it('EMAIL_SHELL contains the documented tokens', () => {
    for (const tok of [
      '{{PREHEADER}}', '{{TITLE}}', '{{BRAND_TITLE}}', '{{BRAND_SUBTITLE}}',
      '{{LOGO_BLOCK}}', '{{CONTENT}}', '{{FOOTER_HTML}}', '{{EXTRA_CSS}}',
    ]) {
      expect(EMAIL_SHELL).toContain(tok)
    }
  })
  it('extraCss lands inside <style> and theme colors reach the CTA', () => {
    const html = renderCardEmail(
      { title: 'T', bodyHtml: 'B', actionLabel: 'Go', actionUrl: 'https://a.b' },
      { primaryColor: '#2563eb', extraCss: '.x { color: rebeccapurple; }' },
    )
    const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'))
    expect(style).toContain('.x { color: rebeccapurple; }')
    // CTA button carries the (safe) primary color and its auto-contrast ink
    expect(html).toContain('bgcolor="#2563eb"')
    expect(html).toContain('color: #fafafa; text-decoration: none')
  })
  it('omits the logo <img> entirely when no logo is set', () => {
    const html = renderCardEmail({ title: 'T', bodyHtml: 'B' })
    expect(html).not.toContain('<img')
  })
})

describe('renderCardEmail', () => {
  it('renders title/body/preheader + default theme', () => {
    const html = renderCardEmail({
      title: 'Hello', bodyHtml: '<p>Hi</p>', preheader: 'Preview me',
    })
    expect(html).toContain('<title>Hello</title>')
    expect(html).toContain('<p>Hi</p>')
    expect(html).toContain('Preview me')
    expect(html).toContain('>email-poster<')
    expect(html).toContain('Sent via email-poster')
  })
  it('escapes title/preheader/brand; body stays raw', () => {
    const html = renderCardEmail(
      { title: '<script>', bodyHtml: '<i>ok</i>', preheader: 'a"b' },
      { brandTitle: 'A&B' },
    )
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('a&quot;b')
    expect(html).toContain('>A&amp;B<')
    expect(html).toContain('<i>ok</i>')
  })
  it('CTA both states: present with label+url, absent otherwise', () => {
    const withCta = renderCardEmail(
      { title: 'T', bodyHtml: 'B', actionLabel: 'Open "Inbox"', actionUrl: 'https://x.com/a?b=1&c=2' },
      { primaryColor: '#004400' },
    )
    expect(withCta).toContain('href="https://x.com/a?b=1&amp;c=2"')
    expect(withCta).toContain('Open &quot;Inbox&quot;')
    expect(withCta).toContain('bgcolor="#004400"')
    expect(withCta).toContain('color: #fafafa; text-decoration: none') // dark bg → light ink
    const noCta = renderCardEmail({ title: 'T', bodyHtml: 'B' })
    expect(noCta).not.toContain('target="_blank"')
  })
  it('accepts a custom template (tail-param escape hatch)', () => {
    const out = renderCardEmail({ title: 'Hi', bodyHtml: 'Body' }, {}, 'X={{TITLE}}|{{BODY}}')
    expect(out).toBe('X=Hi|Body')
  })
  it('renders logo + subtitle blocks when provided', () => {
    const html = renderCardEmail(
      { title: 'T', bodyHtml: 'B' },
      { logo: 'https://a.b/l.png', brandSubtitle: "Freshmen '24" },
    )
    expect(html).toContain('src="https://a.b/l.png"')
    expect(html).toContain('Freshmen &#39;24')
  })
})

describe('renderCodeEmail', () => {
  it('renders the code hero with default title', () => {
    const html = renderCodeEmail({ code: '123456' })
    expect(html).toContain('<title>Your verification code</title>')
    expect(html).toContain('>123456<')
    expect(html).toContain('letter-spacing: 10px')
  })
  it('optional lead/hint/action absent when not supplied', () => {
    const html = renderCodeEmail({ code: '000000' })
    expect(html).not.toContain('target="_blank"')
    expect(html).not.toContain('{{LEAD_HTML}}')
    expect(html).not.toContain('{{HINT_HTML}}')
  })
  it('renders lead/hint raw, code + title escaped, CTA themed', () => {
    const html = renderCodeEmail({
      code: '12<34>',
      title: 'Code "Now"',
      leadHtml: '<strong>For</strong> sign-in',
      hintHtml: '<p>Expires in 10 minutes</p>',
      actionLabel: 'Open app',
      actionUrl: 'https://app.x',
    }, { primaryColor: '#F7D447' })
    expect(html).toContain('>12&lt;34&gt;<')
    expect(html).toContain('Code &quot;Now&quot;')
    expect(html).toContain('<strong>For</strong> sign-in')
    expect(html).toContain('<p>Expires in 10 minutes</p>')
    expect(html).toContain('bgcolor="#F7D447"')
    expect(html).toContain('color: #1c1917; text-decoration: none') // yellow → dark ink
  })
})

describe('renderWelcomeEmail', () => {
  it('renders body + default title with no img/badge/CTA when optional fields absent', () => {
    const html = renderWelcomeEmail({ bodyHtml: '<p>You are in</p>' })
    expect(html).toContain('<title>Welcome</title>')
    expect(html).toContain('<p>You are in</p>')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('border-radius: 999px') // badge pill
    expect(html).not.toContain('target="_blank"')
  })
  it('renders badge/icon/hero/CTA when supplied (URLs attribute-escaped)', () => {
    const html = renderWelcomeEmail({
      badgeText: "New '26",
      titleIconUrl: 'https://a.b/i.png',
      heroImageUrl: 'https://a.b/h.png',
      bodyHtml: 'Hi',
      actionLabel: 'Get started',
      actionUrl: 'https://a.b/start',
    })
    expect(html).toContain('New &#39;26</span>')
    expect(html).toContain('src="https://a.b/i.png"')
    expect(html).toContain('src="https://a.b/h.png"')
    expect(html).toContain('>Get started<')
    // badge uses the theme primary + contrast ink
    expect(html).toContain(`background-color: ${DEFAULT_PRIMARY_COLOR}`)
    expect(html).toContain(`color: #1c1917`)
  })
})

describe('renderReceiptEmail', () => {
  it('renders rows + total, escaping labels and values', () => {
    const html = renderReceiptEmail({
      title: 'Your order <#42>',
      rows: [
        { label: 'Ticket', value: '¥120' },
        { label: 'A&B fee', value: 'x"y' },
      ],
      totalLabel: 'Total',
      totalValue: '¥120',
      noteHtml: '<em>Thanks!</em>',
    })
    expect(html).toContain('Your order &lt;#42&gt;')
    expect(html).toContain('>Ticket</td>')
    expect(html).toContain('>¥120</td>')
    expect(html).toContain('>A&amp;B fee</td>')
    expect(html).toContain('>x&quot;y</td>')
    expect(html).toContain('border-top: 2px solid #0a0a0a') // total row
    expect(html).toContain('<em>Thanks!</em>') // note raw
  })
  it('omits body/total/note/CTA when absent', () => {
    const html = renderReceiptEmail({ title: 'T', rows: [{ label: 'a', value: 'b' }] })
    expect(html).not.toContain('border-top: 2px solid #0a0a0a')
    expect(html).not.toContain('target="_blank"')
    expect(html).not.toContain('{{')
  })
})

describe('renderAlertEmail', () => {
  it('defaults to the info palette', () => {
    const html = renderAlertEmail({ title: 'Heads up', bodyHtml: 'Maintenance soon' })
    expect(html).toContain('background-color: #eff6ff')
    expect(html).toContain('border-left: 4px solid #2563eb')
  })
  it.each([
    ['success', '#f0fdf4', '#16a34a'],
    ['warning', '#fffbeb', '#d97706'],
    ['error', '#fef2f2', '#dc2626'],
  ] as const)('level %s uses its palette', (level, bg, border) => {
    const html = renderAlertEmail({ level, title: 'T', bodyHtml: 'B' })
    expect(html).toContain(`background-color: ${bg}`)
    expect(html).toContain(`border-left: 4px solid ${border}`)
  })
  it('escapes title + details, keeps body raw, CTA themed', () => {
    const html = renderAlertEmail({
      level: 'error',
      title: '<b>Failed</b>',
      bodyHtml: '<p>Job <code>x</code> failed</p>',
      details: ['Attempt 3 of 5', 'err: "timeout"'],
      actionLabel: 'View logs',
      actionUrl: 'https://a.b/logs',
    })
    expect(html).toContain('&lt;b&gt;Failed&lt;/b&gt;')
    expect(html).toContain('<p>Job <code>x</code> failed</p>')
    expect(html).toContain('<li>Attempt 3 of 5</li>')
    expect(html).toContain('<li>err: &quot;timeout&quot;</li>')
    expect(html).toContain('>View logs<')
  })
  it('no <ul> when details absent/empty', () => {
    expect(renderAlertEmail({ title: 'T', bodyHtml: 'B' })).not.toContain('<ul')
    expect(renderAlertEmail({ title: 'T', bodyHtml: 'B', details: [] })).not.toContain('<ul')
  })
})

describe('renderPlainEmail', () => {
  it('renders just the body (no card/header/footer chrome)', () => {
    const html = renderPlainEmail({ bodyHtml: '<p>plain & simple</p>', preheader: 'p' })
    expect(html).toContain('<p>plain & simple</p>')
    expect(html).toContain('>p<') // preheader
    expect(html).not.toContain('surface') // no card table
    expect(html).not.toContain('Sent via email-poster')
  })
  it('uses brand title as <title> and supports extraCss', () => {
    const html = renderPlainEmail(
      { bodyHtml: 'B' },
      { brandTitle: 'Acme', extraCss: 'p { margin: 0; }' },
    )
    expect(html).toContain('<title>Acme</title>')
    expect(html).toContain('p { margin: 0; }')
  })
})

describe('registry (renderEmail / EMAIL_TEMPLATES)', () => {
  it('EMAIL_TEMPLATES has all six presets as full documents', () => {
    expect(Object.keys(EMAIL_TEMPLATES).sort()).toEqual([
      'alert', 'card', 'code', 'plain', 'receipt', 'welcome',
    ])
    for (const tpl of Object.values(EMAIL_TEMPLATES)) {
      expect(tpl).toContain('<!DOCTYPE html>')
    }
  })
  it('dispatches by name with typed content', () => {
    expect(renderEmail('card', { title: 'T', bodyHtml: 'B' })).toContain('<title>T</title>')
    expect(renderEmail('code', { code: '9' })).toContain('>9<')
    expect(renderEmail('welcome', { bodyHtml: 'b' })).toContain('<title>Welcome</title>')
    expect(renderEmail('receipt', { title: 'T', rows: [] })).toContain('<title>T</title>')
    expect(renderEmail('alert', { title: 'T', bodyHtml: 'b' })).toContain('#eff6ff')
    expect(renderEmail('plain', { bodyHtml: 'b' })).toContain('>b<')
  })
  it('passes the theme through', () => {
    expect(renderEmail('card', { title: 'T', bodyHtml: 'B' }, { brandTitle: 'Zed' })).toContain('>Zed<')
  })
  it('throws TypeError for an unknown preset name', () => {
    expect(() => renderEmail('nope' as never, { bodyHtml: 'b' })).toThrow(TypeError)
    expect(() => renderEmail('nope' as never, { bodyHtml: 'b' })).toThrow(/Unknown email template preset/)
  })
})
