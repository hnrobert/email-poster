/**
 * Nuxt 3 — read mail config from runtimeConfig, cache by postUrl.
 *
 * nuxt.config.ts:
 *   runtimeConfig: { emailPoster: { postUrl, preset, fromAddress, headers: { Authorization } } }
 */
// server/api/send-mail.post.ts
import { useEmailPoster } from 'email-poster/adapters/nuxt'
import { z } from 'zod'

const Body = z.object({ to: z.string(), subject: z.string().min(1), body: z.string() })

export default defineEventHandler(async (event) => {
  const input = await Body.parseAsync(await readBody(event))
  const mail = await useEmailPoster()
  const res = await mail.send(input)
  return { ok: true, messageId: res.messageId, status: res.status }
})
