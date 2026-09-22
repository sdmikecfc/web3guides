"use client";
/**
 * S5 PERSONAL HQ, the upgraded panel bodies (loadout / commander / workbench /
 * footlocker quest log / funding wizard). HqScene stays the stage; these are
 * the panels its overlay opens. Client-safe imports ONLY (tanks/model/theme/
 * funding/ftue/track are all pure client-side libs).
 *
 * Data flow: HqScene owns one HqMe state (guest defaults until /api/s6/me
 * lands) and hands panels `me` + `patchMe`. Writes go through:
 *   /api/s6/hq           field tank / camo / commander (cosmetic, free)
 *   /api/s6/tank-unlock  Shells spend (server-priced, fail-closed)
 *   /api/s6/vault-buy    the Armory Vault daily deal (server-priced, fail-closed)
 *   /api/s6/claim-ftue   the First Colors decal (idempotent)
 *   /api/s6/funding-status  the stuck-step detector (fail-soft)
 *
 * Copy rules: no em-dashes, never "win $X", the card branch never says "$5".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CAMOS,
  CAMO_LADDER,
  FREE_TANK_KEYS,
  STAT_MILESTONE_TANKS,
  hullForTier,
  resolveTank,
  tankArt,
  type CamoKey,
  type ResolvedTank,
} from "@/lib/s6/model";
import {
  COMMANDERS,
  DEFAULT_COMMANDER_KEY,
  TANK_ROSTER,
  TANK_TIER_PRICES,
  tankPower,
  type Tank,
} from "@/lib/s6/tanks";
import { DEFAULT_THEME } from "@/lib/s6/theme";
import {
  BONDS_TIER_MAX,
  BONDS_XP_PER_MEDALS,
  FTUE_TOUR_GOAL,
  STREAK_MARKERS,
  STREAK_METER_MAX,
  decalLabel,
  guestHasAnyScore,
  isKnownDecal,
  readFtue,
  type FtueLocal,
} from "@/lib/s6/ftue";
import { GAMES, GAME_DAILY_POINTS_CAP, POINTS_PER_RUN, STAT_LABELS, ZERO_STATS, statNextPrice, type PlayerStats, type StatKey } from "@/lib/s6/games";
import { RESOLVE_HOUR_UTC } from "@/lib/s6/raid";
import { breachDecalKey, vaultDayNumber, vaultDealForDay } from "@/lib/s6/vault";
import {
  DOMA_APP_URL,
  DOMA_CHAIN,
  STARGATE_BRIDGE_URL,
  buyLink,
  DOMA_PROFILE_URL,
  type FundingState,
  type FundingStatus,
} from "@/lib/s6/funding";
import { STRINGS, fill, type S6Dict } from "@/lib/s6/strings";
import { usePlaySession } from "@/app/s6/_components/usePlaySession";
import { track } from "@/lib/s6/track";
import { LivingPortrait } from "./LivingPortrait";
import { BuyPanel } from "@/app/s6/_components/BuyPanel";
import { demoReply, isDemo } from "@/lib/s6/demo";

const STEEL = "#9aa7b4";
const EMBER = "#e0662e";
const BORDER = "#232a32";
const TEXT = "#e9edf1";
const MUTED = "#aab4bd";
const FAINT = "#87919b";
const GOOD = "#34d399";
const WARN = "#f0b340";
const BAD = "#f87171";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

const THEME = DEFAULT_THEME; // Medals / Shells / strongholds wording

// ── The one player-state shape the HQ scene + panels share ──────────────────
export type HqMe = {
  /** True once a play session resolved a real player. */
  session: boolean;
  token: string | null;
  shells: number;
  points: number;
  heldUsd: number;
  tank: ResolvedTank;
  ownedTanks: string[];
  /** Earned camo keys; olive always present (the camo ladder, bot-swept). */
  ownedCamos: string[];
  /** Earned prize commanders (bigmike or nothing). */
  ownedPilots: string[];
  pilot: string;
  bondsTier: number;
  streakDays: number;
  crates: string[];
  /** Raw upgrade levels (botox 0..4, aura 0..30): the Upgrades shelf's basis. */
  stats: PlayerStats;
  /** YOUR OWN public handle, so a surface can link you to your own garage
   *  and its share card. Null until a session resolves. */
  handle: string | null;
};

export function defaultHqMe(): HqMe {
  return {
    session: false,
    token: null,
    shells: 0,
    points: 0,
    heldUsd: 0,
    tank: resolveTank(null),
    ownedTanks: [...FREE_TANK_KEYS],
    ownedCamos: ["olive"],
    ownedPilots: [],
    pilot: DEFAULT_COMMANDER_KEY,
    bondsTier: 0,
    streakDays: 0,
    crates: [],
    stats: { ...ZERO_STATS },
    handle: null,
  };
}

export type TargetLink = { domain: string; name: string; status: string; progress?: number };

type PatchMe = (patch: Partial<HqMe>) => void;

async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  // DEMO SANDBOX. Short-circuits before the fetch, not after: there is no
  // request at all, so no server route can mishandle one. See lib/s5/demo.ts
  // for why a client-set flag is safe here (short version: no token, so no
  // write route would authenticate it even if a request escaped).
  if (isDemo()) return demoReply(url, body);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await r.json().catch(() => null)) as unknown;
    return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// ── Small atoms ─────────────────────────────────────────────────────────────

const sectionLabel: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 10.5,
  letterSpacing: "0.22em",
  color: FAINT,
  textTransform: "uppercase",
  margin: "0 0 8px",
};

function PanelH({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "0 0 10px" }}>
      {/* id is the overlay dialog's aria-labelledby target: every panel routes
          its title through here, so one id names whichever panel is open. */}
      <h2 id="s5hq-panel-title" style={{ fontSize: 17, fontWeight: 800, margin: 0, color: TEXT }}>
        {children}
      </h2>
      {right}
    </div>
  );
}

function Note({ tone, children }: { tone: "good" | "warn" | "bad" | "muted"; children: React.ReactNode }) {
  const color = tone === "good" ? GOOD : tone === "warn" ? WARN : tone === "bad" ? BAD : MUTED;
  return (
    <div style={{ fontSize: 12.5, color, lineHeight: 1.5, margin: "8px 0 0" }} data-testid="panel-note">
      {children}
    </div>
  );
}

/** THE one action a panel wants you to take: filled, not a hairline.
 *
 * `actionBtn` below is the SECONDARY style (pick a camo, field a tank you
 * already own). It renders as a transparent box with a 27%-alpha border, which
 * is right for a list of equal choices and wrong for "buy this". The vault used
 * it at opacity 0.5 when signed out, and the result was invisible: Mike walked
 * the shop and reported there was no way to buy anything. */
function primaryBtn(accent = WARN, disabled = false): React.CSSProperties {
  return {
    padding: "10px 16px",
    borderRadius: 8,
    border: `1px solid ${accent}`,
    background: disabled ? `${accent}22` : accent,
    color: disabled ? MUTED : "#0b0d10",
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: 0.2,
    cursor: disabled ? "not-allowed" : "pointer",
    boxShadow: disabled ? "none" : `0 6px 18px ${accent}33`,
  };
}

function actionBtn(active: boolean, accent = STEEL): React.CSSProperties {
  return {
    padding: "7px 12px",
    borderRadius: 7,
    border: `1px solid ${active ? accent : `${STEEL}44`}`,
    background: active ? `${accent}22` : "transparent",
    color: active ? TEXT : MUTED,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  };
}

/** Tank art with the gradient-silhouette fallback (art lands later). */
function TankArtBox({ tank, height }: { tank: ResolvedTank | Tank; height: number }) {
  const isResolved = "art" in tank;
  const src = isResolved ? (tank as ResolvedTank).art : tankArt((tank as Tank).key, "olive");
  const [broken, setBroken] = useState(false);
  const ref = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    setBroken(false);
  }, [src]);
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setBroken(true);
  }, [src]);
  if (!broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={ref}
        src={src}
        alt=""
        aria-hidden
        style={{ width: "100%", height, objectFit: "contain", display: "block" }}
        onError={() => setBroken(true)}
      />
    );
  }
  // Silhouette: hull + turret + tracks, scaled to the box.
  const h = height;
  return (
    <div aria-hidden style={{ position: "relative", width: "100%", height: h, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div
        style={{
          width: "78%",
          height: h * 0.44,
          borderRadius: "14% 22% 8% 8%",
          background: "linear-gradient(160deg, #39434d 0%, #232a32 55%, #14181d 100%)",
          border: `1px solid ${STEEL}33`,
          position: "relative",
          marginBottom: h * 0.12,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -h * 0.18,
            left: "30%",
            width: "36%",
            height: h * 0.24,
            borderRadius: 6,
            background: "linear-gradient(160deg, #434e59 0%, #232a32 80%)",
            border: `1px solid ${STEEL}26`,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: -h * 0.08,
            left: "60%",
            width: "46%",
            height: Math.max(3, h * 0.05),
            borderRadius: 3,
            background: "#39434d",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -h * 0.12,
            left: "-3%",
            width: "106%",
            height: h * 0.2,
            borderRadius: h,
            background: "linear-gradient(180deg, #1b2026 0%, #0e1114 100%)",
            border: "1px solid #2c343d",
          }}
        />
      </div>
    </div>
  );
}

/** The Top-Trumps ratings block: FIREPOWER / SPEED / MANEUVER / ARMOR, x/10.
 * `labels` is an optional i18n override; the default stays English so other
 * callers (the public garage) keep working untouched. */
export function RatingsBars({
  ratings,
  labels,
}: {
  ratings: ResolvedTank["ratings"];
  labels?: { fp: string; spd: string; man: string; arm: string };
}) {
  const rows: Array<{ key: string; label: string; v: number }> = [
    { key: "fp", label: labels?.fp ?? "Firepower", v: ratings.fp },
    { key: "spd", label: labels?.spd ?? "Speed", v: ratings.spd },
    { key: "man", label: labels?.man ?? "Maneuver", v: ratings.man },
    { key: "arm", label: labels?.arm ?? "Armor", v: ratings.arm },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }} data-testid="tank-ratings">
      {rows.map((r) => (
        <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 8 }} data-testid={`rating-${r.key}`}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: FAINT, textTransform: "uppercase", width: 82, flexShrink: 0 }}>
            {r.label}
          </span>
          <span style={{ flex: 1, height: 8, borderRadius: 4, background: `${STEEL}1c`, border: `1px solid ${BORDER}`, overflow: "hidden", display: "block" }}>
            <span
              style={{
                display: "block",
                height: "100%",
                width: `${Math.max(0, Math.min(10, r.v)) * 10}%`,
                background: `linear-gradient(90deg, ${EMBER}cc 0%, ${EMBER} 100%)`,
              }}
            />
          </span>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: TEXT, width: 38, textAlign: "right" }}>{r.v}/10</span>
        </div>
      ))}
    </div>
  );
}

// ── 1) TANK PANEL: the loadout + garage grid ────────────────────────────────

export function TankPanel({
  me,
  patchMe,
  onOpenWizard,
  dict = STRINGS.en,
  ready = true,
}: {
  me: HqMe;
  patchMe: PatchMe;
  onOpenWizard: () => void;
  dict?: S6Dict;
  /** False while the session lookup is still in flight. Without it the
   *  garage renders the signed-out CTA on every tank for a beat, telling a
   *  logged-in commander to "Enlist to field" a tank they already own.
   *  useHqMe has exported this since it was written; nothing read it. */
  ready?: boolean;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "good" | "warn" | "bad" | "muted"; text: string } | null>(null);
  const D = dict.panels;

  /**
   * SIGN IN RIGHT HERE. The button used to be a Link to /s5/join, which enlists
   * a WALLET into the season and has never minted a play-session token, so it
   * could not fix the thing it was offering to fix: you enlisted, came back,
   * and the garage still said "Enlist to field". The only mint in the app was
   * buried inside an arcade game. Now the garage opens its own session.
   */
  const session = usePlaySession();
  const signIn = useCallback(async () => {
    setNote(null);
    const token = await session.open();
    if (!token) {
      // A cancelled signature is not an error worth shouting about; an actual
      // failure is. `null` with no error means "connect modal opened".
      if (session.error) setNote({ tone: "bad", text: session.error });
      return;
    }
    // The panel's own copy of the player is the thing gating every button, so
    // reflect the new session immediately rather than waiting for a remount.
    patchMe({ session: true, token });
    setNote({ tone: "good", text: D.fielded });
  }, [session, patchMe, D]);

  const field = useCallback(
    async (key: string) => {
      if (!me.token) {
        setNote({ tone: "muted", text: D.fieldNeedSession });
        return;
      }
      setBusyKey(key);
      setNote(null);
      const r = await postJson("/api/s6/hq", { t: me.token, set: { tank: key } });
      setBusyKey(null);
      if (r.ok && r.tank) {
        patchMe({
          tank: r.tank as ResolvedTank,
          ownedTanks: Array.isArray(r.ownedTanks) ? (r.ownedTanks as string[]) : me.ownedTanks,
        });
        setNote({ tone: "good", text: D.fielded });
      } else {
        setNote({ tone: "bad", text: String(r.error || D.fieldFailed) });
      }
    },
    [me.token, me.ownedTanks, patchMe, D],
  );

  const unlock = useCallback(
    async (t: Tank) => {
      if (!me.token) {
        setNote({ tone: "muted", text: D.unlockNeedSession });
        return;
      }
      setBusyKey(t.key);
      setNote(null);
      const r = await postJson("/api/s6/tank-unlock", { t: me.token, tank: t.key });
      setBusyKey(null);
      if (r.ok && r.tank) {
        patchMe({
          tank: r.tank as ResolvedTank,
          ownedTanks: Array.isArray(r.ownedTanks) ? (r.ownedTanks as string[]) : me.ownedTanks,
          shells: Number.isFinite(Number(r.shells)) ? Number(r.shells) : me.shells,
        });
        setNote({ tone: "good", text: fill(D.unlocked, { name: t.name }) });
      } else {
        setNote({ tone: "bad", text: String(r.error || D.unlockFailed) });
      }
    },
    [me.token, me.ownedTanks, me.shells, patchMe, D],
  );

  const owned = new Set(me.ownedTanks);
  const tiers: Array<Tank["tier"]> = [1, 2, 3, 4, 5];

  return (
    <div data-testid="tank-panel">
      <DemoBadge />
      <PanelH
        right={
          <span
            data-testid="shells-balance"
            style={{
              fontFamily: MONO,
              fontSize: 12,
              fontWeight: 700,
              color: WARN,
              border: `1px solid ${WARN}44`,
              borderRadius: 999,
              padding: "4px 10px",
              whiteSpace: "nowrap",
            }}
          >
            {me.session ? `${me.shells.toLocaleString()} ${THEME.playCurrency}` : D.shellsEnlist}
          </span>
        }
      >
        {dict.hotspots.tank.label}
      </PanelH>

      {/* YOUR OWN GARAGE. Mike, 2026-08-04: "its hard to see your own profile
          like when you click on someone so I would never be able to find my own
          shareable card." Every other commander's garage was one tap from the
          map; your own was only reachable by spotting your name among fifty
          figures. This is the missing door. */}
      {me.session && me.handle ? (
        <a
          href={`/s6/hq/${encodeURIComponent(me.handle)}`}
          data-testid="my-garage-link"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 10,
            padding: "9px 12px",
            borderRadius: 10,
            border: `1px solid ${EMBER}44`,
            background: `${EMBER}14`,
            color: TEXT,
            fontSize: 12.5,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          <span>{D.myGarageCta}</span>
          <span aria-hidden style={{ color: EMBER, fontWeight: 800 }}>&rarr;</span>
        </a>
      ) : null}

      {/* The fielded tank, big */}
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 14px 12px", background: "rgba(255,255,255,0.02)" }}>
        <TankArtBox tank={me.tank} height={120} />
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginTop: 8 }}>
          <div>
            <div data-testid="fielded-tank-name" style={{ fontSize: 18, fontWeight: 800, color: TEXT }}>
              {me.tank.tankName}
            </div>
            <div style={{ fontSize: 11.5, color: FAINT }}>
              {fill(dict.hq.tierClassLine, { tier: me.tank.tier, hull: me.tank.hullName })} ·{" "}
              {fill(dict.hq.camoLine, { camo: dict.camo[me.tank.camo] })}
            </div>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: STEEL, whiteSpace: "nowrap" }}>PWR {me.tank.power}</div>
        </div>
        <div style={{ margin: "10px 0 8px" }}>
          <RatingsBars
            ratings={me.tank.ratings}
            labels={{ fp: D.ratingFp, spd: D.ratingSpd, man: D.ratingMan, arm: D.ratingArm }}
          />
        </div>
        <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.55, margin: 0 }}>
          {(dict.tankBlurbs as Record<string, string>)[me.tank.tankKey] ||
            TANK_ROSTER.find((t) => t.key === me.tank.tankKey)?.blurb ||
            ""}
        </p>
      </div>

      {/* Get armed: the funding wizard CTA for anyone not yet holding $5 */}
      {me.heldUsd < 5 ? (
        <button
          data-testid="get-armed-cta"
          onClick={() => {
            track("cta_click", { ref: "tank-get-armed" });
            onOpenWizard();
          }}
          style={{
            marginTop: 12,
            width: "100%",
            padding: "12px 16px",
            borderRadius: 9,
            border: `1px solid ${EMBER}66`,
            background: `${EMBER}1f`,
            color: TEXT,
            fontSize: 13.5,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          {D.getArmedFirstHold}
        </button>
      ) : null}

      {/* The garage grid, grouped by tier */}
      <div style={{ marginTop: 16 }} data-testid="tank-garage">
        {tiers.map((tier) => {
          const group = TANK_ROSTER.filter((t) => t.tier === tier);
          const price = TANK_TIER_PRICES[tier];
          return (
            <div key={tier} style={{ marginBottom: 14 }}>
              <div style={sectionLabel}>
                {fill(dict.hq.tierClassLine, { tier, hull: hullForTier(tier).name })}
                {price > 0 ? ` · ${price.toLocaleString()} ${THEME.playCurrency}` : ` · ${D.tierFree}`}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {group.map((t) => {
                  const isOwned = owned.has(t.key);
                  const isFielded = me.tank.tankKey === t.key;
                  const busy = busyKey === t.key;
                  return (
                    <div
                      key={t.key}
                      data-testid={`tank-card-${t.key}`}
                      data-owned={isOwned ? "1" : "0"}
                      data-fielded={isFielded ? "1" : "0"}
                      style={{
                        border: `1px solid ${isFielded ? EMBER : BORDER}`,
                        borderRadius: 10,
                        padding: "8px 8px 9px",
                        background: isFielded ? `${EMBER}12` : "rgba(255,255,255,0.02)",
                        opacity: isOwned ? 1 : 0.62,
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <TankArtBox tank={t} height={44} />
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: TEXT, lineHeight: 1.25, minHeight: 28 }}>{t.name}</div>
                      <div style={{ fontFamily: MONO, fontSize: 9.5, color: FAINT }}>PWR {tankPower(t)}</div>
                      {isFielded ? (
                        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", color: EMBER }}>{D.fieldedBadge}</div>
                      ) : !ready ? (
                        // STILL CHECKING. Neither branch below is safe to guess:
                        // showing "Enlist" accuses a signed-in commander of being
                        // a guest, and showing "Field" hands a guest a button that
                        // can only fail. Hold the space instead.
                        <button disabled style={actionBtn(false)} aria-hidden>
                          ...
                        </button>
                      ) : !me.session ? (
                        // SIGNED OUT. This used to be a Link to /s5/join, which
                        // cannot mint a play session, so the button was a loop
                        // back to itself. It now opens the session in place.
                        <button
                          onClick={signIn}
                          disabled={session.busy}
                          data-testid={`tank-enlist-${t.key}`}
                          style={actionBtn(true)}
                        >
                          {session.busy ? "..." : dict.retention.tankEnlistCta}
                        </button>
                      ) : isOwned ? (
                        <button onClick={() => field(t.key)} disabled={busy} style={actionBtn(true)}>
                          {busy ? "..." : D.fieldBtn}
                        </button>
                      ) : (
                        <button onClick={() => unlock(t)} disabled={busy} style={actionBtn(false, WARN)} data-testid={`unlock-${t.key}`}>
                          {busy ? "..." : fill(D.unlockBtn, { price: price.toLocaleString() })}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {!me.session && ready ? ( /* the guest note is fine to defer: it explains, it does not gate */
        <Note tone="muted">
          {D.garageGuest}
        </Note>
      ) : null}
      {note ? <Note tone={note.tone}>{note.text}</Note> : null}
    </div>
  );
}

// ── 2) COMMANDER PANEL: the 8-cast grid, free pick + swap ───────────────────

/** The living portrait of the currently-selected pilot: the shared
 *  LivingPortrait (idle clip over the knee-up still, reduced-motion aware)
 *  inside the panel's framed card. `fit="contain"` bottom-center makes the
 *  knee-up static read as a figure card over the card gradient. */
function CommanderPreview({ ck }: { ck: string }) {
  return (
    <div
      data-testid="commander-preview"
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 240,
        aspectRatio: "3 / 4",
        margin: "0 auto 14px",
        borderRadius: 14,
        overflow: "hidden",
        border: `1px solid ${BORDER}`,
        background: "linear-gradient(180deg, #1a1f25 0%, #0c1014 100%)",
      }}
    >
      <LivingPortrait ck={ck} showName fit="contain" />
    </div>
  );
}

function CommanderArt({ ck, size }: { ck: string; size: number }) {
  const [broken, setBroken] = useState(false);
  const src = `/s6-art/pilot/${ck}.png`;
  if (!broken) {
    return (
      // The statics are knee-up figures now: a small square chip must crop to
      // the HEAD, not the torso, so the face is what identifies the card.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" aria-hidden style={{ width: size, height: size, objectFit: "cover", objectPosition: "top center", borderRadius: 8, display: "block" }} onError={() => setBroken(true)} />
    );
  }
  return (
    <div aria-hidden style={{ width: size, height: size, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: size * 0.3, height: size * 0.3, borderRadius: "50%", background: "linear-gradient(160deg, #4a555f 0%, #232a32 90%)", border: `1px solid ${STEEL}44` }} />
      <div style={{ width: size * 0.44, height: size * 0.5, marginTop: -2, borderRadius: "10px 10px 6px 6px", background: "linear-gradient(180deg, #39434d 0%, #171c22 100%)", border: `1px solid ${STEEL}33` }} />
    </div>
  );
}

export function CommanderPanel({
  me,
  patchMe,
  dict = STRINGS.en,
}: {
  me: HqMe;
  patchMe: PatchMe;
  dict?: S6Dict;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "good" | "warn" | "bad" | "muted"; text: string } | null>(null);
  const D = dict.panels;
  const cast = dict.pilots as Record<string, { role: string; blurb: string }>;

  const pick = useCallback(
    async (key: string) => {
      if (!me.token) {
        setNote({ tone: "muted", text: D.pilotNeedSession });
        return;
      }
      setBusyKey(key);
      setNote(null);
      const r = await postJson("/api/s6/hq", { t: me.token, set: { pilot: key } });
      setBusyKey(null);
      if (r.ok) {
        patchMe({ pilot: typeof r.pilot === "string" ? r.pilot : key });
        setNote({ tone: "good", text: D.pilotSwapped });
      } else {
        setNote({ tone: "bad", text: String(r.error || D.pilotSwapFailed) });
      }
    },
    [me.token, patchMe, D],
  );

  return (
    <div data-testid="commander-panel">
      <PanelH>{dict.hotspots.pilot.label}</PanelH>
      <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.55, margin: "0 0 12px" }}>
        {D.pilotIntro}
      </p>
      <CommanderPreview ck={me.pilot || DEFAULT_COMMANDER_KEY} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }} data-testid="commander-grid">
        {COMMANDERS.map((c) => {
          const isCurrent = me.pilot === c.key;
          const busy = busyKey === c.key;
          // Prize commanders render as a LOCKED slot until earned: the ladder
          // has to be visible before it pays (Mike's "top of the day" prize).
          const locked = !!c.prize && !me.ownedPilots.includes(c.key);
          return (
            <button
              key={c.key}
              data-testid={`commander-card-${c.key}`}
              data-current={isCurrent ? "1" : "0"}
              data-locked={locked ? "1" : "0"}
              onClick={() =>
                isCurrent
                  ? undefined
                  : locked
                    ? setNote({ tone: "muted", text: D.pilotEarnTop })
                    : pick(c.key)
              }
              disabled={busy}
              style={{
                textAlign: "left",
                display: "flex",
                gap: 10,
                alignItems: "center",
                border: `1px solid ${isCurrent ? EMBER : BORDER}`,
                borderRadius: 10,
                padding: "8px 10px",
                background: isCurrent ? `${EMBER}12` : "rgba(255,255,255,0.02)",
                color: TEXT,
                cursor: isCurrent ? "default" : "pointer",
              }}
            >
              <span style={{ position: "relative", filter: locked ? "saturate(0.35) brightness(0.7)" : "none" }}>
                <CommanderArt ck={c.key} size={44} />
                {locked ? (
                  <span aria-hidden style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🔒</span>
                ) : null}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 800 }}>
                  {c.name}
                  {isCurrent ? <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.14em", color: EMBER, marginLeft: 6 }}>{D.activeBadge}</span> : null}
                </span>
                <span style={{ display: "block", fontSize: 10.5, color: STEEL, fontWeight: 700 }}>{cast[c.key]?.role ?? c.role}</span>
                <span style={{ display: "block", fontSize: 10.5, color: FAINT, lineHeight: 1.4, marginTop: 2 }}>
                  {busy ? D.swapping : locked ? D.pilotEarnTop : (cast[c.key]?.blurb ?? c.blurb)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {note ? <Note tone={note.tone}>{note.text}</Note> : null}
    </div>
  );
}

// ── 3) WORKBENCH PANEL: camo picker + decal shelf + War Bonds strip ─────────

const CAMO_SWATCH: Record<CamoKey, string> = {
  olive: "linear-gradient(135deg, #5b6b3f 0%, #3c4a2a 100%)",
  desert: "linear-gradient(135deg, #c2a878 0%, #8f7a4e 100%)",
  winter: "linear-gradient(135deg, #d9e2e8 0%, #9fb0ba 100%)",
  night: "linear-gradient(135deg, #2a3140 0%, #14181f 100%)",
  urban: "linear-gradient(135deg, #7d8790 0%, #4a545d 100%)",
  gold: "linear-gradient(135deg, #e8c258 0%, #9a742a 100%)",
};

/** The one-line "how do I get this" per locked camo, from the ladder table. */
function camoEarnHint(c: CamoKey, dict: S6Dict): string {
  const rung = CAMO_LADDER.find((r) => r.camo === c);
  if (!rung || rung.from === "free") return "";
  if (rung.from === "top") return dict.panels.camoEarnTop;
  const game = GAMES.find((g) => g.key === rung.game);
  return fill(dict.panels.camoEarnGame, { game: game?.name ?? rung.game ?? "" });
}

/**
 * A standing banner while the shop sandbox is on.
 *
 * Not decoration: a screen showing 420 Shells and unlockable tanks is
 * indistinguishable from a real funded account, and somebody will eventually
 * screenshot one and ask why their balance vanished. It says what it is.
 */
export function DemoBadge() {
  if (!isDemo()) return null;
  return (
    <div
      data-testid="demo-badge"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        marginBottom: 12,
        borderRadius: 8,
        border: "1px solid rgba(224,102,46,0.5)",
        background: "rgba(224,102,46,0.14)",
        fontSize: 11.5,
        fontWeight: 700,
        letterSpacing: "0.04em",
        color: "#f3c9b2",
      }}
    >
      <span style={{ fontFamily: MONO, letterSpacing: "0.2em" }}>DEMO</span>
      <span style={{ fontWeight: 500 }}>
        Sandbox wallet. Real prices, nothing saved. Refresh resets it.
      </span>
    </div>
  );
}

export function WorkbenchPanel({
  me,
  patchMe,
  dict = STRINGS.en,
}: {
  me: HqMe;
  patchMe: PatchMe;
  dict?: S6Dict;
}) {
  const [busyCamo, setBusyCamo] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "good" | "warn" | "bad" | "muted"; text: string } | null>(null);
  const D = dict.panels;

  const paint = useCallback(
    async (camo: CamoKey) => {
      if (!me.token) {
        setNote({ tone: "muted", text: D.camoNeedSession });
        return;
      }
      setBusyCamo(camo);
      setNote(null);
      const r = await postJson("/api/s6/hq", { t: me.token, set: { camo } });
      setBusyCamo(null);
      if (r.ok && r.tank) {
        patchMe({ tank: r.tank as ResolvedTank });
        setNote({ tone: "good", text: fill(D.camoPainted, { camo: dict.camo[camo] }) });
      } else {
        setNote({ tone: "bad", text: String(r.error || D.camoFailed) });
      }
    },
    [me.token, patchMe, D, dict],
  );

  const [busyStat, setBusyStat] = useState<string | null>(null);
  const buyStat = useCallback(
    async (stat: StatKey) => {
      if (!me.token) {
        setNote({ tone: "muted", text: D.upgradeNeedSession });
        return;
      }
      setBusyStat(stat);
      setNote(null);
      const r = await postJson("/api/s6/upgrade", { t: me.token, stat });
      setBusyStat(null);
      if (r.ok) {
        patchMe({
          stats: (r.stats as PlayerStats) ?? me.stats,
          shells: typeof r.shells === "number" ? r.shells : me.shells,
          ownedTanks: Array.isArray(r.ownedTanks) ? (r.ownedTanks as string[]) : me.ownedTanks,
        });
        const mt = typeof r.milestoneTank === "string" ? r.milestoneTank : null;
        const tank = mt ? TANK_ROSTER.find((t) => t.key === mt) : null;
        setNote(
          tank
            ? { tone: "good", text: fill(D.upgradeMilestone, { stat: STAT_LABELS[stat].name, tank: tank.name }) }
            : { tone: "good", text: fill(D.upgradeDone, { stat: STAT_LABELS[stat].name }) },
        );
      } else {
        setNote({ tone: "bad", text: String(r.error || D.upgradeFailed) });
      }
    },
    [me, patchMe, D],
  );

  const xp = Math.floor(me.points / BONDS_XP_PER_MEDALS);
  const decals = me.tank.decals;

  return (
    <div data-testid="workbench-panel">
      <DemoBadge />
      <PanelH>{dict.hotspots.workbench.label}</PanelH>

      {/* THE UPGRADES SHELF (the tab's namesake, finally). Server-priced,
          Shells only; the milestone column keeps Mike's "new tanks from
          upgrading stats" visible BEFORE the money is spent. */}
      <div style={sectionLabel}>{D.upgradesHeading}</div>
      <div style={{ display: "grid", gap: 7, marginBottom: 16 }} data-testid="upgrade-shop">
        {(["botox", "drugs", "ozempic", "optics", "aura"] as StatKey[]).map((k) => {
          const meta = STAT_LABELS[k];
          const level = me.stats[k] ?? 0;
          const price = statNextPrice(k, level);
          const maxed = price === null;
          const milestone = STAT_MILESTONE_TANKS.find((m) => m.stat === k);
          const milestoneTank = milestone ? TANK_ROSTER.find((t) => t.key === milestone.tank) : null;
          const milestoneOwned = milestone ? me.ownedTanks.includes(milestone.tank) : false;
          const afford = price !== null && me.shells >= price;
          return (
            <div
              key={k}
              data-testid={`upgrade-${k}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                border: `1px solid ${BORDER}`,
                borderRadius: 10,
                padding: "9px 11px",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <div style={{ minWidth: 0, flexGrow: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: TEXT }}>
                  {meta.name}
                  <span style={{ fontFamily: MONO, fontSize: 9.5, color: STEEL, marginLeft: 7 }}>
                    {k === "aura" ? `${level}/${meta.max}` : null}
                  </span>
                </div>
                {/* Pips for the 4-level stats; Caliber prints its number. */}
                {k !== "aura" ? (
                  <div style={{ display: "flex", gap: 3, marginTop: 4 }} aria-hidden>
                    {Array.from({ length: meta.max }, (_, i) => (
                      <span
                        key={i}
                        style={{
                          width: 14,
                          height: 5,
                          borderRadius: 2,
                          background: i < level ? EMBER : "rgba(255,255,255,0.09)",
                        }}
                      />
                    ))}
                  </div>
                ) : null}
                {milestone && milestoneTank && !milestoneOwned ? (
                  <div style={{ fontSize: 9.5, color: FAINT, marginTop: 4, lineHeight: 1.35 }}>
                    {fill(D.upgradeMilestoneHint, { tank: milestoneTank.name })}
                  </div>
                ) : null}
              </div>
              {maxed ? (
                <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", color: STEEL, textTransform: "uppercase" }}>
                  {D.upgradeMaxed}
                </span>
              ) : (
                <button
                  data-testid={`upgrade-buy-${k}`}
                  onClick={() => buyStat(k)}
                  disabled={busyStat === k || !me.session}
                  style={{
                    ...actionBtn(Boolean(me.session) && afford, EMBER),
                    whiteSpace: "nowrap",
                    opacity: me.session ? 1 : 0.55,
                  }}
                >
                  {busyStat === k ? D.swapping : `${price!.toLocaleString()} Scrap`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* THE CAMO LADDER. Every scheme is on the shelf, owned or not: a
          locked camo showing its earn line IS the progression UI (Mike's
          "best in a mini-game for the day gives you a new color"). Tapping a
          locked chip explains instead of failing - the API would reject the
          swap anyway, but a player should never need the error to learn the
          rule. */}
      <div style={sectionLabel}>{D.camoHeading}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }} data-testid="camo-picker">
        {CAMOS.map((c) => {
          const active = me.tank.camo === c;
          const owned = me.ownedCamos.includes(c);
          const hint = camoEarnHint(c, dict);
          return (
            <button
              key={c}
              data-testid={`camo-${c}`}
              data-active={active ? "1" : "0"}
              data-locked={owned ? "0" : "1"}
              onClick={() =>
                active
                  ? undefined
                  : owned
                    ? paint(c)
                    : setNote({ tone: "muted", text: `${dict.camo[c]}: ${hint}` })
              }
              disabled={busyCamo === c}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 5,
                padding: "7px 9px",
                borderRadius: 9,
                maxWidth: 92,
                border: `1px solid ${active ? EMBER : BORDER}`,
                background: active ? `${EMBER}12` : "rgba(255,255,255,0.02)",
                color: active ? TEXT : MUTED,
                cursor: active ? "default" : "pointer",
              }}
            >
              <span aria-hidden style={{ position: "relative", width: 30, height: 30, borderRadius: 7, background: CAMO_SWATCH[c], border: `1px solid ${c === "gold" ? "#e8c25866" : `${STEEL}33`}`, display: "block", filter: owned ? "none" : "saturate(0.45) brightness(0.75)" }}>
                {owned ? null : (
                  <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🔒</span>
                )}
              </span>
              <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "capitalize" }}>{busyCamo === c ? "..." : dict.camo[c]}</span>
              {owned || !hint ? null : (
                <span style={{ fontSize: 8.5, color: FAINT, lineHeight: 1.3, textAlign: "center" }}>{hint}</span>
              )}
            </button>
          );
        })}
      </div>
      <div style={{ borderRadius: 10, border: `1px solid ${BORDER}`, padding: "8px 10px", background: "rgba(255,255,255,0.02)", marginBottom: 16 }}>
        <TankArtBox tank={me.tank} height={72} />
        <div style={{ textAlign: "center", fontSize: 10.5, color: FAINT, marginTop: 4 }}>
          {me.tank.tankName} · {fill(dict.hq.camoLine, { camo: dict.camo[me.tank.camo] })}
        </div>
      </div>

      {/* Decal shelf: earned, never bought */}
      <div style={sectionLabel}>{D.decalsHeading}</div>
      {decals.length > 0 ? (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }} data-testid="decal-shelf">
          {decals.map((d) => {
            const known = isKnownDecal(d);
            return (
              <span
                key={d}
                data-testid={`decal-${d}`}
                style={{
                  fontFamily: MONO,
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: known ? WARN : MUTED,
                  border: `1px solid ${known ? `${WARN}55` : `${STEEL}33`}`,
                  borderRadius: 999,
                  padding: "5px 11px",
                }}
              >
                {decalLabel(d)}
              </span>
            );
          })}
        </div>
      ) : (
        <p style={{ fontSize: 12.5, color: FAINT, lineHeight: 1.55, margin: "0 0 16px" }} data-testid="decal-shelf">
          {D.decalsEmpty}
        </p>
      )}

      {/* Armory Vault: the deterministic daily deal (L7, ADR-0067) */}
      <VaultSection me={me} patchMe={patchMe} dict={dict} />

      {/* War Bonds strip: tier bar + hold-streak meter */}
      <div style={sectionLabel}>{D.bondsHeading}</div>
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 12px", background: "rgba(255,255,255,0.02)" }} data-testid="bonds-strip">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: TEXT }}>
            {fill(D.bondsTier, { tier: me.bondsTier, max: BONDS_TIER_MAX })}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 10.5, color: FAINT }}>
            {fill(D.bondsXp, { xp, per: BONDS_XP_PER_MEDALS })}
          </span>
        </div>
        <div style={{ height: 9, borderRadius: 5, background: `${STEEL}1c`, border: `1px solid ${BORDER}`, overflow: "hidden" }} data-testid="bonds-bar">
          <div style={{ height: "100%", width: `${(me.bondsTier / BONDS_TIER_MAX) * 100}%`, background: `linear-gradient(90deg, ${STEEL} 0%, ${WARN} 100%)` }} />
        </div>
        {me.bondsTier === 0 ? (
          <div style={{ fontSize: 11.5, color: FAINT, marginTop: 6, lineHeight: 1.5 }}>
            {D.bondsEmpty}
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "14px 0 6px" }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: TEXT }}>
            {me.streakDays === 1 ? D.streakLineOne : fill(D.streakLine, { days: me.streakDays })}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 10.5, color: FAINT }}>
            {fill(D.streakRewards, { markers: STREAK_MARKERS.join(" / ") })}
          </span>
        </div>
        <div style={{ position: "relative", height: 9, borderRadius: 5, background: `${STEEL}1c`, border: `1px solid ${BORDER}` }} data-testid="streak-meter">
          <div
            style={{
              height: "100%",
              width: `${(Math.min(me.streakDays, STREAK_METER_MAX) / STREAK_METER_MAX) * 100}%`,
              borderRadius: 5,
              background: `linear-gradient(90deg, ${EMBER}aa 0%, ${EMBER} 100%)`,
            }}
          />
          {STREAK_MARKERS.map((m) => (
            <span
              key={m}
              data-testid={`streak-marker-${m}`}
              style={{
                position: "absolute",
                top: -3,
                bottom: -3,
                left: `${(m / STREAK_METER_MAX) * 100}%`,
                width: 2,
                background: me.streakDays >= m ? GOOD : `${STEEL}66`,
              }}
            />
          ))}
        </div>
        {me.streakDays === 0 ? (
          <div style={{ fontSize: 11.5, color: FAINT, marginTop: 6, lineHeight: 1.5 }}>
            {D.streakEmpty}
          </div>
        ) : null}
      </div>
      {note ? <Note tone={note.tone}>{note.text}</Note> : null}
    </div>
  );
}

// ── 4a) DAILY ORDERS: the day's three appointments (L4, DISPLAY ONLY) ───────
//
// HARD RULE: this strip READS and never writes. Zero new grant paths: the
// arcade row reads the games' own daily-gauntlet localStorage marks, the raid
// row is the same 14:00 UTC clock the HUD runs, and the hold row reflects the
// me.heldUsd the scene already fetched. Nothing here claims, mints or posts.

/** The games' daily-gauntlet localStorage key (RunShell LS_DAILY convention).
 * The tankbuster legacy-key exception died with that game in the WAVE 4 slate
 * change: every live game now uses the plain convention, so this is a straight
 * mirror of what RunShell derives. */
function dailyLsKeyFor(gameKey: string): string {
  return `s5_${gameKey}_daily`;
}

/** Exported for the desktop rail (HqScene ≥1024px) as well as this panel. */
export function DailyOrders({ me, dict }: { me: HqMe; dict: S6Dict }) {
  const R = dict.retention;
  const liveGames = GAMES.filter((g) => !g.comingSoon);

  // Daily gauntlets flown, read once per panel open (the overlay remounts on
  // every open, so the count is fresh whenever the player looks at it).
  const [flown, setFlown] = useState(0);
  useEffect(() => {
    const day = new Date().toISOString().slice(0, 10);
    let n = 0;
    try {
      for (const g of liveGames) {
        if (localStorage.getItem(dailyLsKeyFor(g.key)) === day) n += 1;
      }
    } catch {
      n = 0; // storage blocked: an honest zero, never a throw
    }
    setFlown(n);
    // liveGames derives from the module-level registry; mount-only by design
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The raid clock: seconds to the next 14:00 UTC resolve (same math as the
  // HUD countdown). Mounted client-side only, ticking while the panel is open.
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  let raidT = "--:--:--";
  if (nowMs !== null) {
    const d = new Date(nowMs);
    const at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), RESOLVE_HOUR_UTC, 0, 0, 0);
    const left = Math.max(0, Math.floor(((at > nowMs ? at : at + 86_400_000) - nowMs) / 1000));
    const pad = (x: number) => String(x).padStart(2, "0");
    raidT = `${pad(Math.floor(left / 3600))}:${pad(Math.floor((left % 3600) / 60))}:${pad(left % 60)}`;
  }

  const holds = me.heldUsd >= 5;
  const allFlown = liveGames.length > 0 && flown >= liveGames.length;
  // done: true/false renders the check state; null = an informational clock
  // row (no joined-state signal exists on the web, so the raid row never
  // pretends to know).
  const rows: Array<{ id: string; title: string; detail: string; done: boolean | null; action?: React.ReactNode }> = [
    {
      id: "arcade",
      title: R.orderArcadeTitle,
      // POINTS_PER_RUN, not the 40/day ceiling: the arcade pays 10 for your
      // first scored run and 0 after it. Passing the ceiling here promised
      // four times the real arcade payout on the "what should I do today" card.
      detail: fill(R.orderArcadeLine, { n: flown, total: liveGames.length, cap: POINTS_PER_RUN }),
      done: allFlown,
      action: allFlown ? undefined : (
        <a href="/s6/play" style={{ color: STEEL, fontWeight: 700, textDecoration: "underline", fontSize: 12 }}>
          {R.orderArcadeGo}
        </a>
      ),
    },
    { id: "raid", title: R.orderRaidTitle, detail: fill(R.orderRaidLine, { t: raidT }), done: null },
    { id: "hold", title: R.orderHoldTitle, detail: holds ? R.orderHoldDone : R.orderHoldTodo, done: holds },
  ];

  return (
    <div
      data-testid="daily-orders"
      style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 12px", background: "rgba(255,255,255,0.02)", marginBottom: 14 }}
    >
      <div style={{ ...sectionLabel, margin: "0 0 4px" }}>{R.ordersHeading}</div>
      <p style={{ fontSize: 11.5, color: FAINT, lineHeight: 1.5, margin: "0 0 8px" }}>{R.ordersIntro}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((r) => (
          <div
            key={r.id}
            data-testid={`order-${r.id}`}
            data-done={r.done === null ? undefined : r.done ? "1" : "0"}
            style={{ display: "flex", gap: 9, alignItems: "flex-start" }}
          >
            <span
              aria-hidden
              style={{
                fontFamily: MONO,
                fontSize: 10.5,
                fontWeight: 800,
                color: r.done ? GOOD : STEEL,
                border: `1px solid ${r.done ? `${GOOD}66` : `${STEEL}44`}`,
                borderRadius: "50%",
                width: 18,
                height: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              {r.done ? "✓" : "•"}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: r.done ? GOOD : TEXT }}>{r.title}</span>
              <div style={{ fontSize: 11, color: FAINT, lineHeight: 1.45, marginTop: 1 }}>{r.detail}</div>
              {r.action ? <div style={{ marginTop: 4 }}>{r.action}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 4b) ARMORY VAULT: the deterministic daily deal (L7 / #221, ADR-0067) ────
//
// One deal a day from the FIXED VAULT_ITEMS rotation, seeded by the UTC day
// number: no randomness at render, none at purchase, contents and price always
// shown, Shells only, cosmetics only. The server route re-derives the same
// deal and prices it itself, so this card can never sell anything the route
// would not charge.
function VaultSection({ me, patchMe, dict }: { me: HqMe; patchMe: PatchMe; dict: S6Dict }) {
  // Same dead end the garage had: this linked to /s5/join, which enlists a
  // wallet and never mints a play session, so the vault could not be reached
  // from the button offering to reach it.
  const session = usePlaySession();
  const signIn = async () => {
    const token = await session.open();
    if (token) patchMe({ session: true, token });
  };
  const R = dict.retention;
  const deal = vaultDealForDay(vaultDayNumber(Date.now()));
  const label = decalLabel(deal.key);
  const owned = me.tank.decals.includes(deal.key);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "good" | "warn" | "bad" | "muted"; text: string } | null>(null);

  const buy = useCallback(async () => {
    if (!me.token) return;
    setBusy(true);
    setNote(null);
    const r = await postJson("/api/s6/vault-buy", { t: me.token, item: deal.key });
    setBusy(false);
    if (r.ok) {
      patchMe({
        tank: {
          ...me.tank,
          decals: Array.isArray(r.decals)
            ? (r.decals as unknown[]).filter((d): d is string => typeof d === "string")
            : [...me.tank.decals, deal.key],
        },
        shells: Number.isFinite(Number(r.shells)) ? Number(r.shells) : me.shells,
      });
      setNote({ tone: "good", text: fill(R.vaultBought, { name: label }) });
    } else if (r.already) {
      // Owned some other way (a second tab, the bot's crate sweep): reflect
      // it. Nothing was charged; the route refunds a raced spend itself.
      if (!me.tank.decals.includes(deal.key)) {
        patchMe({ tank: { ...me.tank, decals: [...me.tank.decals, deal.key] } });
      }
      setNote({ tone: "muted", text: R.vaultOwned });
    } else {
      setNote({ tone: "bad", text: String(r.error || R.vaultFailed) });
    }
  }, [me.token, me.tank, me.shells, deal.key, label, patchMe, R]);

  return (
    <>
      <div style={sectionLabel}>{R.vaultHeading}</div>
      <div
        data-testid="vault-deal"
        data-item={deal.key}
        data-owned={owned ? "1" : "0"}
        style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 12px", background: "rgba(255,255,255,0.02)", marginBottom: 16 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: EMBER, fontWeight: 800 }}>
            {R.vaultToday}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: FAINT }}>{R.vaultNewDeal}</span>
        </div>
        {/* Contents + price, ALWAYS visible (guest, owned, every state). */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: WARN,
                border: `1px solid ${WARN}55`,
                borderRadius: 999,
                padding: "5px 11px",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </span>
            <span style={{ fontSize: 10.5, color: FAINT }}>{R.vaultDecalWord}</span>
          </span>
          <span data-testid="vault-price" style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: TEXT, whiteSpace: "nowrap" }}>
            {deal.price.toLocaleString()} {THEME.playCurrency}
          </span>
        </div>
        <div style={{ marginTop: 10 }}>
          {owned ? (
            <div style={{ fontSize: 11.5, color: FAINT, lineHeight: 1.5 }} data-testid="vault-owned">
              {R.vaultOwned}
            </div>
          ) : me.session ? (
            <button
              data-testid="vault-buy"
              onClick={buy}
              disabled={busy}
              style={primaryBtn(WARN, busy)}
            >
              {busy ? R.vaultWorking : fill(R.vaultBuy, { price: deal.price.toLocaleString() })}
            </button>
          ) : (
            // Signed out there is nothing to press, so do not draw a control.
            // A link to the actual next step is honest and useful; a disabled
            // button is neither.
            <button onClick={signIn} disabled={session.busy} data-testid="vault-enlist" style={primaryBtn(WARN)}>
              {session.busy ? "..." : R.vaultEnlistCta}
            </button>
          )}
          {!me.session ? (
            <div style={{ fontSize: 11.5, color: FAINT, marginTop: 6, lineHeight: 1.5 }} data-testid="vault-guest-hint">
              {R.vaultGuest}
            </div>
          ) : null}
        </div>
        <p style={{ fontSize: 11, color: FAINT, lineHeight: 1.5, margin: "10px 0 0" }}>{R.vaultIntro}</p>
        {note ? <Note tone={note.tone}>{note.text}</Note> : null}
      </div>
    </>
  );
}

// ── 4c) DECAL COLLECTION: set completion, display only (L9) ─────────────────
//
// "N of M" over the full earnable set: the fixed known decals plus one breach
// decal per stronghold still standing or breached (a failed wall's decal is
// unearnable and is not listed). Owned keys outside the set (operator
// specials) append at the end so the count never understates what the player
// actually has. Owned slots light up; unowned ones carry their earn hint.
function DecalCollection({ me, targets = [], dict }: { me: HqMe; targets?: TargetLink[]; dict: S6Dict }) {
  const R = dict.retention;
  const fixedHints: Record<string, string> = {
    "first-colors": R.collectionHintFirstColors,
    "division-star": R.collectionHintDivisionStar,
    "iron-discipline": R.collectionHintIronDiscipline,
    convoy: R.collectionHintConvoy,
  };
  const slots: Array<{ key: string; hint: string }> = Object.keys(fixedHints).map((k) => ({
    key: k,
    hint: fixedHints[k],
  }));
  for (const t of targets) {
    if (t.status === "failed") continue;
    slots.push({ key: breachDecalKey(t.domain), hint: fill(R.collectionHintBreach, { name: t.name || t.domain }) });
  }
  const listed = new Set(slots.map((s) => s.key));
  for (const d of me.tank.decals) {
    if (!listed.has(d)) {
      listed.add(d);
      slots.push({ key: d, hint: "" });
    }
  }
  const ownedSet = new Set(me.tank.decals);
  const ownedCount = slots.filter((s) => ownedSet.has(s.key)).length;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ ...sectionLabel, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span>{R.collectionHeading}</span>
        <span data-testid="decal-collection-count">{fill(R.collectionCount, { n: ownedCount, m: slots.length })}</span>
      </div>
      <div
        style={{ display: "flex", flexDirection: "column", gap: 6 }}
        data-testid="decal-collection"
        data-owned-count={ownedCount}
        data-total={slots.length}
      >
        {slots.map((s) => {
          const has = ownedSet.has(s.key);
          return (
            <div
              key={s.key}
              data-testid={`decal-slot-${s.key}`}
              data-owned={has ? "1" : "0"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                border: has ? `1px solid ${WARN}55` : `1px dashed ${STEEL}33`,
                borderRadius: 9,
                padding: "7px 10px",
                background: has ? `${WARN}0d` : "transparent",
              }}
            >
              <span
                aria-hidden
                style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: has ? WARN : FAINT, width: 16, textAlign: "center", flexShrink: 0 }}
              >
                {has ? "✓" : "·"}
              </span>
              <span
                style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: has ? TEXT : MUTED, whiteSpace: "nowrap" }}
              >
                {decalLabel(s.key)}
              </span>
              {!has && s.hint ? <span style={{ fontSize: 10.5, color: FAINT, lineHeight: 1.4, minWidth: 0 }}>{s.hint}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 5) FUNDING WIZARD: two paths + the stuck-step detector strip ────────────

const STATE_TONE: Record<FundingState, "good" | "warn" | "bad" | "muted"> = {
  NO_WALLET: "muted",
  EMPTY: "warn",
  NO_GAS: "warn",
  FUNDED_NOT_BOUGHT: "good",
  HOLDER: "good",
  UNKNOWN: "muted",
};

/** The detector strip's one line, from the dict (text lives in strings.ts). */
function stateText(D: S6Dict["panels"], state: FundingState): string {
  switch (state) {
    case "NO_WALLET":
      return D.stateNoWallet;
    case "EMPTY":
      return D.stateEmpty;
    case "NO_GAS":
      return D.stateNoGas;
    case "FUNDED_NOT_BOUGHT":
      return D.stateFunded;
    case "HOLDER":
      return D.stateHolder;
    default:
      return D.stateUnknown;
  }
}

function wizardBtn(accent: string): React.CSSProperties {
  return {
    display: "block",
    width: "100%",
    textAlign: "center",
    padding: "12px 14px",
    borderRadius: 9,
    border: `1px solid ${accent}66`,
    background: `${accent}1c`,
    color: TEXT,
    fontSize: 13.5,
    fontWeight: 800,
    cursor: "pointer",
    textDecoration: "none",
    boxSizing: "border-box",
  };
}

export function FundingWizardPanel({
  me,
  targets,
  dict = STRINGS.en,
}: {
  me: HqMe;
  targets: TargetLink[];
  dict?: S6Dict;
}) {
  const [branch, setBranch] = useState<"card" | "crypto" | null>(null);
  const [funding, setFunding] = useState<FundingStatus | null>(null);
  const [chainNote, setChainNote] = useState<string | null>(null);
  const D = dict.panels;

  // The detector: POST with the session token, tokenless GET otherwise.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = me.token
          ? await fetch("/api/s6/funding-status", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ t: me.token }),
            })
          : await fetch("/api/s6/funding-status");
        const data = (await r.json()) as FundingStatus;
        if (!cancelled && data && typeof data.state === "string") setFunding(data);
      } catch {
        if (!cancelled) setFunding({ ok: true, state: "UNKNOWN", gasEth: 0, usdcUsd: 0, holds: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me.token]);

  const addChain = useCallback(async () => {
    track("cta_click", { ref: "wizard-addchain" });
    setChainNote(null);
    const eth = (window as unknown as { ethereum?: { request?: (a: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
    if (!eth?.request) {
      setChainNote(D.chainNone);
      return;
    }
    try {
      await eth.request({ method: "wallet_addEthereumChain", params: [DOMA_CHAIN] });
      setChainNote(D.chainAdded);
    } catch {
      setChainNote(D.chainRefused);
    }
  }, [D]);

  const state: FundingState = funding?.state || (me.token ? "UNKNOWN" : "NO_WALLET");
  const tone = STATE_TONE[state];
  // Buy links: the page snapshot first; the detector's own target list as the
  // fallback (it rides on the same snapshot server-side).
  const respTargets = (funding as unknown as { targets?: TargetLink[] } | null)?.targets;
  const buyables = targets.length > 0 ? targets : Array.isArray(respTargets) ? respTargets : [];
  /** The live wall nearest a breach: where one more $5 counts for most. */
  const armedPick =
    buyables
      .filter((t) => String(t.status) === "live")
      .slice()
      .sort((a, b) => (Number(b.progress) || 0) - (Number(a.progress) || 0))[0] || null;
  const showBuyLinks = (from: string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }} data-testid={`wizard-buy-links-${from}`}>
      {buyables.map((t) => (
        <a
          key={t.domain}
          href={buyLink(t.domain)}
          target="_blank"
          rel="noreferrer"
          onClick={() => {
            track("cta_click", { ref: `wizard-buy-${t.domain}` });
            track("outbound_buy", { ref: `wizard-buy-${t.domain}`, domain: t.domain });
          }}
          data-testid={`wizard-buy-${t.domain}`}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            padding: "9px 12px",
            borderRadius: 8,
            border: `1px solid ${BORDER}`,
            background: "rgba(255,255,255,0.02)",
            color: TEXT,
            fontSize: 12.5,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          <span>{t.name || t.domain}</span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: STEEL }}>{D.buyWord} ↗</span>
        </a>
      ))}
      {buyables.length === 0 ? (
        <span style={{ fontSize: 12, color: FAINT }}>{D.buyListEmpty}</span>
      ) : null}
    </div>
  );

  return (
    <div data-testid="wizard-panel">
      <PanelH>{D.wizardTitle}</PanelH>

      {/* The stuck-step detector strip */}
      <div
        data-testid="wizard-status"
        data-state={state}
        style={{
          border: `1px solid ${tone === "good" ? `${GOOD}55` : tone === "warn" ? `${WARN}55` : `${STEEL}33`}`,
          borderRadius: 10,
          padding: "10px 12px",
          marginBottom: 14,
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <div style={{ fontSize: 12.5, color: tone === "good" ? GOOD : tone === "warn" ? WARN : MUTED, lineHeight: 1.55, fontWeight: 700 }}>
          {funding === null && me.token ? D.wizardReading : stateText(D, state)}
        </div>
        {funding && me.token && state !== "NO_WALLET" && state !== "UNKNOWN" ? (
          <div style={{ fontFamily: MONO, fontSize: 10.5, color: FAINT, marginTop: 5 }}>
            gas {funding.gasEth} ETH · USDC ${funding.usdcUsd}
            {funding.holds.length > 0 ? ` · ${D.holdingWord} ${funding.holds.map((h) => h.domain).join(", ")}` : ""}
            {" · "}
            <a
              href={DOMA_PROFILE_URL}
              target="_blank"
              rel="noreferrer"
              data-testid="wizard-portfolio"
              onClick={() => track("cta_click", { ref: "wizard-portfolio" })}
              style={{ color: EMBER, textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              {D.portfolioLink}
            </a>
          </div>
        ) : null}
        {state === "FUNDED_NOT_BOUGHT" ? (
          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            {armedPick ? (
              <div data-testid="wizard-inapp-buy" style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", background: "rgba(255,255,255,0.02)" }}>
                <p style={{ margin: "0 0 8px", fontSize: 12.5, color: TEXT, fontWeight: 700 }}>
                  {fill(D.armedBuyHere, { domain: armedPick.name || armedPick.domain })}
                </p>
                <BuyPanel domain={armedPick.domain} name={armedPick.name || armedPick.domain} strings={dict.map.buy} />
              </div>
            ) : null}
            {showBuyLinks("status")}
          </div>
        ) : null}
      </div>

      {/* Screen 1: the branch pick */}
      {branch === null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="wizard-branch-pick">
          <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, margin: 0 }}>
            {D.branchIntro}
          </p>
          <button
            data-testid="wizard-branch-crypto"
            onClick={() => {
              track("cta_click", { ref: "wizard-branch-crypto" });
              setBranch("crypto");
            }}
            style={wizardBtn(STEEL)}
          >
            {D.branchCrypto}
          </button>
          <button
            data-testid="wizard-branch-card"
            onClick={() => {
              track("cta_click", { ref: "wizard-branch-card" });
              setBranch("card");
            }}
            style={wizardBtn(EMBER)}
          >
            {D.branchCard}
          </button>
        </div>
      ) : null}

      {/* Card branch: Doma app does everything. Never "$5" here. */}
      {branch === "card" ? (
        <div data-testid="wizard-card-branch">
          <div style={sectionLabel}>{D.cardHeading}</div>
          <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, margin: "0 0 10px" }}>
            {D.cardBody}
          </p>
          <a
            href={DOMA_APP_URL}
            target="_blank"
            rel="noreferrer"
            data-testid="wizard-card-doma"
            onClick={() => {
              track("cta_click", { ref: "wizard-card-doma" });
              track("outbound_buy", { ref: "wizard-card-doma" });
            }}
            style={wizardBtn(EMBER)}
          >
            {D.cardOpenDoma}
          </a>
          <div style={{ ...sectionLabel, marginTop: 14 }}>{D.thenBuy}</div>
          <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6, margin: 0 }}>
            {D.cardBuyBody}
          </p>
          {showBuyLinks("card")}
          <button onClick={() => setBranch(null)} style={{ ...actionBtn(false), marginTop: 12 }}>
            {D.backToFork}
          </button>
        </div>
      ) : null}

      {/* Crypto branch: bridge in, add the chain, buy from $5. */}
      {branch === "crypto" ? (
        <div data-testid="wizard-crypto-branch">
          <div style={sectionLabel}>{D.step1Bridge}</div>
          <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6, margin: "0 0 8px" }}>
            {D.bridgeBody}
          </p>
          <a
            href={STARGATE_BRIDGE_URL}
            target="_blank"
            rel="noreferrer"
            data-testid="wizard-stargate"
            onClick={() => track("cta_click", { ref: "wizard-stargate" })}
            style={wizardBtn(STEEL)}
          >
            {D.openStargate}
          </a>
          <div style={{ ...sectionLabel, marginTop: 14 }}>{D.step2Chain}</div>
          <button data-testid="wizard-addchain" onClick={addChain} style={wizardBtn(STEEL)}>
            {D.addChainBtn}
          </button>
          {chainNote ? <Note tone="muted">{chainNote}</Note> : null}
          <div style={{ ...sectionLabel, marginTop: 14 }}>{D.step3Buy}</div>
          <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6, margin: 0 }} data-testid="wizard-buy-copy">
            {D.cryptoBuyBody}
          </p>
          {showBuyLinks("crypto")}
          <button onClick={() => setBranch(null)} style={{ ...actionBtn(false), marginTop: 12 }}>
            {D.backToFork}
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ── 6) FOOTLOCKER: the 5-quest FTUE log ─────────────────────────────────────

type QuestRow = {
  n: number;
  title: string;
  done: boolean;
  detail: React.ReactNode;
  action?: React.ReactNode;
};

export function FootlockerPanel({
  me,
  patchMe,
  onOpenWizard,
  targets = [],
  dict = STRINGS.en,
}: {
  me: HqMe;
  patchMe: PatchMe;
  onOpenWizard: () => void;
  /** Client-safe stronghold list (the scene's snapshot slice); the decal
   * collection lists each standing wall's breach decal from it. */
  targets?: TargetLink[];
  dict?: S6Dict;
}) {
  const D = dict.panels;
  // Local (pre-wallet) progress, merged visually with the server truth.
  const [ftue, setFtue] = useState<FtueLocal>({ v: 1, tour: [], run: false });
  const [guestRun, setGuestRun] = useState(false);
  useEffect(() => {
    setFtue(readFtue());
    setGuestRun(guestHasAnyScore());
  }, []);

  const [claiming, setClaiming] = useState(false);
  const [claimNote, setClaimNote] = useState<{ tone: "good" | "warn" | "bad" | "muted"; text: string } | null>(null);

  const hasColors = me.tank.decals.includes("first-colors");
  const q1 = ftue.tour.length >= FTUE_TOUR_GOAL;
  const q2 = ftue.run || guestRun;
  const q3 = me.session;
  const q4 = me.heldUsd >= 5 || hasColors;
  const claimReady = q1 && q2 && q3 && q4 && !hasColors;

  const claim = useCallback(async () => {
    if (!me.token) return;
    setClaiming(true);
    setClaimNote(null);
    const r = await postJson("/api/s6/claim-ftue", { t: me.token });
    setClaiming(false);
    if (r.ok && r.already) {
      setClaimNote({ tone: "good", text: D.claimAlready });
      if (!hasColors) patchMe({ tank: { ...me.tank, decals: [...me.tank.decals, "first-colors"] } });
    } else if (r.ok) {
      setClaimNote({ tone: "good", text: D.claimGranted });
      patchMe({ tank: { ...me.tank, decals: [...me.tank.decals, "first-colors"] } });
    } else {
      setClaimNote({ tone: "bad", text: String(r.error || D.claimFailed) });
    }
  }, [me.token, me.tank, hasColors, patchMe, D]);

  const link = (href: string, label: string) => (
    <a href={href} style={{ color: STEEL, fontWeight: 700, textDecoration: "underline", fontSize: 12 }}>
      {label}
    </a>
  );

  const quests: QuestRow[] = [
    {
      n: 1,
      title: D.q1Title,
      done: q1,
      detail: q1
        ? D.q1Done
        : fill(D.q1Todo, { goal: FTUE_TOUR_GOAL, n: Math.min(ftue.tour.length, FTUE_TOUR_GOAL) }),
    },
    {
      n: 2,
      title: D.q2Title,
      done: q2,
      detail: q2 ? D.q2Done : D.q2Todo,
      action: q2 ? undefined : link("/s6/play", D.q2Action),
    },
    {
      n: 3,
      title: D.q3Title,
      done: q3,
      detail: q3 ? D.q3Done : D.q3Todo,
      action: q3 ? undefined : link("/s6/join", D.q3Action),
    },
    {
      n: 4,
      title: D.q4Title,
      done: q4,
      detail: q4 ? D.q4Done : D.q4Todo,
      action: q4 ? undefined : (
        <button
          data-testid="quest-wizard-open"
          onClick={() => {
            track("cta_click", { ref: "quest-get-armed" });
            onOpenWizard();
          }}
          style={actionBtn(true, EMBER)}
        >
          {D.q4Action}
        </button>
      ),
    },
    {
      n: 5,
      title: D.q5Title,
      done: hasColors,
      detail: hasColors ? D.q5Done : claimReady ? D.q5Ready : D.q5Todo,
      action: hasColors ? undefined : (
        <button
          data-testid="claim-ftue"
          onClick={claim}
          disabled={!claimReady || claiming}
          style={{ ...actionBtn(claimReady, GOOD), opacity: claimReady ? 1 : 0.5, cursor: claimReady ? "pointer" : "not-allowed" }}
        >
          {claiming ? D.claiming : D.claimBtn}
        </button>
      ),
    },
  ];

  return (
    <div data-testid="footlocker-panel">
      <PanelH
        right={
          me.crates.length > 0 ? (
            <span style={{ fontFamily: MONO, fontSize: 10.5, color: FAINT }} data-testid="crates-count">
              {fill(D.cratesOpened, { n: me.crates.length })}
            </span>
          ) : undefined
        }
      >
        {dict.hotspots.footlocker.label}
      </PanelH>

      {/* Daily Orders: the day's three appointments (L4, display only) */}
      <DailyOrders me={me} dict={dict} />

      <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.55, margin: "0 0 12px" }}>
        {D.footlockerIntro}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="quest-log">
        {quests.map((q) => (
          <div
            key={q.n}
            data-testid={`quest-${q.n}`}
            data-done={q.done ? "1" : "0"}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              border: `1px solid ${q.done ? `${GOOD}44` : BORDER}`,
              borderRadius: 10,
              padding: "10px 12px",
              background: q.done ? `${GOOD}0d` : "rgba(255,255,255,0.02)",
            }}
          >
            <span
              aria-hidden
              style={{
                fontFamily: MONO,
                fontSize: 11,
                fontWeight: 800,
                color: q.done ? GOOD : STEEL,
                border: `1px solid ${q.done ? `${GOOD}66` : `${STEEL}44`}`,
                borderRadius: "50%",
                width: 22,
                height: 22,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              {q.done ? "✓" : q.n}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: q.done ? GOOD : TEXT }}>{q.title}</div>
              <div style={{ fontSize: 11.5, color: FAINT, lineHeight: 1.5, marginTop: 2 }}>{q.detail}</div>
              {q.action ? <div style={{ marginTop: 6 }}>{q.action}</div> : null}
            </div>
          </div>
        ))}
      </div>
      {claimNote ? <Note tone={claimNote.tone}>{claimNote.text}</Note> : null}

      {/* Decal collection: set completion, display only (L9) */}
      <DecalCollection me={me} targets={targets} dict={dict} />

      <p style={{ fontSize: 11, color: FAINT, lineHeight: 1.5, margin: "12px 0 0" }}>
        {D.footlockerFootnote}
      </p>
    </div>
  );
}
