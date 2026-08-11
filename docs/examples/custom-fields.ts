/**
 * Custom field mapping + HTML template + before/after hooks.
 */
import { EmailPoster } from '../../src/index'
import { renderEmailCard } from '../../src/template/index'

const mail = new EmailPoster({
  postUrl: process.env.MAIL_WEBHOOK_URL ?? 'https://httpbin.org/post',
  fields: {
    to: 'recipient',
    subject: 'title',
    body: 'message', // single body key — works for both text and html
    type: 'format',
  },
  hooks: {
    beforeSend: async ({ payload, headers }) => ({
      payload: { ...payload, timestamp: new Date().toISOString() },
      headers,
    }),
    afterSend: ({ result }) => console.log('delivered', result.messageId),
  },
})

await mail.send({
  to: 'a@b.c',
  subject: 'Welcome',
  body: renderEmailCard(
    { title: 'Welcome', bodyHtml: '<p>Thanks for signing up.</p>', actionLabel: 'Verify', actionUrl: 'https://x/v' },
    { brandTitle: 'Acme' },
  ),
  type: 'html',
})
