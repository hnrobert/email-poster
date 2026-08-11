/**
 * Hono — expose a POST /mail route that sends via email-poster.
 */
import { Hono } from 'hono'
import { EmailPoster, createMailRoute } from 'email-poster/adapters/hono'

const poster = new EmailPoster({
  postUrl: process.env.MAIL_WEBHOOK_URL!,
  preset: 'smtogo',
  fromAddress: 'noreply@example.com',
  headers: { Authorization: `Bearer ${process.env.MAIL_TOKEN}` },
})

const app = new Hono()
// POST /mail { "to": "a@b.c", "subject": "Hi", "body": "<b>x</b>" }
//   → 200 { "ok": true, "messageId": "...", "status": 200 }
//   → 400 on invalid input/SSRF, 502 on downstream failure
app.post('/mail', createMailRoute(poster))

export default app
