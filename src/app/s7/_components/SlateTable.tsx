"use client";
/**
 * THE SLATE: every domain this season, when it lists, and where to buy it.
 *
 * Community request (2026-08-19, via Mike): "a table of domains and listing
 * dates so it can be viewed clearly, and links would also be desirable."
 *
 * The map answers "how is the war going". It does NOT answer "what is coming
 * and when", because a tower only appears once its domain is live and a fort
 * card is one tap deep. This is the plain schedule: ten rows, sorted the way
 * the season runs, with the date, the state, the percent, what the slice is
 * worth, and a link straight to Doma.
 *
 * Everything here comes from the same snapshot the map draws, so the table
 * can never disagree with the field. Dates render in the VIEWER's timezone
 * (a UTC-only date is what made people ask in the first place), with the UTC
 * time kept in the title attribute for anyone coordinating across zones.
 */
import { useEffect, useState } from "react";
import { buyLink } from "@/lib/s7/funding";
import { clientLocale } from "@/lib/s7/locale";
import { STRINGS, fill, type S7Dict } from "@/lib/s7/strings";
import { track } from "@/lib/s7/track";

export type SlateRow = {
  domain: string;
  name: string;
  status: string; // pending | live | bonded | failed
  peakPct: number;
  progressPct: number;
  sliceUsd: number;
  launchAt: string | null;
};

/** Local-time day + hour, with a UTC tooltip. Null dates read as "TBA". */
function whenLabel(iso: string | null, locale: string): { short: string; utc: string } {
  if (!iso) return { short: "TBA", utc: "" };
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return { short: "TBA", utc: "" };
  const d = new Date(t);
  const short = d.toLocaleString(locale === "en" ? undefined : locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return { short, utc: d.toISOString().replace("T", " ").slice(0, 16) + " UTC" };
}

export function SlateTable({ rows }: { rows: SlateRow[] }) {
  const [dict, setDict] = useState<S7Dict>(STRINGS.en);
  const [loc, setLoc] = useState("en");
  useEffect(() => {
    const l = clientLocale();
    setLoc(l);
    if (l !== "en") setDict(STRINGS[l]);
  }, []);
  const d = dict.slate;

  // live first, then what is coming, then what is finished: the order a
  // player actually cares about, not the raw sort_order
  const rank = (s: string) => (s === "live" ? 0 : s === "pending" ? 1 : s === "bonded" ? 2 : 3);
  const sorted = [...rows].sort((a, b) => {
    const r = rank(a.status) - rank(b.status);
    if (r !== 0) return r;
    const ta = a.launchAt ? Date.parse(a.launchAt) : Infinity;
    const tb = b.launchAt ? Date.parse(b.launchAt) : Infinity;
    return ta - tb;
  });

  const stateLabel = (s: string) =>
    s === "bonded" ? d.stBonded : s === "live" ? d.stLive : s === "failed" ? d.stClosed : d.stSoon;

  return (
    <section className="s7sl" id="slate" aria-label={d.heading}>
      <div className="s7sl-head">
        <h2 className="s7sl-h">{d.heading}</h2>
        <p className="s7sl-sub">{d.sub}</p>
      </div>

      <div className="s7sl-scroll">
        <table className="s7sl-table">
          <thead>
            <tr>
              <th scope="col">{d.colDomain}</th>
              <th scope="col">{d.colWhen}</th>
              <th scope="col">{d.colState}</th>
              <th scope="col" className="s7sl-num">{d.colProgress}</th>
              <th scope="col" className="s7sl-num">{d.colSlice}</th>
              <th scope="col" className="s7sl-act">{d.colLink}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const w = whenLabel(r.launchAt, loc);
              const pct = r.status === "bonded" ? 100 : Math.max(r.progressPct, r.peakPct);
              return (
                <tr key={r.domain} data-state={r.status}>
                  <th scope="row" className="s7sl-dom">
                    {r.domain}
                  </th>
                  <td className="s7sl-when" title={w.utc}>
                    {w.short}
                  </td>
                  <td>
                    <span className={`s7sl-pill s7sl-pill--${r.status}`}>{stateLabel(r.status)}</span>
                  </td>
                  <td className="s7sl-num">
                    {r.status === "pending" ? (
                      <span className="s7sl-dash">-</span>
                    ) : (
                      <span className="s7sl-bar" aria-label={`${pct}%`}>
                        <i style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
                        <b>{pct}%</b>
                      </span>
                    )}
                  </td>
                  <td className="s7sl-num s7sl-slice">
                    {r.sliceUsd > 0 ? `$${Math.round(r.sliceUsd)}` : <span className="s7sl-dash">-</span>}
                  </td>
                  <td className="s7sl-act">
                    {r.status === "pending" ? (
                      <span className="s7sl-dash">{d.notYet}</span>
                    ) : (
                      <a
                        className="s7sl-buy"
                        href={buyLink(r.domain)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => track("cta_click", { ref: "slate-buy", domain: r.domain })}
                      >
                        {r.status === "live" ? d.buy : d.view}
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="s7sl-foot">{fill(d.foot, { n: String(rows.length) })}</p>

      <style>{`
.s7sl{margin:18px 0 6px;}
.s7sl-head{margin-bottom:10px;}
.s7sl-h{font-size:clamp(18px,3.4vw,24px);font-weight:800;letter-spacing:.02em;margin:0 0 4px;color:#e9edf1;}
.s7sl-sub{margin:0;font-size:13.5px;color:#aab4bd;}
.s7sl-scroll{overflow-x:auto;border:1px solid #39424d;border-radius:12px;background:rgba(10,13,17,.6);}
.s7sl-table{width:100%;border-collapse:collapse;font-size:14px;min-width:640px;}
.s7sl-table th,.s7sl-table td{padding:10px 12px;text-align:left;border-bottom:1px solid rgba(255,255,255,.06);}
.s7sl-table thead th{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#87919b;font-weight:700;background:rgba(255,255,255,.02);}
.s7sl-table tbody tr:last-child th,.s7sl-table tbody tr:last-child td{border-bottom:0;}
.s7sl-table tbody tr[data-state="live"]{background:rgba(240,179,64,.06);}
.s7sl-dom{font-weight:700;color:#e9edf1;white-space:nowrap;}
.s7sl-when{color:#c3ccd4;white-space:nowrap;}
.s7sl-num{text-align:right;}
.s7sl-act{text-align:right;white-space:nowrap;}
.s7sl-dash{color:#5d6771;}
.s7sl-slice{color:#34d399;font-weight:700;}
.s7sl-pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;}
.s7sl-pill--live{background:rgba(240,179,64,.16);color:#f0b340;}
.s7sl-pill--bonded{background:rgba(52,211,153,.16);color:#34d399;}
.s7sl-pill--pending{background:rgba(255,255,255,.07);color:#aab4bd;}
.s7sl-pill--failed{background:rgba(255,92,72,.14);color:#ff5c48;}
.s7sl-bar{position:relative;display:inline-block;min-width:88px;height:16px;border-radius:8px;background:rgba(255,255,255,.07);overflow:hidden;vertical-align:middle;}
.s7sl-bar i{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,#f0b340,#ffd98a);}
.s7sl-bar b{position:relative;display:block;line-height:16px;text-align:center;font-size:11px;font-weight:800;color:#0b0d10;}
.s7sl-buy{display:inline-block;padding:5px 12px;border-radius:8px;background:#f0b340;color:#0b0d10;font-weight:800;font-size:12.5px;text-decoration:none;}
.s7sl-buy:hover{background:#ffd98a;}
.s7sl-foot{margin:8px 2px 0;font-size:12.5px;color:#87919b;}
@media (max-width:760px){
  .s7sl-table{font-size:13px;}
  .s7sl-table th,.s7sl-table td{padding:8px 10px;}
}
      `}</style>
    </section>
  );
}
