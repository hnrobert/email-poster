/**
 * AbortSignal composition. Used to merge an external caller signal with the
 * internal per-request timeout signal. Prefers the native `AbortSignal.any`
 * (Node 20+) and falls back to a manual listener shim on Node 18.
 */
export function composeSignals(a?: AbortSignal, b?: AbortSignal): AbortSignal | undefined {
  if (!a) return b
  if (!b) return a

  const anyFn = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any
  if (typeof anyFn === 'function') return anyFn.call(AbortSignal, [a, b])

  // Manual fallback.
  const controller = new AbortController()
  const cleanup = (): void => {
    a.removeEventListener('abort', onA)
    b.removeEventListener('abort', onB)
  }
  const onA = (): void => {
    controller.abort((a as { reason?: unknown }).reason)
    cleanup()
  }
  const onB = (): void => {
    controller.abort((b as { reason?: unknown }).reason)
    cleanup()
  }
  if (a.aborted) {
    controller.abort((a as { reason?: unknown }).reason)
    return controller.signal
  }
  if (b.aborted) {
    controller.abort((b as { reason?: unknown }).reason)
    return controller.signal
  }
  a.addEventListener('abort', onA, { once: true })
  b.addEventListener('abort', onB, { once: true })
  return controller.signal
}

export function isAbortError(e: unknown): boolean {
  return e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')
}
