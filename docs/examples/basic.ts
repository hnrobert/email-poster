/**
 * Minimal: send one email with the smtogo preset.
 * Run: npx tsx docs/examples/basic.ts
 */
import { EmailPoster } from '../../src/index'

async function main(): Promise<void> {
  const mail = new EmailPoster({
    postUrl: process.env.MAIL_WEBHOOK_URL ?? 'https://httpbin.org/post',
    preset: 'smtogo',
    fromAddress: 'noreply@example.com',
    headers: { Authorization: 'Bearer ' + (process.env.MAIL_TOKEN ?? 'token') },
  })

  const res = await mail.send({
    to: 'a@b.c',
    subject: 'Hello from email-poster',
    body: '<p>It <b>works</b>.</p>',
  })
  console.log('sent:', res.messageId, '(status', res.status + ')')
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
