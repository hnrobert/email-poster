import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, symlinkSync, rmSync, writeFileSync, realpathSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isMainEntry } from '../../cli/cli'

// The guard must treat a symlinked invocation (how npm/npx run package bins:
// node_modules/.bin/<name> → pkg/dist/cli.js) as a direct run — a plain
// argv[1] === import.meta.url comparison made every npx invocation a silent
// no-op. See cli/cli.ts isMainEntry.
const dir = mkdtempSync(join(tmpdir(), 'ep-entry-'))
const real = join(dir, 'cli.js')
writeFileSync(real, '#!/usr/bin/env node\n')
const link = join(dir, 'bin-email-poster')
symlinkSync(real, link)

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('isMainEntry', () => {
  it('matches a direct invocation', () => {
    expect(isMainEntry(real, pathToFileURL(real).href)).toBe(true)
  })

  it('matches through a bin symlink (the npx case)', () => {
    expect(isMainEntry(link, pathToFileURL(realpathSync(real)).href)).toBe(true)
  })

  it('does not match a different script (imported-as-module case)', () => {
    const other = join(dir, 'other.js')
    writeFileSync(other, '')
    expect(isMainEntry(other, pathToFileURL(real).href)).toBe(false)
    expect(isMainEntry(link, pathToFileURL(other).href)).toBe(false)
  })

  it('handles a missing argv[1] gracefully', () => {
    expect(isMainEntry(undefined, pathToFileURL(real).href)).toBe(false)
    expect(isMainEntry(join(dir, 'nope.js'), pathToFileURL(real).href)).toBe(false)
  })
})

describe('VERSION', () => {
  it('reads the package.json version at runtime (never drifts from CI bumps)', async () => {
    const { VERSION } = await import('../../cli/cli')
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string }
    expect(VERSION).toBe(pkg.version)
  })
})
