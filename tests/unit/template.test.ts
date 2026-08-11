import { describe, it, expect } from 'vitest'
import {
  escapeHtml,
  renderTemplate,
  actionBlock,
  renderEmailCard,
  DEFAULT_TEMPLATE,
} from '../../src/template'

describe('escapeHtml', () => {
  it('escapes the five significant characters', () => {
    expect(escapeHtml(`<a href="x" data-y='z'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; data-y=&#39;z&#39;&gt;&amp;&lt;/a&gt;',
    )
  })
  it('leaves safe text untouched', () => {
    expect(escapeHtml('hello world 123')).toBe('hello world 123')
  })
})

describe('renderTemplate', () => {
  it('escapes escaped vars and inserts raw vars verbatim', () => {
    const out = renderTemplate(
      'T={{TITLE}} B={{BODY}}',
      { TITLE: '<b>' },
      { BODY: '<i>raw</i>' },
    )
    expect(out).toBe('T=&lt;b&gt; B=<i>raw</i>')
  })
  it('leaves unmapped tokens untouched', () => {
    expect(renderTemplate('a={{A}} b={{B}}', { A: '1' })).toBe('a=1 b={{B}}')
  })
})

describe('actionBlock', () => {
  it('is empty when label or url missing', () => {
    expect(actionBlock({ title: 't', bodyHtml: 'b' })).toBe('')
    expect(actionBlock({ title: 't', bodyHtml: 'b', actionLabel: 'Go' })).toBe('')
  })
  it('builds an escaped CTA when both present', () => {
    const html = actionBlock({
      title: 't',
      bodyHtml: 'b',
      actionLabel: 'Click "Here"',
      actionUrl: 'https://x.com/a?b=c&d',
    })
    expect(html).toContain('href="https://x.com/a?b=c&amp;d"')
    expect(html).toContain('Click &quot;Here&quot;')
    expect(html).toContain('target="_blank"')
  })
})

describe('renderEmailCard', () => {
  it('substitutes all tokens with sensible defaults', () => {
    const html = renderEmailCard({ title: 'Welcome', bodyHtml: '<p>Hi</p>' })
    expect(html).toContain('<title>Welcome</title>')
    expect(html).toContain('>Welcome<') // h1
    expect(html).toContain('<p>Hi</p>') // body raw
    expect(html).toContain('>email-poster<') // default brand title
    expect(html).toContain('Sent via email-poster') // default footer
    expect(html).toContain('prefers-color-scheme: dark') // dark mode embedded
  })

  it('honors opts and custom template', () => {
    const html = renderEmailCard(
      { title: 'T', bodyHtml: 'B', preheader: 'Preview', actionLabel: 'Go', actionUrl: 'https://a.b' },
      { brandTitle: 'Acme', logo: 'https://a.b/logo.png', footerHtml: 'custom footer', year: 2030 },
    )
    expect(html).toContain('Preview') // preheader (escaped, but no special chars)
    expect(html).toContain('>Acme<')
    expect(html).toContain('src="https://a.b/logo.png"')
    expect(html).toContain('custom footer')
    expect(html).not.toContain('© 2030') // default footer overridden → its year text absent
    expect(html).toContain('>Go<') // CTA label in action block
  })

  it('uses a custom template when provided', () => {
    const out = renderEmailCard(
      { title: 'Hi', bodyHtml: 'Body' },
      {},
      'TITLE=[{{TITLE}}] BODY=[{{BODY}}] BRAND=[{{BRAND_TITLE}}]',
    )
    expect(out).toBe('TITLE=[Hi] BODY=[Body] BRAND=[email-poster]')
  })

  it('escapes title content', () => {
    const out = renderEmailCard({ title: '<script>', bodyHtml: 'x' }, {}, 'T={{TITLE}}')
    expect(out).toBe('T=&lt;script&gt;')
  })

  it('DEFAULT_TEMPLATE is non-empty and well-formed', () => {
    expect(DEFAULT_TEMPLATE.length).toBeGreaterThan(500)
    expect(DEFAULT_TEMPLATE).toContain('<!DOCTYPE html>')
    // {{YEAR}} is provided to custom templates; the default template bakes the
    // year into its default footer string instead.
    for (const tok of ['{{TITLE}}', '{{BODY}}', '{{ACTION_BLOCK}}', '{{LOGO}}', '{{BRAND_TITLE}}', '{{FOOTER_HTML}}', '{{PREHEADER}}']) {
      expect(DEFAULT_TEMPLATE).toContain(tok)
    }
  })
})
