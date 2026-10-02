import assert from "node:assert/strict";

// This is a Node server test. Next's server-only marker is a bundler boundary;
// the react-server condition itself is unsupported by this repo's React 18.
const serverOnly = require.resolve("server-only");
require.cache[serverOnly] = { id: serverOnly, filename: serverOnly, loaded: true, exports: {} } as NodeModule;
const { POST: noncePost } = require("../src/app/api/bots/enlist/nonce/route") as typeof import("../src/app/api/bots/enlist/nonce/route");
const { POST: enlistPost } = require("../src/app/api/bots/enlist/route") as typeof import("../src/app/api/bots/enlist/route");
const { requireSignInConfiguration, signInFailure } = require("../src/app/api/bots/enlist/sign-in") as typeof import("../src/app/api/bots/enlist/sign-in");
const { Refusal } = require("../src/app/bots/_server/db") as typeof import("../src/app/bots/_server/db");
const { mintSession, verifySession } = require("../src/app/bots/_server/session") as typeof import("../src/app/bots/_server/session");

const env = process.env as Record<string, string | undefined>;
const names = ["NODE_ENV", "BB_SESSION_SECRET", "BB_CARD_SECRET"];
const original = names.map(name => env[name]);
const originalFetch = globalThis.fetch;
const originalError = console.error;
let networkCalls = 0;
const wallet = "0x0000000000000000000000000000000000000001";

async function main() {
  try {
    env.NODE_ENV = "production";
    delete env.BB_SESSION_SECRET;
    delete env.BB_CARD_SECRET;
    globalThis.fetch = async () => { networkCalls++; throw new Error("Unexpected database request"); };
    console.error = () => {};

    const unavailable = await noncePost(new Request("http://localhost/api/bots/enlist/nonce", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: wallet }),
    }));
    assert.equal(unavailable.status, 503);
    const body = await unavailable.json();
    assert.equal(body.code, "SIGN_IN_NOT_CONFIGURED");
    assert.equal(body.retryable, false);
    assert(!JSON.stringify(body).includes("BB_SESSION_SECRET"));
    const enlist = await enlistPost(new Request("http://localhost/api/bots/enlist", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: wallet, message: "untrusted message", signature: "0x00" }),
    }));
    assert.equal(enlist.status, 503);
    assert.equal((await enlist.json()).code, "SIGN_IN_NOT_CONFIGURED");
    assert.equal(networkCalls, 0, "Do not issue a nonce or touch a garage when no session can be minted");
    assert.throws(() => mintSession(wallet, false), "Production must still refuse an unsigned session configuration");

    env.BB_SESSION_SECRET = "short";
    assert.throws(requireSignInConfiguration);
    env.BB_SESSION_SECRET = "test-session-key-with-enough-entropy-for-a-unit-check";
    requireSignInConfiguration();
    const token = mintSession(wallet, false, 1000);
    assert.equal(verifySession(token, 1001)?.wallet, wallet);
    assert.equal(verifySession(`${token.slice(0, -1)}!`, 1001), null);

    delete env.BB_SESSION_SECRET;
    env.BB_CARD_SECRET = "existing-card-key-remains-compatible";
    requireSignInConfiguration();
    assert.equal(verifySession(mintSession(wallet, false, 1000), 1001)?.wallet, wallet);
    delete env.BB_CARD_SECRET;
    env.NODE_ENV = "development";
    requireSignInConfiguration();

    const refusal = signInFailure(new Refusal(429, "Please wait before trying again."));
    assert.equal(refusal.status, 429);
    assert.equal((await refusal.json()).error, "Please wait before trying again.");
    const backend = signInFailure(new Error("private database connection details"));
    assert.equal(backend.status, 503);
    const backendBody = await backend.json();
    assert.equal(backendBody.code, "SIGN_IN_UNAVAILABLE");
    assert(!JSON.stringify(backendBody).includes("private database"));
    console.log("Sign-in: missing/short production key refuses before nonce/database access; configured keys mint verified sessions; tampering, refusals and private backend errors handled correctly.");
  } finally {
    names.forEach((name, i) => { if (original[i] === undefined) delete env[name]; else env[name] = original[i]; });
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
