#!/usr/bin/env node
/**
 * email-poster CLI — zero-dependency, hand-rolled argv.
 * @license Apache-2.0
 */
import { pathToFileURL } from 'node:url'
import { runSend, parseHeaders, type SendFlags } from './send'
import { runTest, type TestFlags } from './test'
import { runValidate } from './validate-cmd'
import { runInstallSkill } from './install-skill'
import { runExportInterface, runDetectInterface } from './interface-cmd'

const VERSION = '0.3.0'

const BOOL_FLAGS = new Set([
  '--dry-run',
  '--json',
  '--json-schema',
  '--body-stdin',
  '--verbose',
  '-v',
  '--help',
  '-h',
  '--version',
  '-V',
])

interface Parsed {
  flags: Map<string, string[]>
  bools: Set<string>
  positional: string[]
}

/** Minimal parser: `--key value` | `--key=value` | `--bool` (repeatable). */
function parseArgs(argv: string[]): Parsed {
  const flags = new Map<string, string[]>()
  const bools = new Set<string>()
  const positional: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]!
    if (tok === '--') {
      positional.push(...argv.slice(i + 1))
      break
    }
    if (!tok.startsWith('-')) {
      positional.push(tok)
      continue
    }
    const eq = tok.indexOf('=')
    if (eq >= 0) {
      const key = tok.slice(0, eq)
      const val = tok.slice(eq + 1)
      pushFlag(flags, key, val)
      continue
    }
    if (BOOL_FLAGS.has(tok) || (i + 1 >= argv.length || argv[i + 1]!.startsWith('-'))) {
      bools.add(tok)
      continue
    }
    pushFlag(flags, tok, argv[++i]!)
  }
  return { flags, bools, positional }
}

function pushFlag(flags: Map<string, string[]>, key: string, val: string): void {
  const arr = flags.get(key) ?? []
  arr.push(val)
  flags.set(key, arr)
}

const one = (p: Parsed, key: string): string | undefined => p.flags.get(key)?.[0]
const many = (p: Parsed, key: string): string[] => p.flags.get(key) ?? []

function printHelp(): void {
  console.log(`email-poster v${VERSION} — schema-driven email over HTTP POST webhooks

USAGE
  email-poster <command> [options]

COMMANDS
  send               Validate + assemble + POST an email (or --dry-run to preview)
  test               Send the built-in themed test email to one recipient
  validate           Zod-check a config file (exit 0 = valid, 1 = invalid)
  export-interface   Print the interface (field map) of a config as JSON
  detect-interface   Infer an interface from a sample downstream JSON
  install-skill      Copy the bundled AI-agent skill into your agent's skill directory

send OPTIONS
  --to <addr>            recipient (repeatable)
  --cc <addr>            cc recipient (repeatable)
  --bcc <addr>           bcc recipient (repeatable)
  --reply-to <addr>      Reply-To
  --from <addr>          override config.fromAddress
  --subject <text>       subject (required)
  --body <text>          body literal (one of body/body-file/body-stdin)
  --body-file <path>     body read from a file
  --body-stdin           body read from stdin
  --type <html|text>     body type (default html)
  --attach <fn=path>     base64-attach a file (repeatable)
  --header "K: V"        HTTP/auth header, e.g. "Authorization: Bearer x" (repeatable)
  --tag <name>           opaque tag (emitted only if the field map maps it)
  --preset <name>        smtogo | generic | custom_example
  --config <path>        config file (.json/.js/.mjs/.cjs)
  --url <url>            override postUrl
  --timeout-ms <n>       per-request timeout
  --dry-run              print the resolved field map + payload, do not send
  --json                 emit JSON
  -v, --verbose          verbose debug logging to stderr: resolved config,
                         payload, redacted headers, and each retry attempt

test OPTIONS
  --to <addr>            recipient of the test email (required)
  --preset <name>        smtogo | generic | custom_example
  --config <path>        config file (.json/.js/.mjs/.cjs)
  --url <url>            override postUrl
  --timeout-ms <n>       per-request timeout
  --header "K: V"        HTTP/auth header (repeatable)
  --dry-run              print the rendered test email HTML, do not send
  --json                 emit JSON
  -v, --verbose          verbose debug logging to stderr

validate OPTIONS
  --config <path>        config file to validate (required)
  --json                 emit JSON

export-interface OPTIONS
  --config <path>        config file to export the interface from (required)
  --json-schema          emit a standard JSON Schema (draft-07) of the downstream
                         payload instead of an email-poster InterfaceDef

detect-interface OPTIONS
  --input <path>         sample downstream JSON (instance or JSON Schema) to
                         infer a field map from (required)

install-skill OPTIONS
  [agent]                claude | codex | gemini | cursor | opencode | all
                         (omit to auto-detect installed agents; fallback: claude)

CONFIG PRECEDENCE (send, test)
  .email-posterrc.json  <  EMAIL_POSTER_* env  <  --config <file>  <  CLI flags

EXAMPLES
  email-poster send --preset custom_example --url https://x.com \\
    --to a@b.c --subject Hi --body "Hello" --header "Authorization: Bearer tok"
  echo "Hello" | email-poster send --preset smtogo --url https://x.com \\
    --to a@b.c --subject Hi --body-stdin
  email-poster test --to a@b.c --url https://x.com --preset smtogo
  email-poster test --dry-run --to a@b.c --config .email-posterrc.json
`)
}

export async function main(argv: string[]): Promise<number> {
  const p = parseArgs(argv)
  if (p.bools.has('--help') || p.bools.has('-h')) {
    printHelp()
    return 0
  }
  if (p.bools.has('--version') || p.bools.has('-V')) {
    console.log(VERSION)
    return 0
  }

  const command = p.positional[0]
  if (command === 'send') {
    const flags: SendFlags = {
      to: many(p, '--to'),
      cc: many(p, '--cc'),
      bcc: many(p, '--bcc'),
      replyTo: one(p, '--reply-to'),
      from: one(p, '--from'),
      subject: one(p, '--subject'),
      body: one(p, '--body'),
      bodyFile: one(p, '--body-file'),
      bodyStdin: p.bools.has('--body-stdin'),
      type: one(p, '--type') as 'html' | 'text' | undefined,
      attach: many(p, '--attach'),
      header: many(p, '--header'),
      tag: one(p, '--tag'),
      preset: one(p, '--preset'),
      config: one(p, '--config'),
      url: one(p, '--url'),
      timeoutMs: one(p, '--timeout-ms') ? Number(one(p, '--timeout-ms')) : undefined,
      dryRun: p.bools.has('--dry-run'),
      json: p.bools.has('--json'),
      verbose: p.bools.has('-v') || p.bools.has('--verbose'),
    }
    return runSend(flags)
  }

  if (command === 'test') {
    const to = one(p, '--to')
    if (!to) {
      console.error('error: test requires --to <addr>')
      return 1
    }
    let headers: Record<string, string>
    try {
      headers = parseHeaders(many(p, '--header'))
    } catch (e) {
      console.error(`error: ${e instanceof Error ? e.message : String(e)}`)
      return 1
    }
    const flags: TestFlags = {
      to,
      preset: one(p, '--preset'),
      config: one(p, '--config'),
      url: one(p, '--url'),
      timeoutMs: one(p, '--timeout-ms') ? Number(one(p, '--timeout-ms')) : undefined,
      headers,
      dryRun: p.bools.has('--dry-run'),
      json: p.bools.has('--json'),
      verbose: p.bools.has('-v') || p.bools.has('--verbose'),
    }
    return runTest(flags)
  }

  if (command === 'validate') {
    const config = one(p, '--config')
    if (!config) {
      console.error('error: validate requires --config <path>')
      return 1
    }
    return runValidate({ config, json: p.bools.has('--json') })
  }

  if (command === 'install-skill') {
    return runInstallSkill(p.positional[1] ?? one(p, '--to'))
  }

  if (command === 'export-interface') {
    const config = one(p, '--config')
    if (!config) {
      console.error('error: export-interface requires --config <path>')
      return 1
    }
    return runExportInterface({ config, jsonSchema: p.bools.has('--json-schema') })
  }

  if (command === 'detect-interface') {
    const input = one(p, '--input')
    if (!input) {
      console.error('error: detect-interface requires --input <sample.json>')
      return 1
    }
    return runDetectInterface({ input })
  }

  console.error(`error: unknown command "${command ?? ''}". Run "email-poster --help".`)
  return 1
}

// Run only when invoked as the entry script (not when imported, e.g. by tests).
const invokedAs = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === invokedAs) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
