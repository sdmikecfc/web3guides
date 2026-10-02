/** Bound optional room reads so an unavailable feed cannot leave an endless loader. */
export async function readGameView<T>(url: string, signal: AbortSignal, headers: Record<string, string> = {}, timeoutMs = 12000): Promise<T | null> {
  const request = new AbortController();
  const abort = () => request.abort();
  const assertActive = () => { if (request.signal.aborted) throw new DOMException("Room read cancelled", "AbortError"); };
  if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    assertActive();
    const response = await fetch(url, { signal: request.signal, cache: "no-store", headers });
    assertActive();
    const value = response.ok ? await response.json() as T : null;
    // A body already resolving at cancellation must not become a fresh room result.
    assertActive();
    return value;
  } finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
}
