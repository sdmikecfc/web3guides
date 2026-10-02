"use client";
/**
 * THE ONBOARDING STRIP (CRO rebuild 2026-08-17, from the 2026-08-14 audit
 * plan): the below-map funnel for cold visitors. Three steps in the visitor's
 * order of commitment - WATCH (already happening above), PLAY FREE (the CTA
 * enters the real daily run, so guest scores genuinely bank on enlist), and
 * ENLIST (free at /s6/join; backing a domain is from $5) - plus the proof
 * bar, the honest FAQ, and the mini slice board. Every jargon term defines
 * itself inline at first use (LIBERATED, mech, Signal, Doma, Scrap).
 *
 * Client component now: the funnel refs (strip-play / strip-enlist /
 * strip-wallet / faq-open / slice-board-domain) fire through lib/s6/track.
 *
 * PROOF BAR LAW: every number derives from src/app/record/data.ts (THESIS +
 * PAYMENTS, the transcription-verified all-time record), never hardcoded.
 * NOTE for a future pass: record/data.ts also exports RECORD_KEY (the
 * unlisted /record link key); a client import relies on tree-shaking to keep
 * that constant out of the bundle. Move RECORD_KEY to its own module if that
 * secrecy ever needs to harden.
 *
 * Copy: NEW strings staged in ./stripStrings pending the strings.ts locale
 * pass; the two shared keys reused from strings.ts (common.onlyBreachedPay,
 * map.previewBadge) render through the RaidStrip clientLocale pattern.
 *
 * Copy laws: never "win $X"; pool language = holders share; no em-dashes.
 */
import { useEffect, useState } from "react";
import Link from "next/link";

import { PAYMENTS, THESIS } from "../../record/data";
import { POOL_FULL_USD } from "@/lib/s6/games";
import { DOMA_HELP as HELP } from "@/lib/s6/help";
import { clientLocale } from "@/lib/s6/locale";
import { STRINGS, fill, type S6Dict } from "@/lib/s6/strings";
import { track } from "@/lib/s6/track";

/** One slice-board row. page.tsx's LiteTarget satisfies this structurally. */
export interface SliceTargetLite {
  domain: string;
  name: string;
  status: string;
  /** Whole-percent peak (paid basis); bonded rows arrive as 100. */
  peakPct: number;
  /** The mainframe's slice of the season pool, USD (optional pre-money). */
  sliceUsd?: number;
}

interface Props {
  playHref: string; // today's game, the REAL daily run (guest scores bank)
  targets: SliceTargetLite[];
  demo: boolean;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export function OnboardStrip({ playHref, targets, demo }: Props) {
  // Localized via the RaidStrip clientLocale pattern; en is the SSR default.
  const [dict, setDict] = useState<S6Dict>(STRINGS.en);
  useEffect(() => {
    const loc = clientLocale();
    if (loc !== "en") setDict(STRINGS[loc]);
  }, []);
  const d = dict.ob;

  // The proof numbers: THESIS carries the verified totals; the failed count is
  // summed from the payment batches so a future non-zero can never be masked.
  const failedTotal = PAYMENTS.reduce((s, p) => s + p.failed, 0);
  const sliceTitle = fill(d.sliceTitle, { pool: money(POOL_FULL_USD) });

  return (
    <section className="s6ob" aria-label={d.aria}>
      <div className="s6ob-proof" data-testid="proof-bar">
        <span>
          <b>{THESIS.paidTotal}</b> {d.proofPaidTail}
        </span>
        <i />
        <span>
          <b>{THESIS.transfers}</b> {d.proofTransfersTail}
        </span>
        <i />
        <span>
          <b>{failedTotal}</b> {d.proofFailedTail}
        </span>
        <i />
        <span>
          <b>100%</b> {d.proofFreeTail}
        </span>
      </div>

      <div className="s6ob-cards">
        <div className="s6ob-card">
          <div className="s6ob-step">{d.step1Tag}</div>
          <h3>{d.step1Title}</h3>
          <p>{d.step1Body}</p>
        </div>
        <Link
          href={playHref}
          className="s6ob-card s6ob-card-hot"
          onClick={() => track("cta_click", { ref: "strip-play" })}
        >
          <div className="s6ob-step">{d.step2Tag}</div>
          <h3>{d.step2Title}</h3>
          <p>{d.step2Body}</p>
          <span className="s6ob-cta">{d.step2Cta}</span>
        </Link>
        <div className="s6ob-card">
          <div className="s6ob-step">{d.step3Tag}</div>
          <h3>{d.step3Title}</h3>
          <p>{d.step3Body}</p>
          <Link
            href="/s6/join"
            className="s6ob-cta"
            data-testid="strip-enlist"
            onClick={() => track("cta_click", { ref: "strip-enlist" })}
          >
            {d.step3Cta}
          </Link>
          <span className="s6ob-ctasub">{d.step3CtaSub}</span>
          <p className="s6ob-sec">
            <a
              href={HELP.wallet}
              target="_blank"
              rel="noreferrer"
              onClick={() => track("cta_click", { ref: "strip-wallet" })}
            >
              {d.step3Secondary}
            </a>
          </p>
        </div>
      </div>

      <details
        className="s6ob-faq"
        onToggle={(e) => {
          if (e.currentTarget.open) track("cta_click", { ref: "faq-open" });
        }}
      >
        <summary>{d.faqTitle}</summary>
        <dl>
          <dt>{d.faq1Q}</dt>
          <dd>
            {d.faq1A}{" "}
            <a
              href={HELP.wallet}
              target="_blank"
              rel="noreferrer"
              onClick={() => track("cta_click", { ref: "strip-wallet" })}
            >
              {d.faq1Link}
            </a>
            .
          </dd>
          <dt>{d.faq2Q}</dt>
          <dd>
            {d.faq2A}{" "}
            <a href={HELP.buying} target="_blank" rel="noreferrer">
              {d.faq2Link}
            </a>
            . {d.faq2B}
          </dd>
          <dt>{d.faqDomaQ}</dt>
          <dd>{d.faqDomaA}</dd>
          <dt>{d.faq3Q}</dt>
          <dd>{d.faq3A}</dd>
          <dt>{d.faq4Q}</dt>
          <dd>{d.faq4A}</dd>
          <dt>{d.faq5Q}</dt>
          <dd>{d.faq5A}</dd>
        </dl>
      </details>

      {/* MINI SLICE BOARD: the fort-card money pair as a list. Rows return the
          visitor to the battlefield above (no per-fort deep link exists). */}
      <section className="s6ob-slices" aria-label={sliceTitle} data-testid="slice-board">
        <h4>{sliceTitle}</h4>
        <p className="s6ob-slices-lead">{dict.common.onlyBreachedPay}</p>
        <ul>
          {targets.map((t) => {
            const pct = Math.max(0, Math.min(100, Math.round(t.peakPct)));
            return (
              <li key={t.domain}>
                <button
                  type="button"
                  onClick={() => {
                    track("cta_click", { ref: "slice-board-domain", domain: t.domain });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <span className="s6ob-slice-name">{t.name}</span>
                  <span className="s6ob-slice-pair">
                    <b>{t.sliceUsd != null ? money(t.sliceUsd) : dict.map.tba}</b> · {pct}%
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {demo ? <p className="s6ob-slices-demo">{dict.map.previewBadge}</p> : null}
      </section>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </section>
  );
}

/* Second pass 2026-08-17: shared page rhythm (1120 column, 30px between
 * sections, 18px card padding), proof numbers big and mono over an
 * ember-bracketed console bar, hover warm-up + lift on the step cards, and
 * the house eyebrow treatment on section headers. */
const CSS = `
.s6ob{max-width:1160px;margin:0 auto;padding:30px 20px 48px;}
.s6ob-proof{position:relative;display:grid;grid-template-columns:1fr auto 1fr auto 1fr auto 1fr;
  gap:12px;align-items:center;background:rgba(14,17,24,.78);border:1px solid rgba(240,179,64,.28);
  border-radius:4px;padding:16px 22px;margin-bottom:30px;backdrop-filter:blur(4px);}
.s6ob-proof::before,.s6ob-proof::after{content:"";position:absolute;width:16px;height:16px;pointer-events:none;}
.s6ob-proof::before{top:-1px;left:-1px;border-top:2px solid #f0b340;border-left:2px solid #f0b340;}
.s6ob-proof::after{bottom:-1px;right:-1px;border-bottom:2px solid #f0b340;border-right:2px solid #f0b340;}
.s6ob-proof span{display:flex;flex-direction:column;gap:3px;align-items:center;text-align:center;
  font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#8a93a2;}
.s6ob-proof b{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums;
  font-size:22px;line-height:1.1;color:#f0b340;}
.s6ob-proof i{width:1px;height:28px;background:#2a3345;}
@media (max-width:700px){
  .s6ob-proof{grid-template-columns:1fr 1fr;gap:14px 10px;padding:14px 16px;}
  .s6ob-proof i{display:none;}
}
.s6ob-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;}
.s6ob-card{background:rgba(18,21,29,.85);border:1px solid #242c3e;border-radius:14px;padding:18px 20px;
  color:inherit;text-decoration:none;display:block;
  transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease;}
.s6ob-card:hover{border-color:#3a4560;transform:translateY(-2px);box-shadow:0 10px 26px rgba(0,0,0,.35);}
.s6ob-card-hot{border-color:#e0662e;background:linear-gradient(180deg,rgba(28,21,14,.9),rgba(18,21,29,.85));}
.s6ob-card-hot:hover{border-color:#f0b340;box-shadow:0 10px 26px rgba(224,102,46,.18);}
.s6ob-step{font-size:11px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:#8a93a2;margin-bottom:6px;}
.s6ob-card h3{margin:0 0 6px;font-size:17px;color:#f0f0eb;}
.s6ob-card p{margin:0;font-size:13px;line-height:1.55;color:#aab3c0;}
.s6ob-card a{color:#7dd3fc;}
.s6ob-cta{display:inline-block;margin-top:12px;background:#e0662e;color:#0b0d10;font-weight:800;
  font-size:13px;letter-spacing:.06em;border-radius:8px;padding:8px 14px;}
a.s6ob-cta{color:#0b0d10;text-decoration:none;}
.s6ob-ctasub{display:block;margin-top:6px;font-size:11.5px;color:#8a93a2;}
.s6ob-sec{margin-top:8px;}
.s6ob-faq{margin-top:30px;background:rgba(18,21,29,.85);border:1px solid #242c3e;border-radius:14px;
  padding:18px 20px;transition:border-color .15s ease;}
.s6ob-faq:hover{border-color:#3a4560;}
.s6ob-faq summary{cursor:pointer;font-weight:800;color:#f0f0eb;font-size:12px;letter-spacing:.18em;text-transform:uppercase;}
.s6ob-faq dt{color:#f0b340;font-size:13.5px;font-weight:700;margin-top:12px;}
.s6ob-faq dd{margin:4px 0 0;font-size:13px;line-height:1.55;color:#aab3c0;}
.s6ob-faq a{color:#7dd3fc;}
.s6ob-slices{margin-top:30px;background:rgba(18,21,29,.85);border:1px solid #242c3e;border-radius:14px;
  padding:18px 20px;transition:border-color .15s ease;}
.s6ob-slices:hover{border-color:#3a4560;}
.s6ob-slices h4{margin:0;font-size:12px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:#f0b340;}
.s6ob-slices-lead{margin:4px 0 10px;font-size:12.5px;line-height:1.5;color:#8a93a2;}
.s6ob-slices ul{list-style:none;margin:0;padding:0;display:grid;
  grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:4px 18px;}
.s6ob-slices button{display:flex;justify-content:space-between;align-items:baseline;gap:10px;
  width:100%;background:none;border:0;border-bottom:1px solid #1c2333;border-radius:0;
  padding:6px 2px;margin:0;font:inherit;font-size:13px;color:#aab3c0;cursor:pointer;text-align:left;}
.s6ob-slices button:hover{color:#f0f0eb;}
.s6ob-slice-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.s6ob-slice-pair{white-space:nowrap;}
.s6ob-slice-pair b{color:#f0b340;font-weight:700;}
.s6ob-slices-demo{margin:10px 0 0;font-size:11px;letter-spacing:.08em;color:#8a93a2;}
`;
