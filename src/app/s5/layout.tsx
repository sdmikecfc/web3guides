/**
 * Season 5 ROOT layout (the S4 ADR: ONE root layout, ONE WalletProviders for
 * the whole /s5 tree, so the wallet connects ONCE and stays connected across
 * every page and game; the provider mounts here and never unmounts during
 * client-side nav). S5TopNav is a FIXED overlay, never in a page's layout
 * flow, so it cannot break the HQ scene or the full-screen games.
 */
import { WalletProviders } from "@/app/wallet/providers";
import { S5TopNav } from "./_components/S5TopNav";

export const metadata = {
  title: "Launch Wars S5: Iron Siege | Your Personal HQ",
  description:
    "Every commander gets a bunker. Hold a featured domain from $5, earn Medals daily, and breach strongholds with The Iron Column.",
};

/* SKIP LINK (2026-07-24 a11y audit): the fixed nav puts ~12 tab stops (6 nav
   links + 3 language chips + Connect) before content on EVERY route. Visually
   hidden until focused, then it lands on the page's main landmark. English
   only by design: it is the first thing a screen reader hits, and the locale
   dict is not resolved this high in the tree. */
const GROUND_CSS = `
/* THE S5 GROUND. A single flat near-black behind a painted hero is what read
   as "still a black background" on desktop: nothing for the eye to rest on
   beside the picture, and a hard band at the top of the page. This gives the
   ground depth with light alone (ADR-0083 forbids a second recognisable scene
   behind a painted hero): a warm ember glow where the camp light falls, two
   cool steel washes at the flanks so the rails read as objects in a room, and
   a deeper floor. Fixed attachment so it does not slide under long pages. */
.s5-ground {
  min-height: 100dvh;
  background:
    radial-gradient(1200px 620px at 50% -6%, rgba(224,102,46,0.14) 0%, rgba(224,102,46,0) 62%),
    radial-gradient(900px 560px at 10% 30%, rgba(154,167,180,0.10) 0%, rgba(154,167,180,0) 70%),
    radial-gradient(900px 560px at 90% 26%, rgba(154,167,180,0.08) 0%, rgba(154,167,180,0) 70%),
    linear-gradient(180deg, #151a20 0%, #0f1318 42%, #0b0e12 100%);
  background-attachment: fixed;
}
@media (prefers-reduced-motion: reduce) { .s5-ground { background-attachment: scroll; } }
`;

const SKIP_CSS = `
.s5-skip{position:absolute;left:-9999px;top:0;z-index:2000;
  background:#e0662e;color:#0b0d10;font-weight:800;font-size:14px;
  padding:12px 18px;border-radius:0 0 8px 0;text-decoration:none;}
.s5-skip:focus{left:0;outline:2px solid #0b0d10;outline-offset:-4px;}
`;

export default function S5Layout({ children }: { children: React.ReactNode }) {
  return (
    <WalletProviders>
      <style dangerouslySetInnerHTML={{ __html: `${SKIP_CSS}
${GROUND_CSS}` }} />
      <a className="s5-skip" href="#s5-content">
        Skip to content
      </a>
      <S5TopNav />
      <div className="s5-ground">{children}</div>
    </WalletProviders>
  );
}
