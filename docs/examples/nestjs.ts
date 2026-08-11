/**
 * NestJS — providers + an injectable service.
 */
import { Inject, Injectable, Module } from '@nestjs/common'
import {
  EMAIL_POSTER_CONFIG,
  EmailPosterService,
  emailPosterProviders,
} from 'email-poster/adapters/nestjs'
import type { SendResult } from 'email-poster'

@Module({
  providers: emailPosterProviders({
    postUrl: process.env.MAIL_WEBHOOK_URL!,
    preset: 'custom_example',
    headers: { Authorization: `Bearer ${process.env.MAIL_TOKEN}` },
  }),
  exports: [EmailPosterService],
})
export class MailModule {}

@Injectable()
export class WelcomeService {
  constructor(@Inject(EmailPosterService) private readonly mail: EmailPosterService) {}

  async sendWelcome(to: string): Promise<SendResult> {
    return this.mail.send({ to, subject: 'Welcome', body: '<p>Hello!</p>' })
  }
}
