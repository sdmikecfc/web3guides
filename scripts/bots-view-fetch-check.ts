import assert from "node:assert/strict";
import { readGameView } from "../src/lib/bots/view-fetch";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const abortError = (error: unknown) => error instanceof Error && error.name === "AbortError";
const response = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;

async function withFetch(mock: typeof fetch, check: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try { await check(); } finally { globalThis.fetch = original; }
}

async function main() {
  let requests = 0;
  const parent = new AbortController();
  let child!: AbortSignal;
  let listeners = 0;
  const add = parent.signal.addEventListener.bind(parent.signal);
  const remove = parent.signal.removeEventListener.bind(parent.signal);
  parent.signal.addEventListener = ((...args: Parameters<AbortSignal["addEventListener"]>) => {
    if (args[0] === "abort") listeners++;
    add(...args);
  }) as AbortSignal["addEventListener"];
  parent.signal.removeEventListener = ((...args: Parameters<AbortSignal["removeEventListener"]>) => {
    if (args[0] === "abort") listeners--;
    remove(...args);
  }) as AbortSignal["removeEventListener"];

  await withFetch(async (url, options) => {
    requests++;
    assert.equal(url, "/mock/battles");
    assert.equal(options?.cache, "no-store");
    assert.deepEqual(options?.headers, { Authorization: "Bearer test-only" });
    child = options?.signal as AbortSignal;
    assert.notEqual(child, parent.signal);
    return response({ ok: true, fights: [] });
  }, async () => {
    assert.deepEqual(await readGameView("/mock/battles", parent.signal, { Authorization: "Bearer test-only" }, 15), { ok: true, fights: [] });
    assert.equal(listeners, 0, "successful reads remove their parent listener");
    await pause(25);
    assert.equal(child.aborted, false, "successful reads clear their deadline timer");
  });

  await withFetch(async () => { requests++; return response(null, false); }, async () => {
    assert.equal(await readGameView("/mock/unavailable", parent.signal), null);
    assert.equal(listeners, 0);
  });
  await withFetch(async () => {
    requests++;
    return { ok: true, json: async () => { throw new SyntaxError("invalid mock JSON"); } } as unknown as Response;
  }, async () => {
    await assert.rejects(readGameView("/mock/bad-json", parent.signal), SyntaxError);
    assert.equal(listeners, 0, "failed body reads remove their parent listener");
  });

  const pendingFetch: typeof fetch = async (_url, options) => {
    requests++;
    child = options?.signal as AbortSignal;
    return await new Promise<Response>((_resolve, reject) => {
      const stop = () => reject(new DOMException("Mock fetch aborted", "AbortError"));
      if (child.aborted) stop(); else child.addEventListener("abort", stop, { once: true });
    });
  };
  await withFetch(pendingFetch, async () => {
    await assert.rejects(readGameView("/mock/slow", parent.signal, {}, 10), abortError);
    assert.equal(parent.signal.aborted, false, "a timed-out read does not cancel its room controller");
    assert.equal(child.aborted, true);
    assert.equal(listeners, 0, "timeouts remove their parent listener");
  });
  await withFetch(async () => { requests++; return response({ retry: true }); }, async () => {
    assert.deepEqual(await readGameView("/mock/retry", parent.signal), { retry: true }, "same room can retry after a timeout");
  });

  await withFetch(pendingFetch, async () => {
    const owner = new AbortController();
    const pending = readGameView("/mock/cancel", owner.signal);
    owner.abort();
    await assert.rejects(pending, abortError);
    assert.equal(child.aborted, true, "leaving a room cancels its pending request");
  });

  const cancelled = new AbortController();
  cancelled.abort();
  await withFetch(async () => { throw new Error("pre-cancelled reads must not start fetch"); }, async () => {
    await assert.rejects(readGameView("/mock/already-cancelled", cancelled.signal), abortError);
  });

  // An already-resolving body or cache adapter can deliver after an abort. Never publish it.
  const body = deferred<{ source: string }>();
  const bodyStarted = deferred<boolean>();
  await withFetch(async (_url, options) => {
    requests++;
    child = options?.signal as AbortSignal;
    return { ok: true, json: () => { bodyStarted.resolve(true); return body.promise; } } as unknown as Response;
  }, async () => {
    const oldRoom = new AbortController();
    let visible = "new room";
    const pending = readGameView<{ source: string }>("/mock/old-room", oldRoom.signal).then(value => {
      if (value) visible = value.source;
    });
    await bodyStarted.promise;
    oldRoom.abort();
    body.resolve({ source: "stale room" });
    await assert.rejects(pending, abortError);
    assert.equal(visible, "new room", "late body results cannot replace the next room");
    assert.equal(child.aborted, true);
  });

  console.log(`Room reads: cancellation, deadline/retry, stale body rejection and cleanup passed (${requests} mocked requests; no network).`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
