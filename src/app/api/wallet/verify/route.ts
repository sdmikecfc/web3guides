/**
 * Wallet-link signature verification endpoint.
 *
 * POST body: { code, message, signature, address }
 *
 * Uses viem.verifyMessage directly — no siwe library dependency, so the
 * format we sign and verify is purely the EIP-4361 text template (see
 * form.tsx). This avoids siwe@3's strict ABNF parser which was throwing
 * during SSR previews.
 *
 * Checks (in order):
 *   1. Auth code exists, not used, not expired
 *   2. Parsed fields (domain, nonce, statement, issued/expiration) extract cleanly
 *   3. nonce matches the nonce we issued for this code
 *   4. domain matches our allowed domains
 *   5. issuedAt is within the last 5 minutes; expirationTime hasn't passed
 *   6. statement explicitly contains "id <discord_id>" (defence in depth)
 *   7. ECDSA signature verifies against the claimed address
 *   8. address normalized to checksum format
 *   9. address not already linked to a different Discord ID
 *  10. Upsert + consume code
 */

import { NextRequest, NextResponse } from "next/server";
import { fantasyDb } from "@/lib/fantasy/supabase";
import { isAddress, getAddress, verifyMessage } from "viem";

export const runtime  = "nodejs";
export const dynamic  = "force-dynamic";

const MAX_MESSAGE_AGE_MS = 5 * 60 * 1000;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * Parse our EIP-4361 message format (matches form.tsx exactly).
 * Returns null fields if parsing fails — caller decides how to handle.
 */
function parseSiwe(message: string): {
  domain?: string;
  address?: string;
  statement?: string;
  uri?: string;
  version?: string;
  chainId?: string;
  nonce?: string;
  issuedAt?: string;
  expirationTime?: string;
} {
  const out: ReturnType<typeof parseSiwe> = {};
  const lines = message.split("\n");

  // Line 0: "${domain} wants you to sign in with your Ethereum account:"
  const firstLine = lines[0] || "";
  const domainMatch = firstLine.match(/^(\S+) wants you to sign in/);
  if (domainMatch) out.domain = domainMatch[1];

  // Line 1: "${address}"
  out.address = (lines[1] || "").trim();

  // Line 3: statement (single-line for our template)
  out.statement = (lines[3] || "").trim();

  // Remaining: key: value pairs, e.g. "URI: ..." / "Version: 1" / etc.
  const kv = (key: string) => {
    const re = new RegExp(`^${key}:\\s*(.+)$`);
    for (const ln of lines) {
      const m = ln.match(re);
      if (m) return m[1].trim();
    }
    return undefined;
  };
  out.uri            = kv("URI");
  out.version        = kv("Version");
  out.chainId        = kv("Chain ID");
  out.nonce          = kv("Nonce");
  out.issuedAt       = kv("Issued At");
  out.expirationTime = kv("Expiration Time");

  return out;
}

export async function POST(req: NextRequest) {
  let body: { code?: string; message?: string; signature?: string; address?: string };
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body");
  }

  const { code, message, signature, address: clientAddress } = body;
  if (!code      || typeof code      !== "string") return bad("Missing code");
  if (!message   || typeof message   !== "string") return bad("Missing message");
  if (!signature || typeof signature !== "string") return bad("Missing signature");
  if (!clientAddress || typeof clientAddress !== "string") return bad("Missing address");

  const db = fantasyDb();

  // 1. Validate auth code
  const { data: auth } = await db
    .from("linked_wallet_auth_codes")
    .select("*").eq("code", code).maybeSingle();
  if (!auth)                                  return bad("Unknown link code");
  if (auth.used_at)                           return bad("Link code already used");
  if (new Date(auth.expires_at).getTime() < Date.now()) {
    return bad("Link code expired — request a new one with `!wallet link`");
  }
  if (auth.nonce_consumed_at)                 return bad("Nonce already consumed");

  // 2. Parse the SIWE-format message
  const parsed = parseSiwe(message);
  if (!parsed.domain || !parsed.address || !parsed.nonce || !parsed.statement || !parsed.issuedAt) {
    return bad("Signed message format is invalid (missing required fields)");
  }

  // 3. Nonce match
  if (parsed.nonce !== auth.nonce) {
    return bad("Nonce mismatch — message was not built for this link code");
  }

  // 4. Domain match
  const expectedDomains = new Set([
    "web3guides.com",
    "www.web3guides.com",
    process.env.WALLET_LINK_DOMAIN_OVERRIDE || "",
  ].filter(Boolean));
  if (!expectedDomains.has(parsed.domain)) {
    return bad(`Domain mismatch — message domain "${parsed.domain}" is not a Doma Reporter surface`);
  }

  // 5. Issued-at freshness + expiration
  const issuedMs = new Date(parsed.issuedAt).getTime();
  if (!Number.isFinite(issuedMs)) {
    return bad("Invalid issuedAt in signed message");
  }
  const age = Date.now() - issuedMs;
  if (age > MAX_MESSAGE_AGE_MS) {
    return bad("Signed message is stale (>5 min old) — try signing again");
  }
  if (age < -60_000) {
    return bad("Signed message is from the future — try signing again");
  }
  if (parsed.expirationTime) {
    const expMs = new Date(parsed.expirationTime).getTime();
    if (Number.isFinite(expMs) && expMs < Date.now()) {
      return bad("Signed message has expired — try signing again");
    }
  }

  // 6. Statement contains the issuing Discord ID (defence in depth)
  if (!parsed.statement.includes(`id ${auth.discord_id}`)) {
    return bad("Signature statement does not match the issuing Discord user");
  }

  // 7. Verify ECDSA signature against claimed address (the heart of it)
  if (!isAddress(parsed.address)) {
    return bad("Invalid wallet address in signed message");
  }
  // Client-side address must match the address in the message (no spoofing)
  if (parsed.address.toLowerCase() !== clientAddress.toLowerCase()) {
    return bad("Client-claimed address doesn't match signed message");
  }
  let signatureValid = false;
  try {
    signatureValid = await verifyMessage({
      address:   parsed.address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
  } catch (e) {
    return bad(`Signature verification threw: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!signatureValid) {
    return bad("Signature verification failed — message was not signed by the claimed address");
  }

  // 8. Normalize address to checksum format
  const checksummed = getAddress(parsed.address);

  // 9. Address-already-linked-to-different-user check
  const { data: existingByAddr } = await db
    .from("linked_wallets")
    .select("discord_id")
    .eq("wallet_address", checksummed)
    .maybeSingle();
  if (existingByAddr && existingByAddr.discord_id !== auth.discord_id) {
    return bad("This wallet is already linked to a different Discord account. Each wallet links to one user.");
  }

  // 10. Upsert mapping
  const { error: upsertErr } = await db
    .from("linked_wallets")
    .upsert({
      discord_id:     auth.discord_id,
      wallet_address: checksummed,
      linked_at:      new Date().toISOString(),
      linked_via:     "siwe",
      chain_id:       parsed.chainId ? Number(parsed.chainId) : 1,
      display_name:   auth.display_name,
    }, { onConflict: "discord_id" });
  if (upsertErr) {
    return bad(`Failed to save mapping: ${upsertErr.message}`, 500);
  }

  // 11. Consume the code + nonce
  const now = new Date().toISOString();
  await db
    .from("linked_wallet_auth_codes")
    .update({ used_at: now, nonce_consumed_at: now })
    .eq("code", code);

  // 12. Referral attribution (Launch Wars, Session 7) — ADDITIVE, best-effort.
  // If this visitor arrived via web3guides.com/launch-wars?ref=CODE, the
  // middleware stashed an httpOnly lw_ref cookie. Bind it to the wallet they just
  // linked → the bridge from the marketing page to their Discord identity. This
  // NEVER blocks linking: any error (incl. SQL 013 not yet applied) is swallowed.
  // Anti-abuse: no self-referral (by discord OR wallet); a wallet can be referred
  // once ever (DB UNIQUE on referred_wallet → duplicate insert silently ignored).
  try {
    const refCode = req.cookies.get("lw_ref")?.value;
    if (refCode) {
      const { data: codeRow } = await db
        .from("launch_wars_referral_codes")
        .select("discord_id")
        .eq("code", refCode.toUpperCase())
        .maybeSingle();
      const referrer = codeRow?.discord_id || null;
      if (referrer && referrer !== auth.discord_id) {
        // self-by-wallet guard
        const { data: refWallet } = await db
          .from("linked_wallets")
          .select("wallet_address")
          .eq("discord_id", referrer)
          .maybeSingle();
        const selfByWallet =
          !!refWallet?.wallet_address &&
          refWallet.wallet_address.toLowerCase() === checksummed.toLowerCase();
        if (!selfByWallet) {
          const { data: seasonRow } = await db
            .from("launch_wars_seasons")
            .select("id")
            .eq("is_test", false)
            .eq("status", "ACTIVE")
            .order("id", { ascending: false })
            .limit(1)
            .maybeSingle();
          // Duplicate referred_wallet (UNIQUE) → error returned, not thrown → ignored.
          await db.from("launch_wars_referrals").insert({
            referrer_discord_id: referrer,
            referred_discord_id: auth.discord_id,
            referred_wallet:     checksummed,
            ref_code:            refCode.toUpperCase(),
            method:              "web",
            season_id:           seasonRow?.id ?? null,
            status:              "pending",
          });
        }
      }
    }
  } catch (e) {
    console.error(
      "[wallet/verify] referral attribution skipped:",
      e instanceof Error ? e.message : String(e),
    );
  }

  // Clear the ref cookie so a later link can't double-attribute the same browser.
  const res = NextResponse.json({
    ok: true,
    address:    checksummed,
    discord_id: auth.discord_id,
  });
  res.cookies.set("lw_ref", "", { maxAge: 0, path: "/" });
  return res;
}
