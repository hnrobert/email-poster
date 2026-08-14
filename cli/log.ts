/**
 * CLI logging helpers.
 *
 * Result + failure lines continue to go through `console.log` / `console.error`
 * so they stay pipe-friendly and testable. Verbose debug lines are written to
 * **stderr** (`process.stderr.write`), which keeps `--json` stdout pristine —
 * `some-cmd | jq` never sees the chatter, and `-v` only adds side-channel noise.
 */

/** Header names whose values are secrets — masked in verbose output. */
const SECRET_KEYS = /^(authorization|.*token|.*secret|.*password|api[-_]?key)$/i

/** Mask secret-looking header values while preserving the visible structure. */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SECRET_KEYS.test(k) ? `*** (${v.length} chars)` : v
  }
  return out
}

/**
 * Returns a verbose debug printer. No-op when `verbose` is false, so callers can
 * invoke `.debug(...)` unconditionally without guarding each site.
 */
export function createDebug(verbose: boolean): (line: string) => void {
  if (!verbose) return () => undefined
  return (line) => process.stderr.write(`[debug] ${line}\n`)
}
