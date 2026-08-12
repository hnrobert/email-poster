import { readFile } from 'node:fs/promises'
import { EmailPosterConfigSchema } from '../src/config'
import { exportInterface, exportPayloadSchema, detectInterface } from '../src/interface'
import { readConfigFile } from './config-loader'

export interface ExportInterfaceFlags {
  config: string
  /** Emit a derived standard JSON Schema (draft-07) of the payload instead of an InterfaceDef. */
  jsonSchema?: boolean
}

export interface DetectInterfaceFlags {
  /** Path to a sample downstream JSON instance (or JSON Schema) to infer a field map from. */
  input: string
}

/** `email-poster export-interface --config <path> [--json-schema]`. */
export async function runExportInterface(flags: ExportInterfaceFlags): Promise<number> {
  let data: unknown
  try {
    data = await readConfigFile(flags.config)
  } catch (e) {
    console.error(
      `error: cannot read config ${flags.config}: ${e instanceof Error ? e.message : String(e)}`,
    )
    return 1
  }

  const parsed = EmailPosterConfigSchema.safeParse(data)
  if (!parsed.success) {
    console.error('✗ Config is invalid:')
    for (const i of parsed.error.issues)
      console.error(`  ${i.path.join('.') || '(root)'}: ${i.message}`)
    return 1
  }

  const out = flags.jsonSchema ? exportPayloadSchema(parsed.data) : exportInterface(parsed.data)
  console.log(JSON.stringify(out, null, 2))
  return 0
}

/** `email-poster detect-interface --input <sample.json>`. */
export async function runDetectInterface(flags: DetectInterfaceFlags): Promise<number> {
  let raw: string
  try {
    raw = await readFile(flags.input, 'utf8')
  } catch (e) {
    console.error(
      `error: cannot read input ${flags.input}: ${e instanceof Error ? e.message : String(e)}`,
    )
    return 1
  }

  let sample: unknown
  try {
    sample = JSON.parse(raw)
  } catch (e) {
    console.error(
      `error: invalid JSON in ${flags.input}: ${e instanceof Error ? e.message : String(e)}`,
    )
    return 1
  }

  console.log(JSON.stringify(detectInterface(sample), null, 2))
  return 0
}
