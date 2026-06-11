/**
 * Wallet-link landing page.
 *
 * Server component: validates the magic-link code, looks up the issuing
 * Discord user, and hands the form (client component) a clean payload.
 * No wallet logic here — that's all in form.tsx.
 */

import { fantasyDb } from "@/lib/fantasy/supabase";
import { LinkForm } from "./form";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const C = {
  bgFrom:      "#070b1a",
  bgMid:       "#0a0e27",
  bgTo:        "#1a0b3d",
  violet:      "#7c6aff",
  violetLight: "#a78bfa",
  white:       "#f8fafc",
  muted:       "#7a89b8",
  amber:       "#f0b340",
  green:       "#34d399",
  rose:        "#f87171",
};

export default async function WalletLinkPage({ params }: { params: { code: string } }) {
  const code = params.code;
  if (!code || code.length < 30) {
    redirect("/wallet/error?reason=invalid");
  }

  const db = fantasyDb();
  const { data: row } = await db
    .from("linked_wallet_auth_codes")
    .select("code, discord_id, display_name, expires_at, used_at, nonce")
    .eq("code", code)
    .maybeSingle();

  if (!row) {
    redirect("/wallet/error?reason=unknown");
  }
  if (row.used_at) {
    redirect("/wallet/error?reason=used");
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    redirect("/wallet/error?reason=expired");
  }

  // Check if this user already has a linked wallet — if yes, show "re-link" UX
  const { data: existing } = await db
    .from("linked_wallets")
    .select("wallet_address, linked_at")
    .eq("discord_id", row.discord_id)
    .maybeSingle();

  return (
    <main
      style={{
        minHeight: "100vh",
        background: `linear-gradient(135deg, ${C.bgFrom} 0%, ${C.bgMid} 50%, ${C.bgTo} 100%)`,
        color: C.white,
        fontFamily: "Inter, system-ui, sans-serif",
        padding: "48px 16px 64px",
      }}
    >
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              fontSize: 12, color: C.amber, letterSpacing: 4,
              textTransform: "uppercase", fontWeight: 700, marginBottom: 8,
            }}
          >
            🔗 Doma Reporter · wallet linking
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0, marginBottom: 8 }}>
            Link a wallet to your Discord
          </h1>
          <p style={{ fontSize: 15, color: C.muted, margin: 0, lineHeight: 1.6 }}>
            Linking as <b style={{ color: C.violetLight }}>{row.display_name || row.discord_id}</b>.
            This lets the bot pay rewards directly to your wallet and unlocks trade-tracked games.
          </p>
        </div>

        {/* What it does / doesn't do */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              background: "rgba(52,211,153,0.08)",
              border: `1px solid ${C.green}33`,
              borderRadius: 10,
              padding: "14px 16px",
            }}
          >
            <div style={{ fontSize: 12, color: C.green, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>
              THIS WILL
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.white, lineHeight: 1.7 }}>
              <li>Prove you control the wallet</li>
              <li>Save the mapping in our DB</li>
              <li>Let you receive game rewards</li>
            </ul>
          </div>
          <div
            style={{
              background: "rgba(248,113,113,0.06)",
              border: `1px solid ${C.rose}33`,
              borderRadius: 10,
              padding: "14px 16px",
            }}
          >
            <div style={{ fontSize: 12, color: C.rose, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>
              THIS WILL NOT
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.white, lineHeight: 1.7 }}>
              <li>Move any funds</li>
              <li>Approve any transactions</li>
              <li>Cost any gas</li>
            </ul>
          </div>
        </div>

        {existing && (
          <div
            style={{
              padding: "14px 18px",
              background: "rgba(240,179,64,0.08)",
              border: `1px solid ${C.amber}33`,
              borderRadius: 10,
              fontSize: 13,
              color: C.amber,
              marginBottom: 20,
              lineHeight: 1.5,
            }}
          >
            ⚠️ You already have <code style={{ color: C.white }}>{existing.wallet_address}</code> linked
            (since {new Date(existing.linked_at).toLocaleDateString()}). Continuing will{" "}
            <b>replace</b> that link with the new wallet you connect below.
          </div>
        )}

        {/* The form (client component) */}
        <LinkForm
          code={code}
          discordId={row.discord_id}
          displayName={row.display_name || row.discord_id}
          nonce={row.nonce}
        />

        {/* Footer */}
        <div
          style={{
            marginTop: 28,
            padding: "12px 16px",
            background: "rgba(124,106,255,0.05)",
            border: `1px solid ${C.violet}22`,
            borderRadius: 8,
            fontSize: 12,
            color: C.muted,
            lineHeight: 1.6,
          }}
        >
          🔒 This page uses <b style={{ color: C.violetLight }}>Sign-In-With-Ethereum (SIWE)</b> — an industry
          standard for wallet identity proofs used by OpenSea, Uniswap, Coinbase, and most major dApps. Your
          wallet will show a <b>"Sign Message"</b> prompt (not "Confirm Transaction"). The signature is pure
          cryptography — it proves you control the wallet without giving us any access to it.
        </div>
      </div>
    </main>
  );
}
