/**
 * STARFALL (Launch Wars S3) — server helpers (service-role; never import in client).
 * Wallet-first identity: a wallet-ownership signature creates the pilot. Mirrors the
 * proven viem verify pattern from /api/wallet/verify (no siwe lib).
 */
import { createServiceClient } from "@/lib/supabase/server";
import { isAddress, getAddress, verifyMessage } from "viem";

export const SEASON_KEY = "s3";
export const CREWS = ["vanguard", "nebula", "pulsar"] as const;
export type Crew = (typeof CREWS)[number];

export function starsDb() {
  return createServiceClient();
}

const MAX_MESSAGE_AGE_MS = 5 * 60 * 1000;
const ALLOWED_DOMAINS = new Set(
  [
    "web3guides.com",
    "www.web3guides.com",
    "stars.web3guides.com",
    process.env.WALLET_LINK_DOMAIN_OVERRIDE || "",
  ].filter(Boolean),
);

type Verified = { address: `0x${string}` } | { error: string };

/**
 * Verify a plain-text wallet-ownership signature (EIP-191 personal_sign, as wagmi
 * signMessage produces). Defence-in-depth freshness + domain checks if the message
 * carries them (EIP-4361 template); the ECDSA check is the heart of it. EOA-focused.
 */
export async function verifyOwnership(
  message: string,
  signature: string,
  address: string,
): Promise<Verified> {
  if (!isAddress(address)) return { error: "Invalid wallet address" };

  const issued = message.match(/Issued At:\s*(.+)/)?.[1]?.trim();
  if (issued) {
    const ms = new Date(issued).getTime();
    if (Number.isFinite(ms) && Date.now() - ms > MAX_MESSAGE_AGE_MS) {
      return { error: "Signature is stale (>5 min). Sign again." };
    }
  }
  const domain = message.match(/^(\S+) wants you to/)?.[1];
  if (domain && !ALLOWED_DOMAINS.has(domain)) {
    return { error: `Domain mismatch: ${domain}` };
  }

  let ok = false;
  try {
    ok = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
  } catch (e) {
    return { error: `Signature verify threw: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!ok) return { error: "Signature verification failed" };
  return { address: getAddress(address) };
}

/** Auto-balance default: the crew with the fewest real pilots (anti-bandwagon). */
export async function smallestCrew(db: ReturnType<typeof starsDb>): Promise<Crew> {
  let best: Crew = CREWS[0];
  let bestCount = Infinity;
  for (const crew of CREWS) {
    const { count } = await db
      .from("launch_wars_s3_pilots")
      .select("id", { count: "exact", head: true })
      .eq("season_key", SEASON_KEY)
      .eq("crew", crew)
      .eq("is_test", false);
    const c = count ?? 0;
    if (c < bestCount) {
      bestCount = c;
      best = crew;
    }
  }
  return best;
}

/**
 * A wallet that was already linked to Discord in a prior season (proven via SIWE
 * back then) is a RETURNING player. We trust that prior proof so they enlist
 * without re-signing — the fix for "I already connected this wallet for the other
 * games." `wallet` is lowercased; linked_wallets stores checksummed → ilike.
 */
export async function isReturningWallet(
  db: ReturnType<typeof starsDb>,
  wallet: string,
): Promise<boolean> {
  const { data } = await db
    .from("linked_wallets")
    .select("discord_id")
    .ilike("wallet_address", wallet)
    .maybeSingle();
  return !!data;
}
