/**
 * THE UPLINK FEED. GET /api/s6/feed -> { items: [{ t, kind, text }] }
 *
 * Read-only, public, shaped text only: display names, domains and Signal
 * deltas - NEVER a wallet, NEVER a personal dollar figure (the S3 privacy
 * law). Sources are the already-indexed append-only tables from SQL 041:
 * the ledger (game wins, hold ticks, raids), war-effort commits, and target
 * bonded_at flips. The battlefield polls this every ~25s and turns new
 * items into spawn bursts; the feed panel prints them verbatim.
 */
import { NextResponse } from "next/server";
import { s6Db, SEASON_KEY } from "@/lib/s6/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Item = { t: number; kind: "game" | "hold" | "commit" | "bond" | "raid" | "trade" | "info"; text: string };

/** 0x12ab…34cd - the print for a buyer who never enlisted (Mike 2026-08-17:
 * "every buy printed by name, if they are not part of the game then just an
 * abbreviated wallet"). Never the full wallet (the S3 privacy law). */
function abbrevWallet(w: string): string {
  return w.length > 12 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w;
}

function short(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "a pilot";
  return n.length > 18 ? `${n.slice(0, 17)}…` : n;
}

export async function GET(req: Request) {
  // DIAGNOSTIC MODE (2026-08-17): this route catches everything and returns
  // an empty feed, which made a silent failure indistinguishable from a quiet
  // market for hours. `?diag=1` reports what actually happened - never any
  // secret value, only whether a key is present and what an error said.
  const diag = new URL(req.url).searchParams.get("diag") === "1";
  const notes: Record<string, unknown> = {};
  const db = s6Db();
  const items: Item[] = [];
  try {
    // SEQUENTIAL, NOT Promise.all (2026-08-17, the empty-feed hunt).
    // These four ran concurrently and every one came back with ZERO rows and
    // NO error, while an unfiltered count on the same tables from the same
    // client in the same request returned 44 and 59. The server client is the
    // cookie-based @supabase/ssr one: concurrent first-flight queries leave
    // before its auth state is applied, so PostgREST answers 200 with an
    // empty array - success-shaped, data-free, and invisible to a `.error`
    // check. Every read in lib/s6/data.ts (which works in production) is
    // sequential; there is not one Promise.all in that file. This now matches
    // the pattern that is proven in prod rather than inventing a faster one.
    const led = await db
      .from("launch_wars_s6_ledger")
      .select("wallet, points, reason, created_at")
      .eq("season_key", SEASON_KEY)
      .eq("is_test", false)
      .order("created_at", { ascending: false })
      .limit(16);
    const we = await db
      .from("launch_wars_s6_war_effort")
      .select("wallet, domain, shells, created_at")
      .eq("season_key", SEASON_KEY)
      .order("created_at", { ascending: false })
      .limit(8);
    const tg = await db
      .from("launch_wars_s6_targets")
      .select("domain, bonded_at")
      .eq("season_key", SEASON_KEY)
      .not("bonded_at", "is", null)
      .order("bonded_at", { ascending: false })
      .limit(4);
    // real trades, landed by the bot's 5-minute swap ingest (SQL 046).
    // BOTH sides since 2026-08-17: a sell printing next to the buys is what
    // makes the field read as a real market, not a scripted one.
    const tr = await db
      .from("launch_wars_s6_trades")
      .select("wallet, domain, traded_at, is_buy")
      .eq("season_key", SEASON_KEY)
      .order("traded_at", { ascending: false })
      .limit(12);

    const wallets = new Set<string>();
    for (const r of led.data ?? []) if (r.wallet) wallets.add(r.wallet as string);
    for (const r of we.data ?? []) if (r.wallet) wallets.add(r.wallet as string);
    for (const r of tr.data ?? []) if (r.wallet) wallets.add(r.wallet as string);
    const names = new Map<string, string>();
    if (wallets.size > 0) {
      const { data: ps } = await db
        .from("launch_wars_s6_players")
        .select("wallet, display_name")
        .eq("season_key", SEASON_KEY)
        .in("wallet", Array.from(wallets));
      for (const p of ps ?? []) names.set(p.wallet as string, (p.display_name as string) ?? "");
    }

    for (const r of led.data ?? []) {
      const t = Date.parse(r.created_at as string) || 0;
      const who = short(names.get(r.wallet as string));
      const reason = String(r.reason ?? "");
      const pts = Number(r.points ?? 0);
      if (reason.startsWith("game:")) {
        items.push({ t, kind: "game", text: `${who} won ${reason.slice(5)} · +${pts} Signal` });
      } else if (reason === "hold") {
        items.push({ t, kind: "hold", text: `${who} held the line · +${pts} Signal` });
      } else if (reason === "raid") {
        items.push({ t, kind: "raid", text: `${who} joined the raid` });
      }
    }
    for (const r of we.data ?? []) {
      const t = Date.parse(r.created_at as string) || 0;
      items.push({
        t,
        kind: "commit",
        text: `${short(names.get(r.wallet as string))} committed ${Number(r.shells ?? 0)} Scrap at ${r.domain}`,
      });
    }
    for (const r of tg.data ?? []) {
      const t = Date.parse(r.bonded_at as string) || 0;
      items.push({ t, kind: "bond", text: `${r.domain} LIBERATED - the front advances` });
    }
    if (diag) {
      // UNFILTERED counts: isolates "the table is unreadable" from "my filter
      // excludes everything". targets is the control - it demonstrably works.
      const raw = async (t: string) => {
        const r = await db.from(t).select("*", { count: "exact", head: true });
        return { count: r.count ?? null, error: r.error?.message ?? null };
      };
      notes.rawCounts = {
        targets: await raw("launch_wars_s6_targets"),
        ledger: await raw("launch_wars_s6_ledger"),
        trades: await raw("launch_wars_s6_trades"),
        players: await raw("launch_wars_s6_players"),
      };
      const one = await db.from("launch_wars_s6_ledger").select("season_key, reason, is_test").limit(1);
      notes.ledgerSample = { row: one.data?.[0] ?? null, error: one.error?.message ?? null };
      notes.env = {
        url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        serviceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        seasonKey: SEASON_KEY,
      };
      notes.queries = {
        ledger: { rows: (led.data ?? []).length, error: led.error?.message ?? null },
        warEffort: { rows: (we.data ?? []).length, error: we.error?.message ?? null },
        bonded: { rows: (tg.data ?? []).length, error: tg.error?.message ?? null },
        trades: { rows: (tr.data ?? []).length, error: tr.error?.message ?? null },
      };
    }
    for (const r of tr.data ?? []) {
      const t = Date.parse(r.traded_at as string) || 0;
      const w = String(r.wallet ?? "");
      // a display_name equal to the wallet is the bot's placeholder, not a name
      const nm = names.get(w);
      const who = nm && nm.trim() && nm.trim().toLowerCase() !== w.toLowerCase() ? short(nm) : abbrevWallet(w);
      items.push({ t, kind: "trade", text: r.is_buy ? `${who} bought ${r.domain}` : `${who} sold ${r.domain}` });
    }
  } catch (e) {
    // still fail soft for players, but never invisibly for us
    notes.threw = e instanceof Error ? e.message : String(e);
    console.error("[s6 feed] threw:", notes.threw);
  }
  items.sort((a, b) => b.t - a.t);
  return NextResponse.json(
    diag ? { items: items.slice(0, 18), _diag: notes } : { items: items.slice(0, 18) },
    { headers: { "cache-control": "no-store" } },
  );
}
