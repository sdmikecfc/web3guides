/**
 * THE RECORD (/record?k=<RECORD_KEY>) - the team-facing seasons ledger.
 * Unlisted: no nav links anywhere, robots noindex, and a bad or missing key
 * 404s so the URL is the only door. Static history (S1-S5 final) from ./data;
 * LIVE seasons join at render - ONLY seasons that have not settled, so a
 * season graduates out of the live table and into ./data when it pays. ISR
 * revalidate hourly - "updates daily" with margin.
 *
 * Reward columns per live domain (Mike's spec): the BOUNTY, the share of
 * the pool (whole amount) AND the percentage paid with the secured dollars
 * that percentage produces.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSeasonSnapshot as s5Snapshot, paidPeakPct as s5Peak } from "@/lib/s5/data";
import { getSeasonSnapshot as s6Snapshot, paidPeakPct as s6Peak } from "@/lib/s6/data";
import { DOMAINS, PAYMENTS, RECORD_KEY, SEASONS, THESIS } from "./data";
import { createServiceClient } from "@/lib/supabase/server";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Launch Wars: The Record",
  robots: { index: false, follow: false },
};

interface VolumeRow {
  computedAt: string;
  total: number;
  seasons: Record<string, { total: number; domains: Record<string, number>; wallets: number; notes?: Record<string, string> }>;
}

async function readVolume(): Promise<VolumeRow | null> {
  try {
    const db = createServiceClient();
    const { data } = await db
      .from("launch_wars_boss_config")
      .select("value")
      .eq("key", "record_volume")
      .maybeSingle();
    return data?.value ? (JSON.parse(data.value as string) as VolumeRow) : null;
  } catch {
    return null;
  }
}

interface LiveDomain {
  season: string;
  domain: string;
  status: string;
  listedAt: string;
  bondTarget: string;
  peakPct: string;
  shareUsd: string;
  securedUsd: string;
  bountyUsd: string;
}
interface LiveSeason {
  key: string;
  name: string;
  poolFull: string;
  poolSecured: string;
  poolUnlocked: string;
  players: number;
  bonded: number;
  total: number;
  domains: LiveDomain[];
}

const usd = (n: number | null | undefined, dash = "-") =>
  n == null || Number.isNaN(n) ? dash : `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

async function liveSeason(
  key: string,
  snap: () => ReturnType<typeof s5Snapshot>,
  peak: typeof s5Peak,
): Promise<LiveSeason | null> {
  try {
    const s = await snap();
    if (s.empty || s.targets.length === 0) return null;
    return {
      key,
      name: s.theme.seasonName,
      poolFull: usd(s.pool.full),
      poolSecured: usd(s.pool.secured),
      poolUnlocked: usd(s.pool.unlocked),
      players: s.totals.players,
      bonded: s.totals.bonded,
      total: s.totals.total,
      domains: s.targets.map((t) => ({
        season: key.toUpperCase(),
        domain: t.domain,
        status: t.status.toUpperCase(),
        listedAt: usd(t.initialFdv),
        bondTarget: usd(t.bondingFdv),
        peakPct: t.status === "bonded" ? "100%" : `${peak(t)}%`,
        shareUsd: usd(t.poolShare),
        securedUsd: usd(t.securedUsd),
        bountyUsd: usd(t.bountyUsd),
      })),
    };
  } catch {
    return null;
  }
}

export default async function RecordPage({
  searchParams,
}: {
  searchParams: { k?: string };
}) {
  if (searchParams.k !== RECORD_KEY) notFound();

  // ONLY UNSETTLED SEASONS BELONG IN THE LIVE TABLE. S5 settled 2026-08-17 and
  // paid on the 19th, so its final numbers now live in the static tables above
  // (data.ts) - joining it here as well left a finished season labelled
  // UPDATING and quoting a $1,000 pool it never paid.
  const [s6, vol] = await Promise.all([
    liveSeason("s6", s6Snapshot as unknown as () => ReturnType<typeof s5Snapshot>, s6Peak as unknown as typeof s5Peak),
    readVolume(),
  ]);
  const live = [s6].filter(Boolean) as LiveSeason[];
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");

  return (
    <div className="rec-body">
      <div className="wrap">
        <header>
          <div className="kicker">
            <span className="lbl">Doma &middot; Launch Wars</span>
            <span className="lbl accent">THE RECORD &middot; team copy, not linked publicly</span>
            <span className="lbl">refreshed {stamp} UTC &middot; updates hourly</span>
          </div>
          <h1>Every season, on the record.</h1>
          <p className="dek">
            Seasons 1 to 5 are final and paid; the live season below updates from the
            same tables the game pays from. Where an announcement and a ledger disagree, this
            page sides with the ledger.
          </p>
        </header>

        <div className="thesis">
          <div className="th-cell hero">
            <span className="fig">{THESIS.paidTotal}</span>
            <span className="sub">paid to players, confirmed on-chain (S1 to S5, all settled)</span>
          </div>
          <div className="th-cell">
            <span className="fig">0</span>
            <span className="sub">failed transfers, in {THESIS.transfers} payments</span>
          </div>
          <div className="th-cell">
            <span className="fig">
              {THESIS.bondedNum}
              <span className="dim">/{THESIS.bondedDen}</span>
            </span>
            <span className="sub">featured domains bonded (pre-S6)</span>
          </div>
          <div className="th-cell">
            <span className="fig">{THESIS.fdvLocked}</span>
            <span className="sub">of FDV locked in at graduation</span>
          </div>
          <div className="th-cell">
            <span className="fig">{vol ? usd(vol.total) : "-"}</span>
            <span className="sub">
              player buy volume into featured tokens (S4 onward; recomputed{" "}
              {vol ? vol.computedAt.slice(0, 10) : "pending first compute"})
            </span>
          </div>
        </div>

        {/* ── LIVE ─────────────────────────────────────────── */}
        {live.map((L) => (
          <section key={L.key}>
            <div className="sec-head">
              <span className="rail">LIVE</span>
              <h2>
                {L.name}
                <span className="live">UPDATING</span>
              </h2>
            </div>
            <p className="lbl poolline">
              Season pool {L.poolFull} &middot; {L.poolSecured} already secured for holders &middot;{" "}
              {L.poolUnlocked} unlocked by bonds &middot; {L.bonded} of {L.total} bonded &middot;{" "}
              {L.players} players
            </p>
            <div className="tw">
              <table className="dom">
                <thead>
                  <tr>
                    <th>Domain</th>
                    <th>Status</th>
                    <th className="n">Listed at</th>
                    <th className="n">Bond target</th>
                    <th className="n">% paid</th>
                    <th className="n">Pool share (whole)</th>
                    <th className="n">Secured so far</th>
                    <th className="n">Breach bounty</th>
                    <th className="n">Player buys</th>
                  </tr>
                </thead>
                <tbody>
                  {L.domains.map((d) => (
                    <tr key={d.domain} className={d.status === "BONDED" ? "ok" : d.status === "FAILED" ? "miss" : ""}>
                      <td>{d.domain}</td>
                      <td className="st">{d.status}</td>
                      <td className="n">{d.listedAt}</td>
                      <td className="n">{d.bondTarget}</td>
                      <td className="n pc">{d.peakPct}</td>
                      <td className="n">{d.shareUsd}</td>
                      <td className="n pz">{d.securedUsd}</td>
                      <td className="n">{d.bountyUsd}</td>
                      <td className="n">{usd(vol?.seasons?.[L.key]?.domains?.[d.domain] ?? null)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="lbl footnote">
              % paid = the peak percentage the settlement will honor (ADR-0076): a bonded domain
              pays its full share, an unbonded one pays its peak percent of that share. Secured =
              that math in dollars, live. Bounty pays two days after a bond clears its hold check.
            </p>
          </section>
        ))}

        {/* ── HISTORY ──────────────────────────────────────── */}
        <section>
          <div className="sec-head">
            <span className="rail">01</span>
            <h2>What each season did</h2>
          </div>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Season</th>
                  <th className="n">Prize pool</th>
                  <th className="n">Players</th>
                  <th className="n">Qualified</th>
                  <th className="n">Bonded</th>
                  <th className="n">Held</th>
                  <th className="n">Posts</th>
                  <th className="n">FDV created</th>
                  <th className="n">Player buys</th>
                </tr>
              </thead>
              <tbody>
                {SEASONS.map((s) => (
                  <tr key={s.key}>
                    <td className="season">
                      {s.key}
                      <span className="thm">{s.theme}</span>
                    </td>
                    <td className="n">{s.pool}</td>
                    <td className="n">{s.players}</td>
                    <td className="n">{s.qualified}</td>
                    <td className="n">{s.bonded}</td>
                    <td className="n">{s.held}</td>
                    <td className="n">{s.posts}</td>
                    <td className="n">{s.fdv}</td>
                    <td className="n">{usd(vol?.seasons?.[s.key.toLowerCase()]?.total ?? null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="lbl footnote">
            Player buys = USD of on-chain BUY swaps into that season&apos;s featured tokens by that
            season&apos;s enlisted wallets, replayed from full swap history. S1-S3 player tables no
            longer exist, so their volume is not reconstructable.
            Prize pool = confirmed paid, except live seasons which are committed until settlement.
            Qualified = held $5 or more. S1-S5 are final; the LIVE table above is the running
            season and is committed, not yet paid.
          </p>
        </section>

        <section>
          <div className="sec-head">
            <span className="rail">02</span>
            <h2>Every settled domain, what it reached, what it cost</h2>
          </div>
          <div className="tw">
            <table className="dom">
              <thead>
                <tr>
                  <th>Sn</th>
                  <th>Domain</th>
                  <th>Status</th>
                  <th className="n">Listed at</th>
                  <th className="n">Bond target</th>
                  <th className="n">Peak FDV</th>
                  <th className="n">of target</th>
                  <th className="n">Prize</th>
                </tr>
              </thead>
              <tbody>
                {DOMAINS.map((d, i) => (
                  <tr
                    key={`${d.season}-${d.domain}-${i}`}
                    className={d.status === "BONDED" ? "ok" : d.status === "FAILED" ? "miss" : ""}
                  >
                    <td className="sn">{d.season}</td>
                    <td>{d.domain}</td>
                    <td className="st">{d.status}</td>
                    <td className="n">{d.listedAt}</td>
                    <td className="n">{d.bondTarget}</td>
                    <td className="n">{d.peakFdv}</td>
                    <td className="n pc">{d.ofTarget}</td>
                    <td className="n pz">{d.prize}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="lbl footnote">
            S1&apos;s eight domains kept no target table and are not reconstructable. S5 rows are its
            end-of-season state; four domains still had an open bond window when the season closed.
          </p>
        </section>

        <section>
          <div className="sec-head">
            <span className="rail">03</span>
            <h2>What has actually been paid</h2>
          </div>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Batch</th>
                  <th className="n">Wallets</th>
                  <th className="n">Paid</th>
                  <th className="n">Failed</th>
                  <th>Announced as</th>
                </tr>
              </thead>
              <tbody>
                {PAYMENTS.map((p) => (
                  <tr key={p.batch}>
                    <td className="season">{p.batch}</td>
                    <td className="n">{p.wallets}</td>
                    <td className="n">{p.paid}</td>
                    <td className="n">{p.failed}</td>
                    <td>{p.announced}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td>113 distinct wallets</td>
                  <td className="n">{THESIS.transfers}</td>
                  <td className="n">{THESIS.paidTotal}.00</td>
                  <td className="n">0</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="lbl footnote">
            The S3 and S4 season posts understated the sends (S3 announced $800/62, paid $850/66;
            S4 announced $500/49, paid $504/50 - a deliberate grace top-up). The ledger column is
            the one to reconcile against. Live-season pools stay committed until settlement.
          </p>
        </section>

        <footer>
          <b>Sources.</b> Static history: the audited 6 Aug 2026 record, with S5 graduated to its
          settled figures on 22 Aug (batch ledgers in{" "}
          <code>doma-reporter/scripts/payouts/</code>). Live tables: the season database, the same
          rows settlement pays from. ADR-0098 the S5 economy &middot; ADR-0076 peak payout basis
          &middot; ADR-0113 bounties auto-prepare, a human sends &middot; ADR-0122 THE FRONT.
        </footer>
      </div>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </div>
  );
}

/* The editorial register from the standalone record, adapted: dark-first to
 * match the game chrome, light kept for printing. */
const CSS = `
.rec-body{
  --paper:#0C1114; --card:#141D21; --ink:#E6EDEB; --ink-2:#A9B8B8; --ink-3:#75868A;
  --rule:#25333A; --rule-soft:#1C282D; --accent:#5FB3B8; --accent-soft:#5FB3B822;
  --settled:#6FBF92; --flag:#D9A455;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
  --serif:Georgia,"Iowan Old Style","Times New Roman",serif;
  background:var(--paper); color:var(--ink);
  font-family:var(--serif); font-size:16.5px; line-height:1.62; min-height:100dvh;
}
@media print{.rec-body{--paper:#fff;--card:#fbfcfb;--ink:#10171C;--ink-2:#3B4A50;--ink-3:#6B7B80;--rule:#C9D2D0;--rule-soft:#DCE3E1;--accent:#16505A;--accent-soft:#16505A1a;--settled:#2E6B4F;--flag:#9A6318;}}
.rec-body .wrap{max-width:1080px;margin:0 auto;padding:0 28px 96px}
.rec-body h1,.rec-body h2,.rec-body .lbl,.rec-body .fig,.rec-body table{font-family:var(--sans)}
.rec-body .lbl,.rec-body table td.n,.rec-body table th.n,.rec-body .rail,.rec-body .season,.rec-body .sn,.rec-body .st{font-family:var(--mono)}
.rec-body .lbl{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-3);font-weight:600}
.rec-body .lbl.accent{color:var(--accent)}
.rec-body header{padding:56px 0 36px;border-bottom:2px solid var(--ink)}
.rec-body .kicker{display:flex;gap:14px;align-items:baseline;flex-wrap:wrap;margin-bottom:22px}
.rec-body h1{font-size:clamp(34px,6vw,58px);line-height:1.02;margin:0;font-weight:800;letter-spacing:-.03em}
.rec-body .dek{font-size:clamp(15px,2vw,18px);color:var(--ink-2);margin:18px 0 0;max-width:62ch}
.rec-body .thesis{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--rule);border:1px solid var(--rule);border-top:none}
@media (max-width:760px){.rec-body .thesis{grid-template-columns:repeat(2,1fr)}}
.rec-body .th-cell{background:var(--paper);padding:24px 20px 20px}
.rec-body .th-cell .fig{font-size:clamp(24px,4vw,38px);font-weight:700;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1;display:block;margin-bottom:8px}
.rec-body .th-cell .fig .dim{color:var(--ink-3)}
.rec-body .th-cell .sub{font-family:var(--serif);font-size:13px;color:var(--ink-2);line-height:1.45}
.rec-body .th-cell.hero .fig{color:var(--settled)}
.rec-body section{padding:50px 0 0}
.rec-body .sec-head{display:flex;align-items:baseline;gap:16px;margin-bottom:20px;border-bottom:1px solid var(--rule);padding-bottom:11px}
.rec-body .rail{font-size:11px;color:var(--accent);font-weight:600;letter-spacing:.1em;white-space:nowrap}
.rec-body h2{font-size:clamp(20px,3vw,25px);font-weight:750;letter-spacing:-.02em;margin:0}
.rec-body .live{font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;padding:2px 6px;border:1px solid var(--settled);color:var(--settled);border-radius:2px;margin-left:9px;vertical-align:3px}
.rec-body .poolline{margin:0 0 12px}
.rec-body .footnote{margin-top:10px}
.rec-body .tw{overflow-x:auto;margin:0 0 4px;-webkit-overflow-scrolling:touch}
.rec-body table{border-collapse:collapse;width:100%;min-width:560px;font-size:14px}
.rec-body th,.rec-body td{padding:10px 13px;text-align:left;border-bottom:1px solid var(--rule-soft)}
.rec-body thead th{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);font-weight:600;border-bottom:1.5px solid var(--rule);white-space:nowrap}
.rec-body td.n,.rec-body th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.rec-body tbody tr:last-child td{border-bottom:none}
.rec-body tr.total td{border-top:1.5px solid var(--ink);border-bottom:none;font-weight:700;padding-top:12px;background:var(--accent-soft)}
.rec-body td.season{font-weight:600;color:var(--accent);white-space:nowrap}
.rec-body td.season .thm{display:block;font-family:var(--serif);font-size:12px;font-weight:400;color:var(--ink-2);margin-top:2px}
.rec-body table.dom{min-width:820px;font-size:13px}
.rec-body table.dom td{padding:8px 12px}
.rec-body td.sn{font-size:11px;color:var(--ink-3);font-weight:600}
.rec-body td.st{font-size:10px;letter-spacing:.08em;color:var(--ink-3)}
.rec-body tr.ok td.st{color:var(--settled);font-weight:700}
.rec-body tr.miss td.st{color:var(--flag)}
.rec-body td.pc{color:var(--ink-3)}
.rec-body tr.miss td.pc{color:var(--flag);font-weight:700}
.rec-body td.pz{font-weight:600}
.rec-body tr.ok td.pz{color:var(--settled)}
.rec-body footer{margin-top:60px;padding-top:20px;border-top:1px solid var(--rule);font-family:var(--mono);font-size:11.5px;color:var(--ink-3);line-height:1.8}
.rec-body footer b{color:var(--ink-2)}
.rec-body code{font-family:var(--mono);font-size:.88em;background:var(--card);padding:1px 5px;border-radius:2px}
`;
