"use client";
/**
 * S7 PERSONAL HQ, the panel bodies (THE CLASS HALL / commander / armory /
 * footlocker quest log / funding wizard). HqScene stays the stage; these are
 * the panels its overlay opens. Client-safe imports ONLY (classes/rules-core/
 * tanks/model/theme/funding/ftue/track are all pure client-side libs).
 *
 * REALMFALL (ADR-0129/0133): the inherited tank roster grid is gone. The
 * "tank" station is THE CLASS HALL (six D&D classes, per-class levels, free
 * lossless switching via /api/s7/class), and the 5-stat upgrade shelf is THE
 * ARMORY (weapon/armor/trinket gear tiers, Gold, via /api/s7/gear). All
 * progression math imports lib/s7/classes and rules core derive(); NOTHING
 * here re-derives a level, a price or a stat.
 *
 * Data flow: HqScene owns one HqMe state (guest defaults until /api/s7/me
 * lands) and hands panels `me` + `patchMe`. Class tracks ride their own
 * session-authed fetch (GET /api/s7/class) inside useClassTracks. Writes:
 *   /api/s7/class        switch / first pick of the active class (free)
 *   /api/s7/gear         Gold gear tier buy (server-priced, fail-closed)
 *   /api/s7/hq           camo / commander cosmetics (free)
 *   /api/s7/vault-buy    the Vault daily deal (server-priced, fail-closed)
 *   /api/s7/claim-ftue   the First Colors decal (idempotent)
 *   /api/s7/funding-status  the stuck-step detector (fail-soft)
 *
 * TankPanel / WorkbenchPanel survive as export ALIASES of ClassHallPanel /
 * ArmoryPanel: src/app/s7/front/BasePopup.tsx (outside this folder) imports
 * those names, and this rework must not touch files outside hq/.
 *
 * Copy rules: no em-dashes, never "win $X", plain language, REALMFALL words
 * (keeps / Guild / Valor / Gold / adventurer). New strings inline for now;
 * the strings pass lifts them into the dict later.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CAMOS,
  CAMO_LADDER,
  FREE_TANK_KEYS,
  resolveTank,
  tankArt,
  type CamoKey,
  type ResolvedTank,
} from "@/lib/s7/model";
import {
  COMMANDERS,
  DEFAULT_COMMANDER_KEY,
  type Tank,
} from "@/lib/s7/tanks";
import {
  ARMOR_STAGES,
  GEAR_MAX_TIER,
  GEAR_SLOTS,
  MAX_LEVEL,
  classStageArt,
  gearNextPrice,
  isClassId,
  stageForLevel,
  xpForLevel,
  type ArmorStage,
  type ClassTrack,
  type GearSlot,
} from "@/lib/s7/classes";
import { CLASS_IDS, derive, type ClassId } from "@/app/s7/games/_shared/rules/core";
import { DEFAULT_THEME } from "@/lib/s7/theme";
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
} from "@/lib/s7/ftue";
import { GAMES, POINTS_PER_RUN, ZERO_STATS, type PlayerStats } from "@/lib/s7/games";
import { RESOLVE_HOUR_UTC } from "@/lib/s7/raid";
import { breachDecalKey, vaultDayNumber, vaultDealForDay } from "@/lib/s7/vault";
import {
  DOMA_APP_URL,
  DOMA_CHAIN,
  STARGATE_BRIDGE_URL,
  buyLink,
  DOMA_PROFILE_URL,
  type FundingState,
  type FundingStatus,
} from "@/lib/s7/funding";
import { STRINGS, fill, type S7Dict } from "@/lib/s7/strings";
import { usePlaySession } from "@/app/s7/_components/usePlaySession";
import { track } from "@/lib/s7/track";
import { LivingPortrait, useReducedMotion } from "./LivingPortrait";
import { BuyPanel } from "@/app/s7/_components/BuyPanel";
import { demoReply, isDemo } from "@/lib/s7/demo";

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
  ownedAdventurers: string[];
  adventurer: string;
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
    ownedAdventurers: [],
    adventurer: DEFAULT_COMMANDER_KEY,
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
  // request at all, so no server route can mishandle one. See lib/s7/demo.ts
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
      <h2 id="s7hq-panel-title" style={{ fontSize: 17, fontWeight: 800, margin: 0, color: TEXT }}>
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

// ── 1) THE CLASS HALL: six classes, one active, lossless switching ──────────
//
// Mike's law, verbatim (ADR-0129): "if they change from level 3 warrior to
// mage they are a level 1 mage and can switch back to warrior." The hall
// renders the six tracks, confirms a switch, POSTs /api/s7/class and shows
// the ACTIVE class as a living portrait with its level, XP bar and armor
// stage ladder. Every number comes from lib/s7/classes + rules-core derive();
// nothing here re-derives progression.

/** Inline REALMFALL class copy (the strings pass lifts these later).
 * Exported for the other hq surfaces (StatsBoard's FIELD REPORT column). */
export const CLASS_ACCENT: Record<ClassId, string> = {
  barbarian: "#e07030",
  monk: "#3fae8a",
  ranger: "#3f7a3f",
  bard: "#6a5adf",
  wizard: "#3f6adf",
  cleric: "#d8b13f",
};
export const CLASS_NAME: Record<ClassId, string> = {
  barbarian: "Barbarian",
  monk: "Monk",
  ranger: "Ranger",
  bard: "Bard",
  wizard: "Wizard",
  cleric: "Cleric",
};
const CLASS_LINE: Record<ClassId, string> = {
  barbarian: "Hits hard and keeps standing.",
  monk: "Fast hands, faster feet.",
  ranger: "Sharp eyes, true aim.",
  bard: "Song and nerve carry the fight.",
  wizard: "Big spells, thin robes.",
  cleric: "Heavy armor and healing light.",
};
export const STAGE_META: Record<ArmorStage, { name: string; at: number }> = {
  novice: { name: "Novice", at: 1 },
  veteran: { name: "Veteran", at: 4 },
  champion: { name: "Champion", at: 8 },
  mythic: { name: "Mythic", at: 15 },
};

export const classHeroArt = (c: ClassId) => `/s7-art/class/hero/${c}.png`;
const classAnimArt = (c: ClassId) => `/s7-art/class/anim/${c}.mp4`;

/** Damage dice exactly as the games print them ("1d12", "2d4+2"). */
function diceLabel(spec: { count: number; sides: number; bonus: number }): string {
  return `${spec.count}d${spec.sides}${spec.bonus > 0 ? `+${spec.bonus}` : ""}`;
}

/** Client-trust hygiene: clamp whatever the wire handed us into a ClassTrack. */
function normalizeTrack(raw: unknown): ClassTrack | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isClassId(r.classKey)) return null;
  const g = (r.gear && typeof r.gear === "object" ? r.gear : {}) as Record<string, unknown>;
  const tier = (v: unknown) => Math.max(0, Math.min(GEAR_MAX_TIER, Number(v) || 0));
  return {
    classKey: r.classKey,
    level: Math.max(1, Math.min(MAX_LEVEL, Number(r.level) || 1)),
    xp: Math.max(0, Number(r.xp) || 0),
    gear: { weapon: tier(g.weapon), armor: tier(g.armor), trinket: tier(g.trinket) },
  };
}

export type ClassHallState = {
  /** True once the read settled (guest, demo, error and success all count). */
  loaded: boolean;
  active: ClassId | null;
  tracks: Partial<Record<ClassId, ClassTrack>>;
};

/** DEMO SANDBOX seed: a mid-season barbarian so the hall, the XP bar and the
 * Armory all show real motion without a wallet. Client state only; refresh
 * resets it and no write route would authenticate it anyway. */
function demoClassState(): ClassHallState {
  return {
    loaded: true,
    active: "barbarian",
    tracks: {
      barbarian: { classKey: "barbarian", level: 4, xp: 780, gear: { weapon: 1, armor: 0, trinket: 0 } },
      wizard: { classKey: "wizard", level: 2, xp: 150, gear: { weapon: 0, armor: 0, trinket: 0 } },
    },
  };
}

/** The wallet's class tracks, session-authed (GET /api/s7/class). Panels
 * remount on every overlay open, so the read is fresh whenever the player
 * looks. Fail-soft: any error settles as an empty, loaded state. */
export function useClassTracks(
  token: string | null,
): [ClassHallState, React.Dispatch<React.SetStateAction<ClassHallState>>] {
  const [state, setState] = useState<ClassHallState>({ loaded: false, active: null, tracks: {} });
  useEffect(() => {
    if (isDemo()) {
      setState(demoClassState());
      return;
    }
    if (!token) {
      setState((s) => (s.loaded ? s : { ...s, loaded: true }));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/s7/class?t=${encodeURIComponent(token)}`);
        const j = (await r.json().catch(() => null)) as
          | { ok?: boolean; active?: unknown; tracks?: unknown }
          | null;
        if (cancelled) return;
        if (!j?.ok) {
          setState((s) => ({ ...s, loaded: true }));
          return;
        }
        const tracks: Partial<Record<ClassId, ClassTrack>> = {};
        for (const raw of Array.isArray(j.tracks) ? j.tracks : []) {
          const t = normalizeTrack(raw);
          if (t) tracks[t.classKey] = t;
        }
        setState({ loaded: true, active: isClassId(j.active) ? j.active : null, tracks });
      } catch {
        if (!cancelled) setState((s) => ({ ...s, loaded: true }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);
  return [state, setState];
}

/** The ANIMATED class portrait: the LivingPortrait idiom on the class art.
 * The hero PNG paints first (poster + fallback), the 3:4 loop covers it;
 * under reduced motion no <video> mounts at all. Fills its parent frame. */
function ClassPortrait({ classId }: { classId: ClassId }) {
  const reduced = useReducedMotion();
  const vidRef = useRef<HTMLVideoElement | null>(null);
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const png = classHeroArt(classId);
  useEffect(() => {
    vidRef.current?.play().catch(() => {});
  }, [classId, reduced]);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {brokenSrc !== png ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={png}
          src={png}
          alt=""
          aria-hidden
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", objectPosition: "bottom center" }}
          onError={() => setBrokenSrc(png)}
        />
      ) : null}
      {!reduced ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          ref={vidRef}
          key={classId}
          src={classAnimArt(classId)}
          poster={png}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          onCanPlay={(e) => {
            const v = e.currentTarget;
            if (v.paused) v.play().catch(() => {});
          }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : null}
    </div>
  );
}

/** Class hero art with a quiet silhouette fallback (a class card never
 * renders broken while art is in flight). */
function ClassHeroArt({ classId, height }: { classId: ClassId; height: number }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div aria-hidden style={{ width: "100%", height, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        <div
          style={{
            width: height * 0.5,
            height: height * 0.86,
            borderRadius: "45% 45% 12% 12%",
            background: `linear-gradient(180deg, ${CLASS_ACCENT[classId]}33 0%, #171c22 100%)`,
            border: `1px solid ${STEEL}33`,
          }}
        />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={classHeroArt(classId)}
      alt=""
      aria-hidden
      style={{ width: "100%", height, objectFit: "contain", objectPosition: "bottom center", display: "block" }}
      onError={() => setBroken(true)}
    />
  );
}

/** Level + XP bar: xp INTO the level over the span to the next one, straight
 * from xpForLevel (never re-derived). Top level renders full and says so. */
function LevelXpBar({ tr, accent }: { tr: ClassTrack; accent: string }) {
  const topLevel = tr.level >= MAX_LEVEL;
  const floor = xpForLevel(tr.level);
  const span = Math.max(1, xpForLevel(Math.min(MAX_LEVEL, tr.level + 1)) - floor);
  const into = Math.max(0, Math.min(span, tr.xp - floor));
  const pct = topLevel ? 100 : Math.min(100, Math.round((into / span) * 100));
  return (
    <div data-testid="class-xp">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5, gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: TEXT }}>
          Level {tr.level} of {MAX_LEVEL}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10.5, color: FAINT }}>
          {topLevel ? "Top level reached" : `${into.toLocaleString()} of ${span.toLocaleString()} XP to level ${tr.level + 1}`}
        </span>
      </div>
      <div style={{ height: 9, borderRadius: 5, background: `${STEEL}1c`, border: `1px solid ${BORDER}`, overflow: "hidden" }} data-testid="class-xp-bar">
        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${accent}aa 0%, ${accent} 100%)` }} />
      </div>
    </div>
  );
}

/** The ARMOR STAGE display: the stage the level has earned, worn now, with
 * the whole 4-stage ladder underneath (locked stages greyed with their
 * unlock level). This is the "wear what you've earned" moment. */
function ArmorStageLadder({ tr, accent }: { tr: ClassTrack; accent: string }) {
  const current = stageForLevel(tr.level);
  return (
    <div data-testid="class-stages">
      <div style={{ ...sectionLabel, marginTop: 14 }}>Armor stage</div>
      <div
        style={{
          position: "relative",
          borderRadius: 12,
          border: `1px solid ${accent}44`,
          background: `radial-gradient(120% 90% at 50% 100%, ${accent}22 0%, rgba(0,0,0,0) 65%), rgba(255,255,255,0.02)`,
          padding: "10px 10px 6px",
          textAlign: "center",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={classStageArt(tr.classKey, current)}
          alt={`${CLASS_NAME[tr.classKey]} in ${STAGE_META[current].name} armor`}
          style={{ width: "100%", maxWidth: 200, height: 150, objectFit: "contain", objectPosition: "bottom center", margin: "0 auto", display: "block" }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: accent, fontWeight: 800, margin: "6px 0 4px" }}>
          {STAGE_META[current].name} armor
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 8 }}>
        {ARMOR_STAGES.map((s) => {
          const meta = STAGE_META[s];
          const unlocked = tr.level >= meta.at;
          const isCurrent = s === current;
          return (
            <div
              key={s}
              data-testid={`stage-${s}`}
              data-unlocked={unlocked ? "1" : "0"}
              style={{
                border: isCurrent ? `1px solid ${accent}` : unlocked ? `1px solid ${BORDER}` : `1px dashed ${STEEL}33`,
                borderRadius: 9,
                padding: "6px 4px 7px",
                textAlign: "center",
                background: isCurrent ? `${accent}14` : "rgba(255,255,255,0.02)",
              }}
            >
              <div style={{ filter: unlocked ? "none" : "saturate(0.2) brightness(0.55)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={classStageArt(tr.classKey, s)}
                  alt=""
                  aria-hidden
                  style={{ width: "100%", height: 44, objectFit: "contain", objectPosition: "bottom center", display: "block" }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                  }}
                />
              </div>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: unlocked ? TEXT : FAINT, marginTop: 3 }}>{meta.name}</div>
              <div style={{ fontFamily: MONO, fontSize: 8.5, color: isCurrent ? accent : FAINT }}>
                {isCurrent ? "Worn now" : unlocked ? "Earned" : `Level ${meta.at}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The ACTIVE class: living portrait, level + XP, the real numbers the games
 * grant (rules-core derive, DISPLAY ONLY), and the armor-stage ladder. */
function ActiveClassCard({ tr }: { tr: ClassTrack }) {
  const accent = CLASS_ACCENT[tr.classKey];
  const dv = derive({ classId: tr.classKey, level: tr.level, gear: tr.gear });
  const chips: Array<[string, string]> = [
    ["Health", String(dv.hpMax)],
    ["Armor", String(dv.ac)],
    ["Damage", diceLabel(dv.dmgDice)],
  ];
  return (
    <div
      data-testid="active-class"
      data-class={tr.classKey}
      style={{ border: `1px solid ${accent}44`, borderRadius: 12, padding: "14px 14px 12px", background: "rgba(255,255,255,0.02)" }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 220,
          aspectRatio: "3 / 4",
          margin: "0 auto 12px",
          borderRadius: 14,
          overflow: "hidden",
          border: `1px solid ${BORDER}`,
          background: "linear-gradient(180deg, #1a1f25 0%, #0c1014 100%)",
        }}
      >
        <ClassPortrait classId={tr.classKey} />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 8, marginBottom: 8 }}>
        <span data-testid="active-class-name" style={{ fontSize: 19, fontWeight: 800, color: TEXT }}>
          {CLASS_NAME[tr.classKey]}
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: "0.16em",
            color: accent,
            border: `1px solid ${accent}55`,
            borderRadius: 999,
            padding: "2px 8px",
          }}
        >
          ACTIVE
        </span>
      </div>
      <LevelXpBar tr={tr} accent={accent} />
      <div
        style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", marginTop: 10 }}
        aria-label="What your class grants in the games"
      >
        {chips.map(([k, v]) => (
          <span key={k} style={{ fontFamily: MONO, fontSize: 10.5, color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 999, padding: "4px 10px" }}>
            {k} <b style={{ color: TEXT }}>{v}</b>
          </span>
        ))}
      </div>
      <ArmorStageLadder tr={tr} accent={accent} />
    </div>
  );
}

export function ClassHallPanel({
  me,
  patchMe,
  onOpenWizard,
  dict = STRINGS.en,
  ready = true,
}: {
  me: HqMe;
  patchMe: PatchMe;
  onOpenWizard: () => void;
  dict?: S7Dict;
  /** False while the session lookup is still in flight (BasePopup passes it),
   *  so the hall never tells a signed-in adventurer to sign in. */
  ready?: boolean;
}) {
  const [cls, setCls] = useClassTracks(me.token);
  const [confirm, setConfirm] = useState<ClassId | null>(null);
  const [busy, setBusy] = useState<ClassId | null>(null);
  const [note, setNote] = useState<{ tone: "good" | "warn" | "bad" | "muted"; text: string } | null>(null);
  const D = dict.panels;

  // Sign in right here (the old garage's hard-won lesson kept: /s7/join
  // enlists a wallet and never mints a play session, so the hall opens its
  // own session in place).
  const session = usePlaySession();
  const signIn = useCallback(async () => {
    setNote(null);
    const token = await session.open();
    if (!token) {
      if (session.error) setNote({ tone: "bad", text: session.error });
      return;
    }
    patchMe({ session: true, token });
  }, [session, patchMe]);

  const doSwitch = useCallback(
    async (classId: ClassId) => {
      setConfirm(null);
      setNote(null);
      if (isDemo()) {
        // Sandbox: mutate client state with the same lossless semantics.
        setCls((s) => {
          const existing = s.tracks[classId] ?? {
            classKey: classId,
            level: 1,
            xp: 0,
            gear: { weapon: 0, armor: 0, trinket: 0 },
          };
          return { ...s, active: classId, tracks: { ...s.tracks, [classId]: existing } };
        });
        setNote({ tone: "good", text: `You are now a ${CLASS_NAME[classId]}.` });
        return;
      }
      if (!me.token) {
        setNote({ tone: "muted", text: "Sign in first, then pick your class." });
        return;
      }
      setBusy(classId);
      const r = await postJson("/api/s7/class", { t: me.token, classId });
      setBusy(null);
      const nt = r.ok ? normalizeTrack(r.track) : null;
      if (nt) {
        setCls((s) => ({ ...s, active: nt.classKey, tracks: { ...s.tracks, [nt.classKey]: nt } }));
        setNote({ tone: "good", text: `You are now a level ${nt.level} ${CLASS_NAME[nt.classKey]}.` });
      } else {
        setNote({ tone: "bad", text: String(r.error || "Could not switch class. Try again.") });
      }
    },
    [me.token, setCls],
  );

  const activeTrack = cls.active ? cls.tracks[cls.active] : undefined;
  const confirmTrack = confirm ? cls.tracks[confirm] : undefined;

  return (
    <div data-testid="class-hall-panel">
      <DemoBadge />
      <PanelH
        right={
          <span
            data-testid="gold-balance"
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
        The Class Hall
      </PanelH>

      {/* YOUR OWN GARAGE door (Mike, 2026-08-04): your public page and share
          card were unreachable from your own HQ. Kept through the rework. */}
      {me.session && me.handle ? (
        <a
          href={`/s7/hq/${encodeURIComponent(me.handle)}`}
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

      {activeTrack ? (
        <ActiveClassCard tr={activeTrack} />
      ) : (
        <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6, margin: "0 0 4px" }}>
          Pick your class. Each class keeps its own level forever: switch any time and switch back, nothing is
          lost. XP from the games goes to the class you are playing.
        </p>
      )}

      {/* Get armed: the funding wizard door for anyone not yet holding $5. */}
      {me.heldUsd < 5 ? (
        <button
          data-testid="get-armed-cta"
          onClick={() => {
            track("cta_click", { ref: "hall-get-armed" });
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

      {/* The six classes. Tap a card to switch; the confirm spells out that
          nothing is lost before anything happens. */}
      <div style={{ ...sectionLabel, marginTop: 16 }}>The classes</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }} data-testid="class-grid">
        {CLASS_IDS.map((c) => {
          const accent = CLASS_ACCENT[c];
          const t = cls.tracks[c];
          const isActive = cls.active === c;
          const isBusy = busy === c;
          return (
            <button
              key={c}
              data-testid={`class-card-${c}`}
              data-active={isActive ? "1" : "0"}
              disabled={isBusy || (!me.session && !ready)}
              onClick={() => {
                if (isActive) return;
                if (!me.session) {
                  if (ready) void signIn();
                  return;
                }
                setConfirm(c);
                setNote(null);
              }}
              aria-label={`${CLASS_NAME[c]}, ${t ? `level ${t.level}` : "untrained"}${isActive ? ", your active class" : ""}`}
              style={{
                position: "relative",
                border: `1px solid ${isActive ? accent : BORDER}`,
                borderRadius: 10,
                padding: "8px 6px 9px",
                background: isActive ? `${accent}14` : "rgba(255,255,255,0.02)",
                color: TEXT,
                cursor: isActive ? "default" : "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 5,
                font: "inherit",
              }}
            >
              {isActive ? (
                <span
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    fontFamily: MONO,
                    fontSize: 8,
                    fontWeight: 800,
                    letterSpacing: "0.14em",
                    color: accent,
                    border: `1px solid ${accent}55`,
                    borderRadius: 999,
                    padding: "2px 6px",
                  }}
                >
                  ACTIVE
                </span>
              ) : null}
              <ClassHeroArt classId={c} height={84} />
              <span style={{ fontSize: 12, fontWeight: 800, color: accent }}>{CLASS_NAME[c]}</span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: t ? TEXT : FAINT }} data-testid={`class-level-${c}`}>
                {isBusy ? "..." : t ? `Level ${t.level}` : "Untrained"}
              </span>
              <span style={{ fontSize: 9.5, color: FAINT, lineHeight: 1.35, minHeight: 26 }}>{CLASS_LINE[c]}</span>
            </button>
          );
        })}
      </div>

      {/* The switch confirm: free, lossless, spelled out before it happens. */}
      {confirm ? (
        <div
          data-testid="class-confirm"
          style={{
            marginTop: 10,
            border: `1px solid ${CLASS_ACCENT[confirm]}55`,
            borderRadius: 10,
            padding: "10px 12px",
            background: `${CLASS_ACCENT[confirm]}0d`,
          }}
        >
          <p style={{ fontSize: 12.5, color: TEXT, lineHeight: 1.55, margin: "0 0 8px", fontWeight: 700 }}>
            {cls.active
              ? `Switch to ${CLASS_NAME[confirm]}? Your ${CLASS_NAME[cls.active]} keeps its level.` +
                (confirmTrack
                  ? ` You come back as a level ${confirmTrack.level} ${CLASS_NAME[confirm]}.`
                  : ` You start as a level 1 ${CLASS_NAME[confirm]}.`)
              : `Start as a ${CLASS_NAME[confirm]}?`}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button data-testid="class-confirm-yes" onClick={() => void doSwitch(confirm)} style={primaryBtn(CLASS_ACCENT[confirm])}>
              {cls.active ? `Switch to ${CLASS_NAME[confirm]}` : `Begin as ${CLASS_NAME[confirm]}`}
            </button>
            <button data-testid="class-confirm-no" onClick={() => setConfirm(null)} style={actionBtn(false)}>
              Not now
            </button>
          </div>
        </div>
      ) : null}

      {!me.session && ready ? (
        <Note tone="muted">Anyone can look around the hall. Sign in to pick a class and start earning levels.</Note>
      ) : null}
      {me.session && cls.loaded && !cls.active ? (
        <Note tone="muted">No class picked yet. Tap one to begin. Switching later is free and nothing is lost.</Note>
      ) : null}
      {note ? <Note tone={note.tone}>{note.text}</Note> : null}
    </div>
  );
}

/** Compatibility alias: src/app/s7/front/BasePopup.tsx (outside the hq
 * folder, which this rework must not touch) imports TankPanel by name. */
export const TankPanel = ClassHallPanel;

// ── 2) COMMANDER PANEL: the 8-cast grid, free pick + swap ───────────────────

/** The living portrait of the currently-selected adventurer: the shared
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
  const src = `/s7-art/pilot/${ck}.png`;
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
  dict?: S7Dict;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "good" | "warn" | "bad" | "muted"; text: string } | null>(null);
  const D = dict.panels;
  const cast = dict.adventurers as Record<string, { role: string; blurb: string }>;

  const pick = useCallback(
    async (key: string) => {
      if (!me.token) {
        setNote({ tone: "muted", text: D.adventurerNeedSession });
        return;
      }
      setBusyKey(key);
      setNote(null);
      const r = await postJson("/api/s7/hq", { t: me.token, set: { adventurer: key } });
      setBusyKey(null);
      if (r.ok) {
        patchMe({ adventurer: typeof r.adventurer === "string" ? r.adventurer : key });
        setNote({ tone: "good", text: D.adventurerSwapped });
      } else {
        setNote({ tone: "bad", text: String(r.error || D.adventurerSwapFailed) });
      }
    },
    [me.token, patchMe, D],
  );

  return (
    <div data-testid="commander-panel">
      <PanelH>{dict.hotspots.adventurer.label}</PanelH>
      <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.55, margin: "0 0 12px" }}>
        {D.adventurerIntro}
      </p>
      <CommanderPreview ck={me.adventurer || DEFAULT_COMMANDER_KEY} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }} data-testid="commander-grid">
        {COMMANDERS.map((c) => {
          const isCurrent = me.adventurer === c.key;
          const busy = busyKey === c.key;
          // Prize commanders render as a LOCKED slot until earned: the ladder
          // has to be visible before it pays (Mike's "top of the day" prize).
          const locked = !!c.prize && !me.ownedAdventurers.includes(c.key);
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
                    ? setNote({ tone: "muted", text: D.adventurerEarnTop })
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
                  {busy ? D.swapping : locked ? D.adventurerEarnTop : (cast[c.key]?.blurb ?? c.blurb)}
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

// ── 3) THE ARMORY: gear shelf + camo picker + decal shelf + Bonds strip ─────
//
// The gear shelf replaced the inherited 5-stat upgrade shop (ADR-0129):
// three slots, tiers 0..3, on the ACTIVE class only. Server-priced via
// /api/s7/gear (which mirrors the old /api/s7/upgrade spend discipline);
// the display price comes from gearNextPrice, never a literal.

const GEAR_META: Record<GearSlot, { name: string; line: string }> = {
  weapon: { name: "Weapon", line: "Hit harder in every game." },
  armor: { name: "Armor", line: "Last longer in every game." },
  trinket: { name: "Trinket", line: "Move quicker in every game." },
};

function ArmorySection({
  me,
  patchMe,
  cls,
  setCls,
}: {
  me: HqMe;
  patchMe: PatchMe;
  /** Owned by ArmoryPanel (one read serves the gear shelf AND the colour
   * card), passed down so this section never fetches twice. */
  cls: ClassHallState;
  setCls: React.Dispatch<React.SetStateAction<ClassHallState>>;
}) {
  const [busySlot, setBusySlot] = useState<GearSlot | null>(null);
  const [note, setNote] = useState<{ tone: "good" | "warn" | "bad" | "muted"; text: string } | null>(null);
  const active = cls.active;
  const gearTrack = active ? cls.tracks[active] : undefined;

  const buy = useCallback(
    async (slot: GearSlot) => {
      if (!active || !gearTrack) return;
      setNote(null);
      const tier = gearTrack.gear[slot];
      const price = gearNextPrice(tier);
      if (price === null) return;
      if (isDemo()) {
        // Sandbox: same price curve, client state only, refresh resets it.
        if (me.shells < price) {
          setNote({
            tone: "bad",
            text: `You need ${price.toLocaleString()} Gold for the next ${GEAR_META[slot].name} tier. You have ${me.shells.toLocaleString()}.`,
          });
          return;
        }
        patchMe({ shells: me.shells - price });
        setCls((s) => {
          const cur = active ? s.tracks[active] : undefined;
          if (!cur) return s;
          return {
            ...s,
            tracks: {
              ...s.tracks,
              [active]: { ...cur, gear: { ...cur.gear, [slot]: Math.min(GEAR_MAX_TIER, cur.gear[slot] + 1) } },
            },
          };
        });
        setNote({ tone: "good", text: `${GEAR_META[slot].name} improved. You will feel it in every game.` });
        return;
      }
      if (!me.token) return;
      setBusySlot(slot);
      const r = await postJson("/api/s7/gear", { t: me.token, slot });
      setBusySlot(null);
      const nt = r.ok ? normalizeTrack(r.track) : null;
      if (nt) {
        setCls((s) => ({ ...s, tracks: { ...s.tracks, [nt.classKey]: nt } }));
        if (Number.isFinite(Number(r.gold))) patchMe({ shells: Math.max(0, Math.round(Number(r.gold))) });
        setNote({ tone: "good", text: `${GEAR_META[slot].name} improved. You will feel it in every game.` });
      } else {
        setNote({ tone: "bad", text: String(r.error || "Could not complete the purchase. Try again.") });
      }
    },
    [active, gearTrack, me.shells, me.token, patchMe, setCls],
  );

  return (
    <>
      <div style={sectionLabel}>The Armory · Gold</div>
      <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.55, margin: "0 0 8px" }}>
        Gear sharpens your class in every game.
        {active && gearTrack ? ` This gear belongs to your ${CLASS_NAME[active]}.` : ""}
      </p>
      {me.session && cls.loaded && !active ? (
        <p style={{ fontSize: 12, color: FAINT, lineHeight: 1.55, margin: "0 0 8px" }} data-testid="armory-no-class">
          Pick a class in the Class Hall first. Gear belongs to a class.
        </p>
      ) : null}
      <div style={{ display: "grid", gap: 7, marginBottom: 16 }} data-testid="armory">
        {GEAR_SLOTS.map((slot) => {
          const tier = gearTrack ? gearTrack.gear[slot] : 0;
          const price = gearNextPrice(tier);
          const afford = price !== null && me.shells >= price;
          const canBuy = Boolean(me.session && gearTrack);
          return (
            <div
              key={slot}
              data-testid={`gear-${slot}`}
              data-tier={tier}
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
                  {GEAR_META[slot].name}
                  <span style={{ fontFamily: MONO, fontSize: 9.5, color: STEEL, marginLeft: 7 }}>
                    Tier {tier} of {GEAR_MAX_TIER}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 3, marginTop: 4 }} aria-hidden>
                  {Array.from({ length: GEAR_MAX_TIER }, (_, i) => (
                    <span
                      key={i}
                      style={{
                        width: 14,
                        height: 5,
                        borderRadius: 2,
                        background: i < tier ? EMBER : "rgba(255,255,255,0.09)",
                      }}
                    />
                  ))}
                </div>
                <div style={{ fontSize: 9.5, color: FAINT, marginTop: 4, lineHeight: 1.35 }}>{GEAR_META[slot].line}</div>
              </div>
              {price === null ? (
                <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", color: STEEL, textTransform: "uppercase" }}>
                  Top tier
                </span>
              ) : (
                <button
                  data-testid={`gear-buy-${slot}`}
                  onClick={() => void buy(slot)}
                  disabled={busySlot === slot || !canBuy}
                  style={{ ...actionBtn(canBuy && afford, EMBER), whiteSpace: "nowrap", opacity: canBuy ? 1 : 0.55 }}
                >
                  {busySlot === slot ? "..." : `${price.toLocaleString()} Gold`}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {note ? <Note tone={note.tone}>{note.text}</Note> : null}
    </>
  );
}

const CAMO_SWATCH: Record<CamoKey, string> = {
  olive: "linear-gradient(135deg, #5b6b3f 0%, #3c4a2a 100%)",
  desert: "linear-gradient(135deg, #c2a878 0%, #8f7a4e 100%)",
  winter: "linear-gradient(135deg, #d9e2e8 0%, #9fb0ba 100%)",
  night: "linear-gradient(135deg, #2a3140 0%, #14181f 100%)",
  urban: "linear-gradient(135deg, #7d8790 0%, #4a545d 100%)",
  gold: "linear-gradient(135deg, #e8c258 0%, #9a742a 100%)",
};

/** The one-line "how do I get this" per locked camo, from the ladder table. */
function camoEarnHint(c: CamoKey, dict: S7Dict): string {
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

export function ArmoryPanel({
  me,
  patchMe,
  dict = STRINGS.en,
}: {
  me: HqMe;
  patchMe: PatchMe;
  dict?: S7Dict;
}) {
  const [busyCamo, setBusyCamo] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "good" | "warn" | "bad" | "muted"; text: string } | null>(null);
  // One class read for the whole panel: the gear shelf spends against it and
  // the colour card shows the ACTIVE class wearing the picked colours.
  const [cls, setCls] = useClassTracks(me.token);
  const activeTrack = cls.active ? cls.tracks[cls.active] : undefined;
  const D = dict.panels;

  const paint = useCallback(
    async (camo: CamoKey) => {
      if (!me.token) {
        setNote({ tone: "muted", text: D.camoNeedSession });
        return;
      }
      setBusyCamo(camo);
      setNote(null);
      const r = await postJson("/api/s7/hq", { t: me.token, set: { camo } });
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

  const xp = Math.floor(me.points / BONDS_XP_PER_MEDALS);
  const decals = me.tank.decals;

  return (
    <div data-testid="workbench-panel">
      <DemoBadge />
      <PanelH
        right={
          <span
            data-testid="armory-gold"
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
        The Armory
      </PanelH>

      {/* THE GEAR SHELF (ADR-0129): weapon / armor / trinket tiers for the
          ACTIVE class, Gold only, server-priced via /api/s7/gear. This
          replaced the inherited 5-stat upgrade shop. */}
      <ArmorySection me={me} patchMe={patchMe} cls={cls} setCls={setCls} />

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
      {/* REALMFALL: the S6 tank plate is gone from this card. The ACTIVE class
          stands here in its earned armor stage, with the picked colour set as
          a swatch beside the caption; before a class is picked the swatch
          alone carries the card. */}
      <div style={{ borderRadius: 10, border: `1px solid ${BORDER}`, padding: "8px 10px", background: "rgba(255,255,255,0.02)", marginBottom: 16 }}>
        {activeTrack ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={classStageArt(activeTrack.classKey, stageForLevel(activeTrack.level))}
            alt=""
            aria-hidden
            style={{ width: "100%", height: 72, objectFit: "contain", objectPosition: "bottom center", display: "block" }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
            }}
          />
        ) : (
          <div aria-hidden style={{ height: 72, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ width: 40, height: 40, borderRadius: 9, background: CAMO_SWATCH[me.tank.camo], border: `1px solid ${STEEL}33`, display: "block" }} />
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4 }}>
          <span aria-hidden style={{ width: 11, height: 11, borderRadius: 3, background: CAMO_SWATCH[me.tank.camo], border: `1px solid ${STEEL}33`, display: "inline-block", flexShrink: 0 }} />
          <span style={{ fontSize: 10.5, color: FAINT }}>
            {cls.active ? `${CLASS_NAME[cls.active]} · ` : ""}
            {fill(dict.hq.camoLine, { camo: dict.camo[me.tank.camo] })}
          </span>
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

/** Compatibility alias: src/app/s7/front/BasePopup.tsx (outside the hq
 * folder, which this rework must not touch) imports WorkbenchPanel by name. */
export const WorkbenchPanel = ArmoryPanel;

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
  return `s7_${gameKey}_daily`;
}

/** Exported for the desktop rail (HqScene ≥1024px) as well as this panel. */
export function DailyOrders({ me, dict }: { me: HqMe; dict: S7Dict }) {
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
        <a href="/s7/play" style={{ color: STEEL, fontWeight: 700, textDecoration: "underline", fontSize: 12 }}>
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
function VaultSection({ me, patchMe, dict }: { me: HqMe; patchMe: PatchMe; dict: S7Dict }) {
  // Same dead end the garage had: this linked to /s7/join, which enlists a
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
    const r = await postJson("/api/s7/vault-buy", { t: me.token, item: deal.key });
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
function DecalCollection({ me, targets = [], dict }: { me: HqMe; targets?: TargetLink[]; dict: S7Dict }) {
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
function stateText(D: S7Dict["panels"], state: FundingState): string {
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
  dict?: S7Dict;
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
          ? await fetch("/api/s7/funding-status", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ t: me.token }),
            })
          : await fetch("/api/s7/funding-status");
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
  dict?: S7Dict;
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
    const r = await postJson("/api/s7/claim-ftue", { t: me.token });
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
      action: q2 ? undefined : link("/s7/play", D.q2Action),
    },
    {
      n: 3,
      title: D.q3Title,
      done: q3,
      detail: q3 ? D.q3Done : D.q3Todo,
      action: q3 ? undefined : link("/s7/join", D.q3Action),
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
