"use client";

/**
 * THE BATTLES PAGE (screens doc 4.1; engine doc sections 4, 5 and 6): left
 * FIGHT, right WATCH; two tabs on a phone. Everything on it comes from
 * GET /api/bots/battles (_server/battles.ts): the caller's bots with their
 * attacks left, the PvE ladder sized to the selected bot, the open defenders
 * with plain-words multipliers, Live (the last 90 s), Featured today and
 * Recent (the last 50 public fights). A tap on Fight, Spar or Challenge is
 * ONE POST /api/bots/fight and the page goes straight to the replay: the
 * server resolved the fight from the database before it answered (engine
 * doc 7), so the pit shows the truth, never a guess.
 *
 * Client shell in the StrategyClient shape (../strategy/StrategyClient.tsx:
 * fetch, fail-soft, poll), with the landing's connect door (../page.tsx
 * ConnectDoor: RainbowKit's ConnectButton.Custom rendered as the game's own
 * 44 px button) and the session hook beside it (./useBotsSession.ts).
 * Watching needs no wallet: the WATCH column renders signed out. Wallet
 * names only, whole numbers, every control 44 px tall.
 *
 * The garage links here with the BAY number (../garage/GarageClient.tsx
 * `?bot=<bay>`); the route takes a bot id. A number that is no bot id but
 * is one of the caller's bays picks that bay's bot, once, on load.
 */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { BotPortrait, PORTRAIT_ON } from "../_components/BotPortrait";
import { PageShell } from "../_components/PageShell";
import { IconPlay } from "../_ui/icons";
import { Button, Dot, Panel, uiCss } from "../_ui/primitives";
import { FONT_BODY, FONT_DISPLAY, FONT_MONO, M, R, TAP, TIER_COLOR } from "../_ui/tokens";
import { STAKE_MAX, STAKE_MIN, WEIGHT_CLASS_NAMES, dropOneIn, houseBonus } from "../_engine/rewards";
import type { Tier } from "../_engine/parts";
// type-only (erased at compile time): the server shapes, never the server client
import type { BattlesView, BotView, DefenderRow, FightSummary, PveLadderRow } from "../_server/types";
import { STRINGS, fightPointWord, fill, starWord, winLossWords } from "@/lib/bots/strings";
import { HOUSE_NAME, HOUSE_TIER_INDEX, type HouseSize } from "@/lib/bots/naming";
import { SCREEN_WORDS, fillWords } from "@/lib/bots/naming-screens";
import { authHeaders, readBotsSession } from "./session";
import { useBotsSession, type BotsSessionState } from "./useBotsSession";
import css from "./battles.module.css";

const t = STRINGS.en;
const POLL_MS = 20_000;
const CLOCK_MS = 10_000;
const STAKE_QUICK = [25, 50, 100, 250, 500] as const;

type Filter = "all" | "same" | "up" | "down";
type Tab = "fight" | "watch";

interface Loaded {
  status: number;
  view: BattlesView | null;
  error: string;
}

async function getShelves(token: string, botId: number | null): Promise<Loaded> {
  try {
    const res = await fetch(`/api/bots/battles${botId ? `?bot=${botId}` : ""}`, { headers: authHeaders(token), cache: "no-store" });
    const j = (await res.json().catch(() => null)) as (Partial<BattlesView> & { error?: string }) | null;
    if (!res.ok || !j || j.ok !== true) return { status: res.status, view: null, error: (j && j.error) || "The list did not load." };
    return { status: res.status, view: j as BattlesView, error: "" };
  } catch {
    return { status: 0, view: null, error: "The list did not load. Try again." };
  }
}

/** "just now", "4 min ago", "2 h ago", "3 d ago": whole numbers. */
function ago(iso: string, nowMs: number): string {
  if (!nowMs) return "";
  const s = Math.floor((nowMs - Date.parse(iso)) / 1000);
  if (!Number.isFinite(s) || s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

/** "ready in 17 hours", "ready in 40 minutes". A letter for an hour is a
 * short form, and a short form is the one thing a reader cannot look up. */
function backIn(until: string | null, nowMs: number): string {
  const ms = until ? Date.parse(until) - nowMs : 0;
  const mins = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(mins / 60);
  if (h > 0) return `ready in ${h} ${h === 1 ? "hour" : "hours"}`;
  return `ready in ${mins} ${mins === 1 ? "minute" : "minutes"}`;
}

const mono = (size: number, color: string = M.muted): CSSProperties => ({
  fontFamily: FONT_MONO,
  fontSize: size,
  color,
  fontVariantNumeric: "tabular-nums",
});

/** "1 fight point", "4 fight points": one helper in strings.ts, so the fight
 * viewer and this screen can never drift apart on the unit word. */
const pointWords = fightPointWord;

const label = (): CSSProperties => ({
  fontFamily: FONT_DISPLAY,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.32em",
  textTransform: "uppercase",
  color: M.muted,
  margin: "0 0 10px",
});

/* ── the thumb: the real robot, composited, in all of its own colours ───── */
/**
 * THIS USED TO BE A DRAWN SILHOUETTE, six rounded rectangles in ONE of the
 * robot's colours, and it was the loudest lie on the page. A robot is four
 * colours at once (ADR-0141) with a face, a sticker and whatever it has won
 * on its head, and this row showed a flat pink dummy for every one of them.
 *
 * Now it is /api/bots/portrait, through _components/BotPortrait: one
 * compositor, one assembly, and a robot that changes changes everywhere.
 * Nothing on this page assembles a robot itself any more.
 */
function Thumb({ botId, tier, size = PORTRAIT_ON.botCard }: { botId: number; tier: Tier; size?: number }) {
  return <BotPortrait of={{ bot: botId }} size={size} tier={tier} />;
}

/**
 * A GAME robot, by the shape it is built from and the size it is built to.
 * It has no row and therefore no id, so it is named by the two values this
 * page already prints. It draws in unpainted clay with no face and no marks,
 * which is exactly how a game robot looks in the fights list below when it
 * wins one. The size is unknown until the player picks a robot, and the
 * route draws a middling one until then; the SHAPE is the day's shape either
 * way, so the picture is never of the wrong robot.
 */
function HouseThumb({ shapeId, total, tier, size }: { shapeId: string; total: number | null; tier: Tier; size: number }) {
  return <BotPortrait of={{ house: shapeId, total: total ?? undefined }} size={size} tier={tier} />;
}

/** One side of a fight that has already happened, at its size that day. */
function FightThumb({ id, side, tier, size }: { id: string; side: 0 | 1; tier: Tier; size: number }) {
  return <BotPortrait of={{ fight: id, side }} size={size} tier={tier} />;
}

/* ── the doors (the landing's ConnectDoor, ../page.tsx) ─────────────────── */

const door = (primary: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: TAP,
  padding: "10px 18px",
  borderRadius: R.inner,
  border: `1px solid ${primary ? M.accent : M.border}`,
  background: primary ? M.accent : M.surface2,
  color: primary ? "#ffffff" : M.text,
  fontFamily: FONT_BODY,
  fontWeight: 700,
  fontSize: 14,
  textDecoration: "none",
  cursor: "pointer",
});

function SignInDoor({ sess }: { sess: BotsSessionState }) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openConnectModal }) => {
        if (!mounted) {
          return (
            <span aria-hidden style={{ ...door(true), opacity: 0, pointerEvents: "none" }}>
              {t.landing.connect}
            </span>
          );
        }
        if (account && chain) {
          return (
            <button type="button" className={uiCss.press} onClick={() => void sess.open()} disabled={sess.busy} style={{ ...door(true), opacity: sess.busy ? 0.7 : 1 }}>
              {sess.busy ? t.landing.signing : t.landing.play}
            </button>
          );
        }
        return (
          <button type="button" className={uiCss.press} onClick={openConnectModal} style={door(true)}>
            {t.landing.connect}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}

/* ── a 44 px filter chip ────────────────────────────────────────────────── */

function Chip({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={uiCss.press}
      onClick={onClick}
      aria-pressed={active}
      style={{
        minHeight: TAP,
        padding: "0 14px",
        display: "inline-flex",
        alignItems: "center",
        borderRadius: R.pill,
        fontFamily: FONT_BODY,
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        whiteSpace: "nowrap",
        border: `1px solid ${active ? M.accent : M.border}`,
        background: active ? M.surface2 : "transparent",
        color: active ? M.text : M.muted,
      }}
    >
      {children}
    </button>
  );
}

/* ── the page ───────────────────────────────────────────────────────────── */

export default function BattlesClient() {
  const router = useRouter();
  const search = useSearchParams();
  const wantRaw = search.get("bot") || "";
  const want = /^\d{1,12}$/.test(wantRaw) ? Number(wantRaw) : null;

  const sess = useBotsSession();
  const { signOut } = sess;
  const tokenRef = useRef("");
  tokenRef.current = sess.token;

  const [view, setView] = useState<BattlesView | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const selectedRef = useRef<number | null>(null);
  const resolvedWant = useRef(false);
  const [tab, setTab] = useState<Tab>("fight");
  const [filter, setFilter] = useState<Filter>("all");
  const [challenging, setChallenging] = useState<number | null>(null);
  const [stake, setStake] = useState<number>(STAKE_MIN);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(0);

  const reload = useCallback(async (botId: number | null): Promise<BattlesView | null> => {
    const r = await getShelves(tokenRef.current, botId);
    if (!r.view) {
      setLoadError(r.error);
      return null;
    }
    setLoadError("");
    setView(r.view);
    return r.view;
  }, []);

  // the first load, and again whenever the session changes (sign in, sign out)
  useEffect(() => {
    if (!sess.ready) return;
    let dead = false;
    (async () => {
      const v = await reload(selectedRef.current ?? want);
      if (dead || !v) return;
      const me = v.me;
      if (tokenRef.current && !me) {
        // a token the server did not honour (run out, or minted under another secret)
        signOut();
        return;
      }
      let sel = me ? me.selected : null;
      if (me && want != null && !resolvedWant.current) {
        resolvedWant.current = true;
        if (!me.bots.some((b) => b.id === want)) {
          const byBay = me.bots.find((b) => b.bay === want && b.complete);
          if (byBay && byBay.id !== sel) {
            sel = byBay.id;
            await reload(sel);
          }
        }
      }
      if (dead) return;
      selectedRef.current = sel;
      setSelected(sel);
    })();
    return () => {
      dead = true;
    };
  }, [sess.ready, sess.token, want, reload, signOut]);

  // the shelves refresh themselves: Live is a 90 s window
  useEffect(() => {
    if (!sess.ready) return;
    const id = window.setInterval(() => {
      void reload(selectedRef.current);
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [sess.ready, reload]);

  // the one clock read, handed down as a value (the garage's rule)
  useEffect(() => {
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), CLOCK_MS);
    return () => window.clearInterval(id);
  }, []);

  const pick = useCallback(
    (id: number) => {
      selectedRef.current = id;
      setSelected(id);
      setChallenging(null);
      setNote(null);
      void reload(id);
    },
    [reload],
  );

  /** ONE POST; on success the replay page is the next screen. */
  const start = useCallback(
    async (key: string, body: Record<string, unknown>) => {
      if (!tokenRef.current || busy) return;
      setBusy(key);
      setNote(null);
      try {
        const res = await fetch("/api/bots/fight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ t: tokenRef.current, ...body }),
        });
        const j = (await res.json().catch(() => null)) as { ok?: boolean; fightId?: string; error?: string } | null;
        if (!res.ok || !j?.ok || !j.fightId) {
          setNote(j?.error || "The fight did not start. Try again.");
          setBusy(null);
          void reload(selectedRef.current);
          return;
        }
        router.push(`/bots/fight/${encodeURIComponent(j.fightId)}`);
      } catch {
        setNote("The fight did not start. Try again.");
        setBusy(null);
      }
    },
    [busy, reload, router],
  );

  // the screenshot and verifier hook (dev only; scripts/bots-shot.mjs waits
  // on window.__bots.ready and can refresh after writing a session token)
  useEffect(() => {
    if (!view) return;
    const w = window as unknown as Record<string, unknown>;
    w.__bots = {
      ready: true,
      battles: true,
      signedIn: !!view.me,
      refresh: async () => {
        tokenRef.current = readBotsSession();
        const v = await reload(selectedRef.current);
        if (v?.me && selectedRef.current == null) {
          selectedRef.current = v.me.selected;
          setSelected(v.me.selected);
        }
        return !!v?.me;
      },
    };
    return () => {
      delete w.__bots;
    };
  }, [view, reload]);

  const me = view?.me ?? null;
  const bots = me?.bots ?? [];
  const bot = bots.find((b) => b.id === selected) ?? null;
  const canSpar = !!bot && bot.complete;
  const canFight = !!bot && bot.complete && !bot.inShop && bot.attacksLeft > 0;
  const blocked = !bot ? (bots.length ? t.battles.pickBot : null) : !bot.complete ? `${bot.nameText} needs more parts. Put on all five.` : bot.inShop ? `${bot.nameText} is being fixed, ${backIn(bot.repairUntil, nowMs)}.` : bot.attacksLeft <= 0 ? `${bot.nameText} has no fights left today.` : null;
  const coins = me?.coins ?? 0;

  const defenders = (view?.defenders ?? []).filter((d) => {
    if (filter === "all" || d.classGap == null) return true;
    if (filter === "same") return d.classGap === 0;
    if (filter === "up") return d.classGap > 0;
    return d.classGap < 0;
  });

  return (
    <PageShell wide>
      <p style={{ ...mono(11), letterSpacing: "0.32em", textTransform: "uppercase", margin: "24px 0 6px" }}>{t.nav.wordmark}</p>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", margin: "0 0 14px" }}>
        <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 28, margin: 0, color: M.text }}>{t.nav.battles}</h1>
        {me ? (
          <span style={mono(12)}>
            {me.walletName}, {coins} coins
          </span>
        ) : (
          <span style={{ fontSize: 13, color: M.muted }}>{t.landingUi.watchFree}</span>
        )}
      </div>

      {/* the phone tabs */}
      <div className={css.tabs} role="tablist" aria-label="Fight or watch">
        <Chip active={tab === "fight"} onClick={() => setTab("fight")}>
          {t.battles.fight}
        </Chip>
        <Chip active={tab === "watch"} onClick={() => setTab("watch")}>
          {t.battles.watch}
        </Chip>
      </div>

      {loadError ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <span style={{ ...mono(12, M.bad) }}>{loadError}</span>
          <Button onClick={() => void reload(selectedRef.current)}>Try again</Button>
        </div>
      ) : null}

      <div className={css.cols} data-tab={tab}>
        {/* ── FIGHT ───────────────────────────────────────────────────── */}
        <section className={css.fight} aria-label="Fight">
          {!me ? (
            <Panel style={{ marginBottom: 16 }}>
              <p style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>Fight with your own robots.</p>
              <p style={{ fontSize: 14, color: M.lore, margin: "0 0 14px", lineHeight: 1.45 }}>
                Press Play and sign once in your wallet. It moves no money and costs nothing.
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <SignInDoor sess={sess} />
                <Link href="/bots/garage" className={uiCss.press} style={door(false)}>
                  {t.nav.garage}
                </Link>
              </div>
              {sess.error ? <p style={{ ...mono(12, M.bad), margin: "10px 0 0" }}>{sess.error}</p> : null}
            </Panel>
          ) : null}

          {/* PICK A BOT */}
          {me ? (
            <div style={{ marginBottom: 16 }}>
              <p style={label()}>{t.battles.pickBot}</p>
              {bots.length ? (
                <div className={css.chips}>
                  {bots.map((b) => (
                    <BotChip key={b.id} bot={b} active={b.id === selected} nowMs={nowMs} onClick={() => pick(b.id)} />
                  ))}
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, color: M.lore }}>No robots yet. Build one from your starting parts.</span>
                  <Link href="/bots/garage/build" className={uiCss.press} style={door(true)}>
                    {t.nav.build}
                  </Link>
                </div>
              )}
              {blocked ? <p style={{ ...mono(12), margin: "8px 0 0" }}>{blocked}</p> : null}
            </div>
          ) : null}

          {note ? (
            <p role="status" style={{ ...mono(12, M.bad), margin: "0 0 12px" }}>
              {note}
            </p>
          ) : null}

          {/* THE GAME ROBOT LADDER */}
          <p style={label()}>Game robots</p>
          <p style={{ fontSize: 12.5, color: M.lore, margin: "0 0 10px", lineHeight: 1.45 }}>
            {t.teach.points} {t.battles.twoADay} {t.battles.gapHint}
          </p>
          <p style={{ fontSize: 12.5, color: M.lore, margin: "0 0 10px", lineHeight: 1.45 }}>
            {t.teach.beingFixed} {SCREEN_WORDS.sparNote}
          </p>
          <div className={css.list} style={{ marginBottom: 18 }}>
            {(view?.pve ?? []).map((row) => (
              <LadderCard
                key={row.difficulty}
                row={row}
                bot={bot}
                canFight={canFight && !!me}
                canSpar={canSpar && !!me}
                busy={busy}
                onFight={() => bot && void start(`pve:${row.difficulty}`, { botId: bot.id, mode: "pve", difficulty: row.difficulty })}
                onSpar={() => bot && void start(`spar:${row.difficulty}`, { botId: bot.id, mode: "spar", difficulty: row.difficulty })}
              />
            ))}
          </div>

          {/* PvP CHALLENGES */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <p style={{ ...label(), margin: 0 }}>Fight another player</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Chip active={filter === "all"} onClick={() => setFilter("all")}>
                All
              </Chip>
              {/* was "Same class / Up / Down": three words that never said
                  up or down what. The size of the other bot is the thing. */}
              <Chip active={filter === "same"} onClick={() => setFilter("same")}>
                Same size
              </Chip>
              <Chip active={filter === "up"} onClick={() => setFilter("up")}>
                Bigger than mine
              </Chip>
              <Chip active={filter === "down"} onClick={() => setFilter("down")}>
                Smaller than mine
              </Chip>
            </div>
          </div>
          <p style={{ fontSize: 12.5, color: M.lore, margin: "0 0 10px", lineHeight: 1.45 }}>
            You put in 25 to 500 coins. If you win you get your coins back and the same again. Beat a bigger robot and you get extra coins too.{" "}
            {t.teach.savedCopy}
          </p>
          <div className={css.list}>
            {defenders.length ? (
              defenders.map((d) => (
                <DefenderCard
                  key={d.botId}
                  d={d}
                  me={!!me}
                  bot={bot}
                  canFight={canFight}
                  coins={coins}
                  open={challenging === d.botId}
                  stake={stake}
                  busy={busy}
                  onOpen={() => {
                    setChallenging(challenging === d.botId ? null : d.botId);
                    setStake(STAKE_MIN);
                    setNote(null);
                  }}
                  onStake={setStake}
                  onGo={() => bot && void start(`pvp:${d.botId}`, { botId: bot.id, mode: "pvp", defenderBotId: d.botId, stake })}
                />
              ))
            ) : (
              <p style={{ fontSize: 14, color: M.lore, margin: 0 }}>{view ? "Nobody to challenge right now." : "Loading."}</p>
            )}
          </div>
        </section>

        {/* ── WATCH ───────────────────────────────────────────────────── */}
        <section className={css.watch} aria-label="Watch">
          <p style={label()}>{t.battles.live}</p>
          <div className={css.list} style={{ marginBottom: 18 }}>
            {view && view.live.length ? (
              view.live.map((s) => <LiveCard key={s.id} s={s} nowMs={nowMs} />)
            ) : (
              <p style={{ fontSize: 14, color: M.lore, margin: 0 }}>{view ? "Nobody is fighting right now." : "Loading."}</p>
            )}
          </div>

          {view && (view.featured.upset || view.featured.longest || view.featured.fastestKo) ? (
            <>
              <p style={label()}>Today</p>
              <div className={css.list} style={{ marginBottom: 18 }}>
                {view.featured.upset ? <FeaturedRow tag="Biggest surprise" s={view.featured.upset} /> : null}
                {view.featured.longest ? <FeaturedRow tag="Longest fight" s={view.featured.longest} /> : null}
                {view.featured.fastestKo ? <FeaturedRow tag="Fastest knockout" s={view.featured.fastestKo} /> : null}
              </div>
            </>
          ) : null}

          <p style={label()}>{t.battles.recent}</p>
          <div className={css.list}>
            {view && view.recent.length ? (
              view.recent.map((s) => <RecentRow key={s.id} s={s} nowMs={nowMs} />)
            ) : (
              <p style={{ fontSize: 14, color: M.lore, margin: 0 }}>{view ? "No fights yet today. Yours could be the first." : "Loading."}</p>
            )}
          </div>
        </section>
      </div>
    </PageShell>
  );
}

/* ── the pick a robot chip: 64 px, thumb, name, star dot, "2 fights left" ── */

function BotChip({ bot, active, nowMs, onClick }: { bot: BotView; active: boolean; nowMs: number; onClick: () => void }) {
  const line = !bot.complete ? "parts missing" : bot.inShop ? `being fixed, ${backIn(bot.repairUntil, nowMs)}` : `${bot.attacksLeft} fights left`;
  return (
    <button
      type="button"
      className={uiCss.press}
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${bot.nameText}, ${starWord(bot.tier)}, ${bot.complete ? fill(t.battles.attacksLeft, { n: bot.attacksLeft }) : SCREEN_WORDS.botNotReady}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        minHeight: 64,
        padding: "6px 14px 6px 6px",
        borderRadius: R.inner,
        border: `1px solid ${active ? M.accent : M.border}`,
        background: active ? M.surface2 : "transparent",
        color: M.text,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <Thumb botId={bot.id} tier={bot.tier} size={PORTRAIT_ON.botCard} />
      <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }}>{bot.nameText}</span>
          <Dot color={TIER_COLOR[bot.tier]} />
        </span>
        <span style={{ ...mono(11), whiteSpace: "nowrap" }}>{line}</span>
      </span>
    </button>
  );
}

/* ── a house bot card: thumb, name, tier, lore, the reward, Fight ───────── */

function LadderCard({
  row,
  bot,
  canFight,
  canSpar,
  busy,
  onFight,
  onSpar,
}: {
  row: PveLadderRow;
  bot: BotView | null;
  canFight: boolean;
  canSpar: boolean;
  busy: string | null;
  onFight: () => void;
  onSpar: () => void;
}) {
  const tier = row.tier ?? 1;
  // THE SIZE SITS ON ITS OWN LINE ABOVE THE NAME, and the two are never
  // joined. This card used to render the rank ("Big Rig") and the shape name
  // ("Gremlin") on one flex row, which is how a screen came to read "Big Rig
  // Gremlin" and mean nothing by it. The size word ranks itself in any
  // language; the name below it is just a name.
  const size = HOUSE_TIER_INDEX[row.difficulty as HouseSize];
  const houseName = HOUSE_NAME[row.shapeId] ?? row.shapeName;
  return (
    <div className={css.ladder}>
      <HouseThumb shapeId={row.shapeId} total={row.houseTotal} tier={tier} size={PORTRAIT_ON.ladder} />
      <div style={{ minWidth: 0 }}>
        <div style={{ ...mono(10), letterSpacing: "0.22em", textTransform: "uppercase", color: M.muted }}>
          {size ? size.label : row.title}
        </div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 700, color: M.text, margin: "1px 0 2px" }}>
          {houseName}
        </div>
        <div style={{ fontSize: 12.5, color: M.lore, lineHeight: 1.4 }}>{row.feel}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, ...mono(11), margin: "4px 0 0" }}>
          {row.tier != null && row.houseTotal != null ? (
            <>
              <Dot color={TIER_COLOR[row.tier]} />
              <span>
                {bot
                  ? fillWords(SCREEN_WORDS.houseSized, { n: row.houseTotal, bot: bot.nameText })
                  : fillWords(SCREEN_WORDS.points, { n: row.houseTotal })}
              </span>
            </>
          ) : (
            <span>{SCREEN_WORDS.housePick}</span>
          )}
        </div>
        {size ? <div style={{ fontSize: 12, color: M.muted, marginTop: 2, lineHeight: 1.4 }}>{size.line}</div> : null}
      </div>
      <div className={css.ladderActions}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
          {/* was "x1 points", which read like a multiplier. It is a count:
              a win on this rung pays exactly this many fight points. */}
          <span style={mono(12, M.text)}>
            {pointWords(row.points)}, {row.coinsWin} coins if you win
          </span>
          <span style={mono(11)}>
            {row.coinsLose} coins if you lose.
          </span>
          <span style={mono(11)}>
            You win a free part in about 1 fight out of {dropOneIn(row.dropPercent)}.
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {/* "Spar" hid its own rule in a hover title, which a phone never
              shows. The button says what it is; the rule is under the row. */}
          <Button onClick={onSpar} disabled={!canSpar || !!busy}>
            Practice
          </Button>
          <Button variant="primary" onClick={onFight} disabled={!canFight || !!busy}>
            <IconPlay size={16} />
            {busy === `pve:${row.difficulty}` ? "Starting" : t.battles.fight}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── a defender row: thumb, names, tier and record, the multiplier, Challenge, the stake picker ── */

function DefenderCard({
  d,
  me,
  bot,
  canFight,
  coins,
  open,
  stake,
  busy,
  onOpen,
  onStake,
  onGo,
}: {
  d: DefenderRow;
  me: boolean;
  bot: BotView | null;
  canFight: boolean;
  coins: number;
  open: boolean;
  stake: number;
  busy: string | null;
  onOpen: () => void;
  onStake: (n: number) => void;
  onGo: () => void;
}) {
  const gap = d.classGap ?? 0;
  const gapColor = gap > 0 ? M.good : gap < 0 ? M.warn : M.text;
  const buttonLabel = d.challengedToday ? "You fought them today" : d.defencesLeft <= 0 ? "Full up today" : t.battles.challenge;
  const disabled = !me || !canFight || d.challengedToday || d.defencesLeft <= 0 || !!busy;
  const bonus = d.classGap == null ? 0 : houseBonus(stake, d.classGap);
  const short = Math.max(0, stake - coins);
  return (
    <div className={css.def}>
      <Thumb botId={d.botId} tier={d.tier} size={PORTRAIT_ON.botCard} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</span>
          <Dot color={TIER_COLOR[d.tier]} />
        </div>
        <div style={{ fontSize: 12, color: M.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.walletName}</div>
        {/* this line WRAPS. It used to be one nowrap row with an ellipsis,
            so on a phone it cut off mid word and no honest wording could fit. */}
        <div style={{ ...mono(11), whiteSpace: "normal", lineHeight: 1.35 }}>
          {WEIGHT_CLASS_NAMES[d.weightClass]}, size {d.total}, {winLossWords(d.wins, d.losses)}
        </div>
      </div>
      <div className={css.defActions}>
        <span style={{ ...mono(12, gapColor), textAlign: "right", lineHeight: 1.4 }}>
          {d.gapWords ?? "pick a robot"}
          {d.housePercent > 0 ? (
            <>
              <br />
              <span style={mono(11)}>extra coins too</span>
            </>
          ) : null}
        </span>
        <Button onClick={onOpen} disabled={disabled} variant={open ? "quiet" : "quiet"}>
          {open ? "Close" : buttonLabel}
        </Button>
      </div>
      {open && bot ? (
        <div style={{ gridColumn: "1 / -1", borderTop: `1px solid ${M.border}`, paddingTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontSize: 13, color: M.lore }}>{t.battles.stakeLabel}</span>
            <span style={mono(14, M.text)}>{stake} coins</span>
          </div>
          <input
            className={css.stakeRange}
            type="range"
            min={STAKE_MIN}
            max={STAKE_MAX}
            step={1}
            value={stake}
            onChange={(e) => onStake(Number(e.target.value))}
            aria-label={t.battles.stakeLabel}
            aria-valuetext={`${stake} coins`}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {STAKE_QUICK.map((n) => (
              <Chip key={n} active={stake === n} onClick={() => onStake(n)}>
                {n}
              </Chip>
            ))}
          </div>
          <p style={{ fontSize: 12.5, color: M.lore, margin: "0 0 10px", lineHeight: 1.45 }}>
            {/* the sum is done for the player: both readers asked for this */}
            {fill(t.battles.stakeSum, { won: stake * 2 })}
            {bonus > 0 ? ` You get ${bonus} extra coins too.` : ""} {t.battles.stakeLose} Your {stake} coins go to {d.name}.
            {short > 0 ? ` You need ${short} more coins.` : ""}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="primary" onClick={onGo} disabled={disabled || short > 0}>
              <IconPlay size={16} />
              {busy === `pvp:${d.botId}` ? "Starting" : `Challenge for ${stake} coins`}
            </Button>
            <Button onClick={onOpen}>Not now</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ── the watch column ───────────────────────────────────────────────────── */

/**
 * What kind of fight this was, in words a player has already met. "PvP" and
 * "PvE . Big Rig" were two short forms and a rank word: nothing on the page
 * ever taught any of the three. The rank word now ranks itself.
 */
function modeWords(s: FightSummary): string {
  if (s.mode === "pvp") return "Against another player";
  const size = HOUSE_TIER_INDEX[(s.difficulty ?? "") as HouseSize];
  return size ? `Against a game robot. ${size.label}` : "Against a game robot";
}

/**
 * THE TWO ROBOTS THAT FOUGHT, facing each other. Side A is always on the
 * left and side B on the right, in the order the row already names them, so
 * a card that is deliberately not saying who won still does not say it. The
 * right one is turned around, which is the same turn the knockout card gives
 * the robot it stands behind the winner.
 */
function Versus({ s, size }: { s: FightSummary; size: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flex: "0 0 auto" }}>
      <FightThumb id={s.id} side={0} tier={s.winner === 0 ? s.winnerTier : s.loserTier} size={size} />
      <span style={{ display: "inline-flex", transform: "scaleX(-1)" }}>
        <FightThumb id={s.id} side={1} tier={s.winner === 1 ? s.winnerTier : s.loserTier} size={size} />
      </span>
    </span>
  );
}

function LiveCard({ s, nowMs }: { s: FightSummary; nowMs: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto minmax(0, 1fr) auto",
        gap: 12,
        alignItems: "center",
        minHeight: 96,
        padding: "12px 14px",
        borderRadius: R.card,
        border: `1px solid ${M.border}`,
        background: M.surface2,
      }}
    >
      <Versus s={s} size={PORTRAIT_ON.live} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span className={css.live} aria-hidden style={{ width: 8, height: 8, borderRadius: R.pill, background: M.bad, display: "inline-block" }} />
          <span style={{ ...mono(11, M.bad), letterSpacing: "0.18em" }}>LIVE</span>
          <span style={mono(11)}>{modeWords(s)}</span>
          <span style={mono(11)}>{ago(s.createdAt, nowMs)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT_DISPLAY, fontSize: 14, fontWeight: 700, color: M.text, flexWrap: "wrap" }}>
          <Dot color={TIER_COLOR[s.winner === 0 ? s.winnerTier : s.loserTier]} />
          <span>{s.names[0]}</span>
          <span style={{ ...mono(11), fontWeight: 400 }}>against</span>
          <span>{s.names[1]}</span>
          <Dot color={TIER_COLOR[s.winner === 1 ? s.winnerTier : s.loserTier]} />
        </div>
        <div style={{ fontSize: 12, color: M.muted, marginTop: 2 }}>
          {s.walletNames[0]} against {s.walletNames[1]}
        </div>
      </div>
      <Link href={`/bots/fight/${s.id}`} className={uiCss.press} style={door(true)}>
        {t.battles.watch}
      </Link>
    </div>
  );
}

function FeaturedRow({ tag, s }: { tag: string; s: FightSummary }) {
  return (
    <Link
      href={`/bots/fight/${s.id}`}
      className={uiCss.press}
      style={{
        display: "grid",
        gridTemplateColumns: "auto minmax(0, 1fr) auto",
        gap: 10,
        alignItems: "center",
        minHeight: 56,
        padding: "8px 14px 8px 8px",
        borderRadius: R.inner,
        border: `1px solid ${M.border}`,
        background: "transparent",
        color: M.text,
        textDecoration: "none",
      }}
    >
      <FightThumb id={s.id} side={s.winner} tier={s.winnerTier} size={PORTRAIT_ON.featured} />
      <span style={{ minWidth: 0 }}>
        <span style={{ ...mono(11, M.warn), display: "block" }}>{tag}</span>
        <span style={{ fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 700, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {s.winnerName} beat {s.loserName}
        </span>
      </span>
      <span style={mono(12)}>{s.seconds} s</span>
    </Link>
  );
}

function RecentRow({ s, nowMs }: { s: FightSummary; nowMs: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto minmax(0, 1fr) auto auto",
        gap: 10,
        alignItems: "center",
        minHeight: 56,
        padding: "6px 8px",
        borderRadius: R.inner,
        border: `1px solid ${M.border}`,
        background: M.surface2,
      }}
    >
      {/* THE ROBOT THAT WON, in its own colours, where a coloured dot was.
          34 and not 40, for two measured reasons. This is the longest list
          in the game (50 rows) and 34 draws from the 64 px file at 5.4 KB
          where 40 would take the 120 at 14.1. And on a 390 wide phone the
          row is a picture, a name, a time and a button: every pixel the
          picture takes is a word off the end of "X beat Y". */}
      <FightThumb id={s.id} side={s.winner} tier={s.winnerTier} size={PORTRAIT_ON.fightsList} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 700, color: M.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {s.winnerName} beat {s.loserName}
        </div>
        <div style={{ fontSize: 12, color: M.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {s.finisher}. {modeWords(s)}
        </div>
      </div>
      <span style={{ ...mono(11), whiteSpace: "nowrap" }}>{ago(s.createdAt, nowMs)}</span>
      <Link href={`/bots/fight/${s.id}`} className={uiCss.press} style={{ ...door(false), padding: "10px 14px" }}>
        {t.battles.watch}
      </Link>
    </div>
  );
}
