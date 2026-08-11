import { EmailPosterConfigSchema } from '../src/config'
import { readConfigFile } from './config-loader'

export interface ValidateFlags {
  config: string
  json?: boolean
}

/** `email-poster validate --config <path>` — Zod-check a config file. Exit 0/1. */
export async function runValidate(flags: ValidateFlags): Promise<number> {
  let data: unknown
  try {
    data = await readConfigFile(flags.config)
  } catch (e) {
    console.error(`error: cannot read config ${flags.config}: ${e instanceof Error ? e.message : String(e)}`)
    return 1
  }

  const result = EmailPosterConfigSchema.safeParse(data)
  if (result.success) {
    if (flags.json) {
      console.log(JSON.stringify({ ok: true, preset: result.data.preset ?? 'smtogo' }))
    } else {
      console.log(`✓ Config is valid (preset: ${result.data.preset ?? 'smtogo (default)'})`)
    }
    return 0
  }

  const issues = result.error.issues.map(
    (i) => `${i.path.join('.') || '(root)'}: ${i.message}`,
  )
  if (flags.json) {
    console.log(JSON.stringify({ ok: false, errors: issues }))
  } else {
    console.error('✗ Config is invalid:')
    for (const i of issues) console.error(`  ${i}`)
  }
  return 1
}
