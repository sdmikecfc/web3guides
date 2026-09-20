/** Executes the hook's social writer with actual authority reducers and fake I/O. */
import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { webcrypto } from "node:crypto";
import { createDinerRecord } from "../src/lib/chef/diner/authority";
import { createSocialProfile, replayDinerSocial } from "../src/lib/chef/diner/social";
const loader = Module as unknown as { _load: (request: string, parent: unknown, main: boolean) => unknown }, originalLoad = loader._load;
loader._load = function(request, parent, main) {
  if (request === "react") return { useState: (value: unknown) => [value, () => {}], useRef: (value: unknown) => ({ current: value }), useCallback: (value: unknown) => value, useEffect: () => {} };
  return originalLoad.call(this, request.startsWith("@/") ? path.resolve("src", request.slice(2)) : request, parent, main);
};
const { useDiner } = require("../src/app/chef/diner-preview/useDiner") as typeof import("../src/app/chef/diner-preview/useDiner");
loader._load = originalLoad;
const player = "11111111-1111-4111-8111-111111111111", now = Date.UTC(2026, 8, 20, 8), pendingKey = "diner_preview_social_pending_v1";
class StorageMock { data = new Map<string, string>(); failPending = false; getItem(key: string) { return this.data.get(key) ?? null; } setItem(key: string, value: string) { if (key === pendingKey && this.failPending) throw new Error("Storage full"); this.data.set(key, value); } removeItem(key: string) { this.data.delete(key); } }
class ServerMock {
  record = createDinerRecord(now, "social-sync"); profile = createSocialProfile(player, now); receipts = new Map<string, string>(); requests: { path: string; body: any }[] = [];
  loseNext = false; statusNext = 0;
  response(body: unknown, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => structuredClone(body) } as Response; }
  snapshot(extra: Record<string, unknown> = {}) { return { ok: true, state: structuredClone(this.record.state), revision: this.record.revision, serverTime: now, ...extra }; }
  fetch: typeof fetch = async (input, options) => {
    const route = String(input).split("/").pop()!, body = options?.body ? JSON.parse(String(options.body)) : null; this.requests.push({ path: route, body });
    if (route === "session") return this.response({ accessToken: "access", refreshToken: "refresh", expiresAt: now / 1000 + 3600, playerId: player });
    if (route === "state") return this.response(this.snapshot());
    if (route !== "social") throw new Error(`Unexpected path ${route}`);
    if (this.statusNext) { const status = this.statusNext; this.statusNext = 0; return this.response({ ok: false, error: "Retry later" }, status); }
    const fingerprint = JSON.stringify(body.command), receipt = this.receipts.get(body.id);
    if (receipt) { assert.equal(receipt, fingerprint); return this.response(this.snapshot({ duplicate: true })); }
    if (body.revision !== this.record.revision) return this.response(this.snapshot({ ok: false, code: "conflict", error: "Another device changed the diner." }), 409);
    const replayed = replayDinerSocial({ actorId: player, actor: this.record, actorProfile: this.profile }, body.command, { now, commandId: body.id });
    this.record = replayed.actor; this.record.revision++; this.profile = replayed.actorProfile; this.receipts.set(body.id, fingerprint);
    if (this.loseNext) { this.loseNext = false; throw new Error("Response lost after commit"); }
    return this.response(this.snapshot());
  };
}
const globals = { fetch: globalThis.fetch, localStorage: globalThis.localStorage, document: globalThis.document, crypto: globalThis.crypto, now: Date.now };
let groups = 0;
async function fixture() { const storage = new StorageMock(), server = new ServerMock(); Object.assign(globalThis, { localStorage: storage, document: { visibilityState: "visible" }, fetch: server.fetch }); const hook = useDiner(); assert.equal(await hook.connect(), true); return { hook, storage, server }; }
async function test(name: string, fn: () => Promise<void>) { await fn(); groups++; console.log(`ok ${name}`); }
async function main() {
  Date.now = () => now; if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  await test("lost social receipt retains UUID and retry applies its one canonical effect", async () => {
    const { hook, storage, server } = await fixture(); server.loseNext = true;
    await assert.rejects(hook.social({ type: "publish", enabled: true }), /lost/); const pending = JSON.parse(storage.getItem(pendingKey)!); assert.equal(server.profile.published, true);
    await hook.social({ type: "publish", enabled: true }); assert.equal(server.record.revision, 1); assert.equal(storage.getItem(pendingKey), null);
    const requests = server.requests.filter(request => request.path === "social"); assert.equal(requests[0].body.id, pending.envelope.id); assert.equal(requests[1].body.id, pending.envelope.id);
  });
  await test("a different new click cannot pretend it was the older uncertain action", async () => {
    const { hook, storage, server } = await fixture(); server.loseNext = true;
    await assert.rejects(hook.social({ type: "publish", enabled: true }));
    await assert.rejects(hook.social({ type: "publish", enabled: false }), /earlier street action/); assert.equal(server.profile.published, true); assert.equal(storage.getItem(pendingKey), null);
    await hook.social({ type: "publish", enabled: false }); assert.equal(server.profile.published, false); assert.equal(server.record.revision, 2);
  });
  await test("a conflict adopts the canonical ok:false snapshot before the next action", async () => {
    const { hook, storage, server } = await fixture(); server.record.revision = 5; server.record.state.coins = 777;
    await assert.rejects(hook.social({ type: "publish", enabled: true }), /Another device/); assert.equal(storage.getItem(pendingKey), null);
    await hook.social({ type: "publish", enabled: true }); assert.equal(server.record.revision, 6); assert.equal(server.record.state.coins, 777); assert.equal(server.requests.filter(request => request.path === "social")[1].body.revision, 5);
  });
  await test("401 refresh and 429 retries keep their durable original envelope", async () => {
    for (const status of [401, 429]) {
      const { hook, storage, server } = await fixture(); server.statusNext = status;
      await assert.rejects(hook.social({ type: "publish", enabled: true })); const saved = storage.getItem(pendingKey); assert.ok(saved);
      await hook.social({ type: "publish", enabled: true }); assert.equal(server.record.revision, 1);
      const requests = server.requests.filter(request => request.path === "social"); assert.equal(requests[0].body.id, requests[1].body.id); assert.equal(storage.getItem(pendingKey), null);
      if (status === 401) assert.equal(server.requests.filter(request => request.path === "session").length, 2);
    }
  });
  await test("storage failure prevents an unrepeatable social write", async () => {
    const { hook, storage, server } = await fixture(); storage.failPending = true;
    await assert.rejects(hook.social({ type: "publish", enabled: true }), /Storage full/); assert.equal(server.requests.filter(request => request.path === "social").length, 0); assert.equal(server.record.revision, 0);
  });
  console.log(`Diner social sync: ${groups} groups passed.`);
}
void main().finally(() => { Date.now = globals.now; Object.assign(globalThis, { fetch: globals.fetch, localStorage: globals.localStorage, document: globals.document }); }).catch(error => { console.error(error); process.exitCode = 1; });
