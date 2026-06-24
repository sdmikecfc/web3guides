import type { Metadata } from "next";
import localFont from "next/font/local";
import { Cinzel } from "next/font/google";
import "../seas.css";

/**
 * LAUNCH WARS · SEASON 2 — Official Rules / Terms.
 * Served at seas.web3guides.com/seas/rules. Plain-language contest terms so a
 * paid-entry, cash-prize community game has clear cover: eligibility, the free
 * no-purchase path, no cash value of in-game currency, not financial advice,
 * fair play. Linked from /seas and from the bot's !seas rules.
 *
 * NOTE: this is a starting draft written to be defensible and honest. Have a
 * lawyer read it before the season goes live, and set the specific excluded
 * jurisdictions for your audience.
 */

const aktiv = localFont({
  src: [
    { path: "../fonts/AktivGrotesk_Rg.ttf", weight: "400", style: "normal" },
    { path: "../fonts/AktivGrotesk_Md.ttf", weight: "500", style: "normal" },
    { path: "../fonts/AktivGrotesk_SBd.ttf", weight: "600", style: "normal" },
  ],
  variable: "--font-aktiv",
  display: "swap",
});
const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-cinzel",
  display: "swap",
});

export const metadata: Metadata = {
  title: { absolute: "Launch Wars · Official Rules" },
  description:
    "Official Rules for Launch Wars on Doma: who can play, the free no-purchase path, prizes, and fair play. In-game doubloons and Glory have no cash value.",
};

const DISCORD_URL = "https://discord.gg/doma";
const MAIN_SITE = "https://web3guides.com";

const RULES: { h: string; body: string[] }[] = [
  {
    h: "1. What this is",
    body: [
      "Launch Wars is a free-to-start community game and skill contest run on the Doma community. You sail with a fleet, play daily duties, and earn glory and bragging rights. A prize pool is shared at the end of each season based on play and participation.",
    ],
  },
  {
    h: "2. Who can play",
    body: [
      "You must be at least 18 years old, or the age of majority where you live, whichever is higher.",
      "The contest is void where prohibited by law. It is not open where contests of this kind, crypto promotions, or token trading are restricted. You are responsible for knowing the laws where you live. If you are not eligible, you may still play for fun, but you cannot receive a cash prize.",
    ],
  },
  {
    h: "3. No purchase necessary",
    body: [
      "You never have to spend money to play. Any community member gets a free starter ship and can play every duty, earn doubloons, fit their ship, and join battles for glory and status.",
      "Buying or holding a fleet token is optional. It is your own trading decision, made on your own wallet through Doma, and it is not required to take part.",
    ],
  },
  {
    h: "4. Doubloons and Glory have no cash value",
    body: [
      "Doubloons, Glory, fittings, cosmetics, and any other in-game item are points for playing the game only. They have no cash value. They cannot be bought, sold, transferred, withdrawn, or redeemed for money or crypto.",
    ],
  },
  {
    h: "5. Prizes",
    body: [
      "Cash prizes are awarded at the end of a season as a skill-and-participation contest, not as a payout on any single game result.",
      "To be eligible for a cash prize you must link a wallet, meet the stated minimum participation for that week, follow these rules, and pass anti-cheat and identity checks. Prize amounts, the split across fleets and placements, and timing are described in the season announcements and are paid at the organizer's reasonable discretion under these rules.",
      "Prizes may be reduced, withheld, or reassigned if a winner cannot be verified, is ineligible, or broke these rules.",
    ],
  },
  {
    h: "6. Not financial advice",
    body: [
      "Nothing in Launch Wars is financial, investment, or trading advice, and nothing here is an offer, inducement, or signal to buy, sell, or hold any token.",
      "Buying and holding domain tokens is trading with real risk. Prices can fall. You can lose money trading, separately from anything that happens in the game. Only you are responsible for your own trades.",
    ],
  },
  {
    h: "7. Fair play",
    body: [
      "Play it straight. Cheating, scripting or botting, using more than one account, sharing or selling accounts, abusing bugs, or gaming the scoring will void your rewards and can remove you from the game.",
      "Scores are checked by the server. The organizer may correct scores, standings, or payouts to keep the game fair.",
    ],
  },
  {
    h: "8. Changes and decisions",
    body: [
      "These rules and the game may change during a season as the game is balanced and fixed. Material changes will be posted in the community. The organizer's decisions about scoring, eligibility, and prizes are final.",
    ],
  },
  {
    h: "9. Who runs this",
    body: [
      "Launch Wars is run by the web3guides community team on the Doma community. Taking part does not create any partnership, employment, or guarantee. The game is provided as is, without warranties, to the fullest extent the law allows.",
      "Questions: ask in the Discord.",
    ],
  },
];

export default function SeasRulesPage() {
  return (
    <main
      className={`seas-root ${aktiv.variable} ${cinzel.variable}`}
      style={{ minHeight: "100vh", padding: "0 0 64px" }}
    >
      <section className="seas-section" style={{ maxWidth: 820, margin: "0 auto" }}>
        <p className="section-eyebrow">Launch Wars</p>
        <h1 className="section-title" style={{ marginBottom: 8 }}>
          Official Rules
        </h1>
        <p className="section-sub" style={{ marginBottom: 8 }}>
          Free to start. In-game doubloons and Glory are points for playing and have no cash value.
          Last updated for Season 2 (June 2026).
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 28 }}>
          {RULES.map((r) => (
            <div key={r.h}>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--gold, #f0b45c)", margin: "0 0 8px" }}>
                {r.h}
              </h2>
              {r.body.map((p, i) => (
                <p
                  key={i}
                  style={{ fontSize: 15, lineHeight: 1.6, color: "rgba(248,253,255,0.82)", margin: "0 0 8px" }}
                >
                  {p}
                </p>
              ))}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 36, display: "flex", gap: 16, flexWrap: "wrap" }}>
          <a className="btn btn-primary" href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
            Join the Discord
          </a>
          <a className="btn btn-nav" href="/seas">
            Back to the season
          </a>
        </div>
        <p style={{ marginTop: 24, fontSize: 13, color: "rgba(248,253,255,0.5)" }}>
          <a href={MAIN_SITE} style={{ color: "inherit" }}>
            web3guides.com
          </a>
        </p>
      </section>
    </main>
  );
}
