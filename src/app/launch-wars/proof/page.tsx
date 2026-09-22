/**
 * Launch Wars — Results & Proof (tabbed).
 *
 *   /launch-wars/proof
 *
 * A public, shareable record of every captain in Launch Wars. Season 2 is the
 * default tab; Season 1 is preserved unchanged behind its own tab. Built so no
 * one can claim they did a lot and got nothing.
 *
 * Deliberately shows NO payout amounts and NO wallet addresses. It proves
 * participation and points, not prizes. Each season's data is a frozen snapshot:
 * Season 2 from doma-reporter/scripts/s2_audit.js, Season 1 from s1_proof.js,
 * both from settled, on-chain-verified results.
 *
 * Design language matches /launch-wars (EPL meets Bloomberg).
 */
import s1 from "@/data/s1-proof.json";
import s2 from "@/data/s2-proof.json";
import s3 from "@/data/s3-proof.json";
import ProofTabs, { type SeasonConfig } from "./ProofTabs";
import { type ProofRow } from "./ProofTable";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Launch Wars — Results & Proof",
  description:
    "Every captain in Launch Wars, their points, and where they finished. Public proof of participation across every season. No payout amounts, no wallet addresses.",
  openGraph: {
    title: "Launch Wars — Results & Proof",
    description:
      "Every captain, their points, and where they finished. Public proof of participation in Launch Wars on Doma.",
    type: "website",
    url: "https://web3guides.com/launch-wars/proof",
  },
  twitter: { card: "summary_large_image", title: "Launch Wars — Results & Proof" },
};

const T = { bg: "#0a0d14", text: "#e9edf5" };
const C = { green: "#34d399", mut: "#97a0b5", rose: "#fb6f84", amber: "#fbbf24", cyan: "#38bdf8", dim: "#626b82" };
const MAXW = 1140;

// ── Season 3 (STARFALL) — default tab ────────────────────────────────────────
// Data: doma-reporter/scripts/s3_proof.js (read-only, from the same pilots
// table the settlement paid from + s3_payouts.csv as the paid set).
const s3Config: SeasonConfig = {
  key: "s3",
  tabLabel: "Season 3",
  eyebrow: "Launch Wars · Season 3 · STARFALL",
  intro:
    "Every pilot who flew in Season 3, what they earned, and where they finished. This page is the public record, so no one can claim they did a lot and walked away with nothing.",
  intro2:
    "It shows Starlight and the dollars each pilot held into the season. It does not show payout amounts or wallet addresses. It proves participation and points, not prizes.",
  banner: s3.pendingPayment ? `Payment pending. Expect payment during ${s3.paymentWindow}.` : null,
  tiles: [
    { value: String(s3.totals.participants), label: "Pilots" },
    { value: String(s3.totals.winners), label: "Paid winners" },
    { value: s3.winningFleet || "—", label: "Winning crew" },
  ],
  legend: [
    { label: "Paid", color: C.green, note: "Held at least $5 into a star that bonded. Every crew placed, so every qualified pilot has a share: crew placement sets the pot, Starlight sets the cut." },
    { label: "Paid to wallet", color: C.cyan, note: "Qualified on holdings and paid straight to the wallet. These pilots joined by wallet and never linked a Discord account, so there is no name to show against the payment." },
    { label: "Under the $5 minimum", color: C.amber, note: "Held a star token, but less than the $5 needed to qualify for a cash share." },
    { label: "Participated", color: C.dim, note: "Joined and took part, with no qualifying held position recorded." },
  ],
  tableLabels: { points: "Starlight", secondary: "Held" },
  rows: s3.rows as ProofRow[],
  footer:
    "Starlight is the final Season 3 score on each pilot's registered wallet. Held is the dollars in star tokens at the season freeze, verified on-chain. All three crews placed (first, second, third), so the pool paid across every crew, split within each by Starlight. The qualifying test was holdings alone: $5 or more in a star that bonded. Pilots who joined by wallet and never linked Discord were paid to that wallet. The one alien bounty that fired is included in its attacker's payment.",
  generated: new Date(s3.generatedAt).toISOString().slice(0, 10),
};

// ── Season 2 (Conquer the Seas) ──────────────────────────────────────────────
const s2Config: SeasonConfig = {
  key: "s2",
  tabLabel: "Season 2",
  eyebrow: "Launch Wars · Season 2 · Conquer the Seas",
  intro:
    "Every captain who took part in Season 2, what they earned, and where they finished. This page is the public record, so no one can claim they did a lot and walked away with nothing.",
  intro2:
    "It shows Glory and the dollars each captain held into the season. It does not show payout amounts or wallet addresses. It proves participation and points, not prizes.",
  banner: s2.pendingPayment ? `Payment pending. Expect payment during ${s2.paymentWindow}.` : null,
  tiles: [
    { value: String(s2.totals.participants), label: "Captains" },
    { value: String(s2.totals.winners), label: "Paid winners" },
    { value: s2.winningFleet || "—", label: "Winning crew" },
  ],
  legend: [
    { label: "Paid", color: C.green, note: "On a top-three bonded crew (1st, 2nd, or 3rd), holding at least $5. Their share has been sent." },
    { label: "Fleet did not place", color: C.mut, note: "Earned points, but their crew did not finish as a top-three bonded crew." },
    { label: "Under the $5 minimum", color: C.amber, note: "Held a crew token, but less than the $5 needed to qualify for a cash share." },
    { label: "Participated", color: C.dim, note: "Joined and took part, with no qualifying held position recorded." },
  ],
  tableLabels: { points: "Glory", secondary: "Held" },
  rows: s2.rows as ProofRow[],
  footer:
    "Glory is the final Season 2 score on each captain's registered wallet. Held is the dollars in their crew token at the season freeze, verified on-chain. The top three bonded crews split the prize: first, second, and third. Crews that did not bond, and the raid-excluded crew, were not paid.",
  generated: new Date(s2.generatedAt).toISOString().slice(0, 10),
};

// ── Season 1 — preserved unchanged ───────────────────────────────────────────
const s1Config: SeasonConfig = {
  key: "s1",
  tabLabel: "Season 1",
  eyebrow: "Launch Wars · Season 1",
  intro:
    "Every captain who took part in Season 1, what they earned, and where they finished. This page is the public record, so no one can claim they did a lot and walked away with nothing.",
  intro2:
    "It shows fleet points and boss contribution. It does not show payout amounts or wallet addresses. It proves participation and points, not prizes.",
  banner: null,
  tiles: [
    { value: String(s1.totals.participants), label: "Captains" },
    { value: String(s1.totals.winners), label: "Paid winners" },
    { value: s1.winningFleet || "—", label: "Winning fleet" },
  ],
  legend: [
    { label: "Paid", color: C.green, note: "Earned a share of the prize, on the winning fleet or by dealing at least $10 of held boss damage." },
    { label: "Fleet did not place", color: C.mut, note: "Earned fleet points, but their fleet was not the season winner. Season 1 paid the winning fleet only." },
    { label: "Sold before the end", color: C.rose, note: "Left their fleet, or sold a boss token before the event ended." },
    { label: "Under the $10 boss minimum", color: C.amber, note: "Bought a boss but held less than the $10 needed to share its reward." },
    { label: "Boss did not bond", color: C.cyan, note: "Took part on a boss that did not reach bonding, so no one was paid on it." },
    { label: "Participated", color: C.dim, note: "Joined and took part, with no scored fleet or boss activity recorded." },
  ],
  tableLabels: { points: "Fleet points", secondary: "Boss contribution" },
  rows: s1.rows as ProofRow[],
  footer:
    "Fleet points are the final Launch Wars score on each captain's registered wallet. A score of zero means they did not play the fleet game on that wallet. Boss contribution is the net dollars held into a boss at settlement, verified on-chain. Sold before the end is read from the chain and counts only sells dated before the event ended.",
  generated: new Date(s1.generatedAt).toISOString().slice(0, 10),
};

export default function Page() {
  return (
    <main style={{ background: T.bg, color: T.text, minHeight: "100vh", fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <div style={{ maxWidth: MAXW, margin: "0 auto", padding: "48px 20px 80px" }}>
        <ProofTabs seasons={[s3Config, s2Config, s1Config]} />
      </div>
    </main>
  );
}
