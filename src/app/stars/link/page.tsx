/**
 * STARFALL /link — connect a wallet-first pilot to Discord (stars.web3guides.com/link).
 * Server shell + the client LinkForm. Premium dark, on-brand; mirrors /join.
 */
import { LinkForm } from "./form";

export const metadata = {
  title: "Link Discord — Starfall",
  description: "Connect your Starfall wallet to your Discord so /stars me knows you.",
};

const GOLD = "#f0b340";
const VOID = "#080b14";

export default function LinkPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        background: `radial-gradient(1000px 500px at 50% -10%, #131a2e 0%, ${VOID} 60%)`,
        color: "#e8ecf5",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "56px 20px",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: 440 }}>
        <a
          href="/"
          style={{
            display: "block",
            textAlign: "center",
            letterSpacing: "0.3em",
            fontSize: 11,
            color: GOLD,
            textTransform: "uppercase",
            textDecoration: "none",
            marginBottom: 6,
          }}
        >
          Launch Wars · Season 3
        </a>
        <h1
          style={{
            textAlign: "center",
            fontSize: 34,
            fontWeight: 800,
            margin: "0 0 6px",
            background: `linear-gradient(180deg, #ffffff 0%, ${GOLD} 140%)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Link your Discord
        </h1>
        <p style={{ textAlign: "center", color: "#aeb6c8", fontSize: 15, margin: "0 0 28px" }}>
          One pilot, one wallet, one Discord. Connect them so <b>/stars me</b> knows you.
        </p>
        <LinkForm />
      </div>
    </main>
  );
}
