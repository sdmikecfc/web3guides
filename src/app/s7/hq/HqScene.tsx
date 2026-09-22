"use client";
/**
 * Season 5 IRON SIEGE, YOUR PERSONAL HQ (the /s7 landing scene).
 *
 * THE STAGE IS A BAKED PLATE, PER TANK: campPlateFor(bayTank) resolves a 3:4
 * camp painting with the FIELDED tank baked under the bay (lib/s7/model.ts
 * CAMP_PLATES; guest + fallback = the Panther portrait). The Panther plate
 * carries the whole-scene seedance LOOP (palindromic 10s, so it breathes with
 * no cut) with the plate as its own poster; every other plate is animated by
 * the HqCanvas particle weather.
 *
 * NAVIGATION (round-2 review, 2026-07-25): the ten-button command bar is
 * GONE. The SKY NAV hangs 4 diegetic plates in the painting's open sky band
 * (ARCADE / MAP / HOW TO PLAY / ENLIST-or-BOARD) plus a compact MORE plate
 * that opens a sheet listing every other station (nothing deleted, only
 * de-cluttered). In-scene hit-regions stay for tank / map / upgrades, and THE
 * COMMANDER HERSELF stands in the scene as a knee-up cutout (SceneCommander):
 * she is the single commander click target; the boxed corner chip and the
 * second hit-region over the baked kneeling mechanic are both gone. A HUD
 * console strip (with the live raid countdown) rides the stage under 1024px;
 * at >=1024px the stage scales up (min(52vw, 720px)) and the HUD moves into a
 * right RAIL beside it with the Daily Orders card and the paid ticker.
 * Destinations open as routes or a panel overlay; the gradient bunker +
 * vector silhouettes survive as fallbacks when art 404s. Plus the
 * earned-not-shamed TrophyShelf.
 *
 * Client-safe imports ONLY (games/theme/hq/locale/track/strings): the server
 * snapshot hands in strings and the pool line; the player's own tank +
 * trophies arrive from /api/s7/me when a play session exists (localStorage,
 * so a server page cannot read it).
 *
 * Layout: desktop = the 3:4 stage (+ rail at >=1024px) + trophy cards. Mobile
 * (<760px) = vertical bands (trophies / tank rig / stage) + a fixed bottom
 * dock of 5 buttons (Arcade / Map / How to play / Enlist-or-Board / More).
 * Copy rules: no em-dashes, never "win $X".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  EDUCATION,
  HOTSPOT_BY_KEY,
  type EducationKey,
  type Hotspot,
  type HotspotKey,
} from "@/lib/s7/hq";
import { clampStats, GAMES, SEASON_MONEY_USD, readSessionToken } from "@/lib/s7/games";
import { DEFAULT_THEME } from "@/lib/s7/theme";
import { HERO_TANK_KEY, campPlateFor, adventurerGrade, resolveAdventurerKey, resolveTank, type ResolvedTank } from "@/lib/s7/model";
import { TANK_ROSTER } from "@/lib/s7/tanks";
import { adventurerByKey, DEFAULT_COMMANDER_KEY } from "@/lib/s7/tanks";
import { RESOLVE_HOUR_UTC } from "@/lib/s7/raid";
import { STRINGS, fill, type S7Dict } from "@/lib/s7/strings";
import { clientLocale } from "@/lib/s7/locale";
import { isDemo, demoHqMe } from "@/lib/s7/demo";
import { markFtueHotspot } from "@/lib/s7/ftue";
import { track, rememberRef } from "@/lib/s7/track";
import { StatsBoard, type PayoutBoardView, type WarEffortView } from "./StatsBoard";
import { WELCOME_CSS, WelcomeModal, welcomeUnseen } from "./WelcomeModal";
import {
  ArmoryPanel,
  CLASS_NAME,
  ClassHallPanel,
  CommanderPanel,
  DailyOrders,
  FootlockerPanel,
  FundingWizardPanel,
  STAGE_META,
  defaultHqMe,
  useClassTracks,
  type ClassHallState,
  type HqMe,
  type TargetLink,
} from "./panels";
import { classStageArt, stageForLevel } from "@/lib/s7/classes";
import { HqCanvas } from "./HqCanvas";
import { useReducedMotion } from "./LivingPortrait";

const STEEL = "#9aa7b4";
const EMBER = "#e0662e";
const PANEL_BG = "rgba(18,22,27,0.96)";
const BORDER = "#232a32";
const TEXT = "#e9edf1";
const MUTED = "#aab4bd";
const FAINT = "#87919b";

// The ambient background LOOP rides the CAMP_PLATES entry now (model.ts): the
// Panther plate carries the paid whole-scene seedance clip; every other plate
// animates via the HqCanvas particle weather instead. CampBackdrop takes both
// as props, so this file holds no plate path constants anymore.

// Local mirror of the server Trophies shape (the server-only lib must never be
// imported from a client component, so the page passes plain JSON down).
export type TrophyView = { art: string; label: string } | null;
export type TrophiesView = {
  s2: TrophyView;
  s3: TrophyView;
  s4: TrophyView;
  discordLinked: boolean;
};

type MeResponse = {
  ok?: boolean;
  tank?: ResolvedTank;
  trophies?: TrophiesView;
  player?: { displayName?: string | null; points?: number; playCurrency?: number; enlistedBy?: string | null };
  heldUsd?: number;
  rawStats?: unknown;
  hq?: {
    adventurer?: string;
    ownedTanks?: string[];
    ownedCamos?: string[];
    ownedAdventurers?: string[];
    bondsTier?: number;
    streakDays?: number;
    crates?: string[];
  };
  payout?: PayoutBoardView;
  /** THE WAR EFFORT: the caller's own Shells commitments (never dollars). */
  warEffort?: WarEffortView[];
};

/** Panel keys: every panel-opening hotspot, the quests panel, the funding
 * wizard (reached from footlocker / radio / the tank panel CTA), and the
 * round-2 MORE sheet that lists every de-cluttered station. */
type PanelKey = HotspotKey | "quests" | "wizard" | "more";

const usdFmt = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** REALMFALL station relabels (inline strings for now; the strings pass lifts
 * them into the dict later). The hotspot KEYS stay "tank" / "workbench" so
 * deep links and the registry keep working; only the words change. */
const SPOT_OVERRIDE: Partial<Record<HotspotKey, { label: string; flavor: string }>> = {
  tank: {
    label: "The Class Hall",
    flavor: "Six classes, one active. Every class keeps its own level.",
  },
  workbench: {
    label: "The Armory",
    flavor: "Weapon, armor, trinket. Spend Gold, feel it in every game.",
  },
};

/** The season pool numbers the landing hands in so the pool line can be
 * re-rendered from the ko/zh dict client-side (the landing page itself stays
 * ISR and never reads the locale cookie). */
export type PoolView = {
  empty: boolean;
  unlockedUsd: number;
  fullUsd: number;
  allBonded: boolean;
  /** Real dollars already paid out (config s7_paid_ledger via the snapshot).
   * $0 is the honest launch state; the L6 ticker renders it anyway. */
  paidOutUsd: number;
};

/** THE FRONT REACTS: the client-safe slice of the season snapshot's sprint
 * state (a flag and the domain names, nothing else). When active, the camp
 * takes a warning tint, the map table pulses, and one line names the wall. */
export type SprintView = { active: boolean; domains: string[] };

/** Hydration-safe art with a fallback: the S3-proven pattern (a 404 that
 * resolves before hydration never fires onError; the ref catches it at mount). */
function SafeArt({
  src,
  alt,
  style,
  className,
  testId,
  onBroken,
}: {
  src: string;
  alt: string;
  style?: React.CSSProperties;
  className?: string;
  testId?: string;
  onBroken?: () => void;
}) {
  const [ok, setOk] = useState(true);
  const ref = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) {
      setOk(false);
      onBroken?.();
    }
  }, [onBroken]);
  if (!ok) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={alt}
      style={style}
      className={className}
      data-testid={testId}
      onError={() => {
        setOk(false);
        onBroken?.();
      }}
    />
  );
}

/** The UTC day-phase stamped on the stage (SSR renders "" = neutral). */
type DayPhase = "" | "day" | "dusk" | "night";

/**
 * THE STAGE IS THE ART. `plate` is the baked 3:4 camp painting for the fielded
 * tank (CAMP_PLATES in model.ts; the Panther portrait for guests + fallback):
 * the tank under the covered bay, the kneeling mechanic by the fire, the
 * corkboard and crates. It renders at its own 3:4 aspect so the whole picture
 * is visible, and the in-scene hit-regions (.s7hq-obj--*) are percentages of
 * this box, literally coordinates on the painting. A plate change (guest
 * Panther swapping to the picked tank once /api/s7/me lands) crossfades over
 * 250ms: the old painting holds underneath while the new one fades in.
 *
 * `loop` (Panther only today) plays the whole-scene seedance clip over the
 * plate with the plate as its own poster; reduced motion never mounts the
 * <video> at all. Every loop-less plate mounts the HqCanvas particle weather
 * instead, so ALL plates are alive for zero video credits.
 *
 * Three layers on top of it, all decoration: a warm glow toward the lamp post
 * and hanging lanterns, a vignette that pushes the eye to the bay, and a
 * bottom scrim so the HUD and captions stay readable over the mud. The
 * gradient bunker survives underneath as the fallback if the plate 404s.
 */
function CampBackdrop({
  dict,
  sprint = false,
  plate,
  loop,
  phase = "",
}: {
  dict: S7Dict;
  sprint?: boolean;
  plate: string;
  loop?: string;
  phase?: DayPhase;
}) {
  // Remember WHICH src broke (the TankArt pattern), so a plate swap un-breaks
  // on its own and a broken picked-tank plate can still fall back cleanly.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const broken = brokenSrc === plate;
  // 250ms crossfade on plate change: hold the outgoing painting underneath
  // while the incoming one fades in over it (both cover the same box).
  const [prevPlate, setPrevPlate] = useState<string | null>(null);
  const lastPlateRef = useRef(plate);
  useEffect(() => {
    if (lastPlateRef.current === plate) return;
    setPrevPlate(lastPlateRef.current);
    lastPlateRef.current = plate;
    const t = setTimeout(() => setPrevPlate(null), 300);
    return () => clearTimeout(t);
  }, [plate]);
  // Reduced motion: a still, framed scene. No loop <video> mounts; the
  // HqCanvas paints one static weather frame (it handles reduce itself).
  const reduced = useReducedMotion();
  const loopOn = Boolean(loop) && !reduced;
  return (
    <div aria-hidden className={`s7hq-bg${broken ? " s7hq-bg--fallback" : ""}`}>
      {!broken ? (
        <div className="s7hq-plate-wrap">
          {prevPlate ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={prevPlate} alt="" aria-hidden className="s7hq-plateart" />
          ) : null}
          <SafeArt
            key={plate}
            src={plate}
            alt={dict.hq.campAlt}
            className={`s7hq-plateart${prevPlate ? " s7hq-plateart--fade" : ""}`}
            testId="hq-plate"
            onBroken={() => setBrokenSrc(plate)}
          />
          {/* The living loop plays over the plate; the plate is its own poster,
              so a failed/absent clip degrades to the painted still with zero
              regression. Muted + playsInline so it autoplays on mobile too. */}
          {loopOn ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              key={loop}
              className="s7hq-video"
              src={loop}
              poster={plate}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
            />
          ) : null}
        </div>
      ) : null}
      {/* The living weather (rain / drifting smoke / embers / fog), reduced-
          motion + tab-hidden aware, tinted by the siege-sprint state. When the
          whole-scene video loop is present it already carries baked rain / fire
          / smoke, so the particle canvas would double the weather: drop it and
          keep only a thin alarm-red tint for the siege-sprint state. Every
          loop-less plate gets the canvas, so it stays alive too. */}
      {loopOn ? (
        sprint ? <div aria-hidden className="s7hq-sprinttint" /> : null
      ) : (
        <HqCanvas active={sprint} />
      )}
      {/* UTC day-phase wash (client-stamped; "" on SSR = fully neutral). Sits
          under the lamp so the lantern glow rides ON the cooled/warmed paint. */}
      <div className={`s7hq-phase${phase ? ` s7hq-phase--${phase}` : ""}`} />
      <div className="s7hq-lamp" />
      <div className="s7hq-vig" />
      <div className="s7hq-scrim" />
    </div>
  );
}

// ── The placeholder rigs (gradient silhouettes until the art lands) ─────────

/** The vector fallback hull: every tank whose painted cutout has not landed
 * yet renders this instead. Sized entirely in percentages of its 3:2 box, so
 * it drops into the bay at exactly the same footprint as the real art. */
function TankSilhouette() {
  return (
    <div aria-hidden className="s7hq-sil">
      <div className="s7hq-sil-tracks" />
      <div className="s7hq-sil-hull" />
      <div className="s7hq-sil-turret" />
      <div className="s7hq-sil-barrel" />
    </div>
  );
}

/**
 * The tank itself, plus the CONTACT SHADOW. The painted plate has no shadow
 * under the bay (by design: shadows are drawn in code, never generated), so
 * without this ellipse the cutout floats. The shadow sits behind the art and
 * is sized to the tracks, not the whole box.
 */
function TankArt({ tank, className }: { tank: ResolvedTank; className?: string }) {
  // Remember WHICH src broke, not a boolean. A boolean plus a reset effect
  // races: the child's mount effect flags the 404 first, then the parent's
  // reset clears it, and the fallback never renders at all. Comparing the
  // broken src to the current one un-breaks on a camo or tank swap for free.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const artBroken = brokenSrc === tank.art;
  return (
    <div className={`s7hq-tankart${className ? ` ${className}` : ""}`}>
      <div aria-hidden className="s7hq-tankshadow" />
      {!artBroken ? (
        <SafeArt
          key={tank.art}
          src={tank.art}
          alt=""
          className="s7hq-tankimg"
          testId="hq-tank"
          onBroken={() => setBrokenSrc(tank.art)}
        />
      ) : (
        <TankSilhouette />
      )}
    </div>
  );
}

/**
 * The plate under the hero art. S7 reads it off the ACTIVE CLASS (name, level,
 * armor stage) - the season has no tiers, hulls or camo to announce here, and
 * a plate saying "Tier 1 - Recon class, olive camo" was the first thing a
 * visitor saw. Falls back to the class name alone before the tracks load, and
 * to a plain invitation when no class is picked yet.
 */
function TankCaption({
  tank,
  dict,
  className,
  cls,
}: {
  tank: ResolvedTank;
  dict: S7Dict;
  className?: string;
  cls?: { loaded: boolean; active: string | null; tracks: Record<string, { level: number }> };
}) {
  const active = cls?.active ?? null;
  const level = active ? cls?.tracks?.[active]?.level ?? 1 : 1;
  const stage = STAGE_META[stageForLevel(level)];
  const name = active ? CLASS_NAME[active as keyof typeof CLASS_NAME] ?? tank.tankName : null;
  return (
    <div className={`s7hq-tankplate${className ? ` ${className}` : ""}`}>
      <div className="s7hq-tankplate-tier">{name ? `Level ${level}` : "No class yet"}</div>
      <div className="s7hq-tankplate-name">{name ?? "Pick a class"}</div>
      <div className="s7hq-tankplate-camo">{name ? `${stage.name} armor` : "Any class is free"}</div>
    </div>
  );
}

/** The stacked art + caption used by the mobile band. */
function TankRig({ tank, dict, cls }: { tank: ResolvedTank; dict: S7Dict; cls?: React.ComponentProps<typeof TankCaption>["cls"] }) {
  return (
    <div className="s7hq-rig">
      <TankArt tank={tank} />
      <TankCaption tank={tank} dict={dict} cls={cls} />
    </div>
  );
}

/** REALMFALL: what the mobile band shows instead of the inherited tank rig
 * (the S6 machine cutout art is retired from every rendered S7 path). The
 * ACTIVE class stands here in its earned armor stage over the same caption
 * plate; before a class is picked the neutral camp portrait holds the frame
 * so the band never renders empty. */
function ClassRig({ tank, dict, cls }: { tank: ResolvedTank; dict: S7Dict; cls: ClassHallState }) {
  const active = cls.active;
  const level = active ? cls.tracks[active]?.level ?? 1 : 1;
  const src = active ? classStageArt(active, stageForLevel(level)) : "/s7-art/hq/camp-portrait.webp";
  return (
    <div className="s7hq-rig">
      <SafeArt
        key={src}
        src={src}
        alt=""
        style={{ display: "block", width: "min(78vw, 340px)", height: 210, objectFit: "contain", objectPosition: "bottom center", margin: "0 auto" }}
      />
      <TankCaption tank={tank} dict={dict} cls={cls} />
    </div>
  );
}

function TrophyShelf({ trophies, dict, compact }: { trophies: TrophiesView | null; dict: S7Dict; compact?: boolean }) {
  const t = trophies;
  const slots: Array<{ key: string; trophy: TrophyView; empty: string }> = [
    { key: "S4", trophy: t?.s4 ?? null, empty: dict.hq.trophyS4Empty },
    { key: "S3", trophy: t?.s3 ?? null, empty: dict.hq.trophyS3Empty },
    {
      key: "S2",
      trophy: t?.s2 ?? null,
      empty: t && !t.discordLinked ? dict.hq.trophyS2Unlinked : t ? dict.hq.trophyS2Empty : dict.hq.trophyS2Unlinked,
    },
  ];
  // A brand new commander has none of the three. Three cards explaining what
  // they do NOT have is a bleak thing to put at the top of their own HQ, so the
  // all-empty case collapses to one quiet line and the scene keeps the space.
  const anyEarned = !!(t && (t.s2 || t.s3 || t.s4));
  if (!anyEarned) {
    return (
      <div style={{ textAlign: "center", padding: "6px 12px" }}>
        <span
          style={{
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: 10,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: FAINT,
          }}
        >
          {dict.hq.trophyShelfEmpty}
        </span>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
      {slots.map((s) => (
        <div
          key={s.key}
          style={{
            width: compact ? 150 : 180,
            minHeight: compact ? 96 : 120,
            background: "rgba(255,255,255,0.03)",
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            padding: "10px 12px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
          }}
        >
          <div style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 10, letterSpacing: "0.2em", color: FAINT }}>
            {s.key}
          </div>
          {s.trophy ? (
            <>
              <SafeArt
                src={s.trophy.art}
                alt={s.trophy.label}
                style={{ maxWidth: "100%", maxHeight: compact ? 52 : 70, objectFit: "contain" }}
              />
              <div style={{ fontSize: 11, color: MUTED, textAlign: "center" }}>{s.trophy.label}</div>
            </>
          ) : (
            <div style={{ fontSize: 11.5, color: FAINT, textAlign: "center", lineHeight: 1.5 }}>{s.empty}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── The scene ───────────────────────────────────────────────────────────────

/**
 * THE COMMANDER STANDS IN THE SCENE (round-2 review): the picked commander's
 * knee-up cutout composited over the plate, right of center in the
 * foreground, sized so the top of her head stops just under the tank's hull
 * line (about half again the old corner-chip scale). She IS the single
 * commander click target: the boxed HUD chip and the second hit-region over
 * the baked kneeling mechanic are both gone (two boxes, one destination was
 * the exact complaint). A contact-shadow ellipse pools at the frame base so
 * the cutout reads grounded, not stickered.
 *
 * STATIC BY DECISION (chroma-key attempt, 2026-07-25): the idle clips carry
 * painted backgrounds; a corner-sample distance key was tested on Wrench and
 * leaves flickering background speckles + smudge survivors, so the still PNG
 * ships for everyone and reduced motion changes nothing here. If the PNG
 * 404s the whole figure unmounts (never a broken frame); the commander panel
 * stays reachable from the More sheet.
 */
/* The stations the sky nav does not carry. Kept in ONE place so the left rail
   and the More sheet can never list different things. */
const LRAIL_KEYS: HotspotKey[] = [
  "tank",
  "adventurer",
  "workbench",
  "footlocker",
  "trophyshelf",
  "bookshelf",
  "radio",
  "door",
];

function SceneCommander({ ck, label, onOpen }: { ck: string; label: string; onOpen: () => void }) {
  const png = `/s7-art/pilot/${ck}.png`;
  const grade = adventurerGrade(ck);
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  if (brokenSrc === png) return null;
  return (
    <button
      className="s7hq-cmdr"
      aria-label={label}
      data-testid="hq-commander"
      onClick={onOpen}
      /* the lighting overlay masks itself to this exact PNG's alpha, and the
         grade is per-commander because one filter cannot serve eight palettes
         (see COMMANDER_GRADE) */
      style={{
        ["--cmdr-mask" as string]: `url(${png})`,
        ["--cmdr-sat" as string]: String(grade.sat),
        ["--cmdr-bri" as string]: String(grade.bri),
      } as React.CSSProperties}
    >
      <span aria-hidden className="s7hq-cmdr-shadow" />
      <SafeArt
        key={png}
        src={png}
        alt=""
        className="s7hq-cmdr-img"
        onBroken={() => setBrokenSrc(png)}
      />
      <span aria-hidden className="s7hq-cmdr-light" />
    </button>
  );
}

/**
 * What she says from inside the painting. Rotating flavour so the camp reads as
 * inhabited rather than staged, with two lines that react to real state: a
 * visitor who has not enlisted gets told to sign on, and an open raid window
 * outranks everything else because it is the only line that is time-critical.
 *
 * `key={text}` is deliberate: remounting on every change replays the CSS
 * entrance, which is cheaper and steadier than driving opacity from state.
 * aria-hidden because the commander button already carries the accessible
 * name, and this is atmosphere, not information a screen reader needs twice.
 */
/**
 * THE LANDING BAND, under the hero.
 *
 * The page used to be one painting and then nothing: no welcome, no
 * explanation, no reason to scroll. This is the part a stranger reads.
 *
 * Two rules it is written to, both learned the hard way on this season:
 * plain language FIRST and the in-fiction words second (ADR-0078, after
 * "holding earns medals everyday is kind of confusing"), and lead with the
 * fact that the games are free and need no wallet, because that is the most
 * inviting true thing we have and it was previously buried behind Connect.
 */
function LandingBand({ dict, session }: { dict: S7Dict; session: boolean }) {
  const L = dict.hq.landing;
  // Step 3 ("Back a domain") carries the ONLY dollar ask on the page and used
  // to have no link and no how (2026-07-27 audit, F2): the funding wizard
  // existed with zero front doors. Every step now ends somewhere real.
  const steps: Array<[string, string, string?, string?]> = [
    [L.s1t, L.s1b, "/s7/play", L.gamesCta],
    [L.s2t, L.s2b, "/s7/join", L.ctaPlay],
    [L.s3t, L.s3b, "/s7/hq#wizard", L.s3Cta],
  ];
  return (
    <section className="s7lb" id="s7-landing" data-testid="hq-landing">
      <div className="s7lb-in">
        <p className="s7lb-kicker">{L.welcomeKicker}</p>
        <h2 className="s7lb-title">{L.welcomeTitle}</h2>
        <p className="s7lb-lead">{L.welcomeBody}</p>

        {/* RETURNING PLAYERS are the most certain day-one cohort and the one
            we had nothing for: they arrive expecting TEAMS (S7 is solo,
            ADR-0058), expecting Bounty/Intel, and carrying S4's rule where a
            96% wall paid $0. The last of those is the best news we have, so
            say it where they will look. */}
        <div className="s7lb-vets" id="s7-vets" data-testid="landing-vets">
          <p className="s7lb-vets-h">{L.vetsTitle}</p>
          <ul className="s7lb-vets-list">
            {[L.vets1, L.vets2, L.vets3, L.vets4].map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
        <div className="s7lb-cta">
          <Link href="/s7/play" className="s7lb-btn s7lb-btn--primary" data-testid="landing-play">
            {L.gamesCta}
          </Link>
          {!session ? (
            <Link href="/s7/join" className="s7lb-btn" data-testid="landing-join">
              {L.ctaPlay}
            </Link>
          ) : null}
        </div>

        <h3 className="s7lb-h">{L.howTitle}</h3>
        <div className="s7lb-grid">
          {steps.map(([t, b, href, cta]) => (
            <div className="s7lb-card" key={t}>
              <h4 className="s7lb-ct">{t}</h4>
              <p className="s7lb-cb">{b}</p>
              {href && cta ? (
                <Link href={href} className="s7lb-cardlink" data-testid={`landing-step-${href.replace(/\W+/g, "")}`}>
                  {cta} <span aria-hidden>→</span>
                </Link>
              ) : null}
            </div>
          ))}
        </div>

        <div className="s7lb-card s7lb-card--wide">
          <h4 className="s7lb-ct">{L.payTitle}</h4>
          <p className="s7lb-cb">{L.payBody}</p>
        </div>

        <h3 className="s7lb-h">{L.gamesTitle}</h3>
        <p className="s7lb-sub">{L.gamesBody}</p>
        <div className="s7lb-grid s7lb-grid--4">
          {GAMES.filter((g) => !g.comingSoon).map((g) => (
            <Link className="s7lb-card s7lb-card--link" key={g.key} href={`/s7/games/${g.key}`}>
              <h4 className="s7lb-ct">{g.name}</h4>
              <p className="s7lb-cb">
                {(dict.play.blurbs as Record<string, string>)[g.key] ?? ""}
              </p>
            </Link>
          ))}
        </div>

        <h3 className="s7lb-h">{L.mapTitle}</h3>
        <p className="s7lb-sub">{L.mapBody}</p>
        <Link href="/s7" className="s7lb-btn" data-testid="landing-map">
          {L.mapCta}
        </Link>
      </div>
    </section>
  );
}

function CommanderSays({ dict, guest, raidSoon }: { dict: S7Dict; guest: boolean; raidSoon: boolean }) {
  const idle = dict.hq.says.idle;
  const [i, setI] = useState(0);
  useEffect(() => {
    if (guest || raidSoon || idle.length < 2) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % idle.length), 9000);
    return () => window.clearInterval(t);
  }, [guest, raidSoon, idle.length]);
  const text = guest ? dict.hq.says.guest : raidSoon ? dict.hq.says.raidSoon : idle[i % idle.length];
  if (!text) return null;
  return (
    <div className="s7hq-says" data-testid="hq-commander-says" aria-hidden key={text}>
      {text}
    </div>
  );
}

/**
 * The in-scene object buttons (tank / map / upgrades), shared by BOTH stages:
 * the hit-region coordinates are percentages of the same 3:4 plate box, so
 * one component serves desktop and mobile. Under 760px the hover-only tank
 * label becomes an always-visible tag (CSS), because there is no hover on a
 * phone. The commander is NOT here: she stands in the scene as her own
 * cutout button (SceneCommander), and the old second hit-region over the
 * baked kneeling mechanic is gone (round-2 review: two boxes, one place).
 */
function SceneObjects({
  spotText,
  dict,
  onNav,
  onRoute,
  onMore,
  sprintOn,
}: {
  spotText: (spot: Hotspot) => { label: string; flavor: string };
  dict: S7Dict;
  onNav: (spot: Hotspot) => void;
  onRoute: (href: string, ref: string) => void;
  onMore: () => void;
  sprintOn: boolean;
}) {
  return (
    <>
      {/* The hero object is clickable IN the scene (hover glow + label). */}
      <button
        className="s7hq-obj s7hq-obj--tank"
        aria-label={spotText(HOTSPOT_BY_KEY.tank).label}
        onClick={() => onNav(HOTSPOT_BY_KEY.tank)}
      >
        {/* Inline REALMFALL tag (dict.hq.tagTank still says the S6 word). */}
        <span className="s7hq-obj-lbl">CLASS HALL</span>
      </button>

      {/* Labeled scene objects = the menu (your reference): the crates and
          the map board carry their label + a glow, clickable in the scene. */}
      <button
        className={`s7hq-obj s7hq-obj--label s7hq-obj--map${sprintOn ? " s7hq-obj--alert" : ""}`}
        data-testid="sky-map"
        aria-label={spotText(HOTSPOT_BY_KEY.maptable).label}
        onClick={() => onNav(HOTSPOT_BY_KEY.maptable)}
      >
        <span className="s7hq-obj-tag">{dict.hq.tagMap}</span>
      </button>
      {/* The tents run the games; the crates by the commander hold the manual.
          Both were sky chips until 2026-07-28: on the object, they read as
          camp signage instead of a toolbar. */}
      <button
        className="s7hq-obj s7hq-obj--label s7hq-obj--arcade"
        data-testid="sky-arcade"
        aria-label={spotText(HOTSPOT_BY_KEY.arcade).label}
        onClick={() => onNav(HOTSPOT_BY_KEY.arcade)}
      >
        <span className="s7hq-obj-tag">{dict.nav.arcade}</span>
      </button>
      <button
        className="s7hq-obj s7hq-obj--label s7hq-obj--howto"
        data-testid="sky-how"
        onClick={() => onRoute("/s7/how-to-play", "scene-how-to-play")}
      >
        <span className="s7hq-obj-tag">{dict.links.howToPlay}</span>
      </button>
      {/* Every other station. The left rail only exists above 1400px and the
          dock only on phones, so without this a 1280px desktop cannot reach
          them at all. */}
      <button
        className="s7hq-obj s7hq-obj--label s7hq-obj--more"
        data-testid="sky-more"
        aria-haspopup="dialog"
        onClick={onMore}
      >
        <span className="s7hq-obj-tag">{dict.hq.moreLabel}</span>
      </button>
      <button
        className="s7hq-obj s7hq-obj--label s7hq-obj--upgrades"
        aria-label={spotText(HOTSPOT_BY_KEY.workbench).label}
        onClick={() => onNav(HOTSPOT_BY_KEY.workbench)}
      >
        {/* Inline REALMFALL tag (dict.hq.tagUpgrades is the S6 word). */}
        <span className="s7hq-obj-tag">ARMORY</span>
      </button>
    </>
  );
}

// ── The scene ───────────────────────────────────────────────────────────────

export function HqScene({
  poolLineText,
  pool = null,
  sprint = null,
  trophies: trophiesProp,
  targets = [],
  forceTank,
  forceCommander,
}: {
  /** The server-rendered ENGLISH pool line (SSR + the en default). */
  poolLineText: string;
  /** Raw pool numbers so ko/zh can rebuild the line from the dict. */
  pool?: PoolView | null;
  /** Live siege-sprint state; null or inactive leaves the camp unchanged. */
  sprint?: SprintView | null;
  trophies: TrophiesView | null;
  /** Client-safe stronghold list for the funding wizard's buy links. */
  targets?: TargetLink[];
  /** PREVIEW OVERRIDES (the /s7/hq/preview art gallery): force a specific tank
   * and commander into the bay so every roster combo can be eyeballed in the
   * real scene. Undefined in normal use (identical behavior). */
  forceTank?: string;
  forceCommander?: string;
}) {
  const router = useRouter();
  const [dict, setDict] = useState<S7Dict>(STRINGS.en);
  const [panel, setPanel] = useState<PanelKey | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // DEEP LINK: /s7#wizard opens the funding wizard on arrival (the how-to-play
  // walkthrough's "Get armed" door), and ?panel=<key> opens any station
  // directly. The second form is what lets the world map's diegetic objects
  // work: the Workshop building on the map is a link to ?panel=workbench, so
  // one tap on a painted shed lands you in the tuning panel rather than
  // dumping you at the camp to hunt for it.
  //
  // Read off window.location rather than useSearchParams: the hook forces a
  // Suspense boundary during static rendering, and this component is already
  // deliberately ISR-safe. Additive and fail-soft, exactly like the hash form.
  useEffect(() => {
    try {
      if (window.location.hash === "#wizard") {
        setPanel("wizard");
        return;
      }
      const want = new URLSearchParams(window.location.search).get("panel");
      // Whitelist, so a junk or hostile param can never push the scene into a
      // panel state it has no body for. Route-opening hotspots (arcade,
      // maptable, door) are deliberately absent: they are not panels.
      const OPENABLE: PanelKey[] = [
        "tank",
        "adventurer",
        "radio",
        "workbench",
        "bookshelf",
        "trophyshelf",
        "footlocker",
        "quests",
        "wizard",
        "more",
      ];
      if (want && (OPENABLE as string[]).includes(want)) setPanel(want as PanelKey);
    } catch {
      // no window / blocked access: nothing to do
    }
  }, []);
  const [trophies, setTrophies] = useState<TrophiesView | null>(trophiesProp);
  const [me, setMe] = useState<HqMe>(() => defaultHqMe());
  // the active class powers the in-scene hero plate (season has no tiers/camo)
  const [sceneCls] = useClassTracks(me.token);

  /**
   * BROWSE MODE (?browse=1, dev only).
   *
   * A review build where nothing is locked: every tank owned, plenty of
   * Shells, so the garage, the upgrades and the commander picker can all be
   * opened and clicked through without buying anything first. It exists so the
   * whole HQ can be looked at in one sitting.
   *
   * It only ever touches CLIENT state. Every real mutation still goes through
   * the API with the player's token, so this cannot grant anything: a save
   * from browse mode is rejected server-side exactly as it would be for any
   * unowned tank. It is a viewer, not a cheat.
   */
  const browse =
    process.env.NODE_ENV !== "production" &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("browse");
  useEffect(() => {
    if (!browse) return;
    setMe((prev) => ({
      ...prev,
      ownedTanks: TANK_ROSTER.map((t) => t.key),
      shells: Math.max(prev.shells, 99999),
    }));
  }, [browse]);
  // The FIELD REPORT's payout column (the class column reads its own tracks).
  const [board, setBoard] = useState<PayoutBoardView | null>(null);
  // Brothers in Arms: the recruiter's name, permanent on this HQ (ADR-0068 §3).
  const [enlistedBy, setEnlistedBy] = useState<string | null>(null);
  // THE WAR EFFORT: the commander's own Shells commitments (play currency).
  const [warEffort, setWarEffort] = useState<WarEffortView[]>([]);
  const [welcome, setWelcome] = useState(false);
  const patchMe = useCallback((patch: Partial<HqMe>) => {
    setMe((prev) => ({ ...prev, ...patch }));
  }, []);

  /**
   * What stands in the bay. A signed-in commander sees THEIR tank (with the
   * vector silhouette wherever a painted cutout has not landed yet). A guest
   * has not picked anything, so the camp shows the one tank that is fully
   * painted today: first arrival is the finished picture, never a placeholder.
   */
  const bayTank = useMemo(
    () =>
      forceTank
        ? resolveTank({ tank: forceTank })
        : me.session
          ? me.tank
          : resolveTank({ tank: HERO_TANK_KEY }),
    [forceTank, me.session, me.tank],
  );

  // The commander shown in the bay: a valid preview override wins, else the
  // player's pick, else the cast default so a guest never sees an empty
  // silhouette. Reads DEFAULT_COMMANDER_KEY rather than a literal, so the
  // first face is changed in ONE place (it is Forge since 2026-07-27).
  const activeCommander =
    (forceCommander && adventurerByKey(forceCommander) ? forceCommander : null) ||
    (adventurerByKey(me.adventurer) ? me.adventurer : null) ||
    DEFAULT_COMMANDER_KEY;

  // The camp painting for the bay tank (guest = the Panther hero portrait;
  // once /api/s7/me lands with a picked tank, CampBackdrop crossfades to that
  // tank's baked plate). Unknown keys resolve to the Panther entry.
  const campPlate = useMemo(() => campPlateFor(bayTank.tankKey), [bayTank.tankKey]);

  // UTC DAY-PHASE: the camp follows the real clock. SSR renders neutral (no
  // class), a client effect stamps day / dusk / night and keeps it fresh, so
  // there is no hydration mismatch and the tint drifts as the hours pass.
  const [dayPhase, setDayPhase] = useState<"" | "day" | "dusk" | "night">("");
  useEffect(() => {
    const stamp = () => {
      const h = new Date().getUTCHours();
      setDayPhase(h >= 6 && h < 16 ? "day" : h >= 16 && h < 20 ? "dusk" : "night");
    };
    stamp();
    const id = setInterval(stamp, 60_000);
    return () => clearInterval(id);
  }, []);

  // NEXT RAID countdown: seconds to the next 14:00 UTC resolve (the bot's
  // RESOLVE_HOUR_UTC, mirrored in lib/s7/raid.ts). Client-only mount: null
  // until the first effect tick, so SSR and hydration render no chip at all.
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const raidCountdown = useMemo(() => {
    if (nowMs === null) return null;
    const d = new Date(nowMs);
    const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), RESOLVE_HOUR_UTC, 0, 0, 0);
    const left = today > nowMs ? today - nowMs : today + 86_400_000 - nowMs;
    const s = Math.floor(left / 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  }, [nowMs]);

  /* True inside the last hour before the raid resolves. Only used to let the
     commander say the one line that is actually time-critical. */
  const raidSoon = useMemo(() => {
    if (nowMs === null) return false;
    const d = new Date(nowMs);
    const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), RESOLVE_HOUR_UTC, 0, 0, 0);
    const left = today > nowMs ? today - nowMs : today + 86_400_000 - nowMs;
    return left <= 3_600_000;
  }, [nowMs]);

  // Locale (client cookie read; default en byte-for-byte).
  useEffect(() => {
    const loc = clientLocale();
    if (loc !== "en") setDict(STRINGS[loc]);
  }, []);

  // Landing funnel beacon (deduped per session per day inside track()).
  // rememberRef persists a ?ref=CODE first-touch so enlisting later still
  // attributes the recruiter (Brothers in Arms, ADR-0068 §3).
  useEffect(() => {
    rememberRef();
    track("landing_view");
  }, []);

  // A11Y BLOCKER FIX (2026-07-27 audit): the panel overlay declared
  // role="dialog" aria-modal but implemented none of the contract, so a
  // keyboard or screen-reader user opened a station and was stranded on a
  // node aria-modal had just hidden. Same contract as WelcomeModal:94-126 -
  // Escape closes, focus enters the panel, Tab cycles inside it, and focus
  // returns to whatever opened it.
  useEffect(() => {
    if (!panel) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setPanel(null);
        return;
      }
      if (e.key !== "Tab") return;
      const card = panelRef.current;
      if (!card) return;
      const items = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === card)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [panel]);

  // First arrival for a signed-out visitor: the welcome, once, ever. A play
  // session in this tab means they are already enlisted, so it stays shut.
  useEffect(() => {
    let signedIn = Boolean(readSessionToken());
    if (!signedIn && welcomeUnseen()) setWelcome(true);
  }, []);

  // Personalize from the play session when one exists (localStorage token,
  // invisible to the server page). Guests keep the defaults.
  useEffect(() => {
    // DEMO SANDBOX, same contract as useHqMe: seed a funded commander and never
    // touch the network. This branch was MISSING here, and it is why the shop
    // looked broken. `?demo=1` only worked on the world map (which uses
    // useHqMe); on /s7/hq the scene ran this fetch, found no session token,
    // and left me.session false. Every buy and swap is gated on that flag, and
    // a disabled action renders as a 50%-opacity ghost, so the one surface
    // built for testing the shop was the one surface where it could not work.
    if (isDemo()) {
      setMe(demoHqMe());
      return;
    }
    let cancelled = false;
    try {
      const t = readSessionToken();
      if (!t) return;
      void fetch("/api/s7/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t }),
      })
        .then((r) => (r.ok ? (r.json() as Promise<MeResponse>) : null))
        .then((resp) => {
          if (cancelled || !resp?.ok) return;
          if (resp.trophies) setTrophies(resp.trophies);
          if (resp.payout) setBoard(resp.payout);
          if (Array.isArray(resp.warEffort)) setWarEffort(resp.warEffort);
          if (typeof resp.player?.enlistedBy === "string" && resp.player.enlistedBy) setEnlistedBy(resp.player.enlistedBy);
          setMe((prev) => ({
            ...prev,
            session: true,
            token: t,
            shells: Math.max(0, Math.round(Number(resp.player?.playCurrency) || 0)),
            points: Math.max(0, Math.round(Number(resp.player?.points) || 0)),
            heldUsd: Math.max(0, Number(resp.heldUsd) || 0),
            tank: resp.tank || prev.tank,
            ownedTanks: Array.isArray(resp.hq?.ownedTanks) && resp.hq.ownedTanks.length > 0 ? resp.hq.ownedTanks : prev.ownedTanks,
            // THE RENAME WAS HALF DONE (fixed 2026-08-15). HqMe carries
            // `adventurer`, and resolveAdventurerKey reads `src.adventurer` - but this passed
            // `{ commander: ... }` into it and assigned the result to a field
            // that no longer exists, so the resolver fell through to the
            // default on every load and EVERY player saw Forge forever, no
            // matter who they picked.
            adventurer: resolveAdventurerKey({ adventurer: resp.hq?.adventurer }),
            ownedCamos: Array.isArray(resp.hq?.ownedCamos)
              ? resp.hq.ownedCamos.filter((c): c is string => typeof c === "string")
              : prev.ownedCamos,
            ownedAdventurers: Array.isArray(resp.hq?.ownedAdventurers)
              ? resp.hq.ownedAdventurers.filter((c): c is string => typeof c === "string")
              : prev.ownedAdventurers,
            stats: clampStats(resp.rawStats),
            bondsTier: Math.max(0, Math.min(20, Math.round(Number(resp.hq?.bondsTier) || 0))),
            streakDays: Math.max(0, Math.round(Number(resp.hq?.streakDays) || 0)),
            crates: Array.isArray(resp.hq?.crates) ? resp.hq.crates.filter((c): c is string => typeof c === "string") : prev.crates,
          }));
        })
        .catch(() => undefined);
    } catch {
      // storage blocked: stay a guest
    }
    return () => {
      cancelled = true;
    };
  }, []);

  // Localized station copy for one hotspot (en mirrors lib/s7/hq.ts).
  // REALMFALL RELABELS, inline until the strings pass lifts them into the
  // dict: the "tank" station is THE CLASS HALL and the workbench is THE
  // ARMORY now, and the registry + dict (outside this folder) still carry
  // the inherited tank wording.
  const spotText = useCallback(
    (spot: Hotspot) =>
      SPOT_OVERRIDE[spot.key] ?? dict.hotspots[spot.key] ?? { label: spot.label, flavor: spot.flavor },
    [dict],
  );

  // The pool line: the server's English text until a ko/zh cookie is read,
  // then the same numbers through the dict templates.
  const poolText = useMemo(() => {
    if (dict === STRINGS.en || !pool) return poolLineText;
    if (pool.empty) return fill(dict.common.preSeason, { season: DEFAULT_THEME.seasonName });
    return fill(pool.allBonded ? dict.pool.fullInPlay : dict.pool.unlockedLine, {
      unlocked: usdFmt(pool.unlockedUsd),
      full: usdFmt(pool.fullUsd),
    });
  }, [dict, pool, poolLineText]);

  // THE FRONT REACTS: one derived flag + the names the copy needs. Additive
  // state only, so nothing about the scene changes while it is false.
  const sprintOn = Boolean(sprint?.active && sprint.domains.length);
  const sprintNames = useMemo(
    () => (sprint?.domains?.length ? sprint.domains.join(" · ") : ""),
    [sprint],
  );

  // THE HUD CONSOLE STRIP: callsign + Shells/Medals + a pool pill. Rendered
  // as the on-stage overlay (.s7hq-hud, both stages under 1024px) AND as a
  // rail card beside the big desktop stage (.s7hq-railcard s7hq-railhud, the
  // >=1024px home; CSS swaps which one shows). aria-hidden because the Field
  // Report below is the accessible source of the same numbers (this is the
  // RTS-console flavor layer).
  const callsign =
    me.session || forceCommander
      ? adventurerByKey(activeCommander)?.name ?? dict.hq.hudGuest
      : dict.hq.hudGuest;
  const hudPoolShort =
    pool && !pool.empty ? (pool.allBonded ? usdFmt(pool.fullUsd) : usdFmt(pool.unlockedUsd)) : null;
  const hudLocked = Boolean(pool && !pool.empty && !pool.allBonded);
  const renderHud = (variant: "stage" | "rail" = "stage") => (
    <div className={variant === "stage" ? "s7hq-hud" : "s7hq-railcard s7hq-railhud"} aria-hidden>
      <span className="s7hq-hud-chip s7hq-hud-callsign">{callsign}</span>
      {me.session ? (
        <span className="s7hq-hud-stats">
          <span className="s7hq-hud-chip">
            <b>{me.shells.toLocaleString("en-US")}</b> {dict.hq.hudScrap}
          </span>
          <span className="s7hq-hud-chip">
            <b>{me.points.toLocaleString("en-US")}</b> {dict.hq.hudSignal}
          </span>
        </span>
      ) : (
        <span className="s7hq-hud-chip s7hq-hud-enlist">{dict.hq.hudEnlist}</span>
      )}
      {/* THE CLOCK IS REAL: seconds to the next 14:00 UTC raid resolve.
          Mounted client-only (null until the first tick), so SSR never
          renders a mismatched time. */}
      {raidCountdown ? (
        <span
          className="s7hq-hud-chip s7hq-hud-raid"
          data-testid={variant === "stage" ? "hq-raid-countdown" : undefined}
        >
          {dict.hq.hudNextRaid} <b>{raidCountdown}</b>
        </span>
      ) : null}
      {hudPoolShort ? (
        <span className={`s7hq-hud-pill${hudLocked ? " s7hq-hud-pill--warn" : ""}`}>
          {hudPoolShort} {hudLocked ? dict.hq.hudPool : dict.hq.hudInPlay}
        </span>
      ) : null}
      {/* L6: the compact paid ticker, next to the pool pill. Same visibility
          rule; green once real dollars have moved, quiet steel at $0. */}
      {pool && !pool.empty ? (
        <span
          className="s7hq-hud-chip"
          data-testid={variant === "stage" ? "hq-paid-chip" : undefined}
          style={pool.paidOutUsd > 0 ? { color: "#34d399" } : undefined}
        >
          {fill(dict.retention.paidShort, { usd: usdFmt(pool.paidOutUsd) })}
        </span>
      ) : null}
    </div>
  );

  const openSpot = useCallback(
    (spot: Hotspot) => {
      if (spot.opens.kind === "route") {
        router.push(spot.opens.href);
      } else {
        setPanel(spot.key);
      }
    },
    [router],
  );

  // A sky-plate tap or an in-scene object tap opens it directly (one tap, no
  // floating nameplate), and counts the FTUE "look around" step.
  const handleNav = useCallback(
    (spot: Hotspot) => {
      track("hotspot_tap", { ref: spot.key });
      markFtueHotspot(spot.key);
      openSpot(spot);
    },
    [openSpot],
  );

  // Sky plates without a hotspot behind them (how-to-play / enlist / board).
  const skyRoute = useCallback(
    (href: string, ref: string) => {
      track("cta_click", { ref });
      router.push(href);
    },
    [router],
  );

  // The MORE sheet: every station the sky nav does not carry.
  const openMore = useCallback(() => {
    track("cta_click", { ref: "hq-more" });
    setPanel("more");
  }, []);

  // MOBILE DOCK (round-2 prune): the same four essentials as the sky nav,
  // plus More. Enlist becomes Board once a session exists.
  const dockButtons: Array<{ label: string; icon: string; onTap: () => void }> = [
    { label: dict.hq.dockArcade, icon: "▶", onTap: () => router.push("/s7/play") },
    { label: dict.hq.dockMap, icon: "✚", onTap: () => router.push("/s7") },
    { label: dict.links.howToPlay, icon: "?", onTap: () => router.push("/s7/how-to-play") },
    me.session
      ? { label: dict.nav.board, icon: "▦", onTap: () => router.push("/s7/board") }
      : { label: dict.links.enlist, icon: "⚑", onTap: () => router.push("/s7/join") },
    { label: dict.hq.moreLabel, icon: "⋯", onTap: openMore },
  ];

  return (
    /* No nav padding here: /s7 (the only mount) already clears the fixed 52px
       nav with the raid strip above, and doubling it left a dead band under
       the strip. */
    /* <main>, not <div>: /s7 is the highest-traffic page and was the only S7
       route without a main landmark (2026-07-27 audit). The id is the skip
       link's target. */
    <main
      id="s7-content"
      /* The ground now lives on .s7-ground in the S7 layout so it runs behind
         the raid strip too; painting it again here would just double it. */
      style={{ minHeight: "100dvh", color: TEXT }}
    >
      {/* dangerouslySetInnerHTML (static local const, no user input): a plain
          <style> text child hydration-mismatches because SSR escapes the
          quotes in `content: ""`. */}
      <style dangerouslySetInnerHTML={{ __html: `${HQ_CSS}\n${WELCOME_CSS}` }} />

      <header className="s7hq-head" style={{ textAlign: "center", padding: "22px 16px 6px" }}>
        <p style={{ letterSpacing: "0.32em", fontSize: 11, color: FAINT, margin: "0 0 8px", textTransform: "uppercase", fontWeight: 700 }}>
          {DEFAULT_THEME.seasonName}
        </p>
        <h1 style={{ fontSize: "clamp(24px, 5vw, 38px)", fontWeight: 800, margin: "0 0 6px" }}>{dict.hq.title}</h1>
        <p style={{ fontSize: 13.5, color: MUTED, margin: "0 auto", maxWidth: 560, lineHeight: 1.55 }}>{dict.hq.subtitle}</p>
        <p
          data-testid="hq-what"
          style={{ fontSize: 15, color: TEXT, fontWeight: 700, margin: "12px auto 0", maxWidth: 620, lineHeight: 1.5 }}
        >
          {fill(dict.hq.whatLine, { total: `$${SEASON_MONEY_USD.toLocaleString("en-US")}` })}
        </p>
        <p style={{ fontSize: 13, color: MUTED, margin: "6px auto 0", maxWidth: 620, lineHeight: 1.5 }}>
          {dict.hq.bridgeLine}
        </p>
        <p style={{ fontSize: 12.5, color: FAINT, margin: "6px auto 0", maxWidth: 620, lineHeight: 1.5 }}>
          {dict.hq.vetLine}{" "}
          <a href="#s7-vets" style={{ color: EMBER, textDecoration: "underline", textUnderlineOffset: 2 }}>
            {dict.hq.vetLink}
          </a>
        </p>
        {/* The three steps, above the fold, as one line. Anchors into the
            LandingBand so the strip is a promise the page keeps. */}
        <p
          data-testid="hq-steps"
          style={{
            fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11.5, color: MUTED,
            margin: "12px auto 0", maxWidth: 620, letterSpacing: "0.02em",
          }}
        >
          <span style={{ color: EMBER, fontWeight: 700 }}>1</span> {dict.hq.step1}
          {"  ·  "}
          <span style={{ color: EMBER, fontWeight: 700 }}>2</span> {dict.hq.step2}
          {"  ·  "}
          <span style={{ color: EMBER, fontWeight: 700 }}>3</span>{" "}
          <a href="#s7-landing" style={{ color: MUTED, textDecoration: "underline", textUnderlineOffset: 2 }}>
            {dict.hq.step3}
          </a>
        </p>
        <p style={{ fontSize: 12.5, color: FAINT, margin: "10px auto 0", maxWidth: 560 }}>{poolText}</p>

        {/* L6 PAID TICKER: the s7_paid_ledger running total, stated as fact.
            $0 is the honest launch state and renders too (the number moving IS
            the trust mechanic); hidden only pre-season, when there are no pool
            numbers at all. At >=1024px it moves into the rail beside the
            stage (CSS hides this copy). */}
        {pool && !pool.empty ? (
          <p className="s7hq-headtick" style={{ margin: "10px auto 0" }}>
            <span
              data-testid="hq-paid-ticker"
              style={{
                display: "inline-flex",
                alignItems: "center",
                fontFamily: "ui-monospace, Menlo, monospace",
                fontSize: 11.5,
                fontWeight: 700,
                letterSpacing: "0.06em",
                color: pool.paidOutUsd > 0 ? "#34d399" : MUTED,
                border: `1px solid ${pool.paidOutUsd > 0 ? "#34d39955" : BORDER}`,
                borderRadius: 999,
                padding: "5px 13px",
              }}
            >
              {fill(dict.retention.paidTicker, { usd: usdFmt(pool.paidOutUsd) })}
            </span>
          </p>
        ) : null}

        {/* THE FRONT REACTS: the klaxon line. One line, named wall, no promise. */}
        {sprintOn ? (
          <p className="s7hq-sprint" role="status" aria-label={dict.sprint.aria} data-testid="hq-sprint">
            <span className="s7hq-sprint-tag" aria-hidden>
              {dict.sprint.tag}
            </span>
            <span className="s7hq-sprint-text">{fill(dict.sprint.hqLine, { domain: sprintNames })}</span>
          </p>
        ) : null}

        {/* Round-2 prune: the old three-link action row is gone. HOW TO PLAY
            and ENLIST now hang in the scene itself (SceneObjects) and on the mobile
            dock; Rules rides the fixed top nav and the More sheet. */}
      </header>

      {/* ── DESKTOP: the painted camp stage (+ the >=1024px side rail) ── */}
      <div className="s7hq-desktop">
        <div className="s7hq-shell">
          {/* THE LEFT RAIL (>=1400px): a wide desktop was leaving ~235px of dead
              black down each side while eight stations sat hidden behind the
              More sheet. Above 1400px there is room to simply show them. Same
              hotspots, same localized labels, same handler as the sheet, so
              nothing here can drift from it. */}
          <aside className="s7hq-lrail" aria-label={dict.hq.moreTitle}>
            <div className="s7hq-railcard">
              <p className="s7hq-lrail-title">{dict.hq.moreTitle}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {LRAIL_KEYS.map((k) => {
                  const spot = HOTSPOT_BY_KEY[k];
                  if (!spot) return null;
                  const t = dict.hotspots[k] ?? { label: spot.label, flavor: spot.flavor };
                  return (
                    <button
                      key={k}
                      className="s7hq-morerow"
                      data-testid={`lrail-${k}`}
                      onClick={() => handleNav(spot)}
                    >
                      <span className="s7hq-morerow-lbl">{t.label}</span>
                      <span className="s7hq-morerow-flavor">{t.flavor}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <div
            className={`s7hq-stage${sprintOn ? " s7hq-stage--sprint" : ""}`}
            role="group"
            aria-label={dict.hq.stageAria}
          >
            <CampBackdrop
              dict={dict}
              sprint={sprintOn}
              plate={campPlate.plate}
              loop={campPlate.loop}
              phase={dayPhase}
            />
            {renderHud()}
            <div className="s7hq-frameline" aria-hidden />
            <SceneObjects
              spotText={spotText}
              dict={dict}
              onNav={handleNav}
              onRoute={skyRoute}
              onMore={openMore}
              sprintOn={sprintOn}
            />
            <SceneCommander
              ck={activeCommander}
              label={spotText(HOTSPOT_BY_KEY.adventurer).label}
              onOpen={() => handleNav(HOTSPOT_BY_KEY.adventurer)}
            />
            <CommanderSays dict={dict} guest={!me.session} raidSoon={raidSoon} />
          </div>

          {/* THE RAIL (>=1024px only): the big-screen gutters carry the HUD
              strip, the Daily Orders card and the paid ticker beside the
              stage instead of stacking under it. */}
          <aside className="s7hq-rail">
            {renderHud("rail")}
            {!me.session ? (
              <Link
                href="/s7/join"
                className="s7hq-joincta"
                data-testid="hq-join-cta"
                onClick={() => track("cta_click", { ref: "rail-join" })}
              >
                <span className="s7hq-joincta-main">{dict.hq.joinCtaMain}</span>
                <span className="s7hq-joincta-sub">{dict.hq.joinCtaSub}</span>
              </Link>
            ) : null}
            {!me.session ? (
              <Link
                href="/s7/play"
                className="s7hq-playcta"
                data-testid="hq-play-cta"
                onClick={() => track("cta_click", { ref: "rail-play" })}
              >
                <span className="s7hq-playcta-main">{dict.hq.playCtaMain}</span>
                <span className="s7hq-playcta-sub">{dict.hq.playCtaSub}</span>
              </Link>
            ) : null}
            <DailyOrders me={me} dict={dict} />
            {pool && !pool.empty ? (
              <div className="s7hq-railcard" data-testid="hq-paid-rail">
                <span
                  style={{
                    fontFamily: "ui-monospace, Menlo, monospace",
                    fontSize: 11.5,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    color: pool.paidOutUsd > 0 ? "#34d399" : MUTED,
                  }}
                >
                  {fill(dict.retention.paidTicker, { usd: usdFmt(pool.paidOutUsd) })}
                </span>
              </div>
            ) : null}
          </aside>
        </div>

        {/* The shelf itself is a station ON the plate (right, under the
            corkboard); the cards live below the picture so nothing floats
            over the painted sky. */}
        <div style={{ maxWidth: 980, margin: "12px auto 0", padding: "0 16px" }}>
          <TrophyShelf trophies={trophies} dict={dict} compact />
        </div>
        <LandingBand dict={dict} session={!!me.session} />
      </div>

      {/* ── FIELD REPORT: the stats + payout board (both layouts) ── */}
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "18px 16px 6px" }}>
        <StatsBoard
          dict={dict}
          session={me.session}
          token={me.token}
          payout={board}
          points={me.points}
          shells={me.shells}
          streakDays={me.streakDays}
          sprintNames={sprintOn ? sprintNames : ""}
          warEffort={warEffort}
          enlistedBy={enlistedBy}
        />
      </div>

      {/* ── MOBILE: stacked bands + the bottom dock ── */}
      <div className="s7hq-mobile">
        <section className="s7hq-band">
          <TrophyShelf trophies={trophies} dict={dict} compact />
        </section>
        <section className="s7hq-band" style={{ paddingTop: 18, paddingBottom: 18 }}>
          {/* The rig band is framed INTENTIONALLY (garage-card grammar):
              border + radius + the faint card wash, so the cutout reads as a
              presented exhibit, not art floating on the page background. */}
          <div className="s7hq-rigframe">
            <ClassRig tank={bayTank} dict={dict} cls={sceneCls} />
          </div>
        </section>
        <section className="s7hq-band s7hq-band--stage">
          <div
            className={`s7hq-mstage${sprintOn ? " s7hq-stage--sprint" : ""}`}
            role="group"
            aria-label={dict.hq.stageAria}
          >
            <CampBackdrop
              dict={dict}
              sprint={sprintOn}
              plate={campPlate.plate}
              loop={campPlate.loop}
              phase={dayPhase}
            />
            {renderHud()}
            <div className="s7hq-frameline" aria-hidden />
            <SceneObjects
              spotText={spotText}
              dict={dict}
              onNav={handleNav}
              onRoute={skyRoute}
              onMore={openMore}
              sprintOn={sprintOn}
            />
            <SceneCommander
              ck={activeCommander}
              label={spotText(HOTSPOT_BY_KEY.adventurer).label}
              onOpen={() => handleNav(HOTSPOT_BY_KEY.adventurer)}
            />
            <CommanderSays dict={dict} guest={!me.session} raidSoon={raidSoon} />
          </div>
        </section>
        {/* THE EXPLAINER ON PHONES (2026-07-27 audit finding F1): LandingBand
            used to live ONLY inside .s7hq-desktop, which is display:none below
            760px, so a phone visitor got the painting and no explanation of
            what this is, how it works, or the $5. Same component, second
            placement: it is layout-agnostic and reads its own strings. */}
        <section className="s7hq-band" style={{ paddingTop: 4 }}>
          <LandingBand dict={dict} session={!!me.session} />
        </section>
        <div style={{ height: 84 }} />
        <nav className="s7hq-dock" aria-label={dict.hq.dockAria}>
          {dockButtons.map((b) => (
            <button key={b.label} className="s7hq-dockbtn" onClick={b.onTap} aria-label={b.label}>
              <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>{b.icon}</span>
              <span style={{ fontSize: 11, letterSpacing: "0.04em" }}>{b.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* ── PANEL OVERLAY ── */}
      {panel ? (
        <div
          className="s7hq-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="s7hq-panel-title"
          onClick={() => setPanel(null)}
        >
          <div
            ref={panelRef}
            className={`s7hq-panel${panel === "tank" ? " s7hq-panel--wide" : ""}`}
            onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
          >
            <PanelBody
              panel={panel}
              dict={dict}
              me={me}
              patchMe={patchMe}
              trophies={trophies}
              targets={targets}
              onNavigate={setPanel}
              onHotspot={handleNav}
            />
            <button className="s7hq-open" style={{ marginTop: 16 }} onClick={() => setPanel(null)}>
              {dict.common.back}
            </button>
          </div>
        </div>
      ) : null}

      {/* ── FIRST ARRIVAL: the welcome (guests, once, dismissible) ── */}
      {welcome ? <WelcomeModal dict={dict} onClose={() => setWelcome(false)} /> : null}
    </main>
  );
}

function PanelBody({
  panel,
  dict,
  me,
  patchMe,
  trophies,
  targets,
  onNavigate,
  onHotspot,
}: {
  panel: PanelKey;
  dict: S7Dict;
  me: HqMe;
  patchMe: (patch: Partial<HqMe>) => void;
  trophies: TrophiesView | null;
  targets: TargetLink[];
  onNavigate: (panel: PanelKey) => void;
  /** More-sheet rows route through the SAME nav path as a sky plate (beacon +
   * FTUE credit + route-or-panel), so a row tap swaps the sheet for the
   * station it names. */
  onHotspot: (spot: Hotspot) => void;
}) {
  const H = ({ children }: { children: React.ReactNode }) => (
    // Same id as panels.tsx PanelH: the overlay's aria-labelledby target. The
    // More sheet and the station panels use different heading components, so
    // BOTH must carry it or the dialog loses its accessible name.
    <h2 id="s7hq-panel-title" style={{ fontSize: 17, fontWeight: 800, margin: "0 0 10px", color: TEXT }}>
      {children}
    </h2>
  );
  const P = ({ children }: { children: React.ReactNode }) => (
    <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, margin: "0 0 10px" }}>{children}</p>
  );
  const learn = (key: EducationKey) => {
    const e = dict.education[key];
    return e ? (
      <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderRadius: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: STEEL, marginBottom: 4 }}>{e.title}</div>
        <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>{e.body}</div>
      </div>
    ) : null;
  };
  const openWizard = () => onNavigate("wizard");

  switch (panel) {
    case "tank":
      // REALMFALL: the "tank" station key survives (hotspot registry + deep
      // links), but the panel behind it is THE CLASS HALL.
      return <ClassHallPanel me={me} patchMe={patchMe} onOpenWizard={openWizard} dict={dict} />;
    case "adventurer":
      return <CommanderPanel me={me} patchMe={patchMe} dict={dict} />;
    case "workbench":
      // REALMFALL: the workbench station is THE ARMORY (gear tiers, Gold).
      return <ArmoryPanel me={me} patchMe={patchMe} dict={dict} />;
    case "footlocker":
    case "quests":
      return <FootlockerPanel me={me} patchMe={patchMe} onOpenWizard={openWizard} targets={targets} dict={dict} />;
    case "wizard":
      return <FundingWizardPanel me={me} targets={targets} dict={dict} />;
    case "radio":
      return (
        <div>
          <H>{dict.hotspots.radio.label}</H>
          <P>{dict.hq.radioBody}</P>
          {learn("breach-pays")}
          <button
            className="s7hq-open"
            data-testid="radio-get-armed"
            onClick={() => {
              track("cta_click", { ref: "radio-get-armed" });
              openWizard();
            }}
          >
            {dict.hq.radioCta}
          </button>
        </div>
      );
    case "bookshelf":
      return (
        <div>
          <H>{dict.hotspots.bookshelf.label}</H>
          {EDUCATION.map((e) => (
            <div key={e.key} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: STEEL, marginBottom: 3 }}>
                {dict.education[e.key].title}
              </div>
              <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>{dict.education[e.key].body}</div>
            </div>
          ))}
        </div>
      );
    case "trophyshelf":
      return (
        <div>
          <H>{dict.hotspots.trophyshelf.label}</H>
          <TrophyShelf trophies={trophies} dict={dict} />
        </div>
      );
    case "more": {
      // Every station the sky nav does not carry (round-2 de-clutter):
      // nothing was deleted, it all lives here in one quiet list.
      const MORE_KEYS = LRAIL_KEYS;
      return (
        <div data-testid="more-sheet">
          <H>{dict.hq.moreTitle}</H>
          <P>{dict.hq.moreBody}</P>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {MORE_KEYS.map((k) => {
              const spot = HOTSPOT_BY_KEY[k];
              if (!spot) return null;
              const t = dict.hotspots[k] ?? { label: spot.label, flavor: spot.flavor };
              return (
                <button
                  key={k}
                  className="s7hq-morerow"
                  data-testid={`more-${k}`}
                  onClick={() => onHotspot(spot)}
                >
                  <span className="s7hq-morerow-lbl">{t.label}</span>
                  <span className="s7hq-morerow-flavor">{t.flavor}</span>
                </button>
              );
            })}
            <Link href="/s7/rules" className="s7hq-morerow" data-testid="more-rules">
              <span className="s7hq-morerow-lbl">{dict.hq.rulesCta}</span>
            </Link>
          </div>
        </div>
      );
    }
    default:
      return (
        <div>
          <H>HQ</H>
          <P>{dict.common.soon}</P>
        </div>
      );
  }
}

const HQ_CSS = `
.s7hq-desktop { display: none; }
.s7hq-mobile { display: block; }
@media (min-width: 760px) {
  .s7hq-desktop { display: block; }
  .s7hq-mobile { display: none; }
}
/* ── THE STAGE = THE PLATE ──
   Both stages carry camp-portrait.webp at its OWN 3:4 aspect, so the whole
   painting is on screen; the in-scene hit-regions (.s7hq-obj--*) below are
   percentages of this box, i.e. coordinates on the picture. */
.s7hq-stage {
  position: relative;
  width: min(94vw, 460px);
  aspect-ratio: 3 / 4;
  margin: 14px auto 20px;
  border-radius: 16px;
  border: 1px solid ${BORDER};
  overflow: hidden;
  box-shadow: 0 26px 70px rgba(0,0,0,0.5);
}
/* ── DESKTOP SCALE (round-2 review: 460px was too small on a monitor) ──
   The shell centers the stage; from 1024px the stage grows to min(52vw,
   720px) and the freed gutters carry the RAIL (HUD strip + Daily Orders +
   paid ticker) beside it instead of stacking everything under the picture. */
.s7hq-shell {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  gap: 24px;
  padding: 0 16px;
}
/* 760-1023px was the hole: the desktop stage starts at 760px but the side
   rail only at 1024px, and the phone dock stops at 760px. With the sky
   ENLIST plate gone (2026-07-28) that band had NO join or play door at all,
   so the rail stacks UNDER the stage here instead of vanishing. */
.s7hq-rail { display: none; }
@media (min-width: 760px) and (max-width: 1023.98px) {
  .s7hq-shell { flex-wrap: wrap; }
  .s7hq-rail {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1 1 100%;
    width: 100%;
    max-width: 560px;
    margin: 14px auto 0;
  }
}
.s7hq-railcard {
  border: 1px solid ${BORDER};
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(24,29,35,0.97), rgba(15,18,22,0.97));
  padding: 12px 14px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.3);
}
.s7hq-joincta {
  display: block;
  text-align: center;
  text-decoration: none;
  border-radius: 12px;
  padding: 14px 16px;
  background: linear-gradient(180deg, ${EMBER} 0%, #b8481a 100%);
  border: 1px solid ${EMBER};
  box-shadow: 0 10px 26px rgba(224,102,46,0.28);
}
.s7hq-joincta:hover { filter: brightness(1.07); }
.s7hq-playcta {
  display: block; text-align: center; text-decoration: none; border-radius: 12px;
  padding: 11px 16px; background: rgba(154,167,180,0.10);
  border: 1px solid rgba(154,167,180,0.34);
}
.s7hq-playcta:hover { background: rgba(154,167,180,0.16); }
.s7hq-playcta:focus-visible { outline: 2px solid ${EMBER}; outline-offset: 3px; }
.s7hq-playcta-main { display: block; color: ${TEXT}; font-weight: 800; font-size: 14.5px; }
.s7hq-playcta-sub { display: block; color: ${MUTED}; font-size: 11.5px; font-weight: 600; margin-top: 2px; }
.s7lb-vets {
  margin: 18px 0 4px; padding: 14px 16px; border-radius: 12px;
  border: 1px solid rgba(154,167,180,0.22); background: rgba(255,255,255,0.03);
  scroll-margin-top: 90px;
}
.s7lb-vets-h {
  margin: 0 0 8px; font-family: ui-monospace, Menlo, monospace; font-size: 10.5px;
  letter-spacing: 0.14em; text-transform: uppercase; color: ${EMBER}; font-weight: 700;
}
.s7lb-vets-list { margin: 0; padding-left: 18px; display: grid; gap: 6px; }
.s7lb-vets-list li { font-size: 13px; color: ${MUTED}; line-height: 1.55; }
.s7hq-joincta:focus-visible { outline: 2px solid #fff6ee; outline-offset: 3px; }
.s7hq-joincta-main {
  display: block; color: #14100c; font-weight: 900; font-size: 17px; letter-spacing: 0.01em;
}
.s7hq-joincta-sub {
  display: block; color: rgba(20,16,12,0.78); font-size: 12px; font-weight: 700; margin-top: 3px;
}
.s7hq-railhud { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.s7hq-railhud .s7hq-hud-pill { margin-left: 0; }
@media (min-width: 1024px) {
  /* MEASURED, then fixed (2026-07-28). NOTE: no backticks in this comment --
     this CSS lives inside a JS template literal and a backtick ends the
     string (ADR-0083's lesson, hit a third time writing this very rule).
     The old rule was width: min(52vw, 720px, 70vh) with a claim it kept the whole
     painting above the fold at ~513x684. It did not: 70vh bounds the WIDTH of
     a 3:4 box, so at 1440x900 the stage became 630 WIDE and therefore 840
     TALL, running 340 -> 1180 against a 900 fold. A third of the hero was
     simply off-screen on a standard laptop.
     Bound the HEIGHT instead and let width follow the aspect. MEASURED RESULT
     at 1440x900: 519x692 starting at y=320, so ~84% of the painting is above
     the fold instead of 67%. It is NOT fully above the fold and cannot be: a
     3:4 portrait hero in a 16:9 viewport is either small or slightly cropped,
     and a shallow crop reads as intentional and invites the scroll. The real
     fix is a landscape hero, which needs camp.webp AND re-placed hotspots --
     the two camp paintings were compared pixel-wise and are DIFFERENT
     compositions (mean diff 37/255), so the coordinates cannot just be
     remapped. Left for a session that can see the image.
     The --s7-chrome var is the nav + title block above the stage. */
  .s7hq-head { padding-top: 10px !important; padding-bottom: 2px !important; }
  .s7hq-head h1 { margin-bottom: 2px !important; }
  .s7hq-stage {
    --s7-chrome: 208px;
    height: min(calc(100vh - var(--s7-chrome)), 760px);
    width: auto;
    max-width: min(52vw, 720px);
    margin-left: 0;
    margin-right: 0;
  }
  .s7hq-rail {
    display: flex;
    flex-direction: column;
    gap: 14px;
    flex: 0 0 320px;
    width: 320px;
    margin-top: 14px;
  }
  /* The HUD strip leaves the painting for the rail, and the header's paid
     ticker moves into the rail card, so the big stage stays uncluttered. */
  .s7hq-desktop .s7hq-hud { display: none; }
  .s7hq-headtick { display: none; }
}
/* The phone stage runs edge to edge: every pixel of width goes to the
   painting. */
.s7hq-mobile .s7hq-band--stage { padding-left: 0; padding-right: 0; }
.s7hq-mstage {
  position: relative;
  /* Edge to edge on a real phone, but CAPPED BY HEIGHT on a short viewport.
     A 3:4 painting at width:100% is 1.33x as tall as it is wide, so on a
     wide-but-short window (a laptop at high browser zoom trips this
     breakpoint) it rendered 700x933 against a 340px-tall viewport: 2.75x
     taller than the screen, which reads as a broken zoomed-in image rather
     than a scene. Width 54vh is exactly the 72vh height cap through the 3:4
     ratio. On a 390x844 phone 54vh is 456px, wider than the screen, so the
     min() keeps 100% and phones are untouched. */
  width: min(100%, 54vh);
  margin-inline: auto;
  aspect-ratio: 3 / 4;
  border-top: 1px solid ${BORDER};
  border-bottom: 1px solid ${BORDER};
  overflow: hidden;
  box-shadow: 0 16px 40px rgba(0,0,0,0.45);
}
/* The gradient bunker survives as the fallback when the plate 404s. */
.s7hq-bg {
  position: absolute; inset: 0;
  background:
    radial-gradient(120% 70% at 50% 0%, #232a32 0%, rgba(35,42,50,0) 55%),
    linear-gradient(180deg, #171c22 0%, #101318 52%, #0b0d10 100%);
}
.s7hq-plateart {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  object-fit: cover;
  object-position: 50% 50%;
  display: block;
}
/* Warm key light: the lit lamp post at the left edge and the lanterns strung
   under the bay roof. Screen blend keeps the paint underneath. */
.s7hq-lamp {
  position: absolute; inset: 0;
  pointer-events: none;
  mix-blend-mode: screen;
  background:
    radial-gradient(16% 22% at 5.5% 28%, rgba(255,186,92,0.34) 0%, rgba(255,186,92,0) 70%),
    radial-gradient(9% 13% at 29% 38%, rgba(255,178,86,0.20) 0%, rgba(255,178,86,0) 72%),
    radial-gradient(26% 16% at 52% 49%, rgba(255,170,84,0.13) 0%, rgba(255,170,84,0) 76%);
}
@media (prefers-reduced-motion: no-preference) {
  .s7hq-lamp { animation: s7hq-lantern 7s ease-in-out infinite; }
}
@keyframes s7hq-lantern {
  0%, 100% { opacity: 0.86; }
  50% { opacity: 1; }
}
/* Vignette: pushes the eye into the bay. */
.s7hq-vig {
  position: absolute; inset: 0;
  pointer-events: none;
  background: radial-gradient(78% 72% at 50% 52%, rgba(0,0,0,0) 42%, rgba(0,0,0,0.34) 78%, rgba(0,0,0,0.6) 100%);
}
/* Text scrim: the nameplate and the tank caption sit on the mud, so the mud
   gets darker toward the bottom and every label keeps its contrast. */
.s7hq-scrim {
  position: absolute; left: 0; right: 0; bottom: 0; height: 46%;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(9,11,14,0) 0%, rgba(9,11,14,0.42) 62%, rgba(9,11,14,0.72) 100%);
}
.s7hq-bg--fallback .s7hq-lamp { display: none; }

/* ââ TANK ART (the mobile band's rig + the shared silhouette fallback) ââ */
.s7hq-tankart { position: relative; width: 100%; aspect-ratio: 900 / 603; }
.s7hq-tankimg {
  position: relative;
  display: block;
  width: 100%; height: 100%;
  object-fit: contain; object-position: bottom center;
  filter: drop-shadow(0 8px 14px rgba(0,0,0,0.45));
}
/* Contact shadow. The plate has NO shadow under the bay by design, so this
   ellipse is what puts the tracks on the ground. */
.s7hq-tankshadow {
  position: absolute;
  left: 50%; bottom: -3%;
  transform: translateX(-50%);
  width: 96%; height: 20%;
  border-radius: 50%;
  background: radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.34) 46%, rgba(0,0,0,0) 74%);
  filter: blur(5px);
}
.s7hq-sil { position: absolute; inset: 0; }
.s7hq-sil-hull {
  position: absolute; left: 5%; right: 5%; top: 46%; bottom: 15%;
  border-radius: 10px 16px 6px 6px;
  background: linear-gradient(160deg, #39434d 0%, #232a32 55%, #14181d 100%);
  border: 1px solid ${STEEL}44;
  box-shadow: 0 18px 40px rgba(0,0,0,0.5), inset 0 1px 0 ${STEEL}33;
}
.s7hq-sil-turret {
  position: absolute; left: 34%; width: 34%; top: 25%; height: 23%;
  border-radius: 10px;
  background: linear-gradient(160deg, #434e59 0%, #232a32 80%);
  border: 1px solid ${STEEL}33;
}
.s7hq-sil-barrel {
  position: absolute; left: 7%; width: 30%; top: 32%; height: 4%;
  border-radius: 4px;
  background: #39434d;
}
.s7hq-sil-tracks {
  position: absolute; left: 2%; right: 2%; bottom: 7%; height: 15%;
  border-radius: 14px;
  background: linear-gradient(180deg, #1b2026 0%, #0e1114 100%);
  border: 1px solid #2c343d;
}
/* Tier / name / camo, on a chip so it reads over wet mud. */
.s7hq-rig { display: flex; flex-direction: column; align-items: center; }
.s7hq-tankplate {
  text-align: center;
  /* Scales with the stage: a fixed-px chip grows relative to a narrow stage
     and starts eating the stations around it. */
  padding: clamp(5px, 0.9vw, 8px) clamp(10px, 1.8vw, 16px);
  margin-top: 12px;
  border-radius: 10px;
  background: rgba(9,11,14,0.62);
  border: 1px solid rgba(255,255,255,0.05);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  pointer-events: none;
}
.s7hq-tankplate-tier {
  font-family: ui-monospace, Menlo, monospace;
  font-size: clamp(9px, 1.2vw, 10.5px); letter-spacing: 0.22em;
  text-transform: uppercase; color: ${FAINT};
}
.s7hq-tankplate-name { font-size: clamp(13px, 1.9vw, 17px); font-weight: 800; color: ${TEXT}; }
.s7hq-tankplate-camo { font-size: clamp(9.5px, 1.25vw, 11px); color: ${FAINT}; text-transform: capitalize; }
.s7hq-band { padding: 14px 16px; }
.s7hq-mobile .s7hq-tankart { width: min(78vw, 340px); margin: 0 auto; }
.s7hq-open {
  margin-top: 10px;
  padding: 9px 16px;
  border-radius: 8px;
  border: 1px solid ${STEEL}55;
  background: ${STEEL}1f;
  color: ${TEXT};
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}
.s7hq-dock {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  z-index: 900;
  display: flex;
  justify-content: space-around;
  gap: 4px;
  padding: 8px 6px calc(8px + env(safe-area-inset-bottom, 0px));
  background: rgba(11,13,16,0.92);
  backdrop-filter: blur(10px);
  border-top: 1px solid ${BORDER};
}
.s7hq-dockbtn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 48px;
  min-height: 44px;
  padding: 5px 6px;
  border-radius: 9px;
  border: 1px solid transparent;
  background: transparent;
  color: ${MUTED};
  cursor: pointer;
}
.s7hq-dockbtn:active { border-color: ${STEEL}55; color: ${TEXT}; }
.s7hq-overlay {
  position: fixed; inset: 0;
  z-index: 1100;
  background: rgba(7,9,11,0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
}
.s7hq-panel {
  width: min(94vw, 520px);
  max-height: 82dvh;
  overflow-y: auto;
  background: ${PANEL_BG};
  border: 1px solid ${BORDER};
  border-radius: 14px;
  padding: 20px 22px;
}
.s7hq-panel--wide {
  width: min(96vw, 640px);
}

/* ââ FIELD REPORT (StatsBoard.tsx): the stats + payout dossier ââ */
.s7fr {
  background: linear-gradient(180deg, rgba(24,29,35,0.97), rgba(15,18,22,0.97));
  border: 1px solid ${BORDER};
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 14px 40px rgba(0,0,0,0.35);
}
.s7fr-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid ${BORDER};
  background:
    repeating-linear-gradient(-45deg, transparent 0 14px, ${EMBER}12 14px 16px),
    rgba(10,12,15,0.6);
}
.s7fr-title {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 12px; font-weight: 800;
  letter-spacing: 0.34em; text-transform: uppercase;
  color: ${EMBER};
}
.s7fr-counters { display: flex; gap: 14px; font-size: 12.5px; color: ${MUTED}; font-weight: 700; }
.s7fr-guest { padding: 22px 18px; font-size: 13px; color: ${MUTED}; line-height: 1.6; margin: 0; }
.s7fr-grid { display: grid; grid-template-columns: 1fr; }
@media (min-width: 760px) { .s7fr-grid { grid-template-columns: 1fr 1fr 1.15fr; } }
.s7fr-cell { padding: 16px 18px; border-top: 1px solid ${BORDER}; }
@media (min-width: 760px) {
  .s7fr-cell { border-top: 0; }
  .s7fr-cell + .s7fr-cell { border-left: 1px solid ${BORDER}; }
}
.s7fr-h {
  margin: 0 0 10px;
  font-size: 10.5px; font-weight: 800;
  letter-spacing: 0.26em; text-transform: uppercase;
  color: ${FAINT};
}
.s7fr-tankname { margin: 0 0 10px; font-size: 15.5px; font-weight: 800; color: ${TEXT}; }
.s7fr-tier { font-size: 11.5px; font-weight: 700; color: ${STEEL}; }
.s7fr-rating { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
.s7fr-rating-name { width: 72px; font-size: 11px; color: ${MUTED}; }
.s7fr-rating-track {
  flex: 1; height: 6px; border-radius: 3px;
  background: rgba(255,255,255,0.06);
  overflow: hidden;
}
.s7fr-rating-fill {
  display: block; height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, ${STEEL}, ${EMBER});
}
.s7fr-rating-num { width: 18px; text-align: right; font-size: 11px; color: ${FAINT}; font-variant-numeric: tabular-nums; }
.s7fr-stat { display: flex; align-items: center; gap: 8px; margin: 7px 0; }
.s7fr-stat-ico { width: 18px; text-align: center; font-size: 13px; }
.s7fr-stat-name { width: 64px; font-size: 11.5px; color: ${MUTED}; }
.s7fr-pips { display: flex; gap: 4px; }
.s7fr-pip {
  width: 16px; height: 8px;
  border-radius: 2px;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.05);
}
.s7fr-pip--on {
  background: linear-gradient(180deg, ${EMBER}, #a34413);
  border-color: ${EMBER};
  box-shadow: 0 0 6px ${EMBER}55;
}
.s7fr-cell--pay { background: rgba(9,11,14,0.45); }
.s7fr-est {
  margin: 0;
  font-family: ui-monospace, Menlo, monospace;
  font-size: clamp(26px, 4vw, 34px);
  font-weight: 800;
  color: ${TEXT};
  font-variant-numeric: tabular-nums;
}
.s7fr-estlabel { margin: 2px 0 0; font-size: 11.5px; color: ${MUTED}; }
.s7fr-share { margin: 8px 0 0; font-size: 12px; font-weight: 700; color: ${STEEL}; }
.s7fr-disclaimer { margin: 10px 0 0; font-size: 10.5px; color: ${FAINT}; line-height: 1.5; }
.s7fr-warn {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 12px 18px;
  border-top: 1px solid #6b4a1433;
  background: linear-gradient(90deg, rgba(224,102,46,0.14), rgba(224,102,46,0.05));
}
.s7fr-warn-ico { font-size: 16px; }
.s7fr-warn-text { flex: 1 1 260px; font-size: 12.5px; color: ${TEXT}; line-height: 1.5; }
.s7fr-warn-text strong { color: ${EMBER}; font-variant-numeric: tabular-nums; }
.s7fr-warn-names { color: ${MUTED}; }
.s7fr-warn-cta {
  flex: 0 0 auto;
  padding: 8px 14px;
  border-radius: 9px;
  background: ${EMBER};
  color: #14100c;
  font-size: 12.5px; font-weight: 800;
  text-decoration: none;
}
.s7fr-warn-cta:active { transform: translateY(1px); }

/* ââ THE FRONT REACTS: the siege-sprint state ââ
   Additive and restrained: a warning wash over the camp, a klaxon accent on
   the map table, and one line under the pool line. Every motion is gated on
   prefers-reduced-motion; with motion off the same states read as a static
   tint and a static ring, so nothing is communicated by animation alone. */
.s7hq-sprint {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: center;
  gap: 6px 9px;
  max-width: 620px;
  margin: 12px auto 0;
  padding: 8px 14px;
  border: 1px solid ${EMBER}55;
  border-radius: 10px;
  background: linear-gradient(90deg, ${EMBER}1f, rgba(18,22,27,0.55) 55%, ${EMBER}14);
  text-align: left;
}
.s7hq-sprint-tag {
  flex: 0 0 auto;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: ${EMBER};
  white-space: nowrap;
}
.s7hq-sprint-text { flex: 1 1 240px; font-size: 12px; color: ${TEXT}; line-height: 1.55; }
@media (prefers-reduced-motion: no-preference) {
  .s7hq-sprint-tag { animation: s7hq-klaxon 2.2s ease-in-out infinite; }
}
@keyframes s7hq-klaxon {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
/* The camp itself: a warning wash on the frame, never over the painting's
   readability (the border and a soft inner glow only). */
.s7hq-stage--sprint { border-color: ${EMBER}66; }
.s7hq-stage--sprint::before {
  content: "";
  position: absolute; inset: 0;
  pointer-events: none;
  z-index: 3;
  box-shadow: inset 0 0 70px ${EMBER}26;
  background: linear-gradient(180deg, ${EMBER}12 0%, rgba(0,0,0,0) 34%);
}
/* The Field Report strip (same steel plate grammar as .s7fr-warn). */
.s7fr-sprint {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 12px 18px;
  border-top: 1px solid ${EMBER}33;
  background: linear-gradient(90deg, ${EMBER}1c, rgba(224,102,46,0.05));
}
.s7fr-sprint-ico { font-size: 16px; }
.s7fr-sprint-text { flex: 1 1 260px; font-size: 12.5px; color: ${TEXT}; line-height: 1.5; }
.s7fr-sprint-text strong { color: ${EMBER}; }
.s7fr-sprint-note { color: ${MUTED}; }
.s7fr-sprint-cta {
  flex: 0 0 auto;
  padding: 8px 14px;
  border-radius: 9px;
  border: 1px solid ${EMBER}88;
  background: ${EMBER}26;
  color: ${TEXT};
  font-size: 12.5px; font-weight: 800;
  text-decoration: none;
}
.s7fr-sprint-cta:active { transform: translateY(1px); }

/* ââ LIVING HQ (2026-07-24) ââ
   The camp is alive: the whole-scene video LOOP over the plate (the weather
   CANVAS carries rain / smoke / embers / fog when no loop ships), a HUD
   console strip and a command frame. Every motion rule below is gated on
   prefers-reduced-motion, so a reduced-motion visitor sees a still, framed
   scene: no loop autoplay drift, no pulses. */

/* The plate + its living loop share one wrapper so parallax moves them as a
   single background plane. The loop sits over the plate with the plate as its
   own poster, so an absent/failed clip degrades to the painted still. */
.s7hq-plate-wrap { position: absolute; inset: 0; }
.s7hq-video {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  object-fit: cover; object-position: 50% 50%;
  display: block;
}
/* The weather sits above the plate but BELOW the vignette/scrim (DOM order),
   so rain and smoke read over the paint while the frame keeps labels legible. */
.s7hq-canvas {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  pointer-events: none;
}
/* When the video loop replaces the particle canvas, the siege-sprint warning
   still needs to read on the camp: a thin alarm-red wash that slowly pulses.
   Reduced-motion holds it steady. */
.s7hq-sprinttint {
  position: absolute; inset: 0;
  pointer-events: none;
  background:
    radial-gradient(120% 80% at 50% 100%, rgba(220,60,40,0.20), rgba(220,60,40,0) 60%),
    radial-gradient(80% 60% at 20% 80%, rgba(255,110,54,0.16), rgba(255,110,54,0) 70%);
  mix-blend-mode: screen;
  animation: s7hq-sprintpulse 3.2s ease-in-out infinite;
}

@keyframes s7hq-sprintpulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .s7hq-sprinttint { animation: none; opacity: 0.8; }
}

/* ââ PER-TANK PLATE CROSSFADE: the incoming painting fades in over the
   outgoing one (250ms), so the guest Panther melting into the picked tank
   reads as a scene change, never a flash. Reduced motion swaps instantly. ââ */
@media (prefers-reduced-motion: no-preference) {
  .s7hq-plateart--fade { animation: s7hq-platefade 250ms ease-out both; }
}
@keyframes s7hq-platefade {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ââ UTC DAY-PHASE: the camp follows the real clock. SSR renders the bare
   .s7hq-phase (opacity 0 = fully neutral); the client stamps day / dusk /
   night. Night is a ~10% cool-blue multiply wash and the lanterns work a
   little harder; dusk is a whisper of extra warmth; day stays neutral (the
   painting is already a dusk scene, so "day" simply means no wash). ââ */
.s7hq-phase {
  position: absolute; inset: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity 1.2s ease;
  mix-blend-mode: multiply;
}
.s7hq-phase--night { opacity: 1; background: rgba(62,92,158,0.10); }
.s7hq-phase--dusk { opacity: 1; background: rgba(224,140,70,0.05); }
.s7hq-phase--night ~ .s7hq-lamp { filter: brightness(1.18); }

/* ââ THE COMMANDER CHIP: the picked commander idles on the scrim corner of
   BOTH stages (HUD grammar: hairline border, blur, rounded), a real button
   that opens the commander panel. ââ */
.s7hq-hudcmdr {
  position: absolute; right: 10px; bottom: 10px;
  z-index: 6;
  width: 92px; height: 120px;
  padding: 0;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.08);
  background: linear-gradient(180deg, rgba(10,13,17,0.7), rgba(10,13,17,0.46));
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 12px rgba(0,0,0,0.4);
  backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
  overflow: hidden;
  cursor: pointer;
  transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease;
}
.s7hq-hudcmdr:hover, .s7hq-hudcmdr:focus-visible {
  outline: none;
  border-color: ${EMBER}aa;
  box-shadow: 0 0 20px ${EMBER}44;
  transform: translateY(-1px);
}
.s7hq-hudcmdr:active { transform: translateY(0); }

/* ── THE LANDING BAND ─────────────────────────────────────────────────────── */
.s7lb { padding: 34px 16px 64px; }
.s7lb-in { max-width: 980px; margin: 0 auto; }
.s7lb-kicker {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 11px; font-weight: 700; letter-spacing: 0.18em;
  color: ${EMBER}; margin: 0 0 6px;
}
.s7lb-title { font-size: clamp(26px, 4.4vw, 40px); line-height: 1.1; margin: 0 0 10px; }
.s7lb-lead { font-size: 16px; line-height: 1.55; color: #cfd6dd; max-width: 62ch; margin: 0 0 18px; }
.s7lb-cta { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 34px; }
.s7lb-btn {
  display: inline-block; padding: 11px 18px; border-radius: 10px;
  border: 1px solid ${BORDER}; color: #e7edf3; text-decoration: none;
  font-weight: 700; font-size: 14px; background: rgba(20,25,30,0.7);
}
.s7lb-btn:hover { border-color: ${EMBER}88; }
.s7lb-btn--primary { background: ${EMBER}; border-color: ${EMBER}; color: #14100c; }
.s7lb-h { font-size: 20px; margin: 30px 0 4px; }
.s7lb-sub { color: ${MUTED}; margin: 0 0 14px; font-size: 14px; }
.s7lb-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
@media (min-width: 700px) {
  .s7lb-grid { grid-template-columns: repeat(3, 1fr); }
  .s7lb-grid--4 { grid-template-columns: repeat(4, 1fr); }
}
.s7lb-card {
  border: 1px solid ${BORDER}; border-radius: 12px; padding: 14px 15px;
  background: linear-gradient(180deg, rgba(24,29,35,0.9), rgba(15,18,22,0.9));
}
.s7lb-card--wide { margin-top: 12px; }
.s7lb-card--link { text-decoration: none; color: inherit; display: block; }
.s7lb-card--link:hover { border-color: ${EMBER}88; }
.s7lb-ct { margin: 0 0 5px; font-size: 15px; }
.s7lb-cb { margin: 0; font-size: 13.5px; line-height: 1.5; color: #c3ccd4; }
/* The per-step link (F2 fix): every "Start in three steps" card now ends
   somewhere real, step 3 at the funding wizard. 44px tall = a full touch
   target, ember on the card wash = 5.66:1. */
.s7lb-cardlink {
  display: inline-flex; align-items: center; gap: 6px;
  margin-top: 10px; min-height: 44px;
  font-size: 12.5px; font-weight: 800; letter-spacing: 0.02em;
  color: ${EMBER}; text-decoration: none;
}
.s7lb-cardlink:hover, .s7lb-cardlink:focus-visible { text-decoration: underline; }
/* Global keyboard ring: most S7 controls are styled inline and had NO
   :focus-visible rule, leaving only the UA default (unreliable on dark in
   Safari). Scoped to the S7 tree by the surrounding stylesheet. */
a:focus-visible, button:focus-visible, [tabindex]:focus-visible {
  outline: 2px solid ${EMBER};
  outline-offset: 2px;
  border-radius: 4px;
}


.s7hq-cmdr {
  position: absolute;
  left: 78%; bottom: 0;
  transform: translateX(-50%);
  transform-origin: 50% 100%; /* she pivots at her boots, not her middle */
  height: 32.5%;
  z-index: 5;
  padding: 0; border: 0;
  background: transparent;
  cursor: pointer;
}
/* ── COMMANDER INTEGRATION (2026-07-26) ──────────────────────────────────────
   She shipped at full studio saturation on top of a plate that is graded cool
   and desaturated, so she read as pasted on rather than standing in the camp.
   THE GRADE below is the fix: pull her saturation down to the plate's level,
   drop her exposure (she was lit brighter than anything around her), and lay a
   light warm wash over the top so the lantern-lit palette carries onto her.
   Done with filter() only, deliberately: a masked tint overlay composites
   better in principle, but if mask-image ever fails it paints a visible
   RECTANGLE over her, and this ships two days from launch. Filters cannot fail
   that way. Every rule that sets filter on this image must repeat the grade,
   or she pops back to full saturation on that state (hover already did).
   VALUES ARE MEASURED, NOT TASTE: sampling her opaque pixels against the
   camp plate gave plate sat 0.258 / val 0.328 and raw girl sat 0.673 /
   val 0.529, so she was 2.6x the scene's saturation. This chain lands her
   at sat 0.340 / val 0.346, about 1.3x the plate: still the most colourful
   thing in frame, which is right for the subject lit by that fire, without
   reading as pasted on. Re-measure before changing them. ── */
.s7hq-cmdr-img {
  position: relative;
  z-index: 1;
  display: block;
  height: 100%; width: auto;
  filter: saturate(var(--cmdr-sat, 0.35)) brightness(var(--cmdr-bri, 0.88)) contrast(1.02) sepia(0.18) blur(0.35px)
          drop-shadow(0 10px 18px rgba(0,0,0,0.6));
  transition: filter .16s ease;
}
.s7hq-cmdr-shadow {
  /* The fire is camera-left and low, so her shadow throws to the RIGHT and
     stretches. A centred ellipse reads as studio lighting, which is part of
     why she looked pasted on. */
  position: absolute;
  left: 60%; bottom: -2.5%;
  transform: translateX(-50%);
  width: 150%; height: 10%;
  border-radius: 50%;
  background: radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.3) 48%, rgba(0,0,0,0) 74%);
  filter: blur(4px);
}
.s7hq-cmdr:hover .s7hq-cmdr-img, .s7hq-cmdr:focus-visible .s7hq-cmdr-img {
  /* the grade is repeated here on purpose: setting filter at all replaces the
     whole chain, so omitting it made her snap to full saturation on hover. */
  filter: saturate(calc(var(--cmdr-sat, 0.35) * 1.2)) brightness(calc(var(--cmdr-bri, 0.88) * 1.08)) contrast(1.06) sepia(0.16)
          drop-shadow(0 0 14px ${EMBER}88) drop-shadow(0 8px 16px rgba(0,0,0,0.55));
}
/* She is a STILL by design (the animated key left background speckles in-scene,
   see SceneCommander's header), so the life comes from a slow idle bob on the
   BUTTON rather than the image: the image keeps its own :active transform, and
   an animation on it would win over that and kill the press feedback. The
   keyframes re-state translateX(-50%) because they replace the base transform. */
@media (prefers-reduced-motion: no-preference) {
  .s7hq-cmdr { animation: s7hq-cmdrbreathe 4.6s ease-in-out infinite; }
}
/* MAGNITUDE MATTERS: translateY(%) resolves against the element's OWN height,
   and she is ~226px tall on a 695px plate, so the first attempt at 0.7% moved
   her 1.6px and read as completely static. This travels ~5-6px, adds a weight
   shift and a breath, and pivots at the boots so it reads as standing rather
   than sliding. */
@keyframes s7hq-cmdrbreathe {
  0%   { transform: translateX(-50%) translateY(0)     scale(1)     rotate(0deg); }
  28%  { transform: translateX(-50%) translateY(-1.5%) scale(1.004) rotate(-0.24deg); }
  55%  { transform: translateX(-50%) translateY(-2.4%) scale(1.007) rotate(0.08deg); }
  78%  { transform: translateX(-50%) translateY(-1.1%) scale(1.003) rotate(0.26deg); }
  100% { transform: translateX(-50%) translateY(0)     scale(1)     rotate(0deg); }
}
/* ── DIRECTIONAL LIGHT ───────────────────────────────────────────────────────
   The grade fixed her KEY but not her LIGHTING: she was lit flat and frontal
   while the camp is lit warm and low from the fire at camera-left and cool from
   the sky above. This lays that light back onto her, masked to her own alpha so
   only her pixels are touched. It is behind @supports on purpose: if mask-image
   is unavailable the rule never applies at all, because an unmasked version
   would paint a visible RECTANGLE across her. Degrades to the plain grade. */
.s7hq-cmdr-light { display: none; }
@supports ((mask-image: url("#m")) or (-webkit-mask-image: url("#m"))) {
  .s7hq-cmdr-light {
    display: block;
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    background:
      radial-gradient(115% 75% at 10% 90%, rgba(255,150,60,0.42) 0%, rgba(255,150,60,0.15) 34%, rgba(255,150,60,0) 64%),
      linear-gradient(205deg, rgba(130,170,210,0.24) 0%, rgba(130,170,210,0) 58%);
    mix-blend-mode: soft-light;
    -webkit-mask-image: var(--cmdr-mask);
            mask-image: var(--cmdr-mask);
    -webkit-mask-size: 100% 100%;
            mask-size: 100% 100%;
    -webkit-mask-repeat: no-repeat;
            mask-repeat: no-repeat;
  }
}
.s7hq-cmdr:focus-visible { outline: 2px solid ${EMBER}; outline-offset: 3px; border-radius: 10px; }
/* ── SHE SAYS SOMETHING ──────────────────────────────────────────────────────
   A diegetic bubble pinned over her shoulder. pointer-events:none so it can
   never eat the click on the commander button underneath it. Desktop only:
   on a phone the plate is too tight to carry it without covering the tank. */
.s7hq-says {
  /* A PINNED FIELD NOTE, not a chat bubble. A dark rounded rectangle with UI
     type reads as a browser tooltip dropped on an oil painting; paper, a pin
     and a typewriter face belong in the camp. */
  position: absolute;
  left: 78%; bottom: 35%;
  transform: translateX(-50%) rotate(-1.4deg);
  z-index: 6;
  max-width: 30%;
  pointer-events: none;
  padding: 9px 12px 10px;
  border-radius: 2px;
  background: linear-gradient(178deg, #e9dec6 0%, #dccfae 62%, #cfc09e 100%);
  box-shadow: 0 10px 20px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(120,96,60,0.4);
  color: #2b2118;
  font-family: ui-monospace, "Courier New", Courier, monospace;
  font-size: 11.5px;
  line-height: 1.38;
  text-align: left;
  animation: none;
}
@media (prefers-reduced-motion: no-preference) {
  .s7hq-says { animation: s7hq-saysin .45s ease both; }
}
.s7hq-says::after {
  content: "";
  position: absolute;
  left: 50%; top: -4px;
  width: 7px; height: 7px;
  border-radius: 50%;
  transform: translateX(-50%);
  background: radial-gradient(circle at 35% 32%, #d8534e, #7f2b28);
  box-shadow: 0 1px 3px rgba(0,0,0,0.55);
}
@keyframes s7hq-saysin {
  from { opacity: 0; transform: translateX(-50%) rotate(-1.4deg) translateY(5px); }
  to   { opacity: 1; transform: translateX(-50%) rotate(-1.4deg) translateY(0); }
}
@media (max-width: 1023.98px) { .s7hq-says { display: none; } }

/* ── THE LEFT RAIL (>=1400px) ────────────────────────────────────────────────
   On a wide desktop the layout left ~235px of dead black down each side while
   eight stations stayed hidden behind the More sheet. Above 1400px there is
   room to just show them. Nothing new is invented here: same hotspots, same
   localized labels, same handler as the sheet. Below 1400px it stays hidden and
   More remains the only route, so narrow laptops are unchanged. */
.s7hq-lrail { display: none; }
@media (min-width: 1400px) {
  .s7hq-lrail {
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: 0 0 244px;
    width: 244px;
    margin-top: 14px;
  }
}
.s7hq-lrail-title {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: ${MUTED};
  margin: 0 0 8px;
}
.s7hq-cmdr:active .s7hq-cmdr-img { transform: translateY(1px); }

/* The raid countdown chip: same HUD grammar, the digits hold their width. */
.s7hq-hud-raid { white-space: nowrap; }
.s7hq-hud-raid b { font-variant-numeric: tabular-nums; }

/* ── MOBILE PARITY ── */
/* The rig band frame: garage-card grammar (border + radius + faint wash), so
   the tank cutout is a presented exhibit, not art floating on the page. */
.s7hq-rigframe {
  max-width: 420px;
  margin: 0 auto;
  padding: 20px 14px 14px;
  border: 1px solid ${BORDER};
  border-radius: 12px;
  background: rgba(255,255,255,0.02);
}
/* (The no-hover always-visible label override lives at the END of this
   stylesheet: it must come after the .s7hq-obj rules it overrides.) */

/* ── THE HUD CONSOLE: a slim command bar across the top of the stage. ── */
.s7hq-hud {
  position: absolute; left: 10px; right: 10px; top: 10px;
  z-index: 6;
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 6px 10px;
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(10,13,17,0.74), rgba(10,13,17,0.44));
  border: 1px solid rgba(255,255,255,0.06);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 12px rgba(0,0,0,0.4);
  backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
  pointer-events: none;
}
.s7hq-hud-chip {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: ${MUTED};
}
.s7hq-hud-chip b { color: ${TEXT}; font-variant-numeric: tabular-nums; }
.s7hq-hud-callsign { color: ${STEEL}; font-weight: 800; }
.s7hq-hud-callsign::before { content: "▸ "; color: ${EMBER}; }
.s7hq-hud-stats { display: flex; gap: 12px; }
.s7hq-hud-enlist { color: ${EMBER}; font-weight: 700; }
.s7hq-hud-pill {
  margin-left: auto;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 10px; letter-spacing: 0.1em;
  padding: 3px 9px; border-radius: 999px;
  background: ${STEEL}1f; border: 1px solid ${STEEL}44; color: ${TEXT};
  white-space: nowrap;
}
.s7hq-hud-pill--warn { background: ${EMBER}1c; border-color: ${EMBER}66; color: #f4c9ac; }

/* ── COMMAND FRAME: a hairline inner rule + two corner brackets. ── */
.s7hq-frameline {
  position: absolute; inset: 7px;
  border-radius: 11px;
  pointer-events: none;
  z-index: 3;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05);
}
.s7hq-frameline::before, .s7hq-frameline::after {
  content: ""; position: absolute; width: 22px; height: 22px; border: 2px solid ${STEEL}55;
}
.s7hq-frameline::before { top: -1px; left: -1px; border-right: 0; border-bottom: 0; border-radius: 10px 0 0 0; }
.s7hq-frameline::after { bottom: -1px; right: -1px; border-left: 0; border-top: 0; border-radius: 0 0 10px 0; }

/* ── THE MORE SHEET rows (inside the panel overlay) ── */
.s7hq-morerow {
  display: flex; flex-direction: column; gap: 2px;
  text-align: left;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid ${BORDER};
  background: rgba(255,255,255,0.02);
  cursor: pointer;
  color: inherit;
  text-decoration: none;
  transition: border-color .14s ease, background .14s ease;
}
.s7hq-morerow:hover { border-color: ${STEEL}66; background: rgba(255,255,255,0.045); }
.s7hq-morerow:focus-visible { outline: 2px solid ${EMBER}; outline-offset: 2px; }
.s7hq-morerow-lbl { font-size: 13px; font-weight: 800; color: ${TEXT}; }
.s7hq-morerow-flavor { font-size: 11.5px; color: ${FAINT}; line-height: 1.5; }

/* ── IN-SCENE OBJECTS: the tank + commander are clickable, hover glow + label ── */
.s7hq-obj {
  position: absolute;
  z-index: 5;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 16px;
  background: transparent;
  cursor: pointer;
  transition: border-color .16s ease, box-shadow .16s ease, background .16s ease;
}
/* Click region over the BAKED hero: the tank body (open loadout). Positioned
   on the painting. (The old second region over the kneeling mechanic is gone;
   the standing SceneCommander cutout is the one commander target now.) */
.s7hq-obj--tank { left: 56%; top: 40%; transform: translate(-50%, -50%); width: 64%; height: 44%; }
/* Labeled crate/board objects = the menu, always-visible labels + hover glow. */
.s7hq-obj--map { left: 13%; top: 44%; transform: translate(-50%, -50%); width: 24%; height: 15%; }
.s7hq-obj--upgrades { left: 12%; top: 85%; transform: translate(-50%, -50%); width: 21%; height: 11%; }
/* Promoted off the old sky toolbar onto the objects that own them: the tents
   run the games, the crates by the commander hold the manual, and MORE sits
   quietly in the corner of the frame. */
.s7hq-obj--arcade { left: 19%; top: 14%; transform: translate(-50%, -50%); width: 22%; height: 12%; }
/* Bottom CENTRE, not bottom right: at 78% the manual tag sat squarely on the
   standing commander (measured 68-88% x, 67-99% y). */
.s7hq-obj--howto { left: 46%; top: 88%; transform: translate(-50%, -50%); width: 24%; height: 10%; }
.s7hq-obj--more { left: 94.5%; top: 6.5%; transform: translate(-50%, -50%); width: 10%; height: 7%; }
.s7hq-obj--more .s7hq-obj-tag { color: ${MUTED}; font-size: 9px; letter-spacing: 0.1em; }
/* The map board pulses when a sprint is live: the alert moved here with it. */
.s7hq-obj--alert { border-color: ${EMBER}cc; box-shadow: 0 0 22px ${EMBER}66; }
@media (prefers-reduced-motion: no-preference) {
  .s7hq-obj--alert { animation: s7hq-klaxon 2.2s ease-in-out infinite; }
}
.s7hq-obj--label { border-color: rgba(255,255,255,0.1); border-radius: 8px; }
.s7hq-obj--label:hover, .s7hq-obj--label:focus-visible {
  border-color: ${EMBER}cc;
  box-shadow: 0 0 20px ${EMBER}55;
  background: radial-gradient(60% 60% at 50% 50%, ${EMBER}22, rgba(0,0,0,0) 72%);
}
.s7hq-obj-tag {
  position: absolute; left: 50%; bottom: 4px;
  transform: translateX(-50%);
  padding: 2px 8px; border-radius: 5px;
  background: rgba(9,11,14,0.82); border: 1px solid ${STEEL}44;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 10px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase;
  color: #f0d9c4; white-space: nowrap; text-shadow: 0 1px 2px #000;
}
.s7hq-obj--label:hover .s7hq-obj-tag, .s7hq-obj--label:focus-visible .s7hq-obj-tag { color: #fff; border-color: ${EMBER}88; }
.s7hq-obj--arcade .s7hq-obj-tag,
.s7hq-obj--more .s7hq-obj-tag { bottom: 50%; transform: translate(-50%, 50%); }
.s7hq-obj:hover, .s7hq-obj:focus-visible {
  border-color: ${EMBER}aa;
  background: radial-gradient(60% 60% at 50% 50%, ${EMBER}1c, rgba(0,0,0,0) 72%);
  box-shadow: 0 0 24px ${EMBER}44;
}
.s7hq-obj-lbl {
  position: absolute; left: 50%; bottom: -20px;
  transform: translateX(-50%);
  opacity: 0; pointer-events: none;
  white-space: nowrap;
  padding: 3px 9px; border-radius: 7px;
  background: rgba(9,11,14,0.92); border: 1px solid ${STEEL}55;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
  color: #fff;
  transition: opacity .16s ease;
}
.s7hq-obj:hover .s7hq-obj-lbl, .s7hq-obj:focus-visible .s7hq-obj-lbl { opacity: 1; }
/* No hover on a phone: the tank / commander hover labels become always-
   visible tags inside their regions, and the regions carry a faint border
   hint so the scene reads as tappable. Last in the sheet on purpose: it must
   out-cascade the base .s7hq-obj rules above. */
@media (max-width: 759.98px) {
  .s7hq-obj-lbl { opacity: 1; bottom: 6px; }
  .s7hq-obj { border-color: rgba(255,255,255,0.08); }
}
`;
