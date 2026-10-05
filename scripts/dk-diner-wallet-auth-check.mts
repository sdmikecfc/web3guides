/** Real Ethereum signatures; isolated in-memory provider/storage boundaries.
 * SQL checks inspect the review-only migration. No network or database writes. */
import assert from "node:assert/strict";
import fs from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { privateKeyToAccount } from "viem/accounts";
import { parseSiweMessage } from "viem/siwe";
import { DinerAuthorityError } from "../src/lib/chef/diner/authority";
import { createDinerWalletChallenge, DINER_WALLET_STATEMENT, dinerWalletAccount, dinerWalletOrigin, dinerWalletProof, verifiedDinerSessionId, verifyDinerWalletProof } from "../src/lib/chef/diner/wallet-auth";
import { dinerWalletRequester, DINER_WALLET_RATE_RULES, issueDinerWalletChallenge as issueChallenge, requireDinerWalletSession, revokeDinerWalletSession, verifyDinerWalletChallenge } from "../src/lib/chef/diner/wallet-auth-server";

const NOW = Date.UTC(2026, 8, 20, 9), ORIGIN = "https://kitchen.example.test";
const PLAYER = "11111111-1111-4111-8111-111111111111", OTHER = "22222222-2222-4222-8222-222222222222";
const SESSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", SESSION2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
// Public test keys only. These accounts never connect to a network or hold assets.
const account = privateKeyToAccount(`0x${"1".repeat(64)}`), otherAccount = privateKeyToAccount(`0x${"2".repeat(64)}`);
const config = { appUrl: ORIGIN, nodeEnv: "production", extraOrigins: "https://second.example.test" };
const oldAppUrl = process.env.DINER_PREVIEW_APP_URL, oldOrigins = process.env.DINER_WALLET_ORIGINS;
const oldVercel = process.env.VERCEL, oldRateSecret = process.env.DINER_WALLET_RATE_SECRET;
process.env.DINER_PREVIEW_APP_URL = ORIGIN; process.env.DINER_WALLET_ORIGINS = "https://second.example.test,https://third.example.test";
process.env.VERCEL = "1"; process.env.DINER_WALLET_RATE_SECRET = "public-test-secret-for-resource-buckets-only";
const requestFor = (ip = "192.0.2.1", origin = ORIGIN, extra: Record<string, string> = {}) => new Request(`${origin}/api/chef/diner/wallet/challenge`, { headers: { "x-vercel-forwarded-for": ip, ...extra } });
const issueDinerWalletChallenge = (db: SupabaseClient, body: unknown, origin: string | null, now = NOW, request = requestFor()) => issueChallenge(db, body, origin, now, request);
let groups = 0;
function code(expected: string) { return (error: unknown) => error instanceof DinerAuthorityError && error.code === expected; }
async function check(name: string, run: () => void | Promise<void>) { await run(); groups++; console.log(`PASS ${name}`); }
function token(player = PLAYER, session = SESSION, exp = NOW / 1000 + 3600, anonymous = false) {
  return `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: player, session_id: session, exp, is_anonymous: anonymous })).toString("base64url")}.test-signature`;
}
type Row = Record<string, any>;
class Storage {
  now = NOW; challenges = new Map<string, Row>(); sessions = new Map<string, Row>(); counts = new Map<string, { start: number; last: number; count: number }>(); unavailable = false;
  from = (name: string) => {
    const filters: [string, unknown][] = [], source = name === "diner_preview_wallet_challenges" ? this.challenges : this.sessions;
    const query = { select: (_: string) => query, eq: (key: string, value: unknown) => { filters.push([key, value]); return query; }, maybeSingle: async () => ({ error: this.unavailable ? new Error("offline") : null, data: structuredClone([...source.values()].find(row => filters.every(([key, value]) => row[key] === value)) ?? null) }) };
    return query;
  };
  rpc = async (name: string, p: Row) => {
    if (this.unavailable) return { data: null, error: new Error("offline") };
    if (name === "diner_preview_wallet_issue") {
      for (const [nonce] of [...this.challenges].filter(([, row]) => row.expires_at_ms < this.now - 300000).slice(0, 128)) this.challenges.delete(nonce);
      for (const [bucket] of [...this.counts].filter(([bucket, rate]) => bucket !== "global" && rate.last < this.now - 600000).slice(0, 128)) this.counts.delete(bucket);
      const rateFor = (bucket: string) => { const value = this.counts.get(bucket); return !value || this.now >= value.start + 300000 ? { start: this.now, last: value?.last ?? this.now - 10000, count: 0 } : value; };
      const keys = ["global", `origin:${p.p_origin_hash}`, `requester:${p.p_requester_hash}`], rates = keys.map(rateFor), caps = [300, 120, 6];
      const reject = (retryAfterMs: number) => ({ error: null, data: { ok: false, code: "wallet_rate_limited", retryAfterMs } });
      for (let i = 0; i < keys.length; i++) if (rates[i].count >= caps[i]) return reject(rates[i].start + 300000 - this.now);
      if (this.now < rates[2].last + 10000) return reject(rates[2].last + 10000 - this.now);
      if (this.challenges.size >= 2048 || this.counts.size > 2045) return reject(10000);
      keys.forEach((key, i) => this.counts.set(key, { ...rates[i], last: this.now, count: rates[i].count + 1 }));
      this.challenges.set(p.p_nonce, { nonce: p.p_nonce, wallet: p.p_wallet, chain_id: p.p_chain_id, origin: p.p_origin, message: p.p_message, issued_at_ms: p.p_issued_at_ms, expires_at_ms: p.p_expires_at_ms, consumed_at: null });
      return { error: null, data: { ok: true } };
    }
    if (name === "diner_preview_wallet_burn") {
      const row = this.challenges.get(p.p_nonce);
      if (!row || row.consumed_at !== null || row.wallet !== p.p_wallet || row.origin !== p.p_origin || row.message !== p.p_message || row.issued_at_ms > this.now || row.expires_at_ms <= this.now) return { error: null, data: { ok: false } };
      row.consumed_at = this.now; return { error: null, data: { ok: true } };
    }
    if (name === "diner_preview_wallet_register") {
      const row = this.challenges.get(p.p_nonce);
      if (!row || row.consumed_at === null || row.consumed_at < this.now - 300000 || this.sessions.has(p.p_session) || [...this.sessions.values()].some(session => session.challenge_nonce === p.p_nonce)) return { error: null, data: { ok: false } };
      this.sessions.set(p.p_session, { session_id: p.p_session, player_id: p.p_player, wallet: row.wallet, challenge_nonce: p.p_nonce, revoked_at: null });
      return { error: null, data: { ok: true, wallet: row.wallet } };
    }
    if (name === "diner_preview_wallet_revoke") {
      const row = this.sessions.get(p.p_session);
      if (!row || row.player_id !== p.p_player) return { error: null, data: { ok: false } };
      row.revoked_at ??= new Date(this.now).toISOString(); return { error: null, data: { ok: true } };
    }
    throw new Error(`Unexpected RPC: ${name}`);
  };
  client() { return this as unknown as SupabaseClient; }
}
class Auth {
  signCalls = 0; userCalls = 0; failSign = false; failUser = false; player = PLAYER; session = SESSION; anonymous = false;
  auth = {
    signInWithWeb3: async (value: Row) => {
      this.signCalls++; assert.equal(value.chain, "ethereum"); assert.equal(typeof value.message, "string"); assert.match(value.signature, /^0x/);
      const user = { id: this.player, is_anonymous: this.anonymous }, session = { user, access_token: token(this.player, this.session, NOW / 1000 + 3600, this.anonymous), refresh_token: "test-refresh", expires_at: NOW / 1000 + 3600 };
      return { data: this.failSign ? { user: null, session: null } : { user, session }, error: this.failSign ? new Error("provider offline") : null };
    },
    getUser: async (_: string) => { this.userCalls++; return { data: { user: this.failUser ? null : { id: this.player, is_anonymous: this.anonymous } }, error: this.failUser ? new Error("not verified") : null }; },
  };
  client() { return this as unknown as SupabaseClient; }
}
async function fixture() {
  const db = new Storage(), auth = new Auth();
  const challenge = await issueDinerWalletChallenge(db.client(), { address: account.address, chainId: 1 }, ORIGIN, NOW);
  return { db, auth, challenge, proof: { ...challenge, signature: await account.signMessage({ message: challenge.message }) } };
}
async function main() {
  await check("approved origins are exact and production rejects localhost and insecure hosts", () => {
    assert.equal(dinerWalletOrigin(ORIGIN, config), ORIGIN); assert.equal(dinerWalletOrigin("https://second.example.test", config), "https://second.example.test");
    for (const origin of [null, "null", `${ORIGIN}.evil.test`, `${ORIGIN}/`, "https://unlisted.example.test", "http://localhost:3000"]) assert.throws(() => dinerWalletOrigin(origin, config), code("wallet_origin_invalid"));
    for (const appUrl of ["http://localhost:3000", "https://localhost", "https://game.localhost", "https://127.0.0.2", "http://127.0.0.1:3000", "https://[::1]", "http://public.example.test", "https://user:secret@example.test"]) assert.throws(() => dinerWalletOrigin(appUrl, { appUrl, nodeEnv: "production" }), code("wallet_configuration_required"));
    assert.throws(() => dinerWalletOrigin(ORIGIN, {}), code("wallet_configuration_required"));
    assert.equal(dinerWalletOrigin("http://localhost:3000", { appUrl: "http://localhost:3000/chef/diner-preview", nodeEnv: "development" }), "http://localhost:3000");
  });
  await check("address and chain inputs are bounded without authorizing transactions", () => {
    assert.deepEqual(dinerWalletAccount({ address: account.address, chainId: 1 }), { wallet: account.address.toLowerCase(), chainId: 1 });
    for (const chainId of [0, -1, 1.5, "1", Infinity, 2147483648]) assert.throws(() => dinerWalletAccount({ address: account.address, chainId }), code("wallet_challenge_invalid"));
    for (const address of ["", "0x123", "0x" + "z".repeat(40), account.address + "\n"]) assert.throws(() => dinerWalletAccount({ address, chainId: 1 }), code("wallet_challenge_invalid"));
  });
  await check("only trusted platform requests or shared loopback development receive private rate buckets", () => {
    const secret = "test-secret-with-at-least-32-characters", vercel = { vercel: "1", nodeEnv: "production", secret };
    const first = dinerWalletRequester(requestFor(), ORIGIN, vercel);
    assert.match(first.requesterHash, /^[0-9a-f]{64}$/); assert.match(first.originHash, /^[0-9a-f]{64}$/); assert(!JSON.stringify(first).includes("192.0.2.1"));
    assert.deepEqual(dinerWalletRequester(requestFor("192.0.2.1", ORIGIN, { "x-forwarded-for": "203.0.113.99", "x-real-ip": "203.0.113.98" }), ORIGIN, vercel), first);
    assert.notEqual(dinerWalletRequester(requestFor("192.0.2.2"), ORIGIN, vercel).requesterHash, first.requesterHash);
    assert.notEqual(dinerWalletRequester(requestFor(), ORIGIN, { ...vercel, secret: secret + "changed" }).requesterHash, first.requesterHash);
    for (const request of [undefined, new Request(ORIGIN, { headers: { "x-forwarded-for": "192.0.2.1" } }), requestFor("192.0.2.1, 192.0.2.2"), requestFor("attacker.test"), requestFor("fe80::1%eth0")]) assert.throws(() => dinerWalletRequester(request, ORIGIN, vercel), code("wallet_requester_unavailable"));
    assert.throws(() => dinerWalletRequester(requestFor(), ORIGIN, { ...vercel, vercel: undefined }), code("wallet_requester_unavailable"));
    assert.throws(() => dinerWalletRequester(requestFor(), ORIGIN, { ...vercel, secret: "short" }), code("wallet_requester_unavailable"));
    const local = { nodeEnv: "development", secret };
    assert.deepEqual(dinerWalletRequester(new Request("http://localhost:3000/a"), "http://localhost:3000", local), dinerWalletRequester(new Request("http://localhost:3000/b", { headers: { "x-forwarded-for": "203.0.113.1" } }), "http://localhost:3000", local));
    assert.throws(() => dinerWalletRequester(new Request(ORIGIN), "http://localhost:3000", local), code("wallet_requester_unavailable"));
    assert.equal(dinerWalletRequester(requestFor("2001:db8:1:2::1"), ORIGIN, vercel).requesterHash, dinerWalletRequester(requestFor("2001:0db8:0001:0002:ffff:1:2:3"), ORIGIN, vercel).requesterHash);
    assert.notEqual(dinerWalletRequester(requestFor("2001:db8:1:3::1"), ORIGIN, vercel).requesterHash, dinerWalletRequester(requestFor("2001:db8:1:2::1"), ORIGIN, vercel).requesterHash);
    assert.equal(dinerWalletRequester(requestFor("::ffff:192.0.2.1"), ORIGIN, vercel).requesterHash, first.requesterHash);
  });
  await check("generated SIWE has the fixed human statement, origin, nonce and five-minute expiry", async () => {
    const challenge = createDinerWalletChallenge({ address: account.address, chainId: 1 }, ORIGIN, "a".repeat(32), NOW), parsed = parseSiweMessage(challenge.message);
    assert.equal(parsed.statement, DINER_WALLET_STATEMENT); assert.equal(parsed.domain, "kitchen.example.test"); assert.equal(parsed.uri, `${ORIGIN}/chef/diner-preview`); assert.equal(parsed.nonce, challenge.nonce); assert.equal(parsed.address, account.address); assert.equal(parsed.chainId, 1); assert.equal(parsed.expirationTime?.getTime(), NOW + 300000);
    const proof = dinerWalletProof({ ...challenge, signature: await account.signMessage({ message: challenge.message }) });
    await verifyDinerWalletProof(challenge, proof, ORIGIN, NOW); await verifyDinerWalletProof(challenge, proof, ORIGIN, NOW + 299999);
    await assert.rejects(verifyDinerWalletProof(challenge, proof, ORIGIN, NOW + 300000), code("wallet_challenge_expired"));
    await assert.rejects(verifyDinerWalletProof(challenge, proof, ORIGIN, NOW - 1), code("wallet_challenge_expired"));
  });
  await check("wrong signer, domain, nonce and changed messages fail cryptographic verification", async () => {
    const challenge = createDinerWalletChallenge({ address: account.address, chainId: 1 }, ORIGIN, "b".repeat(32), NOW), signature = await account.signMessage({ message: challenge.message });
    await assert.rejects(verifyDinerWalletProof(challenge, { ...challenge, signature: await otherAccount.signMessage({ message: challenge.message }) }, ORIGIN, NOW), code("wallet_signature_invalid"));
    await assert.rejects(verifyDinerWalletProof(challenge, { ...challenge, signature }, "https://second.example.test", NOW), code("wallet_challenge_invalid"));
    for (const patch of [{ message: challenge.message.replace("Sign in to", "Approve access to") }, { nonce: "c".repeat(32) }, { message: challenge.message.replace("Chain ID: 1", "Chain ID: 2") }]) await assert.rejects(verifyDinerWalletProof(challenge, { ...challenge, signature, ...patch }, ORIGIN, NOW), code("wallet_challenge_invalid"));
  });
  await check("a verified signature registers a verified provider session and refresh keeps access", async () => {
    const h = await fixture(), result = await verifyDinerWalletChallenge(h.db.client(), h.auth.client(), h.proof, ORIGIN, NOW);
    assert.equal(result.wallet, account.address.toLowerCase()); assert.equal(result.playerId, PLAYER); assert.equal(result.refreshToken, "test-refresh"); assert.equal(h.auth.signCalls, 1); assert.equal(h.auth.userCalls, 1);
    assert.deepEqual(await requireDinerWalletSession(h.db.client(), result.accessToken, PLAYER, NOW), { wallet: account.address.toLowerCase() });
    assert.deepEqual(await requireDinerWalletSession(h.db.client(), token(PLAYER, SESSION, NOW / 1000 + 7200), PLAYER, NOW + 3600001), { wallet: account.address.toLowerCase() });
    assert.equal(h.db.sessions.size, 1); assert.equal(h.db.challenges.get(h.challenge.nonce)!.consumed_at, NOW);
  });
  await check("simultaneous proof verification burns once before creating any provider session", async () => {
    const h = await fixture(), results = await Promise.allSettled([1, 2].map(() => verifyDinerWalletChallenge(h.db.client(), h.auth.client(), h.proof, ORIGIN, NOW)));
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1); assert.equal(h.auth.signCalls, 1); assert.equal(h.db.sessions.size, 1);
    const failed = results.find(result => result.status === "rejected") as PromiseRejectedResult; assert(code("wallet_challenge_used")(failed.reason));
    await assert.rejects(verifyDinerWalletChallenge(h.db.client(), h.auth.client(), h.proof, ORIGIN, NOW), code("wallet_challenge_used"));
  });
  await check("invalid proofs do not consume a valid challenge or reach the identity provider", async () => {
    const h = await fixture();
    await assert.rejects(verifyDinerWalletChallenge(h.db.client(), h.auth.client(), { ...h.proof, signature: await otherAccount.signMessage({ message: h.proof.message }) }, ORIGIN, NOW), code("wallet_signature_invalid"));
    assert.equal(h.db.challenges.get(h.challenge.nonce)!.consumed_at, null); assert.equal(h.auth.signCalls, 0);
    h.db.now = NOW + 300000;
    await assert.rejects(verifyDinerWalletChallenge(h.db.client(), h.auth.client(), h.proof, ORIGIN, NOW + 299999), code("wallet_challenge_used"));
    assert.equal(h.auth.signCalls, 0, "database expiry wins even when application time is behind");
  });
  await check("provider failures and unverifiable access tokens leave the proof burned without registration", async () => {
    for (const failure of ["failSign", "failUser", "anonymous"] as const) {
      const h = await fixture(); h.auth[failure] = true;
      await assert.rejects(verifyDinerWalletChallenge(h.db.client(), h.auth.client(), h.proof, ORIGIN, NOW), code("wallet_session_unavailable"));
      assert.equal(h.db.sessions.size, 0); assert.equal(h.db.challenges.get(h.challenge.nonce)!.consumed_at, NOW);
      await assert.rejects(verifyDinerWalletChallenge(h.db.client(), h.auth.client(), h.proof, ORIGIN, NOW), code("wallet_challenge_used"));
    }
  });
  await check("registry rejects direct sessions, cross-account IDs, revoked sessions and invalid claims", async () => {
    const h = await fixture(); await verifyDinerWalletChallenge(h.db.client(), h.auth.client(), h.proof, ORIGIN, NOW);
    await assert.rejects(requireDinerWalletSession(h.db.client(), token(PLAYER, SESSION2), PLAYER, NOW), code("wallet_session_required"));
    await assert.rejects(requireDinerWalletSession(h.db.client(), token(OTHER, SESSION), OTHER, NOW), code("wallet_session_required"));
    for (const invalid of [token(OTHER), token(PLAYER, SESSION, NOW / 1000), token(PLAYER, SESSION, NOW / 1000 + 3600, true), token(PLAYER, "bad-id"), "opaque-token", "x".repeat(8193)]) assert.throws(() => verifiedDinerSessionId(invalid, PLAYER, NOW), code("wallet_session_required"));
    h.db.sessions.get(SESSION)!.revoked_at = new Date(NOW).toISOString();
    await assert.rejects(requireDinerWalletSession(h.db.client(), token(), PLAYER, NOW), code("wallet_session_required"));
  });
  await check("logout revokes only the verified bearer session and also rejects its refreshed tokens", async () => {
    const h = await fixture(); await verifyDinerWalletChallenge(h.db.client(), h.auth.client(), h.proof, ORIGIN, NOW);
    h.db.sessions.set(SESSION2, { ...h.db.sessions.get(SESSION)!, session_id: SESSION2, challenge_nonce: "another-valid-proof" });
    await revokeDinerWalletSession(h.db.client(), h.auth.client(), token(), NOW);
    assert.equal(h.auth.userCalls, 2, "logout independently verifies the bearer before looking up its registry row");
    await assert.rejects(requireDinerWalletSession(h.db.client(), token(), PLAYER, NOW), code("wallet_session_required"));
    await assert.rejects(requireDinerWalletSession(h.db.client(), token(PLAYER, SESSION, NOW / 1000 + 7200), PLAYER, NOW + 3600001), code("wallet_session_required"));
    assert.deepEqual(await requireDinerWalletSession(h.db.client(), token(PLAYER, SESSION2), PLAYER, NOW), { wallet: account.address.toLowerCase() });
    await revokeDinerWalletSession(h.db.client(), h.auth.client(), token(), NOW); // Lost logout responses may safely retry.
    h.auth.player = OTHER;
    await assert.rejects(revokeDinerWalletSession(h.db.client(), h.auth.client(), token(OTHER, SESSION2), NOW), code("wallet_session_required"));
    assert.equal(h.db.sessions.get(SESSION2)!.revoked_at, null);
    h.auth.player = PLAYER; h.auth.failUser = true;
    await assert.rejects(revokeDinerWalletSession(h.db.client(), h.auth.client(), token(PLAYER, SESSION2), NOW), code("session_expired"));
    assert.equal(h.db.sessions.get(SESSION2)!.revoked_at, null);
  });
  await check("server issuance returns rate limits and unavailable storage fails closed", async () => {
    const h = await fixture();
    await assert.rejects(issueDinerWalletChallenge(h.db.client(), { address: account.address, chainId: 1 }, ORIGIN, NOW), error => code("wallet_rate_limited")(error) && (error as DinerAuthorityError).retryAfterMs === 10000);
    for (let i = 1; i < 6; i++) { h.db.now = NOW + i * 10000; await issueDinerWalletChallenge(h.db.client(), { address: account.address, chainId: 1 }, ORIGIN, h.db.now); }
    h.db.now = NOW + 60000;
    await assert.rejects(issueDinerWalletChallenge(h.db.client(), { address: account.address, chainId: 1 }, ORIGIN, h.db.now), code("wallet_rate_limited"));
    h.db.unavailable = true;
    await assert.rejects(requireDinerWalletSession(h.db.client(), token(), PLAYER, NOW), code("wallet_session_unavailable"));
    await assert.rejects(issueDinerWalletChallenge(h.db.client(), { address: account.address, chainId: 1 }, ORIGIN, NOW), code("wallet_session_unavailable"));
  });
  await check("requester quotas cannot be selected by a victim wallet and wallet rotation cannot evade them", async () => {
    const h = await fixture();
    for (let i = 1; i < 6; i++) { h.db.now = NOW + i * 10000; await issueDinerWalletChallenge(h.db.client(), { address: i % 2 ? otherAccount.address : account.address, chainId: 1 }, ORIGIN, h.db.now); }
    h.db.now = NOW + 60000;
    await assert.rejects(issueDinerWalletChallenge(h.db.client(), { address: otherAccount.address, chainId: 1 }, ORIGIN, h.db.now), code("wallet_rate_limited"));
    await issueDinerWalletChallenge(h.db.client(), { address: account.address, chainId: 1 }, ORIGIN, h.db.now, requestFor("192.0.2.2"));
    assert.equal(h.db.challenges.size, 7, "the real wallet owner on another requester budget is not locked out by an attacker naming that wallet");
    const empty = new Storage();
    await assert.rejects(issueChallenge(empty.client(), { address: account.address, chainId: 1 }, ORIGIN, NOW), code("wallet_requester_unavailable"));
    assert.equal(empty.challenges.size, 0); assert.equal(empty.counts.size, 0);
  });
  await check("origin and global caps bound fresh requesters, with bounded expiry cleanup and absolute row ceilings", async () => {
    const db = new Storage(), origins = [ORIGIN, "https://second.example.test", "https://third.example.test"];
    const freshRequest = (i: number, origin: string) => requestFor(`198.51.${Math.floor(i / 250)}.${i % 250 + 1}`, origin);
    for (let i = 0; i < 120; i++) await issueDinerWalletChallenge(db.client(), { address: account.address, chainId: 1 }, ORIGIN, NOW, freshRequest(i, ORIGIN));
    const cappedSize = db.counts.size;
    await assert.rejects(issueDinerWalletChallenge(db.client(), { address: otherAccount.address, chainId: 1 }, ORIGIN, NOW, freshRequest(120, ORIGIN)), code("wallet_rate_limited"));
    assert.equal(db.counts.size, cappedSize, "a capped origin allocates no fresh requester rows");
    for (let i = 120; i < 300; i++) { const origin = origins[i < 240 ? 1 : 2]; await issueDinerWalletChallenge(db.client(), { address: otherAccount.address, chainId: 1 }, origin, NOW, freshRequest(i, origin)); }
    const globalSize = db.counts.size;
    await assert.rejects(issueDinerWalletChallenge(db.client(), { address: account.address, chainId: 1 }, origins[2], NOW, freshRequest(300, origins[2])), code("wallet_rate_limited"));
    assert.equal(db.counts.size, globalSize); assert.equal(db.challenges.size, DINER_WALLET_RATE_RULES.globalLimit);
    db.now = NOW + 600001;
    await issueDinerWalletChallenge(db.client(), { address: account.address, chainId: 1 }, ORIGIN, db.now);
    assert.equal(db.challenges.size, 300 - DINER_WALLET_RATE_RULES.cleanupBatch + 1);
    const full = new Storage(); for (let i = 0; i < DINER_WALLET_RATE_RULES.maxRows; i++) full.challenges.set(`retained-${i}`, { expires_at_ms: NOW + 300000 });
    await assert.rejects(issueDinerWalletChallenge(full.client(), { address: account.address, chainId: 1 }, ORIGIN, NOW), code("wallet_rate_limited"));
    assert.equal(full.challenges.size, DINER_WALLET_RATE_RULES.maxRows);
  });
  await check("review-only SQL restricts all writes and RPCs and contains an atomic replay barrier", () => {
    const sql = fs.readFileSync("supabase/migrations/20260923_diner_preview_wallet_auth.sql", "utf8");
    assert.match(sql, /REVIEW ONLY/); assert.match(sql, /references auth\.users\(id\) on delete cascade/);
    for (const table of ["challenges", "limits", "sessions"]) assert(sql.includes(`alter table public.diner_preview_wallet_${table} enable row level security`));
    assert.match(sql, /revoke all on public\.diner_preview_wallet_challenges, public\.diner_preview_wallet_limits, public\.diner_preview_wallet_sessions from public, anon, authenticated, service_role/);
    for (const name of ["issue", "burn", "register", "revoke"]) {
      assert(new RegExp(`revoke all on function public\\.diner_preview_wallet_${name}\\([^;]+from public, anon, authenticated, service_role;`).test(sql));
      assert(new RegExp(`grant execute on function public\\.diner_preview_wallet_${name}\\([^;]+to service_role;`).test(sql));
    }
    assert.match(sql, /where bucket = 'global' for update/); assert.match(sql, /requester_rate\.issued_count >= 6/); assert.match(sql, /origin_rate\.issued_count >= 120/); assert.match(sql, /global_rate\.issued_count >= 300/);
    assert(sql.indexOf("global_rate.issued_count >= 300") < sql.indexOf("values(requester_key"), "global cap is checked before fresh requester rows are inserted");
    assert.match(sql, /order by expires_at_ms limit 128/); assert.match(sql, /order by last_issued_at_ms limit 128/); assert.match(sql, /count\(\*\) from public\.diner_preview_wallet_challenges\) >= 2048/);
    assert.match(sql, /where session_id = p_session and player_id = p_player returning session_id into revoked/);
    assert(!sql.includes("where wallet = p_wallet for update"), "wallet addresses never select rate rows");
    assert.match(sql, /update public\.diner_preview_wallet_challenges set consumed_at = clock_timestamp\(\)[\s\S]+consumed_at is null and issued_at_ms <= wall_ms and expires_at_ms > wall_ms[\s\S]+returning nonce into used_nonce/);
    assert.match(sql, /expires_at_ms = issued_at_ms \+ 300000/);
    assert(!/grant (?:all|insert|update|delete)[^;]+to (?:anon|authenticated)/i.test(sql));
  });
  console.log(`Wallet authentication: ${groups} groups passed. SQL deployment and real Supabase configuration remain untested.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  if (oldAppUrl === undefined) delete process.env.DINER_PREVIEW_APP_URL; else process.env.DINER_PREVIEW_APP_URL = oldAppUrl;
  if (oldOrigins === undefined) delete process.env.DINER_WALLET_ORIGINS; else process.env.DINER_WALLET_ORIGINS = oldOrigins;
  if (oldVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = oldVercel;
  if (oldRateSecret === undefined) delete process.env.DINER_WALLET_RATE_SECRET; else process.env.DINER_WALLET_RATE_SECRET = oldRateSecret;
});
