/**
 * STARFALL /join — the enlist page (stars.web3guides.com/join).
 * Server shell + the client JoinForm (wallet-first). Premium dark, on-brand.
 */
import { JoinForm } from "./form";

export const metadata = {
  title: "Join Starfall — Launch Wars Season 3",
  description: "Enlist with your wallet. Five stars. Three crews. Light them all.",
};

const GOLD = "#f0b340";
const VOID = "#080b14";

const howCard: React.CSSProperties = {
  background: "rgba(13,17,32,0.6)",
  border: `1px solid ${GOLD}22`,
  borderRadius: 10,
  padding: "12px 14px",
};
const howLabel: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 2,
  color: GOLD,
  fontWeight: 700,
  textTransform: "uppercase",
  marginBottom: 5,
};
const howText: React.CSSProperties = { fontSize: 13.5, color: "#c2cadb", lineHeight: 1.55, margin: 0 };

export default function JoinPage() {
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
          Enlist in Starfall
        </h1>
        <p style={{ textAlign: "center", color: "#aeb6c8", fontSize: 15, margin: "0 0 22px" }}>
          Five stars. Three crews. Light them all.
        </p>

        {/* Cold-visitor explainer: a referral or Slack arrival lands here and must understand the
            game and how payouts work before they connect a wallet. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "0 0 24px" }}>
          <div style={howCard}>
            <div style={howLabel}>What is Starfall</div>
            <p style={howText}>
              Five real domains launch on Doma this week. In the game they are five dark stars. Buy and
              hold them to make <b style={{ color: "#fff" }}>Starlight</b> (fuel) for your crew. Three crews compete.
            </p>
          </div>
          <div style={howCard}>
            <div style={howLabel}>How you get paid</div>
            <p style={howText}>
              The <b style={{ color: GOLD }}>top 3 crews split a $1,000 prize pool</b> by how much Starlight they
              make. Your cut grows with how much you fuel, and you must hold at least <b style={{ color: "#fff" }}>$5</b>.
              Only <b style={{ color: "#fff" }}>bonded</b> stars pay. You hold any of the five stars, not one specific domain.
            </p>
          </div>
          <div style={howCard}>
            <div style={howLabel}>Start in 3 steps</div>
            <p style={howText}>
              1. Connect your wallet below.
              <br />
              2. Fuel a star from $5 and you are assigned a crew.
              <br />
              3. Play the mini-games for Salvage and post on X for bonus Starlight.
            </p>
          </div>
        </div>

        <JoinForm />
      </div>
    </main>
  );
}
