/**
 * THE GARAGE SCREEN (screens doc 3.1 and 3.2): your numbered garage on
 * Sprocket Row. The street strip, the garage diorama (five bays on real
 * stands, the corkboard, the tool board, the crew), the three DOM panels
 * under it (Morning Paper, Bays, Tool Board), the bay sheet, the recycle
 * confirm and the five-bot cap.
 *
 * Client shell in the Build screen's shape (src/app/bots/garage/build/
 * BuildClient.tsx, itself the S7 Battlefield shape): owns the rAF, builds
 * the two canvases through the one pixi chain, fits them with a
 * ResizeObserver on the wrapper (never the canvas), and keeps every number
 * in the DOM. State comes from src/lib/bots/garage-state.ts (localStorage
 * until the server lands); the only clock read is here, once a second, and
 * it is handed down as a value.
 */
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "../_components/PageShell";
import { GarageCoach } from "../_components/Coach";
import { ColourPips, type SlotColour } from "../_components/ColourPips";
import { FirstMeeting, hasMet } from "../_components/FirstMeeting";
import { PrideNote } from "../_components/Pride";
import { IconChevron, IconLock, IconPin, IconPlay, IconRecycle, IconStar, STAT_ICON } from "../_ui/icons";
import { Button, ChipTab, CoinChip, Dot, Panel, Sheet, uiCss } from "../_ui/primitives";
import { FONT_BODY, FONT_DISPLAY, FONT_MONO, FONT_TOY, K, M, PAINTS, R, TAP, TIER_COLOR } from "../_ui/tokens";
import { buildGarage, type BayTag, type GarageHandle, type TagDot } from "../_view/garage";
import { ART_OF_SOCKET, type PartArt } from "../_view/rig";
import type { Socket } from "@/lib/bots/fixtures";
import { loadPartArt } from "../_view/part-art";
import { buildStreet, type StreetHandle } from "../_view/street";
import {
  BAY_COUNT,
  BODY_SLOTS,
  CARD_OF_SOCKET,
  FIGHTS,
  ME,
  PAPER,
  SLOT_STATS,
  SOCKETS,
  SOCKETS_OF,
  botTier,
  botTotal,
  emptySockets,
  nameText,
  partArt,
  partTotal,
  recycleValue,
  type Build,
  type OwnedPart,
  type StrategyKind,
} from "@/lib/bots/fixtures";
import {
  bayStatus,
  firstEmptyBay,
  formatLeft,
  partByUid,
  putOnBay,
  recycleBay,
  recyclePart,
  recycleRows,
  resetGarage,
  saveBuild,
  spareParts,
  useGarage,
  type BayStatus,
  type GarageState,
} from "@/lib/bots/garage-state";
import { STRINGS, fill, starWord, winLossWords } from "@/lib/bots/strings";
import { shelfNothing, shelfRows, shelfSummary } from "@/lib/bots/shelf";
import { BODY_CARD_ORDER, CROWN_CARD_KIND, hatPaint, ownColours, socketPaints, twinWords } from "@/lib/bots/look";
import type { BotLook as RigLook } from "../_view/look";
import { readBotsSession } from "../battles/session";
import type { EarnedBotView, EarnedView } from "../_server/types";
import {
  BRAND_INDEX,
  BRAND_OF_FAMILY,
  BRAND_OF_WEAPON,
  SCRAP_NOTE,
  STAT_MEANING,
  leadStat,
  statChip,
  type BrandId,
} from "@/lib/bots/naming";
import { SCREEN_WORDS, STAT_NAME_OF, fillWords } from "@/lib/bots/naming-screens";

const t = STRINGS.en;
const hexNum = (h: string): number => parseInt(h.slice(1), 16);

/** React StrictMode dev-mounts effects twice; two app.init() calls racing on
 * ONE canvas kill each other's shaders (the Battlefield law). Every build AND
 * destroy is chained through this promise. */
let pixiChain: Promise<void> = Promise.resolve();

/* ── the status chip (canvas tag and DOM chip share the table) ──────────── */

interface Chip {
  text: string;
  dot: TagDot;
  pulse?: boolean;
}

function chipOf(s: BayStatus): Chip {
  switch (s.kind) {
    case "ready":
      return { text: fill(t.garageUi.chip.ready, { n: s.attacksLeft }), dot: "good" };
    case "shop":
      return { text: fill(t.garageUi.chip.shop, { time: formatLeft(s.leftMs) }), dot: "warn" };
    case "battle":
      return { text: t.garageUi.chip.battle, dot: "bad", pulse: true };
    case "notReady":
      return { text: fill(t.garageUi.chip.notReady, { n: s.empty }), dot: "muted" };
    default:
      return { text: t.garageUi.chip.empty, dot: "dashed" };
  }
}

const DOT_COLOR: Record<Exclude<TagDot, "dashed">, string> = { good: M.good, warn: M.warn, bad: M.bad, muted: M.muted };

/**
 * HOW THIS ROBOT IS DOING TODAY, in one warm sentence that names it.
 *
 * Five robots on five stands read as five copies of one robot: the status
 * chip beside each of them says what the GAME thinks (ready, being fixed,
 * fighting) and nothing says what the ROBOT is like. This is the other
 * half. The one that just won stands differently from the one being fixed,
 * and a player reads that difference before they read a number.
 *
 * It is derived, never stored: the status the screen already computed, plus
 * the most recent row of that spot's own fight list, so it cannot claim a
 * win the garage did not have.
 */
function moodLine(name: string, bay: number, s: BayStatus, fought: number): string {
  switch (s.kind) {
    case "battle":
      return fill(t.mood.fighting, { name });
    case "shop":
      return fill(t.mood.fixed, { name });
    case "notReady":
      return fill(t.mood.building, { name });
    case "empty":
      return fill(t.mood.empty, { n: bay });
    default: {
      // FIGHTS rows are newest first (fixtures.ts), so [0] is the last one
      const last = (FIGHTS[bay] ?? [])[0];
      if (last) return fill(last.result === "win" ? t.mood.won : t.mood.lost, { name });
      return fill(fought > 0 ? t.mood.ready : t.mood.first, { name });
    }
  }
}

function StatusChip({ chip }: { chip: Chip }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: FONT_MONO, fontSize: 12, color: M.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
      {chip.dot === "dashed" ? (
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: R.pill, border: `1px dashed ${M.muted}`, flex: "0 0 auto" }} />
      ) : (
        <Dot color={DOT_COLOR[chip.dot]} pulse={chip.pulse} />
      )}
      {chip.text}
    </span>
  );
}

/** A spare part on the tool board panel: thumb, name, tier dot, three stats, provenance. */
function SpareRow({ part, onClick }: { part: OwnedPart; onClick: () => void }) {
  const color = TIER_COLOR[part.tier];
  const lead = leadStat(part.slot, [part.s[0], part.s[1], part.s[2]]);
  return (
    <button
      className={uiCss.press}
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "40px 1fr auto",
        gap: 10,
        alignItems: "center",
        width: "100%",
        minHeight: 56,
        padding: "6px 8px",
        borderRadius: R.inner,
        border: `1px solid ${M.border}`,
        background: M.surface2,
        color: M.text,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <span style={{ width: 40, height: 40, borderRadius: 10, border: `2px solid ${color}`, background: K.floor, display: "grid", placeItems: "center", overflow: "hidden" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={partArt(part).base} alt="" style={{ width: 34, height: 34, objectFit: "contain" }} />
      </span>
      <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 700 }}>
          {/* the SHOP taught the player that a dot here is the part's colour.
              This row used to draw the quality dot in the same place and never
              print the colour word, so two screens meant two things by one
              dot. The swatch is the colour, and the word is beside it. */}
          {part.paint ? (
            <span aria-hidden style={{ width: 9, height: 9, borderRadius: R.pill, background: PAINTS[part.paint], display: "inline-block", outline: `1px solid ${M.border}` }} />
          ) : null}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{part.name}</span>
        </span>
        <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: M.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {starWord(part.tier)}, {part.paint ? t.paintName[part.paint] : t.set.noPaint}
        </span>
      </span>
      {/* was "SPD 6 STR 3 DGE 4". The row has space for one stat, so it
          shows the one this part leads on, read off its own numbers. */}
      <span style={{ fontFamily: FONT_BODY, fontSize: 12, color: M.lore, whiteSpace: "nowrap" }}>
        <span style={{ color: M.muted }}>{SCREEN_WORDS.bestAt} </span>
        {statChip(lead.name, lead.value)}
      </span>
    </button>
  );
}

/* ── the screen ─────────────────────────────────────────────────────────── */

type SheetState =
  | { kind: "paper" }
  | { kind: "bay"; bay: number }
  | { kind: "recycle"; bay: number }
  | { kind: "tools" }
  | { kind: "part"; uid: string }
  | { kind: "pickBay"; uid: string }
  | { kind: "crew"; who: StrategyKind }
  | null;

export default function GarageClient() {
  const router = useRouter();
  // the one clock read on this screen: once at mount for the store, then once a second
  const mountNow = useRef(0);
  if (mountNow.current === 0 && typeof window !== "undefined") mountNow.current = Date.now();
  const st = useGarage(mountNow.current);
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const [sheet, setSheet] = useState<SheetState>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  /** every bay's art is on its rig (the shot harness waits on this) */
  const [artDone, setArtDone] = useState(false);
  const [small, setSmall] = useState(false);
  const [focus, setFocus] = useState(1);
  const [centre, setCentre] = useState<number>(ME.garageNo);
  const [botImg, setBotImg] = useState<string | null>(null);
  /** the first meeting's portrait: extracted once, and only for a player who
   * has not met their robot yet (_components/FirstMeeting.tsx) */
  const [meetImg, setMeetImg] = useState<string | null>(null);
  /** has this browser met its robot. Read AFTER mount so the server render
   * and the first client render agree. null means we do not know yet, and
   * neither the meeting nor the proud line is drawn. */
  const [met, setMet] = useState<boolean | null>(null);
  /**
   * WHAT THE SERVER SAYS THESE ROBOTS HAVE EARNED (the ninth law).
   *
   * The builds on this screen live in the browser, and the browser is not
   * allowed to say what a robot earned, so every mark, every unlocked face,
   * every hat, the look count and the cards come from GET /api/bots/earned
   * and from nowhere else. Three states, and they are not the same thing:
   *   null      not asked yet, or asked and refused: nothing is claimed
   *   []        asked and answered, this wallet has no robots on the server
   *   [rows]    answered, one row per robot, keyed by its spot
   * A robot with no row draws with no marks and no hat, which is the honest
   * picture of a robot the server has never heard of.
   */
  const [earned, setEarned] = useState<EarnedBotView[] | null>(null);
  /** true once the token has been read after mount, so the "connect your
   * wallet" line never flashes at a player who is already signed in */
  const [earnedAsked, setEarnedAsked] = useState(false);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streetWrapRef = useRef<HTMLDivElement | null>(null);
  const streetRef = useRef<HTMLCanvasElement | null>(null);
  const garageRef = useRef<GarageHandle | null>(null);
  const streetHandle = useRef<StreetHandle | null>(null);
  const artCache = useRef(new Map<string, PartArt>());
  const spoke = useRef(false);

  const say = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 1800);
  }, []);

  // ── derived ─────────────────────────────────────────────────────────────
  const bays = useMemo(() => Array.from({ length: BAY_COUNT }, (_, i) => i + 1), []);
  const statuses = useMemo(() => bays.map((b) => bayStatus(st, b, now)), [st, bays, now]);
  const spares = useMemo(() => spareParts(st), [st]);
  const tierOf = useCallback(
    (build: Build | undefined) => {
      if (!build || emptySockets(build).length > 0) return null;
      return botTier(botTotal(build, st.parts));
    },
    [st.parts],
  );

  // ── what the server says was earned ─────────────────────────────────────
  // Read AFTER mount, like every other stored value on this screen, so the
  // server render and the first client render agree. A refusal, an expired
  // token or a dead route all land the same way: nothing is claimed, the
  // marks stay off the robots and the list stays locked, which is the true
  // answer for a page that could not ask.
  useEffect(() => {
    let live = true;
    const token = readBotsSession();
    if (!token) {
      setEarnedAsked(true);
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/bots/earned", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const body = (await res.json()) as EarnedView | { ok: false };
        if (!live) return;
        setEarned(res.ok && body.ok ? body.bots : null);
      } catch {
        if (live) setEarned(null);
      } finally {
        if (live) setEarnedAsked(true);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  /** the server's row for a spot, or null when it has none */
  const earnedOfBay = useCallback(
    (bay: number): EarnedBotView | null => earned?.find((e) => e.bay === bay) ?? null,
    [earned],
  );

  // ── the garage canvas ───────────────────────────────────────────────────
  const openBayRef = useRef<(b: number) => void>(() => {});
  const sheetRef = useRef<(s: SheetState) => void>(() => {});
  sheetRef.current = setSheet;
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let dead = false;
    let raf = 0;
    let ro: ResizeObserver | null = null;
    const isSmall = typeof matchMedia !== "undefined" && matchMedia("(max-width: 899px)").matches;
    setSmall(isSmall);
    const toyFont = getComputedStyle(wrap).getPropertyValue("--font-bots-toy").trim() || "ui-rounded, Segoe UI, sans-serif";
    pixiChain = pixiChain
      .then(async () => {
        if (dead) return;
        return buildGarage(canvas, {
          small: isSmall,
          toyFont,
          onBayTap: (b) => openBayRef.current(b),
          onCorkboardTap: () => sheetRef.current({ kind: "paper" }),
          onToolBoardTap: () => sheetRef.current({ kind: "tools" }),
          onCrewTap: (who) => sheetRef.current({ kind: "crew", who }),
          onFocus: (b) => setFocus(b),
        });
      })
      .then((g) => {
        if (!g) return;
        if (dead) {
          g.destroy();
          return;
        }
        garageRef.current = g;
        const fit = () => {
          const r = wrap.getBoundingClientRect();
          g.resize(r.width, r.height, Math.min(2, devicePixelRatio || 1));
        };
        fit();
        ro = new ResizeObserver(fit);
        ro.observe(wrap);
        const loop = (nowMs: number) => {
          if (dead) return;
          g.render(nowMs);
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        setReady(true);
      });
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      setReady(false);
      pixiChain = pixiChain.then(() => {
        garageRef.current?.destroy();
        garageRef.current = null;
        artCache.current.clear();
      });
    };
  }, []);

  // ── the street strip ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = streetRef.current;
    const wrap = streetWrapRef.current;
    if (!canvas || !wrap) return;
    const isSmall = typeof matchMedia !== "undefined" && matchMedia("(max-width: 899px)").matches;
    const toyFont = getComputedStyle(wrap).getPropertyValue("--font-bots-toy").trim() || "ui-rounded, Segoe UI, sans-serif";
    const s = buildStreet(canvas, {
      small: isSmall,
      toyFont,
      mine: ME.garageNo,
      onDoorTap: (no) => {
        if (no === ME.garageNo) return;
        say(fill(t.garageUi.neighbour, { n: String(no).padStart(4, "0") }));
      },
    });
    streetHandle.current = s;
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      s.resize(r.width, r.height, Math.min(2, devicePixelRatio || 1));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      s.destroy();
      streetHandle.current = null;
    };
  }, [say]);
  useEffect(() => {
    streetHandle.current?.setCentre(centre);
  }, [centre]);

  // the shared loader, so this screen keeps its bots when public/bots-art is
  // gone: a missing file falls back to the drawn clay part the Fight Viewer
  // already used (the house law; see _view/part-art.ts)
  const loadArt = useCallback(
    (g: GarageHandle, part: OwnedPart): Promise<PartArt> =>
      loadPartArt(
        g.stage.pixi,
        g.stage.app.renderer,
        ART_OF_SOCKET[SOCKETS_OF[part.slot][0]],
        part.tier,
        part.design,
        artCache.current,
      ),
    [],
  );

  // push every bay's build into its rig whenever the garage changes. Every
  // part of every bay loads IN PARALLEL: the first 1440 shot caught the
  // sequential version still on bay 2 after two seconds (28 textures, one
  // await each, through the dev server), which read as "two bots, not four"
  useEffect(() => {
    const g = garageRef.current;
    if (!g || !ready) return;
    let cancelled = false;
    setArtDone(false);
    type Loaded = { socket: Socket; part: OwnedPart | null; art: PartArt | null };
    (async () => {
      const loaded = await Promise.all(
        bays.map(async (b) => {
          const build = st.builds[b];
          if (!build) return null;
          const arts: Loaded[] = await Promise.all(
            SOCKETS.map(async (socket) => {
              const part = partByUid(st, build.cards[CARD_OF_SOCKET[socket]]);
              // a missing file must never empty the bay: the socket stays bare
              const art = part ? await loadArt(g, part).catch(() => null) : null;
              return { socket, part, art };
            }),
          );
          return { b, build, arts };
        }),
      );
      if (cancelled) return;
      bays.forEach((b, i) => {
        const r = loaded[i];
        const rig = g.rigs[b - 1];
        if (!r) {
          g.setBotVisible(b, false);
          return;
        }
        for (const { socket, art } of r.arts) rig.setArt(socket, art);
        // the base colour under everything, then the decal, then the WHOLE
        // look. The look owns every socket's colour (lookForBay), so it is
        // pushed HERE rather than only in its own effect below: this pass is
        // asynchronous, and a paint written after the look had already landed
        // would put the local colours back over the server's for as long as
        // the player left the screen alone.
        const torso = partByUid(st, r.build.cards.torso);
        rig.setPaint(hexNum(PAINTS[torso?.paint ?? "mint"]));
        rig.setDecal(r.build.decal);
        rig.setLook(lookRef.current(b, r.build));
        g.setBotVisible(b, true);
      });
      setArtDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [st, ready, bays, loadArt]);

  /**
   * THE WHOLE LOOK OF ONE SPOT'S ROBOT, in the rig's own units.
   *
   * ONE ROBOT PER SPOT. The FACE, THE STICKER, THE HAT AND EVERY MARK are
   * earned, so they can only come from the server's row for this spot (the
   * ninth law). The COLOURS then come from the same row, not because a colour
   * is earned (it is found, and it arrives with the part) but because the
   * marks were earned in those colours and a card that mixed the two said
   * "all four parts match" beside a locked winking face.
   *
   * NO ROW, NO MARKS. A robot the server has never heard of takes its colours
   * off the very cards this screen is drawing and wears a calm face, no hat
   * and a bare chest, which is exactly what it has. socketPaints is imported
   * rather than copied for that path, so the rule that the weapon rides the
   * arm (a weapon card never has a colour of its own) is stated once, in
   * src/lib/bots/look.ts, and a robot holding a spanner in a mint fist reads
   * the same here as it does in the ring.
   *
   * The sticker's colour is clamped to a colour the robot is actually
   * wearing: a sticker wears one of the robot's own colours, and the screen
   * has to keep that promise with the robot in front of the player.
   */
  const lookForBay = useCallback(
    (bay: number, build: Build): RigLook => {
      const row = earnedOfBay(bay);
      // one robot per spot: when the server knows this one, its colours are
      // the ones the marks were earned in, so the drawn robot, the colour
      // pips and the earned list all describe the same creature
      const sp = row?.paints ?? socketPaints((slot) => partByUid(st, build.cards[slot])?.paint ?? null);
      const paint: Partial<Record<Socket, number>> = {};
      for (const socket of SOCKETS) {
        const id = sp[socket];
        if (id) paint[socket] = hexNum(PAINTS[id]);
      }
      const own = ownColours(BODY_CARD_ORDER.map((slot) => sp[SOCKETS_OF[slot][0]] ?? null));
      const look = row?.look ?? null;

      const stickerId = look?.stickerPaint && own.includes(look.stickerPaint) ? look.stickerPaint : sp.torso ?? own[0] ?? null;
      // A HAT WEARS THE COLOUR IT TURNED UP IN. look.ts hatPaint is the one
      // answer, so the lift, the ring, the portrait and the card cannot put
      // three different bows on one robot; a hat with no colour of its own is
      // a row from before colours were recorded and falls back to the head's.
      const hatId = hatPaint(look?.hat, sp) ?? own[0] ?? null;

      return {
        paint,
        face: look?.face ?? "calm",
        sticker: look?.sticker
          ? { id: look.sticker, spot: look.spot, color: hexNum(PAINTS[stickerId ?? "cream"]) }
          : null,
        // the plate says what the robot is CALLED, so the number is the name's
        plate: look?.plateNumber ?? build.name.num ?? null,
        hat: look?.hat ? { kind: look.hat.kind, color: hexNum(PAINTS[hatId ?? "cream"]) } : null,
        earned: row
          ? { wins: row.earned.wins, repairs: row.earned.repairs, level: row.earned.level, crown: row.earned.champion }
          : undefined,
      };
    },
    [st, earnedOfBay],
  );

  // read by the art pass above, which must NOT re-run when the server answers
  // (it would reload every texture to change a face)
  const lookRef = useRef(lookForBay);
  lookRef.current = lookForBay;

  // And again on its own, for the answer that arrives after the art. setLook
  // takes the WHOLE look every time, so a spot that lost its robot, or a
  // wallet that signed out mid visit, cannot leave a hat behind on the next
  // robot to stand there.
  useEffect(() => {
    const g = garageRef.current;
    if (!g || !ready) return;
    for (const b of bays) {
      const build = st.builds[b];
      const rig = g.rigs[b - 1];
      if (!rig) continue;
      rig.setLook(build ? lookForBay(b, build) : null);
    }
  }, [st, ready, bays, artDone, lookForBay]);

  // the tags: name and status, the countdown ticking once a second
  useEffect(() => {
    const g = garageRef.current;
    if (!g || !ready) return;
    bays.forEach((b, i) => {
      const build = st.builds[b];
      const chip = chipOf(statuses[i]);
      const tag: BayTag = {
        name: build ? nameText(build.name) : fill(t.ui.bayLabel, { n: b }),
        status: chip.text,
        dot: chip.dot,
        pulse: chip.pulse,
      };
      g.setTag(b, tag);
    });
  }, [st, statuses, ready, bays]);

  // the crew: one figure per live strategy, and the last fill's chip once
  useEffect(() => {
    const g = garageRef.current;
    if (!g || !ready) return;
    g.setCrew(st.crew.map((c) => c.kind));
    if (!spoke.current && st.crew.length) {
      spoke.current = true;
      const c = st.crew[0];
      g.speak(c.kind, fill(c.kind === "position" ? t.garageUi.speechAdded : t.garageUi.speech, { n: c.lastFillCoins }));
    }
  }, [st.crew, ready]);

  useEffect(() => {
    garageRef.current?.focusBay(focus);
  }, [focus]);

  /** the spot the player's first robot is standing in: the lowest numbered
   * one that has a robot in it at all */
  const meetBay = useMemo(() => bays.find((b) => st.builds[b]) ?? null, [bays, st.builds]);

  useEffect(() => {
    setMet(hasMet());
  }, []);

  // the first meeting's picture. A returning player never pays for it: the
  // card would not draw it, so the readback never happens.
  useEffect(() => {
    if (!ready || !artDone || meetBay == null || met !== false) return;
    let live = true;
    garageRef.current?.extractBot(meetBay).then((url) => {
      if (live) setMeetImg(url);
    });
    return () => {
      live = false;
    };
  }, [ready, artDone, meetBay, met]);

  // the bay sheet's picture: the bot alone, extracted from the stage
  useEffect(() => {
    if (sheet?.kind !== "bay") {
      setBotImg(null);
      return;
    }
    let live = true;
    garageRef.current?.extractBot(sheet.bay).then((url) => {
      if (live) setBotImg(url);
    });
    return () => {
      live = false;
    };
  }, [sheet]);

  // ── actions ─────────────────────────────────────────────────────────────
  const openBay = useCallback(
    (b: number) => {
      if (!st.builds[b]) {
        router.push(`/bots/garage/build?bay=${b}`);
        return;
      }
      setSheet({ kind: "bay", bay: b });
    },
    [st.builds, router],
  );
  openBayRef.current = openBay;

  const newBot = () => {
    const b = firstEmptyBay(st);
    if (b == null) {
      say(t.garage.full);
      return;
    }
    router.push(`/bots/garage/build?bay=${b}`);
  };

  const doRecycle = (b: number) => {
    const build = st.builds[b];
    const r = recycleBay(b);
    if (!r || !build) return;
    setSheet(null);
    say(fill(t.garageUi.recycledBot, { bot: nameText(build.name), coins: r.coins, n: b }));
  };

  const walk = (dir: -1 | 1) => setCentre((c) => Math.max(1, c + dir * 10));

  // ── the screenshot harness hook (dev only; bots-shot.mjs waits on it) ───
  useEffect(() => {
    if (!ready) return;
    const w = window as unknown as Record<string, unknown>;
    w.__bots = {
      ready: true,
      artReady: artDone,
      openPaper: () => setSheet({ kind: "paper" }),
      openBay: (b: number) => setSheet({ kind: "bay", bay: b }),
      openRecycle: (b: number) => setSheet({ kind: "recycle", bay: b }),
      openTools: () => setSheet({ kind: "tools" }),
      speak: (who: StrategyKind, text?: string) => garageRef.current?.speak(who, text ?? fill(t.garageUi.speech, { n: 14 })),
      focus: (b: number) => setFocus(b),
      reset: () => resetGarage(Date.now()),
      state: () => ({ coins: st.coins, bays: statuses, spares: spares.length }),
      /** which rigs are on their stands (the beauty gate's three painted bots) */
      bots: () => garageRef.current?.rigs.map((r) => r.root.visible) ?? [],
      /** what the SERVER said each robot earned, so a screenshot of the list
       * can be checked against the rows behind it instead of trusted */
      earned: () =>
        (earned ?? []).map((e) => ({
          bay: e.bay,
          wins: e.earned.wins,
          marks: e.marks,
          hats: e.earned.hats,
          twins: e.twins,
          cards: e.cards.length,
        })),
      earnedAsked,
    };
    return () => {
      delete w.__bots;
    };
  }, [ready, artDone, st.coins, statuses, spares.length, earned, earnedAsked]);

  // ── pieces ──────────────────────────────────────────────────────────────
  const paperLine = (line: (typeof PAPER.lines)[number], i: number) => (
    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 32 }}>
      <span style={{ flex: 1, fontSize: 14, lineHeight: 1.4 }}>{line.text}</span>
      {line.link?.kind === "watch" ? (
        <button className={uiCss.press} onClick={() => router.push(`/bots/fight/${line.link && line.link.kind === "watch" ? line.link.id : ""}`)} style={{ minHeight: TAP, minWidth: TAP, padding: "0 12px", borderRadius: R.inner, border: `1px solid #cdbf9f`, background: "transparent", color: "inherit", fontFamily: FONT_BODY, fontWeight: 700, fontSize: 12.5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <IconPlay size={14} />
          {t.garageUi.watch}
        </button>
      ) : line.link?.kind === "shop" ? (
        <button className={uiCss.press} onClick={() => router.push("/bots/shop")} style={{ minHeight: TAP, minWidth: TAP, padding: "0 12px", borderRadius: R.inner, border: `1px solid #cdbf9f`, background: "transparent", color: "inherit", fontFamily: FONT_BODY, fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
          {t.garageUi.shopLink}
        </button>
      ) : null}
    </div>
  );

  /** the cream paper block, shared by the panel and the sheet */
  const paper = (full: boolean) => (
    <div style={{ background: K.paper, color: K.ink, borderRadius: R.inner, padding: full ? "18px 18px 14px" : "12px 14px", position: "relative" }}>
      {full ? (
        <>
          <span aria-hidden style={{ position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)", color: M.bad, display: "grid" }}>
            <IconPin size={22} />
          </span>
          <div style={{ fontFamily: FONT_TOY, fontSize: 22, fontWeight: 800, textAlign: "center", letterSpacing: 0.4, marginTop: 6 }}>{t.garageUi.masthead}</div>
          <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: "#8a7a63", textAlign: "center", marginBottom: 10 }}>{PAPER.date}</div>
          <div style={{ borderTop: "1px solid #cdbf9f", marginBottom: 6 }} />
        </>
      ) : null}
      {(full ? PAPER.lines : PAPER.lines.slice(0, 2)).map(paperLine)}
    </div>
  );

  /**
   * The four body-part colours of a saved robot, in body-part order.
   *
   * WHEN THE SERVER HAS A ROW FOR THIS SPOT, ITS COLOURS WIN. Not because a
   * colour is earned (it is found, and it arrives with the part), but because
   * every other line on that sheet is the server's: the record, the marks,
   * the list of what is earned. A card that took its colours from one robot
   * and its stars from another said "all four parts match" beside a locked
   * winking face, which is one card carrying two answers. One robot per card.
   */
  const coloursOf = (build: Build | undefined, bay?: number): SlotColour[] => {
    const row = bay != null ? earnedOfBay(bay) : null;
    if (row) return BODY_SLOTS.map((s) => ({ slot: s, color: (row.paints[SOCKETS_OF[s][0]] ?? null) as SlotColour["color"] }));
    return build
      ? BODY_SLOTS.map((s) => {
          const uid = build.cards[s];
          const p = uid ? partByUid(st, uid) : null;
          return { slot: s, color: (p?.paint ?? null) as SlotColour["color"] };
        })
      : [];
  };

  const bayRow = (b: number, i: number, tall: boolean) => {
    const build = st.builds[b];
    const chip = chipOf(statuses[i]);
    const tier = tierOf(build);
    return (
      <button
        key={b}
        className={uiCss.press}
        onClick={() => openBay(b)}
        style={{
          display: "grid",
          // the phone row (tall) stacks the chip under the name: side by side
          // they fought for 300 px and the name lost ("Spar...", week 2)
          gridTemplateColumns: tall ? "28px 1fr 20px" : "28px 1fr auto 20px",
          gap: 10,
          alignItems: "center",
          width: "100%",
          minHeight: tall ? 56 : TAP,
          padding: "0 6px 0 4px",
          borderRadius: R.inner,
          border: `1px solid ${M.border}`,
          background: M.surface2,
          color: M.text,
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: M.muted }}>{b}</span>
        <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {/* the name is its own box: a flex box never ellipsises its own text, so the 390 rows clipped (week 2) */}
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{build ? nameText(build.name) : fill(t.ui.bayLabel, { n: b })}</span>
            {build ? <Dot color={tier ? TIER_COLOR[tier] : M.muted} /> : null}
            {/* the tier word fits the 500px panel; a phone row keeps the dot only */}
            {build && !tall ? <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: M.muted, letterSpacing: "0.08em" }}>{tier ? starWord(tier) : SCREEN_WORDS.botNotReady}</span> : null}
          </span>
          {/* THE PHONE ROW carries the colours. A phone shows ONE robot on
              the canvas at a time, so this list is the only place five
              robots are seen together, and four swatches make each row that
              player's own robot before a word is read. The desktop list sits
              under a diorama that already shows all five in their colours,
              so it does not pay the width. */}
          {tall ? (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <StatusChip chip={chip} />
              {build ? <ColourPips colors={coloursOf(build, b)} size={9} line={false} /> : null}
            </span>
          ) : null}
        </span>
        {tall ? null : <StatusChip chip={chip} />}
        <span style={{ color: M.muted, display: "grid" }}>
          <IconChevron size={16} />
        </span>
      </button>
    );
  };

  const canvasFrame: React.CSSProperties = {
    position: "relative",
    width: "100%",
    borderRadius: R.frame,
    border: `1px solid ${M.border}`,
    boxShadow: `inset 0 1px 0 ${M.highlight}`,
    background: K.vignette,
    overflow: "hidden",
  };

  const bayBuild = sheet?.kind === "bay" || sheet?.kind === "recycle" ? st.builds[sheet.bay] : undefined;
  const bayEarned = sheet?.kind === "bay" || sheet?.kind === "recycle" ? earnedOfBay(sheet.bay) : null;
  /** wins and losses for the open sheet: the server's when it has a row for
   * that spot, and the browser's stand in only when it does not */
  const bayRecord =
    sheet?.kind === "bay" || sheet?.kind === "recycle"
      ? bayEarned
        ? { wins: bayEarned.wins, losses: bayEarned.losses }
        : { wins: st.bays[sheet.bay]?.wins ?? 0, losses: st.bays[sheet.bay]?.losses ?? 0 }
      : { wins: 0, losses: 0 };
  const bayStatusNow = sheet?.kind === "bay" ? statuses[sheet.bay - 1] : null;
  const recycle = sheet?.kind === "recycle" ? recycleRows(st, sheet.bay) : null;
  const sparePart = sheet?.kind === "part" || sheet?.kind === "pickBay" ? partByUid(st, sheet.uid) : null;
  const crewCard = sheet?.kind === "crew" ? st.crew.find((c) => c.kind === sheet.who) ?? null : null;

  return (
    <PageShell wide>
      {/* ── MEET YOUR ROBOT ───────────────────────────────────────────────
          The first thing on the first visit, and never again after that.
          A player arrives owning a robot; this is the moment it wakes up,
          turns out to have a name, and turns out to be theirs. */}
      {met === false && meetBay != null && st.builds[meetBay] ? (
        <FirstMeeting
          name={st.builds[meetBay].name}
          spot={meetBay}
          picture={meetImg}
          onRename={(name) => saveBuild({ ...st.builds[meetBay], name })}
          onDone={() => setMet(true)}
        />
      ) : null}

      {/* ── SPROCKET ROW ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 10px" }}>
        <button className={uiCss.press} onClick={() => walk(-1)} aria-label={t.garageUi.walkLeft} title={t.garageUi.walkLeft} style={{ width: TAP, height: TAP, display: "grid", placeItems: "center", borderRadius: R.pill, border: `1px solid ${M.border}`, background: M.surface, color: M.muted, cursor: "pointer", transform: "scaleX(-1)" }}>
          <IconChevron size={18} />
        </button>
        <span style={{ flex: 1, textAlign: "center", fontFamily: FONT_MONO, fontSize: 11, letterSpacing: "0.32em", textTransform: "uppercase", color: M.muted }}>
          {t.garageUi.street}, {fill(t.garage.title, { n: String(centre).padStart(4, "0") })}
          {centre === ME.garageNo ? `, ${t.garageUi.yourDoor}` : ""}
        </span>
        <button className={uiCss.press} onClick={() => walk(1)} aria-label={t.garageUi.walkRight} title={t.garageUi.walkRight} style={{ width: TAP, height: TAP, display: "grid", placeItems: "center", borderRadius: R.pill, border: `1px solid ${M.border}`, background: M.surface, color: M.muted, cursor: "pointer" }}>
          <IconChevron size={18} />
        </button>
      </div>
      <div ref={streetWrapRef} style={{ ...canvasFrame, height: small ? 80 : 170 }}>
        <canvas ref={streetRef} style={{ display: "block", width: "100%", height: "100%" }} />
      </div>
      <GarageCoach state={st} />
      {/* the proud moments: one warm line for the first win, the first time
          all four colours matched, and the first 4 star part. Said once, and
          never in the same breath as meeting the robot for the first time. */}
      {met ? <PrideNote state={st} /> : null}

      {/* ── THE GARAGE ────────────────────────────────────────────────────── */}
      <div ref={wrapRef} style={{ ...canvasFrame, marginTop: 16, aspectRatio: small ? "390 / 300" : "1400 / 520" }}>
        <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
        {small ? (
          <>
            <span style={{ position: "absolute", top: 8, left: 8 }}>
              <ChipTab onClick={() => setSheet({ kind: "paper" })}>{t.garageUi.paperChip}</ChipTab>
            </span>
            <span style={{ position: "absolute", top: 8, right: 8 }}>
              <ChipTab onClick={() => setSheet({ kind: "tools" })}>{t.garageUi.partsChip}</ChipTab>
            </span>
          </>
        ) : null}
      </div>
      {small ? (
        <div style={{ display: "flex", justifyContent: "center", gap: 2, marginTop: 4 }}>
          {bays.map((b) => (
            <button key={b} className={uiCss.press} onClick={() => setFocus(b)} aria-label={fill(t.garageUi.bayDot, { n: b })} aria-pressed={focus === b} style={{ width: TAP, height: 28, display: "grid", placeItems: "center", background: "transparent", border: "none", cursor: "pointer" }}>
              <span style={{ width: 7, height: 7, borderRadius: R.pill, background: focus === b ? M.accent : M.border, display: "block" }} />
            </button>
          ))}
        </div>
      ) : null}

      {/* ── the three panels (desktop) ────────────────────────────────────── */}
      <div className={uiCss.desktopOnly} style={{ marginTop: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 440fr) minmax(0, 500fr) minmax(0, 420fr)", gap: 20, alignItems: "start" }}>
          <Panel title={t.garage.paper} aside={<span style={{ fontFamily: FONT_MONO, fontSize: 12, color: M.muted }}>{PAPER.date}</span>}>
            {paper(false)}
            <div style={{ marginTop: 10 }}>
              <Button onClick={() => setSheet({ kind: "paper" })}>{t.garageUi.readAll}</Button>
            </div>
          </Panel>
          <Panel title={t.garageUi.bays} aside={<Button onClick={newBot} style={{ minHeight: 34, padding: "6px 12px", fontSize: 12.5 }}>{t.garageUi.newBot}</Button>}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{bays.map((b, i) => bayRow(b, i, false))}</div>
          </Panel>
          <Panel title={t.garageUi.toolBoard} aside={<span style={{ fontFamily: FONT_MONO, fontSize: 12, color: M.muted }}>{fill(t.garageUi.spares, { n: spares.length })}</span>}>
            {spares.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto", scrollbarWidth: "thin" }}>
                {spares.map((p) => (
                  <SpareRow key={p.uid} part={p} onClick={() => setSheet({ kind: "part", uid: p.uid })} />
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 12.5, color: M.muted }}>{t.garageUi.noSpares}</p>
            )}
          </Panel>
        </div>
      </div>

      {/* ── the five bay rows (phone) ─────────────────────────────────────── */}
      <div className={uiCss.mobileOnly} style={{ marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 12, fontWeight: 700, letterSpacing: "0.32em", color: M.muted }}>{t.garageUi.bays}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CoinChip coins={st.coins} ariaLabel={t.nav.coinsAria} />
            <Button onClick={newBot} style={{ minHeight: 36, padding: "6px 12px", fontSize: 12.5 }}>{t.garageUi.newBot}</Button>
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{bays.map((b, i) => bayRow(b, i, true))}</div>
      </div>

      {/* ── the toast ─────────────────────────────────────────────────────── */}
      {toast ? (
        <div className={uiCss.toast} role="status" style={{ position: "fixed", left: 0, right: 0, top: 64, display: "flex", justifyContent: "center", zIndex: 1200, pointerEvents: "none" }}>
          <span style={{ padding: "10px 16px", borderRadius: R.pill, background: M.surface, border: `1px solid ${M.border}`, fontSize: 13, fontWeight: 600 }}>{toast}</span>
        </div>
      ) : null}

      {/* ── sheets ────────────────────────────────────────────────────────── */}
      {sheet?.kind === "paper" ? (
        <Sheet title={t.garage.paper} onClose={() => setSheet(null)}>
          {paper(true)}
        </Sheet>
      ) : null}

      {sheet?.kind === "bay" && bayBuild && bayStatusNow ? (
        <Sheet title={nameText(bayBuild.name)} onClose={() => setSheet(null)} action={<StatusChip chip={chipOf(bayStatusNow)} />}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <span style={{ width: 120, height: 120, borderRadius: 14, border: `1px solid ${M.border}`, background: `linear-gradient(180deg, ${K.wall}, ${K.floor})`, display: "grid", placeItems: "center", flex: "0 0 auto", overflow: "hidden" }}>
                {botImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={botImg} alt="" style={{ maxWidth: 104, maxHeight: 104, objectFit: "contain" }} />
                ) : null}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT_MONO, fontSize: 12, letterSpacing: "0.12em" }}>
                  {(() => {
                    const tier = tierOf(bayBuild);
                    return (
                      <>
                        <Dot color={tier ? TIER_COLOR[tier] : M.muted} />
                        <span>{tier ? starWord(tier) : SCREEN_WORDS.botNotReady}</span>
                        <span style={{ color: M.muted, letterSpacing: 0 }}>{fillWords(SCREEN_WORDS.points, { n: botTotal(bayBuild, st.parts) })}</span>
                      </>
                    );
                  })()}
                </div>
                {/* THE RECORD THE STARS WERE COUNTED OFF. When the server
                    has a row for this spot it is the one that prints, because
                    the list below walks the ladder from those same numbers:
                    a card that said "7 wins" over "1 star for 2 wins" was one
                    card carrying two answers. */}
                <div style={{ fontFamily: FONT_MONO, fontSize: 14, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>
                  {winLossWords(bayRecord.wins, bayRecord.losses)}
                </div>
                {/* the colours this robot is wearing, and which part is the
                    odd one out, on the robot's own page */}
                <div style={{ marginTop: 10 }}>
                  <ColourPips colors={coloursOf(bayBuild, sheet.bay)} />
                </div>
                {/* HOW MANY ROBOTS LOOK LIKE THIS ONE. A count of robots, so
                    it belongs beside the colours and nowhere near a score:
                    nobody is above or below anybody in it. It is only drawn
                    when the server actually counted, because a look count
                    that was guessed at is worse than no look count. */}
                {bayEarned && bayEarned.twins != null ? (
                  <div style={{ fontFamily: FONT_TOY, fontSize: 14, fontWeight: 800, color: M.accent, marginTop: 8 }}>
                    {twinWords(bayEarned.twins)}
                  </div>
                ) : null}
                {bayStatusNow.kind === "shop" ? (
                  <div style={{ fontSize: 12.5, color: M.warn, marginTop: 6 }}>{fill(t.garageUi.repairLine, { time: formatLeft(bayStatusNow.leftMs) })}</div>
                ) : null}
              </div>
            </div>
            {/* how this one is doing today. It is what makes the robot in
                spot 1 a different creature from the robot in spot 2. */}
            <div style={{ fontFamily: FONT_TOY, fontSize: 16, fontWeight: 800, lineHeight: 1.35, color: M.text }}>
              {moodLine(
                nameText(bayBuild.name),
                sheet.bay,
                bayStatusNow,
                bayRecord.wins + bayRecord.losses,
              )}
            </div>
            <EarnedBlock
              name={nameText(bayBuild.name)}
              row={bayEarned}
              asked={earnedAsked}
              onWatch={(id) => router.push(`/bots/fight/${id}`)}
            />
            <div style={{ borderTop: `1px solid ${M.border}` }} />
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: "0.32em", color: M.muted }}>{t.garageUi.lastFights}</div>
            {(FIGHTS[sheet.bay] ?? []).length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {(FIGHTS[sheet.bay] ?? []).map((f) => (
                  <div key={f.id} style={{ display: "grid", gridTemplateColumns: "10px 1fr auto auto", gap: 10, alignItems: "center", minHeight: 52 }}>
                    <Dot color={f.result === "win" ? M.good : M.bad} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {fill(f.result === "win" ? t.garageUi.beat : t.garageUi.lostTo, { bot: f.opponent })}
                        {/* was " . ", the lone full stop used as a divider:
                            a screen reader and a translation memory both read
                            it as the end of a sentence (the standing law in
                            strings.ts). A comma is the same shape and true. */}
                        <span style={{ color: M.muted }}>, {f.wallet}</span>
                      </span>
                      <span style={{ display: "block", fontFamily: FONT_MONO, fontSize: 11, color: M.muted }}>
                        {f.finisher}. {f.date}
                      </span>
                    </span>
                    <Button onClick={() => router.push(`/bots/fight/${f.id}`)} style={{ minHeight: TAP, padding: "0 12px" }}>
                      <IconPlay size={16} />
                      {t.garageUi.watch}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 12.5, color: M.muted }}>{t.garageUi.noFights}</p>
            )}
            <div style={{ borderTop: `1px solid ${M.border}` }} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Button variant="primary" onClick={() => router.push(`/bots/garage/build?bay=${sheet.bay}`)}>
                {t.nav.build}
              </Button>
              <Button disabled={bayStatusNow.kind !== "ready"} onClick={() => router.push(`/bots/battles?bot=${sheet.bay}`)}>
                {t.build.toBattle}
              </Button>
              <span style={{ marginLeft: "auto" }}>
                <Button variant="sell" onClick={() => setSheet({ kind: "recycle", bay: sheet.bay })}>
                  <IconRecycle size={16} />
                  {t.garageUi.recycle}
                </Button>
              </span>
            </div>
          </div>
        </Sheet>
      ) : null}

      {sheet?.kind === "recycle" && bayBuild && recycle ? (
        <Sheet title={fill(t.recycle.title, { bot: nameText(bayBuild.name) })} onClose={() => setSheet({ kind: "bay", bay: sheet.bay })}>
          <p style={{ margin: "0 0 10px", fontSize: 13.5 }}>{t.recycle.back}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontFamily: FONT_MONO, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            {recycle.rows.map((r) => (
              <div key={r.part.uid} style={{ display: "grid", gridTemplateColumns: "1fr 10px 104px 60px", gap: 10, alignItems: "center", minHeight: 28 }}>
                <span style={{ fontFamily: FONT_BODY, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {/* the title already ends with the socket word, so adding
                      it again read "Spark 3 Legs legs" */}
                  {r.part.name}
                  {r.count === 2 ? ` ${t.garageUi.pair}` : ""}
                </span>
                <Dot color={TIER_COLOR[r.part.tier]} />
                <span style={{ color: M.muted }}>{fillWords(SCREEN_WORDS.points, { n: r.part.s[0] + r.part.s[1] + r.part.s[2] })}</span>
                <span style={{ textAlign: "right" }}>{r.coins}</span>
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${M.border}`, marginTop: 6, paddingTop: 8, display: "grid", gridTemplateColumns: "1fr 60px", gap: 10 }}>
              <span style={{ color: M.muted }}>{t.garageUi.total}</span>
              <span style={{ textAlign: "right" }}>{recycle.total}</span>
            </div>
          </div>
          <p style={{ margin: "12px 0 4px", fontSize: 12.5, color: M.muted }}>{fill(t.recycle.note, { n: sheet.bay })}</p>
          {/* THE MARKS GO TOO, and the sheet says so BEFORE the button. The
              list above turns every part back into coins, which reads like a
              full account of what is being given up; the stars and the
              patches are the half of it that turns into nothing. It is only
              said when the server says there is something to lose, so a
              brand new robot is not warned about a star it has not got. */}
          {bayEarned && shelfSummary(bayEarned.marks, bayEarned.earned.wins) ? (
            <p style={{ margin: "0 0 12px", fontSize: 12.5, color: M.warn }}>{t.recycle.marks}</p>
          ) : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="sell" onClick={() => doRecycle(sheet.bay)}>
              {fill(t.recycle.confirm, { coins: recycle.total })}
            </Button>
            <Button onClick={() => setSheet({ kind: "bay", bay: sheet.bay })}>{t.recycle.keep}</Button>
          </div>
        </Sheet>
      ) : null}

      {sheet?.kind === "tools" ? (
        <Sheet title={t.garageUi.toolBoard} onClose={() => setSheet(null)} action={<span style={{ fontFamily: FONT_MONO, fontSize: 12, color: M.muted }}>{fill(t.garageUi.spares, { n: spares.length })}</span>}>
          {spares.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {spares.map((p) => (
                <SpareRow key={p.uid} part={p} onClick={() => setSheet({ kind: "part", uid: p.uid })} />
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 12.5, color: M.muted }}>{t.garageUi.noSpares}</p>
          )}
        </Sheet>
      ) : null}

      {sheet?.kind === "part" && sparePart ? (
        <Sheet title={sparePart.name} onClose={() => setSheet(null)}>
          <SpareLore
            part={sparePart}
            onPutOn={() => setSheet({ kind: "pickBay", uid: sparePart.uid })}
            onRecycle={() => {
              const r = recyclePart(sparePart.uid);
              setSheet(null);
              if (r) say(fill(t.garageUi.recycledPart, { name: sparePart.name, coins: r.coins }));
            }}
          />
        </Sheet>
      ) : null}

      {sheet?.kind === "pickBay" && sparePart ? (
        <Sheet title={t.garageUi.pickBay} onClose={() => setSheet({ kind: "part", uid: sparePart.uid })}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {bays
              .filter((b) => st.builds[b])
              .map((b) => (
                <Button
                  key={b}
                  full
                  onClick={() => {
                    if (putOnBay(sparePart.uid, b)) {
                      setSheet(null);
                      say(fill(t.garageUi.swapped, { name: sparePart.name, n: b }));
                    }
                  }}
                >
                  {fill(t.garageUi.putOn, { n: b })}, {nameText(st.builds[b].name)}
                </Button>
              ))}
          </div>
        </Sheet>
      ) : null}

      {sheet?.kind === "crew" && crewCard ? (
        <Sheet title={fill(t.garageUi.crewTitle, { kind: t.garageUi.strategyKind[crewCard.kind] })} onClose={() => setSheet(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13.5 }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fill(t.garageUi.crewFills, { n: crewCard.fillsToday })}</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fill(t.garageUi.crewCoins, { n: crewCard.coinsToday })}</div>
            <div style={{ color: M.lore }}>{fill(t.garageUi.crewTokens, { tokens: crewCard.tokens.join(", ") })}</div>
            <div>
              <Button onClick={() => router.push("/bots/strategy")}>{t.garageUi.changeStrategy}</Button>
            </div>
          </div>
        </Sheet>
      ) : null}
    </PageShell>
  );
}

/**
 * WHAT IT EARNED: the list on a robot's own page, and the cards it has won.
 *
 * WHY IT IS HERE AT ALL. Everything a robot wears that it could not buy was
 * invisible outside the robot itself: a player could see a star on a chest
 * and had no way to find out what it was, what the next one costs, or that
 * there was a hat in the game at all. A locked row with its one line is the
 * whole answer, and it is the only place the game says what is coming.
 *
 * EVERY ROW IS THE SERVER'S (the ninth law). `row` is what
 * GET /api/bots/earned answered for this spot; null means the page could not
 * ask or was refused, and then EVERY row is locked and nothing is claimed.
 * The rows themselves are built by src/lib/bots/shelf.ts, which imports the
 * ladder and the earn lines rather than restating them, so a step that moves
 * in look.ts moves here on the same day.
 *
 * NOTHING HERE COUNTS DOWN OR CAPS. The line above the list is markWords(),
 * which keeps counting in words past the last drawn star and the third patch.
 */
function EarnedBlock({
  name,
  row,
  asked,
  onWatch,
}: {
  name: string;
  row: EarnedBotView | null;
  asked: boolean;
  onWatch: (fightId: string) => void;
}) {
  const rows = shelfRows(row?.earned ?? null, row?.marks);
  const summary = row ? shelfSummary(row.marks, row.earned.wins) : "";
  return (
    <>
      <div style={{ borderTop: `1px solid ${M.border}` }} />
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: "0.32em", color: M.muted }}>{t.earned.title}</div>
      {row && summary ? (
        <div style={{ fontFamily: FONT_TOY, fontSize: 16, fontWeight: 800, lineHeight: 1.35, color: M.text }}>{summary}</div>
      ) : null}
      {row && !summary ? <p style={{ margin: 0, fontSize: 12.5, color: M.muted }}>{shelfNothing(name)}</p> : null}
      {!row && asked ? <p style={{ margin: 0, fontSize: 12.5, color: M.muted }}>{t.earned.connect}</p> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 10, alignItems: "start", opacity: r.earned ? 1 : 0.55 }}>
            <span aria-hidden style={{ color: r.earned ? M.accent : M.muted, display: "grid", marginTop: 2 }}>
              {r.earned ? <IconStar size={15} /> : <IconLock size={15} />}
            </span>
            <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: r.earned ? 700 : 400 }}>
                {r.name}
                {/* "Not yet" IS A CLAIM, so it is only made when the server
                    answered. With no wallet to ask about, the list is what a
                    robot CAN earn and the line above says to connect; saying
                    "not yet" there would be the screen telling a player their
                    robot has nothing when it has never been looked up. */}
                {row && !r.earned ? (
                  <span style={{ fontFamily: FONT_MONO, fontSize: 10.5, letterSpacing: "0.12em", color: M.muted }}>{t.look.locked}</span>
                ) : null}
              </span>
              <span style={{ fontSize: 12, color: M.lore, lineHeight: 1.4 }}>{r.earn}</span>
            </span>
          </div>
        ))}
      </div>
      {/* THE CARDS. battle_bots_cards has been keeping a signed row for every
          first win since the game opened and nothing ever read one back, so
          the keepsake existed and the player could not see it. The route
          checks each signature before it hands one over. */}
      {row ? (
        <>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: "0.32em", color: M.muted, marginTop: 4 }}>{t.earned.cards}</div>
          {row.cards.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {row.cards.map((c) => (
                <div key={`${c.kind}-${c.fightId}-${c.at}`} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "8px 10px", borderRadius: R.inner, border: `1px solid ${M.border}`, background: M.surface2 }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 700 }}>
                      {c.kind === CROWN_CARD_KIND ? t.earned.crownCard : t.earned.firstWin}
                    </span>
                    <span style={{ display: "block", fontSize: 12, color: M.lore, lineHeight: 1.4 }}>
                      {c.kind === CROWN_CARD_KIND
                        ? fill(t.earned.crownCardLine, { name: c.botName || name })
                        : fill(t.earned.firstWinLine, { name: c.botName || name, bot: c.beat })}
                    </span>
                  </span>
                  {c.fightId ? (
                    <Button onClick={() => onWatch(c.fightId)} style={{ minHeight: TAP, padding: "0 12px" }}>
                      <IconPlay size={16} />
                      {t.garageUi.watch}
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 12.5, color: M.muted }}>{t.earned.noCards}</p>
          )}
        </>
      ) : null}
    </>
  );
}

/** The lore card for a spare part (screens doc 5.1) with the tool board's two buttons. */
function SpareLore({ part, onPutOn, onRecycle }: { part: OwnedPart; onPutOn: () => void; onRecycle: () => void }) {
  const color = TIER_COLOR[part.tier];
  const keys = SLOT_STATS[part.slot];
  const lead = leadStat(part.slot, [part.s[0], part.s[1], part.s[2]]);
  const brand = part.slot === "weapon" ? (BRAND_OF_WEAPON[part.id] ?? null) : part.family ? (BRAND_OF_FAMILY[part.family] ?? null) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <span style={{ width: 96, height: 96, borderRadius: 14, border: `3px solid ${color}`, background: `linear-gradient(180deg, ${K.paper}, ${K.floor})`, display: "grid", placeItems: "center", flex: "0 0 auto" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={partArt(part).base} alt="" style={{ width: 80, height: 80, objectFit: "contain" }} />
        </span>
        <div style={{ minWidth: 0 }}>
          {/* the socket word first: the sheet says which part this is before
              it says anything else */}
          <div style={{ fontFamily: FONT_MONO, fontSize: 10.5, letterSpacing: "0.22em", textTransform: "uppercase", color: color, fontWeight: 700 }}>
            {t.ui.card[part.slot]}
          </div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 700 }}>{part.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: FONT_MONO, fontSize: 11, color: M.muted, marginTop: 4 }}>
            <Dot color={color} />
            {fillWords(SCREEN_WORDS.points, { n: partTotal(part) })}
          </div>
          {/* the title carries the brand and the model number, so this line
              carries only the colour */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: FONT_MONO, fontSize: 11, color: M.muted, marginTop: 4 }}>
            {part.paint ? <span aria-hidden style={{ width: 9, height: 9, borderRadius: R.pill, background: PAINTS[part.paint], display: "inline-block" }} /> : null}
            {part.paint ? t.paintName[part.paint] : SCREEN_WORDS.noColor}
          </div>
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${M.border}` }} />
      {/* every stat spelled out with the sentence saying what it does. This
          sheet has the room, so nothing is shortened on it. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {keys.map((k, i) => {
          const Icon = STAT_ICON[k];
          const isLead = STAT_NAME_OF[k] === lead.name;
          return (
            <div key={k} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{ color: isLead ? M.accent : M.muted, display: "grid", marginTop: 2 }}>
                <Icon size={16} />
              </span>
              <span style={{ fontSize: 12, color: M.text, flex: 1, lineHeight: 1.4 }}>
                <span style={{ fontWeight: isLead ? 700 : 400 }}>{t.ui.stat[k]}</span>
                <span style={{ color: M.muted }}> {STAT_MEANING[STAT_NAME_OF[k]]}</span>
              </span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 15, fontVariantNumeric: "tabular-nums", fontWeight: isLead ? 700 : 400 }}>{part.s[i]}</span>
            </div>
          );
        })}
      </div>
      {brand ? (
        <p style={{ margin: 0, fontSize: 12, color: M.lore, lineHeight: 1.45 }}>
          <span style={{ fontWeight: 700, color: M.text }}>{BRAND_INDEX[brand].name}</span>
          <span style={{ color: M.muted }}> ({BRAND_INDEX[brand].short.toLowerCase()}). </span>
          {BRAND_INDEX[brand].character}
        </p>
      ) : (
        <p style={{ margin: 0, fontSize: 12, color: M.muted, lineHeight: 1.45 }}>{SCRAP_NOTE}</p>
      )}
      <div style={{ borderTop: `1px solid ${M.border}` }} />
      <p style={{ margin: 0, fontSize: 12.5, color: M.lore, lineHeight: 1.5 }}>{part.lore}</p>
      <div style={{ borderTop: `1px solid ${M.border}` }} />
      <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: M.muted }}>{part.provenance}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Button variant="primary" onClick={onPutOn}>
          {t.garageUi.putOnAny}
        </Button>
        <Button variant="sell" onClick={onRecycle}>
          {fill(t.part.recycleFor, { coins: recycleValue(part) })}
        </Button>
      </div>
    </div>
  );
}

export type { GarageState };
