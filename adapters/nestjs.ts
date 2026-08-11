/**
 * email-poster/adapters/nestjs — NestJS provider recipe (no @nestjs/common dep).
 * @license Apache-2.0
 *
 * Spread {@link emailPosterProviders} into a `@Module({ providers })` and inject
 * `EmailPosterService`. Because the service is built via `useFactory`, it needs
 * no `@Injectable()` decoration on this class — Nest instantiates it for you:
 *
 * ```ts
 * @Module({ providers: emailPosterProviders(config), exports: [EmailPosterService] })
 * export class MailModule {}
 * ```
 */
import { EmailPoster } from '../src/poster'
import type { EmailPosterConfigInput } from '../src/config'
import type { SendMailInput } from '../src/input'
import type { SendOptions, SendResult } from '../src/types'

/** DI token carrying the raw config object. */
export const EMAIL_POSTER_CONFIG = 'EMAIL_POSTER_CONFIG'

/** Thin service wrapping an {@link EmailPoster}; `send` is bound (safe to inject by name). */
export class EmailPosterService {
  readonly poster: EmailPoster
  constructor(config: EmailPosterConfigInput) {
    this.poster = new EmailPoster(config)
  }
  send = (input: SendMailInput, opts?: SendOptions): Promise<SendResult> =>
    this.poster.send(input, opts)
  validate = (input: SendMailInput): void => this.poster.validate(input)
}

/** A plain Nest `Provider` entry shape (typed loosely to avoid a @nestjs/common dep). */
export interface ProviderEntry {
  provide: string | symbol | object
  useValue?: unknown
  useFactory?: (...args: any[]) => unknown
  inject?: any[]
}

/** Build the Nest provider entries (config token + service via factory). */
export function emailPosterProviders(config: EmailPosterConfigInput): ProviderEntry[] {
  return [
    { provide: EMAIL_POSTER_CONFIG, useValue: config },
    {
      provide: EmailPosterService,
      useFactory: (cfg: EmailPosterConfigInput) => new EmailPosterService(cfg),
      inject: [EMAIL_POSTER_CONFIG],
    },
  ]
}
