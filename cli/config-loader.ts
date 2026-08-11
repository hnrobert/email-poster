import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadEnvConfig } from '../src/env'

export interface LoadConfigOptions {
  /** Explicit `--config <path>` file (highest non-flag source). */
  configPath?: string
  /** Project rc file path (default `.email-posterrc.json`). */
  rcPath?: string
  cwd?: string
}

/**
 * Load the non-flag config layer, merging (later wins, deep for nested objects):
 *   `.email-posterrc.json`  <  `EMAIL_POSTER_*` env  <  `--config <file>`
 * CLI flags are applied on top by the caller.
 */
export async function loadBaseConfig(
  opts: LoadConfigOptions = {},
): Promise<Record<string, unknown>> {
  const cwd = opts.cwd ?? process.cwd()
  const rc = await readRc(opts.rcPath ?? '.email-posterrc.json', cwd)
  const env = loadEnvConfig()
  const file = opts.configPath ? await readConfigFile(resolve(cwd, opts.configPath)) : {}
  return deepMerge(rc, env, file)
}

/** Read a `.json` rc file; returns `{}` if missing or invalid. */
async function readRc(path: string, cwd: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(resolve(cwd, path), 'utf8')
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** Read a config file: `.json` parsed directly; `.js`/`.mjs`/`.cjs` default-exported. */
export async function readConfigFile(path: string): Promise<Record<string, unknown>> {
  if (path.endsWith('.json')) {
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
  }
  const mod = (await import(pathToFileURL(path).href)) as { default?: unknown }
  return (mod.default ?? mod) as Record<string, unknown>
}

/**
 * Deep-merge plain objects (later sources win). Arrays and scalars are replaced
 * wholesale by the later source. `undefined` is skipped.
 */
export function deepMerge(
  ...sources: Record<string, unknown>[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const src of sources) {
    for (const [k, v] of Object.entries(src)) {
      if (v === undefined) continue
      const prev = out[k]
      if (isPlainObject(prev) && isPlainObject(v)) {
        out[k] = deepMerge(prev, v)
      } else {
        out[k] = v
      }
    }
  }
  return out
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
