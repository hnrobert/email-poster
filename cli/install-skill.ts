import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Bundled skill installer. Copies the shipped skill (`.agents/skills/email-poster/`)
 * into each requested agent's native skills directory, so users get a one-command
 * install that doesn't depend on any external skill registry:
 *
 *   npx email-poster install-skill            # auto-detect installed agents (fallback: claude)
 *   npx email-poster install-skill claude     # ~/.claude/skills/email-poster
 *   npx email-poster install-skill all        # every known agent
 */

// The skill ships next to dist/, so resolve relative to this (bundled) file.
const SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '.agents',
  'skills',
  'email-poster',
)

/** agent key → destination dir for this skill. */
const TARGETS: Record<string, () => string> = {
  claude: () => path.join(homedir(), '.claude', 'skills', 'email-poster'),
  codex: () => path.join(homedir(), '.codex', 'skills', 'email-poster'),
  gemini: () => path.join(homedir(), '.gemini', 'skills', 'email-poster'),
  cursor: () => path.join(homedir(), '.cursor', 'skills', 'email-poster'),
  opencode: () => path.join(homedir(), '.config', 'opencode', 'skills', 'email-poster'),
}

export async function runInstallSkill(target?: string): Promise<number> {
  try {
    await fs.access(SRC)
  } catch {
    console.error(`error: skill source not found at ${SRC} (was the package installed fully?)`)
    return 1
  }

  let keys: string[]
  if (!target) {
    // Auto-detect: install into every agent whose base dir already exists.
    const detected = await detectAgents()
    keys = detected.length > 0 ? detected : ['claude']
    console.log(`No target given; ${detected.length > 0 ? `detected: ${detected.join(', ')}` : 'defaulting to claude'}.`)
  } else if (target === 'all') {
    keys = Object.keys(TARGETS)
  } else if (target in TARGETS) {
    keys = [target]
  } else {
    console.error(`error: unknown target "${target}". Choose from: ${[...Object.keys(TARGETS), 'all'].join(', ')}`)
    return 1
  }

  for (const k of keys) {
    const dest = TARGETS[k]!()
    try {
      await copyDir(SRC, dest)
      console.log(`✓ Installed email-poster skill → ${dest}`)
    } catch (e) {
      console.error(`error installing for ${k}: ${e instanceof Error ? e.message : String(e)}`)
      return 1
    }
  }
  console.log('Restart your agent to load the skill.')
  return 0
}

async function detectAgents(): Promise<string[]> {
  const out: string[] = []
  for (const [k, fn] of Object.entries(TARGETS)) {
    const base = path.dirname(path.dirname(fn()))
    try {
      await fs.access(base)
      out.push(k)
    } catch {
      // agent base dir not present → skip
    }
  }
  return out
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true })
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) await copyDir(s, d)
    else await fs.copyFile(s, d)
  }
}
