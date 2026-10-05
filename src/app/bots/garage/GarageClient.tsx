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
import { ART_PART_LORE } from "@/lib/bots/art-copy";

import { socketUid, equipmentPaints, socketsOf } from "@/lib/bots/equipment";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WorkshopHeading } from "../_components/WorkshopHeading";
import { PageShell } from "../_components/PageShell";
import { GarageCoach } from "../_components/Coach";
import { ColourPips, type SlotColour } from "../_components/ColourPips";
import { FirstMeeting, hasMet } from "../_components/FirstMeeting";
import { LevelBlock } from "../_components/Level";
import { PrideNote } from "../_components/Pride";
import { IconChevron, IconLock, IconPin, IconPlay, IconRecycle, IconStar, STAT_ICON } from "../_ui/icons";
import { Button, ChipTab, CoinChip, Dot, Panel, Sheet, uiCss } from "../_ui/primitives";
import { FONT_BODY, FONT_DISPLAY, FONT_MONO, FONT_TOY, K, M, PAINTS, R, TAP, TIER_COLOR } from "../_ui/tokens";
import type { TagDot } from "../_view/garage";
import { ToyDisplay, PartDisplay } from "../_components/ToyDisplay";
import layout from "./garage.module.css";
import type { Socket } from "@/lib/bots/fixtures";
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
  engineBuild,
  nameText,
  partTotal,
  recycleValue,
  type Build,
  type FightRow,
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
  lookOfBay,
  recycleRows,
  resetGarage,
  saveBuild,
  spareParts,
  useGarage,
  type BayStatus,
  type GarageState,
} from "@/lib/bots/garage-state";
import { STRINGS, fill, spareWord, starWord, winLossWords } from "@/lib/bots/strings";
import { shelfNothing, shelfRows, shelfSummary } from "@/lib/bots/shelf";
import { CROWN_CARD_KIND, hatPaint, ownColours, socketPaints, twinWords } from "@/lib/bots/look";
import type { BotLook as RigLook } from "../_view/look";
import { readBotsSession } from "../battles/session";
import {
  loadPaper,
  recycleBotOnServer,
  saveBotOnServer,
  stateFromMe,
  useLiveGarage,
} from "@/lib/bots/live-garage";
import type { BotName, EarnedBotView, EarnedView, PaperLineView, PaperView } from "../_server/types";
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
/** finisherOf() hands back a fragment; a line that STARTS with it needs a capital. */
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * TODAY, WRITTEN THE WAY THE PAPER WRITES IT.
 *
 * The fixture's date is a fixed string, so the Morning Paper (the panel, the
 * sheet AND the sheet of paper pinned to the corkboard in the room) said
 * "Thursday 3 September" for as long as the fixture stood. A paper dated last
 * week is the one thing on this screen a visitor can prove is not real, so the
 * day is read off the clock instead, in the fixture's own shape.
 *
 * WRITTEN OUT HERE, NOT ASKED OF THE BROWSER. toLocaleDateString hands back
 * whatever the visitor's machine is set to, which is another language on a lot
 * of machines and a comma and a year on plenty of the English ones, and this
 * string sits beside copy that is checked word by word.
 *
 * NOBODY CALLS IT WHILE RENDERING. A date read during render is a different
 * answer on the server and in the browser, which is a hydration mismatch; the
 * one caller is an effect, and the first paint keeps the fixture's day.
 */
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;
function todaysDate(now: Date): string {
  return `${DAY_NAMES[now.getDay()]} ${now.getDate()} ${MONTH_NAMES[now.getMonth()]}`;
}


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

/** one frozen empty list, so a screen that has no fight rows does not hand a
 *  fresh array to a memo on every render */
const NO_FIGHTS: readonly FightRow[] = [];
/** the same, for a paper with nothing in it yet */
const NO_PAPER: readonly PaperLineView[] = [];

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
 * win the garage did not have. `last` is handed IN rather than read here,
 * because the only fight list this screen has is a fixture and a signed in
 * player must not be told about a fight that never happened.
 */
function moodLine(name: string, bay: number, s: BayStatus, fought: number, last: FightRow | null): string {
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
        <PartDisplay part={part} ariaLabel={part.name}/>
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
  /**
   * WHOSE GARAGE IS ON SCREEN (the same rule the parts screen already
   * follows). A signed in player reads their own rows through GET
   * /api/bots/me; a visitor with no wallet reads the demo garage they have
   * always had and can still walk around the whole place. The two never mix:
   * one object goes down to every panel, every sheet and every rig below.
   *
   * WHY THE WHOLE SCREEN AND NOT JUST A NUMBER. Selling a robot writes a row
   * and frees a spot on the server, so a screen still drawing the demo would
   * have shown the sold robot still standing there. The state has to be the
   * one the button changes.
   */
  const demo = useGarage(mountNow.current);
  const live = useLiveGarage();
  const firstBuildStep = live.me?.onboarding?.step;
  useEffect(() => {
    // A paused rollout must not strand the reserved first-build allowance.
    if (firstBuildStep && firstBuildStep !== "complete") router.replace("/bots/welcome");
  }, [firstBuildStep, router]);
  const st = useMemo(() => (live.me ? stateFromMe(live.me) : demo), [live.me, demo]);
  /**
   * THIS BROWSER BELONGS TO A SIGNED IN PLAYER.
   *
   * It turns true the moment a token is FOUND, not when the answer lands,
   * and the two are deliberately different: between them the screen is still
   * drawing the demo garage, and in that window nothing may offer an action
   * that would write into a browser a real player is never going to read
   * again. Every button below asks this, and the ones that spend or delete
   * ask the token again at the moment of the press.
   */
  const isLive = live.signedIn || !!live.me;
  /**
   * THE GARAGE ON SCREEN IS THE ONE THIS BROWSER SHOULD BE LOOKING AT.
   *
   * False for exactly one moment: a signed in player whose own answer has
   * not arrived, who is looking at the demo garage until it does. The two
   * cards that NAME a robot and link somewhere are held back until this is
   * true, because meeting somebody else's fixture robot, or being offered a
   * fight that does not exist, is worse than a card arriving a moment late.
   */
  const known = !!live.me || !live.signedIn;
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
  const [photoKeys,setPhotoKeys] = useState<Record<number,string>>({});
  const [focus, setFocus] = useState(1);
  const [centre, setCentre] = useState<number>(ME.garageNo);
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
  /** the paper's day: the fixture's until the browser is up, then today's */
  const [paperDate, setPaperDate] = useState(PAPER.date);
  useEffect(() => {
    setPaperDate(todaysDate(new Date()));
  }, []);
  /**
   * LAST NIGHT, AS IT REALLY WENT (GET /api/bots/paper).
   *
   * The five lines under the masthead were fixtures, two of them invented
   * trades, and they said the same five things every morning to everybody.
   * The route builds the real digest off rows: who challenged the saved copy
   * of each robot and how it went, the stars and patches that appeared while
   * the player was away, a hat one of the fights handed over, robots that
   * came back from being fixed, and how many parts are for sale today. It
   * also drops the mark that says today has been read, which is a zero coin
   * row: nothing moves, and reading twice costs nothing.
   *
   * NULL KEEPS THE DEMO. Nobody signed in, a session that ran out, or a
   * route that could not answer all land the same way, and the visitor's
   * paper is the one that has always been there.
   */
  const [paperView, setPaperView] = useState<PaperView | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const v = await loadPaper();
      if (alive) setPaperView(v);
    })();
    return () => {
      alive = false;
    };
  }, []);
  // A SIGNED IN PLAYER NEVER READS THE FIXTURE PAPER, not even for the
  // moment before their own arrives: those five lines carry a Watch button
  // that opens a fight nobody ever fought. The masthead stands with nothing
  // under it until the route answers, and stays empty if it never does.
  const paperLines: readonly PaperLineView[] = paperView ? paperView.lines : isLive ? NO_PAPER : PAPER.lines;
  const paperDay = paperView?.date ?? paperDate;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const streetWrapRef = useRef<HTMLDivElement | null>(null);
  const streetRef = useRef<HTMLCanvasElement | null>(null);
  const streetHandle = useRef<StreetHandle | null>(null);

  const say = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 1800);
  }, []);

  // ── derived ─────────────────────────────────────────────────────────────
  /**
   * ONE ROBOT'S LAST FIGHTS, WHICH ONLY THE DEMO HAS.
   *
   * These five rows are fixtures, and no route hands back the fights of one
   * robot, so a signed in player gets an empty list and the screen says "No
   * fights yet" rather than five fights with somebody else's names on them
   * and Watch buttons that open nothing.
   */
  const fightsOf = useCallback(
    (bay: number): readonly FightRow[] => (isLive ? NO_FIGHTS : FIGHTS[bay] ?? NO_FIGHTS),
    [isLive],
  );
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

  // The garage is a gallery of complete photographs. All cards share one
  // offscreen WebGL renderer, so five bays cannot exhaust browser contexts.
  useEffect(() => {
    setReady(true);
  },[]);
  const photoReady=useCallback((bay:number,key:string)=>{
    setPhotoKeys(previous=>previous[bay]===key?previous:{...previous,[bay]:key});
  },[]);

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
      const sp = row?.paints ?? equipmentPaints(build, st.parts);
      const paint: Partial<Record<Socket, number>> = {};
      for (const socket of SOCKETS) {
        const id = sp[socket];
        if (id) paint[socket] = hexNum(PAINTS[id]);
      }
      const own = ownColours(SOCKETS.filter(socket => socket !== "weapon").map(socket => sp[socket] ?? null));
      const look = row?.look ?? lookOfBay(st, bay);

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

  const gallery=useMemo(()=>Object.fromEntries(bays.map(bay=>{
    const robot=st.builds[bay];
    if(!robot)return [bay,null];
    const build=engineBuild(robot,st.parts),look=lookForBay(bay,robot);
    return [bay,{build,look,key:JSON.stringify({build,look})}];
  })),[bays,st.builds,st.parts,lookForBay]);
  const artDone=bays.every(bay=>!gallery[bay]||photoKeys[bay]===gallery[bay].key);

  /** the spot the player's first robot is standing in: the lowest numbered
   * one that has a robot in it at all */
  const meetBay = useMemo(() => bays.find((b) => st.builds[b]) ?? null, [bays, st.builds]);

  useEffect(() => {
    setMet(hasMet());
  }, []);

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

  /**
   * THE FIRST NAME A PLAYER TYPES.
   *
   * The meeting card is the moment the robot turns out to be theirs, and the
   * name went into the browser: a signed in player typed a name, watched it
   * appear, and lost it on the next reload. It goes to POST
   * /api/bots/bot/save now, which is the one route that names a robot, and
   * everything else about the robot is handed straight back off its own row
   * so a rename changes the name and nothing else. A save that is refused
   * says so rather than pretending.
   */
  const rename = async (bay: number, name: BotName) => {
    const build = st.builds[bay];
    if (!build) return;
    if (!isLive && !readBotsSession()) {
      saveBuild({ ...build, name });
      return;
    }
    const me = live.me;
    const bot = me?.bots.find((b) => b.bay === bay) ?? null;
    if (!me || !bot) {
      say(t.ui.tryAgain);
      void live.refresh();
      return;
    }
    const r = await saveBotOnServer({
      bay,
      name,
      decal: bot.decal,
      paint: bot.paint,
      listed: bot.listed,
      parts: bot.parts,
      ...(bot.sockets ? { sockets: bot.sockets } : {}),
      look: bot.look,
    });
    if (r.ok) void live.refresh();
    else say(r.message ?? t.enlist.signedOut);
  };

  const newBot = () => {
    const b = firstEmptyBay(st);
    if (b == null) {
      say(t.garage.full);
      return;
    }
    router.push(`/bots/garage/build?bay=${b}`);
  };

  /**
   * SELL A WHOLE ROBOT.
   *
   * SIGNED IN, THE SERVER DOES IT. POST /api/bots/bot/recycle prices every
   * card on the robot off its own stored price, pays the lot back through ONE
   * grant keyed to that robot (so a second press cannot pay twice), deletes
   * the cards and the row, and frees the spot. Nothing here re-prices
   * anything: the coins in the toast are the coins the route paid, and the
   * screen is re-read from /me afterwards so the empty stand, the coin chip
   * and the level all come back together.
   *
   * SIGNED OUT, NOTHING CHANGES. The demo garage sells into the browser, the
   * way a visitor with no wallet has always been able to try it.
   */
  const selling = useRef(false);
  const doRecycle = async (b: number) => {
    const build = st.builds[b];
    if (!build || selling.current) return;
    const name = nameText(build.name);
    // decided at the moment of the press, never at render: a session that ran
    // out while this sheet sat open is told so, not quietly moved into the
    // demo garage where it would sell a robot nobody can see
    if (isLive || readBotsSession()) {
      const bot = live.me?.bots.find((x) => x.bay === b) ?? null;
      // a token but no answer: this screen does not know which row that robot
      // is, and guessing an id is not a thing to do with a delete
      if (!bot) {
        say(t.ui.tryAgain);
        void live.refresh();
        return;
      }
      selling.current = true;
      setSheet(null);
      try {
        const r = await recycleBotOnServer(bot.id);
        await live.refresh();
        if (!r.ok) {
          say(r.message ?? t.enlist.signedOut);
          return;
        }
        say(fill(t.garageUi.recycledBot, { bot: name, coins: r.value.coins, n: b }));
      } finally {
        selling.current = false;
      }
      return;
    }
    const r = recycleBay(b);
    if (!r) return;
    setSheet(null);
    say(fill(t.garageUi.recycledBot, { bot: name, coins: r.coins, n: b }));
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
      speak: (who: StrategyKind, text?: string) => say(text ?? fill(t.garageUi.speech, { n: 14 })),
      focus: (b: number) => setFocus(b),
      reset: () => resetGarage(Date.now()),
      state: () => ({ coins: st.coins, bays: statuses, spares: spares.length }),
      /** which rigs are on their stands (the beauty gate's three painted bots) */
      bots: () => bays.map(b => !!st.builds[b]),
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
  const paperLine = (line: PaperLineView, i: number) => (
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
          <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: "#8a7a63", textAlign: "center", marginBottom: 10 }}>{paperDay}</div>
          <div style={{ borderTop: "1px solid #cdbf9f", marginBottom: 6 }} />
        </>
      ) : null}
      {(full ? paperLines : paperLines.slice(0, 2)).map(paperLine)}
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
    if (row) return (["head","torso","armL","armR","legL","legR"] as const).map((s) => ({ slot: s, color: (row.paints[s] ?? null) as SlotColour["color"] }));
    return build
      ? (["head","torso","armL","armR","legL","legR"] as const).map((s) => {
          const uid = socketUid(build,s);
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
  /**
   * THE LEVEL ON THE OPEN SHEET, and the fight total behind it.
   *
   * The robot's own row when there is one: a level belongs to a robot, not
   * to a garage, and two robots in one garage are almost never on the same
   * one. The demo has a single garage level and no total, so it draws the
   * level and no bar, which is the honest picture of a garage that has
   * nothing to measure.
   */
  const bayLevel =
    sheet?.kind === "bay" || sheet?.kind === "recycle"
      ? (() => {
          const row = live.me?.bots.find((b) => b.bay === sheet.bay) ?? null;
          return row ? { level: row.level, xp: row.xp as number | null } : { level: st.level, xp: null };
        })()
      : { level: st.level, xp: null };
  const recycle = sheet?.kind === "recycle" ? recycleRows(st, sheet.bay) : null;
  const sparePart = sheet?.kind === "part" || sheet?.kind === "pickBay" ? partByUid(st, sheet.uid) : null;
  const crewCard = sheet?.kind === "crew" ? st.crew.find((c) => c.kind === sheet.who) ?? null : null;

  return (
    <PageShell wide>
      <WorkshopHeading eyebrow="YOUR GARAGE" title="A little place to call home." description="Build something odd. Look after it. Come back for more." />
      {/* ── MEET YOUR ROBOT ───────────────────────────────────────────────
          The first thing on the first visit, and never again after that.
          A player arrives owning a robot; this is the moment it wakes up,
          turns out to have a name, and turns out to be theirs. */}
      {known && met === false && meetBay != null && st.builds[meetBay] ? (
        <FirstMeeting
          name={st.builds[meetBay].name}
          spot={meetBay}
          picture={meetImg}
          onRename={(name) => void rename(meetBay, name)}
          onDone={() => setMet(true)}
        />
      ) : null}

      {/* ── SPROCKET ROW ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 10px" }}>
        <button className={uiCss.press} onClick={() => walk(-1)} aria-label={t.garageUi.walkLeft} title={t.garageUi.walkLeft} style={{ width: TAP, height: TAP, display: "grid", placeItems: "center", borderRadius: R.pill, border: `1px solid ${M.border}`, background: M.surface, color: M.muted, cursor: "pointer", transform: "scaleX(-1)" }}>
          <IconChevron size={18} />
        </button>
        <span style={{ flex: 1, textAlign: "center", fontFamily: FONT_MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: M.muted }}>
          {t.garageUi.street}, {fill(t.garage.title, { n: String(centre).padStart(4, "0") })}
          {centre === ME.garageNo ? `, ${t.garageUi.yourDoor}` : ""}
        </span>
        <button className={uiCss.press} onClick={() => walk(1)} aria-label={t.garageUi.walkRight} title={t.garageUi.walkRight} style={{ width: TAP, height: TAP, display: "grid", placeItems: "center", borderRadius: R.pill, border: `1px solid ${M.border}`, background: M.surface, color: M.muted, cursor: "pointer" }}>
          <IconChevron size={18} />
        </button>
      </div>
      {/* THE STRIP IS AS TALL AS A WHOLE GARAGE IS. The band it crops
          (setdressing.ts STREET) is 680 source px for 2720 across, so at the
          1400 the page gives it a whole door row lands in 350 and the plate
          shows exactly one tile: no seam, and the art's own composition. At
          80 and 170 the same band could only have shown roofs and half a
          door, which is what it did. */}
      <div ref={streetWrapRef} className={layout.street} style={canvasFrame}>
        <canvas ref={streetRef} style={{ display: "block", width: "100%", height: "100%" }} />
      </div>
      <GarageCoach state={st} />
      {/* the proud moments: one warm line for the first win, the first time
          all four colours matched, and the first 4 star part. Said once, and
          never in the same breath as meeting the robot for the first time. */}
      {known && met ? <PrideNote state={st} demo={!isLive} lookForBay={lookForBay} /> : null}

      {/* ── THE GARAGE ────────────────────────────────────────────────── */}
      <div ref={wrapRef} className={layout.collection} style={{marginTop:16,borderRadius:24,background:"#342b23",border:"1px solid #66513b",boxShadow:"0 16px 45px #0003"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:16,color:"#ece1cb"}}>
          <span style={{fontFamily:FONT_DISPLAY,fontSize:22,fontWeight:700}}>Your little collection</span>
          <span style={{fontFamily:FONT_MONO,fontSize:11,letterSpacing:".12em"}}>GARAGE {ME.garageNo}</span>
        </div>
        <div className={layout.gallery}>
          {bays.map((bay,i)=>{
            const robot=st.builds[bay],photo=gallery[bay];
            const name=robot?nameText(robot.name):fill(t.ui.bayLabel,{n:bay});
            return <button key={bay} onClick={()=>{setFocus(bay);openBay(bay);}}
              aria-label={robot?`Open ${name}`:`Build a robot in spot ${bay}`}
              style={{display:"block",position:"relative",minWidth:0,padding:0,textAlign:"left",background:"#e9dfcc",color:"#514331",border:focus===bay?"2px solid #d4b475":"2px solid transparent",borderRadius:18,overflow:"hidden",cursor:"pointer",scrollSnapAlign:"center",boxShadow:"0 9px 20px #24170e55"}}>
              <div className={layout.portrait}>
                {robot&&photo?<ToyDisplay build={photo.build} look={photo.look}
                  ariaLabel={name} onReady={()=>photoReady(bay,photo.key)}
                  onCapture={met===false&&bay===meetBay?setMeetImg:undefined}/>
                  :<div style={{height:"100%",display:"grid",placeContent:"center",textAlign:"center",gap:14,background:"linear-gradient(145deg,#eae0cd,#dcd1b9)"}}><span style={{fontSize:46,fontWeight:300,color:"#9b947d"}}>+</span><span style={{fontFamily:FONT_DISPLAY,fontSize:18}}>Room for one more.</span></div>}
                <span style={{position:"absolute",top:12,left:13,fontFamily:FONT_MONO,fontSize:10,letterSpacing:".14em",color:"#817b66"}}>0{bay}</span>
              </div>
              <div style={{padding:"14px 14px 16px",borderTop:"1px solid #c9bea466",background:"#e6dcc6"}}>
                <strong className={layout.robotName} style={{display:"block",fontFamily:FONT_DISPLAY,lineHeight:1.2,marginBottom:7}}>{name}</strong>
                <span style={{fontFamily:FONT_BODY,fontSize:12,color:"#857259"}}>{chipOf(statuses[i]).text}</span>
              </div>
            </button>;
          })}
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:16}}>
          <Button onClick={()=>setSheet({kind:"paper"})}>{t.garageUi.paperChip}</Button>
          <Button onClick={()=>setSheet({kind:"tools"})}>{t.garageUi.partsChip}</Button>
          {st.crew.map(crew=><Button key={crew.kind} onClick={()=>setSheet({kind:"crew",who:crew.kind})}>{t.garageUi.strategyKind[crew.kind]}</Button>)}
        </div>
      </div>

      {/* ── the three panels (desktop) ────────────────────────────────────── */}
      <div className={uiCss.desktopOnly} style={{ marginTop: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 440fr) minmax(0, 500fr) minmax(0, 420fr)", gap: 20, alignItems: "start" }}>
          <Panel title={t.garage.paper} aside={<span style={{ fontFamily: FONT_MONO, fontSize: 12, color: M.muted }}>{paperDay}</span>}>
            {paper(false)}
            <div style={{ marginTop: 10 }}>
              <Button onClick={() => setSheet({ kind: "paper" })}>{t.garageUi.readAll}</Button>
            </div>
          </Panel>
          <Panel title={t.garageUi.bays} aside={<Button onClick={newBot} style={{ minHeight: 34, padding: "6px 12px", fontSize: 12.5 }}>{t.garageUi.newBot}</Button>}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{bays.map((b, i) => bayRow(b, i, false))}</div>
          </Panel>
          <Panel title={t.garageUi.toolBoard} aside={<span style={{ fontFamily: FONT_MONO, fontSize: 12, color: M.muted }}>{spareWord(spares.length)}</span>}>
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
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: M.muted }}>{t.garageUi.bays}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CoinChip coins={st.coins} ariaLabel={t.nav.coinsAria} />
            <Button onClick={newBot} style={{ minHeight: TAP, padding: "6px 12px", fontSize: 12.5 }}>{t.garageUi.newBot}</Button>
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
              <span className={layout.sheetPortrait} style={{ borderRadius: 14, border: `1px solid ${M.border}`, display:"block", flex:"0 0 auto", overflow:"hidden" }}>
                <ToyDisplay build={engineBuild(bayBuild,st.parts)} look={lookForBay(sheet.bay,bayBuild)} ariaLabel={nameText(bayBuild.name)}/>
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
                // FIGHTS rows are newest first (fixtures.ts), so [0] is the
                // last one; a signed in player has none of them
                fightsOf(sheet.bay)[0] ?? null,
              )}
            </div>
            {/* WHAT LEVEL THIS ROBOT IS ON, and what going up opens. It sits
                between how the robot is doing and what it has earned, which
                is where the rest of its own numbers already are. The level is
                the row's; the fight total beside it is the row's too, and
                with no row there is a level and no bar, which is exactly what
                the demo garage knows about itself. */}
            <LevelBlock level={bayLevel.level} xp={bayLevel.xp} />
            <EarnedBlock
              name={nameText(bayBuild.name)}
              row={bayEarned}
              asked={earnedAsked}
              onWatch={(id) => router.push(`/bots/fight/${id}`)}
            />
            <div style={{ borderTop: `1px solid ${M.border}` }} />
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: "0.12em", color: M.muted }}>{t.garageUi.lastFights}</div>
            {fightsOf(sheet.bay).length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {fightsOf(sheet.bay).map((f) => (
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
                        {capital(f.finisher)}. {f.date}
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
            <Button variant="sell" onClick={() => void doRecycle(sheet.bay)}>
              {fill(t.recycle.confirm, { coins: recycle.total })}
            </Button>
            <Button onClick={() => setSheet({ kind: "bay", bay: sheet.bay })}>{t.recycle.keep}</Button>
          </div>
        </Sheet>
      ) : null}

      {sheet?.kind === "tools" ? (
        <Sheet title={t.garageUi.toolBoard} onClose={() => setSheet(null)} action={<span style={{ fontFamily: FONT_MONO, fontSize: 12, color: M.muted }}>{spareWord(spares.length)}</span>}>
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
            live={isLive}
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
                    // A ROBOT IS SAVED WHOLE OR NOT AT ALL. There is one
                    // route that puts a card on a robot and it saves the
                    // whole robot with it, which is the build screen's job,
                    // so a real garage opens that spot instead of moving a
                    // card in a browser and losing it on the next reload.
                    if (isLive) {
                      router.push(`/bots/garage/build?bay=${b}`);
                      return;
                    }
                    if (putOnBay(sparePart.uid, b)) {
                      setSheet(null);
                      say(fill(t.garageUi.swapped, { name: sparePart.name, n: b }));
                    }
                  }}
                >
                  {fill(isLive ? t.garageUi.buildOn : t.garageUi.putOn, { n: b })}, {nameText(st.builds[b].name)}
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
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: "0.12em", color: M.muted }}>{t.earned.title}</div>
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
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: "0.12em", color: M.muted, marginTop: 4 }}>{t.earned.cards}</div>
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

/**
 * The lore card for a spare part (screens doc 5.1) with the tool board's two
 * buttons.
 *
 * `live` means this part is a row, not a browser entry, and it turns the sell
 * button into a sentence. THERE IS NO ROUTE THAT SELLS ONE LOOSE CARD: the
 * only thing that pays coins back is selling a whole robot
 * (/api/bots/bot/recycle), which prices every card on it and deletes the row.
 * A button that took a card out of a browser and paid coins nobody banked
 * would be a lie that survives until the next reload, so the action is not
 * offered and the sheet says why in one line. Whoever picks this up next:
 * this is the place a "sell one card" route would land, and until there is
 * one there is nothing here to call.
 */
function SpareLore({
  part,
  live = false,
  onPutOn,
  onRecycle,
}: {
  part: OwnedPart;
  live?: boolean;
  onPutOn: () => void;
  onRecycle: () => void;
}) {
  const color = TIER_COLOR[part.tier];
  const keys = SLOT_STATS[part.slot];
  const lead = leadStat(part.slot, [part.s[0], part.s[1], part.s[2]]);
  const brand = part.slot === "weapon" ? (BRAND_OF_WEAPON[part.id] ?? null) : part.family ? (BRAND_OF_FAMILY[part.family] ?? null) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <span style={{ width: 96, height: 96, borderRadius: 14, border: `3px solid ${color}`, background: `linear-gradient(180deg, ${K.paper}, ${K.floor})`, display: "grid", placeItems: "center", flex: "0 0 auto" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <PartDisplay part={part} ariaLabel={part.name} style={{borderRadius:10}}/>
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
      <p style={{ margin: 0, fontSize: 12.5, color: M.lore, lineHeight: 1.5 }}>{ART_PART_LORE[part.id] ?? part.lore}</p>
      <div style={{ borderTop: `1px solid ${M.border}` }} />
      <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: M.muted }}>{part.provenance}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Button variant="primary" onClick={onPutOn}>
          {t.garageUi.putOnAny}
        </Button>
        {live ? null : (
          <Button variant="sell" onClick={onRecycle}>
            {fill(t.part.recycleFor, { coins: recycleValue(part) })}
          </Button>
        )}
      </div>
      {live ? (
        <p style={{ margin: 0, fontSize: 12.5, color: M.muted, lineHeight: 1.45 }}>{t.garageUi.sellNote}</p>
      ) : null}
    </div>
  );
}

export type { GarageState };
